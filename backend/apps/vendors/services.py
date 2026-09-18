import logging
from apps.integrations.ilync_client import IlyncClient

logger = logging.getLogger(__name__)


def sync_vendor_detail_links(vendor_obj, ext_v_id):
    """DISABLED (proxy-only): no Machine/User/Vendor DB writes from iLync detail."""
    logger.info("sync_vendor_detail_links skipped for %s (proxy-only)", ext_v_id)
    return


def fetch_and_sync_all_ilync_vendors(max_pages=5, size=50):
    """DISABLED write path — returns live iLync vendor list count only."""
    client = IlyncClient()
    live = []
    for page in range(max_pages):
        try:
            res = client.get_vendors(page=page, size=size)
            if not res or not res.get('success'):
                break
            data = res.get('data') or {}
            content = []
            if isinstance(data, dict):
                content = data.get('content') or data.get('results') or data.get('vendors') or []
            elif isinstance(data, list):
                content = data
            if not content:
                break
            live.extend([c for c in content if isinstance(c, dict)])
            if isinstance(data, dict) and data.get('last', True):
                break
        except Exception as e:
            logger.error("Error fetching iLync vendors page %s: %s", page, e)
            break
    logger.info("Fetched %d live iLync vendors (no DB write).", len(live))
    return {"synced_count": 0, "live_count": len(live), "persisted": False, "vendors": live}
