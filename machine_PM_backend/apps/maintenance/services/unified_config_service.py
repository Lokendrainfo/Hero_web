from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.maintenance.models import (
    ChecklistConditionRule,
    ChecklistCustomFieldConfig,
    ChecklistFrequencyMapping,
    ChecklistFrequencySchedule,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistQuestionOption,
    ChecklistVideoRequirement,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceFrequencyMaster,
    RoleFrequencyMapping,
)
from apps.maintenance.services.audit_service import record_audit_log
from apps.maintenance.services.condition_service import ALLOWED_OPERATORS_BY_TYPE
from apps.maintenance.services.schedule_service import serialize_schedule, validate_and_normalize_schedule

CALENDAR_FREQUENCIES = (
    {
        "code": "DAILY",
        "name": "Daily",
        "interval_days": 1,
        "sort_order": 1,
        "description": "Daily preventive maintenance checklist",
    },
    {
        "code": "WEEKLY",
        "name": "Weekly",
        "interval_days": 7,
        "sort_order": 2,
        "description": "Weekly preventive maintenance checklist",
    },
    {
        "code": "EVERY_15_DAYS",
        "name": "Every 15 Days",
        "interval_days": 15,
        "sort_order": 3,
        "description": "Every 15 days or twice-monthly preventive maintenance checklist",
    },
    {
        "code": "MONTHLY",
        "name": "Monthly",
        "interval_days": 30,
        "sort_order": 4,
        "description": "Monthly preventive maintenance checklist",
    },
    {
        "code": "QUARTERLY",
        "name": "Quarterly",
        "interval_days": 90,
        "sort_order": 5,
        "description": "Quarterly preventive maintenance checklist",
    },
    {
        "code": "YEARLY",
        "name": "Yearly",
        "interval_days": 365,
        "sort_order": 6,
        "description": "Yearly preventive maintenance checklist",
    },
)

CALENDAR_FREQUENCY_BY_CODE = {entry["code"]: entry for entry in CALENDAR_FREQUENCIES}

PM_ROLES = (
    ("OPERATOR", "Operator"),
    ("FIELD_ENGINEER", "Field Engineer"),
    ("AREA_MANAGER", "Area Manager"),
    ("ADMIN", "Admin"),
)

OPTION_ANSWER_TYPES = {
    ChecklistCustomFieldConfig.TYPE_DROPDOWN,
    ChecklistCustomFieldConfig.TYPE_RADIO,
    ChecklistCustomFieldConfig.TYPE_CHECKBOX,
    ChecklistCustomFieldConfig.TYPE_MULTI_SELECT,
}

VALID_ANSWER_TYPES = {c[0] for c in ChecklistCustomFieldConfig.FIELD_TYPE_CHOICES}
VALID_OPERATORS = {c[0] for c in ChecklistConditionRule.OPERATOR_CHOICES}
VALID_CAPTURE_RULES = {c[0] for c in ChecklistLocationRequirement.CAPTURE_RULE_CHOICES}


def ensure_calendar_frequencies_and_roles(freq_codes: list[str] | None = None) -> dict[str, MaintenanceFrequencyMaster]:
    codes_to_ensure = freq_codes if freq_codes is not None else [c["code"] for c in CALENDAR_FREQUENCIES]
    freq_map = {}

    for code in codes_to_ensure:
        spec = CALENDAR_FREQUENCY_BY_CODE.get(code)
        if not spec:
            continue
        freq_obj, _ = MaintenanceFrequencyMaster.objects.get_or_create(
            code=spec["code"],
            defaults={
                "name": spec["name"],
                "interval_hours": None,
                "interval_days": spec["interval_days"],
                "due_threshold_pct": 0.90,
                "description": spec["description"],
                "sort_order": spec["sort_order"],
                "is_active": True,
            },
        )
        if not freq_obj.is_active:
            freq_obj.is_active = True
            freq_obj.save(update_fields=["is_active", "updated_at"])
        freq_map[code] = freq_obj

        for role_code, role_name in PM_ROLES:
            RoleFrequencyMapping.objects.get_or_create(
                role_code=role_code,
                frequency=freq_obj,
                defaults={
                    "role_name": role_name,
                    "can_view": True,
                    "can_submit": True,
                    "is_active": True,
                },
            )

    return freq_map


def _generate_next_item_code() -> str:
    prefix = "PM-ACT-"
    existing = set(
        MaintenanceChecklistMaster.objects.filter(item_code__startswith=prefix).values_list("item_code", flat=True)
    )
    seq = 1
    while f"{prefix}{seq:03d}" in existing:
        seq += 1
    return f"{prefix}{seq:03d}"


def _serialize_photo_req(p: ChecklistPhotoRequirement) -> dict:
    return {
        "id": p.id,
        "question_id": p.question_id,
        "photo_name": p.photo_name,
        "photo_description": p.photo_description,
        "is_mandatory": p.is_mandatory,
        "display_order": p.display_order,
        "is_active": p.is_active,
        "condition_mode": p.condition_mode,
        "condition_logic": p.condition_logic,
        "condition_rules": p.condition_rules or [],
    }


