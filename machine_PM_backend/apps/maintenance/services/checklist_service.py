from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.hero_integration.permissions import (
    can_review_submission,
    get_primary_pm_role,
    get_user_allowed_frequencies,
    get_user_role_codes,
    is_pm_admin,
    user_can_access_frequency,
)
from apps.hero_integration.services import get_authorized_machine_or_403
from apps.maintenance.models import (
    ChecklistCustomFieldConfig,
    ChecklistFrequencyMapping,
    ChecklistFrequencySchedule,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistVideoRequirement,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceFrequencyMaster,
    MaintenanceSection,
    MaintenanceSubmission,
    RoleFrequencyMapping,
)
from .schedule_service import evaluate_scheduled_cycle, serialize_schedule


def get_dynamic_configs_for_items(item_ids: list[int], frequency_id: int | None = None) -> tuple[dict, dict, dict]:
    """
    Returns active Admin-configured custom fields, named photo requirements, and named video requirements
    grouped by `checklist_item_id`, matching either the specific `frequency_id` or global (`frequency__isnull=True`).
    """
    if not item_ids:
        return {}, {}, {}

    freq_q = Q(frequency__isnull=True)
    if frequency_id is not None:
        freq_q = freq_q | Q(frequency_id=frequency_id)

    cf_by_item = {}
    for cf in (
        ChecklistCustomFieldConfig.objects.select_related('frequency', 'section')
        .prefetch_related('option_rows')
        .filter(checklist_item_id__in=item_ids, is_active=True)
        .filter(Q(section__isnull=True) | Q(section__is_active=True))
        .filter(freq_q)
        .order_by('section__display_order', 'display_order', 'id')
    ):
        opt_values = list(cf.options or [])
        if not opt_values:
            opt_values = [
                opt.option_label
                for opt in cf.option_rows.all()
                if opt.is_active
            ]
        cf_by_item.setdefault(cf.checklist_item_id, []).append(
            {
                "id": cf.id,
                "section_id": cf.section_id,
                "section_name": cf.section.section_name if cf.section else "",
                "section_description": cf.section.section_description if cf.section else "",
                "section_display_order": cf.section.display_order if cf.section else 0,
                "field_name": cf.field_name,
                "field_label": cf.field_label,
                "field_description": cf.field_description,
                "field_type": cf.field_type,
                "options": opt_values,
                "is_mandatory": cf.is_mandatory,
                "is_active": cf.is_active,
                "condition_mode": cf.condition_mode,
                "condition_logic": cf.condition_logic,
                "condition_rules": cf.condition_rules or [],
                "display_order": cf.display_order,
                "frequency_id": cf.frequency_id,
                "frequency_code": cf.frequency.code if cf.frequency else None,
            }
        )

    photo_by_item = {}
    for pr in (
        ChecklistPhotoRequirement.objects.select_related('frequency')
        .filter(checklist_item_id__in=item_ids, is_active=True, is_required=True)
        .filter(freq_q)
        .order_by('display_order', 'id')
    ):
        photo_by_item.setdefault(pr.checklist_item_id, []).append(
            {
                "id": pr.id,
                "question_id": pr.question_id,
                "photo_name": pr.photo_name,
                "photo_description": pr.photo_description,
                "is_required": pr.is_required,
                "is_mandatory": pr.is_mandatory,
                "is_active": pr.is_active,
                "condition_mode": pr.condition_mode,
                "condition_logic": pr.condition_logic,
                "condition_rules": pr.condition_rules or [],
                "display_order": pr.display_order,
                "frequency_id": pr.frequency_id,
                "frequency_code": pr.frequency.code if pr.frequency else None,
            }
        )

    video_by_item = {}
    for vr in (
        ChecklistVideoRequirement.objects.select_related('frequency')
        .filter(checklist_item_id__in=item_ids, is_active=True, is_required=True)
        .filter(freq_q)
        .order_by('display_order', 'id')
    ):
        video_by_item.setdefault(vr.checklist_item_id, []).append(
            {
                "id": vr.id,
                "question_id": vr.question_id,
                "video_name": vr.video_name,
                "video_description": vr.video_description,
                "is_required": vr.is_required,
                "is_mandatory": vr.is_mandatory,
                "is_active": vr.is_active,
                "min_videos": vr.min_videos,
                "max_videos": vr.max_videos,
                "max_duration_seconds": vr.max_duration_seconds,
                "condition_mode": vr.condition_mode,
                "condition_logic": vr.condition_logic,
                "condition_rules": vr.condition_rules or [],
                "display_order": vr.display_order,
                "frequency_id": vr.frequency_id,
                "frequency_code": vr.frequency.code if vr.frequency else None,
            }
        )

    return cf_by_item, photo_by_item, video_by_item


