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
)
from apps.maintenance.services.submission_service import extract_submission_payload


class MobileMaintenanceCheckView(APIView):
    """
    GET /api/v1/machine-maintenance/check
    Validates machine ID, user ID & role, frequency, hour meter, due status,
    duplicate submissions, and returns eligibility for Mobile APK.
    """

    def get(self, request):
        data = check_machine_maintenance_eligibility(request, request.query_params)
        return success_response(
            data=data,
            message="Machine maintenance eligibility check completed",
        )


class MobileMaintenanceDataPostView(APIView):
    """
    POST /api/v1/machine-maintenance/data
    Accepts multipart/form-data (or JSON with pre-uploaded photo_ids) to validate
    mandatory per-item photographs server-side, save submission & responses,
    and return unique submission reference ID.
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
    Returns maintenance checklist master records grouped by Machine/Engine categories
    and frequencies with assigned roles, remarks, and special instructions.
    """

    def get(self, request):
        data = get_mobile_maintenance_list(request, request.query_params)
        return success_response(
            data=data,
            message="Machine maintenance checklist master retrieved successfully",
        )


class MobilePhotoRetrieveView(APIView):
    """
    GET /api/v1/machine-maintenance/photos/{photo_id}
    Retrieves the camera-captured photo binary directly from `machine_pm_db` (BYTEA)
    after verifying user authentication and machine/vendor authorization.
    """

    def get(self, request, photo_id):
        photo = get_authorized_photo_or_403(request.user, photo_id)
        return build_photo_binary_response(photo)