def _serialize_video_req(v: ChecklistVideoRequirement) -> dict:
    return {
        "id": v.id,
        "question_id": v.question_id,
        "video_name": v.video_name,
        "video_description": v.video_description,
        "max_duration_seconds": v.max_duration_seconds,
        "min_videos": v.min_videos,
        "max_videos": v.max_videos,
        "is_mandatory": v.is_mandatory,
        "display_order": v.display_order,
        "is_active": v.is_active,
        "condition_mode": v.condition_mode,
        "condition_logic": v.condition_logic,
        "condition_rules": v.condition_rules or [],
    }


def _serialize_location_req(lr: ChecklistLocationRequirement) -> dict:
    return {
        "id": lr.id,
        "question_id": lr.question_id,
        "location_name": lr.location_name,
        "location_description": lr.location_description,
        "capture_latitude": lr.capture_latitude,
        "capture_longitude": lr.capture_longitude,
        "accuracy_threshold_meters": lr.accuracy_threshold_meters,
        "capture_timestamp": lr.capture_timestamp,
        "capture_rule": lr.capture_rule,
        "is_mandatory": lr.is_mandatory,
        "display_order": lr.display_order,
        "is_active": lr.is_active,
        "condition_mode": lr.condition_mode,
        "condition_logic": lr.condition_logic,
        "condition_rules": lr.condition_rules or [],
    }


def serialize_activity_configuration(item: MaintenanceChecklistMaster) -> dict:
    active_mappings = list(
        item.frequency_mappings.select_related("frequency", "schedule")
        .filter(is_active=True, frequency__is_active=True)
        .order_by("frequency__sort_order", "id")
    )
    primary_mapping = active_mappings[0] if active_mappings else None
    freq_code = primary_mapping.frequency.code if primary_mapping else None
    freq_name = primary_mapping.frequency.name if primary_mapping else ""
    freq_sched = None
    freq_sched_summary = ""
    if primary_mapping:
        sched_obj = getattr(primary_mapping, "schedule", None)
        if sched_obj and sched_obj.is_active:
            freq_sched = serialize_schedule(sched_obj)
            freq_sched_summary = sched_obj.schedule_summary or freq_name
        else:
            freq_sched = {
                "frequency_code": freq_code,
                "frequency_type": freq_code,
                "schedule_type": ChecklistFrequencySchedule.SCHED_DEFAULT,
                "schedule_summary": "Default interval",
                "is_active": True,
            }
            freq_sched_summary = freq_name

    freq_codes = [freq_code] if freq_code else []
    freq_names = [freq_name] if freq_name else []
    freq_schedules = {freq_code: freq_sched} if freq_code else {}
    freq_schedule_summaries = {freq_code: freq_sched_summary} if freq_code else {}

    all_questions = list(
        ChecklistCustomFieldConfig.objects.filter(checklist_item=item)
        .prefetch_related("option_rows")
        .order_by("display_order", "id")
    )
    all_photos = list(
        ChecklistPhotoRequirement.objects.filter(checklist_item=item, is_required=True)
        .order_by("display_order", "id")
    )
    all_videos = list(
        ChecklistVideoRequirement.objects.filter(checklist_item=item, is_required=True)
        .order_by("display_order", "id")
    )
    all_locations = list(
        ChecklistLocationRequirement.objects.filter(checklist_item=item, is_required=True)
        .order_by("display_order", "id")
    )

    photos_by_q = {}
    unlinked_photos = []
    for p in all_photos:
        if p.question_id:
            photos_by_q.setdefault(p.question_id, []).append(_serialize_photo_req(p))
        else:
            unlinked_photos.append(_serialize_photo_req(p))

    videos_by_q = {}
    unlinked_videos = []
    for v in all_videos:
        if v.question_id:
            videos_by_q.setdefault(v.question_id, []).append(_serialize_video_req(v))
        else:
            unlinked_videos.append(_serialize_video_req(v))

    locs_by_q = {}
    unlinked_locs = []
    for lr in all_locations:
        if lr.question_id:
            locs_by_q.setdefault(lr.question_id, []).append(_serialize_location_req(lr))
        else:
            unlinked_locs.append(_serialize_location_req(lr))

    questions_data = []
    for q in all_questions:
        opts = list(q.options or [])
        if not opts:
            opts = [o.option_label for o in q.option_rows.all() if o.is_active]
        q_photos = photos_by_q.get(q.id, [])
        q_videos = videos_by_q.get(q.id, [])
        q_locs = locs_by_q.get(q.id, [])
        questions_data.append(
            {
                "id": q.id,
                "temp_key": f"q-{q.id}",
                "question_name": q.field_label,
                "field_name": q.field_name,
                "question_description": q.field_description,
                "answer_type": q.field_type,
                "options": opts,
                "is_mandatory": q.is_mandatory,
                "display_order": q.display_order,
                "is_active": q.is_active,
                "condition_mode": q.condition_mode,
                "condition_logic": q.condition_logic,
                "condition_rules": q.condition_rules or [],
                "is_photo_required": len(q_photos) > 0,
                "photos": q_photos,
                "is_video_required": len(q_videos) > 0,
                "videos": q_videos,
                "is_location_required": len(q_locs) > 0,
                "locations": q_locs,
            }
        )

    return {
        "id": item.id,
        "item_code": item.item_code,
        "activity_name": item.description,
        "description": item.special_instructions or item.remarks or "",
        "category": item.category_id,
        "category_code": item.category.code if item.category else "",
        "category_name": item.category.name if item.category else "",
        "frequency": freq_code,
        "frequency_name": freq_name,
        "frequency_schedule": freq_sched,
        "frequency_schedule_summary": freq_sched_summary,
        "frequencies": freq_codes,
        "frequency_names": freq_names,
        "frequency_schedules": freq_schedules,
        "frequency_schedule_summaries": freq_schedule_summaries,
        "config_version": getattr(item, "config_version", 1),
        "questions_enabled": len(questions_data) > 0,
        "questions": questions_data,
        "is_photo_required": len(all_photos) > 0 or bool(item.requires_photo),
        "photos": unlinked_photos,
        "all_photos": [_serialize_photo_req(p) for p in all_photos],
        "is_video_required": len(all_videos) > 0,
        "videos": unlinked_videos,
        "all_videos": [_serialize_video_req(v) for v in all_videos],
        "is_location_required": len(all_locations) > 0,
        "locations": unlinked_locs,
        "all_locations": [_serialize_location_req(lr) for lr in all_locations],
        "is_active": item.is_active,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def _slug_field_name(label: str, index: int) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "_" for ch in label).strip("_")
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned[:64] if cleaned else f"question_{index}"


