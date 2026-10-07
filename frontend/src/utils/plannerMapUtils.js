import L from 'leaflet';

/**
 * Normalizes GeoJSON coordinates [longitude, latitude] into Leaflet [latitude, longitude].
 */
export const geoJsonToLeafletLatLng = (coord) => {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return [lat, lng];
};

/**
 * Calculates Haversine distance in meters between two lat/lng coordinates.
 */
export const haversineDistanceM = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculates total route length in kilometers for a single GeoJSON Feature.
 */
export const calculateGeoJsonFeatureLengthKm = (feature) => {
  if (!feature) return 0;
  const props = feature.properties || {};

  // Check explicit property lengths first
  const propLen = props.lengthKm ?? props.length_km ?? props.lengthKM ?? props.segmentLengthKm;
  if (propLen != null && !isNaN(Number(propLen)) && Number(propLen) > 0) {
    return Number(propLen);
  }

  const rawLen = props.length ?? props.distance ?? props.segmentLength;
  if (rawLen != null && !isNaN(Number(rawLen)) && Number(rawLen) > 0) {
    const val = Number(rawLen);
    return val > 100 ? val / 1000.0 : val;
  }

  // Fallback: Compute length from LineString / MultiLineString coordinates
  const geometry = feature.geometry || feature;
  if (!geometry || !geometry.coordinates) return 0;

  const { type, coordinates } = geometry;
  let totalMeters = 0;

  const addLineLength = (coordsList) => {
    if (!Array.isArray(coordsList) || coordsList.length < 2) return;
    for (let i = 0; i < coordsList.length - 1; i++) {
      const pt1 = geoJsonToLeafletLatLng(coordsList[i]);
      const pt2 = geoJsonToLeafletLatLng(coordsList[i + 1]);
      if (pt1 && pt2) {
        totalMeters += haversineDistanceM(pt1[0], pt1[1], pt2[0], pt2[1]);
      }
    }
  };

  if (type === 'LineString') {
    addLineLength(coordinates);
  } else if (type === 'MultiLineString') {
    (coordinates || []).forEach(line => addLineLength(line));
  }

  return totalMeters / 1000.0;
};

/**
 * Calculates total route length in kilometers for a GeoJSON FeatureCollection (paths).
 */
export const calculateGeoJsonCollectionLengthKm = (geoJsonData) => {
  if (!geoJsonData) return 0;
  const features = Array.isArray(geoJsonData.features)
    ? geoJsonData.features
    : Array.isArray(geoJsonData)
    ? geoJsonData
    : geoJsonData.type === 'Feature'
    ? [geoJsonData]
    : [];

  let totalKm = 0;
  features.forEach(feat => {
    totalKm += calculateGeoJsonFeatureLengthKm(feat);
  });
  return totalKm;
};

/**
 * Calculates accurate plan length in kilometers from plan summary, direct properties, or GeoJSON paths features.
 */
export const calculatePlanLengthKm = (plan) => {
  if (!plan) return 0;
  if (plan.summary?.totalLengthKm && Number(plan.summary.totalLengthKm) > 0) {
    return Number(plan.summary.totalLengthKm);
  }
  if (plan.lengthKm && Number(plan.lengthKm) > 0) {
    return Number(plan.lengthKm);
  }
  return calculateGeoJsonCollectionLengthKm(plan.paths);
};

/**
 * Extracts all valid [lat, lng] points from GeoJSON FeatureCollection or Geometry objects.
 */
export const extractAllLatLngs = (geoJsonData) => {
  const points = [];
  if (!geoJsonData) return points;

  const features = Array.isArray(geoJsonData.features)
    ? geoJsonData.features
    : Array.isArray(geoJsonData)
    ? geoJsonData
    : geoJsonData.type === 'Feature'
    ? [geoJsonData]
    : [];

  features.forEach((feature) => {
    const geometry = feature.geometry || feature;
    if (!geometry || !geometry.coordinates) return;

    const { type, coordinates } = geometry;

    if (type === 'Point') {
      const pt = geoJsonToLeafletLatLng(coordinates);
      if (pt) points.push(pt);
    } else if (type === 'LineString') {
      (coordinates || []).forEach((c) => {
        const pt = geoJsonToLeafletLatLng(c);
        if (pt) points.push(pt);
      });
    } else if (type === 'MultiLineString' || type === 'Polygon') {
      (coordinates || []).forEach((ring) => {
        (ring || []).forEach((c) => {
          const pt = geoJsonToLeafletLatLng(c);
          if (pt) points.push(pt);
        });
      });
    } else if (type === 'MultiPolygon') {
      (coordinates || []).forEach((poly) => {
        (poly || []).forEach((ring) => {
          (ring || []).forEach((c) => {
            const pt = geoJsonToLeafletLatLng(c);
            if (pt) points.push(pt);
          });
        });
      });
    }
  });

  return points;
};

