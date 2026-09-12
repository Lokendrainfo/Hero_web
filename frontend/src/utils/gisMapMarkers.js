import L from 'leaflet';
import { formatDepthM } from './formatters';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function truncateLabel(value, max = 22) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function depthSampleStep(zoom, count) {
  const n = Number(count) || 0;
  if (n <= 50) return 1;
  if (zoom < 14) return Math.max(24, Math.ceil(n / 28));
  if (zoom < 15) return Math.max(14, Math.ceil(n / 55));
  if (zoom < 16) return Math.max(8, Math.ceil(n / 100));
  if (zoom < 17) return Math.max(3, Math.ceil(n / 220));
  return 1;
}

export function depthDotSize(zoom) {
  if (zoom < 14) return 6;
  if (zoom < 15) return 7;
  if (zoom < 16) return 8;
  if (zoom < 17) return 9;
  if (zoom < 18) return 10;
  return 11;
}

export function depthLabelStep(zoom, count) {
  const n = Number(count) || 0;
  if (zoom < 16.5) return Number.POSITIVE_INFINITY;
  if (zoom < 18) return Math.max(8, Math.ceil(n / 36));
  if (zoom < 19) return Math.max(2, Math.ceil(n / 70));
  return 1;
}

export function applyGisZoomLabels(map) {
  if (!map) return;
  const z = map.getZoom();
  const el = map.getContainer();
  el.classList.toggle('gis-zoom-far', z < 15.8);
  el.classList.toggle('gis-zoom-mid', z >= 15.8 && z < 17.2);
  el.classList.toggle('gis-zoom-near', z >= 17.2 && z < 18);
  el.classList.toggle('gis-zoom-close', z >= 18);
  el.classList.toggle('gis-zoom-labels', z >= 18);
  el.classList.toggle('gis-dp-cards', z >= 18);
  el.style.setProperty('--gis-dp-size', `${depthDotSize(z)}px`);
}

export function bindGisZoomLabels(map) {
  if (!map) return;
  if (!map.__gisZoomBound) {
    map.on('zoomend', () => applyGisZoomLabels(map));
    map.__gisZoomBound = true;
  }
  applyGisZoomLabels(map);
}

const START_PIN = `
  <svg class="gis-pin-svg" width="22" height="28" viewBox="0 0 24 32" fill="none" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#059669" stroke="#ffffff" stroke-width="1.6"/>
    <circle cx="12" cy="11.5" r="4.2" fill="#ffffff"/>
  </svg>
`;

const END_PIN = `
  <svg class="gis-pin-svg" width="22" height="28" viewBox="0 0 24 32" fill="none" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#6d28d9" stroke="#ffffff" stroke-width="1.6"/>
    <circle cx="12" cy="11.5" r="4.2" fill="none" stroke="#ffffff" stroke-width="2"/>
    <circle cx="12" cy="11.5" r="1.6" fill="#ffffff"/>
  </svg>
`;

const MID_PIN = `
  <svg class="gis-pin-svg" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <circle cx="9" cy="9" r="7" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
  </svg>
`;

export function resolvePitRole(pit, index, total, startIds, endIds) {
  const isStart = startIds.has(pit.id) || startIds.has(pit.name);
  const isEnd = endIds.has(pit.id) || endIds.has(pit.name);
  if (isStart && !isEnd) return 'start';
  if (isEnd && !isStart) return 'end';
  if (isStart && isEnd) return 'mid';
  if (index === 0) return 'start';
  if (index === total - 1 && total > 1) return 'end';
  return 'mid';
}

export function depthPointIcon({
  depth,
  size = 18,
  showLabel = false,
  isKey = false,
  isLive = false,
  side = 'right',
}) {
  const px = Math.max(8, Math.round(size));
  const classes = [
    'gis-dp',
    isKey ? 'gis-dp--key' : '',
    isLive ? 'gis-dp--live' : '',
    showLabel ? 'gis-dp--labeled' : '',
    side === 'left' ? 'gis-dp--left' : 'gis-dp--right',
  ].filter(Boolean).join(' ');

  return L.divIcon({
    className: 'gis-marker gis-dp-marker',
    html: `<div class="${classes}" style="--gis-dp-size:${px}px">
      <span class="gis-dp-dot"></span>
      <span class="gis-dp-label">${escapeHtml(formatDepthM(depth))}</span>
    </div>`,
    iconSize: [px, px],
    iconAnchor: [px / 2, px / 2],
    popupAnchor: [0, -px / 2],
    tooltipAnchor: [px / 2, 0],
  });
}