def _resolve_and_validate_rules(
    *,
    raw_mode: str,
    raw_logic: str,
    raw_rules: list,
    question_lookup_by_ref: dict[str, ChecklistCustomFieldConfig],
    owner_label: str,
    self_question_id: int | None = None,
) -> tuple[str, str, list[dict]]:
    mode = str(raw_mode or "ALWAYS").strip().upper()
    if mode not in ("ALWAYS", "CONDITIONAL"):
        mode = "ALWAYS"
    logic = str(raw_logic or "AND").strip().upper()
    if logic not in ("AND", "OR"):
        logic = "AND"

    if mode != "CONDITIONAL":
        return "ALWAYS", logic, []

    if not isinstance(raw_rules, list) or len(raw_rules) == 0:
        raise ValidationError(
            {"condition_rules": f"{owner_label}: Conditional Display selected without any condition rules."}
        )

    normalized_rules = []
    for r_idx, r in enumerate(raw_rules, start=1):
        if not isinstance(r, dict):
            raise ValidationError({"condition_rules": f"{owner_label}: Invalid condition rule #{r_idx}."})

        ref_key = (
            r.get("source_question_key")
            or r.get("source_question_id")
            or r.get("question_id")
        )
        src_q = question_lookup_by_ref.get(str(ref_key)) if ref_key is not None else None
        if not src_q:
            raise ValidationError(
                {
                    "condition_rules": (
                        f"{owner_label}: Condition rule #{r_idx} references a deleted or missing question."
                    )
                }
            )
        if not src_q.is_active:
            raise ValidationError(
                {
                    "condition_rules": (
                        f"{owner_label}: Condition rule #{r_idx} references inactive question '{src_q.field_label}'. "
                        "Remove/update the rule or reactivate the question."
                    )
                }
            )
        if self_question_id is not None and src_q.id == self_question_id:
            raise ValidationError(
                {"condition_rules": f"{owner_label}: A question cannot depend on itself."}
            )

        op = str(r.get("operator") or "EQUALS").strip().upper()
        if op not in VALID_OPERATORS:
            raise ValidationError({"condition_rules": f"{owner_label}: Unsupported operator '{op}'."})

        allowed_ops = ALLOWED_OPERATORS_BY_TYPE.get(src_q.field_type, VALID_OPERATORS)
        if op not in allowed_ops:
            raise ValidationError(
                {
                    "condition_rules": (
                        f"{owner_label}: Operator '{op}' is not compatible with '{src_q.field_label}' ({src_q.field_type})."
                    )
                }
            )

        exp_val = str(r.get("expected_value") if r.get("expected_value") is not None else "").strip()
        if exp_val == "":
            raise ValidationError(
                {"condition_rules": f"{owner_label}: Answer value is required for condition rule #{r_idx}."}
            )

        normalized_rules.append(
            {
                "source_question_id": src_q.id,
                "source_question_name": src_q.field_name,
                "source_question_label": src_q.field_label,
                "operator": op,
                "expected_value": exp_val,
                "rule_order": r_idx,
            }
        )

    return "CONDITIONAL", logic, normalized_rules


def _validate_photo_entries(photos_list: list, scope_label: str):
    for idx, pr in enumerate(photos_list, start=1):
        if not isinstance(pr, dict) or not str(pr.get("photo_name") or "").strip():
            raise ValidationError({"photos": f"{scope_label}: Photo Name is required for Photo #{idx}."})


