from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.hero_integration.models import HeroAPIKey, HeroUser
from apps.hero_integration.permissions import (
    get_primary_pm_role,
    get_user_allowed_frequencies,
    get_user_role_codes,
    is_pm_admin,
    normalize_role_code,
    user_can_access_frequency,
)
from apps.hero_integration.services import (
    get_authorized_machine_or_403,
    get_user_vendor_ids,
    serialize_machine_info,
)
from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceFrequencyMaster,
    MaintenanceSubmission,
    RoleFrequencyMapping,
)
from .checklist_service import get_safety_guidelines
from .dashboard_service import _compute_cycle_status
from .submission_service import create_maintenance_submission


def resolve_target_user(request, raw_user_id) -> HeroUser:
    """
    Resolves and validates target HERO user for Mobile APK endpoints.
    - When authenticated via X-API-Key (HeroAPIKey), any active HERO user_id can be validated/acted on.
    - When authenticated via user JWT, non-admin users cannot act on behalf of another user_id.
    """
    is_api_key_auth = isinstance(getattr(request, 'auth', None), HeroAPIKey)

    if raw_user_id in (None, ''):
        if is_api_key_auth:
            raise ValidationError({"user_id": "user_id is required when authenticating with X-API-Key."})
        return request.user

    try:
        uid_int = int(raw_user_id)
    except (TypeError, ValueError):
        raise ValidationError({"user_id": "user_id must be a valid integer ID."})

    target_user = HeroUser.objects.select_related('vendor').filter(id=uid_int).first()
    if not target_user:
        raise NotFound(f"User with id '{raw_user_id}' not found in HERO User Master.")
    if not target_user.is_active:
        raise ValidationError({"user_id": f"User '{target_user.username}' is inactive."})

    if not is_api_key_auth and target_user.id != request.user.id and not is_pm_admin(request.user):
        raise PermissionDenied("You are not authorized to perform or check maintenance for another user.")

    return target_user


