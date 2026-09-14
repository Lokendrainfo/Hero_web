import logging
from apps.integrations.ilync_client import IlyncClient
from apps.common.models import Circle, District, Block

logger = logging.getLogger(__name__)

def sync_geography_from_ilync(max_pages=None, page_size=100):
    """
    Synchronize Circle, District, and Block records dynamically
    from upstream ILYNC location master API: GET /api/locations
    """
    client = IlyncClient()
    try:
        res = client.get_locations(page=0, size=page_size)
    except Exception as exc:
        logger.error("Failed to connect to ILYNC api/locations: %s", exc)
        return {"success": False, "error": str(exc)}

    if not res or not res.get("success"):
        return {"success": False, "error": "Invalid API response from ILYNC locations."}

    data = res.get("data", {})
    page_info = data.get("page", {})
    total_pages = page_info.get("totalPages", 1)

    if max_pages and isinstance(max_pages, int):
        total_pages = min(total_pages, max_pages)

    circles_created = 0
    districts_created = 0
    blocks_created = 0

    for p in range(total_pages):
        page_res = res if p == 0 else client.get_locations(page=p, size=page_size)
        items = page_res.get("data", {}).get("content", []) if page_res else []

        for loc in items:
            c_name = str(loc.get("circle") or "").strip()
            d_name = str(loc.get("district") or "").strip()
            b_name = str(loc.get("blockName") or "").strip()

            if not c_name:
                continue

            circle_obj, c_created = Circle.objects.get_or_create(
                name=c_name,
                defaults={"code": c_name[:20].upper()}
            )
            if c_created:
                circles_created += 1

            if d_name:
                district_obj, d_created = District.objects.get_or_create(
                    circle=circle_obj,
                    name=d_name,
                    defaults={"code": d_name[:20].upper()}
                )
                if d_created:
                    districts_created += 1

                if b_name:
                    b_code = str(loc.get("blockId") or b_name[:20].upper())
                    _, b_created = Block.objects.get_or_create(
                        district=district_obj,
                        name=b_name,
                        defaults={"code": b_code}
                    )
                    if b_created:
                        blocks_created += 1

    logger.info(
        "Successfully synced geography from ILYNC: %d circles, %d districts, %d blocks created.",
        circles_created, districts_created, blocks_created
    )
    return {
        "success": True,
        "circles_created": circles_created,
        "districts_created": districts_created,
        "blocks_created": blocks_created,
        "total_circles": Circle.objects.count(),
        "total_districts": District.objects.count(),
        "total_blocks": Block.objects.count()
    }
