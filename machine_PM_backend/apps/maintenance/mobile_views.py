from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView

from apps.common.responses import success_response
from apps.maintenance.services.mobile_api_service import (
    check_machine_maintenance_eligibility,
    get_mobile_maintenance_list,
    submit_mobile_maintenance_data,
)
from apps.maintenance.services.photo_service import (
    build_photo_binary_response,
    get_authorized_photo_or_403,
    serialize_photo_metadata,
)
from apps.maintenance.services.video_service import (
    build_video_binary_response,
    get_authorized_video_or_403,
    serialize_video_metadata,
)
from apps.maintenance.services.submission_service import extract_submission_payload


def _wants_metadata_json(query_params) -> bool:
    for flag in ('metadata', 'meta', 'include_metadata'):
        val = str(query_params.get(flag) or '').strip().lower()
        if val in ('1', 'true', 'yes'):
            return True
    return str(query_params.get('format') or '').strip().lower() == 'json'


class MobileMaintenanceCheckView(APIView):
    """
    GET /api/v1/machine-maintenance/check
    Validates machine ID, user ID & role, frequency, hour meter, due status,
    duplicate submissions, and returns the complete dynamic maintenance form
    (questions, conditional photos, conditional videos, and GPS configuration) for Mobile APK.
    """

    def get(self, request):
        data = check_machine_maintenance_eligibility(request, request.query_params)
        return success_response(
            data=data,
            message="Machine maintenance form and eligibility check completed",
        )


class MobileMaintenanceDataPostView(APIView):
    """
    POST /api/v1/machine-maintenance/data
    Accepts multipart/form-data (or JSON with pre-uploaded photo_ids) to validate
    questions, conditional photos/videos, and GPS server-side, save submission &
    historical configuration snapshots, and return unique submission reference ID.
    """

    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        payload = extract_submission_payload(request)
        data = submit_mobile_maintenance_data(request, payload, request.FILES)
        return success_response(
            data=data,
            message=f"Maintenance submission {data['submission_reference_id']} saved successfully",
            status_code=status.HTTP_201_CREATED,
        )


class MobileMaintenanceListView(APIView):
    """
    GET /api/v1/machine-maintenance/list
    Returns paginated maintenance activity schedules and submission records along with
    checklist master configuration, categories, role assignments, and safety guidelines.
    """

    def get(self, request):
        data = get_mobile_maintenance_list(request, request.query_params)
        page_info = data.get("page") or {}
        return success_response(
            data=data,
            message="Machine maintenance list retrieved successfully",
            meta={
                "count": page_info.get("totalElements", 0),
                "total_pages": page_info.get("totalPages", 0),
                "current_page": page_info.get("number", 1),
                "page_size": page_info.get("size", 20),
            },
        )


class MobilePhotoRetrieveView(APIView):
    """
    GET /api/v1/machine-maintenance/photos/{photo_id}
    Streams the authorized camera-captured photo binary from `machine_pm_db` (BYTEA)
    or returns full authorized photo metadata when `?metadata=true`.
    """

    def get(self, request, photo_id):
        photo = get_authorized_photo_or_403(
            request.user,
            photo_id,
            submission_id=request.query_params.get('submission_id'),
        )
        if _wants_metadata_json(request.query_params):
            return success_response(
                data=serialize_photo_metadata(photo),
                message="Maintenance photo metadata retrieved successfully",
            )
        return build_photo_binary_response(photo)


class MobileVideoRetrieveView(APIView):
    """
    GET /api/v1/machine-maintenance/videos/{video_id}
    Streams authorized camera-captured video binary from `machine_pm_db` (BYTEA) with Range support,
    or returns full authorized video metadata when `?metadata=true`.
    """

    def get(self, request, video_id):
        video = get_authorized_video_or_403(
            request.user,
            video_id,
            submission_id=request.query_params.get('submission_id'),
        )
        if _wants_metadata_json(request.query_params):
            return success_response(
                data=serialize_video_metadata(video),
                message="Maintenance video metadata retrieved successfully",
            )
        return build_video_binary_response(video, request=request)

