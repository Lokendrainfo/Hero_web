from rest_framework import permissions

ROLE_ALIASES = {
    'FE': 'FIELD_ENGINEER',
    'FIELD ENGINEER': 'FIELD_ENGINEER',
    'FIELD_ENGINEER': 'FIELD_ENGINEER',
    'AM': 'AREA_MANAGER',
    'AREA MANAGER': 'AREA_MANAGER',
    'AREA_MANAGER': 'AREA_MANAGER',
    'OP': 'OPERATOR',
    'OPERATOR': 'OPERATOR',
    'MACHINE_OPERATOR': 'OPERATOR',
    'ADMIN': 'ADMIN',
    'SUPER_ADMIN': 'SUPER_ADMIN',
    'SUPER ADMIN': 'SUPER_ADMIN',
}


def normalize_role_code(raw_role: str) -> str:
    if not raw_role:
        return ''
    cleaned = str(raw_role).strip().upper().replace('-', '_').replace(' ', '_')
    return ROLE_ALIASES.get(cleaned, ROLE_ALIASES.get(str(raw_role).strip().upper(), cleaned))


def get_user_role_codes(user) -> list[str]:
    if not user or not getattr(user, 'is_authenticated', False):
        return []

    codes = []
    if getattr(user, 'is_superuser', False):
        codes.append('ADMIN')

    try:
        user_roles = user.user_roles.select_related('role').filter(role__is_active=True)
        for ur in user_roles:
            if ur.role and ur.role.code:
                norm = normalize_role_code(ur.role.code)
                if norm and norm not in codes:
                    codes.append(norm)
            if ur.role and ur.role.name:
                norm_name = normalize_role_code(ur.role.name)
                if norm_name and norm_name not in codes:
                    codes.append(norm_name)
    except Exception:
        pass

    raw_role = getattr(user, 'role', None)
    if raw_role:
        norm = normalize_role_code(raw_role)
        if norm and norm not in codes:
            codes.append(norm)

    return codes or ['VIEWER']


def is_pm_admin(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    role_codes = get_user_role_codes(user)
    return 'ADMIN' in role_codes or 'SUPER_ADMIN' in role_codes


def get_primary_pm_role(user) -> str:
    if is_pm_admin(user):
        return 'ADMIN'
    codes = get_user_role_codes(user)
    for priority in ('AREA_MANAGER', 'FIELD_ENGINEER', 'OPERATOR'):
        if priority in codes:
            return priority
    return codes[0] if codes else 'VIEWER'


def get_user_allowed_frequencies(user, for_submit: bool = False) -> list[str]:
    from apps.maintenance.models import MaintenanceFrequencyMaster, RoleFrequencyMapping

    if not user or not getattr(user, 'is_authenticated', False):
        return []

    if is_pm_admin(user):
        return list(
            MaintenanceFrequencyMaster.objects.filter(is_active=True)
            .order_by('sort_order', 'id')
            .values_list('code', flat=True)
        )

    role_codes = get_user_role_codes(user)
    qs = RoleFrequencyMapping.objects.filter(
        role_code__in=role_codes,
        is_active=True,
        frequency__is_active=True,
    )
    if for_submit:
        qs = qs.filter(can_submit=True)
    else:
        qs = qs.filter(can_view=True)

    return list(
        qs.order_by('frequency__sort_order', 'frequency__id')
        .values_list('frequency__code', flat=True)
        .distinct()
    )


def user_can_access_frequency(user, frequency_code: str, for_submit: bool = False) -> bool:
    if not frequency_code:
        return False
    if is_pm_admin(user):
        return True
    allowed = get_user_allowed_frequencies(user, for_submit=for_submit)
    return str(frequency_code).strip().upper() in allowed


def can_review_submission(user) -> bool:
    if is_pm_admin(user):
        return True
    role_codes = get_user_role_codes(user)
    return 'AREA_MANAGER' in role_codes


class IsPMAdmin(permissions.BasePermission):
    message = "Admin role required to configure preventive maintenance masters."

    def has_permission(self, request, view):
        return is_pm_admin(request.user)


class IsPMReviewer(permissions.BasePermission):
    message = "Area Manager or Admin role required to review/approve maintenance submissions."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and can_review_submission(request.user))