def check_machine_maintenance_eligibility(request, query_params: dict) -> dict:
    machine_id = query_params.get('machine_id')
    if not machine_id:
        raise ValidationError({"machine_id": "Query parameter 'machine_id' is required."})

    freq_code = str(query_params.get('frequency') or '').strip().upper()
    if not freq_code:
        raise ValidationError({"frequency": "Query parameter 'frequency' is required (e.g., DAILY, 50_HOURS)."})

    target_user = resolve_target_user(request, query_params.get('user_id'))

    # Validate machine exists in HERO Machine Master (without throwing 403 yet so we report eligibility cleanly)
    from apps.hero_integration.models import HeroMachine
    from django.db.models import Q

    if str(machine_id).isdigit():
        machine = HeroMachine.objects.select_related('vendor').filter(id=int(machine_id)).first()
    else:
        machine = HeroMachine.objects.select_related('vendor').filter(
            Q(code__iexact=str(machine_id))
            | Q(machine_chassis_no__iexact=str(machine_id))
            | Q(serial_number__iexact=str(machine_id))
        ).first()
    if not machine:
        raise NotFound(f"Machine '{machine_id}' not found in HERO Machine Master.")

    freq = MaintenanceFrequencyMaster.objects.filter(code=freq_code, is_active=True).first()
    if not freq:
        raise NotFound(f"Maintenance frequency '{freq_code}' not found.")

    # Optional hour-meter override check
    raw_hm = query_params.get('hour_meter_reading')
    check_hm = Decimal(str(machine.engine_hours or 0)).quantize(Decimal('0.01'))
    if raw_hm not in (None, ''):
        try:
            check_hm = Decimal(str(raw_hm).strip()).quantize(Decimal('0.01'))
            if check_hm < 0:
                raise ValidationError({"hour_meter_reading": "Hour-meter reading cannot be negative."})
        except (InvalidOperation, ValueError):
            raise ValidationError({"hour_meter_reading": "hour_meter_reading must be a valid number."})

    # Role & Frequency Eligibility
    user_roles = get_user_role_codes(target_user)
    primary_role = get_primary_pm_role(target_user)
    allowed_frequencies = get_user_allowed_frequencies(target_user, for_submit=True)
    role_authorized = user_can_access_frequency(target_user, freq.code, for_submit=True)

    # Vendor Authorization
    target_vendor_ids = get_user_vendor_ids(target_user)
    vendor_authorized = (
        target_vendor_ids is None
        or (bool(target_vendor_ids) and machine.vendor_id in target_vendor_ids)
    )

    # Latest submission & cycle due status
    latest_sub = (
        MaintenanceSubmission.objects.select_related('frequency')
        .filter(machine_id=machine.id, frequency=freq)
        .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
        .order_by('-submitted_at', '-id')
        .first()
    )
    today = timezone.localdate()
    due_status, due_label = _compute_cycle_status(machine, freq, latest_sub, today)

    # Duplicate submission check
    duplicate_sub = None
    today_subs = MaintenanceSubmission.objects.filter(
        machine_id=machine.id,
        frequency=freq,
        submission_date=today,
    ).exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)

    if freq.code == 'DAILY':
        duplicate_sub = today_subs.order_by('-submitted_at').first()
    else:
        duplicate_sub = today_subs.filter(hour_meter_reading=check_hm).order_by('-submitted_at').first()

    has_duplicate = duplicate_sub is not None

    reasons = []
    if not role_authorized:
        reasons.append(
            f"Role '{primary_role}' is not authorized for {freq.name}. Allowed frequencies: {allowed_frequencies}."
        )
    if not vendor_authorized:
        reasons.append("User is not authorized for this machine's assigned vendor.")
    if has_duplicate:
        reasons.append(
            f"Duplicate maintenance blocked: {freq.name} already submitted today as {duplicate_sub.submission_number}."
        )

    eligible = role_authorized and vendor_authorized and (not has_duplicate)

    return {
        "eligible": eligible,
        "eligibility_reasons": reasons,
        "checks": {
            "machine_valid": True,
            "user_valid": True,
            "frequency_valid": True,
            "role_authorized": role_authorized,
            "vendor_authorized": vendor_authorized,
            "duplicate_submission_exists": has_duplicate,
        },
        "machine": serialize_machine_info(machine, include_assignment=True),
        "user": {
            "id": target_user.id,
            "username": target_user.username,
            "name": target_user.get_display_name(),
            "primary_role": primary_role,
            "roles": user_roles,
            "allowed_frequencies": allowed_frequencies,
        },
        "frequency": {
            "id": freq.id,
            "code": freq.code,
            "name": freq.name,
            "interval_hours": freq.interval_hours,
            "interval_days": freq.interval_days,
        },
        "hour_meter": {
            "current_machine_hours": machine.engine_hours or 0,
            "checked_hour_meter": float(check_hm),
            "last_pm_hour_meter": float(latest_sub.hour_meter_reading) if latest_sub else None,
        },
        "maintenance_due_status": due_status,
        "maintenance_due_message": due_label,
        "existing_submission": (
            {
                "id": latest_sub.id,
                "submission_number": latest_sub.submission_number,
                "status": latest_sub.status,
                "approval_status": latest_sub.approval_status,
                "hour_meter_reading": float(latest_sub.hour_meter_reading),
                "submitted_at": latest_sub.submitted_at.isoformat(),
                "submitted_by_name": latest_sub.submitted_by_name,
            }
            if latest_sub
            else None
        ),
        "duplicate_submission": (
            {
                "id": duplicate_sub.id,
                "submission_number": duplicate_sub.submission_number,
                "submitted_at": duplicate_sub.submitted_at.isoformat(),
            }
            if duplicate_sub
            else None
        ),
    }


