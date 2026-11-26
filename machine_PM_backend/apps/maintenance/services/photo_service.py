import hashlib
import os
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.common.exceptions import PayloadTooLargeError, UnsupportedMediaTypeError
from apps.hero_integration.services import get_authorized_machine_or_403
from apps.maintenance.models import MaintenancePhotoAttachment
from .audit_service import record_audit_log

ALLOWED_MIME_TYPES = {
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
}

ALLOWED_CAMERA_SOURCES = {'CAMERA', 'WEB_CAMERA', 'MOBILE_CAMERA'}


def validate_capture_source(raw_source: str | None, require_explicit: bool = False) -> str:
    norm = str(raw_source or '').strip().upper()
    if not norm:
        if require_explicit:
            raise ValidationError(
                {
                    "capture_source": (
                        "Direct device camera capture is required (capture_source='CAMERA'). "
                        "General file uploads are disabled."
                    )
                }
            )
        return 'CAMERA'
    if norm not in ALLOWED_CAMERA_SOURCES:
        raise ValidationError(
            {
                "capture_source": (
                    f"Unsupported capture_source '{raw_source}'. "
                    "Gallery selection and local file uploads are disabled; photographs must be captured directly via camera."
                )
            }
        )
    return norm


def _sanitize_filename(raw_name: str | None) -> str:
    base = os.path.basename(str(raw_name or 'capture.jpg').strip()) or 'capture.jpg'
    cleaned = ''.join(ch for ch in base if ch not in '\r\n"\\/;')
    return (cleaned or 'capture.jpg')[:255]


def _encode_resized_image(img: Image.Image, fmt: str, max_dim: int, quality: int) -> tuple[bytes, str]:
    img = ImageOps.exif_transpose(img)
    if max(img.size) > max_dim:
        resampling = getattr(Image, 'Resampling', Image).LANCZOS
        img.thumbnail((max_dim, max_dim), resampling)

    out = BytesIO()
    norm_fmt = fmt.upper()
    if norm_fmt in ('JPG', 'JPEG'):
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        img.save(out, format='JPEG', quality=quality, optimize=True)
        return out.getvalue(), 'image/jpeg'
    if norm_fmt == 'WEBP':
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
        img.save(out, format='WEBP', quality=quality, method=4)
        return out.getvalue(), 'image/webp'

    # PNG fallback
    if img.mode == 'P':
        img = img.convert('RGBA')
    img.save(out, format='PNG', optimize=True, compress_level=9)
    return out.getvalue(), 'image/png'


