from rest_framework import permissions
from apps.common.vendor_scope import get_user_vendor_ids


def get_user_all_roles(user):
    if not user or not user.is_authenticated:
        return []
    roles = []
    if hasattr(user, 'roles'):
        roles.extend(list(user.roles.values_list('code', flat=True)))
        roles.extend(list(user.roles.values_list('name', flat=True)))
    if getattr(user, 'role', None):
        roles.append(user.role)
    if hasattr(user, 'get_role_list'):
        roles.extend(user.get_role_list())
    return [str(r).strip().upper() for r in roles if r]


def user_has_machine_shift_perm(user, perm_code):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    roles_list = get_user_all_roles(user)
    if 'ADMIN' in roles_list or 'SUPER_ADMIN' in roles_list or 'SUPER ADMIN' in roles_list:
        return True
    
    perm_codes = [p.lower() for p in (user.get_permission_codes() if hasattr(user, 'get_permission_codes') else [])]
    return perm_code.lower() in perm_codes


def is_scm_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    roles_list = get_user_all_roles(user)
    if any(r in ['ADMIN', 'SUPER_ADMIN', 'SUPER ADMIN', 'SCM', 'SCM MANAGER', 'SCM_MANAGER'] for r in roles_list):
        return True
    return (
        user_has_machine_shift_perm(user, 'machine_shift.scm_review') or
        user_has_machine_shift_perm(user, 'machine_shift.scm_confirm') or
        user_has_machine_shift_perm(user, 'machine_shift.scm_invoice')
    )


def is_shifter_user(user, shift_request=None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    roles_list = get_user_all_roles(user)
    if any(r in ['ADMIN', 'SUPER_ADMIN', 'SUPER ADMIN', 'SHIFTER', 'OPERATOR', 'MACHINE_SHIFTER'] for r in roles_list):
        return True
    if shift_request and shift_request.assigned_shifter_id == user.id:
        return True
    return user_has_machine_shift_perm(user, 'machine_shift.shift')


class IsMachineShiftAuthorized(permissions.BasePermission):
    """
    Unified permission class for Machine Shift Request actions and scoping.
    """
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        
        roles_list = get_user_all_roles(user)
        if user.is_superuser or 'ADMIN' in roles_list or 'SUPER_ADMIN' in roles_list or 'SUPER ADMIN' in roles_list:
            return True

        action = getattr(view, 'action', None)

        # SCM specific actions
        if action in ['scm_approve', 'scm_reject', 'attach_invoice', 'confirm']:
            return is_scm_user(user)

        # Shifter specific actions
        if action in ['start_shifting', 'shifter_update', 'mark_shifted']:
            return is_shifter_user(user)

        # Cancel action
        if action == 'cancel':
            return True

        # Read actions (list, retrieve, export)
        if request.method in permissions.SAFE_METHODS:
            return (
                user_has_machine_shift_perm(user, 'machine_shift.view') or
                is_scm_user(user) or
                is_shifter_user(user) or
                bool(get_user_vendor_ids(user) is not None)
            )

        # Create action
        if action == 'create' or request.method == 'POST':
            return (
                user_has_machine_shift_perm(user, 'machine_shift.create') or
                bool(get_user_vendor_ids(user) is not None) or
                any('VENDOR' in r for r in roles_list)
            )

        # Edit / Update action
        if request.method in ['PUT', 'PATCH']:
            return (
                user_has_machine_shift_perm(user, 'machine_shift.edit') or
                bool(get_user_vendor_ids(user) is not None) or
                any('VENDOR' in r for r in roles_list)
            )

        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        roles_list = get_user_all_roles(user)
        if user.is_superuser or 'ADMIN' in roles_list or 'SUPER_ADMIN' in roles_list or 'SUPER ADMIN' in roles_list:
            return True

        action = getattr(view, 'action', None)

        if action in ['scm_approve', 'scm_reject', 'attach_invoice', 'confirm']:
            return is_scm_user(user)

        if action in ['start_shifting', 'shifter_update', 'mark_shifted']:
            return is_shifter_user(user, obj)

        if action == 'cancel':
            return obj.created_by_id == user.id

        # SCM users have access to review requests
        if is_scm_user(user):
            return True

        # Shifter assigned or shifter role
        if is_shifter_user(user, obj):
            return True

        # Creator has permission
        if obj.created_by_id == user.id:
            return True

        # Vendor isolation scoping
        allowed_vendor_ids = get_user_vendor_ids(user)
        if allowed_vendor_ids is not None:
            return obj.vendor_id in allowed_vendor_ids

        return True
