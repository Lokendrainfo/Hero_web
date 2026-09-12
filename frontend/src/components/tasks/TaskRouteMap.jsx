import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LucideMaximize2, LucideMinimize2, LucideGlobe } from 'lucide-react';
import { formatDepthM } from '../../utils/formatters';
import {
  bindGisZoomLabels,
  depthPointIcon,
  gisPopupHtml,
  gpNodeIcon,
  pitIcon as createPitIcon,
} from '../../utils/gisMapMarkers';

const parseLatLng = (obj) => {
  if (!obj) return null;
  const lat = parseFloat(obj.lat ?? obj.latitude);
  const lng = parseFloat(obj.lng ?? obj.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return [lat, lng];
};

const streetTiles = () => L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
  subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  maxZoom: 20,
});

const satelliteTiles = () => L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
  subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  maxZoom: 20,
});

export const TaskRouteMap = ({
  routeNodes = [],
  currentNode = null,
  nextNode = null,
  segmentSnapshots = [],
  childRoutes = [],
  selectedRouteIndex = null,
  pits = [],
  depthCaptures = [],
  height = '520px',
  title = 'Route map',
  onOpenPhotos = null,
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const tileLayerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapType, setMapType] = useState('street');

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const fitRouteBounds = () => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;
    const bounds = layerGroup.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48] });
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [29.95, 73.46],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    tileLayerRef.current = streetTiles().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = L.featureGroup().addTo(map);
    bindGisZoomLabels(map);
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    tileLayerRef.current = (mapType === 'satellite' ? satelliteTiles() : streetTiles()).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [mapType]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const allBounds = [];
    const isBlock = childRoutes.length > 0;

    let orderedNodes = [...routeNodes];
    if (orderedNodes.length === 0 && segmentSnapshots.length > 0) {
      segmentSnapshots.forEach((seg, idx) => {
        if (seg.startNode) orderedNodes.push(seg.startNode);
        if (idx === segmentSnapshots.length - 1 && seg.endNode) orderedNodes.push(seg.endNode);
      });
    }

    if (!isBlock) {
      const validRoutePts = [];
      orderedNodes.forEach((node, idx) => {
        const pt = parseLatLng(node);
        if (!pt) return;
        validRoutePts.push(pt);
        allBounds.push(pt);

        const isStart = idx === 0 || (currentNode && (node.code === currentNode.code || node.name === currentNode.name));
        const isEnd = idx === orderedNodes.length - 1 || (nextNode && (node.code === nextNode.code || node.name === nextNode.name));
        const role = isStart ? 'start' : (isEnd ? 'end' : 'mid');

        const marker = L.marker(pt, {
          icon: role === 'mid'
            ? createPitIcon({ role: 'mid' })
            : gpNodeIcon({ role, name: node.name, code: node.code }),
          zIndexOffset: 350,
        });
        marker.bindPopup(gisPopupHtml({
          eyebrow: isStart ? 'Start' : (isEnd ? 'End' : 'Node'),
          title: node.name || node.code || `Node ${idx + 1}`,
          rows: [
            ['Code', node.code || '—'],
            ['GPS', `${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}`],
          ],
        }), { maxWidth: 240, className: 'gis-popup' });
        layerGroup.addLayer(marker);
      });

      if (validRoutePts.length > 1) {
        layerGroup.addLayer(L.polyline(validRoutePts, {
          color: '#111827',
          weight: 2.5,
          opacity: 0.85,
          lineCap: 'round',
        }));
      }
    }

    const selectedBounds = [];
    childRoutes.forEach((route, rIdx) => {
      const isSelected = selectedRouteIndex === rIdx;
      const showLabel = selectedRouteIndex == null || isSelected;
      const pts = [];

      const addEndpoint = (node, role) => {
        const pt = parseLatLng(node);
        if (!pt) return;
        pts.push(pt);
        allBounds.push(pt);
        if (isSelected) selectedBounds.push(pt);

        const marker = L.marker(pt, {
          icon: gpNodeIcon({
            role,
            name: showLabel ? (node.name || node.code) : '',
            code: showLabel ? (route.routeName || route.routeCode || '') : '',
          }),
          zIndexOffset: isSelected ? 500 : 300,
        });
        marker.bindPopup(gisPopupHtml({
          eyebrow: `${route.routeName || 'Route'} · ${role === 'start' ? 'Start' : 'End'}`,
          title: node.name || node.code || 'Node',
          rows: [
            ['Code', node.code || '—'],
            ['GPS', `${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}`],
          ],
        }), { maxWidth: 240, className: 'gis-popup' });
        layerGroup.addLayer(marker);
      };

      addEndpoint(route.currentNode, 'start');
      addEndpoint(route.nextNode, 'end');

      if (pts.length > 1) {
        layerGroup.addLayer(L.polyline(pts, {
          color: isSelected ? '#111827' : '#9ca3af',
          weight: isSelected ? 3.5 : 2,
          opacity: isSelected ? 0.95 : 0.7,
          lineCap: 'round',
        }));
      }
    });

    const showPits = pits.length > 0 && !isBlock;
    if (showPits) {
      pits.forEach((pit, idx) => {
        const lat = parseFloat(pit.lat ?? pit.latitude ?? pit.pitImage_1?.latitude);
        const lng = parseFloat(pit.lng ?? pit.longitude ?? pit.pitImage_1?.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        const pt = [lat, lng];
        allBounds.push(pt);
        const role = idx === 0 ? 'start' : (idx === pits.length - 1 && pits.length > 1 ? 'end' : 'mid');
        const pitName = pit.pitName || pit.pitSerialNo || pit.name || `PIT-${idx + 1}`;
        const photoList = [
          pit.pitImage_1, pit.pitImage_2, pit.pitImage_3,
          pit.pitDepthImage, pit.pitWidthImage,
          ...(pit.photos || []),
        ].filter((p) => p && (p.photoUrl || p.url));

        const marker = L.marker(pt, {
          icon: createPitIcon({ role: isBlock ? 'mid' : role, name: isBlock ? '' : pitName }),
          zIndexOffset: 400,
        });
        marker.bindPopup(gisPopupHtml({
          eyebrow: role === 'start' ? 'Start pit' : role === 'end' ? 'End pit' : 'Pit',
          title: pitName,
          rows: [
            ['Depth', pit.depth != null ? formatDepthM(pit.depth) : '—'],
            ['Type', pit.type || pit.pitType || '—'],
          ],
          actionLabel: photoList.length > 0 ? `View photos (${photoList.length})` : '',
        }), { maxWidth: 240, className: 'gis-popup' });
        marker.on('popupopen', (e) => {
          const btn = e.popup.getElement()?.querySelector('.gis-popup-btn');
          if (btn && onOpenPhotos && photoList.length > 0) {
            btn.onclick = () => onOpenPhotos(photoList, 0);
          }
        });
        layerGroup.addLayer(marker);
      });
    }

    const showDepths = !isBlock && depthCaptures.length > 0;
    if (showDepths) {
      const depthPts = [];
      const step = depthCaptures.length > 400 ? Math.ceil(depthCaptures.length / 400) : 1;
      depthCaptures.forEach((dp, idx) => {
        const lat = parseFloat(dp.lat ?? dp.latitude);
        const lng = parseFloat(dp.lng ?? dp.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        const isKey = idx === 0 || idx === depthCaptures.length - 1;
        if (!isKey && idx % step !== 0) return;
        const pt = [lat, lng];
        depthPts.push(pt);
        allBounds.push(pt);
        const marker = L.marker(pt, {
          icon: depthPointIcon({
            depth: dp.depth,
            isKey,
            isNth: idx % 8 === 0,
            isLive: idx === depthCaptures.length - 1,
          }),
          zIndexOffset: 200,
        });
        marker.bindTooltip(formatDepthM(dp.depth), {
          direction: 'top',
          offset: [0, -10],
          className: 'gis-tip',
          opacity: 1,
        });
        marker.bindPopup(gisPopupHtml({
          eyebrow: 'Depth capture',
          title: `Point ${dp.pointNo || idx + 1}`,
          rows: [['Depth', formatDepthM(dp.depth)]],
          actionLabel: dp.photos?.[0] || dp.depthoMeterImage?.photoUrl ? 'View photo' : '',
        }), { maxWidth: 220, className: 'gis-popup' });
        marker.on('popupopen', (e) => {
          const btn = e.popup.getElement()?.querySelector('.gis-popup-btn');
          const photo = (dp.photos && dp.photos[0]) || dp.depthoMeterImage;
          if (btn && onOpenPhotos && photo) btn.onclick = () => onOpenPhotos([photo], 0);
        });
        layerGroup.addLayer(marker);
      });

      if (depthPts.length > 1) {
        const halo = L.polyline(depthPts, {
          color: '#ffffff',
          weight: 6,
          opacity: 0.45,
          lineCap: 'round',
          interactive: false,
        });
        const line = L.polyline(depthPts, {
          color: '#5b21b6',
          weight: 2.25,
          opacity: 0.9,
          lineCap: 'round',
        });
        layerGroup.addLayer(halo);
        layerGroup.addLayer(line);
        halo.bringToBack();
        line.bringToBack();
      }
    }

    bindGisZoomLabels(map);

    if (selectedBounds.length > 1) {
      map.fitBounds(selectedBounds, { padding: [56, 56] });
    } else if (allBounds.length > 1) {
      map.fitBounds(allBounds, { padding: [48, 48] });
    } else if (allBounds.length === 1) {
      map.setView(allBounds[0], 14);
    }

    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* map may be unmounting */ }
    }, 120);
  }, [routeNodes, currentNode, nextNode, segmentSnapshots, childRoutes, selectedRouteIndex, pits, depthCaptures, onOpenPhotos]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* ignore */ }
    }, 80);
  }, [isFullscreen, height]);

  return (
    <div
      ref={wrapperRef}
      className="task-route-map"
      style={{
        height: isFullscreen ? '100vh' : height,
        minHeight: isFullscreen ? '100vh' : height,
        borderRadius: isFullscreen ? 0 : 6,
      }}
    >
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 400, display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 'calc(100% - 160px)' }}>
        <div className="gis-map-chip">
          <button type="button" className={mapType === 'street' ? 'is-active' : ''} onClick={() => setMapType('street')}>Map</button>
          <button type="button" className={mapType === 'satellite' ? 'is-active' : ''} onClick={() => setMapType('satellite')}>Satellite</button>
        </div>
        <div className="gis-map-icon-btn" style={{ pointerEvents: 'none' }}>
          {title}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
            {childRoutes.length > 0 ? `${childRoutes.length} routes` : `${routeNodes.length || pits.length} points`}
          </span>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 400, display: 'flex', gap: 8 }}>
        <button type="button" className="gis-map-icon-btn" onClick={fitRouteBounds} title="Fit routes">
          <LucideGlobe size={14} /> Fit
        </button>
        <button
          type="button"
          className="gis-map-icon-btn"
          onClick={toggleFullscreen}
          title="Toggle fullscreen"
          style={{ width: 36, padding: 0, justifyContent: 'center' }}
        >
          {isFullscreen ? <LucideMinimize2 size={15} /> : <LucideMaximize2 size={15} />}
        </button>
      </div>

      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

      <div className="gis-legend">
        <div className="gis-legend-title">On this map</div>
        <div className="gis-legend-row"><span className="gis-legend-swatch gis-legend-swatch--start" /> Start</div>
        <div className="gis-legend-row"><span className="gis-legend-swatch gis-legend-swatch--end" /> End</div>
        <div className="gis-legend-row"><span className="gis-legend-swatch gis-legend-swatch--route" /> Route</div>
        {!isBlockPreview(childRoutes) && (
          <div className="gis-legend-row"><span className="gis-legend-swatch gis-legend-swatch--depth" /> Depth</div>
        )}
      </div>
    </div>
  );
};

function isBlockPreview(childRoutes) {
  return Array.isArray(childRoutes) && childRoutes.length > 0;
}
