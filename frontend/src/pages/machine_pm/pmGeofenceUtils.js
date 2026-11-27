const EARTH_RADIUS_METERS = 6371000.0;

const toRad = (deg) => (deg * Math.PI) / 180.0;

export const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const projectXYMeters = (originLat, originLng, lat, lng) => {
  const cosLat = Math.cos(toRad(originLat));
  return [
    toRad(lng - originLng) * EARTH_RADIUS_METERS * cosLat,
    toRad(lat - originLat) * EARTH_RADIUS_METERS,
  ];
};

export const distanceToPolygonEdgeMeters = (lat, lng, polygonPts = []) => {
  if (!Array.isArray(polygonPts) || polygonPts.length < 3) return null;
  let minDist = Infinity;
  const n = polygonPts.length;
  for (let i = 0; i < n; i += 1) {
    const [lat1, lng1] = polygonPts[i];
    const [lat2, lng2] = polygonPts[(i + 1) % n];
    const [ax, ay] = projectXYMeters(lat, lng, lat1, lng1);
    const [bx, by] = projectXYMeters(lat, lng, lat2, lng2);
    const dx = bx - ax;
    const dy = by - ay;
    const segLenSq = dx * dx + dy * dy;
    let dist;
    if (segLenSq === 0) {
      dist = Math.hypot(ax, ay);
    } else {
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / segLenSq));
      dist = Math.hypot(ax + t * dx, ay + t * dy);
    }
    if (dist < minDist) minDist = dist;
  }
  return Number.isFinite(minDist) ? minDist : null;
};

export const pointInPolygon = (lat, lng, polygonPts = []) => {
  if (!Array.isArray(polygonPts) || polygonPts.length < 3) return false;
  let inside = false;
  const n = polygonPts.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const [yi, xi] = polygonPts[i];
    const [yj, xj] = polygonPts[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  if (inside) return true;
  const edgeDist = distanceToPolygonEdgeMeters(lat, lng, polygonPts);
  return edgeDist !== null && edgeDist <= 0.5;
};

export const parsePolygonCoordinateRows = (rawPolygon = []) => {
  if (!Array.isArray(rawPolygon)) return [];
  return rawPolygon
    .map((pt) => {
      if (Array.isArray(pt) && pt.length >= 2) {
        return { latitude: String(pt[0] ?? ''), longitude: String(pt[1] ?? '') };
      }
      if (pt && typeof pt === 'object') {
        return {
          latitude: String(pt.latitude ?? pt.lat ?? ''),
          longitude: String(pt.longitude ?? pt.lng ?? ''),
        };
      }
      return { latitude: '', longitude: '' };
    });
};

export const evaluateGeofenceClient = (lreq, lat, lng) => {
  if (!lreq || !lreq.is_geofence_required) {
    return {
      geofenceRequired: false,
      isInside: null,
      distanceFromBoundaryMeters: null,
      distanceFromCenterMeters: null,
      message: '',
    };
  }

  const geoType = String(lreq.geofence_type || 'CIRCLE').toUpperCase();
  const refName = lreq.geofence_reference_name || lreq.location_name || 'Configured Site';

  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return {
      geofenceRequired: true,
      isInside: false,
      distanceFromBoundaryMeters: null,
      distanceFromCenterMeters: null,
      message: `Both Latitude and Longitude are required for geofence validation on "${refName}".`,
    };
  }

  if (geoType === 'POLYGON') {
    const pts = (Array.isArray(lreq.geofence_polygon) ? lreq.geofence_polygon : [])
      .map((pt) =>
        Array.isArray(pt)
          ? [Number(pt[0]), Number(pt[1])]
          : [Number(pt?.latitude ?? pt?.lat), Number(pt?.longitude ?? pt?.lng)]
      )
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));

    if (pts.length < 3) {
      return {
        geofenceRequired: true,
        isInside: false,
        distanceFromBoundaryMeters: null,
        distanceFromCenterMeters: null,
        message: `Polygon geofence boundary is incomplete for "${refName}".`,
      };
    }

    if (pointInPolygon(lat, lng, pts)) {
      return {
        geofenceRequired: true,
        isInside: true,
        distanceFromBoundaryMeters: 0,
        distanceFromCenterMeters: null,
        message: `Inside Polygon geofence for "${refName}".`,
      };
    }

    const edgeDist = Number((distanceToPolygonEdgeMeters(lat, lng, pts) || 0).toFixed(1));
    return {
      geofenceRequired: true,
      isInside: false,
      distanceFromBoundaryMeters: edgeDist,
      distanceFromCenterMeters: null,
      message: `Captured location is ${edgeDist}m outside the configured Polygon boundary for "${refName}".`,
    };
  }

  const cLat = Number(lreq.geofence_latitude);
  const cLng = Number(lreq.geofence_longitude);
  const radius = Number(lreq.geofence_radius_meters);
  if (!Number.isFinite(cLat) || !Number.isFinite(cLng) || !Number.isFinite(radius) || radius <= 0) {
    return {
      geofenceRequired: true,
      isInside: false,
      distanceFromBoundaryMeters: null,
      distanceFromCenterMeters: null,
      message: `Circle geofence boundary is incomplete for "${refName}".`,
    };
  }

  const distCenter = Number(haversineDistanceMeters(lat, lng, cLat, cLng).toFixed(1));
  if (distCenter <= radius) {
    return {
      geofenceRequired: true,
      isInside: true,
      distanceFromBoundaryMeters: 0,
      distanceFromCenterMeters: distCenter,
      message: `Inside ${radius}m geofence around "${refName}" (${distCenter}m from center).`,
    };
  }

  const distOutside = Number((distCenter - radius).toFixed(1));
  return {
    geofenceRequired: true,
    isInside: false,
    distanceFromBoundaryMeters: distOutside,
    distanceFromCenterMeters: distCenter,
    message: `Captured location is ${distOutside}m outside the allowed ${radius}m geofence around "${refName}" (${distCenter}m from center).`,
  };
};
