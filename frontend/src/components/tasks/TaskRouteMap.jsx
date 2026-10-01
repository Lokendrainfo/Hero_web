import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideMaximize2, LucideMinimize2, LucideDownload, LucideCopy, LucideCheck, LucideRefreshCw
} from 'lucide-react';
import {
  bindGisZoomLabels,
  gisPopupHtml,
  gpNodeIcon,
  pitIcon as createPitIcon,
} from '../../utils/gisMapMarkers';
import { AlignPlanMapButton } from '../planner/AlignPlanMapButton';
import { PlanLayerManagementPanel } from '../planner/PlanLayerManagementPanel';
import { renderPlannerLayersOnLeaflet, calculateMultiPlanBounds } from '../../utils/plannerMapUtils';

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
  coveredKm = 0,
  plannedScopeKm = 0,
  progressPct = 0,
  height = '600px',
  title = 'Route map',
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const plannerLayerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const wrapperRef = useRef(null);

  const plannerLayerGroupsRef = useRef(new Map());
  const [activePlansList, setActivePlansList] = useState([]);

  const handleAlignMultiPlans = (plansList, combinedBounds, summaryStats) => {
    if (!Array.isArray(plansList) || plansList.length === 0) return;

    setActivePlansList(plansList);

    if (mapInstanceRef.current) {
      // Clear existing per-plan feature groups
      plannerLayerGroupsRef.current.forEach((fg) => {
        try { mapInstanceRef.current.removeLayer(fg); } catch (e) {}
      });
      plannerLayerGroupsRef.current.clear();

      plansList.forEach((plan) => {
        const fg = L.featureGroup().addTo(mapInstanceRef.current);
        plannerLayerGroupsRef.current.set(plan.planId, fg);

        renderPlannerLayersOnLeaflet(
          fg,
          plan.paths,
          plan.nodes,
          {
            routeColor: plan.color?.stroke || '#0284c7',
            nodeColor: plan.color?.node || '#0369a1',
            planName: plan.planName,
            clear: true
          }
        );
      });

      if (combinedBounds) {
        mapInstanceRef.current.fitBounds(combinedBounds, {
          padding: [40, 40],
          maxZoom: 18,
          animate: true
        });
      }
    }
  };

  const togglePlanVisibility = (planId) => {
    setActivePlansList((prev) => {
      const next = prev.map((p) => {
        if (p.planId === planId) {
          const newVis = !p.visible;
          const fg = plannerLayerGroupsRef.current.get(planId);
          if (fg && mapInstanceRef.current) {
            if (newVis) {
              mapInstanceRef.current.addLayer(fg);
            } else {
              mapInstanceRef.current.removeLayer(fg);
            }
          }
          return { ...p, visible: newVis };
        }
        return p;
      });

      const visiblePlans = next.filter((p) => p.visible);
      const newBounds = calculateMultiPlanBounds(visiblePlans);
      if (newBounds && mapInstanceRef.current) {
        mapInstanceRef.current.fitBounds(newBounds, { padding: [40, 40], maxZoom: 18, animate: true });
      }

      return next;
    });
  };

  const removePlanFromMap = (planId) => {
    setActivePlansList((prev) => {
      const next = prev.filter((p) => p.planId !== planId);
      const fg = plannerLayerGroupsRef.current.get(planId);
      if (fg && mapInstanceRef.current) {
        try { mapInstanceRef.current.removeLayer(fg); } catch (e) {}
        plannerLayerGroupsRef.current.delete(planId);
      }

      const visiblePlans = next.filter((p) => p.visible);
      const newBounds = calculateMultiPlanBounds(visiblePlans);
      if (newBounds && mapInstanceRef.current) {
        mapInstanceRef.current.fitBounds(newBounds, { padding: [40, 40], maxZoom: 18, animate: true });
      }

      return next;
    });
  };

  const handleAlignPlan = (planSummary) => {
    if (!planSummary || !mapInstanceRef.current) return;
    if (!plannerLayerRef.current) {
      plannerLayerRef.current = L.featureGroup().addTo(mapInstanceRef.current);
    }
    renderPlannerLayersOnLeaflet(
      plannerLayerRef.current,
      planSummary.paths,
      planSummary.nodes
    );
    if (planSummary.bounds) {
      mapInstanceRef.current.fitBounds(planSummary.bounds, {
        padding: [40, 40],
        maxZoom: 18,
        animate: true
      });
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapType, setMapType] = useState('street');

  // Road-to-road snapped coordinates state
  const [roadPoints, setRoadPoints] = useState([]);

  // Dynamic Lat/Lng Cursor Coordinates Tracking
  const [cursorCoords, setCursorCoords] = useState({ lat: 29.841128, lng: 73.536244 });
  const [copied, setCopied] = useState(false);

  // Calculated Header Display Values
  const displayPlanName = planName || (routeNodes[0]?.name ? `${routeNodes[0].name} ROUTE` : 'JC0039-JC0076');
  const displayCircle = circle || 'RAJASTHAN';
  const displayDistrict = district || 'GANGANAGAR';
  const displayBlock = block || 'ANUPGARH';
  const displayGpCount = gpCount || (routeNodes.length > 0 ? routeNodes.length : (childRoutes.length || 2));

  const effectivePct = progressPct > 0 ? progressPct : (coveredKm > 0 && plannedScopeKm > 0 ? Math.min(100, Math.round((coveredKm / plannedScopeKm) * 100)) : 0);

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
    a.download = `${displayPlanName.replace(/[^a-zA-Z0-9]/g, '_')}_route.kml`;
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
      center: [29.841128, 73.536244],
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

  // 3. Fetch Road-to-Road Snapped Route Geometry via OSRM
  useEffect(() => {
    let isCancelled = false;

    let orderedNodes = [...routeNodes];
    if (orderedNodes.length === 0 && segmentSnapshots.length > 0) {
      segmentSnapshots.forEach((seg, idx) => {
        if (seg.startNode) orderedNodes.push(seg.startNode);
        if (idx === segmentSnapshots.length - 1 && seg.endNode) orderedNodes.push(seg.endNode);
      });
    }
    if (orderedNodes.length === 0 && currentNode && nextNode) {
      orderedNodes = [currentNode, nextNode];
    }

    const inputPts = [];
    orderedNodes.forEach(node => {
      const pt = parseLatLng(node);
      if (pt) inputPts.push(pt);
    });

    if (depthCaptures.length > 0) {
      depthCaptures.forEach(dp => {
        const pt = parseLatLng(dp);
        if (pt) inputPts.push(pt);
      });
    }

    if (inputPts.length === 0) {
      setRoadPoints([]);
      return;
    }

    // If inputPts has 2-10 sparse points, snap to real road network via OSRM API
    if (inputPts.length >= 2 && inputPts.length <= 12) {
      const coordsStr = inputPts.map(pt => `${pt[1]},${pt[0]}`).join(';');
      fetch(`https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
          if (!isCancelled && data.routes && data.routes[0]?.geometry?.coordinates) {
            const snapped = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            setRoadPoints(snapped);
          } else if (!isCancelled) {
            setRoadPoints(inputPts);
          }
        })
        .catch(() => {
          if (!isCancelled) setRoadPoints(inputPts);
        });
    } else {
      setRoadPoints(inputPts);
    }

    return () => { isCancelled = true; };
  }, [routeNodes, currentNode, nextNode, segmentSnapshots, depthCaptures]);

  // 4. Render Clean Road-to-Road Route Layers (Green for Done, Yellow for Pending)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const allBounds = [];

    let orderedNodes = [...routeNodes];
    if (orderedNodes.length === 0 && currentNode && nextNode) {
      orderedNodes = [currentNode, nextNode];
    }

    // Process endpoints and GP nodes cleanly (No messy dummy red circles!)
    orderedNodes.forEach((node, idx) => {
      const pt = parseLatLng(node);
      if (!pt) return;
      allBounds.push(pt);

      const isStart = idx === 0 || (currentNode && (node.code === currentNode.code || node.name === currentNode.name));
      const isEnd = idx === orderedNodes.length - 1 || (nextNode && (node.code === nextNode.code || node.name === nextNode.name));
      const role = isStart ? 'start' : (isEnd ? 'end' : 'mid');

      const marker = L.marker(pt, {
        icon: gpNodeIcon({
          role: idx === 0 ? 'start' : role,
          name: node.name || node.code || `GP ${idx + 1}`,
          code: node.code || displayPlanName,
        }),
        zIndexOffset: 400,
      });

      marker.bindPopup(gisPopupHtml({
        eyebrow: isStart ? 'Start Point' : (isEnd ? 'End Point' : 'GP Router'),
        title: node.name || node.code || `GP ${idx + 1}`,
        rows: [
          ['Code', node.code || '—'],
          ['GPS', `${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}`],
          ['Status', idx === 0 ? 'COMPLETED' : 'IN_PROGRESS'],
        ],
      }), { maxWidth: 240, className: 'gis-popup' });

      layerGroup.addLayer(marker);
    });

    // Render Child Routes if Block Level
    childRoutes.forEach((route, rIdx) => {
      const isSelected = selectedRouteIndex === rIdx;
      const pts = [];

      const addEndpoint = (node, role) => {
        const pt = parseLatLng(node);
        if (!pt) return;
        pts.push(pt);
        allBounds.push(pt);

        const marker = L.marker(pt, {
          icon: gpNodeIcon({
            role,
            name: node.name || node.code || '',
            code: route.routeName || route.routeCode || '',
          }),
          zIndexOffset: isSelected ? 500 : 300,
        });
        layerGroup.addLayer(marker);
      };

      addEndpoint(route.currentNode, 'start');
      addEndpoint(route.nextNode, 'end');

      if (pts.length > 1) {
        const isRouteDone = route.status === 'COMPLETED' || route.coveredLengthKm >= route.lengthKm;
        const lineStyle = {
          color: isRouteDone ? '#16a34a' : '#f59e0b', // GREEN for Done, YELLOW for Pending
          weight: isSelected ? 5 : 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: !isRouteDone ? '8, 8' : undefined,
        };

        layerGroup.addLayer(L.polyline(pts, lineStyle));
      }
    });

    // RENDER ROAD-TO-ROAD ROUTE PROGRESS POLYLINES: GREEN (DONE) & YELLOW (PENDING)
    const ptsToRender = roadPoints.length > 0 ? roadPoints : [];

    if (ptsToRender.length > 1 && childRoutes.length === 0) {
      ptsToRender.forEach(pt => allBounds.push(pt));

      const totalPoints = ptsToRender.length;
      const completedIndex = Math.min(totalPoints - 1, Math.max(0, Math.round((totalPoints - 1) * (effectivePct / 100))));

      const donePoints = ptsToRender.slice(0, completedIndex + 1);
      const pendingPoints = ptsToRender.slice(completedIndex);

      // 1. GREEN LINE FOR COMPLETED / DONE PORTION (FOLLOWS ROAD)
      if (donePoints.length > 1) {
        const donePolyline = L.polyline(donePoints, {
          color: '#16a34a', // GREEN color for completed route
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        });
        layerGroup.addLayer(donePolyline);
      }

      // 2. YELLOW LINE FOR PENDING PORTION (FOLLOWS ROAD)
      if (pendingPoints.length > 1) {
        const pendingPolyline = L.polyline(pendingPoints, {
          color: '#f59e0b', // YELLOW color for pending route
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: '8, 8',
        });
        layerGroup.addLayer(pendingPolyline);
      }

      // 3. Render small waypoint dots along road turns (Matching Screenshot 2 & 3)
      const step = Math.max(1, Math.floor(ptsToRender.length / 30));
      ptsToRender.forEach((pt, idx) => {
        if (idx === 0 || idx === ptsToRender.length - 1 || idx % step === 0) {
          const isDonePt = idx <= completedIndex;
          const wptMarker = L.circleMarker(pt, {
            radius: 3.5,
            color: isDonePt ? '#16a34a' : '#ef4444',
            fillColor: '#ffffff',
            fillOpacity: 1,
            weight: 1.5,
          });
          layerGroup.addLayer(wptMarker);
        }
      });
    }

    // Render Pits / Joints cleanly only if HDD shot / trenching has started
    const hasTrenchingStarted = (depthCaptures && depthCaptures.length > 0) || (effectivePct > 0);
    if (hasTrenchingStarted && pits.length > 0) {
      pits.forEach((pit, idx) => {
        const pt = parseLatLng(pit);
        if (!pt) return;
        allBounds.push(pt);

        const pitName = pit.pitName || pit.pitSerialNo || pit.name || `PIT-${idx + 1}`;
        const marker = L.marker(pt, {
          icon: createPitIcon({ role: 'mid', name: pitName }),
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
    routeNodes, currentNode, nextNode, segmentSnapshots, childRoutes, selectedRouteIndex, pits, depthCaptures, effectivePct, roadPoints
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
          {/* LEGEND INDICATORS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 8, fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 14, height: 4, background: '#16a34a', borderRadius: 2 }} />
              <span style={{ color: '#16a34a', fontWeight: 700 }}>Done ({effectivePct}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 14, height: 4, background: '#f59e0b', borderRadius: 2 }} />
              <span style={{ color: '#d97706', fontWeight: 700 }}>Pending</span>
            </div>
          </div>

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

          <AlignPlanMapButton
            currentPlanId={''}
            onAlignMultiPlans={handleAlignMultiPlans}
            onAlignPlan={handleAlignPlan}
          />

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

      {/* 2. FULL WIDTH MAP CANVAS */}
      <div style={{ position: 'relative', flex: 1, width: '100%' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

        {/* DT Planner Multi-Plan Layer Management Panel */}
        <PlanLayerManagementPanel
          activePlansList={activePlansList}
          onToggleVisibility={togglePlanVisibility}
          onRemovePlan={removePlanFromMap}
          onFitBounds={() => {
            const visiblePlans = activePlansList.filter((p) => p.visible);
            const bounds = calculateMultiPlanBounds(visiblePlans);
            if (bounds && mapInstanceRef.current) {
              mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 18, animate: true });
            }
          }}
        />

        {/* BOTTOM OVERLAY FOR CURSOR COORDINATES */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
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
