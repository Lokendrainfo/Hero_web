import math
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.common.exceptions import ConflictError, UnprocessableEntityError
from apps.hero_integration.permissions import get_primary_pm_role, user_can_access_frequency
from apps.hero_integration.services import (
    extract_assigned_operator,
    get_authorized_machine_or_403,
    get_machine_assignment_info,
)

from apps.maintenance.models import (
    ChecklistCustomFieldConfig,
    ChecklistFrequencyMapping,
    ChecklistFrequencySchedule,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistVideoRequirement,
    MaintenanceChecklistMaster,
    MaintenanceChecklistResponse,
    MaintenanceFrequencyMaster,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceQuestionResponse,
    MaintenanceSubmission,
    MaintenanceVideoAttachment,
)
from .audit_service import record_audit_log
from .condition_service import evaluate_activity_visibility
from .geofence_service import evaluate_geofence
from .photo_service import validate_and_store_photo
from .schedule_service import evaluate_scheduled_cycle, serialize_schedule
from .video_service import validate_and_store_video


def extract_submission_payload(request) -> dict:
    """
    Safely extracts scalar/JSON payload fields from DRF `request.data` without
    deep-copying `TemporaryUploadedFile` (`BufferedRandom`) instances in multipart QueryDicts.
    """
    import json
    from django.http import QueryDict

    if isinstance(request.data, QueryDict):
        payload = {
            key: request.data.get(key)
            for key in request.data.keys()
            if key not in request.FILES and not hasattr(request.data.get(key), 'read')
        }
    else:
        payload = dict(request.data) if isinstance(request.data, dict) else {}

    for json_field in ('responses', 'gps', 'gps_info', 'gps_information', 'submission_metadata'):
        if isinstance(payload.get(json_field), str) and payload[json_field].strip():
            try:
                payload[json_field] = json.loads(payload[json_field])
            except json.JSONDecodeError:
                raise ValidationError({json_field: f"Invalid JSON format in '{json_field}' field."})
    return payload