/**
 * Calculates Leaflet bounding box [[minLat, minLng], [maxLat, maxLng]] for a set of GeoJSON collections.
 */
export const calculatePlannerBounds = (pathsFeatureCollection, nodesFeatureCollection) => {
  const pathPoints = extractAllLatLngs(pathsFeatureCollection);
  const nodePoints = extractAllLatLngs(nodesFeatureCollection);
  const allPoints = [...pathPoints, ...nodePoints];

  if (allPoints.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  allPoints.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });

  if (minLat === Infinity || maxLat === -Infinity) return null;

  if (minLat === maxLat && minLng === maxLng) {
    const delta = 0.005;
    return [
      [minLat - delta, minLng - delta],
      [maxLat + delta, maxLng + delta],
    ];
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
};

/**
 * Calculates a combined Leaflet bounding box [[minLat, minLng], [maxLat, maxLng]]
 * across a list of active plans.
 */
export const calculateMultiPlanBounds = (activePlansList = []) => {
  if (!Array.isArray(activePlansList) || activePlansList.length === 0) return null;

  const allPoints = [];
  activePlansList.forEach((plan) => {
    if (!plan || plan.visible === false) return;
    const pPoints = extractAllLatLngs(plan.paths);
    const nPoints = extractAllLatLngs(plan.nodes);
    allPoints.push(...pPoints, ...nPoints);
  });

  if (allPoints.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  allPoints.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });

  if (minLat === Infinity || maxLat === -Infinity) return null;

  if (minLat === maxLat && minLng === maxLng) {
    const delta = 0.005;
    return [
      [minLat - delta, minLng - delta],
      [maxLat + delta, maxLng + delta],
    ];
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
};

/**
 * Palette of distinct colors for rendering multiple plans on the map.
 */
export const PLAN_COLOR_PALETTE = [
  { stroke: '#0284c7', node: '#0369a1', name: 'Sky Blue' },
  { stroke: '#7c3aed', node: '#6d28d9', name: 'Purple' },
  { stroke: '#059669', node: '#047857', name: 'Emerald' },
  { stroke: '#ea580c', node: '#c2410c', name: 'Orange' },
  { stroke: '#db2777', node: '#be185d', name: 'Pink' },
  { stroke: '#2563eb', node: '#1d4ed8', name: 'Royal Blue' },
  { stroke: '#d97706', node: '#b45309', name: 'Amber' },
  { stroke: '#4f46e5', node: '#4338ca', name: 'Indigo' },
];

export const getPlanColor = (index = 0) => {
  return PLAN_COLOR_PALETTE[index % PLAN_COLOR_PALETTE.length];
};

/**
 * Checks whether a node feature represents a GP (Gram Panchayat) node.
 */
