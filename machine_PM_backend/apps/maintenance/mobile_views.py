import json

from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView

from apps.common.responses import success_response
from apps.maintenance.services.mobile_api_service import (
    check_machine_maintenance_eligibility,
    get_mobile_maintenance_list,
    submit_mobile_maintenance_data,
)


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
        payload = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if isinstance(payload.get('responses'), str):
            try:
                payload['responses'] = json.loads(payload['responses'])
            except json.JSONDecodeError:
                raise ValidationError({"responses": "Invalid JSON string in 'responses' field."})

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

