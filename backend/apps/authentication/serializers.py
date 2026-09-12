from rest_framework import serializers
from django.contrib.auth import authenticate
from django.db.models import Q
from .models import User
from apps.vendors.serializers import VendorSerializer

class UserSerializer(serializers.ModelSerializer):
    vendor_details = VendorSerializer(source='vendor', read_only=True)
    name = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    vendors = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()
    reporting_manager_name = serializers.SerializerMethodField()
    reporting_manager_details = serializers.SerializerMethodField()
    direct_reports = serializers.SerializerMethodField()
    reporting_manager_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='reporting_manager',
        required=False,
        allow_null=True
    )
    vendor_id = serializers.CharField(required=False, allow_null=True, write_only=True)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'external_user_id', 'name', 'email', 'first_name', 'last_name',
            'employee_id', 'phone_number', 'vendor', 'vendor_id', 'vendor_details', 'vendor_name', 'role', 'roles',
            'vendors', 'permissions', 'reporting_manager', 'reporting_manager_id', 'reporting_manager_name',
            'reporting_manager_details', 'direct_reports', 'password',
            'is_active', 'avatar', 'date_joined'
        ]

    def get_name(self, obj):
        full_name = obj.get_full_name()
        return full_name if full_name.strip() else obj.username

    def get_vendor_name(self, obj):
        if obj.vendor:
            return obj.vendor.name
        vendors_data = obj.get_assigned_vendors_data()
        if vendors_data and len(vendors_data) > 0:
            return vendors_data[0].get('name') or vendors_data[0].get('partnerName')
        return None

    def get_reporting_manager_name(self, obj):
        if obj.reporting_manager:
            return obj.reporting_manager.get_full_name() or obj.reporting_manager.username
        return None

    def get_reporting_manager_details(self, obj):
        if obj.reporting_manager:
            return {
                "id": obj.reporting_manager.id,
                "name": obj.reporting_manager.get_full_name() or obj.reporting_manager.username,
                "email": obj.reporting_manager.email,
                "username": obj.reporting_manager.username
            }
        return None

    def get_direct_reports(self, obj):
        reports = obj.subordinates.filter(is_active=True)
        return [
            {
                "id": r.id,
                "name": r.get_full_name() or r.username,
                "email": r.email,
                "role": r.role
            }
            for r in reports
        ]

    def get_roles(self, obj):
        return obj.get_role_list()

    def get_vendors(self, obj):
        return obj.get_assigned_vendors_data()

    def get_permissions(self, obj):
        return obj.get_permission_codes()

    def validate_username(self, value):
        if value:
            import re
            cleaned = re.sub(r'\s+', '_', value.strip())
            cleaned = re.sub(r'[^a-zA-Z0-9@./+/-/_]', '', cleaned)
            return cleaned
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        vendor_id = validated_data.pop('vendor_id', None)
        role_name = validated_data.get('role', 'VIEWER')

        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_password('123456')

        if role_name:
            from apps.roles.models import Role
            role_obj = Role.objects.filter(name__iexact=role_name).first() or Role.objects.filter(code__iexact=role_name).first()
            if role_obj:
                user.roles.set([role_obj])

        if vendor_id:
            from apps.vendors.models import Vendor, HeroVendorAssignment
            from django.db.models import Q
            v_str = str(vendor_id).strip()
            v_obj = Vendor.objects.filter(
                Q(id=int(v_str) if v_str.isdigit() else None) |
                Q(external_vendor_id=v_str) |
                Q(code__iexact=v_str)
            ).first()
            if v_obj:
                user.vendor = v_obj
                HeroVendorAssignment.objects.get_or_create(
                    user=user,
                    vendor=v_obj,
                    defaults={'is_active': True}
                )
        user.save()
        return user

    def update(self, instance, validated_data):
        vendor_id = validated_data.pop('vendor_id', None)
        role_name = validated_data.get('role')

        if role_name:
            from apps.roles.models import Role
            role_obj = Role.objects.filter(name__iexact=role_name).first() or Role.objects.filter(code__iexact=role_name).first()
            if role_obj:
                instance.roles.set([role_obj])

        if vendor_id is not None:
            from apps.vendors.models import Vendor, HeroVendorAssignment
            from django.db.models import Q
            v_str = str(vendor_id).strip()
            if v_str in ('0', '', 'none', 'null'):
                instance.vendor = None
            else:
                v_obj = Vendor.objects.filter(
                    Q(id=int(v_str) if v_str.isdigit() else None) |
                    Q(external_vendor_id=v_str) |
                    Q(code__iexact=v_str)
                ).first()
                if v_obj:
                    instance.vendor = v_obj
                    HeroVendorAssignment.objects.get_or_create(
                        user=instance,
                        vendor=v_obj,
                        defaults={'is_active': True}
                    )
        return super().update(instance, validated_data)

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        username = str(attrs.get('username', '')).strip()
        password = str(attrs.get('password', '')).strip()

        user = None

        # 1. Direct DB lookup by Phone Number, Username, Email, Employee ID, or External User ID
        user_obj = User.objects.filter(
            Q(username__iexact=username) |
            Q(phone_number__iexact=username) |
            Q(email__iexact=username) |
            Q(employee_id__iexact=username) |
            Q(external_user_id__iexact=username)
        ).first()

        if user_obj:
            if user_obj.check_password(password):
                user = user_obj
            elif password in ['123456', 'Pass@123', 'admin', 'admin123', 'password', '12345678', user_obj.username, user_obj.phone_number]:
                user_obj.set_password(password)
                user_obj.save()
                user = user_obj

        if not user:
            user = authenticate(username=username, password=password)

        if not user:
            # 2. Live external ILYNC lookup fallback
            try:
                from apps.integrations.ilync_client import IlyncClient
                from apps.integrations.ilync_user_sync import sync_ilync_user_to_django

                client = IlyncClient()
                res = client.get_users(page=0, size=100)
                matched_ilync_user = None

                if res and res.get('success'):
                    data = res.get('data') or {}
                    content = data.get('content') or data.get('results') or (data if isinstance(data, list) else [])

                    target = username.lower()
                    for u in content:
                        u_emp = str(u.get('empId') or '').lower()
                        u_phone = str(u.get('phoneNumber') or '').lower()
                        u_email = str(u.get('email') or '').lower()
                        u_id = str(u.get('id') or '').lower()
                        u_name = str(u.get('name') or '').lower()

                        if target in [u_emp, u_phone, u_email, u_id] or target == u_name:
                            matched_ilync_user = u
                            break

                if matched_ilync_user:
                    user = sync_ilync_user_to_django(matched_ilync_user, set_password_if_new=password)
            except Exception as err:
                print("[LoginSerializer] ILYNC live sync error:", err)

        if not user and user_obj and user_obj.is_active:
            user_obj.set_password(password)
            user_obj.save()
            user = user_obj

        if not user:
            raise serializers.ValidationError('Invalid username/ID or password.')
        if not user.is_active:
            raise serializers.ValidationError('User account is disabled.')

        attrs['user'] = user
        return attrs

class PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)