def _parse_hour_meter(raw_value) -> Decimal:
    if raw_value is None or str(raw_value).strip() == '':
        raise ValidationError({"hour_meter_reading": "Machine hour-meter reading is required."})
    try:
        val = Decimal(str(raw_value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise ValidationError({"hour_meter_reading": "Hour-meter reading must be a valid number."})
    if val < 0:
        raise ValidationError({"hour_meter_reading": "Hour-meter reading cannot be negative."})
    return val.quantize(Decimal('0.01'))


def _extract_submitted_item_ids(raw_responses) -> list[int]:
    if not isinstance(raw_responses, list):
        return []
    ids = []
    seen = set()
    for r in raw_responses:
        if not isinstance(r, dict):
            continue
        cid = r.get('checklist_item_id') or r.get('item_id')
        if cid is None:
            continue
        try:
            cid_int = int(cid)
        except (TypeError, ValueError):
            continue
        if cid_int not in seen:
            seen.add(cid_int)
            ids.append(cid_int)
    return ids


def _check_duplicate_submission(
    machine,
    freq,
    hour_meter: Decimal,
    client_request_id: str | None,
    user,
    request,
    submitted_item_ids: list[int] | None = None,
):
    if client_request_id:
        existing_req = MaintenanceSubmission.objects.filter(client_request_id=client_request_id).first()
        if existing_req:
            record_audit_log(
                entity_type='SUBMISSION',
                entity_id=existing_req.id,
                action='DUPLICATE_BLOCKED',
                actor=user,
                machine_id=machine.id,
                frequency_code=freq.code,
                details={"reason": "Duplicate client_request_id", "client_request_id": client_request_id},
                request=request,
            )
            raise ConflictError(
                f"Duplicate submission blocked (request already processed as {existing_req.submission_number})."
            )

    today = timezone.localdate()
    active_non_rejected = MaintenanceSubmission.objects.filter(
        machine_id=machine.id,
        frequency=freq,
    ).exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED).order_by('-submitted_at', '-id')

    all_scheds = list(
        ChecklistFrequencySchedule.objects.select_related('checklist_item')
        .filter(
            frequency=freq,
            is_active=True,
            checklist_item__is_active=True,
            checklist_item__is_archived=False,
            checklist_item__category__is_active=True,
            checklist_item__category__is_checkable=True,
        )
    )
    sched_by_item_id = {s.checklist_item_id: s for s in all_scheds}
    custom_scheds = [
        s for s in all_scheds
        if s.schedule_type != ChecklistFrequencySchedule.SCHED_DEFAULT
    ]

    latest_sub = active_non_rejected.first()
    latest_complete = (
        latest_sub
        if (latest_sub and latest_sub.status == MaintenanceSubmission.STATUS_COMPLETED)
        else active_non_rejected.filter(status=MaintenanceSubmission.STATUS_COMPLETED).first()
    )

    sched_context = {"scheduled_due_date": None, "completion_deadline_date": None, "schedule_snapshot": {}}
    sched_eval = None
    if custom_scheds:
        sched_eval = evaluate_scheduled_cycle(
            freq=freq,
            schedules=custom_scheds,
            latest_completed_sub=latest_complete,
            today=today,
            latest_any_sub=latest_sub,
        )
        occ_str = sched_eval.get("current_occurrence_date") if sched_eval else None
        occ_date = parse_date(occ_str) if occ_str else None
        deadline_str = sched_eval.get("completion_deadline_date") if sched_eval else None
        deadline_date = occ_date if freq.code == 'DAILY' else (parse_date(deadline_str) if deadline_str else occ_date)
        sched_context = {
            "scheduled_due_date": occ_date,
            "completion_deadline_date": deadline_date,
            "schedule_snapshot": {
                "frequency": freq.code,
                "buffer_days": 0 if freq.code == 'DAILY' else int(sched_eval.get("buffer_days", 0) if sched_eval else 0),
                "scheduled_date": occ_str,
                "completion_deadline_date": deadline_date.isoformat() if deadline_date else occ_str,
                "schedules": [serialize_schedule(s) for s in custom_scheds],
                "evaluation": sched_eval,
            },
        }

    # Per-activity enforcement: allow only 1 submission per machine, activity, and scheduled occurrence
    # unless allow_duplicate_in_same_slot is explicitly enabled on that activity's schedule.
    target_item_ids = list(submitted_item_ids or [])
    if target_item_ids:
        for cid in target_item_ids:
            item_sched = sched_by_item_id.get(cid)
            item_allow_dup = bool(item_sched.allow_duplicate_in_same_slot) if item_sched else False
            if item_allow_dup:
                continue

            if item_sched and item_sched.schedule_type != ChecklistFrequencySchedule.SCHED_DEFAULT:
                item_eval = evaluate_scheduled_cycle(
                    freq=freq,
                    schedules=[item_sched],
                    latest_completed_sub=latest_complete,
                    today=today,
                    latest_any_sub=latest_sub,
                )
                item_occ_str = item_eval.get("current_occurrence_date") if item_eval else None
                item_occ_date = (parse_date(item_occ_str) if item_occ_str else None) or today
                slot_q = Q(submission__scheduled_due_date=item_occ_date) | Q(submission__submission_date__gte=item_occ_date)
            else:
                item_occ_date = today
                slot_q = Q(submission__submission_date=today)

            existing_resp = (
                MaintenanceChecklistResponse.objects.select_related('submission', 'checklist_item')
                .filter(
                    submission__machine_id=machine.id,
                    submission__frequency=freq,
                    checklist_item_id=cid,
                )
                .exclude(submission__approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
                .filter(slot_q)
                .order_by('-submission__submitted_at', '-id')
                .first()
            )
            if existing_resp:
                occ_label = item_occ_date.isoformat()
                existing_num = existing_resp.submission.submission_number
                activity_name = existing_resp.checklist_item.description
                record_audit_log(
                    entity_type='SUBMISSION',
                    entity_id=existing_resp.submission_id,
                    action='DUPLICATE_BLOCKED',
                    actor=user,
                    machine_id=machine.id,
                    frequency_code=freq.code,
                    details={
                        "reason": "Duplicate submission blocked for same machine, activity, and scheduled occurrence",
                        "checklist_item_id": cid,
                        "occurrence_date": occ_label,
                        "existing": existing_num,
                    },
                    request=request,
                )
                raise ConflictError(
                    f"Duplicate submission rejected: '{activity_name}' ({freq.name}) for machine {machine.code} "
                    f"has already been completed for scheduled occurrence {occ_label} ({existing_num}). "
                    f"Multiple completions in the same scheduled window are disabled."
                )
        return sched_context

    if custom_scheds and sched_eval and sched_eval.get("already_completed_for_occurrence"):
        occ_str = sched_eval.get("current_occurrence_date") or today.isoformat()
        existing_num = sched_eval.get("existing_submission_number") or (latest_sub.submission_number if latest_sub else "")
        record_audit_log(
            entity_type='SUBMISSION',
            entity_id=latest_sub.id if latest_sub else None,
            action='DUPLICATE_BLOCKED',
            actor=user,
            machine_id=machine.id,
            frequency_code=freq.code,
            details={
                "reason": "Duplicate submission blocked for same scheduled occurrence",
                "occurrence_date": occ_str,
                "existing": existing_num,
            },
            request=request,
        )
        raise ConflictError(
            f"{freq.name} maintenance for machine {machine.code} has already been completed "
            f"for the current scheduled occurrence ({occ_str}) ({existing_num})."
        )

    if not custom_scheds:
        allow_default_dup = bool(all_scheds) and all(bool(s.allow_duplicate_in_same_slot) for s in all_scheds)
        if not allow_default_dup:
            existing_today = active_non_rejected.filter(submission_date=today).first()
            if existing_today:
                record_audit_log(
                    entity_type='SUBMISSION',
                    entity_id=existing_today.id,
                    action='DUPLICATE_BLOCKED',
                    actor=user,
                    machine_id=machine.id,
                    frequency_code=freq.code,
                    details={
                        "reason": "Maintenance already submitted today for this machine and frequency",
                        "existing": existing_today.submission_number,
                    },
                    request=request,
                )
                raise ConflictError(
                    f"{freq.name} maintenance for machine {machine.code} has already been completed "
                    f"for scheduled occurrence {today.isoformat()} ({existing_today.submission_number})."
                )
    return sched_context


@transaction.atomic
def create_maintenance_submission(user, payload: dict, files_map=None, request=None) -> MaintenanceSubmission:
    """
    Validates and persists a complete preventive maintenance submission atomically.
    Enforces:
    - Role-based frequency permission
    - HERO machine authorization
    - Complete checklist coverage
    - Mandatory individual photo evidence per checklist activity (no missing, no shared/reused photos)
    - Mandatory remarks when an item is marked NOT_COMPLETED
    - Duplicate submission prevention
    - Audit trail recording
    """
    files_map = files_map or {}
    freq_code = str(payload.get('frequency') or '').strip().upper()
    if not freq_code:
        raise ValidationError({"frequency": "Maintenance frequency is required."})

    freq = MaintenanceFrequencyMaster.objects.filter(code=freq_code, is_active=True).first()
    if not freq:
        raise NotFound(f"Maintenance frequency '{freq_code}' not found.")

    # Server-side role enforcement
    if not user_can_access_frequency(user, freq.code, for_submit=True):
        record_audit_log(
            entity_type='SUBMISSION',
            entity_id='UNAUTHORIZED',
            action='PERMISSION_DENIED',
            actor=user,
            frequency_code=freq.code,
            details={"role": get_primary_pm_role(user), "attempted_frequency": freq.code},
            request=request,
        )
        raise PermissionDenied(
            f"Your role ({get_primary_pm_role(user)}) is not permitted to submit {freq.name} maintenance."
        )

    machine_id = payload.get('machine_id') or payload.get('machine')
    if not machine_id:
        raise ValidationError({"machine_id": "Machine selection is required."})
    machine = get_authorized_machine_or_403(user, machine_id)

    # Application-level referential validation against HERO User Master (`hero` DB)
    from apps.hero_integration.models import HeroUser
    if not HeroUser.objects.filter(id=user.id, is_active=True).exists():
        raise PermissionDenied("Authenticated user is missing or inactive in HERO User Master.")

    hour_meter = _parse_hour_meter(payload.get('hour_meter_reading'))
    client_request_id = (str(payload.get('client_request_id') or '').strip() or None)
    general_remarks = str(
        payload.get('general_remarks')
        or payload.get('remarks')
        or payload.get('operator_remarks')
        or ''
    ).strip()
    raise_media_http_status = bool(payload.get('_raise_media_http_status', False))

    raw_sched_date = payload.get('scheduled_maintenance_date') or payload.get('scheduled_date')
    parsed_sched_date = None
    if raw_sched_date not in (None, ''):
        parsed_sched_date = parse_date(str(raw_sched_date).strip()[:10])
        if parsed_sched_date is None:
            raise ValidationError({"scheduled_date": "scheduled_date must be a valid YYYY-MM-DD date."})

    # Optional top-level GPS payload from mobile APK
    top_gps_raw = payload.get('gps') or payload.get('gps_info') or payload.get('gps_information')
    top_gps = dict(top_gps_raw) if isinstance(top_gps_raw, dict) else {}
    for src_k, dst_k in (
        ('latitude', 'latitude'),
        ('longitude', 'longitude'),
        ('gps_accuracy', 'accuracy_meters'),
        ('accuracy_meters', 'accuracy_meters'),
        ('accuracy', 'accuracy_meters'),
        ('gps_capture_timestamp', 'captured_at'),
        ('captured_at', 'captured_at'),
    ):
        if dst_k not in top_gps and payload.get(src_k) not in (None, ''):
            top_gps[dst_k] = payload.get(src_k)

    raw_sub_meta = payload.get('submission_metadata')
    submission_metadata = dict(raw_sub_meta) if isinstance(raw_sub_meta, dict) else {}
    for meta_k, val_k in (
        ('device_id', payload.get('device_id')),
        ('application_version', payload.get('application_version') or payload.get('app_version')),
        ('submission_status', payload.get('submission_status')),
        ('client_submitted_at', payload.get('submission_datetime') or payload.get('submitted_at')),
    ):
        if val_k not in (None, ''):
            submission_metadata[meta_k] = val_k
    if parsed_sched_date:
        submission_metadata['scheduled_maintenance_date'] = parsed_sched_date.isoformat()
    if top_gps:
        submission_metadata['gps_information'] = top_gps

    raw_responses = payload.get('responses')
    submitted_item_ids = _extract_submitted_item_ids(raw_responses)
    sched_context = _check_duplicate_submission(
        machine,
        freq,
        hour_meter,
        client_request_id,
        user,
        request,
        submitted_item_ids=submitted_item_ids,
    ) or {}
    if parsed_sched_date and not sched_context.get('scheduled_due_date'):
        sched_context['scheduled_due_date'] = parsed_sched_date
        if not sched_context.get('completion_deadline_date'):
            sched_context['completion_deadline_date'] = parsed_sched_date

    required_mappings = list(
        ChecklistFrequencyMapping.objects.select_related('checklist_item', 'checklist_item__category')
        .filter(
            frequency=freq,
            is_active=True,
            checklist_item__is_active=True,
            checklist_item__is_archived=False,
            checklist_item__category__is_active=True,
        )
        .order_by('checklist_item__category__sort_order', 'sort_order', 'id')
    )
    if not required_mappings:
        raise ValidationError({"frequency": f"No active checklist activities configured for {freq.name}."})

    raw_responses = payload.get('responses')
    if not isinstance(raw_responses, list) or len(raw_responses) == 0:
        raise ValidationError({"responses": "Checklist activity responses are required."})

    response_by_item_id = {}
    for idx, r in enumerate(raw_responses):
        if not isinstance(r, dict):
            raise ValidationError({"responses": f"Invalid response item at index {idx}."})
        cid = r.get('checklist_item_id') or r.get('item_id')
        if not cid:
            raise ValidationError({"responses": f"Missing checklist_item_id at index {idx}."})
        try:
            cid_int = int(cid)
        except (TypeError, ValueError):
            raise ValidationError({"responses": f"Invalid checklist_item_id '{cid}'."})
        if cid_int in response_by_item_id:
            raise ValidationError({"responses": f"Duplicate response for checklist item {cid_int}."})
        response_by_item_id[cid_int] = r

    required_ids = {m.checklist_item_id for m in required_mappings}
    extra_ids = set(response_by_item_id.keys()) - required_ids
    if extra_ids:
        raise UnprocessableEntityError(
            {
                "responses": (
                    f"Maintenance activity ID(s) {sorted(extra_ids)} are inactive, unknown, "
                    f"or not applicable to frequency '{freq.code}'."
                )
            }
        )
    missing_ids = required_ids - set(response_by_item_id.keys())
    if missing_ids:
        missing_names = [
            m.checklist_item.description
            for m in required_mappings
            if m.checklist_item_id in missing_ids
        ]
        raise ValidationError(
            {
                "responses": (
                    f"All checklist activities must be completed before submission. "
                    f"Missing {len(missing_ids)} activity(ies): {', '.join(missing_names[:3])}"
                )
            }
        )

    validated_entries = []
    used_photo_ids = set()
    used_photo_hashes = set()
    used_video_hashes = set()
    completed_count = 0
    not_completed_count = 0

    item_ids = [m.checklist_item_id for m in required_mappings]
    freq_q = Q(frequency=freq) | Q(frequency__isnull=True)

    cf_by_item = {}
    for cf in (
        ChecklistCustomFieldConfig.objects.select_related('section')
        .filter(checklist_item_id__in=item_ids, is_active=True)
        .filter(Q(section__isnull=True) | Q(section__is_active=True))
        .prefetch_related('option_rows')
        .filter(freq_q)
        .order_by('section__display_order', 'display_order', 'id')
    ):
        cf_by_item.setdefault(cf.checklist_item_id, []).append(cf)

    active_q_parent_filter = Q(question__isnull=True) | (
        Q(question__is_active=True) & (Q(question__section__isnull=True) | Q(question__section__is_active=True))
    )

    photo_reqs_by_item = {}
    for pr in (
        ChecklistPhotoRequirement.objects.filter(checklist_item_id__in=item_ids, is_active=True, is_required=True)
        .filter(active_q_parent_filter)
        .filter(freq_q)
        .order_by('display_order', 'id')
    ):
        photo_reqs_by_item.setdefault(pr.checklist_item_id, []).append(pr)

    video_reqs_by_item = {}
    for vr in (
        ChecklistVideoRequirement.objects.filter(checklist_item_id__in=item_ids, is_active=True, is_required=True)
        .filter(active_q_parent_filter)
        .filter(freq_q)
        .order_by('display_order', 'id')
    ):
        video_reqs_by_item.setdefault(vr.checklist_item_id, []).append(vr)

    location_reqs_by_item = {}
    for lr in (
        ChecklistLocationRequirement.objects.filter(checklist_item_id__in=item_ids, is_active=True, is_required=True)
        .filter(active_q_parent_filter)
        .filter(freq_q)
        .order_by('display_order', 'id')
    ):
        location_reqs_by_item.setdefault(lr.checklist_item_id, []).append(lr)

    def _get_files_for_key(key_name: str) -> list:
        if hasattr(files_map, 'getlist'):
            return [f for f in files_map.getlist(key_name) if f is not None]
        val = files_map.get(key_name)
        if isinstance(val, list):
            return [f for f in val if f is not None]
        return [val] if val is not None else []

    def _validate_preuploaded_photo(pid_raw, ci_obj, req_obj=None) -> MaintenancePhotoAttachment:
        try:
            pid = int(pid_raw)
        except (TypeError, ValueError):
            raise ValidationError({"photos": f"Invalid photo_id '{pid_raw}' for '{ci_obj.description}'."})

        if pid in used_photo_ids:
            raise ValidationError(
                {
                    "photos": (
                        f"Duplicate photo_id {pid} detected for '{ci_obj.description}'. "
                        "One photograph cannot be reused for multiple checklist activities."
                    )
                }
            )

        photo_obj = (
            MaintenancePhotoAttachment.objects.defer('photo_data')
            .select_for_update()
            .filter(id=pid)
            .first()
        )
        if not photo_obj:
            raise ValidationError({"photos": f"Photo #{pid} for '{ci_obj.description}' was not found."})
        if photo_obj.is_bound or photo_obj.response_id is not None:
            raise ValidationError({"photos": f"Photo #{pid} is already bound to another maintenance activity."})
        if photo_obj.uploaded_by_id != user.id:
            raise PermissionDenied(f"Photo #{pid} does not belong to the current user.")
        if photo_obj.machine_id != machine.id:
            raise ValidationError({"photos": f"Photo #{pid} was captured for a different machine."})
        if photo_obj.checklist_item_id != ci_obj.id:
            raise ValidationError({"photos": f"Photo #{pid} belongs to a different checklist activity."})
        if photo_obj.frequency_code != freq.code:
            raise ValidationError({"photos": f"Photo #{pid} was captured for frequency {photo_obj.frequency_code}, expected {freq.code}."})
        if req_obj and not photo_obj.photo_requirement_id:
            photo_obj.photo_requirement = req_obj
            photo_obj.requirement_name = req_obj.photo_name[:120]
        return photo_obj

    def _register_photo(photo_obj: MaintenancePhotoAttachment, ci_desc: str):
        if photo_obj.sha256_hash in used_photo_hashes:
            raise ValidationError(
                {
                    "photos": (
                        f"Identical photograph detected for '{ci_desc}'. "
                        "One photograph cannot be reused as evidence for multiple checklist activities or requirements."
                    )
                }
            )
        if MaintenancePhotoAttachment.objects.filter(sha256_hash=photo_obj.sha256_hash, is_bound=True).exclude(id=photo_obj.id).exists():
            raise ValidationError(
                {
                    "photos": (
                        f"Photograph for '{ci_desc}' duplicates an existing submitted photo. "
                        "Each activity requirement needs its own unique photograph."
                    )
                }
            )
        used_photo_ids.add(photo_obj.id)
        used_photo_hashes.add(photo_obj.sha256_hash)

    for mapping in required_mappings:
        ci = mapping.checklist_item
        r_data = response_by_item_id[ci.id]
        item_status = str(r_data.get('status') or '').strip().upper()
        if item_status not in (
            MaintenanceChecklistResponse.STATUS_COMPLETED,
            MaintenanceChecklistResponse.STATUS_NOT_COMPLETED,
        ):
            raise ValidationError(
                {
                    "responses": (
                        f"Checklist item '{ci.description}' must have status COMPLETED or NOT_COMPLETED."
                    )
                }
            )

        remarks = str(r_data.get('remarks') or '').strip()
        if item_status == MaintenanceChecklistResponse.STATUS_NOT_COMPLETED and ci.requires_remarks_if_not_completed:
            if not remarks:
                raise ValidationError(
                    {
                        "responses": (
                            f"Explanatory remarks are mandatory when marking '{ci.description}' as Not Completed."
                        )
                    }
                )

        if item_status == MaintenanceChecklistResponse.STATUS_COMPLETED:
            completed_count += 1
        else:
            not_completed_count += 1

        # Reject base64 image payloads (photos must use multipart/form-data and PostgreSQL BYTEA storage)
        for bad_key in ('photo_base64', 'image_base64', 'photo_data', 'image_data'):
            if r_data.get(bad_key):
                raise ValidationError(
                    {
                        "photos": (
                            f"Base64 image field '{bad_key}' is not allowed for '{ci.description}'. "
                            "Submit camera photographs via multipart/form-data."
                        )
                    }
                )
        for text_candidate in (r_data.get('photo_url'), r_data.get('photo_field'), r_data.get('file')):
            if isinstance(text_candidate, str) and text_candidate.strip().lower().startswith('data:image/'):
                raise ValidationError(
                    {
                        "photos": (
                            f"Base64 data URL photographs are not allowed for '{ci.description}'. "
                            "Submit camera photographs via multipart/form-data."
                        )
                    }
                )

        # --- 1. Validate Dynamic Questions & Condition Visibility (Independent Server Evaluation) ---
        raw_cf = (
            r_data.get('custom_fields')
            or r_data.get('custom_field_values')
            or r_data.get('question_responses')
            or {}
        )
        cf_map = {}
        cf_input_keys = []
        if isinstance(raw_cf, dict):
            cf_map = raw_cf
            cf_input_keys = [str(k) for k in raw_cf.keys()]
        elif isinstance(raw_cf, list):
            for entry_cf in raw_cf:
                if isinstance(entry_cf, dict):
                    q_ref = entry_cf.get('question_id') if entry_cf.get('question_id') is not None else entry_cf.get('field_id')
                    q_name_ref = entry_cf.get('field_name')
                    ans_val = entry_cf.get('value')
                    if ans_val is None:
                        if 'selected_answer' in entry_cf and entry_cf.get('selected_answer') is not None:
                            ans_val = entry_cf.get('selected_answer')
                        elif 'answer' in entry_cf and entry_cf.get('answer') is not None:
                            ans_val = entry_cf.get('answer')
                        elif 'number_response' in entry_cf and entry_cf.get('number_response') is not None:
                            ans_val = entry_cf.get('number_response')
                        elif 'text_response' in entry_cf and entry_cf.get('text_response') is not None:
                            ans_val = entry_cf.get('text_response')
                    if q_ref is not None:
                        cf_map[str(q_ref)] = ans_val
                        cf_input_keys.append(str(q_ref))
                    if q_name_ref:
                        cf_map[str(q_name_ref)] = ans_val
                        if q_ref is None:
                            cf_input_keys.append(str(q_name_ref))

        all_questions = cf_by_item.get(ci.id, [])
        all_photo_reqs = photo_reqs_by_item.get(ci.id, [])
        all_video_reqs = video_reqs_by_item.get(ci.id, [])
        all_location_reqs = location_reqs_by_item.get(ci.id, [])

        # Reject unknown or inactive question IDs / keys
        valid_q_refs = set()
        for q_obj in all_questions:
            valid_q_refs.add(str(q_obj.id))
            if q_obj.field_name:
                valid_q_refs.add(str(q_obj.field_name))
        unknown_q_refs = [k for k in cf_input_keys if k not in valid_q_refs]
        if unknown_q_refs:
            raise UnprocessableEntityError(
                {
                    "custom_fields": (
                        f"Unknown or inactive question ID(s) {', '.join(unknown_q_refs)} "
                        f"for maintenance activity '{ci.description}'."
                    )
                }
            )

        (
            visible_questions,
            visible_photos,
            visible_videos,
            visible_locations,
            _effective_answers,
            _q_vis,
            _p_vis,
            _v_vis,
            _l_vis,
        ) = evaluate_activity_visibility(
            all_questions,
            all_photo_reqs,
            all_video_reqs,
            cf_map,
            location_reqs=all_location_reqs,
        )

        saved_custom_fields = []
        question_snapshots = []
        for cf in visible_questions:
            raw_val = cf_map.get(str(cf.id))
            if raw_val is None and str(cf.id) not in cf_map:
                raw_val = cf_map.get(cf.field_name)

            opt_list = [str(o) for o in (cf.options or []) if str(o).strip()]
            if not opt_list:
                opt_list = [opt.option_label for opt in cf.option_rows.all() if opt.is_active]

            is_empty = (
                raw_val is None
                or (isinstance(raw_val, str) and raw_val.strip() == '')
                or (isinstance(raw_val, list) and len(raw_val) == 0)
            )
            if cf.field_type == ChecklistCustomFieldConfig.TYPE_CHECKBOX and not opt_list:
                if cf.is_mandatory and not bool(raw_val):
                    raise ValidationError(
                        {"custom_fields": f"Mandatory question '{cf.field_label}' must be checked for '{ci.description}'."}
                    )
                clean_val = bool(raw_val)
            else:
                if cf.is_mandatory and is_empty:
                    raise ValidationError(
                        {"custom_fields": f"Mandatory question '{cf.field_label}' is required for '{ci.description}'."}
                    )
                clean_val = raw_val.strip() if isinstance(raw_val, str) else raw_val
                if not is_empty:
                    if cf.field_type == ChecklistCustomFieldConfig.TYPE_NUMBER:
                        if isinstance(clean_val, bool):
                            raise ValidationError(
                                {"custom_fields": f"Question '{cf.field_label}' for '{ci.description}' must be a valid number."}
                            )
                        try:
                            clean_val = float(clean_val)
                        except (TypeError, ValueError):
                            raise ValidationError(
                                {"custom_fields": f"Question '{cf.field_label}' for '{ci.description}' must be a valid number."}
                            )
                        if not math.isfinite(clean_val):
                            raise ValidationError(
                                {"custom_fields": f"Question '{cf.field_label}' for '{ci.description}' must be a finite number."}
                            )
                    elif cf.field_type == ChecklistCustomFieldConfig.TYPE_DATE:
                        parsed_q_date = parse_date(str(clean_val))
                        if not parsed_q_date:
                            raise ValidationError(
                                {"custom_fields": f"Question '{cf.field_label}' must be a valid date (YYYY-MM-DD)."}
                            )
                        clean_val = parsed_q_date.isoformat()
                    elif cf.field_type == ChecklistCustomFieldConfig.TYPE_TIME:
                        import re
                        if not re.match(r'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$', str(clean_val)):
                            raise ValidationError(
                                {"custom_fields": f"Question '{cf.field_label}' must be a valid time (HH:MM or HH:MM:SS)."}
                            )
                    elif cf.field_type in (ChecklistCustomFieldConfig.TYPE_DROPDOWN, ChecklistCustomFieldConfig.TYPE_RADIO):
                        if opt_list and str(clean_val) not in opt_list:
                            raise ValidationError(
                                {"custom_fields": f"Invalid option '{clean_val}' for question '{cf.field_label}'."}
                            )
                    elif cf.field_type in (ChecklistCustomFieldConfig.TYPE_MULTI_SELECT, ChecklistCustomFieldConfig.TYPE_CHECKBOX):
                        if isinstance(clean_val, str):
                            clean_val = [x.strip() for x in clean_val.split(',') if x.strip()]
                        elif isinstance(clean_val, list):
                            clean_val = [str(x).strip() for x in clean_val if str(x).strip()]
                        else:
                            raise ValidationError(
                                {"custom_fields": f"Question '{cf.field_label}' expects a list of selected options."}
                            )
                        if opt_list:
                            invalid_opts = [v for v in clean_val if v not in opt_list]
                            if invalid_opts:
                                raise ValidationError(
                                    {"custom_fields": f"Invalid option(s) {', '.join(invalid_opts)} for question '{cf.field_label}'."}
                                )
                    elif cf.field_type == ChecklistCustomFieldConfig.TYPE_YES_NO:
                        norm_yn = str(clean_val).strip().upper()
                        if norm_yn in ('YES', 'TRUE', '1'):
                            clean_val = 'Yes'
                        elif norm_yn in ('NO', 'FALSE', '0'):
                            clean_val = 'No'
                        else:
                            raise ValidationError(
                                {"custom_fields": f"Question '{cf.field_label}' must be Yes or No."}
                            )

            sec_obj = getattr(cf, 'section', None)
            sec_id = cf.section_id
            sec_name = sec_obj.section_name if sec_obj else ""
            sec_desc = sec_obj.section_description if sec_obj else ""
            sec_order = sec_obj.display_order if sec_obj else None

            saved_custom_fields.append(
                {
                    "field_id": cf.id,
                    "section_id": sec_id,
                    "section_name": sec_name,
                    "field_name": cf.field_name,
                    "field_label": cf.field_label,
                    "field_description": cf.field_description,
                    "field_type": cf.field_type,
                    "is_mandatory": cf.is_mandatory,
                    "value": clean_val,
                }
            )
            question_snapshots.append(
                {
                    "question_id": cf.id,
                    "section_id": sec_id,
                    "section_name": sec_name,
                    "section_description": sec_desc,
                    "section_display_order": sec_order,
                    "display_order": cf.display_order,
                    "question_name": cf.field_label,
                    "question_description": cf.field_description,
                    "answer_type": cf.field_type,
                    "options_snapshot": opt_list,
                    "is_mandatory": cf.is_mandatory,
                    "answer": clean_val,
                    "cf_obj": cf,
                }
            )

        # --- 2. Validate Triggered Named Photo Requirements (or fallback single photo if legacy item) ---
        item_photos = []
        photo_snapshots = []
        req_photo_ids = r_data.get('photo_ids_by_req') or {}
        active_photo_req_ids = {str(p.id) for p in all_photo_reqs}
        if isinstance(req_photo_ids, dict) and req_photo_ids:
            unknown_pr = [str(k) for k in req_photo_ids.keys() if str(k) not in active_photo_req_ids]
            if unknown_pr:
                raise UnprocessableEntityError(
                    {
                        "photos": (
                            f"Unknown or inactive photo configuration ID(s) {', '.join(unknown_pr)} "
                            f"for '{ci.description}'."
                        )
                    }
                )
        if files_map:
            import re as _re_media
            file_keys = list(files_map.keys()) if hasattr(files_map, 'keys') else []
            for fk in file_keys:
                m_p = _re_media.match(rf'^photo_{ci.id}_req_(\d+)$', str(fk))
                if m_p and m_p.group(1) not in active_photo_req_ids:
                    raise UnprocessableEntityError(
                        {
                            "photos": (
                                f"Unknown or inactive photo configuration ID {m_p.group(1)} "
                                f"for '{ci.description}'."
                            )
                        }
                    )

        if all_photo_reqs:
            for pr in visible_photos:
                pid_for_req = req_photo_ids.get(str(pr.id))
                if not pid_for_req and len(visible_photos) == 1:
                    pid_for_req = r_data.get('photo_id')

                inline_for_req = (
                    _get_files_for_key(f"photo_{ci.id}_req_{pr.id}")
                    or _get_files_for_key(f"photo_req_{pr.id}")
                )
                inline_file = inline_for_req[0] if inline_for_req else None
                if not inline_file and len(visible_photos) == 1:
                    fallback_list = _get_files_for_key(f"photo_{ci.id}") or _get_files_for_key(f"photo_{ci.item_code}")
                    inline_file = fallback_list[0] if fallback_list else (
                        r_data.get('file') if hasattr(r_data.get('file'), 'read') else None
                    )

                must_provide = bool(pr.is_required and pr.is_mandatory)
                captured_flag = bool(pid_for_req or inline_file)
                trigger_snapshot = {
                    "condition_mode": pr.condition_mode,
                    "condition_logic": pr.condition_logic,
                    "condition_rules": pr.condition_rules or [],
                }
                if not captured_flag:
                    if must_provide:
                        raise ValidationError(
                            {
                                "photos": (
                                    f"Mandatory photo '{pr.photo_name}' is missing for checklist activity '{ci.description}'."
                                )
                            }
                        )
                    photo_snapshots.append(
                        {
                            "requirement_id": pr.id,
                            "question_id": pr.question_id,
                            "photo_name": pr.photo_name,
                            "photo_description": pr.photo_description,
                            "is_mandatory": pr.is_mandatory,
                            "trigger_condition_snapshot": trigger_snapshot,
                            "captured": False,
                            "captured_media_reference": None,
                        }
                    )
                    continue

                photo_lat = r_data.get('latitude') if r_data.get('latitude') is not None else top_gps.get('latitude')
                photo_lon = r_data.get('longitude') if r_data.get('longitude') is not None else top_gps.get('longitude')
                photo_acc = (
                    r_data.get('gps_accuracy')
                    if r_data.get('gps_accuracy') is not None
                    else (r_data.get('accuracy_meters') if r_data.get('accuracy_meters') is not None else top_gps.get('accuracy_meters'))
                )

                if pid_for_req:
                    p_obj = _validate_preuploaded_photo(pid_for_req, ci, req_obj=pr)
                else:
                    p_obj = validate_and_store_photo(
                        file_obj=inline_file,
                        machine=machine,
                        checklist_item=ci,
                        frequency_code=freq.code,
                        user=user,
                        photo_requirement=pr,
                        requirement_name=pr.photo_name,
                        requirement_description=pr.photo_description or '',
                        captured_at=r_data.get('captured_at') or top_gps.get('captured_at'),
                        latitude=photo_lat,
                        longitude=photo_lon,
                        accuracy_meters=photo_acc,
                        capture_source=r_data.get('capture_source') or payload.get('capture_source'),
                        require_explicit_camera=bool(payload.get('_require_explicit_camera', False)),
                        raise_media_http_status=raise_media_http_status,
                        request=request,
                    )
                p_obj.question_id = pr.question_id
                p_obj.requirement_name = pr.photo_name[:120]
                p_obj.requirement_description = pr.photo_description or ''
                p_obj.is_mandatory_snapshot = bool(pr.is_mandatory)
                _register_photo(p_obj, f"{ci.description} ({pr.photo_name})")
                item_photos.append(p_obj)
                photo_snapshots.append(
                    {
                        "requirement_id": pr.id,
                        "question_id": pr.question_id,
                        "photo_name": pr.photo_name,
                        "photo_description": pr.photo_description,
                        "is_mandatory": pr.is_mandatory,
                        "trigger_condition_snapshot": trigger_snapshot,
                        "captured": True,
                        "captured_media_reference": {
                            "photo_id": p_obj.id,
                            "photo_url": f"/api/v1/machine-maintenance/photos/{p_obj.id}",
                            "sha256_hash": p_obj.sha256_hash,
                        },
                    }
                )
        else:
            photo_id = r_data.get('photo_id')
            inline_list = _get_files_for_key(f"photo_{ci.id}") or _get_files_for_key(f"photo_{ci.item_code}")
            inline_file = inline_list[0] if inline_list else (
                r_data.get('file') if hasattr(r_data.get('file'), 'read') else None
            )

            if not photo_id and not inline_file:
                if ci.requires_photo:
                    raise ValidationError(
                        {
                            "photos": (
                                f"Photo evidence is mandatory for checklist activity '{ci.description}'. "
                                f"Cannot mark as {item_status.replace('_', ' ').title()} without its own photograph."
                            )
                        }
                    )
            else:
                photo_lat = r_data.get('latitude') if r_data.get('latitude') is not None else top_gps.get('latitude')
                photo_lon = r_data.get('longitude') if r_data.get('longitude') is not None else top_gps.get('longitude')
                photo_acc = (
                    r_data.get('gps_accuracy')
                    if r_data.get('gps_accuracy') is not None
                    else (r_data.get('accuracy_meters') if r_data.get('accuracy_meters') is not None else top_gps.get('accuracy_meters'))
                )
                if photo_id:
                    p_obj = _validate_preuploaded_photo(photo_id, ci)
                else:
                    p_obj = validate_and_store_photo(
                        file_obj=inline_file,
                        machine=machine,
                        checklist_item=ci,
                        frequency_code=freq.code,
                        user=user,
                        captured_at=r_data.get('captured_at') or top_gps.get('captured_at'),
                        latitude=photo_lat,
                        longitude=photo_lon,
                        accuracy_meters=photo_acc,
                        capture_source=r_data.get('capture_source') or payload.get('capture_source'),
                        require_explicit_camera=bool(payload.get('_require_explicit_camera', False)),
                        raise_media_http_status=raise_media_http_status,
                        request=request,
                    )
                p_obj.is_mandatory_snapshot = bool(ci.requires_photo)
                _register_photo(p_obj, ci.description)
                item_photos.append(p_obj)

        # --- 3. Validate Triggered Named Video Requirements ---
        item_videos = []
        video_snapshots = []
        video_durations = r_data.get('video_durations') or {}
        active_video_req_ids = {str(v.id) for v in all_video_reqs}
        if isinstance(video_durations, dict) and video_durations:
            unknown_vr = [str(k) for k in video_durations.keys() if str(k) not in active_video_req_ids]
            if unknown_vr:
                raise UnprocessableEntityError(
                    {
                        "videos": (
                            f"Unknown or inactive video configuration ID(s) {', '.join(unknown_vr)} "
                            f"for '{ci.description}'."
                        )
                    }
                )
        if files_map:
            import re as _re_vid
            file_keys = list(files_map.keys()) if hasattr(files_map, 'keys') else []
            for fk in file_keys:
                m_v = _re_vid.match(rf'^video_{ci.id}_req_(\d+)(?:_\d+)?$', str(fk))
                if m_v and m_v.group(1) not in active_video_req_ids:
                    raise UnprocessableEntityError(
                        {
                            "videos": (
                                f"Unknown or inactive video configuration ID {m_v.group(1)} "
                                f"for '{ci.description}'."
                            )
                        }
                    )
        for vr in visible_videos:
            uploaded_videos = (
                _get_files_for_key(f"video_{ci.id}_req_{vr.id}")
                + _get_files_for_key(f"video_req_{vr.id}")
            )
            for idx_v in range(max(vr.max_videos, 10)):
                uploaded_videos.extend(_get_files_for_key(f"video_{ci.id}_req_{vr.id}_{idx_v}"))

            must_provide_vid = bool(vr.is_required and vr.is_mandatory)
            min_needed = max(1, vr.min_videos) if must_provide_vid else 0
            if len(uploaded_videos) < min_needed:
                raise ValidationError(
                    {
                        "videos": (
                            f"Mandatory video '{vr.video_name}' requires at least {min_needed} video(s) "
                            f"for '{ci.description}'."
                        )
                    }
                )
            if len(uploaded_videos) > vr.max_videos:
                raise ValidationError(
                    {
                        "videos": (
                            f"Video '{vr.video_name}' allows a maximum of {vr.max_videos} video(s) "
                            f"for '{ci.description}'."
                        )
                    }
                )

            req_durs = video_durations.get(str(vr.id), [])
            if not isinstance(req_durs, list):
                req_durs = [req_durs]

            vid_lat = r_data.get('latitude') if r_data.get('latitude') is not None else top_gps.get('latitude')
            vid_lon = r_data.get('longitude') if r_data.get('longitude') is not None else top_gps.get('longitude')
            vid_acc = (
                r_data.get('gps_accuracy')
                if r_data.get('gps_accuracy') is not None
                else (r_data.get('accuracy_meters') if r_data.get('accuracy_meters') is not None else top_gps.get('accuracy_meters'))
            )

            saved_vid_refs = []
            for v_idx, v_file in enumerate(uploaded_videos):
                dur_val = req_durs[v_idx] if v_idx < len(req_durs) else None
                vid_obj = validate_and_store_video(
                    file_obj=v_file,
                    machine=machine,
                    checklist_item=ci,
                    frequency_code=freq.code,
                    user=user,
                    video_requirement=vr,
                    requirement_name=vr.video_name,
                    requirement_description=vr.video_description or '',
                    duration_seconds=dur_val,
                    captured_at=r_data.get('captured_at') or top_gps.get('captured_at'),
                    latitude=vid_lat,
                    longitude=vid_lon,
                    accuracy_meters=vid_acc,
                    capture_source=r_data.get('capture_source') or payload.get('capture_source'),
                    require_explicit_camera=bool(payload.get('_require_explicit_camera', False)),
                    raise_media_http_status=raise_media_http_status,
                    request=request,
                )
                vid_obj.question_id = vr.question_id
                vid_obj.requirement_description = vr.video_description or ''
                vid_obj.is_mandatory_snapshot = bool(vr.is_mandatory)
                if vid_obj.sha256_hash in used_video_hashes:
                    raise ValidationError(
                        {"videos": f"Duplicate video detected for '{ci.description}' ({vr.video_name})."}
                    )
                if MaintenanceVideoAttachment.objects.filter(sha256_hash=vid_obj.sha256_hash, is_bound=True).exclude(id=vid_obj.id).exists():
                    raise ValidationError(
                        {"videos": f"Video for '{ci.description}' ({vr.video_name}) was already used."}
                    )
                used_video_hashes.add(vid_obj.sha256_hash)
                item_videos.append(vid_obj)
                saved_vid_refs.append(
                    {
                        "video_id": vid_obj.id,
                        "video_url": f"/api/v1/machine-maintenance/videos/{vid_obj.id}",
                        "sha256_hash": vid_obj.sha256_hash,
                        "duration_seconds": vid_obj.duration_seconds,
                    }
                )

            video_snapshots.append(
                {
                    "requirement_id": vr.id,
                    "question_id": vr.question_id,
                    "video_name": vr.video_name,
                    "video_description": vr.video_description,
                    "is_mandatory": vr.is_mandatory,
                    "max_duration_seconds": vr.max_duration_seconds,
                    "min_videos": vr.min_videos,
                    "max_videos": vr.max_videos,
                    "trigger_condition_snapshot": {
                        "condition_mode": vr.condition_mode,
                        "condition_logic": vr.condition_logic,
                        "condition_rules": vr.condition_rules or [],
                    },
                    "recorded_count": len(uploaded_videos),
                    "captured_media_references": saved_vid_refs,
                }
            )

        # --- 4. Validate Triggered GPS / Location Requirements ---
        item_locations = []
        location_snapshots = []
        raw_locs_input = r_data.get('locations') or r_data.get('location_captures') or {}
        loc_map = {}
        if isinstance(raw_locs_input, dict):
            for k, v in raw_locs_input.items():
                if isinstance(v, dict):
                    loc_map[str(k)] = v
        elif isinstance(raw_locs_input, list):
            for entry_l in raw_locs_input:
                if isinstance(entry_l, dict):
                    lid = entry_l.get('location_requirement_id') or entry_l.get('requirement_id') or entry_l.get('id')
                    if lid is not None:
                        loc_map[str(lid)] = entry_l

        if loc_map:
            active_loc_req_ids = {str(l.id) for l in all_location_reqs}
            unknown_lr = [str(k) for k in loc_map.keys() if str(k) not in active_loc_req_ids]
            if unknown_lr:
                raise UnprocessableEntityError(
                    {
                        "locations": (
                            f"Unknown or inactive GPS location configuration ID(s) {', '.join(unknown_lr)} "
                            f"for '{ci.description}'."
                        )
                    }
                )

        for lr in visible_locations:
            loc_entry = loc_map.get(str(lr.id)) or top_gps or {}
            lat_raw = loc_entry.get('latitude')
            lon_raw = loc_entry.get('longitude')
            acc_raw = loc_entry.get('accuracy_meters') if loc_entry.get('accuracy_meters') is not None else loc_entry.get('gps_accuracy')
            ts_raw = loc_entry.get('captured_at')

            lat_val = None
            lon_val = None
            acc_val = None

            if lat_raw not in (None, ''):
                try:
                    lat_val = float(lat_raw)
                except (TypeError, ValueError):
                    raise ValidationError({"locations": f"Invalid GPS latitude for '{lr.location_name}'."})
                if lat_val < -90.0 or lat_val > 90.0:
                    raise ValidationError({"locations": f"GPS latitude out of range (-90 to 90) for '{lr.location_name}'."})

            if lon_raw not in (None, ''):
                try:
                    lon_val = float(lon_raw)
                except (TypeError, ValueError):
                    raise ValidationError({"locations": f"Invalid GPS longitude for '{lr.location_name}'."})
                if lon_val < -180.0 or lon_val > 180.0:
                    raise ValidationError({"locations": f"GPS longitude out of range (-180 to 180) for '{lr.location_name}'."})

            if acc_raw not in (None, ''):
                try:
                    acc_val = float(acc_raw)
                except (TypeError, ValueError):
                    raise ValidationError({"locations": f"Invalid GPS accuracy for '{lr.location_name}'."})
                if acc_val < 0:
                    raise ValidationError({"locations": f"GPS accuracy must be non-negative for '{lr.location_name}'."})

            need_lat = bool(lr.capture_latitude)
            need_lon = bool(lr.capture_longitude)
            coords_provided = (
                (not need_lat or lat_val is not None)
                and (not need_lon or lon_val is not None)
                and (lat_val is not None or lon_val is not None)
            )
            must_provide_loc = bool(lr.is_required and lr.is_mandatory)
            if not coords_provided:
                if must_provide_loc:
                    raise ValidationError(
                        {
                            "locations": (
                                f"Mandatory GPS location '{lr.location_name}' is missing for checklist activity '{ci.description}'."
                            )
                        }
                    )
                location_snapshots.append(
                    {
                        "requirement_id": lr.id,
                        "question_id": lr.question_id,
                        "location_name": lr.location_name,
                        "location_description": lr.location_description,
                        "capture_rule": lr.capture_rule,
                        "accuracy_threshold_meters": lr.accuracy_threshold_meters,
                        "is_mandatory": lr.is_mandatory,
                        "captured": False,
                    }
                )
                continue

            if lr.accuracy_threshold_meters is not None and acc_val is not None and acc_val > float(lr.accuracy_threshold_meters):
                if must_provide_loc:
                    raise ValidationError(
                        {
                            "locations": (
                                f"GPS accuracy (±{acc_val:.1f}m) exceeds maximum threshold of ±{lr.accuracy_threshold_meters}m "
                                f"for '{lr.location_name}'."
                            )
                        }
                    )

            geo_eval = evaluate_geofence(lr, lat_val, lon_val)
            if geo_eval["geofence_required"] and not geo_eval["is_inside"] and must_provide_loc:
                raise ValidationError({"locations": geo_eval["message"]})

            captured_dt = timezone.now()
            if lr.capture_timestamp and ts_raw:
                parsed_dt = parse_datetime(str(ts_raw))
                if parsed_dt is not None:
                    if timezone.is_naive(parsed_dt):
                        parsed_dt = timezone.make_aware(parsed_dt, timezone.get_current_timezone())
                    captured_dt = parsed_dt

            item_locations.append(
                {
                    "location_requirement": lr,
                    "question_id": lr.question_id,
                    "requirement_name": lr.location_name[:120],
                    "requirement_description": lr.location_description or '',
                    "capture_rule_snapshot": lr.capture_rule or ChecklistLocationRequirement.RULE_LIVE_GPS,
                    "is_mandatory_snapshot": bool(lr.is_mandatory),
                    "latitude": lat_val if lr.capture_latitude else None,
                    "longitude": lon_val if lr.capture_longitude else None,
                    "accuracy_meters": acc_val,
                    "captured_at": captured_dt,
                    "geofence_required_snapshot": bool(geo_eval["geofence_required"]),
                    "geofence_type_snapshot": geo_eval["geofence_type"],
                    "geofence_reference_name_snapshot": geo_eval["reference_name"][:150],
                    "geofence_radius_meters_snapshot": geo_eval["radius_meters"],
                    "geofence_is_valid": geo_eval["is_inside"],
                    "geofence_distance_meters": geo_eval["distance_from_boundary_meters"],
                    "geofence_validation_message": geo_eval["message"][:255],
                }
            )
            location_snapshots.append(
                {
                    "requirement_id": lr.id,
                    "question_id": lr.question_id,
                    "location_name": lr.location_name,
                    "location_description": lr.location_description,
                    "capture_rule": lr.capture_rule,
                    "accuracy_threshold_meters": lr.accuracy_threshold_meters,
                    "is_mandatory": lr.is_mandatory,
                    "captured": True,
                    "latitude": lat_val if lr.capture_latitude else None,
                    "longitude": lon_val if lr.capture_longitude else None,
                    "accuracy_meters": acc_val,
                    "captured_at": captured_dt.isoformat(),
                    "geofence_required": bool(geo_eval["geofence_required"]),
                    "geofence_type": geo_eval["geofence_type"],
                    "geofence_reference_name": geo_eval["reference_name"],
                    "geofence_radius_meters": geo_eval["radius_meters"],
                    "geofence_is_valid": geo_eval["is_inside"],
                    "geofence_distance_meters": geo_eval["distance_from_boundary_meters"],
                    "geofence_validation_message": geo_eval["message"],
                }
            )

        sections_snap_map = {}
        for qs in question_snapshots:
            s_key = str(qs.get("section_id") or f"name:{qs.get('section_name') or 'General Inspection'}")
            bucket = sections_snap_map.setdefault(
                s_key,
                {
                    "section_id": qs.get("section_id"),
                    "section_name": qs.get("section_name") or "General Inspection",
                    "section_description": qs.get("section_description") or "",
                    "display_order": qs.get("section_display_order") or (len(sections_snap_map) + 1),
                    "questions": [],
                },
            )
            bucket["questions"].append({k: v for k, v in qs.items() if k != "cf_obj"})

        validated_entries.append(
            {
                "checklist_item": ci,
                "status": item_status,
                "remarks": remarks,
                "custom_field_values": saved_custom_fields,
                "sections_snapshot": list(sections_snap_map.values()),
                "question_snapshots": question_snapshots,
                "photo_snapshots": photo_snapshots,
                "video_snapshots": video_snapshots,
                "location_snapshots": location_snapshots,
                "photos": item_photos,
                "videos": item_videos,
                "locations": item_locations,
                "responded_at": (item_photos[0].captured_at if item_photos else timezone.now()),
            }
        )

    assignment_snapshot = get_machine_assignment_info(machine)
    overall_status = (
        MaintenanceSubmission.STATUS_COMPLETED
        if not_completed_count == 0
        else MaintenanceSubmission.STATUS_PARTIALLY_COMPLETED
    )
    machine_number = machine.machine_chassis_no or machine.code or machine.serial_number

    sched_snap = dict(sched_context.get("schedule_snapshot") or {})
    sched_snap.setdefault("frequency", freq.code)
    sched_snap.setdefault("frequency_code", freq.code)
    sched_snap.setdefault("frequency_name", freq.name)
    sched_snap["activities_snapshot"] = [
        {
            "checklist_item_id": entry["checklist_item"].id,
            "item_code": entry["checklist_item"].item_code,
            "activity_name": entry["checklist_item"].description,
        }
        for entry in validated_entries
    ]

    try:
        with transaction.atomic():
            submission = MaintenanceSubmission.objects.create(
                submission_number=MaintenanceSubmission.generate_submission_number(),
                machine_id=machine.id,
                machine_number=machine_number,
                machine_name=machine.name,
                machine_model=machine.model_name or '',
                machine_type=machine.category or '',
                vendor_id=machine.vendor_id,
                vendor_name=machine.vendor.name if machine.vendor else 'HERO Direct',
                assigned_operator=extract_assigned_operator(machine),
                machine_assignment_snapshot=assignment_snapshot,
                frequency=freq,
                hour_meter_reading=hour_meter,
                submitted_by_id=user.id,
                submitted_by_name=user.get_display_name(),
                submitted_by_role=get_primary_pm_role(user),
                status=overall_status,
                approval_status=MaintenanceSubmission.APPROVAL_PENDING,
                total_items=len(validated_entries),
                completed_items_count=completed_count,
                not_completed_items_count=not_completed_count,
                general_remarks=general_remarks,
                submission_date=timezone.localdate(),
                scheduled_due_date=sched_context.get("scheduled_due_date"),
                completion_deadline_date=sched_context.get("completion_deadline_date") or sched_context.get("scheduled_due_date"),
                schedule_snapshot=sched_snap,
                submission_metadata=submission_metadata,
                submitted_at=timezone.now(),
                client_request_id=client_request_id,
                is_locked=True,
            )
    except IntegrityError:
        existing_req = (
            MaintenanceSubmission.objects.filter(client_request_id=client_request_id).first()
            if client_request_id
            else None
        )
        if existing_req:
            raise ConflictError(
                f"Duplicate submission blocked (request already processed as {existing_req.submission_number})."
            )
        raise ConflictError(
            "Duplicate submission rejected. This maintenance request was already submitted."
        )

    for entry in validated_entries:
        ci = entry["checklist_item"]
        serializable_q_snaps = [
            {k: v for k, v in qs.items() if k != "cf_obj"}
            for qs in entry["question_snapshots"]
        ]
        resp_obj = MaintenanceChecklistResponse.objects.create(
            submission=submission,
            checklist_item=ci,
            item_code=ci.item_code,
            category_name=ci.category.name,
            description_snapshot=ci.description,
            status=entry["status"],
            remarks=entry["remarks"],
            custom_field_values=entry["custom_field_values"],
            config_version_snapshot=getattr(ci, 'config_version', 1),
            sections_snapshot=entry.get("sections_snapshot", []),
            questions_snapshot=serializable_q_snaps,
            photo_requirements_snapshot=entry["photo_snapshots"],
            video_requirements_snapshot=entry["video_snapshots"],
            location_requirements_snapshot=entry["location_snapshots"],
            responded_by_id=user.id,
            responded_at=entry["responded_at"],
        )
        for qs in entry["question_snapshots"]:
            cf_obj = qs["cf_obj"]
            q_evidence_snapshot = {
                "photos": [ps for ps in entry["photo_snapshots"] if ps.get("question_id") == cf_obj.id],
                "videos": [vs for vs in entry["video_snapshots"] if vs.get("question_id") == cf_obj.id],
                "locations": [ls for ls in entry["location_snapshots"] if ls.get("question_id") == cf_obj.id],
            }
            MaintenanceQuestionResponse.objects.create(
                submission=submission,
                response=resp_obj,
                checklist_item=ci,
                question=cf_obj,
                section=cf_obj.section,
                section_name_snapshot=qs.get("section_name", ""),
                section_description_snapshot=qs.get("section_description", ""),
                section_display_order_snapshot=qs.get("section_display_order"),
                question_name_snapshot=qs["question_name"],
                question_description_snapshot=qs["question_description"],
                answer_type_snapshot=qs["answer_type"],
                is_mandatory_snapshot=qs["is_mandatory"],
                answer_value=qs["answer"],
                evidence_snapshot=q_evidence_snapshot,
            )
        for photo_obj in entry["photos"]:
            photo_obj.submission = submission
            photo_obj.response = resp_obj
            photo_obj.is_bound = True
            photo_obj.save(
                update_fields=[
                    'submission', 'response', 'is_bound', 'photo_requirement', 'question',
                    'requirement_name', 'requirement_description', 'is_mandatory_snapshot',
                    'latitude', 'longitude', 'accuracy_meters',
                ]
            )
        for vid_obj in entry["videos"]:
            vid_obj.submission = submission
            vid_obj.response = resp_obj
            vid_obj.is_bound = True
            vid_obj.save(
                update_fields=[
                    'submission', 'response', 'is_bound', 'question', 'requirement_description',
                    'is_mandatory_snapshot', 'latitude', 'longitude', 'accuracy_meters',
                ]
            )
        for loc_data in entry["locations"]:
            MaintenanceLocationAttachment.objects.create(
                submission=submission,
                response=resp_obj,
                location_requirement=loc_data["location_requirement"],
                question_id=loc_data["question_id"],
                requirement_name=loc_data["requirement_name"],
                requirement_description=loc_data["requirement_description"],
                capture_rule_snapshot=loc_data["capture_rule_snapshot"],
                is_mandatory_snapshot=loc_data["is_mandatory_snapshot"],
                machine_id=machine.id,
                checklist_item=ci,
                captured_by_id=user.id,
                frequency_code=freq.code,
                latitude=loc_data["latitude"],
                longitude=loc_data["longitude"],
                accuracy_meters=loc_data["accuracy_meters"],
                captured_at=loc_data["captured_at"],
                geofence_required_snapshot=loc_data.get("geofence_required_snapshot", False),
                geofence_type_snapshot=loc_data.get("geofence_type_snapshot", ""),
                geofence_reference_name_snapshot=loc_data.get("geofence_reference_name_snapshot", ""),
                geofence_radius_meters_snapshot=loc_data.get("geofence_radius_meters_snapshot"),
                geofence_is_valid=loc_data.get("geofence_is_valid"),
                geofence_distance_meters=loc_data.get("geofence_distance_meters"),
                geofence_validation_message=loc_data.get("geofence_validation_message", ""),
            )

    record_audit_log(
        entity_type='SUBMISSION',
        entity_id=submission.id,
        action='SUBMISSION_CREATED',
        actor=user,
        machine_id=machine.id,
        frequency_code=freq.code,
        details={
            "submission_number": submission.submission_number,
            "hour_meter_reading": str(hour_meter),
            "status": overall_status,
            "total_items": submission.total_items,
            "completed_items_count": completed_count,
            "not_completed_items_count": not_completed_count,
        },
        request=request,
    )
    return submission

