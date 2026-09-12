from rest_framework import permissions
from .vendor_scope import get_user_vendor_ids

class IsVendorAuthorized(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser or 'ADMIN' in request.user.get_role_list():
            return True
        allowed_ids = get_user_vendor_ids(request.user)
        return bool(allowed_ids)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser or 'ADMIN' in request.user.get_role_list():
            return True
        
        allowed_ids = get_user_vendor_ids(request.user)
        if not allowed_ids:
            return False
            
        v_id = None
        if hasattr(obj, 'vendor_id') and obj.vendor_id:
            v_id = obj.vendor_id
        elif hasattr(obj, 'vendor') and obj.vendor:
            v_id = obj.vendor.id
        elif hasattr(obj, 'machine') and obj.machine and obj.machine.vendor_id:
            v_id = obj.machine.vendor_id

        if v_id is not None:
            return v_id in allowed_ids
        return True

class IsAdminOrSupervisor(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.is_superuser or any(r in ['ADMIN', 'SUPERVISOR', 'MANAGER'] for r in request.user.get_role_list())