def submit_mobile_maintenance_data(request, payload: dict, files_map) -> dict:
    from apps.maintenance.services.photo_service import validate_capture_source

    target_user = resolve_target_user(request, payload.get('user_id'))

    # Reject explicit non-camera sources while preserving APK compatibility when omitted
    if payload.get('capture_source'):
        validate_capture_source(payload.get('capture_source'), require_explicit=False)

    # Normalize flexible photo_field names from mobile APK into photo_<checklist_item_id>
    normalized_files = {}
    for k in files_map.keys():
        val = files_map.get(k)
        if isinstance(val, list):
            val = val[0] if val else None
        if val is not None:
            normalized_files[k] = val

    responses = payload.get('responses')
    if isinstance(responses, list):
        for r in responses:
            if isinstance(r, dict):
                cid = r.get('checklist_item_id') or r.get('item_id')
                pfield = r.get('photo_field')
                if cid and pfield and pfield in normalized_files and f"photo_{cid}" not in normalized_files:
                    normalized_files[f"photo_{cid}"] = normalized_files[pfield]
                if cid and f"photos[{cid}]" in normalized_files and f"photo_{cid}" not in normalized_files:
                    normalized_files[f"photo_{cid}"] = normalized_files[f"photos[{cid}]"]

    submission = create_maintenance_submission(
        user=target_user,
        payload=payload,
        files_map=normalized_files,
        request=request,
    )

    return {
        "submission_id": submission.id,
        "submission_reference_id": submission.submission_number,
        "submission_number": submission.submission_number,
        "status": submission.status,
        "approval_status": submission.approval_status,
        "machine_id": submission.machine_id,
        "machine_number": submission.machine_number,
        "user_id": submission.submitted_by_id,
        "submitted_by_name": submission.submitted_by_name,
        "submitted_by_role": submission.submitted_by_role,
        "frequency": submission.frequency.code,
        "hour_meter_reading": float(submission.hour_meter_reading),
        "total_items": submission.total_items,
        "completed_items_count": submission.completed_items_count,
        "not_completed_items_count": submission.not_completed_items_count,
        "photo_count": submission.photos.count(),
        "submitted_at": submission.submitted_at.isoformat(),
    }