def _validate_video_entries(videos_list: list, scope_label: str):
    for idx, vr in enumerate(videos_list, start=1):
        if not isinstance(vr, dict) or not str(vr.get("video_name") or "").strip():
            raise ValidationError({"videos": f"{scope_label}: Video Name is required for Video #{idx}."})
        try:
            max_dur = int(vr.get("max_duration_seconds") or 60)
            min_v = int(vr.get("min_videos") if vr.get("min_videos") is not None else (1 if vr.get("is_mandatory") else 0))
            max_v = int(vr.get("max_videos") if vr.get("max_videos") is not None else max(1, min_v))
        except (TypeError, ValueError):
            raise ValidationError({"videos": f"{scope_label}: Invalid count or duration for Video #{idx}."})
        if max_dur < 3 or max_dur > 300:
            raise ValidationError({"videos": f"{scope_label}: Maximum Duration for Video #{idx} must be between 3 and 300 seconds."})
        if min_v < 0 or max_v < 1 or max_v < min_v:
            raise ValidationError({"videos": f"{scope_label}: Invalid Min/Max Video Count for Video #{idx}."})


def _validate_location_entries(locations_list: list, scope_label: str):
    for idx, lr in enumerate(locations_list, start=1):
        if not isinstance(lr, dict) or not str(lr.get("location_name") or "").strip():
            raise ValidationError({"locations": f"{scope_label}: Location Name is required for Location #{idx}."})
        acc = lr.get("accuracy_threshold_meters")
        if acc not in (None, ""):
            try:
                acc_num = float(acc)
            except (TypeError, ValueError):
                raise ValidationError({"locations": f"{scope_label}: Invalid GPS accuracy threshold on Location #{idx}."})
            if acc_num <= 0:
                raise ValidationError({"locations": f"{scope_label}: GPS accuracy threshold must be > 0 meters."})


