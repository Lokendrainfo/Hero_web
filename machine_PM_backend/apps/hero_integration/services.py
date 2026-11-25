from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, NotFound

from .models import (
    HeroMachine,
    HeroMachineShiftRequest,
    HeroMachineVendorAssignmentHistory,
    HeroVendor,
)
from .permissions import get_user_role_codes, is_pm_admin


def get_user_vendor_ids(user):
    """
    Returns None when user has unrestricted cross-vendor access (Admin or internal non-vendor roles),
    or a list of authorized vendor IDs when scoped to specific vendor(s).
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    if is_pm_admin(user):
        return None

    vendor_ids = list(
        user.hero_vendor_assignments.filter(is_active=True, vendor__is_active=True)
        .values_list('vendor_id', flat=True)
    )
    if getattr(user, 'vendor_id', None) and user.vendor_id not in vendor_ids:
        vendor_ids.append(user.vendor_id)

    if not vendor_ids:
        role_codes = get_user_role_codes(user)
        if any('VENDOR' in r for r in role_codes):
            return []
        return None

    return vendor_ids


def get_authorized_machines_queryset(user, vendor_id=None, search=None):
    qs = HeroMachine.objects.select_related('vendor').all().order_by('id')
    allowed_vendor_ids = get_user_vendor_ids(user)

    if allowed_vendor_ids is not None:
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

    allowed_vendor_ids = get_user_vendor_ids(user)
    if allowed_vendor_ids is not None:
        if not allowed_vendor_ids or machine.vendor_id not in allowed_vendor_ids:
            raise PermissionDenied("You are not authorized to access this machine.")

    return machine


def extract_assigned_operator(machine: HeroMachine) -> str:
    op = getattr(machine, 'operator', None)
    if isinstance(op, dict):
        name = op.get('name') or op.get('full_name') or op.get('username') or op.get('mobile')
        if name:
            return str(name).strip()
    elif isinstance(op, str) and op.strip():
        return op.strip()

    if getattr(machine, 'filled_by', None) and str(machine.filled_by).strip():
        return str(machine.filled_by).strip()

    return 'Unassigned'


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

    return {
        "vendor_id": machine.vendor_id,
        "vendor_name": machine.vendor.name if machine.vendor else "HERO Direct",
        "vendor_code": machine.vendor.code if machine.vendor else "",
        "site_id": machine.site_id,
        "site_name": machine.site_name or "",
        "location_name": machine.location_name or "",
        "is_commissioned": bool(machine.is_commissioned),
        "assigned_operator": extract_assigned_operator(machine),
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
                "vendor_name": latest_vendor_hist.vendor.name if latest_vendor_hist.vendor else "Unassigned",
                "assigned_at": latest_vendor_hist.assigned_at.isoformat() if latest_vendor_hist.assigned_at else None,
                "source": latest_vendor_hist.source,
            }
            if latest_vendor_hist
            else None
        ),
    }


def serialize_machine_info(machine: HeroMachine, include_assignment: bool = True) -> dict:
    machine_number = machine.machine_chassis_no or machine.code or machine.serial_number
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
        "assigned_operator": extract_assigned_operator(machine),
        "site_name": machine.site_name or "",
        "location_name": machine.location_name or "",
        "engine_hours": machine.engine_hours or 0,
        "status": machine.status,
        "is_online": bool(machine.is_online),
        "is_commissioned": bool(machine.is_commissioned),
    }
    if include_assignment:
        payload["machine_assignment"] = get_machine_assignment_info(machine)
    return payload

