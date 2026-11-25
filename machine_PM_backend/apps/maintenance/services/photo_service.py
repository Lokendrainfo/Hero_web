import hashlib
import os
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.hero_integration.services import get_authorized_machine_or_403
from apps.maintenance.models import MaintenancePhotoAttachment
from .audit_service import record_audit_log

ALLOWED_MIME_TYPES = {
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
}


def compute_sha256_and_validate_image(file_obj) -> tuple[str, str, int]:
    if not file_obj:
        raise ValidationError({"file": "Photo file is required."})

    max_bytes = getattr(settings, 'PM_MAX_PHOTO_SIZE_BYTES', 10 * 1024 * 1024)
    allowed_exts = getattr(settings, 'PM_ALLOWED_PHOTO_EXTENSIONS', ['jpg', 'jpeg', 'png', 'webp'])

    original_name = getattr(file_obj, 'name', 'capture.jpg') or 'capture.jpg'
    ext = os.path.splitext(original_name)[1].lower().lstrip('.')
    if ext not in allowed_exts:
        raise ValidationError(
            {"file": f"Unsupported file type '.{ext}'. Allowed types: {', '.join(allowed_exts)}."}
        )

    content_type = getattr(file_obj, 'content_type', '') or ''
    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        raise ValidationError(
            {"file": f"Unsupported image MIME type '{content_type}'. Only JPEG, PNG, and WEBP images are allowed."}
        )

    file_size = getattr(file_obj, 'size', None)
    if file_size is not None and file_size > max_bytes:
        max_mb = getattr(settings, 'PM_MAX_PHOTO_SIZE_MB', 10)
        raise ValidationError({"file": f"Photo exceeds maximum allowed size of {max_mb} MB."})

    file_obj.seek(0)
    raw_bytes = file_obj.read()
    actual_size = len(raw_bytes)
    if actual_size == 0:
        raise ValidationError({"file": "Uploaded photo file is empty."})
    if actual_size > max_bytes:
        max_mb = getattr(settings, 'PM_MAX_PHOTO_SIZE_MB', 10)
        raise ValidationError({"file": f"Photo exceeds maximum allowed size of {max_mb} MB."})

    try:
        with Image.open(BytesIO(raw_bytes)) as img:
            img.verify()
        # Re-open to inspect format cleanly
        with Image.open(BytesIO(raw_bytes)) as img_check:
            fmt = (img_check.format or '').upper()
            if fmt not in ('JPEG', 'PNG', 'WEBP'):
                raise ValidationError({"file": f"Invalid image format '{fmt}'. Only JPEG, PNG, and WEBP are supported."})
    except ValidationError:
        raise
    except (UnidentifiedImageError, Exception):
        raise ValidationError({"file": "Uploaded file is not a valid image."})

    file_obj.seek(0)
    sha256_hash = hashlib.sha256(raw_bytes).hexdigest()
    detected_mime = content_type or f"image/{'jpeg' if fmt == 'JPEG' else fmt.lower()}"
    return sha256_hash, detected_mime, actual_size


def validate_and_store_photo(
    file_obj,
    machine,
    checklist_item,
    frequency_code: str,
    user,
    captured_at=None,
    latitude=None,
    longitude=None,
    request=None,
) -> MaintenancePhotoAttachment:
    sha256_hash, detected_mime, actual_size = compute_sha256_and_validate_image(file_obj)

    # Rule 5: One photograph cannot be reused as evidence for multiple checklist activities
    already_bound = MaintenancePhotoAttachment.objects.filter(
        sha256_hash=sha256_hash,
        is_bound=True,
    ).exists()
    if already_bound:
        record_audit_log(
            entity_type='PHOTO',
            entity_id=sha256_hash[:16],
            action='DUPLICATE_PHOTO_BLOCKED',
            actor=user,
            machine_id=machine.id,
            frequency_code=frequency_code,
            details={"reason": "Photo hash already used on a submitted checklist activity", "checklist_item_id": checklist_item.id},
            request=request,
        )
        raise ValidationError(
            {
                "file": (
                    "This photograph has already been used as evidence for another maintenance activity. "
                    "Each checklist activity requires its own separate photograph."
                )
            }
        )

    staged_other = MaintenancePhotoAttachment.objects.filter(
        sha256_hash=sha256_hash,
        is_bound=False,
        uploaded_by_id=user.id,
    ).exclude(
        machine_id=machine.id,
        checklist_item=checklist_item,
        frequency_code=frequency_code,
    ).exists()
    if staged_other:
        raise ValidationError(
            {
                "file": (
                    "This photograph is already uploaded for a different checklist activity. "
                    "Please capture or upload a separate photograph for each activity."
                )
            }
        )

    parsed_captured_at = timezone.now()
    if captured_at:
        if isinstance(captured_at, str):
            dt = parse_datetime(captured_at)
            if dt:
                parsed_captured_at = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
        else:
            parsed_captured_at = captured_at

    photo = MaintenancePhotoAttachment.objects.create(
        machine_id=machine.id,
        checklist_item=checklist_item,
        uploaded_by_id=user.id,
        frequency_code=frequency_code,
        file=file_obj,
        original_filename=(getattr(file_obj, 'name', 'capture.jpg') or 'capture.jpg')[:255],
        content_type=detected_mime[:100],
        file_size=actual_size,
        sha256_hash=sha256_hash,
        is_bound=False,
        captured_at=parsed_captured_at,
        latitude=latitude,
        longitude=longitude,
    )

    record_audit_log(
        entity_type='PHOTO',
        entity_id=photo.id,
        action='PHOTO_UPLOADED',
        actor=user,
        machine_id=machine.id,
        frequency_code=frequency_code,
        details={
            "checklist_item_id": checklist_item.id,
            "item_code": checklist_item.item_code,
            "sha256_hash": sha256_hash,
            "file_size": actual_size,
        },
        request=request,
    )
    return photo


def get_authorized_photo_or_403(user, photo_id: int) -> MaintenancePhotoAttachment:
    photo = MaintenancePhotoAttachment.objects.select_related(
        'checklist_item', 'submission', 'response'
    ).filter(id=photo_id).first()
    if not photo:
        raise NotFound("Photo attachment not found.")

    # Verify machine vendor access using HERO authorization
    try:
        get_authorized_machine_or_403(user, photo.machine_id)
    except PermissionDenied:
        if photo.uploaded_by_id != user.id:
            raise PermissionDenied("You are not authorized to view this photograph.")

    return photo