def compute_sha256_and_validate_image(file_obj, raise_media_http_status: bool = False) -> tuple[bytes, str, str, int, str]:
    if not file_obj:
        raise ValidationError({"file": "Photo file is required."})

    max_bytes = getattr(settings, 'PM_MAX_PHOTO_SIZE_BYTES', 10 * 1024 * 1024)
    max_mb = getattr(settings, 'PM_MAX_PHOTO_SIZE_MB', 10)
    max_dim = getattr(settings, 'PM_PHOTO_MAX_DIMENSION', 1600)
    jpeg_quality = getattr(settings, 'PM_PHOTO_JPEG_QUALITY', 82)
    allowed_exts = getattr(settings, 'PM_ALLOWED_PHOTO_EXTENSIONS', ['jpg', 'jpeg', 'png', 'webp'])

    safe_name = _sanitize_filename(getattr(file_obj, 'name', 'capture.jpg'))
    ext = os.path.splitext(safe_name)[1].lower().lstrip('.')
    if ext not in allowed_exts:
        exc_cls = UnsupportedMediaTypeError if raise_media_http_status else ValidationError
        raise exc_cls(
            {"file": f"Unsupported file type '.{ext}'. Allowed types: {', '.join(allowed_exts)}."}
        )

    content_type = getattr(file_obj, 'content_type', '') or ''
    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        exc_cls = UnsupportedMediaTypeError if raise_media_http_status else ValidationError
        raise exc_cls(
            {"file": f"Unsupported image MIME type '{content_type}'. Only JPEG, PNG, and WEBP images are allowed."}
        )

    file_size = getattr(file_obj, 'size', None)
    if file_size is not None and file_size > max_bytes:
        exc_cls = PayloadTooLargeError if raise_media_http_status else ValidationError
        raise exc_cls({"file": f"Photo exceeds maximum allowed size of {max_mb} MB."})

    file_obj.seek(0)
    raw_bytes = file_obj.read()
    raw_size = len(raw_bytes)
    if raw_size == 0:
        raise ValidationError({"file": "Uploaded photo file is empty."})
    if raw_size > max_bytes:
        exc_cls = PayloadTooLargeError if raise_media_http_status else ValidationError
        raise exc_cls({"file": f"Photo exceeds maximum allowed size of {max_mb} MB."})

    try:
        with Image.open(BytesIO(raw_bytes)) as img:
            img.verify()
        with Image.open(BytesIO(raw_bytes)) as img_check:
            fmt = (img_check.format or '').upper()
            if fmt not in ('JPEG', 'PNG', 'WEBP'):
                exc_cls = UnsupportedMediaTypeError if raise_media_http_status else ValidationError
                raise exc_cls({"file": f"Invalid image format '{fmt}'. Only JPEG, PNG, and WEBP are supported."})
            processed_bytes, detected_mime = _encode_resized_image(
                img_check,
                fmt=fmt,
                max_dim=max_dim,
                quality=jpeg_quality,
            )
    except (ValidationError, UnsupportedMediaTypeError, PayloadTooLargeError):
        raise
    except (UnidentifiedImageError, Exception):
        raise ValidationError({"file": "Uploaded file is not a valid image."})

    actual_size = len(processed_bytes)
    if actual_size == 0:
        raise ValidationError({"file": "Processed image is empty."})
    if actual_size > max_bytes:
        exc_cls = PayloadTooLargeError if raise_media_http_status else ValidationError
        raise exc_cls({"file": f"Photo exceeds maximum allowed size of {max_mb} MB."})

    sha256_hash = hashlib.sha256(processed_bytes).hexdigest()
    return processed_bytes, sha256_hash, detected_mime, actual_size, safe_name


def validate_and_store_photo(
    file_obj,
    machine,
    checklist_item,
    frequency_code: str,
    user,
    photo_requirement=None,
    requirement_name: str = '',
    requirement_description: str = '',
    captured_at=None,
    latitude=None,
    longitude=None,
    accuracy_meters=None,
    capture_source: str | None = 'CAMERA',
    require_explicit_camera: bool = False,
    raise_media_http_status: bool = False,
    request=None,
) -> MaintenancePhotoAttachment:
    validated_source = validate_capture_source(capture_source, require_explicit=require_explicit_camera)
    processed_bytes, sha256_hash, detected_mime, actual_size, safe_name = compute_sha256_and_validate_image(
        file_obj,
        raise_media_http_status=raise_media_http_status,
    )

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

    staged_other_qs = MaintenancePhotoAttachment.objects.filter(
        sha256_hash=sha256_hash,
        is_bound=False,
        uploaded_by_id=user.id,
    ).exclude(
        machine_id=machine.id,
        checklist_item=checklist_item,
        frequency_code=frequency_code,
        photo_requirement=photo_requirement,
    )
    if staged_other_qs.exists():
        raise ValidationError(
            {
                "file": (
                    "This photograph is already uploaded for a different checklist activity or requirement. "
                    "Please capture a separate photograph for each activity."
                )
            }
        )

    # Replace any previous unsaved staged capture for this exact user/machine/item/frequency/requirement
    MaintenancePhotoAttachment.objects.filter(
        is_bound=False,
        uploaded_by_id=user.id,
        machine_id=machine.id,
        checklist_item=checklist_item,
        frequency_code=frequency_code,
        photo_requirement=photo_requirement,
    ).delete()

    parsed_captured_at = timezone.now()
    if captured_at:
        if isinstance(captured_at, str):
            dt = parse_datetime(captured_at)
            if dt:
                parsed_captured_at = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
        else:
            parsed_captured_at = captured_at

    # Store image binary directly in machine_pm_db (`photo_data` BYTEA), with no local disk folder dependency.
    resolved_req_name = (
        requirement_name
        or (photo_requirement.photo_name if photo_requirement else '')
    )[:120]
    resolved_req_desc = (
        requirement_description
        or (photo_requirement.photo_description if photo_requirement else '')
    )
    photo = MaintenancePhotoAttachment.objects.create(
        machine_id=machine.id,
        checklist_item=checklist_item,
        photo_requirement=photo_requirement,
        requirement_name=resolved_req_name,
        requirement_description=resolved_req_desc,
        uploaded_by_id=user.id,
        frequency_code=frequency_code,
        photo_data=processed_bytes,
        file=None,
        original_filename=safe_name,
        content_type=detected_mime[:100],
        file_size=actual_size,
        sha256_hash=sha256_hash,
        capture_source=validated_source,
        is_bound=False,
        captured_at=parsed_captured_at,
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=accuracy_meters,
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
            "capture_source": validated_source,
            "storage": "postgresql_bytea",
        },
        request=request,
    )
    return photo


