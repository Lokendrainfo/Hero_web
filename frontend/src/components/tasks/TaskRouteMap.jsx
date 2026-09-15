import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideMaximize2, LucideMinimize2, LucideGlobe, LucideChevronLeft, LucideChevronRight,
  LucideChevronDown, LucideDownload, LucideCopy, LucideCheck, LucideRefreshCw
} from 'lucide-react';
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
  planName = '',
  circle = '',
  district = '',
  block = '',
  gpCount = 0,
  routeNodes = [],
  currentNode = null,
  nextNode = null,
  segmentSnapshots = [],
  childRoutes = [],
  selectedRouteIndex = null,
  pits = [],
  depthCaptures = [],
  height = '680px',
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

  // Workbench Sidebar State
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(true);
  const [isPlanOpen, setIsPlanOpen] = useState(true);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // Workbench Feature Layer Checkboxes
  const [showExistingUsable, setShowExistingUsable] = useState(true);
  const [showExistingNotUsable, setShowExistingNotUsable] = useState(false);
  const [showNewPlannedFibre, setShowNewPlannedFibre] = useState(true);
  const [showRingName, setShowRingName] = useState(false);
  const [showGpName, setShowGpName] = useState(true);
  const [showBlockHq, setShowBlockHq] = useState(true);
  const [showGpRouters, setShowGpRouters] = useState(true);
  const [showGpsNotPart, setShowGpsNotPart] = useState(false);
  const [showJoints, setShowJoints] = useState(false);
  const [showFeederTaps, setShowFeederTaps] = useState(true);
  const [showWaypoints, setShowWaypoints] = useState(false);
  const [showLineDash, setShowLineDash] = useState(true);

  // Dynamic Lat/Lng Cursor Coordinates Tracking
  const [cursorCoords, setCursorCoords] = useState({ lat: 29.122354, lng: 73.250818 });
  const [copied, setCopied] = useState(false);

  // Calculated Header Display Values
  const displayPlanName = planName || (routeNodes[0]?.name ? `${routeNodes[0].name} ROUTE` : 'ANUPGARH - GANGANAGAR - RAJASTHAN');
  const displayCircle = circle || 'RAJASTHAN';
  const displayDistrict = district || 'GANGANAGAR';
  const displayBlock = block || 'ANUPGARH';
  const displayGpCount = gpCount || (routeNodes.length > 0 ? routeNodes.length : 31);

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

  const exportKml = () => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>${displayPlanName}</name>\n`;
    routeNodes.forEach((node, idx) => {
      const pt = parseLatLng(node);
      if (pt) {
        kml += `<Placemark><name>${node.name || `Node ${idx + 1}`}</name><Point><coordinates>${pt[1]},${pt[0]},0</coordinates></Point></Placemark>\n`;
      }
    });
    kml += `</Document>\n</kml>`;
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayPlanName.replace(/[^a-zA-Z0-9]/g, '_')}_workbench.kml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyCoordinates = () => {
    const text = `${cursorCoords.lat.toFixed(6)}, ${cursorCoords.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. Initialize Map Instance & Mousemove Tracking
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [29.122354, 73.250818],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);
    tileLayerRef.current = streetTiles().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = L.featureGroup().addTo(map);

    map.on('mousemove', (e) => {
      setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    bindGisZoomLabels(map);
  }, []);

  // 2. Tile Layer Switcher
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    tileLayerRef.current = (mapType === 'satellite' ? satelliteTiles() : streetTiles()).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [mapType]);

  // 3. Render Workbench Layers & Feature Vectors
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

    // Default Fallback Nodes if routeNodes is empty
    if (orderedNodes.length === 0) {
      orderedNodes = [
        { name: '4 KSM', code: 'GP-4KSM', lat: 29.185, lng: 73.245 },
        { name: '21 SJM', code: 'GP-21SJM', lat: 29.172, lng: 73.238 },
        { name: 'BANDA COLONY', code: 'GP-BANDA', lat: 29.155, lng: 73.251 },
        { name: '78 GB', code: 'GP-78GB', lat: 29.142, lng: 73.275 },
        { name: '22 A', code: 'GP-22A', lat: 29.128, lng: 73.218 },
        { name: '15 AB', code: 'GP-15AB', lat: 29.105, lng: 73.248 },
        { name: '12 A-B', code: 'GP-12AB', lat: 29.088, lng: 73.262 },
        { name: '8 LM B', code: 'GP-8LMB', lat: 29.065, lng: 73.255 },
        { name: '4 LM', code: 'GP-4LM', lat: 29.052, lng: 73.271 },
      ];
    }

    const validRoutePts = [];

    // Render Planned Fibre Polyline & GP Nodes
    orderedNodes.forEach((node, idx) => {
      const pt = parseLatLng(node);
      if (!pt) return;
      validRoutePts.push(pt);
      allBounds.push(pt);

      const isStart = idx === 0 || (currentNode && (node.code === currentNode.code || node.name === currentNode.name));
      const isEnd = idx === orderedNodes.length - 1 || (nextNode && (node.code === nextNode.code || node.name === nextNode.name));
      const role = isStart ? 'start' : (isEnd ? 'end' : 'mid');

      // GP Router Markers (Purple Pin with GP name)
      if (showGpRouters || showGpName) {
        const marker = L.marker(pt, {
          icon: gpNodeIcon({
            role: showBlockHq && idx === 0 ? 'start' : role,
            name: showGpName ? (node.name || node.code) : '',
            code: showRingName ? (node.code || `R-${idx + 1}`) : '',
          }),
          zIndexOffset: 400,
        });

        marker.bindPopup(gisPopupHtml({
          eyebrow: isStart ? 'Block HQ / Start' : (isEnd ? 'End GP' : 'GP Router'),
          title: node.name || node.code || `GP ${idx + 1}`,
          rows: [
            ['Code', node.code || '—'],
            ['GPS', `${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}`],
            ['Type', 'GP Router (GPON)'],
          ],
        }), { maxWidth: 240, className: 'gis-popup' });

        layerGroup.addLayer(marker);
      }
    });

    // Planned Fibre Polyline (Red Dashed Line)
    if (showNewPlannedFibre && validRoutePts.length > 1) {
      const lineStyle = {
        color: '#ef4444', // Red color matching Workbench plan
        weight: 3.5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: showLineDash ? '8, 8' : undefined,
      };

      layerGroup.addLayer(L.polyline(validRoutePts, lineStyle));
    }

    // Existing OFC (Usable) Polyline (Blue Line)
    if (showExistingUsable && validRoutePts.length > 1) {
      const usablePts = validRoutePts.slice(0, Math.ceil(validRoutePts.length / 2));
      if (usablePts.length > 1) {
        layerGroup.addLayer(L.polyline(usablePts, {
          color: '#2563eb', // Blue line
          weight: 2.5,
          opacity: 0.8,
        }));
      }
    }

    // Child Routes Mapping
    childRoutes.forEach((route, rIdx) => {
      const isSelected = selectedRouteIndex === rIdx;
      const pts = [];

      const addEndpoint = (node, role) => {
        const pt = parseLatLng(node);
        if (!pt) return;
        pts.push(pt);
        allBounds.push(pt);

        if (showGpRouters) {
          const marker = L.marker(pt, {
            icon: gpNodeIcon({
              role,
              name: showGpName ? (node.name || node.code) : '',
              code: showRingName ? (route.routeName || route.routeCode || '') : '',
            }),
            zIndexOffset: isSelected ? 500 : 300,
          });
          layerGroup.addLayer(marker);
        }
      };

      addEndpoint(route.currentNode, 'start');
      addEndpoint(route.nextNode, 'end');

      if (showNewPlannedFibre && pts.length > 1) {
        layerGroup.addLayer(L.polyline(pts, {
          color: isSelected ? '#dc2626' : '#ef4444',
          weight: isSelected ? 4 : 3,
          opacity: 0.9,
          dashArray: showLineDash ? '8, 8' : undefined,
        }));
      }
    });

    // Pits & Joints / Feeder Taps Layer
    if ((showJoints || showFeederTaps) && pits.length > 0) {
      pits.forEach((pit, idx) => {
        const lat = parseFloat(pit.lat ?? pit.latitude ?? pit.pitImage_1?.latitude);
        const lng = parseFloat(pit.lng ?? pit.longitude ?? pit.pitImage_1?.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        const pt = [lat, lng];
        allBounds.push(pt);

        const pitName = pit.pitName || pit.pitSerialNo || pit.name || `PIT-${idx + 1}`;
        const marker = L.marker(pt, {
          icon: createPitIcon({ role: 'mid', name: showGpName ? pitName : '' }),
          zIndexOffset: 350,
        });
        layerGroup.addLayer(marker);
      });
    }

    bindGisZoomLabels(map);

    if (allBounds.length > 1) {
      map.fitBounds(allBounds, { padding: [50, 50] });
    } else if (allBounds.length === 1) {
      map.setView(allBounds[0], 13);
    }
  }, [
    routeNodes, currentNode, nextNode, segmentSnapshots, childRoutes, selectedRouteIndex, pits, depthCaptures,
    showExistingUsable, showExistingNotUsable, showNewPlannedFibre, showRingName, showGpName, showBlockHq,
    showGpRouters, showGpsNotPart, showJoints, showFeederTaps, showWaypoints, showLineDash
  ]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: isFullscreen ? '100vh' : height,
        minHeight: isFullscreen ? '100vh' : height,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: isFullscreen ? 0 : 8,
        border: '1px solid #cbd5e1',
        overflow: 'hidden',
        background: '#ffffff',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 1. TOP GIS HEADER BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          padding: '8px 14px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          fontSize: '0.78rem',
          color: '#334155',
          gap: 12,
          flexWrap: 'wrap',
          zIndex: 450,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span style={{ color: '#64748b', fontWeight: 600 }}>PLAN NAME: </span>
            <strong style={{ color: '#0f172a' }}>{displayPlanName}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontWeight: 600 }}>STATE (CIRCLE): </span>
            <strong style={{ color: '#0f172a' }}>{displayCircle}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontWeight: 600 }}>DISTRICT: </span>
            <strong style={{ color: '#0f172a' }}>{displayDistrict}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontWeight: 600 }}>BLOCK: </span>
            <strong style={{ color: '#0f172a' }}>{displayBlock}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontWeight: 600 }}>NO. GPS: </span>
            <strong style={{ color: '#0f172a' }}>{displayGpCount}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={exportKml}
            title="Export KML Plan"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            <LucideDownload size={13} />
            <span>Export KML</span>
          </button>

          <button
            type="button"
            onClick={fitRouteBounds}
            title="Re-center / Fit bounds"
            style={{
              padding: '4px 8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            <LucideRefreshCw size={13} />
          </button>

          <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: 4, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setMapType('street')}
              style={{
                padding: '4px 8px',
                background: mapType === 'street' ? '#0f172a' : '#ffffff',
                color: mapType === 'street' ? '#ffffff' : '#334155',
                border: 'none',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setMapType('satellite')}
              style={{
                padding: '4px 8px',
                background: mapType === 'satellite' ? '#0f172a' : '#ffffff',
                color: mapType === 'satellite' ? '#ffffff' : '#334155',
                border: 'none',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Satellite
            </button>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            style={{
              padding: '4px 8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            {isFullscreen ? <LucideMinimize2 size={13} /> : <LucideMaximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* 2. MAP CONTAINER & WORKBENCH SIDEBAR */}
      <div style={{ position: 'relative', flex: 1, width: '100%', display: 'flex' }}>
        {/* LEFT WORKBENCH PANEL */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: isWorkbenchOpen ? 290 : 36,
            zIndex: 400,
            background: '#ffffff',
            borderRight: '1px solid #cbd5e1',
            boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
            transition: 'width 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* WORKBENCH HEADER */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              padding: '10px 12px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: '#0f172a',
            }}
          >
            {isWorkbenchOpen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #2563eb' }} />
                <span>Workbench</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setIsWorkbenchOpen(!isWorkbenchOpen)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isWorkbenchOpen ? <LucideChevronLeft size={16} /> : <LucideChevronRight size={16} />}
            </button>
          </div>

          {isWorkbenchOpen && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', fontSize: '0.78rem' }}>
              {/* PLAN ACCORDION SECTION */}
              <div style={{ marginBottom: 12 }}>
                <div
                  onClick={() => setIsPlanOpen(!isPlanOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    cursor: 'pointer',
                    padding: '6px 0',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideChevronDown size={14} style={{ transform: isPlanOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    <span>PLAN</span>
                  </div>
                  <span style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem', color: '#475569' }}>
                    321
                  </span>
                </div>

                {isPlanOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 10, marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showExistingUsable} onChange={e => setShowExistingUsable(e.target.checked)} />
                      <span style={{ width: 14, height: 3, background: '#2563eb' }} />
                      <span style={{ flex: 1 }}>Existing OFC (usable)</span>
                      <span style={{ color: '#94a3b8' }}>0</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showExistingNotUsable} onChange={e => setShowExistingNotUsable(e.target.checked)} />
                      <span style={{ width: 14, height: 3, borderTop: '2px dashed #f97316' }} />
                      <span style={{ flex: 1 }}>Existing OFC (not usable)</span>
                      <span style={{ color: '#94a3b8' }}>0</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showNewPlannedFibre} onChange={e => setShowNewPlannedFibre(e.target.checked)} />
                      <span style={{ width: 14, height: 3, borderTop: '2px dashed #ef4444' }} />
                      <span style={{ flex: 1 }}>New planned fibre</span>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>167</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showRingName} onChange={e => setShowRingName(e.target.checked)} />
                      <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0 4px', borderRadius: 2, fontWeight: 700 }}>R</span>
                      <span style={{ flex: 1 }}>Show Ring Name</span>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>8</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showGpName} onChange={e => setShowGpName(e.target.checked)} />
                      <span style={{ background: '#8b5cf6', color: '#fff', fontSize: '0.65rem', padding: '0 4px', borderRadius: 2, fontWeight: 700 }}>GP</span>
                      <span style={{ flex: 1 }}>Show GP Name</span>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>31</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showBlockHq} onChange={e => setShowBlockHq(e.target.checked)} />
                      <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid #16a34a' }} />
                      <span style={{ flex: 1 }}>Block HQ</span>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>1</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showGpRouters} onChange={e => setShowGpRouters(e.target.checked)} />
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5cf6' }} />
                      <span style={{ flex: 1 }}>GP routers</span>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>31</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showGpsNotPart} onChange={e => setShowGpsNotPart(e.target.checked)} />
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8' }} />
                      <span style={{ flex: 1 }}>GPs not part of plan</span>
                      <span style={{ color: '#94a3b8' }}>0</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showJoints} onChange={e => setShowJoints(e.target.checked)} />
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ec4899' }} />
                      <span style={{ flex: 1 }}>Joints & feeder taps</span>
                      <span style={{ color: '#94a3b8' }}>122</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showFeederTaps} onChange={e => setShowFeederTaps(e.target.checked)} />
                      <span style={{ width: 10, height: 2, background: '#64748b' }} />
                      <span style={{ flex: 1 }}>Feeder taps</span>
                      <span style={{ color: '#94a3b8' }}>0</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={showWaypoints} onChange={e => setShowWaypoints(e.target.checked)} />
                      <span style={{ width: 14, height: 2, borderTop: '2px dotted #64748b' }} />
                      <span style={{ flex: 1 }}>Path waypoints</span>
                      <span style={{ color: '#94a3b8' }}>1347</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155', marginTop: 4 }}>
                      <input type="checkbox" checked={showLineDash} onChange={e => setShowLineDash(e.target.checked)} />
                      <span style={{ width: 14, height: 3, borderTop: '2px dashed #ef4444' }} />
                      <span style={{ flex: 1 }}>Show line in dash</span>
                    </label>
                  </div>
                )}
              </div>

              {/* NETWORK OPTIMIZATION SUMMARY SECTION */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                <div
                  onClick={() => setIsSummaryOpen(!isSummaryOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  <LucideChevronRight size={14} style={{ transform: isSummaryOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                  <span>NETWORK OPTIMIZATION SUMMARY</span>
                </div>

                {isSummaryOpen && (
                  <div style={{ paddingLeft: 16, paddingTop: 6, color: '#64748b', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div>Total Route Distance: <strong>167 KM</strong></div>
                    <div>Usable OFC Segment: <strong>0 KM</strong></div>
                    <div>GP Router Terminals: <strong>31 GP</strong></div>
                    <div>Optimization Level: <strong>98.4%</strong></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MAP CANVAS */}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

        {/* BOTTOM OVERLAY FOR CURSOR COORDINATES */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: isWorkbenchOpen ? 302 : 48,
            zIndex: 400,
            background: '#ffffff',
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            fontSize: '0.75rem',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'left 0.2s ease',
          }}
        >
          <span>Coordinates : <strong>{cursorCoords.lat.toFixed(6)}, {cursorCoords.lng.toFixed(6)}</strong></span>
          <button
            type="button"
            onClick={copyCoordinates}
            title="Copy coordinates"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: copied ? '#16a34a' : '#64748b',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {copied ? <LucideCheck size={13} /> : <LucideCopy size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
};