export function gpNodeIcon({ role = 'start', name = '', code = '' }) {
  const parts = [code, name].map((v) => String(v || '').trim()).filter(Boolean);
  const unique = parts.filter((v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
  return pitIcon({ role: role === 'end' ? 'end' : 'start', name: unique.join(' · ') });
}

export function pitLabelHtml(role, name = '', tag = '') {
  if (role === 'mid') return '';
  const primary = tag || truncateLabel(name, 30);
  if (!primary) return '';
  const extra = tag ? truncateLabel(name, 22) : '';
  const showExtra = extra && extra.toLowerCase() !== primary.toLowerCase();
  return `<span class="gis-pit-label">
    <span class="gis-pit-tag">${escapeHtml(primary)}</span>
    ${showExtra ? `<span class="gis-pit-name">${escapeHtml(extra)}</span>` : ''}
  </span>`;
}

export function pitIcon({ role = 'mid', name = '', tag = '' }) {
  const pin = role === 'start' ? START_PIN : role === 'end' ? END_PIN : MID_PIN;

  if (role === 'mid') {
    return L.divIcon({
      className: 'gis-marker gis-pit-marker gis-pit-marker--mid',
      html: `<div class="gis-pit gis-pit--mid">${pin}</div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10],
    });
  }

  const label = pitLabelHtml(role, name, tag);
  const primary = tag || truncateLabel(name, 30);
  const extra = tag ? truncateLabel(name, 22) : '';
  const width = Math.min(40 + Math.max(primary.length, extra.length) * 7, 188);
  return L.divIcon({
    className: `gis-marker gis-pit-marker gis-pit-marker--${role}`,
    html: `<div class="gis-pit gis-pit--${role}">${pin}${label}</div>`,
    iconSize: [width, extra && tag ? 42 : 34],
    iconAnchor: [11, extra && tag ? 36 : 28],
    popupAnchor: [0, -26],
  });
}

export function buildDepthPhotos(executionData) {
  return (executionData?.depthPoints || []).map((dp, idx) => {
    const dpPhotos = dp.photos || [];
    const photoObj = dpPhotos[0] || {};
    const imgUrl = photoObj.photoUrl || (dp.photo && (dp.photo.photoUrl || dp.photo.url)) || photoObj.key || null;
    const dpId = dp.id || `ASH-DPT${String(dp.pointNo || idx + 1).padStart(8, '0')}`;
    return {
      id: dpId,
      key: photoObj.key || imgUrl,
      photoUrl: imgUrl,
      url: imgUrl,
      src: imgUrl,
      label: `Depth Point ${dpId}`,
      title: `Depth Point ${dpId}`,
      depth: dp.depth,
      capturedAt: dp.capturedAt,
      latitude: dp.lat,
      longitude: dp.lng,
      pointNo: dp.pointNo || idx + 1,
    };
  });
}

export function namedPitEndpoints(pits = [], startIds, endIds) {
  const list = pits || [];
  const namedStart = list.find((pit, idx) => resolvePitRole(pit, idx, list.length, startIds, endIds) === 'start') || list[0];
  const namedEnd = [...list].reverse().find((pit, idx) => {
    const originalIdx = list.length - 1 - idx;
    return resolvePitRole(pit, originalIdx, list.length, startIds, endIds) === 'end';
  }) || list[list.length - 1];
  return { namedStart, namedEnd };
}

const squareAround = (lng, lat, halfMeters) => {
  const dLat = halfMeters / 111320;
  const dLng = halfMeters / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  return [[
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ]];
};

export function buildGis3dScene(executionData) {
  const routes = [];
  const bounds = [];
  (executionData?.shots || []).forEach((shot) => {
    if (shot.route && shot.route.length > 1) {
      routes.push(shot.route.map(([lat, lng]) => [lng, lat]));
      shot.route.forEach(([lat, lng]) => bounds.push([lng, lat]));
    }
  });

  const depthPoints = executionData?.depthPoints || [];
  const lastDepthIdx = depthPoints.length - 1;
  const columnStep = depthPoints.length > 2400 ? 4 : depthPoints.length > 1200 ? 3 : depthPoints.length > 500 ? 2 : 1;
  const columns = {
    type: 'FeatureCollection',
    features: depthPoints.flatMap((dp, idx) => {
      if (dp.lat == null || dp.lng == null || Number.isNaN(Number(dp.lat)) || Number.isNaN(Number(dp.lng))) return [];
      const isLast = idx === lastDepthIdx;
      const isKey = idx === 0 || isLast;
      if (!isKey && idx % columnStep !== 0) return [];
      const depth = Number(dp.depth) || 0;
      const visualDepth = Math.min(Math.max(depth, 0.35), 5);
      bounds.push([dp.lng, dp.lat]);
      return [{
        type: 'Feature',
        properties: {
          kind: isLast ? 'latest' : 'depth',
          depth,
          height: isLast ? Math.max(visualDepth * 28, 48) : 10 + visualDepth * 20,
          index: idx,
          pointNo: dp.pointNo || idx + 1,
          label: formatDepthM(depth),
          capturedAt: dp.capturedAt || '',
          lng: dp.lng,
          lat: dp.lat,
          key: isKey ? 1 : 0,
          live: isLast ? 1 : 0,
          mod2: idx % 2,
          mod3: idx % 3,
          mod4: idx % 4,
        },
        geometry: {
          type: 'Polygon',
          coordinates: squareAround(dp.lng, dp.lat, isLast ? 6.5 : 5.2),
        },
      }];
    }),
  };

  const depthLabels = {
    type: 'FeatureCollection',
    features: columns.features.map((feature) => ({
      type: 'Feature',
      properties: feature.properties,
      geometry: {
        type: 'Point',
        coordinates: [feature.properties.lng, feature.properties.lat],
      },
    })),
  };

  const startPitIds = new Set();
  const endPitIds = new Set();
  (executionData?.shots || []).forEach((shot) => {
    if (shot.startPit?.id) startPitIds.add(shot.startPit.id);
    if (shot.startPit?.name) startPitIds.add(shot.startPit.name);
    if (shot.endPit?.id) endPitIds.add(shot.endPit.id);
    if (shot.endPit?.name) endPitIds.add(shot.endPit.name);
  });

  const pits = executionData?.pits || [];
  const { namedStart, namedEnd } = namedPitEndpoints(pits, startPitIds, endPitIds);
  const pitMarkers = pits.map((pit) => {
    if (pit.lat != null && pit.lng != null) bounds.push([pit.lng, pit.lat]);
    const role = pit === namedStart ? 'start' : (pit === namedEnd && pit !== namedStart ? 'end' : 'mid');
    return { ...pit, role };
  });

  const pitLinks = [];
  const pushLink = (coords) => {
    if (coords.length > 1) pitLinks.push(coords);
  };
  (executionData?.shots || []).forEach((shot) => {
    const a = shot.startPit;
    const b = shot.endPit;
    if (a?.lng != null && a?.lat != null && b?.lng != null && b?.lat != null) {
      pushLink([[a.lng, a.lat], [b.lng, b.lat]]);
    }
  });
  const pitChain = pits
    .filter((pit) => pit.lat != null && pit.lng != null && !Number.isNaN(Number(pit.lat)) && !Number.isNaN(Number(pit.lng)))
    .map((pit) => [pit.lng, pit.lat]);
  if (pitChain.length > 1) pushLink(pitChain);

  const lastDepth = depthPoints[lastDepthIdx];
  const landmarks = {
    type: 'FeatureCollection',
    features: [
      namedStart && namedStart.lat != null ? {
        type: 'Feature',
        properties: {
          kind: 'start',
          height: 56,
          label: 'Start pit',
          name: namedStart.name || namedStart.id || 'Start pit',
          depth: Number(namedStart.depth) || 0,
          width: namedStart.width != null ? String(namedStart.width) : '',
          side: namedStart.side || '',
          type: namedStart.type || '',
          diggingTime: namedStart.diggingTime || '',
        },
        geometry: { type: 'Polygon', coordinates: squareAround(namedStart.lng, namedStart.lat, 5.2) },
      } : null,
      namedEnd && namedEnd !== namedStart && namedEnd.lat != null ? {
        type: 'Feature',
        properties: {
          kind: 'end',
          height: 52,
          label: 'End pit',
          name: namedEnd.name || namedEnd.id || 'End pit',
          depth: Number(namedEnd.depth) || 0,
          width: namedEnd.width != null ? String(namedEnd.width) : '',
          side: namedEnd.side || '',
          type: namedEnd.type || '',
          diggingTime: namedEnd.diggingTime || '',
        },
        geometry: { type: 'Polygon', coordinates: squareAround(namedEnd.lng, namedEnd.lat, 5.2) },
      } : null,
    ].filter(Boolean),
  };

  const flags = [
    namedStart && namedStart.lat != null ? {
      role: 'start',
      lng: namedStart.lng,
      lat: namedStart.lat,
      tag: 'Start',
      title: '',
      name: namedStart.name || namedStart.id || 'Start pit',
      value: namedStart.depth != null ? formatDepthM(namedStart.depth) : '',
      photos: namedStart.photos || [],
      rows: [
        ['Depth', namedStart.depth != null ? formatDepthM(namedStart.depth) : ''],
        ['Width', namedStart.width != null ? `${Number(namedStart.width).toFixed(2)}m` : ''],
        ['Side', namedStart.side],
        ['Type', namedStart.type],
        ['Time', namedStart.diggingTime],
      ],
    } : null,
    namedEnd && namedEnd !== namedStart && namedEnd.lat != null ? {
      role: 'end',
      lng: namedEnd.lng,
      lat: namedEnd.lat,
      tag: 'End',
      title: '',
      name: namedEnd.name || namedEnd.id || 'End pit',
      value: namedEnd.depth != null ? formatDepthM(namedEnd.depth) : '',
      photos: namedEnd.photos || [],
      rows: [
        ['Depth', namedEnd.depth != null ? formatDepthM(namedEnd.depth) : ''],
        ['Width', namedEnd.width != null ? `${Number(namedEnd.width).toFixed(2)}m` : ''],
        ['Side', namedEnd.side],
        ['Type', namedEnd.type],
        ['Time', namedEnd.diggingTime],
      ],
    } : null,
    lastDepth && lastDepth.lat != null ? {
      role: 'live',
      lng: lastDepth.lng,
      lat: lastDepth.lat,
      tag: '',
      title: formatDepthM(lastDepth.depth),
      value: '',
      photos: lastDepth.photos || [],
      photoIndex: lastDepthIdx,
      rows: [
        ['Depth', formatDepthM(lastDepth.depth)],
        ['Point', lastDepth.pointNo || lastDepthIdx + 1],
        ['Captured', lastDepth.capturedAt || ''],
      ],
    } : null,
  ].filter(Boolean);

  let bearing = 0;
  const firstLine = routes[0];
  if (firstLine && firstLine.length > 1) {
    const a = firstLine[0];
    const b = firstLine[firstLine.length - 1];
    const dLng = (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
    const dLat = b[1] - a[1];
    bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI + 42;
  }

  let bbox = null;
  if (bounds.length) {
    let minLng = bounds[0][0];
    let minLat = bounds[0][1];
    let maxLng = bounds[0][0];
    let maxLat = bounds[0][1];
    bounds.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    });
    bbox = [[minLng, minLat], [maxLng, maxLat]];
  }

  const poles = columns.features
    .filter((feature, idx) => !feature.properties.live && (feature.properties.key || idx % 2 === 0))
    .map((feature, zig) => ({
      lng: feature.properties.lng,
      lat: feature.properties.lat,
      depth: feature.properties.depth,
      label: feature.properties.label,
      pointNo: feature.properties.pointNo,
      live: false,
      photos: [],
      index: feature.properties.index,
      zig,
      keep: Boolean(feature.properties.key) || zig % 4 === 0,
      labeled: Boolean(feature.properties.key) || zig % 6 === 0,
    }));

  return {
    routes,
    pitLinks,
    columns,
    depthPoints: {
      type: 'FeatureCollection',
      features: columns.features.map((feature) => ({
        type: 'Feature',
        properties: feature.properties,
        geometry: { type: 'Point', coordinates: [feature.properties.lng, feature.properties.lat] },
      })),
    },
    depthLabels,
    landmarks,
    flags,
    poles,
    pitMarkers,
    depthPhotos: buildDepthPhotos(executionData),
    bearing,
    bbox,
  };
}

export function depthPoleHtml({ depth, label }) {
  const meters = Math.min(Math.max(Number(depth) || 0.4, 0.4), 5);
  const mast = Math.round(38 + meters * 8);
  return `<div class="gis-pole" style="--pole-h:${mast}px">
    <span class="gis-pole-label">${escapeHtml(label || formatDepthM(depth))}</span>
    <span class="gis-pole-mast"></span>
  </div>`;
}

export function flagMarkerHtml({ role = 'start', tag = '', title = '' }) {
  const main = title || tag;
  return `<div class="gis-flag gis-flag--${role}">
    <span class="gis-flag-cloth"><strong>${escapeHtml(truncateLabel(main, 14))}</strong></span>
    <span class="gis-flag-mast"></span>
  </div>`;
}

export function pitMarkerHtml(role, name, tag = '') {
  const pin = role === 'start' ? START_PIN : role === 'end' ? END_PIN : MID_PIN;
  if (role === 'mid') {
    return `<div class="gis-pit gis-pit--mid">${pin}</div>`;
  }
  const resolvedTag = tag || (role === 'start' ? 'Start pit' : role === 'end' ? 'End pit' : '');
  return `<div class="gis-pit gis-pit--${role}">${pin}${pitLabelHtml(role, name, resolvedTag)}</div>`;
}

export function gisPopupHtml({ eyebrow, title, rows = [], actionLabel = '' }) {
  const rowHtml = rows
    .filter((row) => row && row[1] !== undefined && row[1] !== null && row[1] !== '')
    .map(([label, value]) => (
      `<div class="gis-popup-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    ))
    .join('');

  return `<div class="gis-popup-card">
    ${eyebrow ? `<div class="gis-popup-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
    <div class="gis-popup-title">${escapeHtml(title)}</div>
    ${rowHtml}
    ${actionLabel ? `<button type="button" class="gis-popup-btn">${escapeHtml(actionLabel)}</button>` : ''}
  </div>`;
}