def get_sections_for_items(item_ids: list[int], questions_by_item: dict, *, include_empty: bool = False) -> dict:
    """
    Groups active questions into their active `MaintenanceSection` containers per `checklist_item_id`.
    Sections with zero active questions are omitted unless `include_empty=True`.
    """
    if not item_ids:
        return {}

    sections_by_item = {}
    sec_rows_by_item = {}
    for sec in MaintenanceSection.objects.filter(
        checklist_item_id__in=item_ids, is_active=True
    ).order_by('display_order', 'id'):
        sec_rows_by_item.setdefault(sec.checklist_item_id, []).append(sec)

    for item_id in item_ids:
        q_list = questions_by_item.get(item_id, []) or []
        q_by_sec = {}
        orphan_qs = []
        for q in q_list:
            sid = q.get("section_id")
            if sid:
                q_by_sec.setdefault(sid, []).append(q)
            else:
                orphan_qs.append(q)

        item_sections = []
        for sec in sec_rows_by_item.get(item_id, []):
            sec_qs = q_by_sec.get(sec.id, [])
            if not sec_qs and not include_empty:
                continue
            item_sections.append(
                {
                    "id": sec.id,
                    "section_name": sec.section_name,
                    "section_description": sec.section_description or "",
                    "display_order": sec.display_order,
                    "is_active": sec.is_active,
                    "questions": sec_qs,
                }
            )
        if orphan_qs:
            item_sections.append(
                {
                    "id": None,
                    "section_name": "General Inspection",
                    "section_description": "",
                    "display_order": len(item_sections) + 1,
                    "is_active": True,
                    "questions": orphan_qs,
                }
            )
        sections_by_item[item_id] = item_sections
    return sections_by_item


def get_location_requirements_for_items(item_ids: list[int], frequency_id: int | None = None) -> dict:
    if not item_ids:
        return {}
    freq_q = Q(frequency__isnull=True)
    if frequency_id is not None:
        freq_q = freq_q | Q(frequency_id=frequency_id)

    loc_by_item = {}
    for lr in (
        ChecklistLocationRequirement.objects.select_related('frequency')
        .filter(checklist_item_id__in=item_ids, is_active=True, is_required=True)
        .filter(freq_q)
        .order_by('display_order', 'id')
    ):
        loc_by_item.setdefault(lr.checklist_item_id, []).append(
            {
                "id": lr.id,
                "question_id": lr.question_id,
                "location_name": lr.location_name,
                "location_description": lr.location_description,
                "capture_latitude": lr.capture_latitude,
                "capture_longitude": lr.capture_longitude,
                "accuracy_threshold_meters": lr.accuracy_threshold_meters,
                "capture_timestamp": lr.capture_timestamp,
                "capture_rule": lr.capture_rule,
                "is_required": lr.is_required,
                "is_mandatory": lr.is_mandatory,
                "is_geofence_required": bool(lr.is_geofence_required),
                "geofence_type": lr.geofence_type or ChecklistLocationRequirement.GEOFENCE_CIRCLE,
                "geofence_reference_name": lr.geofence_reference_name or "",
                "geofence_latitude": lr.geofence_latitude,
                "geofence_longitude": lr.geofence_longitude,
                "geofence_radius_meters": lr.geofence_radius_meters,
                "geofence_polygon": lr.geofence_polygon or [],
                "is_active": lr.is_active,
                "condition_mode": lr.condition_mode,
                "condition_logic": lr.condition_logic,
                "condition_rules": lr.condition_rules or [],
                "display_order": lr.display_order,
                "frequency_id": lr.frequency_id,
                "frequency_code": lr.frequency.code if lr.frequency else None,
            }
        )
    return loc_by_item


