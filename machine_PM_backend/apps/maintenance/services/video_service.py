import hashlib
import os
import re

from django.conf import settings
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.common.exceptions import PayloadTooLargeError, UnsupportedMediaTypeError
from apps.hero_integration.services import get_authorized_machine_or_403
from apps.maintenance.models import MaintenanceVideoAttachment
from .audit_service import record_audit_log
from .photo_service import _sanitize_filename, validate_capture_source

ALLOWED_VIDEO_MIME_TYPES = {
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'application/octet-stream',
}


def _looks_like_supported_video(raw_bytes: bytes, ext: str) -> bool:
    if len(raw_bytes) < 12:
        return False
    # WebM / MKV (EBML)
    if raw_bytes[:4] == b'\x1a\x45\xdf\xa3':
        return ext in ('webm', 'mkv')
    # ISO Base Media File Format (MP4 / MOV)
    if raw_bytes[4:8] in (b'ftyp', b'moov', b'mdat', b'wide', b'free'):
        return ext in ('mp4', 'mov')
    return False


def validate_and_process_camera_video(
    file_obj,
    max_duration_seconds: int | None = None,
    duration_seconds: float | None = None,
    raise_media_http_status: bool = False,
) -> tuple[bytes, str, str, int, str, float | None]:
    if not file_obj:
        raise ValidationError({"videos": "Video file is required."})

    max_bytes = getattr(settings, 'PM_MAX_VIDEO_SIZE_BYTES', 25 * 1024 * 1024)
    max_mb = getattr(settings, 'PM_MAX_VIDEO_SIZE_MB', 25)
    allowed_exts = getattr(settings, 'PM_ALLOWED_VIDEO_EXTENSIONS', ['mp4', 'webm', 'mov', 'mkv'])

    safe_name = _sanitize_filename(getattr(file_obj, 'name', 'capture.webm'))
    ext = os.path.splitext(safe_name)[1].lower().lstrip('.')
    if ext not in allowed_exts:
        exc_cls = UnsupportedMediaTypeError if raise_media_http_status else ValidationError
        raise exc_cls(
            {"videos": f"Unsupported video type '.{ext}'. Allowed types: {', '.join(allowed_exts)}."}
        )

    content_type = (getattr(file_obj, 'content_type', '') or '').split(';')[0].strip().lower()
    if content_type and content_type not in ALLOWED_VIDEO_MIME_TYPES:
        exc_cls = UnsupportedMediaTypeError if raise_media_http_status else ValidationError
        raise exc_cls(
            {"videos": f"Unsupported video MIME type '{content_type}'. Allowed: MP4, WEBM, MOV, MKV."}
        )

    file_size = getattr(file_obj, 'size', None)
    if file_size is not None and file_size > max_bytes:
        exc_cls = PayloadTooLargeError if raise_media_http_status else ValidationError
        raise exc_cls({"videos": f"Video exceeds maximum allowed size of {max_mb} MB."})

    file_obj.seek(0)
    raw_bytes = file_obj.read()
    actual_size = len(raw_bytes)
    if actual_size == 0:
        raise ValidationError({"videos": "Uploaded video file is empty."})
    if actual_size > max_bytes:
        exc_cls = PayloadTooLargeError if raise_media_http_status else ValidationError
        raise exc_cls({"videos": f"Video exceeds maximum allowed size of {max_mb} MB."})

    if not _looks_like_supported_video(raw_bytes, ext):
        raise ValidationError({"videos": "Uploaded file is not a valid MP4/WEBM/MOV/MKV video."})

    parsed_duration = None
    if duration_seconds not in (None, ''):
        try:
            parsed_duration = round(float(duration_seconds), 2)
        except (TypeError, ValueError):
            raise ValidationError({"videos": "Invalid video duration value."})
        if parsed_duration < 0:
            raise ValidationError({"videos": "Video duration cannot be negative."})
        if max_duration_seconds and parsed_duration > float(max_duration_seconds) + 1.0:
            raise ValidationError(
                {
                    "videos": (
                        f"Video duration ({parsed_duration}s) exceeds configured maximum "
                        f"duration of {max_duration_seconds}s."
                    )
                }
            )

    ext_mime_map = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'mkv': 'video/x-matroska',
    }
    detected_mime = content_type if (content_type and content_type != 'application/octet-stream') else ext_mime_map.get(ext, 'video/webm')
    sha256_hash = hashlib.sha256(raw_bytes).hexdigest()
    return raw_bytes, sha256_hash, detected_mime, actual_size, safe_name, parsed_duration


