from datetime import timedelta
from decimal import Decimal, InvalidOperation
import math

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.hero_integration.models import HeroAPIKey, HeroMachine, HeroUser
from apps.hero_integration.permissions import (
    get_primary_pm_role,
    get_user_allowed_frequencies,
    get_user_role_codes,
    is_pm_admin,
    normalize_role_code,
    user_can_access_frequency,
)
from apps.hero_integration.services import (
    extract_assigned_operator,
    get_authorized_machine_or_403,
    get_authorized_machines_queryset,
    get_user_vendor_ids,
    is_user_authorized_for_machine,
    resolve_assigned_operator_info,
    serialize_machine_info,
)
from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    ChecklistFrequencySchedule,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceFrequencyMaster,
    MaintenanceSubmission,
    RoleFrequencyMapping,
)
from .checklist_service import (
    get_dynamic_configs_for_items,
    get_location_requirements_for_items,
    get_safety_guidelines,
    get_sections_for_items,
)
from .dashboard_service import _compute_cycle_status
from .schedule_service import evaluate_scheduled_cycle, serialize_schedule
from .submission_service import create_maintenance_submission


def resolve_target_user(request, raw_user_id) -> HeroUser:
    """
    Resolves and validates target HERO user for Mobile APK endpoints.
    - When authenticated via user JWT, operator identity MUST come from the authenticated token;
      any mismatched client-supplied user_id/operator_id is rejected (non-admins cannot act for another user).
    - When authenticated via X-API-Key: if the key is bound to a non-admin user, identity is locked to that user;
      service/admin keys require explicit active user_id.
    """
    is_api_key_auth = isinstance(getattr(request, 'auth', None), HeroAPIKey)

    if not is_api_key_auth:
        if not request.user or not getattr(request.user, 'is_authenticated', False):
            raise PermissionDenied("Authentication credentials were not provided.")
        if raw_user_id not in (None, ''):
            try:
                uid_int = int(raw_user_id)
            except (TypeError, ValueError):
                raise ValidationError({"user_id": "user_id must be a valid integer ID."})
            if uid_int != request.user.id and not is_pm_admin(request.user):
                raise PermissionDenied("You are not authorized to perform or check maintenance using another operator's identity.")
            if is_pm_admin(request.user) and uid_int != request.user.id:
                target_user = HeroUser.objects.select_related('vendor').filter(id=uid_int).first()
                if not target_user:
                    raise NotFound(f"User with id '{raw_user_id}' not found in HERO User Master.")
                if not target_user.is_active:
                    raise ValidationError({"user_id": f"User '{target_user.username}' is inactive."})
                return target_user
        live_user = HeroUser.objects.select_related('vendor').filter(id=request.user.id, is_active=True).first()
        if not live_user:
            raise PermissionDenied("Authenticated operator account is missing or inactive.")
        return live_user

    key_owner = getattr(request.auth, 'user', None)
    if key_owner is not None and not is_pm_admin(key_owner):
        if raw_user_id not in (None, ''):
            try:
                uid_int = int(raw_user_id)
            except (TypeError, ValueError):
                raise ValidationError({"user_id": "user_id must be a valid integer ID."})
            if uid_int != key_owner.id:
                raise PermissionDenied("API key is bound to a specific operator and cannot select another operator identity.")
        live_owner = HeroUser.objects.select_related('vendor').filter(id=key_owner.id, is_active=True).first()
        if not live_owner:
            raise PermissionDenied("API key operator account is missing or inactive.")
        return live_owner

    if raw_user_id in (None, ''):
        raise ValidationError({"user_id": "user_id is required when authenticating with a service X-API-Key."})

    try:
        uid_int = int(raw_user_id)
    except (TypeError, ValueError):
        raise ValidationError({"user_id": "user_id must be a valid integer ID."})

    target_user = HeroUser.objects.select_related('vendor').filter(id=uid_int).first()
    if not target_user:
        raise NotFound(f"User with id '{raw_user_id}' not found in HERO User Master.")
    if not target_user.is_active:
        raise ValidationError({"user_id": f"User '{target_user.username}' is inactive."})

    return target_user


def _extract_primary_trigger(req_dict: dict) -> dict | None:
    if str(req_dict.get("condition_mode") or "ALWAYS").upper() != "CONDITIONAL":
        return None
    rules = req_dict.get("condition_rules") or []
    if not rules:
        return None
    first_rule = rules[0] if isinstance(rules[0], dict) else {}
    return {
        "question_id": first_rule.get("source_question_id") or first_rule.get("question_id") or req_dict.get("question_id"),
        "operator": first_rule.get("operator", "EQUALS"),
        "answer": first_rule.get("expected_value"),
    }


def _format_question_for_mobile(q_dict: dict, checklist_item_id: int) -> dict:
    is_ev_only = bool(q_dict.get("is_evidence_only") or q_dict.get("field_type") == "EVIDENCE_ONLY")
    return {
        **q_dict,
        "question_id": q_dict["id"],
        "checklist_item_id": checklist_item_id,
        "name": q_dict["field_label"],
        "question_name": q_dict["field_label"],
        "description": q_dict["field_description"],
        "question_description": q_dict["field_description"],
        "answer_type": q_dict["field_type"],
        "is_evidence_only": is_ev_only,
        "answer_options": q_dict["options"],
        "required": False if is_ev_only else bool(q_dict["is_mandatory"]),
    }


