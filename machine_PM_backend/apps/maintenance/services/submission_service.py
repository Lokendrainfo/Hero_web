from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from apps.hero_integration.permissions import get_primary_pm_role, user_can_access_frequency
from apps.hero_integration.services import (
    extract_assigned_operator,
    get_authorized_machine_or_403,
    get_machine_assignment_info,
)
from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    MaintenanceChecklistMaster,
    MaintenanceChecklistResponse,
    MaintenanceFrequencyMaster,
    MaintenancePhotoAttachment,
    MaintenanceSubmission,
)
from .audit_service import record_audit_log
from .photo_service import validate_and_store_photo


class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Duplicate submission detected.'
    default_code = 'conflict'


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


def _check_duplicate_submission(machine, freq, hour_meter: Decimal, client_request_id: str | None, user, request):
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
        submission_date=today,
    ).exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)

    if freq.code == 'DAILY':
        existing_daily = active_non_rejected.first()
        if existing_daily:
            record_audit_log(
                entity_type='SUBMISSION',
                entity_id=existing_daily.id,
                action='DUPLICATE_BLOCKED',
                actor=user,
                machine_id=machine.id,
                frequency_code=freq.code,
                details={"reason": "Daily maintenance already submitted today", "existing": existing_daily.submission_number},
                request=request,
            )
            raise ConflictError(
                f"Daily maintenance for machine {machine.code} has already been submitted today ({existing_daily.submission_number})."
            )
    else:
        existing_same_meter = active_non_rejected.filter(hour_meter_reading=hour_meter).first()
        if existing_same_meter:
            record_audit_log(
                entity_type='SUBMISSION',
                entity_id=existing_same_meter.id,
                action='DUPLICATE_BLOCKED',
                actor=user,
                machine_id=machine.id,
                frequency_code=freq.code,
                details={
                    "reason": "Same machine, frequency, date, and hour-meter reading already submitted",
                    "existing": existing_same_meter.submission_number,
                    "hour_meter_reading": str(hour_meter),
                },
                request=request,
            )
            raise ConflictError(
                f"{freq.name} maintenance for machine {machine.code} at {hour_meter} hrs has already been submitted today ({existing_same_meter.submission_number})."
            )


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
    general_remarks = str(payload.get('general_remarks') or '').strip()

    _check_duplicate_submission(machine, freq, hour_meter, client_request_id, user, request)

    required_mappings = list(
        ChecklistFrequencyMapping.objects.select_related('checklist_item', 'checklist_item__category')
        .filter(
            frequency=freq,
            is_active=True,
            checklist_item__is_active=True,
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
    completed_count = 0
    not_completed_count = 0

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

        # Mandatory Individual Photo Evidence Validation
        photo_id = r_data.get('photo_id')
        inline_file = (
            files_map.get(f"photo_{ci.id}")
            or files_map.get(f"photo_{ci.item_code}")
            or (r_data.get('file') if hasattr(r_data.get('file'), 'read') else None)
        )

        if not photo_id and not inline_file:
            raise ValidationError(
                {
                    "photos": (
                        f"Photo evidence is mandatory for checklist activity '{ci.description}'. "
                        f"Cannot mark as {item_status.replace('_', ' ').title()} without its own photograph."
                    )
                }
            )

        if photo_id:
            try:
                pid = int(photo_id)
            except (TypeError, ValueError):
                raise ValidationError({"photos": f"Invalid photo_id '{photo_id}' for '{ci.description}'."})

            if pid in used_photo_ids:
                raise ValidationError(
                    {
                        "photos": (
                            f"Duplicate photo_id {pid} detected for '{ci.description}'. "
                            "One photograph cannot be reused for multiple checklist activities."
                        )
                    }
                )

            photo_obj = (
                MaintenancePhotoAttachment.objects.select_for_update()
                .filter(id=pid)
                .first()
            )
            if not photo_obj:
                raise ValidationError({"photos": f"Photo #{pid} for '{ci.description}' was not found."})
            if photo_obj.is_bound or photo_obj.response_id is not None:
                raise ValidationError(
                    {
                        "photos": (
                            f"Photo #{pid} is already bound to another maintenance activity and cannot be reused."
                        )
                    }
                )
            if photo_obj.uploaded_by_id != user.id:
                raise PermissionDenied(f"Photo #{pid} does not belong to the current user.")
            if photo_obj.machine_id != machine.id:
                raise ValidationError(
                    {"photos": f"Photo #{pid} was captured for a different machine and cannot be used here."}
                )
            if photo_obj.checklist_item_id != ci.id:
                raise ValidationError(
                    {
                        "photos": (
                            f"Photo #{pid} belongs to a different checklist activity. "
                            "Each checklist item must have its own dedicated photo."
                        )
                    }
                )
            if photo_obj.frequency_code != freq.code:
                raise ValidationError(
                    {"photos": f"Photo #{pid} was captured for frequency {photo_obj.frequency_code}, expected {freq.code}."}
                )
        else:
            photo_obj = validate_and_store_photo(
                file_obj=inline_file,
                machine=machine,
                checklist_item=ci,
                frequency_code=freq.code,
                user=user,
                captured_at=r_data.get('captured_at'),
                latitude=r_data.get('latitude'),
                longitude=r_data.get('longitude'),
                capture_source=r_data.get('capture_source') or payload.get('capture_source'),
                require_explicit_camera=bool(payload.get('_require_explicit_camera', False)),
                request=request,
            )

        if photo_obj.sha256_hash in used_photo_hashes:
            raise ValidationError(
                {
                    "photos": (
                        f"Identical photograph detected for '{ci.description}'. "
                        "One photograph cannot be reused as evidence for multiple checklist activities."
                    )
                }
            )
        if MaintenancePhotoAttachment.objects.filter(sha256_hash=photo_obj.sha256_hash, is_bound=True).exclude(id=photo_obj.id).exists():
            raise ValidationError(
                {
                    "photos": (
                        f"Photograph for '{ci.description}' duplicates an existing submitted photo. "
                        "Each checklist activity must have a unique photograph."
                    )
                }
            )

        used_photo_ids.add(photo_obj.id)
        used_photo_hashes.add(photo_obj.sha256_hash)
        validated_entries.append(
            {
                "checklist_item": ci,
                "status": item_status,
                "remarks": remarks,
                "photo": photo_obj,
                "responded_at": photo_obj.captured_at or timezone.now(),
            }
        )

    assignment_snapshot = get_machine_assignment_info(machine)
    overall_status = (
        MaintenanceSubmission.STATUS_COMPLETED
        if not_completed_count == 0
        else MaintenanceSubmission.STATUS_PARTIALLY_COMPLETED
    )
    machine_number = machine.machine_chassis_no or machine.code or machine.serial_number

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
        submitted_at=timezone.now(),
        client_request_id=client_request_id,
        is_locked=True,
    )

    for entry in validated_entries:
        ci = entry["checklist_item"]
        resp_obj = MaintenanceChecklistResponse.objects.create(
            submission=submission,
            checklist_item=ci,
            item_code=ci.item_code,
            category_name=ci.category.name,
            description_snapshot=ci.description,
            status=entry["status"],
            remarks=entry["remarks"],
            responded_by_id=user.id,
            responded_at=entry["responded_at"],
        )
        photo_obj = entry["photo"]
        photo_obj.submission = submission
        photo_obj.response = resp_obj
        photo_obj.is_bound = True
        photo_obj.save(update_fields=['submission', 'response', 'is_bound'])

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

