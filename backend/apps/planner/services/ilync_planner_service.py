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
            logger.info("[ILYNC_PLANNER] Fetching plan details for planId: %s", clean_plan_id)
            res = self.client.get(endpoint)
            data = res.get('data') if isinstance(res, dict) and 'data' in res else res
            
            if not isinstance(data, dict):
                data = {}

            # Calculate total route length if nested calculation exists
            calc = data.get('calculation') or {}
            rings = calc.get('rings') or []
            total_ring_length = sum(float(r.get('lengthKm') or 0.0) for r in rings if isinstance(r, dict))

            result = {
                "id": data.get("id") or clean_plan_id,
                "planId": clean_plan_id,
                "planName": data.get("planName") or f"Plan {clean_plan_id[:8]}",
                "circle": data.get("circle") or "",
                "district": data.get("district") or "",
                "blockName": data.get("blockName") or "",
                "lengthKm": round(total_ring_length or float(data.get("lengthKm") or 0.0), 2),
                "calculation": calc,
                "segments": data.get("segments") or [],
                "raw": data
            }

            logger.info("[ILYNC_PLANNER] Successfully retrieved details for plan %s (%s)", clean_plan_id, result["planName"])
            return result

        except IlyncNotFoundException:
            logger.warning("[ILYNC_PLANNER] Plan not found in iLync: %s", clean_plan_id)
            raise IlyncNotFoundException(message=f"Plan '{clean_plan_id}' not found in iLync DT Planner.")
        except IlyncTimeoutException:
            logger.error("[ILYNC_PLANNER] Timeout fetching plan details for planId: %s", clean_plan_id)
            raise IlyncTimeoutException()
        except IlyncAuthException as e:
            logger.error("[ILYNC_PLANNER] Auth error fetching plan details: %s", str(e))
            raise IlyncAuthException(message="iLync authentication failed while loading plan details.")
        except IlyncAPIException as e:
            logger.error("[ILYNC_PLANNER] API error fetching plan details for %s: %s", clean_plan_id, str(e))
            raise e
        except Exception as e:
            logger.error("[ILYNC_PLANNER] Unexpected error fetching plan details for %s: %s", clean_plan_id, str(e))
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
            logger.info("[ILYNC_PLANNER] Fetching map layers for planId: %s with sources %s", clean_plan_id, sources)
            res = self.client.get(endpoint, params=params)
            raw_data = res.get('data') if isinstance(res, dict) and 'data' in res else res
            
            if not isinstance(raw_data, dict):
                raw_data = {}

            groups = raw_data.get('groups') or []
            summary = raw_data.get('summary') or {}

            # Aggregate all paths (LineStrings) and nodes (Points) features from all groups
            all_path_features = []
            all_node_features = []

            for group in groups:
                if not isinstance(group, dict):
                    continue
                paths_fc = group.get('paths') or {}
                nodes_fc = group.get('nodes') or {}

                p_feats = paths_fc.get('features') if isinstance(paths_fc, dict) else []
                n_feats = nodes_fc.get('features') if isinstance(nodes_fc, dict) else []

                if isinstance(p_feats, list):
                    all_path_features.extend(p_feats)
                if isinstance(n_feats, list):
                    all_node_features.extend(n_feats)

            # Derive metrics from summary if available
            summary_sources = summary.get('sources') or []
            summary_routes = summary.get('routes') or []

            route_count = 0
            node_count = 0
            total_length_km = 0.0

            if summary_routes:
                route_count = len(summary_routes)
                total_length_km = sum(float(r.get('lengthKm') or 0.0) for r in summary_routes)
            elif summary_sources:
                route_count = sum(int(s.get('routeCount') or 0) for s in summary_sources)
                node_count = sum(int(s.get('nodeCount') or 0) for s in summary_sources)
                total_length_km = sum(float(s.get('lengthKm') or 0.0) for s in summary_sources)

            if not route_count and all_path_features:
                unique_routes = {f.get('properties', {}).get('routeId') for f in all_path_features if f.get('properties', {}).get('routeId')}
                route_count = len(unique_routes) if unique_routes else len(all_path_features)

            if not node_count and all_node_features:
                node_count = len(all_node_features)

            if not total_length_km and all_path_features:
                total_length_km = sum(float(f.get('properties', {}).get('lengthKm') or 0.0) for f in all_path_features)

            result = {
                "planId": clean_plan_id,
                "routeCount": route_count,
                "nodeCount": node_count if node_count else len(all_node_features),
                "lengthKm": round(total_length_km, 2),
                "groups": groups,
                "paths": {
                    "type": "FeatureCollection",
                    "features": all_path_features
                },
                "nodes": {
                    "type": "FeatureCollection",
                    "features": all_node_features
                },
                "routes": summary_routes,
                "summary": summary,
                "raw": raw_data
            }

            logger.info(
                "[ILYNC_PLANNER] Aggregated map layers for plan %s: %d routes, %d nodes, %s km",
                clean_plan_id, result["routeCount"], result["nodeCount"], result["lengthKm"]
            )
            return result

        except IlyncNotFoundException:
            logger.warning("[ILYNC_PLANNER] Map layers not found in iLync for planId: %s", clean_plan_id)
            raise IlyncNotFoundException(message=f"Map layers for plan '{clean_plan_id}' not found in iLync.")
        except IlyncTimeoutException:
            logger.error("[ILYNC_PLANNER] Timeout fetching map layers for planId: %s", clean_plan_id)
            raise IlyncTimeoutException()
        except IlyncAuthException as e:
            logger.error("[ILYNC_PLANNER] Auth error fetching map layers: %s", str(e))
            raise IlyncAuthException(message="iLync authentication failed while loading map layers.")
        except IlyncAPIException as e:
            logger.error("[ILYNC_PLANNER] API error fetching map layers for %s: %s", clean_plan_id, str(e))
            raise e
        except Exception as e:
            logger.error("[ILYNC_PLANNER] Unexpected error fetching map layers for %s: %s", clean_plan_id, str(e))
            raise IlyncAPIException(message=f"Failed to fetch map layers for plan '{clean_plan_id}'.", status_code=500)
