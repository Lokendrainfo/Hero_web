import logging
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from apps.common.responses import success_response, error_response
from apps.integrations.exceptions import (
    IlyncAPIException,
    IlyncNotFoundException,
    IlyncTimeoutException,
    IlyncAuthException
)
from .services.ilync_planner_service import IlyncPlannerService

logger = logging.getLogger(__name__)

class PlannerDetailView(APIView):
    """
    GET /api/planner/{plan_id}/
    Retrieves plan metadata and summary details from iLync DT Planner.
    """
    permission_classes = [AllowAny]

    def get(self, request, plan_id):
        if not plan_id or not str(plan_id).strip():
            return error_response(message="Plan ID parameter is required.", status_code=status.HTTP_400_BAD_REQUEST)

        service = IlyncPlannerService()
        try:
            plan_data = service.get_plan_details(plan_id)
            return success_response(
                data=plan_data,
                message=f"Plan details for '{plan_id}' fetched successfully."
            )
        except IlyncNotFoundException as exc:
            return error_response(message=str(exc.message or f"Plan '{plan_id}' not found."), status_code=status.HTTP_404_NOT_FOUND)
        except IlyncTimeoutException:
            return error_response(message="Upstream iLync API timed out while fetching plan details.", status_code=status.HTTP_504_GATEWAY_TIMEOUT)
        except IlyncAuthException:
            return error_response(message="Authentication failed with iLync API.", status_code=status.HTTP_401_UNAUTHORIZED)
        except IlyncAPIException as exc:
            return error_response(message=str(exc.message or "Failed to fetch plan details."), status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("Unexpected error in PlannerDetailView: %s", str(exc))
            return error_response(message=f"Internal server error fetching plan '{plan_id}'.", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PlannerMapLayersView(APIView):
    """
    GET /api/planner/{plan_id}/map-layers/
    Retrieves map layers, route GeoJSON paths, and node GeoJSON features for a plan from iLync DT Planner.
    """
    permission_classes = [AllowAny]

    def get(self, request, plan_id):
        if not plan_id or not str(plan_id).strip():
            return error_response(message="Plan ID parameter is required.", status_code=status.HTTP_400_BAD_REQUEST)

        # Allow source overrides via query params if provided
        sources = request.query_params.getlist('source')
        if not sources:
            sources = ['DTP_IMPORT', 'PLANNER', 'LAND_BASED_SURVEY']

        service = IlyncPlannerService()
        try:
            layers_data = service.get_plan_map_layers(plan_id, sources=sources)
            return success_response(
                data=layers_data,
                message=f"Map layers for plan '{plan_id}' fetched successfully."
            )
        except IlyncNotFoundException as exc:
            return error_response(message=str(exc.message or f"Map layers for plan '{plan_id}' not found."), status_code=status.HTTP_404_NOT_FOUND)
        except IlyncTimeoutException:
            return error_response(message="Upstream iLync API timed out while fetching map layers.", status_code=status.HTTP_504_GATEWAY_TIMEOUT)
        except IlyncAuthException:
            return error_response(message="Authentication failed with iLync API.", status_code=status.HTTP_401_UNAUTHORIZED)
        except IlyncAPIException as exc:
            return error_response(message=str(exc.message or "Failed to fetch map layers."), status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("Unexpected error in PlannerMapLayersView: %s", str(exc))
            return error_response(message=f"Internal server error fetching map layers for '{plan_id}'.", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