export const isGpNode = (props = {}, nType = '') => {
  const typeCandidates = [
    nType,
    props?.nodeType,
    props?.topologyType,
    props?.type,
    props?.category,
    props?.role,
    props?.facilityType,
    props?.nodeCategory,
    props?.node_type,
    props?.topology_type,
  ];

  for (const c of typeCandidates) {
    if (!c || typeof c !== 'string') continue;
    const clean = c.trim().toUpperCase();
    if (
      clean === 'GP' ||
      clean === 'GP_NODE' ||
      clean === 'GP-NODE' ||
      clean === 'GRAM PANCHAYAT' ||
      clean === 'GRAM_PANCHAYAT' ||
      clean === 'GRAMPANCHAYAT'
    ) {
      return true;
    }
    if (/(^|[\s_\-:(])GP($|[\s_\-:)])/i.test(clean)) {
      return true;
    }
  }

  const nameCandidates = [props?.nodeName, props?.label, props?.name, props?.title];
  for (const name of nameCandidates) {
    if (!name || typeof name !== 'string') continue;
    const cleanName = name.trim().toUpperCase();
    if (
      cleanName === 'GP' ||
      /(^|[\s_\-:(])GP($|[\s_\-:)])/i.test(cleanName) ||
      cleanName.includes('GRAM PANCHAYAT') ||
      cleanName.includes('GRAM_PANCHAYAT')
    ) {
      const cleanType = String(nType || props?.nodeType || '').trim().toUpperCase();
      const nonGp = ['MH', 'MANHOLE', 'HH', 'HANDHOLE', 'CHAMBER', 'JOINT'];
      if (!nonGp.includes(cleanType)) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Exact vector SVG of the 3D Network Router icon matching the reference design.
 */
export const GP_ROUTER_SVG_CONTENT = (width = 20, height = 17) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 425" width="${width}" height="${height}" fill="none" style="display:block;overflow:visible;">
    <!-- Side 3D Cylinder -->
    <path d="M 12 165 C 12 260, 488 260, 488 165 L 488 260 C 488 355, 12 355, 12 260 Z" fill="#4267b0" />
    
    <!-- Top Ellipse Face -->
    <ellipse cx="250" cy="165" rx="238" ry="142" fill="#6d8bcb" />

    <!-- 4 White Directional Arrows in X pattern -->
    <!-- Top-Left (NW) Arrow -->
    <g transform="translate(195, 130) rotate(-135)">
      <polygon points="0,-48 18,-20 7,-20 7,22 -7,22 -7,-20 -18,-20" fill="#ffffff" />
    </g>
    <!-- Top-Right (NE) Arrow -->
    <g transform="translate(305, 130) rotate(135) scale(-1, 1)">
      <polygon points="0,-48 18,-20 7,-20 7,22 -7,22 -7,-20 -18,-20" fill="#ffffff" />
    </g>
    <!-- Bottom-Left (SW) Arrow -->
    <g transform="translate(195, 200) rotate(-45)">
      <polygon points="0,-48 18,-20 7,-20 7,22 -7,22 -7,-20 -18,-20" fill="#ffffff" />
    </g>
    <!-- Bottom-Right (SE) Arrow -->
    <g transform="translate(305, 200) rotate(45)">
      <polygon points="0,-48 18,-20 7,-20 7,22 -7,22 -7,-20 -18,-20" fill="#ffffff" />
    </g>
  </svg>
`;

export const GP_RACK_SVG_CONTENT = GP_ROUTER_SVG_CONTENT;

/**
 * Creates a Leaflet DivIcon for a GP node using the 3D isometric router cylinder design.
 */
export const createGpNodeIcon = (options = {}) => {
  const width = options.width || 28;
  const height = options.height || 24;
  return L.divIcon({
    className: 'gis-gp-node-marker',
    html: `
      <div style="
        width: ${width}px;
        height: ${height}px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 0 2px #ffffff) drop-shadow(0 2px 4px rgba(0,0,0,0.6));
        cursor: pointer;
        transition: transform 0.15s ease-out;
      "
      onmouseover="this.style.transform='scale(1.3)'"
      onmouseout="this.style.transform='scale(1)'"
      >
        ${GP_ROUTER_SVG_CONTENT(width, height)}
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    popupAnchor: [0, -height / 2 - 2],
  });
};

/**
 * Renders GeoJSON paths and nodes onto a Leaflet feature group.
 */