def _format_photo_req_for_mobile(p_dict: dict, checklist_item_id: int) -> dict:
    trig = _extract_primary_trigger(p_dict)
    return {
        **p_dict,
        "photo_config_id": p_dict["id"],
        "checklist_item_id": checklist_item_id,
        "name": p_dict["photo_name"],
        "description": p_dict["photo_description"],
        "trigger_question_id": trig["question_id"] if trig else p_dict.get("question_id"),
        "trigger_answer": trig["answer"] if trig else None,
        "trigger": trig,
        "required": bool(p_dict["is_mandatory"]),
    }


def _format_video_req_for_mobile(v_dict: dict, checklist_item_id: int) -> dict:
    trig = _extract_primary_trigger(v_dict)
    return {
        **v_dict,
        "video_config_id": v_dict["id"],
        "checklist_item_id": checklist_item_id,
        "name": v_dict["video_name"],
        "description": v_dict["video_description"],
        "trigger_question_id": trig["question_id"] if trig else v_dict.get("question_id"),
        "trigger_answer": trig["answer"] if trig else None,
        "trigger": trig,
        "required": bool(v_dict["is_mandatory"]),
    }


def _build_gps_configuration(loc_reqs: list[dict]) -> dict:
    if not loc_reqs:
        return {
            "required": False,
            "gps_required": False,
            "latitude_required": False,
            "longitude_required": False,
            "accuracy_required": False,
            "accuracy_threshold_meters": None,
            "gps_capture_mandatory": False,
            "location_validation_rules": [],
            "location_requirements": [],
        }

    thresholds = [
        float(lr["accuracy_threshold_meters"])
        for lr in loc_reqs
        if lr.get("accuracy_threshold_meters") is not None
    ]
    gps_required = any(bool(lr.get("is_required", True)) for lr in loc_reqs)
    lat_required = any(bool(lr.get("capture_latitude", True)) for lr in loc_reqs)
    lon_required = any(bool(lr.get("capture_longitude", True)) for lr in loc_reqs)
    gps_mandatory = any(bool(lr.get("is_mandatory", False)) for lr in loc_reqs)
    rules = [
        {
            "location_requirement_id": lr["id"],
            "question_id": lr.get("question_id"),
            "location_name": lr["location_name"],
            "location_description": lr.get("location_description", ""),
            "capture_rule": lr.get("capture_rule", "LIVE_GPS"),
            "capture_latitude": bool(lr.get("capture_latitude", True)),
            "capture_longitude": bool(lr.get("capture_longitude", True)),
            "accuracy_threshold_meters": lr.get("accuracy_threshold_meters"),
            "capture_timestamp": bool(lr.get("capture_timestamp", True)),
            "is_mandatory": bool(lr.get("is_mandatory", False)),
            "is_geofence_required": bool(lr.get("is_geofence_required", False)),
            "geofence_type": lr.get("geofence_type") or "CIRCLE",
            "geofence_reference_name": lr.get("geofence_reference_name", ""),
            "geofence_latitude": lr.get("geofence_latitude"),
            "geofence_longitude": lr.get("geofence_longitude"),
            "geofence_radius_meters": lr.get("geofence_radius_meters"),
            "geofence_polygon": lr.get("geofence_polygon") or [],
            "condition_mode": lr.get("condition_mode", "ALWAYS"),
            "condition_logic": lr.get("condition_logic", "AND"),
            "condition_rules": lr.get("condition_rules", []),
        }
        for lr in loc_reqs
    ]
    return {
        "required": gps_required,
        "gps_required": gps_required,
        "latitude_required": lat_required,
        "longitude_required": lon_required,
        "accuracy_required": len(thresholds) > 0,
        "accuracy_threshold_meters": min(thresholds) if thresholds else None,
        "gps_capture_mandatory": gps_mandatory,
        "geofence_required": any(bool(lr.get("is_geofence_required", False)) for lr in loc_reqs),
        "location_validation_rules": rules,
        "location_requirements": loc_reqs,
    }