def _active_configured_frequency_ids() -> set[int]:
    return set(
        ChecklistFrequencyMapping.objects.filter(
            is_active=True,
            checklist_item__is_active=True,
            checklist_item__is_archived=False,
            checklist_item__category__is_active=True,
            checklist_item__category__is_checkable=True,
        ).values_list('frequency_id', flat=True)
    )


def get_role_context(user) -> dict:
    allowed_codes = get_user_allowed_frequencies(user, for_submit=False)
    submit_codes = get_user_allowed_frequencies(user, for_submit=True)
    configured_freq_ids = _active_configured_frequency_ids()
    freq_objs = list(
        MaintenanceFrequencyMaster.objects.filter(
            code__in=allowed_codes,
            id__in=configured_freq_ids,
            is_active=True,
        ).order_by('sort_order', 'id')
    )
    active_code_set = {f.code for f in freq_objs}
    return {
        "role": get_primary_pm_role(user),
        "roles": get_user_role_codes(user),
        "is_admin": is_pm_admin(user),
        "can_review": can_review_submission(user),
        "allowed_frequencies": [f.code for f in freq_objs],
        "submittable_frequencies": [c for c in submit_codes if c in active_code_set],
        "allowed_frequency_labels": [{"code": f.code, "name": f.name} for f in freq_objs],
    }


def get_frequencies_for_user(user, machine_id=None) -> dict:
    role_ctx = get_role_context(user)
    allowed_set = set(role_ctx["allowed_frequencies"])
    submit_set = set(role_ctx["submittable_frequencies"])
    configured_freq_ids = _active_configured_frequency_ids()

    machine_obj = None
    if machine_id and str(machine_id).strip().lower() not in ('all', 'none', 'null', ''):
        machine_obj = get_authorized_machine_or_403(user, machine_id)

    all_freqs = MaintenanceFrequencyMaster.objects.filter(
        is_active=True,
        id__in=configured_freq_ids,
    ).order_by('sort_order', 'id')
    role_maps = RoleFrequencyMapping.objects.filter(is_active=True).select_related('frequency')
    roles_by_freq = {}
    for rm in role_maps:
        roles_by_freq.setdefault(rm.frequency_id, []).append(
            {"role_code": rm.role_code, "role_name": rm.role_name}
        )

    scheds_by_freq = {}
    for s in ChecklistFrequencySchedule.objects.filter(
        is_active=True,
        checklist_item__is_active=True,
        checklist_item__is_archived=False,
        checklist_item__category__is_active=True,
        checklist_item__category__is_checkable=True,
    ).order_by('id'):
        scheds_by_freq.setdefault(s.frequency_id, []).append(s)

    latest_by_freq_id = {}
    if machine_obj is not None:
        for sub in (
            MaintenanceSubmission.objects.filter(machine_id=machine_obj.id)
            .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
            .order_by('-submitted_at', '-id')
        ):
            if sub.frequency_id not in latest_by_freq_id:
                latest_by_freq_id[sub.frequency_id] = sub

    today = timezone.localdate()
    frequencies = []
    for freq in all_freqs:
        item_count = ChecklistFrequencyMapping.objects.filter(
            frequency=freq,
            is_active=True,
            checklist_item__is_active=True,
            checklist_item__is_archived=False,
            checklist_item__category__is_active=True,
            checklist_item__category__is_checkable=True,
        ).count()
        if item_count == 0:
            continue
        f_scheds = scheds_by_freq.get(freq.id, [])
        latest_sub = latest_by_freq_id.get(freq.id)
        sched_eval = evaluate_scheduled_cycle(
            freq=freq,
            schedules=f_scheds,
            latest_completed_sub=latest_sub if (latest_sub and latest_sub.status == MaintenanceSubmission.STATUS_COMPLETED) else None,
            today=today,
            latest_any_sub=latest_sub,
        )
        frequencies.append(
            {
                "id": freq.id,
                "code": freq.code,
                "name": freq.name,
                "interval_hours": freq.interval_hours,
                "interval_days": freq.interval_days,
                "due_threshold_pct": freq.due_threshold_pct,
                "description": freq.description,
                "sort_order": freq.sort_order,
                "checklist_item_count": item_count,
                "assigned_roles": roles_by_freq.get(freq.id, []),
                "can_view": freq.code in allowed_set,
                "can_submit": freq.code in submit_set,
                "schedule_summaries": (
                    sched_eval["schedule_summaries"]
                    if sched_eval
                    else [s.schedule_summary for s in f_scheds if s.schedule_summary]
                ),
                "schedule_status": sched_eval,
            }
        )

    return {
        "role_info": role_ctx,
        "frequencies": frequencies,
        "allowed_frequencies": [f for f in frequencies if f["can_view"]],
    }