def _sync_evidence_batch(
    *,
    item: MaintenanceChecklistMaster,
    category: MaintenanceCategoryMaster,
    parent_question: ChecklistCustomFieldConfig | None,
    photos_list: list,
    videos_list: list,
    locations_list: list,
    question_lookup_by_ref: dict[str, ChecklistCustomFieldConfig],
):
    # Photos for this parent (nested question OR unlinked activity level)
    kept_photo_ids = []
    for idx, pr in enumerate(photos_list, start=1):
        pr_id = pr.get("id")
        p_name = str(pr["photo_name"]).strip()
        c_mode, c_logic, c_rules = _resolve_and_validate_rules(
            raw_mode=pr.get("condition_mode", "ALWAYS"),
            raw_logic=pr.get("condition_logic", "AND"),
            raw_rules=pr.get("condition_rules", []),
            question_lookup_by_ref=question_lookup_by_ref,
            owner_label=f"Photo '{p_name}'",
        )
        defaults = {
            "category": category,
            "checklist_item": item,
            "question": parent_question,
            "frequency": None,
            "photo_name": p_name,
            "photo_description": str(pr.get("photo_description") or "").strip(),
            "is_required": True,
            "is_mandatory": bool(pr.get("is_mandatory", False)),
            "condition_mode": c_mode,
            "condition_logic": c_logic,
            "condition_rules": c_rules,
            "display_order": int(pr.get("display_order") or idx),
            "is_active": bool(pr.get("is_active", True)),
        }
        existing_pr = ChecklistPhotoRequirement.objects.filter(id=pr_id, checklist_item=item).first() if pr_id else None
        if existing_pr:
            for k, v in defaults.items():
                setattr(existing_pr, k, v)
            existing_pr.save()
            pr_obj = existing_pr
        else:
            pr_obj = ChecklistPhotoRequirement.objects.create(**defaults)

        kept_photo_ids.append(pr_obj.id)
        for rule in c_rules:
            ChecklistConditionRule.objects.create(
                checklist_item=item,
                target_type=ChecklistConditionRule.TARGET_PHOTO,
                target_photo=pr_obj,
                source_question_id=rule["source_question_id"],
                logic_operator=c_logic,
                operator=rule["operator"],
                expected_value=rule["expected_value"],
                rule_order=rule["rule_order"],
                is_active=True,
            )

    scope_photo_qs = ChecklistPhotoRequirement.objects.filter(checklist_item=item, question=parent_question)
    scope_photo_qs.exclude(id__in=kept_photo_ids).update(is_active=False, is_required=False)

    # Videos for this parent
    kept_video_ids = []
    for idx, vr in enumerate(videos_list, start=1):
        vr_id = vr.get("id")
        v_name = str(vr["video_name"]).strip()
        is_mand = bool(vr.get("is_mandatory", False))
        max_dur = int(vr.get("max_duration_seconds") or 60)
        min_v = int(vr.get("min_videos") if vr.get("min_videos") is not None else (1 if is_mand else 0))
        if is_mand and min_v < 1:
            min_v = 1
        max_v = max(max(1, min_v), int(vr.get("max_videos") or 1))
        c_mode, c_logic, c_rules = _resolve_and_validate_rules(
            raw_mode=vr.get("condition_mode", "ALWAYS"),
            raw_logic=vr.get("condition_logic", "AND"),
            raw_rules=vr.get("condition_rules", []),
            question_lookup_by_ref=question_lookup_by_ref,
            owner_label=f"Video '{v_name}'",
        )
        defaults = {
            "category": category,
            "checklist_item": item,
            "question": parent_question,
            "frequency": None,
            "video_name": v_name,
            "video_description": str(vr.get("video_description") or "").strip(),
            "is_required": True,
            "is_mandatory": is_mand,
            "min_videos": min_v,
            "max_videos": max_v,
            "max_duration_seconds": max_dur,
            "condition_mode": c_mode,
            "condition_logic": c_logic,
            "condition_rules": c_rules,
            "display_order": int(vr.get("display_order") or idx),
            "is_active": bool(vr.get("is_active", True)),
        }
        existing_vr = ChecklistVideoRequirement.objects.filter(id=vr_id, checklist_item=item).first() if vr_id else None
        if existing_vr:
            for k, v in defaults.items():
                setattr(existing_vr, k, v)
            existing_vr.save()
            vr_obj = existing_vr
        else:
            vr_obj = ChecklistVideoRequirement.objects.create(**defaults)

        kept_video_ids.append(vr_obj.id)
        for rule in c_rules:
            ChecklistConditionRule.objects.create(
                checklist_item=item,
                target_type=ChecklistConditionRule.TARGET_VIDEO,
                target_video=vr_obj,
                source_question_id=rule["source_question_id"],
                logic_operator=c_logic,
                operator=rule["operator"],
                expected_value=rule["expected_value"],
                rule_order=rule["rule_order"],
                is_active=True,
            )

    scope_video_qs = ChecklistVideoRequirement.objects.filter(checklist_item=item, question=parent_question)
    scope_video_qs.exclude(id__in=kept_video_ids).update(is_active=False, is_required=False)

    # Locations (GPS / Lat & Long) for this parent
    kept_loc_ids = []
    for idx, lr in enumerate(locations_list, start=1):
        lr_id = lr.get("id")
        l_name = str(lr.get("location_name") or "GPS Location").strip()
        acc = lr.get("accuracy_threshold_meters")
        acc_val = float(acc) if acc not in (None, "") else None
        cap_rule = str(lr.get("capture_rule") or ChecklistLocationRequirement.RULE_LIVE_GPS).strip().upper()
        if cap_rule not in VALID_CAPTURE_RULES:
            cap_rule = ChecklistLocationRequirement.RULE_LIVE_GPS

        c_mode, c_logic, c_rules = _resolve_and_validate_rules(
            raw_mode=lr.get("condition_mode", "ALWAYS"),
            raw_logic=lr.get("condition_logic", "AND"),
            raw_rules=lr.get("condition_rules", []),
            question_lookup_by_ref=question_lookup_by_ref,
            owner_label=f"Location '{l_name}'",
        )
        defaults = {
            "category": category,
            "checklist_item": item,
            "question": parent_question,
            "frequency": None,
            "location_name": l_name,
            "location_description": str(lr.get("location_description") or "").strip(),
            "is_required": True,
            "capture_latitude": bool(lr.get("capture_latitude", True)),
            "capture_longitude": bool(lr.get("capture_longitude", True)),
            "accuracy_threshold_meters": acc_val,
            "capture_timestamp": bool(lr.get("capture_timestamp", True)),
            "capture_rule": cap_rule,
            "is_mandatory": bool(lr.get("is_mandatory", False)),
            "condition_mode": c_mode,
            "condition_logic": c_logic,
            "condition_rules": c_rules,
            "display_order": int(lr.get("display_order") or idx),
            "is_active": bool(lr.get("is_active", True)),
        }
        existing_lr = ChecklistLocationRequirement.objects.filter(id=lr_id, checklist_item=item).first() if lr_id else None
        if existing_lr:
            for k, v in defaults.items():
                setattr(existing_lr, k, v)
            existing_lr.save()
            lr_obj = existing_lr
        else:
            lr_obj = ChecklistLocationRequirement.objects.create(**defaults)

        kept_loc_ids.append(lr_obj.id)
        for rule in c_rules:
            ChecklistConditionRule.objects.create(
                checklist_item=item,
                target_type=ChecklistConditionRule.TARGET_LOCATION,
                target_location=lr_obj,
                source_question_id=rule["source_question_id"],
                logic_operator=c_logic,
                operator=rule["operator"],
                expected_value=rule["expected_value"],
                rule_order=rule["rule_order"],
                is_active=True,
            )

    scope_loc_qs = ChecklistLocationRequirement.objects.filter(checklist_item=item, question=parent_question)
    scope_loc_qs.exclude(id__in=kept_loc_ids).update(is_active=False, is_required=False)


