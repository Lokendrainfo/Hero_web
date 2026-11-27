from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, NotFound

from .models import (
    HeroMachine,
    HeroMachineShiftRequest,
    HeroMachineVendorAssignmentHistory,
    HeroUser,
    HeroVendor,
    HeroVendorAssignment,
)
from .permissions import get_user_role_codes, is_pm_admin, normalize_role_code


NOT_ASSIGNED_LABEL = 'Not Assigned'


def get_user_vendor_ids(user):
    """
    Returns None when user has unrestricted cross-vendor access (Admin or internal non-vendor oversight roles),
    or a list of authorized vendor IDs when scoped to specific vendor(s) or Operator role.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    if is_pm_admin(user):
        return None

    active_vendor_ids = list(
        user.hero_vendor_assignments.filter(is_active=True, vendor__is_active=True)
        .values_list('vendor_id', flat=True)
    )
    revoked_vendor_ids = set(
        user.hero_vendor_assignments.filter(is_active=False)
        .values_list('vendor_id', flat=True)
    )

    vendor_ids = list(active_vendor_ids)
    direct_vendor = getattr(user, 'vendor', None)
    if (
        getattr(user, 'vendor_id', None)
        and getattr(direct_vendor, 'is_active', True)
        and user.vendor_id not in vendor_ids
        and user.vendor_id not in revoked_vendor_ids
    ):
        vendor_ids.append(user.vendor_id)

    if not vendor_ids:
        role_codes = get_user_role_codes(user)
        if any('VENDOR' in r or r == 'OPERATOR' for r in role_codes):
            return []
        return None

    return vendor_ids


def _match_hero_user_from_operator_payload(op_dict: dict) -> tuple[HeroUser | None, bool]:
    """
    Resolves a live HeroUser record from a machine.operator dictionary when an explicit
    HERO user identifier is present. Returns (matched_user, had_explicit_user_id).
    """
    uid = op_dict.get('user_id') if op_dict.get('user_id') not in (None, '') else op_dict.get('id')
    if uid not in (None, ''):
        try:
            uid_int = int(uid)
            user = HeroUser.objects.select_related('vendor').filter(id=uid_int, is_active=True).first()
            return user, True
        except (TypeError, ValueError):
            pass

    ext_id = str(op_dict.get('external_user_id') or '').strip()
    if ext_id:
        user = HeroUser.objects.select_related('vendor').filter(external_user_id=ext_id, is_active=True).first()
        return user, True

    emp_id = str(op_dict.get('employee_id') or '').strip()
    if emp_id:
        user = HeroUser.objects.select_related('vendor').filter(employee_id=emp_id, is_active=True).first()
        if user:
            return user, False

    for val in (op_dict.get('username'), op_dict.get('phone_number'), op_dict.get('phone'), op_dict.get('mobile')):
        token = str(val or '').strip()
        if token:
            user = HeroUser.objects.select_related('vendor').filter(
                Q(username__iexact=token) | Q(phone_number=token),
                is_active=True,
            ).first()
            if user:
                return user, False

    return None, False


def _is_operator_user(user: HeroUser) -> bool:
    if normalize_role_code(getattr(user, 'role', '')) == 'OPERATOR':
        return True
    return 'OPERATOR' in get_user_role_codes(user)


def _get_vendor_assigned_operator_users(vendor_id: int) -> list[HeroUser]:
    """
    Fetches active HERO users assigned to `vendor_id` via HeroVendorAssignment or User.vendor
    whose HERO role is OPERATOR.
    """
    if not vendor_id:
        return []

    revoked_ids = set(
        HeroVendorAssignment.objects.filter(vendor_id=vendor_id, is_active=False).values_list('user_id', flat=True)
    )
    active_assign_user_ids = list(
        HeroVendorAssignment.objects.filter(vendor_id=vendor_id, is_active=True, user__is_active=True)
        .values_list('user_id', flat=True)
    )
    candidates = list(
        HeroUser.objects.select_related('vendor')
        .prefetch_related('user_roles__role')
        .filter(is_active=True)
        .filter(Q(id__in=active_assign_user_ids) | Q(vendor_id=vendor_id))
        .exclude(id__in=revoked_ids)
        .order_by('first_name', 'last_name', 'id')
        .distinct()
    )
    return [u for u in candidates if _is_operator_user(u)]


def _format_user_brief(u: HeroUser) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "name": u.get_display_name(),
        "employee_id": u.employee_id or "",
        "external_user_id": u.external_user_id or "",
        "phone_number": u.phone_number or "",
        "role": normalize_role_code(u.role) or "OPERATOR",
    }


def resolve_assigned_operator_info(machine: HeroMachine) -> dict:
    """
    Dynamically resolves the machine's current assigned operator(s) strictly from existing
    HERO database relationships (`machines_machine.operator`, `vendors_herovendorassignment`,
    `authentication_user`, `roles_userrole`) without hardcoded defaults or dummy names.
    """
    op = getattr(machine, 'operator', None)
    if isinstance(op, dict) and op:
        matched_user, had_explicit_id = _match_hero_user_from_operator_payload(op)
        if matched_user:
            if machine.vendor_id:
                is_revoked = HeroVendorAssignment.objects.filter(
                    user_id=matched_user.id,
                    vendor_id=machine.vendor_id,
                    is_active=False,
                ).exists()
            else:
                is_revoked = False
            if not is_revoked:
                return {
                    "assigned_operator": matched_user.get_display_name(),
                    "assigned_operator_id": matched_user.id,
                    "assigned_operator_username": matched_user.username,
                    "assigned_operator_ids": [matched_user.id],
                    "assigned_operators": [_format_user_brief(matched_user)],
                    "assignment_source": "MACHINE_OPERATOR",
                }
        elif not had_explicit_id:
            ext_name = (
                op.get('name')
                or op.get('full_name')
                or op.get('operator_name')
                or op.get('username')
                or op.get('mobile')
            )
            if ext_name and str(ext_name).strip():
                return {
                    "assigned_operator": str(ext_name).strip(),
                    "assigned_operator_id": None,
                    "assigned_operator_username": str(op.get('username') or '').strip() or None,
                    "assigned_operator_ids": [],
                    "assigned_operators": [],
                    "assignment_source": "EXTERNAL_OPERATOR",
                }
    elif isinstance(op, str) and op.strip():
        op_str = op.strip()
        matched_user = HeroUser.objects.filter(
            Q(username__iexact=op_str) | Q(phone_number=op_str) | Q(external_user_id=op_str),
            is_active=True,
        ).first()
        if matched_user:
            return {
                "assigned_operator": matched_user.get_display_name(),
                "assigned_operator_id": matched_user.id,
                "assigned_operator_username": matched_user.username,
                "assigned_operator_ids": [matched_user.id],
                "assigned_operators": [_format_user_brief(matched_user)],
                "assignment_source": "MACHINE_OPERATOR",
            }
        return {
            "assigned_operator": op_str,
            "assigned_operator_id": None,
            "assigned_operator_username": None,
            "assigned_operator_ids": [],
            "assigned_operators": [],
            "assignment_source": "EXTERNAL_OPERATOR",
        }

    if getattr(machine, 'vendor_id', None) and getattr(machine.vendor, 'is_active', True):
        vendor_ops = _get_vendor_assigned_operator_users(machine.vendor_id)
        if vendor_ops:
            return {
                "assigned_operator": ", ".join(u.get_display_name() for u in vendor_ops),
                "assigned_operator_id": vendor_ops[0].id,
                "assigned_operator_username": vendor_ops[0].username,
                "assigned_operator_ids": [u.id for u in vendor_ops],
                "assigned_operators": [_format_user_brief(u) for u in vendor_ops],
                "assignment_source": "VENDOR_OPERATOR",
            }

    return {
        "assigned_operator": NOT_ASSIGNED_LABEL,
        "assigned_operator_id": None,
        "assigned_operator_username": None,
        "assigned_operator_ids": [],
        "assigned_operators": [],
        "assignment_source": "NONE",
    }


def is_user_authorized_for_machine(user, machine: HeroMachine) -> tuple[bool, str]:
    """
    Validates whether `user` is currently authorized to view/perform maintenance for `machine`
    based on HERO RBAC, active vendor assignment, and explicit machine-operator assignment.
    """
    if not user or not getattr(user, 'is_authenticated', False) or not getattr(user, 'is_active', False):
        return False, "Authenticated HERO user is missing or inactive."

    if is_pm_admin(user):
        return True, ""

    role_codes = get_user_role_codes(user)
    allowed_vendor_ids = get_user_vendor_ids(user)

    if 'OPERATOR' in role_codes:
        op_info = resolve_assigned_operator_info(machine)
        if op_info["assignment_source"] == "MACHINE_OPERATOR":
            if user.id in op_info["assigned_operator_ids"]:
                return True, ""
            return False, "You are not the assigned operator for this machine."

        if allowed_vendor_ids and machine.vendor_id in allowed_vendor_ids:
            return True, ""

        return (
            False,
            "You are not authorized for this machine. No active machine or vendor operator assignment was found.",
        )

    if allowed_vendor_ids is not None:
        if not allowed_vendor_ids or machine.vendor_id not in allowed_vendor_ids:
            return False, "You are not authorized to access this machine."

    return True, ""


def get_authorized_machines_queryset(user, vendor_id=None, search=None):
    qs = HeroMachine.objects.select_related('vendor').all().order_by('id')
    allowed_vendor_ids = get_user_vendor_ids(user)
    role_codes = get_user_role_codes(user)
    is_operator_scoped = ('OPERATOR' in role_codes) and not is_pm_admin(user)

    if is_operator_scoped:
        candidate_qs = qs.filter(
            Q(vendor_id__in=allowed_vendor_ids or []) | Q(operator__isnull=False)
        )
        authorized_ids = [m.id for m in candidate_qs if is_user_authorized_for_machine(user, m)[0]]
        if not authorized_ids:
            return qs.none()
        qs = qs.filter(id__in=authorized_ids)
    elif allowed_vendor_ids is not None:
        if not allowed_vendor_ids:
            return qs.none()
        qs = qs.filter(vendor_id__in=allowed_vendor_ids)

    if vendor_id and str(vendor_id).strip().lower() not in ('all', 'none', 'null', 'undefined', ''):
        v_str = str(vendor_id).strip()
        v_obj = None
        if v_str.isdigit():
            v_obj = HeroVendor.objects.filter(id=int(v_str)).first()
        if not v_obj:
            v_obj = HeroVendor.objects.filter(
                Q(external_vendor_id=v_str) | Q(name__iexact=v_str) | Q(code__iexact=v_str)
            ).first()
        if v_obj:
            if allowed_vendor_ids is not None and v_obj.id not in allowed_vendor_ids:
                raise PermissionDenied("You do not have access to this vendor's machines.")
            qs = qs.filter(vendor_id=v_obj.id)
        else:
            return qs.none()

    if search and str(search).strip():
        q = str(search).strip()
        qs = qs.filter(
            Q(name__icontains=q)
            | Q(code__icontains=q)
            | Q(serial_number__icontains=q)
            | Q(machine_chassis_no__icontains=q)
            | Q(model_name__icontains=q)
            | Q(site_name__icontains=q)
            | Q(vendor__name__icontains=q)
        )

    return qs


def get_authorized_machine_or_403(user, machine_id) -> HeroMachine:
    try:
        m_id = int(machine_id)
    except (TypeError, ValueError):
        machine = HeroMachine.objects.select_related('vendor').filter(
            Q(code__iexact=str(machine_id))
            | Q(machine_chassis_no__iexact=str(machine_id))
            | Q(serial_number__iexact=str(machine_id))
        ).first()
    else:
        machine = HeroMachine.objects.select_related('vendor').filter(id=m_id).first()

    if not machine:
        raise NotFound(f"Machine '{machine_id}' not found in HERO Machine Master.")

    authorized, reason = is_user_authorized_for_machine(user, machine)
    if not authorized:
        raise PermissionDenied(reason or "You are not authorized to access this machine.")

    return machine


def extract_assigned_operator(machine: HeroMachine) -> str:
    return resolve_assigned_operator_info(machine)["assigned_operator"]


def get_machine_assignment_info(machine: HeroMachine) -> dict:
    latest_shift = (
        HeroMachineShiftRequest.objects.filter(machine_id=machine.id, is_deleted=False)
        .order_by('-created_at', '-id')
        .first()
    )
    latest_vendor_hist = (
        HeroMachineVendorAssignmentHistory.objects.select_related('vendor')
        .filter(machine_id=machine.id)
        .order_by('-assigned_at', '-id')
        .first()
    )
    op_info = resolve_assigned_operator_info(machine)

    return {
        "vendor_id": machine.vendor_id,
        "vendor_name": machine.vendor.name if machine.vendor else "HERO Direct",
        "vendor_code": machine.vendor.code if machine.vendor else "",
        "site_id": machine.site_id,
        "site_name": machine.site_name or "",
        "location_name": machine.location_name or "",
        "is_commissioned": bool(machine.is_commissioned),
        "assigned_operator": op_info["assigned_operator"],
        "assigned_operator_id": op_info["assigned_operator_id"],
        "assigned_operator_ids": op_info["assigned_operator_ids"],
        "assigned_operators": op_info["assigned_operators"],
        "assignment_source": op_info["assignment_source"],
        "partners": machine.partners or [],
        "latest_shift_request": (
            {
                "request_id": latest_shift.request_id,
                "status": latest_shift.status,
                "from_location": latest_shift.a_point_name,
                "to_location": latest_shift.b_point_name,
                "required_date": str(latest_shift.required_date),
            }
            if latest_shift
            else None
        ),
        "latest_vendor_assignment": (
            {
                "vendor_name": latest_vendor_hist.vendor.name if latest_vendor_hist.vendor else NOT_ASSIGNED_LABEL,
                "assigned_at": latest_vendor_hist.assigned_at.isoformat() if latest_vendor_hist.assigned_at else None,
                "source": latest_vendor_hist.source,
            }
            if latest_vendor_hist
            else None
        ),
    }


def serialize_machine_info(machine: HeroMachine, include_assignment: bool = True) -> dict:
    machine_number = machine.machine_chassis_no or machine.code or machine.serial_number
    op_info = resolve_assigned_operator_info(machine)
    payload = {
        "id": machine.id,
        "machine_id": machine.id,
        "machine_number": machine_number,
        "code": machine.code,
        "serial_number": machine.serial_number,
        "machine_chassis_no": machine.machine_chassis_no or "",
        "engine_no": machine.engine_no or "",
        "vehicle_no": machine.vehicle_no or "",
        "name": machine.name,
        "machine_model": machine.model_name,
        "model_code": machine.model_code,
        "machine_type": machine.category,
        "vendor_id": machine.vendor_id,
        "vendor_name": machine.vendor.name if machine.vendor else "HERO Direct",
        "assigned_operator": op_info["assigned_operator"],
        "assigned_operator_id": op_info["assigned_operator_id"],
        "assigned_operator_ids": op_info["assigned_operator_ids"],
        "assigned_operators": op_info["assigned_operators"],
        "assignment_source": op_info["assignment_source"],
        "site_id": machine.site_id,
        "site_name": machine.site_name or "",
        "location_name": machine.location_name or "",
        "current_latitude": machine.current_latitude,
        "current_longitude": machine.current_longitude,
        "engine_hours": machine.engine_hours or 0,
        "status": machine.status,
        "is_online": bool(machine.is_online),
        "is_commissioned": bool(machine.is_commissioned),
    }
    if include_assignment:
        payload["machine_assignment"] = get_machine_assignment_info(machine)
    return payload

