from django.db.models import Q
from django.core.exceptions import ValidationError
from rest_framework.exceptions import PermissionDenied
from apps.common.vendor_scope import get_user_vendor_ids

def get_reporting_scope(user):
    """
    Centralized service returning the authenticated user's database ID plus all
    direct and indirect subordinate user IDs recursively.
    
    Example:
      Shakti -> Abhishek -> Lokendra
      get_reporting_scope(Shakti) -> [Shakti.id, Abhishek.id, Lokendra.id]
      get_reporting_scope(Abhishek) -> [Abhishek.id, Lokendra.id]
      get_reporting_scope(Lokendra) -> [Lokendra.id]
      
    Features:
    - Supports unlimited depth.
    - Prevents N+1 database queries (uses single query to build adjacency list).
    - Protects against circular reporting loops.
    - Prevents duplicate IDs.
    """
    if not user:
        return []

    user_id = user.id if hasattr(user, 'id') else user
    if not user_id:
        return []

    from apps.authentication.models import User

    # Fetch mapping of user_id -> reporting_manager_id for all active users in a single query
    users_data = User.objects.filter(is_active=True).values_list('id', 'reporting_manager_id')

    # Build adjacency list: manager_id -> list of subordinate_ids
    manager_to_subs = {}
    for uid, mgr_id in users_data:
        if mgr_id:
            manager_to_subs.setdefault(mgr_id, []).append(uid)

    # Perform BFS / DFS traversal starting from target user_id
    visited = set()
    queue = [user_id]

    while queue:
        curr_id = queue.pop(0)
        if curr_id in visited:
            continue
        visited.add(curr_id)

        # Add all direct reports of curr_id to queue
        direct_subs = manager_to_subs.get(curr_id, [])
        for sub_id in direct_subs:
            if sub_id not in visited:
                queue.append(sub_id)

    return list(visited)


def prevent_circular_reporting(user, target_manager):
    """
    Validates that assigning target_manager to user does not create a circular relationship.
    
    Rules:
    1. User cannot report to themselves (user.id == target_manager.id).
    2. Target manager cannot be an existing subordinate of user (user.id in get_reporting_scope(target_manager)).
    """
    if not user or not target_manager:
        return

    user_id = user.id if hasattr(user, 'id') else user
    target_manager_id = target_manager.id if hasattr(target_manager, 'id') else target_manager

    if user_id == target_manager_id:
        raise ValidationError("Invalid reporting manager assignment: A user cannot report to themselves.")

    # Check if target_manager is currently subordinate to user
    subordinate_ids = get_reporting_scope(user)
    if target_manager_id in subordinate_ids:
        raise ValidationError(
            "Invalid reporting manager assignment: Circular hierarchy detected. "
            "The selected manager is already a subordinate in your reporting chain."
        )


def filter_queryset_by_reporting_and_vendor(
    queryset,
    user,
    user_field='user_id',
    vendor_field='vendor_id',
    request=None,
    permission_code=None
):
    """
    Combines Permission check + Vendor Scope + Reporting Manager Hierarchy.
    
    1. Permission Check: If permission_code is provided, verifies user has it.
    2. Reporting Scope: Includes user's own records + all recursive subordinates' records.
    3. Vendor Scope: Strictly maintains vendor isolation for non-ADMIN users.
    """
    if not user or not user.is_authenticated:
        return queryset.none()

    # 1. Permission Check
    if permission_code:
        user_perms = user.get_permission_codes()
        if permission_code not in user_perms:
            return queryset.none()

    # Admin / Superuser override for reporting scope
    is_admin = user.is_superuser or 'ADMIN' in user.get_role_list()

    # 2. Apply Reporting Hierarchy
    if not is_admin:
        reporting_user_ids = get_reporting_scope(user)
        if not reporting_user_ids:
            return queryset.none()

        # If queryset model has user_field, filter by reporting hierarchy IDs
        if hasattr(queryset.model, user_field) or user_field in [f.name for f in queryset.model._meta.get_fields()]:
            filter_kwargs = {f"{user_field}__in": reporting_user_ids}
            queryset = queryset.filter(**filter_kwargs)
        elif user_field == 'assigned_to' or user_field == 'user':
            filter_kwargs = {f"{user_field}_id__in": reporting_user_ids}
            queryset = queryset.filter(**filter_kwargs)

    # 3. Apply Vendor Scope
    allowed_vendor_ids = get_user_vendor_ids(user)
    if allowed_vendor_ids is not None:
        if not allowed_vendor_ids:
            return queryset.none()
        if hasattr(queryset.model, vendor_field) or vendor_field in [f.name for f in queryset.model._meta.get_fields()]:
            filter_kwargs = {f"{vendor_field}__in": allowed_vendor_ids}
            queryset = queryset.filter(**filter_kwargs)
        elif vendor_field == 'vendor':
            filter_kwargs = {f"{vendor_field}_id__in": allowed_vendor_ids}
            queryset = queryset.filter(**filter_kwargs)

    return queryset
