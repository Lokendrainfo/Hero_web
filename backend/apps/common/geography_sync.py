"""DISABLED — Circle/District/Block are not persisted (proxy-only)."""
import logging

logger = logging.getLogger(__name__)


def sync_geography_from_ilync(max_pages=None, page_size=100):
    logger.info("sync_geography_from_ilync skipped (proxy-only)")
    return {
        "success": True,
        "persisted": False,
        "created_circles": 0,
        "created_districts": 0,
        "created_blocks": 0,
        "total_circles": 0,
        "total_districts": 0,
        "total_blocks": 0,
        "message": "Geography not stored in HERO DB",
    }