def get_authorized_photo_or_403(
    user,
    photo_id: int,
    submission_id: int | str | None = None,
) -> MaintenancePhotoAttachment:
    photo = MaintenancePhotoAttachment.objects.select_related(
        'checklist_item', 'submission', 'response', 'photo_requirement'
    ).filter(id=photo_id).first()
    if not photo:
        raise NotFound("Photo attachment not found.")

    if submission_id not in (None, ''):
        try:
            sub_id_int = int(submission_id)
        except (TypeError, ValueError):
            raise ValidationError({"submission_id": "submission_id must be a valid integer ID."})
        if photo.submission_id != sub_id_int:
            raise NotFound("Photo attachment does not belong to the requested maintenance submission.")

    # Verify machine vendor access using HERO authorization
    try:
        get_authorized_machine_or_403(user, photo.machine_id)
    except PermissionDenied:
        if photo.uploaded_by_id != user.id:
            raise PermissionDenied("You are not authorized to view this photograph.")

    return photo


def serialize_photo_metadata(photo: MaintenancePhotoAttachment) -> dict:
    photo_name = (
        photo.requirement_name
        or (photo.photo_requirement.photo_name if photo.photo_requirement else '')
        or (photo.checklist_item.description if photo.checklist_item else '')
    )
    photo_desc = (
        photo.requirement_description
        or (photo.photo_requirement.photo_description if photo.photo_requirement else '')
    )
    return {
        "photo_id": photo.id,
        "submission_id": photo.submission_id,
        "submission_number": photo.submission.submission_number if photo.submission else None,
        "machine_id": photo.machine_id,
        "maintenance_activity_id": photo.checklist_item_id,
        "item_code": photo.checklist_item.item_code if photo.checklist_item else None,
        "question_id": photo.question_id,
        "photo_configuration_id": photo.photo_requirement_id,
        "photo_name": photo_name,
        "photo_description": photo_desc,
        "capture_timestamp": photo.captured_at.isoformat() if photo.captured_at else None,
        "latitude": photo.latitude,
        "longitude": photo.longitude,
        "gps_accuracy": photo.accuracy_meters,
        "operator_id": photo.uploaded_by_id,
        "content_type": photo.content_type,
        "file_size": photo.file_size,
        "sha256_hash": photo.sha256_hash,
        "image_url": f"/api/v1/machine-maintenance/photos/{photo.id}",
    }


def build_photo_binary_response(photo: MaintenancePhotoAttachment) -> HttpResponse:
    raw_bytes = bytes(photo.photo_data) if photo.photo_data is not None else b''
    if not raw_bytes:
        raise NotFound("Stored photo binary could not be located in database.")

    safe_name = _sanitize_filename(photo.original_filename)
    response = HttpResponse(raw_bytes, content_type=photo.content_type or 'image/jpeg')
    response['Content-Length'] = str(len(raw_bytes))
    response['Content-Disposition'] = f'inline; filename="{safe_name}"'
    response['Cache-Control'] = 'private, max-age=3600'
    response['X-Content-Type-Options'] = 'nosniff'
    response['X-Photo-Id'] = str(photo.id)
    if photo.submission_id is not None:
        response['X-Submission-Id'] = str(photo.submission_id)
    response['X-Machine-Id'] = str(photo.machine_id)
    response['X-Maintenance-Activity-Id'] = str(photo.checklist_item_id)
    response['X-Operator-Id'] = str(photo.uploaded_by_id)
    if photo.captured_at:
        response['X-Capture-Timestamp'] = photo.captured_at.isoformat()
    return response

