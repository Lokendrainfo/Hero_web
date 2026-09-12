from rest_framework import serializers
from apps.roles.models import Permission, Role, RolePermission, UserRole

class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'code', 'name', 'category', 'description']

class RoleSerializer(serializers.ModelSerializer):
    permissions_details = PermissionSerializer(source='permissions', many=True, read_only=True)
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    permission_codes = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ['id', 'name', 'code', 'description', 'is_system', 'permissions', 'permissions_details', 'permission_ids', 'permission_codes', 'user_count', 'created_at', 'updated_at']
        extra_kwargs = {
            'permissions': {'read_only': True},
            'code': {'required': False, 'allow_blank': True}
        }

    def validate(self, attrs):
        if not attrs.get('code') and attrs.get('name'):
            attrs['code'] = attrs['name'].strip().upper().replace(' ', '_')
        return attrs

    def get_permission_codes(self, obj):
        return list(obj.permissions.values_list('code', flat=True))

    def get_user_count(self, obj):
        return obj.users.count()

    def create(self, validated_data):
        permission_ids = validated_data.pop('permission_ids', [])
        name = validated_data.get('name', '')
        code = validated_data.get('code') or name.upper().replace(' ', '_')
        validated_data['code'] = code

        role = Role.objects.create(**validated_data)
        if permission_ids:
            perms = Permission.objects.filter(id__in=permission_ids)
            role.permissions.set(perms)
        return role

    def update(self, instance, validated_data):
        permission_ids = validated_data.pop('permission_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if permission_ids is not None:
            perms = Permission.objects.filter(id__in=permission_ids)
            instance.permissions.set(perms)

        return instance
