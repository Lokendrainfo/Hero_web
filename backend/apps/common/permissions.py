from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from .vendor_scope import get_user_vendor_ids, filter_queryset_by_vendor
from .reporting_scope import get_reporting_scope

class IsVendorAuthorized(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser or 'ADMIN' in request.user.get_role_list():
            return True
        allowed_ids = get_user_vendor_ids(request.user)
        if allowed_ids is None:
            return True
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
        return request.user.is_superuser or any(r in ['ADMIN', 'SUPERVISOR', 'MANAGER', 'SUPER_ADMIN'] for r in request.user.get_role_list())

class HasRBACPermission(permissions.BasePermission):
    """
    Unified RBAC permission checker that verifies both action permissions (code)
    and data scopes across model querysets.
    """
    required_permission = None

    def __init__(self, permission_code=None):
        if permission_code:
            self.required_permission = permission_code

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser or 'SUPER_ADMIN' in request.user.get_role_list():
            return True

        perm_code = getattr(view, 'rbac_permission', None) or self.required_permission
        if not perm_code:
            # Infer permission from view action / method if not explicitly set
            module = getattr(view, 'rbac_module', view.__class__.__name__.replace('ViewSet', '').lower())
            action_map = {
                'list': 'view',
                'retrieve': 'view',
                'create': 'create',
                'update': 'edit',
                'partial_update': 'edit',
                'destroy': 'delete'
            }
            action = action_map.get(getattr(view, 'action', None), 'view')
            perm_code = f"{module}.{action}"

        user_perms = request.user.get_permission_codes()
        # Case insensitive matching & support dot notation or uppercase
        norm_perm = perm_code.lower()
        has_perm = any(p.lower() == norm_perm or p.lower().replace('.', '_') == norm_perm.replace('.', '_') for p in user_perms)
        
        # Superuser / ADMIN role fallback
        if not has_perm and 'ADMIN' in [r.upper() for r in request.user.get_role_list()]:
            has_perm = True

        return has_perm

def filter_queryset_by_data_scope(queryset, user, request=None, vendor_field='vendor_id'):
    """
    Applies data scope rules (ALL_DATA, OWN_DATA, OWN_VENDOR, OWN_TEAM, OWN_TASKS, OWN_MACHINE, OWN_GEOGRAPHY, REPORTING_HIERARCHY)
    to filter querysets based on user's assigned active roles.
    """
    if not user or not user.is_authenticated:
        return queryset.none()

    if user.is_superuser or 'SUPER_ADMIN' in user.get_role_list() or 'ADMIN' in user.get_role_list():
        return filter_queryset_by_vendor(queryset, user, vendor_field=vendor_field, request=request)

    # Resolve active scopes from user roles
    active_roles = user.roles.filter(is_active=True)
    scopes = set(active_roles.values_list('data_scope', flat=True))
    if not scopes and user.role:
        # Fallback to single legacy role code string
        if user.role in ['ADMIN', 'SUPER_ADMIN', 'CORPORATE_MANAGER', 'VIEWER']:
            scopes.add('ALL_DATA')
        elif user.role in ['REGIONAL_MANAGER', 'CIRCLE_MANAGER']:
            scopes.add('OWN_GEOGRAPHY')
        elif user.role in ['REPORTING_MANAGER']:
            scopes.add('REPORTING_HIERARCHY')
        elif user.role in ['VENDOR_ADMIN', 'VENDOR_USER', 'VENDOR']:
            scopes.add('OWN_VENDOR')
        elif user.role in ['OPERATOR', 'TRACKER', 'LABOUR']:
            scopes.add('OWN_TASKS')

    if 'ALL_DATA' in scopes:
        return filter_queryset_by_vendor(queryset, user, vendor_field=vendor_field, request=request)

    model_name = queryset.model.__name__.lower()
    combined_qs = queryset.none()

    for scope in scopes:
        if scope == 'OWN_VENDOR':
            qs_scope = filter_queryset_by_vendor(queryset, user, vendor_field=vendor_field, request=request)
            combined_qs = combined_qs | qs_scope

        elif scope == 'OWN_DATA':
            if hasattr(queryset.model, 'created_by_id'):
                combined_qs = combined_qs | queryset.filter(created_by_id=user.id)
            elif hasattr(queryset.model, 'user_id'):
                combined_qs = combined_qs | queryset.filter(user_id=user.id)
            elif model_name == 'user':
                combined_qs = combined_qs | queryset.filter(id=user.id)
            else:
                combined_qs = combined_qs | filter_queryset_by_vendor(queryset, user, vendor_field=vendor_field, request=request)

        elif scope == 'OWN_TASKS':
            if model_name == 'task':
                combined_qs = combined_qs | queryset.filter(assigned_operator_id=user.id)
            elif hasattr(queryset.model, 'task'):
                combined_qs = combined_qs | queryset.filter(task__assigned_operator_id=user.id)
            else:
                combined_qs = combined_qs | filter_queryset_by_vendor(queryset, user, vendor_field=vendor_field, request=request)

        elif scope == 'OWN_TEAM' or scope == 'REPORTING_HIERARCHY':
            subordinate_ids = get_reporting_scope(user)
            if hasattr(queryset.model, 'user_id'):
                combined_qs = combined_qs | queryset.filter(user_id__in=subordinate_ids)
            elif hasattr(queryset.model, 'created_by_id'):
                combined_qs = combined_qs | queryset.filter(created_by_id__in=subordinate_ids)
            elif model_name == 'user':
                combined_qs = combined_qs | queryset.filter(id__in=subordinate_ids)
            elif model_name == 'task':
                combined_qs = combined_qs | queryset.filter(assigned_operator_id__in=subordinate_ids)
            else:
                combined_qs = combined_qs | filter_queryset_by_vendor(queryset, user, vendor_field=vendor_field, request=request)

        elif scope == 'OWN_GEOGRAPHY':
            if hasattr(user, 'user_type') and user.user_type == 'ADVANCE':
                if user.advance_scope_type == 'CIRCLE' and user.selected_circle_id:
                    if hasattr(queryset.model, 'circle_id'):
                        combined_qs = combined_qs | queryset.filter(circle_id=user.selected_circle_id)
                elif user.advance_scope_type == 'DISTRICT' and user.selected_district_id:
                    if hasattr(queryset.model, 'district_id'):
                        combined_qs = combined_qs | queryset.filter(district_id=user.selected_district_id)
                elif user.advance_scope_type == 'BLOCK' and user.selected_block_id:
                    if hasattr(queryset.model, 'block_id'):
                        combined_qs = combined_qs | queryset.filter(block_id=user.selected_block_id)
            else:
                combined_qs = combined_qs | filter_queryset_by_vendor(queryset, user, vendor_field=vendor_field, request=request)

    return combined_qs.distinct()