export const renderPlannerLayersOnLeaflet = (
  leafletGroup,
  pathsFeatureCollection,
  nodesFeatureCollection,
  options = {}
) => {
  if (!leafletGroup) return;

  if (options.clear !== false) {
    leafletGroup.clearLayers();
  }

  const routeColor = options.routeColor || '#06b6d4';
  const nodeColor = options.nodeColor || '#a855f7';
  const planName = options.planName || '';

  // 1. Render Route Paths (LineStrings / MultiLineStrings)
  const pathFeatures = Array.isArray(pathsFeatureCollection?.features)
    ? pathsFeatureCollection.features
    : [];

  pathFeatures.forEach((feat, idx) => {
    const geom = feat.geometry;
    if (!geom) return;

    const props = feat.properties || {};
    const strokeColor = props.color || props.stroke || routeColor;
    const rName = props.routeName || props.name || props.routeCode || `Route Segment #${idx + 1}`;
    const rCode = props.routeCode || props.code || '';
    const rLength = props.lengthKm || props.length || props.segmentLength || '';
    const rSource = props.source || 'iLync DT Planner';

    const lineStyle = {
      color: strokeColor,
      weight: 4,
      opacity: 0.95,
      dashArray: props.status === 'PLANNED' ? '6, 6' : null,
      lineCap: 'round',
      lineJoin: 'round',
    };

    if (geom.type === 'LineString') {
      const latLngs = (geom.coordinates || [])
        .map(geoJsonToLeafletLatLng)
        .filter(Boolean);

      if (latLngs.length >= 2) {
        const polyline = L.polyline(latLngs, lineStyle);
        const popupContent = `
          <div style="font-family: sans-serif; font-size: 13px; padding: 4px; min-width: 180px;">
            ${planName ? `<div style="color: #64748b; font-size: 11px; font-weight: 600;">Plan: ${planName}</div>` : ''}
            <div style="font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 4px;">${rName}</div>
            ${rCode ? `<div style="color: #64748b; font-size: 11px;">Code: <b>${rCode}</b></div>` : ''}
            ${rLength ? `<div style="color: #3b82f6; font-size: 12px; margin-top: 2px;">Length: <b>${rLength} km</b></div>` : ''}
            <div style="margin-top: 6px; font-size: 11px; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block;">
              Source: ${rSource}
            </div>
          </div>
        `;
        polyline.bindPopup(popupContent);
        polyline.bindTooltip(rName, { sticky: true });
        leafletGroup.addLayer(polyline);
      }
    } else if (geom.type === 'MultiLineString') {
      (geom.coordinates || []).forEach((seg) => {
        const latLngs = (seg || []).map(geoJsonToLeafletLatLng).filter(Boolean);
        if (latLngs.length >= 2) {
          const polyline = L.polyline(latLngs, lineStyle);
          polyline.bindTooltip(rName, { sticky: true });
          leafletGroup.addLayer(polyline);
        }
      });
    }
  });

  // 2. Render Nodes (Points)
  const nodeFeatures = Array.isArray(nodesFeatureCollection?.features)
    ? nodesFeatureCollection.features
    : [];

  nodeFeatures.forEach((feat, idx) => {
    const geom = feat.geometry;
    if (!geom || geom.type !== 'Point') return;

    const latLng = geoJsonToLeafletLatLng(geom.coordinates);
    if (!latLng) return;

    const props = feat.properties || {};
    const nName = props.nodeName || props.label || props.name || `Node #${idx + 1}`;
    const nType = props.nodeType || props.topologyType || 'NODE';
    const nCode = props.nodeCode || props.code || '';
    const isGp = isGpNode(props, nType);

    let marker;
    if (isGp) {
      marker = L.marker(latLng, {
        icon: createGpNodeIcon(),
        zIndexOffset: 1200,
      });
    } else {
      marker = L.circleMarker(latLng, {
        radius: 6,
        fillColor: nodeColor,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });
    }

    const popupContent = `
      <div style="font-family: sans-serif; font-size: 13px; padding: 4px; min-width: 175px;">
        ${planName ? `<div style="color: #64748b; font-size: 10px; font-weight: 600; text-transform: uppercase;">${planName}</div>` : ''}
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px;">
          <div style="font-weight: 700; color: #7e22ce; font-size: 14px;">${nName}</div>
          ${isGp ? `
            <div style="display: flex; align-items: center; gap: 5px;">
              ${GP_ROUTER_SVG_CONTENT(18, 15)}
              <span style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; text-transform: uppercase;">GP</span>
            </div>
          ` : ''}
        </div>
        <div style="color: #64748b; font-size: 11px; margin-top: 2px;">Type: <b>${nType}</b></div>
        ${nCode ? `<div style="color: #64748b; font-size: 11px;">Code: <b>${nCode}</b></div>` : ''}
        <div style="color: #94a3b8; font-size: 10px; margin-top: 4px;">
          ${latLng[0].toFixed(6)}, ${latLng[1].toFixed(6)}
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.bindTooltip(isGp ? `GP: ${nName}` : `${nType}: ${nName}`, { sticky: true });
    leafletGroup.addLayer(marker);
  });
};
