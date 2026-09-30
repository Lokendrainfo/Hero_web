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

  // Handle single point or tiny bounding area by adding minimal padding margin
  if (minLat === maxLat && minLng === maxLng) {
    const delta = 0.005; // approx 500m
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
 * Renders GeoJSON paths and nodes onto a Leaflet feature group.
 */
export const renderPlannerLayersOnLeaflet = (
  leafletGroup,
  pathsFeatureCollection,
  nodesFeatureCollection,
  options = {}
) => {
  if (!leafletGroup) return;

  // Clear existing layers in group
  leafletGroup.clearLayers();

  const routeColor = options.routeColor || '#06b6d4';
  const nodeColor = options.nodeColor || '#a855f7';

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

    const marker = L.circleMarker(latLng, {
      radius: 6,
      fillColor: nodeColor,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    });

    const popupContent = `
      <div style="font-family: sans-serif; font-size: 13px; padding: 4px; min-width: 160px;">
        <div style="font-weight: 700; color: #7e22ce; font-size: 14px;">${nName}</div>
        <div style="color: #64748b; font-size: 11px;">Type: <b>${nType}</b></div>
        ${nCode ? `<div style="color: #64748b; font-size: 11px;">Code: <b>${nCode}</b></div>` : ''}
        <div style="color: #94a3b8; font-size: 10px; margin-top: 4px;">
          ${latLng[0].toFixed(6)}, ${latLng[1].toFixed(6)}
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.bindTooltip(`${nType}: ${nName}`, { sticky: true });
    leafletGroup.addLayer(marker);
  });
};