def get_mobile_maintenance_list(request, query_params: dict) -> dict:
    machine_id = query_params.get('machine_id')
    freq_filter = str(query_params.get('frequency') or '').strip().upper()
    role_filter = normalize_role_code(query_params.get('user_role') or query_params.get('role') or '')
    category_filter = str(query_params.get('category') or '').strip().upper()
    include_safety = str(query_params.get('include_safety_guidelines', 'true')).strip().lower() != 'false'

    machine_info = None
    if machine_id:
        machine_obj = get_authorized_machine_or_403(request.user, machine_id)
        machine_info = serialize_machine_info(machine_obj, include_assignment=True)

    # Role -> Frequency mappings
    role_mappings_qs = RoleFrequencyMapping.objects.select_related('frequency').filter(
        is_active=True,
        frequency__is_active=True,
    ).order_by('role_code', 'frequency__sort_order')

    if role_filter:
        role_mappings_qs = role_mappings_qs.filter(role_code=role_filter)

    roles_by_freq = {}
    role_assignments = {}
    allowed_freqs_for_role = set()
    for rm in role_mappings_qs:
        roles_by_freq.setdefault(rm.frequency.code, []).append(
            {"role_code": rm.role_code, "role_name": rm.role_name}
        )
        role_assignments.setdefault(
            rm.role_code,
            {"role_code": rm.role_code, "role_name": rm.role_name, "frequencies": []},
        )
        if rm.frequency.code not in role_assignments[rm.role_code]["frequencies"]:
            role_assignments[rm.role_code]["frequencies"].append(rm.frequency.code)
        allowed_freqs_for_role.add(rm.frequency.code)

    # When role_filter is specified, use all roles_by_freq for metadata if needed
    if role_filter:
        all_rm = RoleFrequencyMapping.objects.select_related('frequency').filter(
            is_active=True, frequency__is_active=True
        )
        roles_by_freq = {}
        for rm in all_rm:
            roles_by_freq.setdefault(rm.frequency.code, []).append(
                {"role_code": rm.role_code, "role_name": rm.role_name}
            )

    freqs_qs = MaintenanceFrequencyMaster.objects.filter(is_active=True).order_by('sort_order', 'id')
    if freq_filter and freq_filter != 'ALL':
        freqs_qs = freqs_qs.filter(code=freq_filter)
    if role_filter:
        freqs_qs = freqs_qs.filter(code__in=allowed_freqs_for_role)
    target_freqs = list(freqs_qs)
    target_freq_codes = {f.code for f in target_freqs}

    categories_qs = MaintenanceCategoryMaster.objects.filter(is_active=True).order_by('sort_order', 'id')
    categories = [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "description": c.description,
            "is_checkable": c.is_checkable,
        }
        for c in categories_qs
    ]

    items_qs = (
        MaintenanceChecklistMaster.objects.select_related('category')
        .prefetch_related('frequency_mappings__frequency')
        .filter(is_active=True, category__is_active=True)
        .exclude(category__code='GENERAL_SAFETY_GUIDELINES')
        .order_by('category__sort_order', 'sort_order', 'id')
    )
    if category_filter and category_filter != 'ALL':
        items_qs = items_qs.filter(category__code=category_filter)

    checklist_items = []
    freq_wise_buckets = {
        f.code: {
            "frequency_code": f.code,
            "frequency_name": f.name,
            "interval_hours": f.interval_hours,
            "interval_days": f.interval_days,
            "assigned_roles": roles_by_freq.get(f.code, []),
            "categories": {"MACHINE": [], "ENGINE": []},
            "items": [],
        }
        for f in target_freqs
    }

    for item in items_qs:
        active_maps = [
            m for m in item.frequency_mappings.all()
            if m.is_active and m.frequency.is_active
        ]
        item_freqs = [m.frequency.code for m in sorted(active_maps, key=lambda x: x.frequency.sort_order)]

        if (freq_filter and freq_filter != 'ALL') or role_filter:
            if not any(fc in target_freq_codes for fc in item_freqs):
                continue

        assigned_roles_dedup = {}
        for fc in item_freqs:
            for r_info in roles_by_freq.get(fc, []):
                assigned_roles_dedup[r_info["role_code"]] = r_info

        item_payload = {
            "id": item.id,
            "checklist_item_id": item.id,
            "item_code": item.item_code,
            "category_code": item.category.code,
            "category_name": item.category.name,
            "description": item.description,
            "frequencies": item_freqs,
            "assigned_roles": list(assigned_roles_dedup.values()),
            "remarks": item.remarks,
            "special_instructions": item.special_instructions,
            "service_interval": item.service_interval,
            "requires_photo": item.requires_photo,
            "requires_remarks_if_not_completed": item.requires_remarks_if_not_completed,
            "is_as_required": item.is_as_required,
            "sort_order": item.sort_order,
        }
        checklist_items.append(item_payload)

        for fc in item_freqs:
            if fc in freq_wise_buckets:
                freq_wise_buckets[fc]["items"].append(item_payload)
                freq_wise_buckets[fc]["categories"].setdefault(item.category.code, []).append(item_payload)

    safety_guidelines = get_safety_guidelines() if include_safety else []

    return {
        "filters_applied": {
            "machine_id": machine_id or None,
            "frequency": freq_filter or "ALL",
            "user_role": role_filter or "ALL",
            "category": category_filter or "ALL",
        },
        "machine": machine_info,
        "categories": categories,
        "role_assignments": list(role_assignments.values()),
        "total_checklist_items": len(checklist_items),
        "checklist_items": checklist_items,
        "frequency_wise_checklists": list(freq_wise_buckets.values()),
        "safety_guidelines": safety_guidelines,
    }
