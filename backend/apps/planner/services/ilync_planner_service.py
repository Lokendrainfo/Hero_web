import logging
from apps.integrations.ilync_client import IlyncClient
from apps.integrations.exceptions import (
    IlyncAPIException,
    IlyncNotFoundException,
    IlyncTimeoutException,
    IlyncAuthException
)

logger = logging.getLogger(__name__)

class IlyncPlannerService:
    """
    Dedicated integration service for the iLync DT Planner API.
    Reuses the existing authenticated IlyncClient infrastructure.
    """

    def __init__(self, client=None):
        self.client = client or IlyncClient()

    def get_plan_details(self, plan_id: str) -> dict:
        """
        Fetches plan details from iLync DT Planner API:
        GET /geo/api/planner/plans/{planId}
        """
        if not plan_id or not str(plan_id).strip():
            raise ValueError("Plan ID is required and cannot be empty.")

        clean_plan_id = str(plan_id).strip()
        endpoint = f"geo/api/planner/plans/{clean_plan_id}"

        try:
            logger.info("Fetching plan details for planId: %s", clean_plan_id)
            res = self.client.get(endpoint)
            data = res.get('data') if isinstance(res, dict) and 'data' in res else res
            return data or {}
        except IlyncNotFoundException:
            logger.warning("Plan not found in iLync: %s", clean_plan_id)
            raise IlyncNotFoundException(message=f"Plan '{clean_plan_id}' not found in iLync DT Planner.")
        except IlyncTimeoutException:
            logger.error("Timeout fetching plan details for planId: %s", clean_plan_id)
            raise IlyncTimeoutException()
        except IlyncAuthException as e:
            logger.error("Auth error fetching plan details: %s", str(e))
            raise IlyncAuthException(message="iLync authentication failed while loading plan details.")
        except IlyncAPIException as e:
            logger.error("API error fetching plan details for %s: %s", clean_plan_id, str(e))
            raise e
        except Exception as e:
            logger.error("Unexpected error fetching plan details for %s: %s", clean_plan_id, str(e))
            raise IlyncAPIException(message=f"Failed to fetch plan details for '{clean_plan_id}'.", status_code=500)

    def get_plan_map_layers(self, plan_id: str, sources=None) -> dict:
        """
        Fetches map layers associated with a plan from iLync DT Planner API:
        GET /geo/api/routes/map-layers?includeSummary=true&planId={planId}&source=DTP_IMPORT&source=PLANNER&source=LAND_BASED_SURVEY
        """
        if not plan_id or not str(plan_id).strip():
            raise ValueError("Plan ID is required and cannot be empty.")

        clean_plan_id = str(plan_id).strip()
        if sources is None:
            sources = ['DTP_IMPORT', 'PLANNER', 'LAND_BASED_SURVEY']

        # Multi-value query parameters
        params = [('includeSummary', 'true'), ('planId', clean_plan_id)]
        for src in sources:
            params.append(('source', src))

        endpoint = "geo/api/routes/map-layers"

        try:
            logger.info("Fetching map layers for planId: %s with sources %s", clean_plan_id, sources)
            res = self.client.get(endpoint, params=params)
            data = res.get('data') if isinstance(res, dict) and 'data' in res else res

            # Normalize layer fields to ensure GeoJSON FeatureCollections exist
            if isinstance(data, dict):
                paths = data.get('paths') or {"type": "FeatureCollection", "features": []}
                nodes = data.get('nodes') or {"type": "FeatureCollection", "features": []}
                groups = data.get('groups') or []
                routes = data.get('routes') or []
                summary = data.get('summary') or {}

                return {
                    "planId": clean_plan_id,
                    "groups": groups,
                    "paths": paths,
                    "nodes": nodes,
                    "routes": routes,
                    "summary": summary,
                    "raw": data
                }
            return {"planId": clean_plan_id, "paths": {"type": "FeatureCollection", "features": []}, "nodes": {"type": "FeatureCollection", "features": []}}

        except IlyncNotFoundException:
            logger.warning("Map layers not found in iLync for planId: %s", clean_plan_id)
            raise IlyncNotFoundException(message=f"Map layers for plan '{clean_plan_id}' not found in iLync.")
        except IlyncTimeoutException:
            logger.error("Timeout fetching map layers for planId: %s", clean_plan_id)
            raise IlyncTimeoutException()
        except IlyncAuthException as e:
            logger.error("Auth error fetching map layers: %s", str(e))
            raise IlyncAuthException(message="iLync authentication failed while loading map layers.")
        except IlyncAPIException as e:
            logger.error("API error fetching map layers for %s: %s", clean_plan_id, str(e))
            raise e
        except Exception as e:
            logger.error("Unexpected error fetching map layers for %s: %s", clean_plan_id, str(e))
            raise IlyncAPIException(message=f"Failed to fetch map layers for plan '{clean_plan_id}'.", status_code=500)
