import math
from rest_framework.exceptions import ValidationError

EARTH_RADIUS_METERS = 6371000.0
VALID_GEOFENCE_TYPES = ('CIRCLE', 'POLYGON')


def _parse_float(value, field_label: str) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValidationError({"locations": f"{field_label} must be a valid number."})
    if not math.isfinite(num):
        raise ValidationError({"locations": f"{field_label} must be a finite number."})
    return num


def _validate_lat_lng(lat_raw, lng_raw, field_prefix: str) -> tuple[float, float]:
    lat = _parse_float(lat_raw, f"{field_prefix} Latitude")
    lng = _parse_float(lng_raw, f"{field_prefix} Longitude")
    if lat < -90.0 or lat > 90.0:
        raise ValidationError({"locations": f"{field_prefix} Latitude must be between -90 and 90."})
    if lng < -180.0 or lng > 180.0:
        raise ValidationError({"locations": f"{field_prefix} Longitude must be between -180 and 180."})
    return round(lat, 7), round(lng, 7)


def normalize_polygon_points(raw_points, scope_label: str = "Geofence") -> list[list[float]]:
    if not isinstance(raw_points, list):
        raise ValidationError({"locations": f"{scope_label}: Polygon boundary coordinates must be a list of [lat, lng] pairs."})
    points = []
    for idx, pt in enumerate(raw_points, start=1):
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            lat_r, lng_r = pt[0], pt[1]
        elif isinstance(pt, dict):
            lat_r = pt.get("latitude") if pt.get("latitude") is not None else pt.get("lat")
            lng_r = pt.get("longitude") if pt.get("longitude") is not None else pt.get("lng")
        else:
            raise ValidationError({"locations": f"{scope_label}: Invalid polygon coordinate at point #{idx}."})
        lat, lng = _validate_lat_lng(lat_r, lng_r, f"{scope_label} Point #{idx}")
        points.append([lat, lng])

    if len(points) < 3:
        raise ValidationError({"locations": f"{scope_label}: Polygon geofence requires at least 3 boundary coordinates."})
    distinct_pts = {(p[0], p[1]) for p in points}
    if len(distinct_pts) < 3:
        raise ValidationError({"locations": f"{scope_label}: Polygon geofence requires at least 3 distinct coordinates."})
    return points


def validate_and_normalize_geofence_config(lr: dict, scope_label: str) -> dict:
    is_geo = bool(lr.get("is_geofence_required", False))
    geo_type = str(lr.get("geofence_type") or "CIRCLE").strip().upper()
    if geo_type not in VALID_GEOFENCE_TYPES:
        raise ValidationError({"locations": f"{scope_label}: Geofence Type must be CIRCLE or POLYGON."})

    ref_name = str(lr.get("geofence_reference_name") or "").strip()[:150]
    if not is_geo:
        return {
            "is_geofence_required": False,
            "geofence_type": geo_type,
            "geofence_reference_name": ref_name,
            "geofence_latitude": None,
            "geofence_longitude": None,
            "geofence_radius_meters": None,
            "geofence_polygon": [],
        }

    if not bool(lr.get("capture_latitude", True)) or not bool(lr.get("capture_longitude", True)):
        raise ValidationError(
            {"locations": f"{scope_label}: Both Capture Latitude and Capture Longitude must be enabled when Geofence Requirement is Yes."}
        )

    if geo_type == "CIRCLE":
        if lr.get("geofence_latitude") in (None, "") or lr.get("geofence_longitude") in (None, ""):
            raise ValidationError(
                {"locations": f"{scope_label}: Geofence Center Latitude and Longitude are required when Geofence Type is Circle."}
            )
        lat, lng = _validate_lat_lng(lr.get("geofence_latitude"), lr.get("geofence_longitude"), f"{scope_label} Geofence")
        rad_raw = lr.get("geofence_radius_meters")
        if rad_raw in (None, ""):
            raise ValidationError({"locations": f"{scope_label}: Radius (meters) is required for Circle geofence."})
        radius = _parse_float(rad_raw, f"{scope_label} Geofence Radius (meters)")
        if radius <= 0:
            raise ValidationError({"locations": f"{scope_label}: Geofence Radius must be greater than 0 meters."})
        return {
            "is_geofence_required": True,
            "geofence_type": "CIRCLE",
            "geofence_reference_name": ref_name,
            "geofence_latitude": lat,
            "geofence_longitude": lng,
            "geofence_radius_meters": round(radius, 2),
            "geofence_polygon": [],
        }

    polygon_pts = normalize_polygon_points(lr.get("geofence_polygon"), scope_label)
    center_lat = round(sum(p[0] for p in polygon_pts) / len(polygon_pts), 7)
    center_lng = round(sum(p[1] for p in polygon_pts) / len(polygon_pts), 7)
    return {
        "is_geofence_required": True,
        "geofence_type": "POLYGON",
        "geofence_reference_name": ref_name,
        "geofence_latitude": center_lat,
        "geofence_longitude": center_lng,
        "geofence_radius_meters": None,
        "geofence_polygon": polygon_pts,
    }


def haversine_distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_METERS * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def _project_xy_meters(origin_lat: float, origin_lng: float, lat: float, lng: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(origin_lat))
    x = math.radians(lng - origin_lng) * EARTH_RADIUS_METERS * cos_lat
    y = math.radians(lat - origin_lat) * EARTH_RADIUS_METERS
    return x, y


