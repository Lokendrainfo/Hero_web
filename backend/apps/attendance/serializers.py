from rest_framework import serializers
from .models import AttendanceRecord
from apps.authentication.models import User

def build_secure_media_url(request, photo_field):
    if not photo_field:
        return None
    try:
        url = request.build_absolute_uri(photo_field.url) if request else photo_field.url
        is_https = False
        if request:
            host_str = request.get_host() if hasattr(request, 'get_host') else ''
            is_https = (
                request.is_secure() or
                request.META.get('HTTP_X_FORWARDED_PROTO') == 'https' or
                request.META.get('HTTP_X_FORWARDED_SSL') == 'on' or
                (host_str and 'hero.pramaanu.co.in' in host_str)
            )
        else:
            is_https = True
        
        if url.startswith('http://') and (is_https or 'hero.pramaanu.co.in' in url):
            url = url.replace('http://', 'https://', 1)
        return url
    except Exception:
        return str(photo_field)


def _hydrate_vendor_dict(ext_id):
    if not ext_id:
        return None
    try:
        from apps.common.vendor_scope import _hydrate_vendor
        proxy = _hydrate_vendor(ext_id)
        return {
            "id": proxy.external_vendor_id,
            "external_vendor_id": proxy.external_vendor_id,
            "name": proxy.name,
            "code": getattr(proxy, 'code', '') or '',
        }
    except Exception:
        return {
            "id": str(ext_id),
            "external_vendor_id": str(ext_id),
            "name": str(ext_id),
            "code": "",
        }


class AttendanceRecordSerializer(serializers.ModelSerializer):
    user_id = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()
    phone_number = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    reporting_manager_id = serializers.SerializerMethodField()
    reporting_manager_name = serializers.SerializerMethodField()
    
    vendor = serializers.SerializerMethodField()
    vendor_id = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()
    
    marked_for_user_id = serializers.SerializerMethodField()
    marked_for_user_name = serializers.SerializerMethodField()
    marked_by_user_id = serializers.SerializerMethodField()
    marked_by_user_name = serializers.SerializerMethodField()
    
    check_in_time = serializers.DateTimeField(source='check_in', read_only=True)
    check_out_time = serializers.DateTimeField(source='check_out', read_only=True)
    
    check_in_photo = serializers.SerializerMethodField()
    check_out_photo = serializers.SerializerMethodField()
    
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'user', 'user_id', 'user_name', 'employee_id', 'phone_number', 'role',
            'reporting_manager_id', 'reporting_manager_name',
            'attendance_type', 'machine_id', 'machine_chassis_no', 'machine_assignment_id',
            'vendor', 'vendor_id', 'vendor_name', 'external_vendor_id', 'site_id',
            'marked_for_user', 'marked_for_user_id', 'marked_for_user_name',
            'marked_by', 'marked_by_user_id', 'marked_by_user_name',
            'status', 'check_in', 'check_out', 'check_in_time', 'check_out_time',
            'check_in_latitude', 'check_in_longitude', 'check_in_accuracy', 'check_in_photo',
            'location_source',
            'check_out_latitude', 'check_out_longitude', 'check_out_accuracy', 'check_out_photo',
            'total_working_seconds', 'total_working_hours',
            'approval_status', 'approved_by', 'approved_by_name', 'approved_at', 'rejection_reason',
            'shift', 'notes', 'created_at', 'updated_at'
        ]

    def get_user_id(self, obj):
        return obj.user_id if obj.user else None

    def get_user_name(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return ''

    def get_employee_id(self, obj):
        if obj.user:
            return obj.user.employee_id or obj.user.external_user_id or f"EMP-{obj.user.id}"
        return ''

    def get_phone_number(self, obj):
        if obj.user:
            return obj.user.phone_number or ''
        return ''

    def get_role(self, obj):
        if obj.user:
            roles = obj.user.get_role_list()
            return roles[0] if roles else obj.user.role or 'OPERATOR'
        return 'OPERATOR'

    def get_reporting_manager_id(self, obj):
        if obj.reporting_manager_id:
            return obj.reporting_manager_id
        if obj.user and obj.user.reporting_manager_id:
            return obj.user.reporting_manager_id
        return None

    def get_reporting_manager_name(self, obj):
        mgr = obj.reporting_manager or (obj.user.reporting_manager if obj.user else None)
        if mgr:
            return mgr.get_full_name() or mgr.username
        return None

    def _resolve_vendor_id(self, obj):
        if obj.external_vendor_id:
            return str(obj.external_vendor_id)
        if obj.user and getattr(obj.user, 'external_vendor_id', None):
            return str(obj.user.external_vendor_id)
        return None

    def get_vendor(self, obj):
        return _hydrate_vendor_dict(self._resolve_vendor_id(obj))

    def get_vendor_id(self, obj):
        return self._resolve_vendor_id(obj)

    def get_vendor_name(self, obj):
        v = self.get_vendor(obj)
        return v.get('name') if v else ''

    def get_marked_for_user_id(self, obj):
        return obj.marked_for_user.id if obj.marked_for_user else None

    def get_marked_for_user_name(self, obj):
        if obj.marked_for_user:
            return obj.marked_for_user.get_full_name() or obj.marked_for_user.username
        return None

    def get_marked_by_user_id(self, obj):
        return obj.marked_by.id if obj.marked_by else None

    def get_marked_by_user_name(self, obj):
        if obj.marked_by:
            return obj.marked_by.get_full_name() or obj.marked_by.username
        return ''

    def get_check_in_photo(self, obj):
        return build_secure_media_url(self.context.get('request'), obj.check_in_photo)

    def get_check_out_photo(self, obj):
        return build_secure_media_url(self.context.get('request'), obj.check_out_photo)

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None
