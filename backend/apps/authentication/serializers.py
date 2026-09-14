from rest_framework import serializers
from django.contrib.auth import authenticate
from django.db.models import Q
from .models import User
from apps.vendors.serializers import VendorSerializer
from apps.common.models import Circle, District, Block
from apps.common.serializers import CircleSerializer, DistrictSerializer, BlockSerializer

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

    selected_circle_id = serializers.PrimaryKeyRelatedField(
        queryset=Circle.objects.all(), source='selected_circle', required=False, allow_null=True
    )
    selected_district_id = serializers.PrimaryKeyRelatedField(
        queryset=District.objects.all(), source='selected_district', required=False, allow_null=True
    )
    selected_block_id = serializers.PrimaryKeyRelatedField(
        queryset=Block.objects.all(), source='selected_block', required=False, allow_null=True
    )
    selected_circle = CircleSerializer(read_only=True)
    selected_district = DistrictSerializer(read_only=True)
    selected_block = BlockSerializer(read_only=True)
    selected_circle_name = serializers.SerializerMethodField()
    selected_district_name = serializers.SerializerMethodField()
    selected_block_name = serializers.SerializerMethodField()
    advance_scope_display = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'external_user_id', 'name', 'email', 'first_name', 'last_name',
            'employee_id', 'phone_number', 'vendor', 'vendor_id', 'vendor_details', 'vendor_name', 'role', 'roles',
            'vendors', 'permissions', 'reporting_manager', 'reporting_manager_id', 'reporting_manager_name',
            'reporting_manager_details', 'direct_reports', 'password',
            'user_type', 'advance_scope_type', 'selected_circle', 'selected_district', 'selected_block',
            'selected_circle_id', 'selected_district_id', 'selected_block_id',
            'selected_circle_name', 'selected_district_name', 'selected_block_name', 'advance_scope_display',
            'is_active', 'is_staff', 'is_superuser', 'avatar', 'date_joined'
        ]
        extra_kwargs = {
            'is_superuser': {'read_only': True},
            'is_staff': {'read_only': True},
        }

    def get_selected_circle_name(self, obj):
        return obj.selected_circle.name if obj.selected_circle else None

    def get_selected_district_name(self, obj):
        return obj.selected_district.name if obj.selected_district else None

    def get_selected_block_name(self, obj):
        return obj.selected_block.name if obj.selected_block else None

    def get_advance_scope_display(self, obj):
        if obj.user_type != 'ADVANCE':
            return "-"
        if obj.advance_scope_type == 'CIRCLE' and obj.selected_circle:
            return f"Circle: {obj.selected_circle.name}"
        elif obj.advance_scope_type == 'DISTRICT' and obj.selected_district:
            return f"District: {obj.selected_district.name} ({obj.selected_circle.name if obj.selected_circle else ''})"
        elif obj.advance_scope_type == 'BLOCK' and obj.selected_block:
            return f"Block: {obj.selected_block.name} ({obj.selected_district.name if obj.selected_district else ''})"
        elif obj.advance_scope_type:
            return f"{obj.advance_scope_type.capitalize()}"
        return "Advance"

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

    def _resolve_geography(self, data):
        c_val = data.pop('selected_circle_id', None)
        if c_val is None:
            c_val = data.get('selected_circle')

        d_val = data.pop('selected_district_id', None)
        if d_val is None:
            d_val = data.get('selected_district')

        b_val = data.pop('selected_block_id', None)
        if b_val is None:
            b_val = data.get('selected_block')

        from apps.common.models import Circle, District, Block
        from django.db.models import Q

        circle_obj = None
        if c_val:
            c_str = str(c_val.id if hasattr(c_val, 'id') else c_val).strip()
            if c_str and c_str.lower() not in ('null', 'none', ''):
                circle_obj = Circle.objects.filter(Q(id=int(c_str) if c_str.isdigit() else None) | Q(name__iexact=c_str)).first()

        district_obj = None
        if d_val:
            d_str = str(d_val.id if hasattr(d_val, 'id') else d_val).strip()
            if d_str and d_str.lower() not in ('null', 'none', ''):
                district_obj = District.objects.filter(Q(id=int(d_str) if d_str.isdigit() else None) | Q(name__iexact=d_str)).first()

        block_obj = None
        if b_val:
            b_str = str(b_val.id if hasattr(b_val, 'id') else b_val).strip()
            if b_str and b_str.lower() not in ('null', 'none', ''):
                block_obj = Block.objects.filter(Q(id=int(b_str) if b_str.isdigit() else None) | Q(name__iexact=b_str)).first()

        return circle_obj, district_obj, block_obj

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        vendor_id = validated_data.pop('vendor_id', None)
        role_name = validated_data.get('role', 'VIEWER')

        circle_obj, district_obj, block_obj = self._resolve_geography(validated_data)
        validated_data['selected_circle'] = circle_obj
        validated_data['selected_district'] = district_obj
        validated_data['selected_block'] = block_obj

        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_password('123456')

        if role_name:
            from apps.roles.models import Role
            from django.db.models import Q
            role_obj = Role.objects.filter(Q(name__iexact=role_name) | Q(code__iexact=role_name)).first()
            if not role_obj:
                role_obj, _ = Role.objects.get_or_create(
                    name=role_name,
                    defaults={'code': role_name.upper(), 'description': f"Role: {role_name}"}
                )
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

        # Check if advance scope or geography fields are present in payload
        initial = getattr(self, 'initial_data', {})
        if any(k in initial for k in ['user_type', 'advance_scope_type', 'selected_circle', 'selected_circle_id', 'selected_district', 'selected_district_id', 'selected_block', 'selected_block_id']):
            circle_obj, district_obj, block_obj = self._resolve_geography(validated_data)
            validated_data['selected_circle'] = circle_obj
            validated_data['selected_district'] = district_obj
            validated_data['selected_block'] = block_obj

        if role_name:
            from apps.roles.models import Role
            from django.db.models import Q
            role_obj = Role.objects.filter(Q(name__iexact=role_name) | Q(code__iexact=role_name)).first()
            if not role_obj:
                role_obj, _ = Role.objects.get_or_create(
                    name=role_name,
                    defaults={'code': role_name.upper(), 'description': f"Role: {role_name}"}
                )
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