def _distance_to_polygon_edge_meters(lat: float, lng: float, polygon_pts: list[list[float]]) -> float:
    min_dist = float('inf')
    n = len(polygon_pts)
    for i in range(n):
        lat1, lng1 = polygon_pts[i]
        lat2, lng2 = polygon_pts[(i + 1) % n]
        ax, ay = _project_xy_meters(lat, lng, lat1, lng1)
        bx, by = _project_xy_meters(lat, lng, lat2, lng2)
        dx = bx - ax
        dy = by - ay
        seg_len_sq = dx * dx + dy * dy
        if seg_len_sq == 0.0:
            dist = math.hypot(ax, ay)
        else:
            t = max(0.0, min(1.0, (-(ax * dx + ay * dy)) / seg_len_sq))
            proj_x = ax + t * dx
            proj_y = ay + t * dy
            dist = math.hypot(proj_x, proj_y)
        if dist < min_dist:
            min_dist = dist
    return min_dist


def _point_in_polygon(lat: float, lng: float, polygon_pts: list[list[float]]) -> bool:
    inside = False
    n = len(polygon_pts)
    j = n - 1
    for i in range(n):
        yi, xi = polygon_pts[i][0], polygon_pts[i][1]
        yj, xj = polygon_pts[j][0], polygon_pts[j][1]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    if inside:
        return True
    return _distance_to_polygon_edge_meters(lat, lng, polygon_pts) <= 0.5


def evaluate_geofence(req, lat: float | None, lng: float | None) -> dict:
    """
    Evaluates captured GPS coordinates against a `ChecklistLocationRequirement` (object or dict).
    Never enforces geofence boundaries when `is_geofence_required` is False.
    """
    def _get(key, default=None):
        return req.get(key, default) if isinstance(req, dict) else getattr(req, key, default)

    is_geo = bool(_get("is_geofence_required", False))
    geo_type = str(_get("geofence_type") or "CIRCLE").strip().upper()
    ref_name = str(_get("geofence_reference_name") or _get("location_name") or "Configured Site").strip()
    radius = _get("geofence_radius_meters")
    center_lat = _get("geofence_latitude")
    center_lng = _get("geofence_longitude")
    polygon_pts = _get("geofence_polygon") or []

    if not is_geo:
        return {
            "geofence_required": False,
            "geofence_type": "",
            "reference_name": ref_name,
            "radius_meters": None,
            "is_inside": None,
            "distance_from_boundary_meters": None,
            "distance_from_center_meters": None,
            "validation_status": "NOT_CONFIGURED",
            "message": "",
        }

    if lat is None or lng is None:
        return {
            "geofence_required": True,
            "geofence_type": geo_type,
            "reference_name": ref_name,
            "radius_meters": float(radius) if radius is not None else None,
            "is_inside": False,
            "distance_from_boundary_meters": None,
            "distance_from_center_meters": None,
            "validation_status": "OUTSIDE",
            "message": f"Both Latitude and Longitude are required for geofence validation on '{ref_name}'.",
        }

    if geo_type == "POLYGON" and isinstance(polygon_pts, list) and len(polygon_pts) >= 3:
        norm_pts = [[float(p[0]), float(p[1])] for p in polygon_pts]
        inside = _point_in_polygon(lat, lng, norm_pts)
        if inside:
            return {
                "geofence_required": True,
                "geofence_type": "POLYGON",
                "reference_name": ref_name,
                "radius_meters": None,
                "is_inside": True,
                "distance_from_boundary_meters": 0.0,
                "distance_from_center_meters": None,
                "validation_status": "INSIDE",
                "message": f"Inside Polygon geofence for '{ref_name}'.",
            }
        dist_out = round(_distance_to_polygon_edge_meters(lat, lng, norm_pts), 1)
        return {
            "geofence_required": True,
            "geofence_type": "POLYGON",
            "reference_name": ref_name,
            "radius_meters": None,
            "is_inside": False,
            "distance_from_boundary_meters": dist_out,
            "distance_from_center_meters": None,
            "validation_status": "OUTSIDE",
            "message": f"Captured location is {dist_out}m outside the configured Polygon boundary for '{ref_name}'.",
        }

    if center_lat is None or center_lng is None or radius is None:
        return {
            "geofence_required": True,
            "geofence_type": "CIRCLE",
            "reference_name": ref_name,
            "radius_meters": None,
            "is_inside": False,
            "distance_from_boundary_meters": None,
            "distance_from_center_meters": None,
            "validation_status": "OUTSIDE",
            "message": f"Geofence boundary coordinates are incomplete for '{ref_name}'.",
        }

    radius_val = float(radius)
    dist_center = haversine_distance_meters(lat, lng, float(center_lat), float(center_lng))
    dist_center_r = round(dist_center, 1)
    if dist_center <= radius_val:
        return {
            "geofence_required": True,
            "geofence_type": "CIRCLE",
            "reference_name": ref_name,
            "radius_meters": radius_val,
            "is_inside": True,
            "distance_from_boundary_meters": 0.0,
            "distance_from_center_meters": dist_center_r,
            "validation_status": "INSIDE",
            "message": f"Inside {radius_val:g}m geofence around '{ref_name}' ({dist_center_r}m from center).",
        }

    dist_outside = round(dist_center - radius_val, 1)
    return {
        "geofence_required": True,
        "geofence_type": "CIRCLE",
        "reference_name": ref_name,
        "radius_meters": radius_val,
        "is_inside": False,
        "distance_from_boundary_meters": dist_outside,
        "distance_from_center_meters": dist_center_r,
        "validation_status": "OUTSIDE",
        "message": (
            f"Captured location is {dist_outside}m outside the allowed {radius_val:g}m geofence "
            f"around '{ref_name}' ({dist_center_r}m from center)."
        ),
    }