def get_checklist_for_frequency(user, frequency_code: str, machine_id=None) -> dict:
    norm_code = str(frequency_code or '').strip().upper()
    freq = MaintenanceFrequencyMaster.objects.filter(code=norm_code, is_active=True).first()
    if not freq:
        raise NotFound(f"Maintenance frequency '{frequency_code}' not found.")

    if not user_can_access_frequency(user, freq.code, for_submit=False):
        raise PermissionDenied(
            f"Your role ({get_primary_pm_role(user)}) is not authorized to access the {freq.name} checklist."
        )

    machine_obj = None
    if machine_id and str(machine_id).strip().lower() not in ('all', 'none', 'null', ''):
        machine_obj = get_authorized_machine_or_403(user, machine_id)

    mappings = list(
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
    item_ids = [m.checklist_item_id for m in mappings]
    cf_by_item, photo_by_item, video_by_item = get_dynamic_configs_for_items(
        item_ids,
        frequency_id=freq.id,
    )
    loc_by_item = get_location_requirements_for_items(
        item_ids,
        frequency_id=freq.id,
    )
    sections_by_item = get_sections_for_items(item_ids, cf_by_item)

    items = []
    grouped = {}
    category_meta = {}
    active_scheds = []
    for m in mappings:
        ci = m.checklist_item
        sched_obj = getattr(m, 'schedule', None)
        if sched_obj and sched_obj.is_active:
            active_scheds.append(sched_obj)
        entry = {
            "id": ci.id,
            "checklist_item_id": ci.id,
            "mapping_id": m.id,
            "item_code": ci.item_code,
            "category_id": ci.category_id,
            "category_code": ci.category.code,
            "category_name": ci.category.name,
            "description": ci.description,
            "remarks": ci.remarks,
            "special_instructions": ci.special_instructions,
            "service_interval": ci.service_interval,
            "is_mandatory": m.is_mandatory,
            "requires_photo": ci.requires_photo,
            "requires_remarks_if_not_completed": ci.requires_remarks_if_not_completed,
            "config_version": getattr(ci, 'config_version', 1),
            "sort_order": m.sort_order or ci.sort_order,
            "schedule": serialize_schedule(sched_obj) if (sched_obj and sched_obj.is_active) else None,
            "sections": sections_by_item.get(ci.id, []),
            "custom_fields": cf_by_item.get(ci.id, []),
            "photo_requirements": photo_by_item.get(ci.id, []),
            "video_requirements": video_by_item.get(ci.id, []),
            "location_requirements": loc_by_item.get(ci.id, []),
        }
        items.append(entry)
        cat_code = ci.category.code
        if cat_code not in category_meta:
            category_meta[cat_code] = {
                "category_id": ci.category_id,
                "category_code": cat_code,
                "category_name": ci.category.name,
            }
        grouped.setdefault(cat_code, []).append(entry)

    latest_sub = None
    latest_complete_sub = None
    if machine_obj is not None:
        latest_sub = (
            MaintenanceSubmission.objects.filter(machine_id=machine_obj.id, frequency=freq)
            .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
            .order_by('-submitted_at', '-id')
            .first()
        )
        if latest_sub and latest_sub.status == MaintenanceSubmission.STATUS_COMPLETED:
            latest_complete_sub = latest_sub
        else:
            latest_complete_sub = (
                MaintenanceSubmission.objects.filter(
                    machine_id=machine_obj.id,
                    frequency=freq,
                    status=MaintenanceSubmission.STATUS_COMPLETED,
                )
                .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
                .order_by('-submitted_at', '-id')
                .first()
            )

    today = timezone.localdate()
    schedule_status = evaluate_scheduled_cycle(
        freq=freq,
        schedules=active_scheds,
        latest_completed_sub=latest_complete_sub,
        today=today,
        latest_any_sub=latest_sub,
    )
    if schedule_status is None and machine_obj is not None:
        allow_dup = bool(active_scheds) and all(bool(s.allow_duplicate_in_same_slot) for s in active_scheds)
        submitted_today = bool(latest_sub and latest_sub.submission_date >= today)
        schedule_status = {
            "status": "COMPLETED" if (latest_complete_sub and latest_complete_sub.submission_date >= today) else "DUE",
            "due_label": f"{freq.name} Completed ({today})" if (latest_complete_sub and latest_complete_sub.submission_date >= today) else f"{freq.name} Due ({today})",
            "current_occurrence_date": today.isoformat(),
            "completion_deadline_date": today.isoformat(),
            "next_scheduled_date": None,
            "upcoming_dates": [],
            "last_completed_date": latest_complete_sub.submission_date.isoformat() if latest_complete_sub else None,
            "schedule_summaries": [s.schedule_summary for s in active_scheds if s.schedule_summary] or ["Default interval"],
            "buffer_days": 0,
            "within_buffer_period": False,
            "allow_duplicate_in_same_slot": allow_dup,
            "already_completed_for_occurrence": submitted_today if not allow_dup else False,
            "existing_submission_number": (
                latest_sub.submission_number if (submitted_today and not allow_dup and latest_sub) else None
            ),
        }

    safety_guidelines = get_safety_guidelines()

    # Also surface condition-based / as-required items from master for visibility
    as_required_items = [
        {
            "id": ci.id,
            "item_code": ci.item_code,
            "category_code": ci.category.code,
            "category_name": ci.category.name,
            "description": ci.description,
            "remarks": ci.remarks,
            "special_instructions": ci.special_instructions,
            "service_interval": ci.service_interval,
        }
        for ci in MaintenanceChecklistMaster.objects.select_related('category')
        .filter(is_active=True, is_as_required=True)
        .order_by('sort_order', 'id')
    ]

    category_groups = [
        {
            **category_meta[cat_code],
            "items": cat_items,
        }
        for cat_code, cat_items in grouped.items()
        if cat_items
    ]
    non_empty_categories = {cat_code: cat_items for cat_code, cat_items in grouped.items() if cat_items}

    return {
        "frequency": {
            "id": freq.id,
            "code": freq.code,
            "name": freq.name,
            "interval_hours": freq.interval_hours,
            "interval_days": freq.interval_days,
            "description": freq.description,
        },
        "can_submit": user_can_access_frequency(user, freq.code, for_submit=True),
        "schedule_status": schedule_status,
        "total_items": len(items),
        "items": items,
        "categories": non_empty_categories,
        "category_groups": category_groups,
        "as_required_reference_items": as_required_items,
        "safety_guidelines": safety_guidelines,
    }


def get_safety_guidelines() -> list[dict]:
    cat = MaintenanceCategoryMaster.objects.filter(code='GENERAL_SAFETY_GUIDELINES').first()
    if not cat:
        return []
    items = (
        MaintenanceChecklistMaster.objects.filter(category=cat, is_active=True)
        .order_by('sort_order', 'id')
    )
    return [
        {
            "id": item.id,
            "item_code": item.item_code,
            "section_key": item.section_key,
            "title": item.description,
            "subtitle": item.service_interval or item.remarks,
            "content": item.special_instructions,
            "remarks": item.remarks,
            "sort_order": item.sort_order,
        }
        for item in items
    ]