def check_machine_maintenance_eligibility(request, query_params: dict) -> dict:
    machine_id = query_params.get('machine_id')
    if not machine_id:
        raise ValidationError({"machine_id": "Query parameter 'machine_id' is required."})

    freq_code = str(query_params.get('frequency') or '').strip().upper()
    if not freq_code:
        raise ValidationError({"frequency": "Query parameter 'frequency' is required (e.g., DAILY, WEEKLY, MONTHLY)."})

    target_user = resolve_target_user(
        request,
        query_params.get('user_id') if query_params.get('user_id') not in (None, '') else query_params.get('operator_id'),
    )

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

    raw_hm = query_params.get('hour_meter_reading')
    check_hm = Decimal(str(machine.engine_hours or 0)).quantize(Decimal('0.01'))
    if raw_hm not in (None, ''):
        try:
            check_hm = Decimal(str(raw_hm).strip()).quantize(Decimal('0.01'))
            if check_hm < 0:
                raise ValidationError({"hour_meter_reading": "Hour-meter reading cannot be negative."})
        except (InvalidOperation, ValueError):
            raise ValidationError({"hour_meter_reading": "hour_meter_reading must be a valid number."})

    user_roles = get_user_role_codes(target_user)
    primary_role = get_primary_pm_role(target_user)
    allowed_frequencies = get_user_allowed_frequencies(target_user, for_submit=True)
    role_authorized = user_can_access_frequency(target_user, freq.code, for_submit=True)

    vendor_authorized, machine_auth_reason = is_user_authorized_for_machine(target_user, machine)

    # Load dynamic Admin Configuration for this frequency (optionally narrowed by activity_id)
    raw_activity_id = query_params.get('activity_id') or query_params.get('checklist_item_id')
    mappings_qs = (
        ChecklistFrequencyMapping.objects.select_related('checklist_item', 'checklist_item__category', 'schedule')
        .filter(
            frequency=freq,
            is_active=True,
            checklist_item__is_active=True,
            checklist_item__is_archived=False,
            checklist_item__category__is_active=True,
        )
        .order_by('checklist_item__category__sort_order', 'sort_order', 'checklist_item__sort_order', 'id')
    )
    if raw_activity_id not in (None, ''):
        if str(raw_activity_id).isdigit():
            mappings_qs = mappings_qs.filter(checklist_item_id=int(raw_activity_id))
        else:
            mappings_qs = mappings_qs.filter(checklist_item__item_code__iexact=str(raw_activity_id).strip())

    mappings = list(mappings_qs)
    if raw_activity_id not in (None, '') and not mappings:
        raise NotFound(f"Maintenance activity '{raw_activity_id}' is not configured for frequency '{freq.code}'.")

    active_scheds = [
        m.schedule for m in mappings
        if getattr(m, 'schedule', None) and m.schedule.is_active
    ]

    latest_sub = (
        MaintenanceSubmission.objects.select_related('frequency')
        .filter(machine_id=machine.id, frequency=freq)
        .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
        .order_by('-submitted_at', '-id')
        .first()
    )
    latest_complete_sub = (
        latest_sub
        if (latest_sub and latest_sub.status == MaintenanceSubmission.STATUS_COMPLETED)
        else (
            MaintenanceSubmission.objects.select_related('frequency')
            .filter(machine_id=machine.id, frequency=freq, status=MaintenanceSubmission.STATUS_COMPLETED)
            .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
            .order_by('-submitted_at', '-id')
            .first()
        )
    )

    today = timezone.localdate()
    sched_eval = evaluate_scheduled_cycle(
        freq=freq,
        schedules=active_scheds,
        latest_completed_sub=latest_complete_sub,
        today=today,
        latest_any_sub=latest_sub,
    )

    if sched_eval is not None:
        due_status = sched_eval['status']
        due_label = sched_eval['due_label']
        scheduled_date = sched_eval.get('current_occurrence_date') or sched_eval.get('next_scheduled_date')
        completion_deadline_date = scheduled_date if freq.code == 'DAILY' else (sched_eval.get('completion_deadline_date') or scheduled_date)
        buffer_days = 0 if freq.code == 'DAILY' else int(sched_eval.get('buffer_days') or 0)
        next_due_date = sched_eval.get('next_scheduled_date')
        has_duplicate = bool(sched_eval.get('already_completed_for_occurrence'))
        duplicate_sub = latest_sub if has_duplicate else None
    else:
        due_status, due_label = _compute_cycle_status(
            machine, freq, latest_complete_sub, today, latest_any_sub=latest_sub
        )
        scheduled_date = today.isoformat() if due_status in ('DUE', 'OVERDUE') else None
        completion_deadline_date = scheduled_date
        buffer_days = 0
        next_due_date = (
            (latest_complete_sub.submission_date + timedelta(days=max(1, int(freq.interval_days)))).isoformat()
            if (latest_complete_sub and freq.interval_days and not freq.interval_hours)
            else scheduled_date
        )
        today_subs = MaintenanceSubmission.objects.filter(
            machine_id=machine.id,
            frequency=freq,
            submission_date=today,
        ).exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
        allow_default_dup = bool(active_scheds) and all(bool(s.allow_duplicate_in_same_slot) for s in active_scheds)
        duplicate_sub = today_subs.order_by('-submitted_at').first() if not allow_default_dup else None
        has_duplicate = duplicate_sub is not None

    item_ids = [m.checklist_item_id for m in mappings]
    cf_by_item, photo_by_item, video_by_item = get_dynamic_configs_for_items(item_ids, frequency_id=freq.id)
    loc_by_item = get_location_requirements_for_items(item_ids, frequency_id=freq.id)
    formatted_q_by_item = {
        m.checklist_item_id: [_format_question_for_mobile(q, m.checklist_item_id) for q in cf_by_item.get(m.checklist_item_id, [])]
        for m in mappings
    }
    sections_by_item = get_sections_for_items(item_ids, formatted_q_by_item)

    activities = []
    all_questions = []
    all_photos = []
    all_videos = []
    all_locations = []

    for m in mappings:
        ci = m.checklist_item
        sched_obj = getattr(m, 'schedule', None)
        sched_data = serialize_schedule(sched_obj) if (sched_obj and sched_obj.is_active) else None

        q_list = formatted_q_by_item.get(ci.id, [])
        sec_list = sections_by_item.get(ci.id, [])
        p_list = [_format_photo_req_for_mobile(p, ci.id) for p in photo_by_item.get(ci.id, [])]
        v_list = [_format_video_req_for_mobile(v, ci.id) for v in video_by_item.get(ci.id, [])]
        l_list = loc_by_item.get(ci.id, [])
        gps_cfg = _build_gps_configuration(l_list)

        all_questions.extend(q_list)
        all_photos.extend(p_list)
        all_videos.extend(v_list)
        all_locations.extend(l_list)

        activities.append(
            {
                "activity_id": ci.id,
                "checklist_item_id": ci.id,
                "mapping_id": m.id,
                "item_code": ci.item_code,
                "activity_name": ci.description,
                "activity_status": "ACTIVE" if ci.is_active else "INACTIVE",
                "is_active": bool(ci.is_active),
                "description": ci.special_instructions or ci.remarks or ci.description,
                "category_id": ci.category_id,
                "category": ci.category.name if ci.category else "",
                "category_name": ci.category.name if ci.category else "",
                "category_code": ci.category.code if ci.category else "",
                "frequency": freq.code,
                "frequency_type": freq.code,
                "frequency_name": freq.name,
                "applicable_schedule": sched_data,
                "original_scheduled_date": scheduled_date,
                "scheduled_date": scheduled_date,
                "completion_deadline_date": completion_deadline_date,
                "buffer_days": buffer_days,
                "allow_duplicate_in_same_slot": bool((sched_data or {}).get("allow_duplicate_in_same_slot", False)),
                "maintenance_due_date": completion_deadline_date or scheduled_date,
                "next_due_date": next_due_date,
                "is_mandatory": bool(m.is_mandatory),
                "requires_photo": bool(ci.requires_photo) or len(p_list) > 0,
                "config_version": getattr(ci, 'config_version', 1),
                "sections": sec_list,
                "questions": q_list,
                "photo_requirements": p_list,
                "video_requirements": v_list,
                "gps_configuration": gps_cfg,
                "location_requirements": l_list,
            }
        )

    primary_act = activities[0] if activities else None
    maintenance_summary = (
        {
            "activity_id": primary_act["activity_id"],
            "checklist_item_id": primary_act["checklist_item_id"],
            "item_code": primary_act["item_code"],
            "activity_name": primary_act["activity_name"],
            "activity_status": primary_act["activity_status"],
            "is_active": primary_act["is_active"],
            "description": primary_act["description"],
            "category_id": primary_act["category_id"],
            "category": primary_act["category"],
            "category_name": primary_act["category_name"],
            "category_code": primary_act["category_code"],
            "frequency": freq.code,
            "frequency_type": freq.code,
            "frequency_name": freq.name,
            "applicable_schedule": primary_act["applicable_schedule"],
            "original_scheduled_date": scheduled_date,
            "scheduled_date": scheduled_date,
            "completion_deadline_date": completion_deadline_date,
            "buffer_days": buffer_days,
            "allow_duplicate_in_same_slot": primary_act["allow_duplicate_in_same_slot"],
            "maintenance_due_date": completion_deadline_date or scheduled_date,
            "next_due_date": next_due_date,
            "is_mandatory": primary_act["is_mandatory"],
            "total_activities": len(activities),
        }
        if primary_act
        else {
            "activity_id": None,
            "checklist_item_id": None,
            "item_code": None,
            "activity_name": None,
            "activity_status": None,
            "is_active": False,
            "description": "",
            "category_id": None,
            "category": "",
            "category_name": "",
            "category_code": "",
            "frequency": freq.code,
            "frequency_type": freq.code,
            "frequency_name": freq.name,
            "applicable_schedule": None,
            "original_scheduled_date": scheduled_date,
            "scheduled_date": scheduled_date,
            "completion_deadline_date": completion_deadline_date,
            "buffer_days": buffer_days,
            "allow_duplicate_in_same_slot": False,
            "maintenance_due_date": scheduled_date,
            "next_due_date": next_due_date,
            "is_mandatory": True,
            "total_activities": 0,
        }
    )

    reasons = []
    if not role_authorized:
        reasons.append(
            f"Role '{primary_role}' is not authorized for {freq.name}. Allowed frequencies: {allowed_frequencies}."
        )
    if not vendor_authorized:
        reasons.append(machine_auth_reason or "User is not authorized for this machine's assigned operator or vendor.")
    if has_duplicate:
        reasons.append(
            f"Duplicate maintenance blocked: {freq.name} already submitted for this occurrence ({duplicate_sub.submission_number})."
        )

    eligible = role_authorized and vendor_authorized and (not has_duplicate)
    machine_payload = serialize_machine_info(machine, include_assignment=True)
    machine_payload["current_hour_meter_reading"] = float(check_hm)

    return {
        "eligible": eligible,
        "eligibility_reasons": reasons,
        "checks": {
            "machine_valid": True,
            "user_valid": True,
            "frequency_valid": True,
            "role_authorized": role_authorized,
            "vendor_authorized": vendor_authorized,
            "operator_authorized": vendor_authorized,
            "duplicate_submission_exists": has_duplicate,
        },
        "machine": machine_payload,
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
            "frequency_type": freq.code,
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
        "schedule_status": sched_eval,
        "maintenance": maintenance_summary,
        "activities": activities,
        "questions": all_questions,
        "photo_requirements": all_photos,
        "video_requirements": all_videos,
        "gps_configuration": _build_gps_configuration(all_locations),
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
    from django.utils.datastructures import MultiValueDict
    from apps.maintenance.services.photo_service import validate_capture_source

    is_api_key_auth = isinstance(getattr(request, 'auth', None), HeroAPIKey)
    if not is_api_key_auth:
        # Derive submitting operator strictly from authenticated JWT user/session; reject spoofing.
        raw_client_uid = payload.get('user_id') if payload.get('user_id') not in (None, '') else payload.get('operator_id')
        if raw_client_uid not in (None, ''):
            try:
                if int(raw_client_uid) != request.user.id:
                    raise PermissionDenied("You cannot submit maintenance under another operator's identity.")
            except (TypeError, ValueError):
                raise ValidationError({"user_id": "user_id must be a valid integer ID."})
        target_user = HeroUser.objects.select_related('vendor').filter(id=request.user.id, is_active=True).first()
        if not target_user:
            raise PermissionDenied("Authenticated operator account is missing or inactive.")
    else:
        target_user = resolve_target_user(
            request,
            payload.get('user_id') if payload.get('user_id') not in (None, '') else payload.get('operator_id'),
        )

    # Never trust operator name / role / vendor supplied by client body
    sanitized_payload = dict(payload)
    for untrusted_key in (
        'submitted_by_id', 'submitted_by_name', 'submitted_by_role',
        'operator_name', 'assigned_operator', 'user_role', 'vendor_name', 'vendor_id',
    ):
        sanitized_payload.pop(untrusted_key, None)

    if sanitized_payload.get('capture_source'):
        validate_capture_source(sanitized_payload.get('capture_source'), require_explicit=False)

    normalized_files = MultiValueDict()
    if files_map:
        if hasattr(files_map, 'lists'):
            for k, file_list in files_map.lists():
                cleaned = [f for f in file_list if f is not None]
                if cleaned:
                    normalized_files.setlist(k, cleaned)
        else:
            for k, val in files_map.items():
                if isinstance(val, list):
                    cleaned = [f for f in val if f is not None]
                    if cleaned:
                        normalized_files.setlist(k, cleaned)
                elif val is not None:
                    normalized_files[k] = val

    responses = sanitized_payload.get('responses')
    if isinstance(responses, list):
        for r in responses:
            if isinstance(r, dict):
                cid = r.get('checklist_item_id') or r.get('item_id')
                pfield = r.get('photo_field')
                if cid and pfield and pfield in normalized_files and f"photo_{cid}" not in normalized_files:
                    normalized_files.setlist(f"photo_{cid}", normalized_files.getlist(pfield))
                if cid and f"photos[{cid}]" in normalized_files and f"photo_{cid}" not in normalized_files:
                    normalized_files.setlist(f"photo_{cid}", normalized_files.getlist(f"photos[{cid}]"))

    sanitized_payload['_require_explicit_camera'] = False
    sanitized_payload['_raise_media_http_status'] = True
    submission = create_maintenance_submission(
        user=target_user,
        payload=sanitized_payload,
        files_map=normalized_files,
        request=request,
    )

    saved_photos = list(
        submission.photos.select_related('checklist_item')
        .defer('photo_data')
        .order_by('id')
    )
    saved_videos = list(
        submission.videos.select_related('checklist_item')
        .defer('video_data')
        .order_by('id')
    )
    saved_locations = list(
        submission.locations.select_related('checklist_item').order_by('id')
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
        "vendor_id": submission.vendor_id,
        "vendor_name": submission.vendor_name,
        "assigned_operator": submission.assigned_operator or "Not Assigned",
        "assigned_operator_id": (submission.machine_assignment_snapshot or {}).get("assigned_operator_id"),
        "scheduled_date": submission.scheduled_due_date.isoformat() if submission.scheduled_due_date else None,
        "completion_deadline_date": (
            submission.completion_deadline_date.isoformat() if submission.completion_deadline_date else None
        ),
        "buffer_days": int((submission.schedule_snapshot or {}).get("buffer_days", 0) or 0),
        "allow_duplicate_in_same_slot": bool(
            (submission.schedule_snapshot or {}).get("allow_duplicate_in_same_slot", False)
        ),
        "gps": (submission.submission_metadata or {}).get("gps") or (
            {
                "latitude": saved_locations[0].latitude,
                "longitude": saved_locations[0].longitude,
                "accuracy_meters": saved_locations[0].accuracy_meters,
                "captured_at": saved_locations[0].captured_at.isoformat() if saved_locations[0].captured_at else None,
            }
            if saved_locations
            else None
        ),
        "hour_meter_reading": float(submission.hour_meter_reading),
        "total_items": submission.total_items,
        "completed_items_count": submission.completed_items_count,
        "not_completed_items_count": submission.not_completed_items_count,
        "photo_count": len(saved_photos),
        "video_count": len(saved_videos),
        "location_count": len(saved_locations),
        "photos": [
            {
                "photo_id": p.id,
                "checklist_response_id": p.response_id,
                "checklist_item_id": p.checklist_item_id,
                "photo_requirement_id": p.photo_requirement_id,
                "requirement_name": p.requirement_name,
                "item_code": p.checklist_item.item_code,
                "photo_filename": p.original_filename,
                "mime_type": p.content_type,
                "file_size": p.file_size,
                "image_hash": p.sha256_hash,
                "photo_url": f"/api/v1/machine-maintenance/photos/{p.id}",
            }
            for p in saved_photos
        ],
        "videos": [
            {
                "video_id": v.id,
                "checklist_response_id": v.response_id,
                "checklist_item_id": v.checklist_item_id,
                "video_requirement_id": v.video_requirement_id,
                "requirement_name": v.requirement_name,
                "item_code": v.checklist_item.item_code,
                "video_filename": v.original_filename,
                "mime_type": v.content_type,
                "file_size": v.file_size,
                "duration_seconds": v.duration_seconds,
                "video_hash": v.sha256_hash,
                "video_url": f"/api/v1/machine-maintenance/videos/{v.id}",
            }
            for v in saved_videos
        ],
        "locations": [
            {
                "location_id": loc.id,
                "checklist_response_id": loc.response_id,
                "checklist_item_id": loc.checklist_item_id,
                "location_requirement_id": loc.location_requirement_id,
                "requirement_name": loc.requirement_name,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "accuracy_meters": loc.accuracy_meters,
                "captured_at": loc.captured_at.isoformat() if loc.captured_at else None,
            }
            for loc in saved_locations
        ],
        "submitted_at": submission.submitted_at.isoformat(),
    }


def _parse_optional_query_date(raw_val: str | None, param_name: str):
    if raw_val in (None, ''):
        return None
    parsed = parse_date(str(raw_val).strip()[:10])
    if parsed is None:
        raise ValidationError({param_name: f"{param_name} must be a valid YYYY-MM-DD date."})
    return parsed


def _parse_pagination_params(query_params: dict) -> tuple[int, int]:
    raw_page = query_params.get('page')
    raw_size = query_params.get('page_size') if query_params.get('page_size') not in (None, '') else query_params.get('size')

    page_num = 1
    if raw_page not in (None, ''):
        try:
            page_num = int(raw_page)
        except (TypeError, ValueError):
            raise ValidationError({"page": "page must be an integer."})
        if page_num <= 0:
            page_num = 1

    page_size = 20
    if raw_size not in (None, ''):
        try:
            page_size = int(raw_size)
        except (TypeError, ValueError):
            raise ValidationError({"page_size": "page_size must be an integer."})
        if page_size < 1 or page_size > 200:
            raise ValidationError({"page_size": "page_size must be between 1 and 200."})

    return page_num, page_size


def get_mobile_maintenance_list(request, query_params: dict) -> dict:
    machine_id = query_params.get('machine_id')
    vendor_id = query_params.get('vendor_id') or query_params.get('vendor')
    operator_id = query_params.get('operator_id') or query_params.get('user_id')
    freq_filter = str(query_params.get('frequency') or '').strip().upper()
    role_filter = normalize_role_code(query_params.get('user_role') or query_params.get('role') or '')
    category_filter = str(query_params.get('category') or '').strip().upper()
    status_filter = str(
        query_params.get('maintenance_status') or query_params.get('status') or ''
    ).strip().upper()
    from_date = _parse_optional_query_date(
        query_params.get('from_date') or query_params.get('date_from'),
        'from_date',
    )
    to_date = _parse_optional_query_date(
        query_params.get('to_date') or query_params.get('date_to'),
        'to_date',
    )
    if from_date and to_date and from_date > to_date:
        raise ValidationError({"from_date": "from_date cannot be after to_date."})
    page_num, page_size = _parse_pagination_params(query_params)
    include_safety = str(query_params.get('include_safety_guidelines', 'true')).strip().lower() != 'false'

    machine_info = None
    machine_obj = None
    if machine_id:
        machine_obj = get_authorized_machine_or_403(request.user, machine_id)
        machine_info = serialize_machine_info(machine_obj, include_assignment=True)

    is_api_key_auth = isinstance(getattr(request, 'auth', None), HeroAPIKey)
    operator_user = None
    if operator_id not in (None, ''):
        try:
            op_int = int(operator_id)
        except (TypeError, ValueError):
            raise ValidationError({"operator_id": "operator_id must be a valid integer ID."})
        if not is_api_key_auth and op_int != request.user.id and not is_pm_admin(request.user):
            raise PermissionDenied("You are not authorized to view another operator's assigned machines.")
        key_owner = getattr(request.auth, 'user', None) if is_api_key_auth else None
        if key_owner is not None and not is_pm_admin(key_owner) and op_int != key_owner.id:
            raise PermissionDenied("API key cannot query another operator's assigned machines.")
        operator_user = HeroUser.objects.select_related('vendor').filter(id=op_int, is_active=True).first()
    elif not is_api_key_auth and not is_pm_admin(request.user):
        operator_user = HeroUser.objects.select_related('vendor').filter(id=request.user.id, is_active=True).first()
    elif is_api_key_auth and getattr(request.auth, 'user', None) and not is_pm_admin(request.auth.user):
        operator_user = HeroUser.objects.select_related('vendor').filter(id=request.auth.user.id, is_active=True).first()

    # Role -> Frequency mappings
    role_mappings_qs = RoleFrequencyMapping.objects.select_related('frequency').filter(
        is_active=True,
        frequency__is_active=True,
    ).order_by('role_code', 'frequency__sort_order')

    if role_filter:
        role_mappings_qs = role_mappings_qs.filter(role_code=role_filter)
    elif operator_user is not None and not is_pm_admin(operator_user):
        allowed_for_op = get_user_allowed_frequencies(operator_user, for_submit=False)
        role_mappings_qs = role_mappings_qs.filter(
            role_code__in=get_user_role_codes(operator_user),
            frequency__code__in=allowed_for_op,
        )

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
    if role_filter or (operator_user is not None and not is_pm_admin(operator_user)):
        freqs_qs = freqs_qs.filter(code__in=allowed_freqs_for_role)
    target_freqs = list(freqs_qs)
    target_freq_codes = {f.code for f in target_freqs}
    freq_by_code = {f.code: f for f in target_freqs}

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
        .prefetch_related('frequency_mappings__frequency', 'frequency_mappings__schedule')
        .filter(is_active=True, is_archived=False, category__is_active=True)
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

    items_list = list(items_qs)
    target_freq_id = target_freqs[0].id if (freq_filter and freq_filter != 'ALL' and len(target_freqs) == 1) else None
    cf_by_item, photo_by_item, video_by_item = get_dynamic_configs_for_items(
        [it.id for it in items_list],
        frequency_id=target_freq_id,
    )
    loc_by_item = get_location_requirements_for_items(
        [it.id for it in items_list],
        frequency_id=target_freq_id,
    )
    sections_by_item = get_sections_for_items([it.id for it in items_list], cf_by_item)

    filtered_items_with_freqs = []
    for item in items_list:
        active_maps = [
            m for m in item.frequency_mappings.all()
            if m.is_active and m.frequency.is_active
        ]
        item_freqs = [m.frequency.code for m in sorted(active_maps, key=lambda x: x.frequency.sort_order)]
        map_by_freq_code = {m.frequency.code: m for m in active_maps}

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
            "activity_id": item.id,
            "item_code": item.item_code,
            "activity_name": item.description,
            "activity_status": "ACTIVE" if item.is_active else "INACTIVE",
            "is_active": bool(item.is_active),
            "category_id": item.category_id,
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
            "sections": sections_by_item.get(item.id, []),
            "custom_fields": cf_by_item.get(item.id, []),
            "photo_requirements": photo_by_item.get(item.id, []),
            "video_requirements": video_by_item.get(item.id, []),
            "location_requirements": loc_by_item.get(item.id, []),
        }
        checklist_items.append(item_payload)
        filtered_items_with_freqs.append((item, item_freqs, map_by_freq_code))

        for fc in item_freqs:
            if fc in freq_wise_buckets:
                freq_wise_buckets[fc]["items"].append(item_payload)
                freq_wise_buckets[fc]["categories"].setdefault(item.category.code, []).append(item_payload)

    # Build real maintenance activity + schedule + submission records (`content`)
    machines_qs = get_authorized_machines_queryset(request.user, vendor_id=vendor_id)
    if machine_obj is not None:
        machines_qs = machines_qs.filter(id=machine_obj.id)
    machines_list = list(machines_qs)
    machine_ids = [m.id for m in machines_list]

    subs_qs = (
        MaintenanceSubmission.objects.select_related('frequency')
        .prefetch_related('responses')
        .filter(machine_id__in=machine_ids)
        .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
        .order_by('-submitted_at', '-id')
    )
    if freq_filter and freq_filter != 'ALL':
        subs_qs = subs_qs.filter(frequency__code=freq_filter)
    if operator_id not in (None, ''):
        subs_qs = subs_qs.filter(submitted_by_id=int(operator_id))
    if from_date:
        subs_qs = subs_qs.filter(submission_date__gte=from_date)
    if to_date:
        subs_qs = subs_qs.filter(submission_date__lte=to_date)

    subs_list = list(subs_qs)
    latest_sub_by_mf = {}
    latest_comp_by_mf = {}
    resp_by_sub_and_item = {}
    for sub in subs_list:
        mf_key = (sub.machine_id, sub.frequency.code)
        if mf_key not in latest_sub_by_mf:
            latest_sub_by_mf[mf_key] = sub
        if mf_key not in latest_comp_by_mf and sub.status == MaintenanceSubmission.STATUS_COMPLETED:
            latest_comp_by_mf[mf_key] = sub
        for resp in sub.responses.all():
            resp_by_sub_and_item[(sub.id, resp.checklist_item_id)] = resp

    today = timezone.localdate()
    content_records = []

    authorized_machines = []
    for m in machines_list:
        m_num = m.machine_chassis_no or m.code or m.serial_number
        op_info = resolve_assigned_operator_info(m)
        assigned_op = op_info["assigned_operator"]
        if operator_id not in (None, ''):
            if operator_user is None:
                continue
            op_matches_machine, _ = is_user_authorized_for_machine(operator_user, m)
            if not op_matches_machine:
                continue
        authorized_machines.append(serialize_machine_info(m, include_assignment=False))

        for item, item_freqs, map_by_freq_code in filtered_items_with_freqs:
            for fc in item_freqs:
                freq_obj = freq_by_code.get(fc)
                if not freq_obj:
                    continue
                mapping = map_by_freq_code.get(fc)
                sched_obj = getattr(mapping, 'schedule', None) if mapping else None
                active_scheds = [sched_obj] if (sched_obj and sched_obj.is_active) else []

                latest_any = latest_sub_by_mf.get((m.id, fc))
                latest_comp = latest_comp_by_mf.get((m.id, fc))

                sched_eval = evaluate_scheduled_cycle(
                    freq=freq_obj,
                    schedules=active_scheds,
                    latest_completed_sub=latest_comp,
                    today=today,
                    latest_any_sub=latest_any,
                )
                if sched_eval is not None:
                    calc_status = sched_eval['status']
                    scheduled_date = sched_eval.get('current_occurrence_date') or sched_eval.get('next_scheduled_date')
                    next_due_date = sched_eval.get('next_scheduled_date')
                    last_maint_date = sched_eval.get('last_completed_date')
                else:
                    calc_status, _due_msg = _compute_cycle_status(
                        m, freq_obj, latest_comp, today, latest_any_sub=latest_any
                    )
                    scheduled_date = today.isoformat() if calc_status in ('DUE', 'OVERDUE') else None
                    next_due_date = (
                        (latest_comp.submission_date + timedelta(days=max(1, int(freq_obj.interval_days)))).isoformat()
                        if (latest_comp and freq_obj.interval_days and not freq_obj.interval_hours)
                        else scheduled_date
                    )
                    last_maint_date = latest_comp.submission_date.isoformat() if latest_comp else None

                # Normalize SCHEDULED into PENDING for mobile list status buckets
                norm_status = 'PENDING' if calc_status == 'SCHEDULED' else calc_status
                if status_filter and status_filter != 'ALL' and norm_status != status_filter:
                    continue

                if (from_date or to_date) and latest_any is None:
                    # When filtering strictly by submission date range, check scheduled/due date fallback
                    ref_d = parse_date(scheduled_date) if scheduled_date else None
                    if ref_d is None:
                        continue
                    if from_date and ref_d < from_date:
                        continue
                    if to_date and ref_d > to_date:
                        continue

                item_resp = resp_by_sub_and_item.get((latest_any.id, item.id)) if latest_any else None

                content_records.append(
                    {
                        "machine_id": m.id,
                        "machine_number": m_num,
                        "machine_name": m.name,
                        "machine_model": m.model_name or "",
                        "vendor": m.vendor.name if m.vendor else "HERO Direct",
                        "vendor_id": m.vendor_id,
                        "assigned_operator": assigned_op,
                        "activity_id": item.id,
                        "checklist_item_id": item.id,
                        "item_code": item.item_code,
                        "activity_name": item.description,
                        "description": item.special_instructions or item.remarks or item.description,
                        "frequency": fc,
                        "frequency_name": freq_obj.name,
                        "scheduled_date": scheduled_date,
                        "due_date": scheduled_date,
                        "last_maintenance_date": last_maint_date,
                        "next_due_date": next_due_date,
                        "submission_id": latest_any.id if latest_any else None,
                        "submission_number": latest_any.submission_number if latest_any else None,
                        "submission_date": latest_any.submission_date.isoformat() if latest_any else None,
                        "submitted_at": latest_any.submitted_at.isoformat() if latest_any else None,
                        "operator": latest_any.submitted_by_name if latest_any else assigned_op,
                        "operator_id": latest_any.submitted_by_id if latest_any else None,
                        "hour_meter_reading": float(latest_any.hour_meter_reading) if latest_any else (m.engine_hours or 0),
                        "completion_status": item_resp.status if item_resp else (latest_any.status if latest_any else None),
                        "approval_status": latest_any.approval_status if latest_any else None,
                        "remarks": (item_resp.remarks if item_resp else latest_any.general_remarks) if latest_any else "",
                        "maintenance_status": norm_status,
                    }
                )

    total_elements = len(content_records)
    total_pages = math.ceil(total_elements / page_size) if total_elements > 0 else 0
    start_idx = (page_num - 1) * page_size
    end_idx = start_idx + page_size
    paged_content = content_records[start_idx:end_idx]

    safety_guidelines = get_safety_guidelines() if include_safety else []

    return {
        "filters_applied": {
            "machine_id": machine_id or None,
            "vendor_id": vendor_id or None,
            "operator_id": operator_id or None,
            "frequency": freq_filter or "ALL",
            "maintenance_status": status_filter or "ALL",
            "from_date": from_date.isoformat() if from_date else None,
            "to_date": to_date.isoformat() if to_date else None,
            "user_role": role_filter or "ALL",
            "category": category_filter or "ALL",
        },
        "authenticated_operator": (
            {
                "id": operator_user.id,
                "username": operator_user.username,
                "name": operator_user.get_display_name(),
                "role": get_primary_pm_role(operator_user),
            }
            if operator_user is not None
            else (
                {
                    "id": request.user.id,
                    "username": request.user.username,
                    "name": request.user.get_display_name(),
                    "role": get_primary_pm_role(request.user),
                }
                if getattr(request, 'user', None) and getattr(request.user, 'is_authenticated', False) and not is_pm_admin(request.user)
                else None
            )
        ),
        "machine": machine_info,
        "machines": authorized_machines,
        "categories": categories,
        "role_assignments": list(role_assignments.values()),
        "total_checklist_items": len(checklist_items),
        "checklist_items": checklist_items,
        "frequency_wise_checklists": list(freq_wise_buckets.values()),
        "safety_guidelines": safety_guidelines,
        "content": paged_content,
        "page": {
            "size": page_size,
            "number": page_num,
            "totalElements": total_elements,
            "totalPages": total_pages,
        },
    }
