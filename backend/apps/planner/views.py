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


class PlannerListView(APIView):
    """
    GET /api/planner/plans/
    Discovers all available plans from iLync DT Planner API.
    Supports optional filters: district, block, circle, search.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        district = request.query_params.get('district')
        block = request.query_params.get('block')
        circle = request.query_params.get('circle')
        search = request.query_params.get('search')
        page = request.query_params.get('page', 0)
        size = request.query_params.get('size', 100)

        service = IlyncPlannerService()
        try:
            plans_data = service.get_all_plans(
                district=district,
                block=block,
                circle=circle,
                search=search,
                page=page,
                size=size
            )
            return success_response(
                data=plans_data,
                message=f"Successfully fetched {plans_data.get('total', 0)} plans from iLync DT Planner."
            )
        except IlyncAPIException as exc:
            return error_response(message=str(exc.message or "Failed to discover plans."), status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("Unexpected error in PlannerListView: %s", str(exc))
            return error_response(message="Internal server error discovering plans.", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PlannerMultiMapLayersView(APIView):
    """
    POST /api/planner/multi-map-layers/
    Payload: { "plan_ids": ["plan_id_1", "plan_id_2", ...] }
    Concurrently fetches map layers for multiple plans and aggregates results per plan.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        plan_ids = request.data.get('plan_ids') or request.data.get('planIds') or []
        if not isinstance(plan_ids, list) or len(plan_ids) == 0:
            return error_response(message="Array of plan_ids is required.", status_code=status.HTTP_400_BAD_REQUEST)

        clean_plan_ids = list(dict.fromkeys([str(p).strip() for p in plan_ids if str(p).strip()]))[:20]

        service = IlyncPlannerService()
        results = {}
        errors = {}

        for pid in clean_plan_ids:
            try:
                layers = service.get_plan_map_layers(pid)
                results[pid] = layers
            except Exception as exc:
                logger.warning("Failed fetching layers for plan %s in multi-plan request: %s", pid, str(exc))
                errors[pid] = str(getattr(exc, 'message', str(exc)))

        return success_response(
            data={
                "totalRequested": len(clean_plan_ids),
                "totalSuccessful": len(results),
                "totalFailed": len(errors),
                "plans": results,
                "errors": errors
            },
            message=f"Multi-plan map layers processed: {len(results)}/{len(clean_plan_ids)} successful."
        )