@transaction.atomic
def save_unified_activity_configuration(
    *,
    user,
    payload: dict,
    instance: MaintenanceChecklistMaster | None = None,
    request=None,
) -> dict:
    """
    Atomically creates or updates a complete dynamic preventive maintenance configuration:
    - Activity details & config_version
    - Frequency mappings (Daily, Weekly, Monthly, Quarterly, Yearly) & role permissions
    - Dynamic Maintenance Questions & Answer Options inside Section 3
    - Nested Photo, Video, and GPS / Lat-Long requirements + conditional rules inside each Question
    - Backward-compatible support for unlinked activity-level photo/video/location lists
    """
    activity_name = str(payload.get("activity_name") or "").strip()
    if not activity_name:
        raise ValidationError({"activity_name": "Maintenance Activity Name is required."})

    description = str(payload.get("description") or "").strip()
    if not description:
        raise ValidationError({"description": "Description is required."})

    raw_code = str(payload.get("item_code") or "").strip().upper()
    if not raw_code:
        raw_code = instance.item_code if instance else _generate_next_item_code()

    dup_qs = MaintenanceChecklistMaster.objects.filter(item_code__iexact=raw_code)
    if instance:
        dup_qs = dup_qs.exclude(id=instance.id)
    if dup_qs.exists():
        raise ValidationError({"item_code": f"Item Code '{raw_code}' already exists."})

    cat_id = payload.get("category")
    if cat_id:
        category = MaintenanceCategoryMaster.objects.filter(id=cat_id, is_active=True).first()
    else:
        category = (
            MaintenanceCategoryMaster.objects.filter(code="MACHINE", is_active=True).first()
            or MaintenanceCategoryMaster.objects.filter(is_checkable=True, is_active=True).first()
        )
    if not category:
        raise ValidationError({"category": "Valid maintenance category is required."})

    if not instance and MaintenanceChecklistMaster.objects.filter(
        category=category,
        description__iexact=activity_name,
        is_archived=False,
    ).exists():
        raise ValidationError(
            {"activity_name": f"Maintenance activity '{activity_name}' already exists in category '{category.name}'."}
        )

    raw_single_freq = str(payload.get("frequency") or "").strip().upper()
    raw_freqs = payload.get("frequencies")
    if raw_freqs is not None:
        if not isinstance(raw_freqs, list):
            raise ValidationError({"frequencies": "Invalid frequency selection format."})
        cleaned_freqs = []
        for f_code in raw_freqs:
            c = str(f_code or "").strip().upper()
            if c and c not in cleaned_freqs:
                cleaned_freqs.append(c)
        if len(cleaned_freqs) > 1:
            raise ValidationError(
                {"frequency": "Only one frequency can be configured per maintenance activity. Deselect the previous frequency before choosing another."}
            )
        if not raw_single_freq and len(cleaned_freqs) == 1:
            raw_single_freq = cleaned_freqs[0]

    if not raw_single_freq:
        raise ValidationError({"frequency": "Select one maintenance frequency (Daily, Weekly, Every 15 Days, Monthly, Quarterly, or Yearly)."})

    if raw_single_freq not in CALENDAR_FREQUENCY_BY_CODE:
        raise ValidationError(
            {
                "frequency": (
                    f"Unsupported frequency '{raw_single_freq}'. Allowed frequencies: Daily, Weekly, Every 15 Days, Monthly, Quarterly, Yearly."
                )
            }
        )

    selected_freq_code = raw_single_freq
    selected_freq_codes = [selected_freq_code]

    raw_single_sched = payload.get("frequency_schedule")
    if raw_single_sched is None and isinstance(payload.get("frequency_schedules"), dict):
        norm_map = {str(k).strip().upper(): v for k, v in payload["frequency_schedules"].items()}
        raw_single_sched = norm_map.get(selected_freq_code)

    validated_schedule = validate_and_normalize_schedule(selected_freq_code, raw_single_sched)
    validated_schedules = {selected_freq_code: validated_schedule}

    questions_enabled = bool(payload.get("questions_enabled", False))
    raw_questions = payload.get("questions") if questions_enabled else []
    if questions_enabled:
        if not isinstance(raw_questions, list) or len(raw_questions) == 0:
            raise ValidationError({"questions": "Add at least one question or set Enable Questions to No."})
        for idx, q in enumerate(raw_questions, start=1):
            if not isinstance(q, dict) or not str(q.get("question_name") or "").strip():
                raise ValidationError({"questions": f"Question Name is required for Question #{idx}."})
            a_type = str(q.get("answer_type") or "TEXT").strip().upper()
            if a_type not in VALID_ANSWER_TYPES:
                raise ValidationError({"questions": f"Invalid answer type '{a_type}' for Question #{idx}."})
            if a_type in OPTION_ANSWER_TYPES:
                opts = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
                if len(opts) == 0:
                    raise ValidationError(
                        {"questions": f"Question #{idx} ({q['question_name']}) requires at least one answer option."}
                    )

            q_label = f"Question '{q['question_name']}'"
            if bool(q.get("is_photo_required", False)):
                q_photos = q.get("photos") or []
                if not isinstance(q_photos, list) or len(q_photos) == 0:
                    raise ValidationError({"photos": f"{q_label}: Photo Required is Yes; add at least one photo."})
                _validate_photo_entries(q_photos, q_label)
            if bool(q.get("is_video_required", False)):
                q_videos = q.get("videos") or []
                if not isinstance(q_videos, list) or len(q_videos) == 0:
                    raise ValidationError({"videos": f"{q_label}: Video Required is Yes; add at least one video."})
                _validate_video_entries(q_videos, q_label)
            if bool(q.get("is_location_required", False)):
                q_locs = q.get("locations") or []
                if not isinstance(q_locs, list) or len(q_locs) == 0:
                    raise ValidationError({"locations": f"{q_label}: Location Required is Yes; configure GPS settings."})
                _validate_location_entries(q_locs, q_label)

    # Top-level unlinked evidence support (when passed directly via API)
    top_photo_req = bool(payload.get("is_photo_required", False))
    top_photos = payload.get("photos") if top_photo_req else []
    if top_photo_req and isinstance(top_photos, list) and len(top_photos) > 0:
        _validate_photo_entries(top_photos, "Activity")
    elif top_photo_req and not questions_enabled:
        raise ValidationError({"photos": "Add at least one photo requirement or select No."})

    top_video_req = bool(payload.get("is_video_required", False))
    top_videos = payload.get("videos") if top_video_req else []
    if top_video_req and isinstance(top_videos, list) and len(top_videos) > 0:
        _validate_video_entries(top_videos, "Activity")
    elif top_video_req and not questions_enabled:
        raise ValidationError({"videos": "Add at least one video requirement or select No."})

    top_loc_req = bool(payload.get("is_location_required", False))
    top_locations = payload.get("locations") if top_loc_req else []
    if top_loc_req and isinstance(top_locations, list) and len(top_locations) > 0:
        _validate_location_entries(top_locations, "Activity")

    previous_snapshot = serialize_activity_configuration(instance) if instance else None
    freq_objs = ensure_calendar_frequencies_and_roles(selected_freq_codes)
    freq_label = ", ".join(freq_objs[c].name for c in selected_freq_codes)
    is_active = bool(payload.get("is_active", True))

    if instance:
        item = instance
        item.item_code = raw_code
        item.category = category
        item.description = activity_name
        item.special_instructions = description
        item.remarks = description
        item.service_interval = freq_label
        item.is_active = is_active
        item.is_archived = False
        item.config_version = (getattr(item, "config_version", 1) or 1) + 1
        item.save()
    else:
        item = MaintenanceChecklistMaster.objects.create(
            item_code=raw_code,
            category=category,
            description=activity_name,
            special_instructions=description,
            remarks=description,
            service_interval=freq_label,
            requires_photo=False,
            requires_remarks_if_not_completed=True,
            sort_order=int(payload.get("sort_order") or 50),
            is_active=is_active,
            is_archived=False,
            config_version=1,
            created_by_id=user.id if user else None,
        )

    # 1. Sync Frequency Mappings & Schedules atomically
    selected_freq_ids = {freq_objs[c].id for c in selected_freq_codes}
    ChecklistFrequencyMapping.objects.filter(checklist_item=item).exclude(frequency_id__in=selected_freq_ids).update(
        is_active=False
    )
    ChecklistFrequencySchedule.objects.filter(checklist_item=item).exclude(frequency_id__in=selected_freq_ids).update(
        is_active=False
    )
    for idx, code in enumerate(selected_freq_codes, start=1):
        freq_obj = freq_objs[code]
        mapping_obj, _ = ChecklistFrequencyMapping.objects.update_or_create(
            checklist_item=item,
            frequency=freq_obj,
            defaults={
                "is_mandatory": True,
                "sort_order": idx * 10,
                "is_active": True,
            },
        )
        ChecklistFrequencySchedule.objects.update_or_create(
            mapping=mapping_obj,
            defaults={
                "checklist_item": item,
                "frequency": freq_obj,
                **validated_schedules[code],
            },
        )

    # Clear old relational condition rules before rebuilding cleanly
    ChecklistConditionRule.objects.filter(checklist_item=item).delete()

    # 2. First Pass: Upsert Questions & Options
    question_lookup_by_ref: dict[str, ChecklistCustomFieldConfig] = {}
    saved_questions: list[tuple[ChecklistCustomFieldConfig, dict]] = []
    if not questions_enabled:
        ChecklistCustomFieldConfig.objects.filter(checklist_item=item).delete()
        ChecklistPhotoRequirement.objects.filter(checklist_item=item, question__isnull=False).update(is_active=False, is_required=False)
        ChecklistVideoRequirement.objects.filter(checklist_item=item, question__isnull=False).update(is_active=False, is_required=False)
        ChecklistLocationRequirement.objects.filter(checklist_item=item, question__isnull=False).update(is_active=False, is_required=False)
    else:
        kept_q_ids = []
        used_field_names = set()
        for idx, q in enumerate(raw_questions, start=1):
            q_id = q.get("id")
            q_name = str(q["question_name"]).strip()
            a_type = str(q.get("answer_type") or "TEXT").strip().upper()
            opts = (
                [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
                if a_type in OPTION_ANSWER_TYPES
                else []
            )
            f_name = str(q.get("field_name") or "").strip() or _slug_field_name(q_name, idx)
            if f_name in used_field_names:
                f_name = f"{f_name[:58]}_{idx}"
            used_field_names.add(f_name)

            defaults = {
                "category": category,
                "checklist_item": item,
                "frequency": None,
                "field_name": f_name,
                "field_label": q_name,
                "field_description": str(q.get("question_description") or "").strip(),
                "field_type": a_type,
                "options": opts,
                "is_mandatory": bool(q.get("is_mandatory", False)),
                "display_order": int(q.get("display_order") or idx),
                "is_active": bool(q.get("is_active", True)),
            }

            existing_q = ChecklistCustomFieldConfig.objects.filter(id=q_id, checklist_item=item).first() if q_id else None
            if existing_q:
                for k, v in defaults.items():
                    setattr(existing_q, k, v)
                existing_q.save()
                q_obj = existing_q
            else:
                q_obj = ChecklistCustomFieldConfig.objects.create(**defaults)

            kept_q_ids.append(q_obj.id)
            ChecklistQuestionOption.objects.filter(question=q_obj).delete()
            for o_idx, opt_str in enumerate(opts, start=1):
                ChecklistQuestionOption.objects.create(
                    question=q_obj,
                    option_label=opt_str,
                    option_value=opt_str,
                    display_order=o_idx,
                    is_active=True,
                )

            if q.get("id") is not None:
                question_lookup_by_ref[str(q["id"])] = q_obj
            if q.get("temp_key"):
                question_lookup_by_ref[str(q["temp_key"])] = q_obj
            question_lookup_by_ref[str(q_obj.id)] = q_obj
            saved_questions.append((q_obj, q))

        ChecklistCustomFieldConfig.objects.filter(checklist_item=item).exclude(id__in=kept_q_ids).delete()

    # Second Pass: Validate & store Question-level conditions AND Question's nested Photos, Videos & Locations
    for q_obj, raw_q in saved_questions:
        c_mode, c_logic, c_rules = _resolve_and_validate_rules(
            raw_mode=raw_q.get("condition_mode", "ALWAYS"),
            raw_logic=raw_q.get("condition_logic", "AND"),
            raw_rules=raw_q.get("condition_rules", []),
            question_lookup_by_ref=question_lookup_by_ref,
            owner_label=f"Question '{q_obj.field_label}'",
            self_question_id=q_obj.id,
        )
        q_obj.condition_mode = c_mode
        q_obj.condition_logic = c_logic
        q_obj.condition_rules = c_rules
        q_obj.save(update_fields=["condition_mode", "condition_logic", "condition_rules", "updated_at"])
        for rule in c_rules:
            ChecklistConditionRule.objects.create(
                checklist_item=item,
                target_type=ChecklistConditionRule.TARGET_QUESTION,
                target_question=q_obj,
                source_question_id=rule["source_question_id"],
                logic_operator=c_logic,
                operator=rule["operator"],
                expected_value=rule["expected_value"],
                rule_order=rule["rule_order"],
                is_active=True,
            )

        q_photos = raw_q.get("photos") if bool(raw_q.get("is_photo_required", False)) else []
        q_videos = raw_q.get("videos") if bool(raw_q.get("is_video_required", False)) else []
        q_locs = raw_q.get("locations") if bool(raw_q.get("is_location_required", False)) else []
        _sync_evidence_batch(
            item=item,
            category=category,
            parent_question=q_obj,
            photos_list=q_photos,
            videos_list=q_videos,
            locations_list=q_locs,
            question_lookup_by_ref=question_lookup_by_ref,
        )

    # 3. Sync Top-Level unlinked Photo/Video/Location rows (backward compatibility if provided directly)
    _sync_evidence_batch(
        item=item,
        category=category,
        parent_question=None,
        photos_list=top_photos or [],
        videos_list=top_videos or [],
        locations_list=top_locations or [],
        question_lookup_by_ref=question_lookup_by_ref,
    )

    # Refresh master requires_photo strictly from active mandatory photo requirements
    item.requires_photo = ChecklistPhotoRequirement.objects.filter(
        checklist_item=item, is_active=True, is_required=True, is_mandatory=True
    ).exists()
    item.save(update_fields=["requires_photo", "updated_at"])

    updated_snapshot = serialize_activity_configuration(item)
    record_audit_log(
        entity_type="ACTIVITY_CONFIGURATION",
        entity_id=item.id,
        action="CONFIG_UPDATED" if instance else "CONFIG_CREATED",
        actor=user,
        details={"previous_value": previous_snapshot, "updated_value": updated_snapshot},
        request=request,
    )
    return updated_snapshot