def validate_and_store_video(
    file_obj,
    machine,
    checklist_item,
    frequency_code: str,
    user,
    video_requirement=None,
    requirement_name: str = '',
    requirement_description: str = '',
    duration_seconds: float | None = None,
    captured_at=None,
    latitude=None,
    longitude=None,
    accuracy_meters=None,
    capture_source: str | None = 'CAMERA',
    require_explicit_camera: bool = False,
    raise_media_http_status: bool = False,
    request=None,
) -> MaintenanceVideoAttachment:
    validated_source = validate_capture_source(capture_source, require_explicit=require_explicit_camera)
    max_dur = video_requirement.max_duration_seconds if video_requirement else None
    raw_bytes, sha256_hash, detected_mime, actual_size, safe_name, parsed_duration = validate_and_process_camera_video(
        file_obj,
        max_duration_seconds=max_dur,
        duration_seconds=duration_seconds,
        raise_media_http_status=raise_media_http_status,
    )

    if MaintenanceVideoAttachment.objects.filter(sha256_hash=sha256_hash, is_bound=True).exists():
        raise ValidationError(
            {
                "videos": (
                    "This video has already been used as evidence for another maintenance activity. "
                    "Each requirement needs its own recorded video."
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

    video = MaintenanceVideoAttachment.objects.create(
        machine_id=machine.id,
        checklist_item=checklist_item,
        video_requirement=video_requirement,
        requirement_name=(requirement_name or (video_requirement.video_name if video_requirement else ''))[:120],
        requirement_description=(requirement_description or (video_requirement.video_description if video_requirement else '')),
        uploaded_by_id=user.id,
        frequency_code=frequency_code,
        video_data=raw_bytes,
        original_filename=safe_name,
        content_type=detected_mime[:100],
        file_size=actual_size,
        duration_seconds=parsed_duration,
        sha256_hash=sha256_hash,
        capture_source=validated_source,
        is_bound=False,
        captured_at=parsed_captured_at,
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=accuracy_meters,
    )

    record_audit_log(
        entity_type='VIDEO',
        entity_id=video.id,
        action='VIDEO_UPLOADED',
        actor=user,
        machine_id=machine.id,
        frequency_code=frequency_code,
        details={
            "checklist_item_id": checklist_item.id,
            "requirement_name": video.requirement_name,
            "sha256_hash": sha256_hash,
            "file_size": actual_size,
            "duration_seconds": parsed_duration,
        },
        request=request,
    )
    return video


def get_authorized_video_or_403(
    user,
    video_id: int,
    submission_id: int | str | None = None,
) -> MaintenanceVideoAttachment:
    video = MaintenanceVideoAttachment.objects.select_related(
        'checklist_item', 'submission', 'response', 'video_requirement'
    ).filter(id=video_id).first()
    if not video:
        raise NotFound("Video attachment not found.")

    if submission_id not in (None, ''):
        try:
            sub_id_int = int(submission_id)
        except (TypeError, ValueError):
            raise ValidationError({"submission_id": "submission_id must be a valid integer ID."})
        if video.submission_id != sub_id_int:
            raise NotFound("Video attachment does not belong to the requested maintenance submission.")

    try:
        get_authorized_machine_or_403(user, video.machine_id)
    except PermissionDenied:
        if video.uploaded_by_id != user.id:
            raise PermissionDenied("You are not authorized to view this video.")

    return video


def serialize_video_metadata(video: MaintenanceVideoAttachment) -> dict:
    video_name = (
        video.requirement_name
        or (video.video_requirement.video_name if video.video_requirement else '')
        or (video.checklist_item.description if video.checklist_item else '')
    )
    video_desc = (
        video.requirement_description
        or (video.video_requirement.video_description if video.video_requirement else '')
    )
    return {
        "video_id": video.id,
        "submission_id": video.submission_id,
        "submission_number": video.submission.submission_number if video.submission else None,
        "machine_id": video.machine_id,
        "maintenance_activity_id": video.checklist_item_id,
        "item_code": video.checklist_item.item_code if video.checklist_item else None,
        "question_id": video.question_id,
        "video_configuration_id": video.video_requirement_id,
        "video_name": video_name,
        "video_description": video_desc,
        "duration_seconds": video.duration_seconds,
        "capture_timestamp": video.captured_at.isoformat() if video.captured_at else None,
        "latitude": video.latitude,
        "longitude": video.longitude,
        "gps_accuracy": video.accuracy_meters,
        "operator_id": video.uploaded_by_id,
        "content_type": video.content_type,
        "file_size": video.file_size,
        "sha256_hash": video.sha256_hash,
        "video_url": f"/api/v1/machine-maintenance/videos/{video.id}",
    }


def build_video_binary_response(video: MaintenanceVideoAttachment, request=None) -> HttpResponse:
    raw_bytes = bytes(video.video_data) if video.video_data is not None else b''
    if not raw_bytes:
        raise NotFound("Stored video binary could not be located in database.")

    total_len = len(raw_bytes)
    safe_name = _sanitize_filename(video.original_filename)
    content_type = video.content_type or 'video/webm'

    range_header = (request.META.get('HTTP_RANGE', '') if request else '').strip()
    range_match = re.match(r'^bytes=(\d+)-(\d*)$', range_header)
    if range_match:
        start = int(range_match.group(1))
        end = int(range_match.group(2)) if range_match.group(2) else total_len - 1
        if start >= total_len or end < start:
            resp = HttpResponse(status=416)
            resp['Content-Range'] = f'bytes */{total_len}'
            return resp
        end = min(end, total_len - 1)
        chunk = raw_bytes[start:end + 1]
        resp = StreamingHttpResponse(iter([chunk]), status=206, content_type=content_type)
        resp['Content-Length'] = str(len(chunk))
        resp['Content-Range'] = f'bytes {start}-{end}/{total_len}'
    else:
        resp = HttpResponse(raw_bytes, content_type=content_type)
        resp['Content-Length'] = str(total_len)

    resp['Accept-Ranges'] = 'bytes'
    resp['Content-Disposition'] = f'inline; filename="{safe_name}"'
    resp['Cache-Control'] = 'private, max-age=3600'
    resp['X-Content-Type-Options'] = 'nosniff'
    resp['X-Video-Id'] = str(video.id)
    if video.submission_id is not None:
        resp['X-Submission-Id'] = str(video.submission_id)
    resp['X-Machine-Id'] = str(video.machine_id)
    resp['X-Maintenance-Activity-Id'] = str(video.checklist_item_id)
    response_ts = video.captured_at.isoformat() if video.captured_at else None
    resp['X-Operator-Id'] = str(video.uploaded_by_id)
    if response_ts:
        resp['X-Capture-Timestamp'] = response_ts
    return resp
