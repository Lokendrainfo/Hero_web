import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LucideMaximize2, LucideMinimize2, LucideLayers } from 'lucide-react';
import { formatImageUrl } from '../common/PhotoLightbox';

export const TaskRouteMap = ({
  routeNodes = [],
  currentNode = null,
  nextNode = null,
  segmentSnapshots = [],
  childRoutes = [],
  selectedRouteIndex = null,
  pits = [],
  depthCaptures = [],
  height = '500px',
  title = 'Interactive Route Topology & Execution Map',
  onOpenPhotos = null
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const polylineRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map instance
    if (!mapInstanceRef.current) {
      const defaultCenter = [29.951658, 73.463680];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 12,
        zoomControl: false,
        attributionControl: false
      });

      // Google Maps Roadmap Tile Layer
      L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      }).addTo(map);

      // Attribution Control
      const attributionControl = L.control({ position: 'bottomright' });
      attributionControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'leaflet-control-attribution');
        div.style.background = 'rgba(255, 255, 255, 0.85)';
        div.style.padding = '2px 8px';
        div.style.fontSize = '11px';
        div.style.color = '#374151';
        div.style.borderRadius = '4px 0 0 0';
        div.innerHTML = '&copy; Google Maps';
        return div;
      };
      attributionControl.addTo(map);

      mapInstanceRef.current = map;
      layerGroupRef.current = L.featureGroup().addTo(map);
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    // Clear previous layers
    layerGroup.clearLayers();
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    const allBounds = [];

    // 1. Build Route Nodes Chain
    let orderedNodes = [...routeNodes];

    // If segmentSnapshots exist, build node chain order
    if (orderedNodes.length === 0 && segmentSnapshots.length > 0) {
      segmentSnapshots.forEach((seg, idx) => {
        if (seg.startNode && seg.startNode.lat && seg.startNode.lng) {
          orderedNodes.push(seg.startNode);
        }
        if (idx === segmentSnapshots.length - 1 && seg.endNode && seg.endNode.lat && seg.endNode.lng) {
          orderedNodes.push(seg.endNode);
        }
      });
    }

    const validRoutePts = [];
    orderedNodes.forEach((node, idx) => {
      const lat = parseFloat(node.lat || node.latitude);
      const lng = parseFloat(node.lng || node.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const pt = [lat, lng];
      validRoutePts.push(pt);
      allBounds.push(pt);

      const isStart = idx === 0 || (currentNode && (node.code === currentNode.code || node.name === currentNode.name));
      const isEnd = idx === orderedNodes.length - 1 || (nextNode && (node.code === nextNode.code || node.name === nextNode.name));

      let badgeBg = '#8b5cf6';
      let borderCol = '#6d28d9';
      let labelText = `INTERMEDIATE NODE: ${node.name || node.code || `P${idx+1}`}`;
      let roleType = 'Intermediate Joint Node';

      if (isStart) {
        badgeBg = '#10b981';
        borderCol = '#047857';
        labelText = `START NODE: ${node.name || node.code}`;
        roleType = 'Route Start GP Node';
      } else if (isEnd) {
        badgeBg = '#ef4444';
        borderCol = '#b91c1c';
        labelText = `END NODE: ${node.name || node.code}`;
        roleType = 'Route Target GP Node';
      }

      const nodeIcon = L.divIcon({
        className: 'custom-route-node-marker',
        html: `
          <div style="
            background: ${badgeBg};
            color: #ffffff;
            border: 2px solid ${borderCol};
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.72rem;
            font-weight: 800;
            white-space: nowrap;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
          ">
            <span>📍</span> ${node.name || node.code}
          </div>
        `,
        iconSize: [120, 28],
        iconAnchor: [60, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker(pt, { icon: nodeIcon });
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; padding: 4px; min-width: 190px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: #1e293b;">${labelText}</div>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">Role: <strong>${roleType}</strong></div>
          <div style="font-size: 0.75rem; color: #64748b;">Code: <strong>${node.code || 'N/A'}</strong></div>
          <div style="font-size: 0.72rem; color: #0284c7; margin-top: 4px; font-family: monospace;">
            📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);
      layerGroup.addLayer(marker);
    });

    // 2. Draw Task Route Polyline
    if (validRoutePts.length > 1) {
      polylineRef.current = L.polyline(validRoutePts, {
        color: '#7c3aed',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 8'
      }).addTo(map);
    }

    // 2b. Draw Child Routes (for BLOCK level tasks)
    if (Array.isArray(childRoutes) && childRoutes.length > 0) {
      const selectedBounds = [];
      childRoutes.forEach((route, rIdx) => {
        const routeColor = route.color || '#7c3aed';
        const isSelected = selectedRouteIndex === rIdx;
        const cNode = route.currentNode;
        const nNode = route.nextNode;

        const pts = [];

        if (cNode && (cNode.lat || cNode.latitude) && (cNode.lng || cNode.longitude)) {
          const lat = parseFloat(cNode.lat || cNode.latitude);
          const lng = parseFloat(cNode.lng || cNode.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            const pt = [lat, lng];
            pts.push(pt);
            allBounds.push(pt);
            if (isSelected) selectedBounds.push(pt);

            const cIcon = L.divIcon({
              className: 'custom-child-route-cnode',
              html: `
                <div style="
                  background: ${routeColor};
                  color: #ffffff;
                  border: 2px solid #ffffff;
                  padding: 3px 8px;
                  border-radius: 10px;
                  font-size: 0.7rem;
                  font-weight: 800;
                  white-space: nowrap;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                  cursor: pointer;
                  ${isSelected ? 'transform: scale(1.15); font-size: 0.78rem;' : ''}
                ">
                  <span>📍</span> ${route.routeName || 'Route'}: ${cNode.name || cNode.code}
                </div>
              `,
              iconSize: [140, 26],
              iconAnchor: [70, 13]
            });
            const m = L.marker(pt, { icon: cIcon });
            m.bindPopup(`
              <div style="font-family: Inter, sans-serif; padding: 4px;">
                <div style="font-weight: 800; color: ${routeColor}; font-size: 0.9rem;">${route.routeName} - Start Node</div>
                <div style="font-size: 0.75rem; color: #1e293b; margin-top: 2px;">Name: <strong>${cNode.name}</strong></div>
                <div style="font-size: 0.75rem; color: #475569;">Code: <strong>${cNode.code}</strong></div>
                <div style="font-size: 0.72rem; color: #0284c7; margin-top: 4px; font-family: monospace;">📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
              </div>
            `);
            layerGroup.addLayer(m);
          }
        }

        if (nNode && (nNode.lat || nNode.latitude) && (nNode.lng || nNode.longitude)) {
          const lat = parseFloat(nNode.lat || nNode.latitude);
          const lng = parseFloat(nNode.lng || nNode.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            const pt = [lat, lng];
            pts.push(pt);
            allBounds.push(pt);
            if (isSelected) selectedBounds.push(pt);

            const nIcon = L.divIcon({
              className: 'custom-child-route-nnode',
              html: `
                <div style="
                  background: ${routeColor};
                  color: #ffffff;
                  border: 2px solid #ffffff;
                  padding: 3px 8px;
                  border-radius: 10px;
                  font-size: 0.7rem;
                  font-weight: 800;
                  white-space: nowrap;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                  cursor: pointer;
                  ${isSelected ? 'transform: scale(1.15); font-size: 0.78rem;' : ''}
                ">
                  <span>🏁</span> ${route.routeName || 'Route'}: ${nNode.name || nNode.code}
                </div>
              `,
              iconSize: [140, 26],
              iconAnchor: [70, 13]
            });
            const m = L.marker(pt, { icon: nIcon });
            m.bindPopup(`
              <div style="font-family: Inter, sans-serif; padding: 4px;">
                <div style="font-weight: 800; color: ${routeColor}; font-size: 0.9rem;">${route.routeName} - Target Node</div>
                <div style="font-size: 0.75rem; color: #1e293b; margin-top: 2px;">Name: <strong>${nNode.name}</strong></div>
                <div style="font-size: 0.75rem; color: #475569;">Code: <strong>${nNode.code}</strong></div>
                <div style="font-size: 0.72rem; color: #0284c7; margin-top: 4px; font-family: monospace;">📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
              </div>
            `);
            layerGroup.addLayer(m);
          }
        }

        if (pts.length > 1) {
          L.polyline(pts, {
            color: routeColor,
            weight: isSelected ? 6 : 4,
            opacity: isSelected ? 1.0 : 0.8,
            dashArray: isSelected ? '10, 5' : '6, 6'
          }).addTo(layerGroup);
        }
      });

      if (selectedBounds.length > 0) {
        map.fitBounds(selectedBounds, { padding: [50, 50] });
      }
    }

    // 3. Process Execution Pits with Depth Labels
    pits.forEach((pit, idx) => {
      const lat = parseFloat(pit.latitude || pit.pitImage_1?.latitude || pit.pitDepthImage?.latitude || (validRoutePts[0] ? validRoutePts[0][0] : null));
      const lng = parseFloat(pit.longitude || pit.pitImage_1?.longitude || pit.pitDepthImage?.longitude || (validRoutePts[0] ? validRoutePts[0][1] : null));

      if (isNaN(lat) || isNaN(lng) || lat === null || lng === null) return;

      const pt = [lat, lng];
      allBounds.push(pt);

      const pitName = pit.pitSerialNo || pit.pitName || `PIT-${idx + 1}`;
      const depthVal = pit.pitDepth !== undefined ? pit.pitDepth : (pit.depth !== undefined ? pit.depth : 'N/A');
      const widthVal = pit.pitWidth !== undefined ? pit.pitWidth : 'N/A';

      const photoList = [
        pit.pitImage_1, pit.pitImage_2, pit.pitImage_3,
        pit.pitDepthImage, pit.pitWidthImage,
        pit.threePointReference?.threePointReferenceImage_1,
        pit.threePointReference?.threePointReferenceImage_2,
        pit.threePointReference?.threePointReferenceImage_3,
        pit.threePointReference?.pitDepthCenterOfTheRoadImage
      ].filter(p => p && (p.photoUrl || p.url));

      const pitIcon = L.divIcon({
        className: 'custom-pit-marker',
        html: `
          <div style="
            background: #f59e0b;
            color: #451a03;
            border: 2px solid #b45309;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 800;
            white-space: nowrap;
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
          ">
            <span>🚜</span> ${pitName} (${depthVal}m)
          </div>
        `,
        iconSize: [110, 26],
        iconAnchor: [55, 13],
        popupAnchor: [0, -13]
      });

      const marker = L.marker(pt, { icon: pitIcon });
      const popupId = `btn-pit-photos-${idx}`;
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; padding: 4px; min-width: 210px;">
          <div style="font-weight: 800; font-size: 0.95rem; color: #78350f;">🚜 ${pitName} (${pit.pitName || ''})</div>
          <div style="font-size: 0.78rem; color: #451a03; margin-top: 4px; line-height: 1.5;">
            Status: <strong style="color: #059669;">${pit.taskStage || pit.status || 'LOCKED'}</strong><br/>
            Depth: <strong style="color: #059669; font-size: 0.85rem;">${depthVal} m</strong> | Width: <strong>${widthVal} m</strong><br/>
            Side: <strong>${pit.pitSide || 'LHS'}</strong> | Type: <strong>${pit.pitType || 'COUPLING'}</strong><br/>
            📍 Lat: <strong>${lat.toFixed(6)}</strong>, Lng: <strong>${lng.toFixed(6)}</strong>
          </div>
          ${photoList.length > 0 ? `
            <button id="${popupId}" style="
              margin-top: 8px;
              width: 100%;
              background: #d97706;
              color: #ffffff;
              border: none;
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 0.75rem;
              font-weight: 700;
              cursor: pointer;
            ">
              📷 View ${photoList.length} PIT Photos →
            </button>
          ` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('popupopen', () => {
        const btn = document.getElementById(popupId);
        if (btn && onOpenPhotos) {
          btn.onclick = () => onOpenPhotos(photoList, 0);
        }
      });

      layerGroup.addLayer(marker);
    });

    // 4. Process HDD Depth Capture Points
    depthCaptures.forEach((dp, idx) => {
      const lat = parseFloat(dp.latitude);
      const lng = parseFloat(dp.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const pt = [lat, lng];
      allBounds.push(pt);

      const dpIcon = L.divIcon({
        className: 'custom-depth-capture-marker',
        html: `
          <div style="
            background: #0284c7;
            color: #ffffff;
            border: 2px solid #0369a1;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 0.65rem;
            font-weight: 800;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            cursor: pointer;
          ">
            📏 Pt ${idx + 1}: ${dp.depth}m
          </div>
        `,
        iconSize: [85, 22],
        iconAnchor: [42, 11],
        popupAnchor: [0, -11]
      });

      const marker = L.marker(pt, { icon: dpIcon });
      const dpPopupId = `btn-dp-photo-${idx}`;
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; padding: 4px; min-width: 180px;">
          <div style="font-weight: 700; font-size: 0.88rem; color: #0369a1;">📏 Depth Record Point ${idx + 1}</div>
          <div style="font-size: 0.75rem; color: #334155; margin-top: 4px;">
            Depth: <strong style="color: #059669; font-size: 0.85rem;">${dp.depth} m</strong><br/>
            Temperature: <strong>${dp.temperature}°C</strong><br/>
            Road Offset: <strong>${dp.offsetFromCenterOfRoad} m</strong><br/>
            📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}
          </div>
          ${dp.depthoMeterImage?.photoUrl ? `
            <button id="${dpPopupId}" style="
              margin-top: 6px;
              width: 100%;
              background: #0284c7;
              color: #ffffff;
              border: none;
              padding: 4px 8px;
              border-radius: 6px;
              font-size: 0.72rem;
              font-weight: 700;
              cursor: pointer;
            ">
              📷 View Depth Photo
            </button>
          ` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('popupopen', () => {
        const btn = document.getElementById(dpPopupId);
        if (btn && onOpenPhotos && dp.depthoMeterImage) {
          btn.onclick = () => onOpenPhotos([dp.depthoMeterImage], 0);
        }
      });

      layerGroup.addLayer(marker);
    });

    // Fit map bounds
    if (allBounds.length > 1) {
      map.fitBounds(allBounds, { padding: [40, 40] });
    } else if (allBounds.length === 1) {
      map.setView(allBounds[0], 14);
    }
  }, [routeNodes, currentNode, nextNode, segmentSnapshots, childRoutes, selectedRouteIndex, pits, depthCaptures]);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: isFullscreen ? '100vh' : height,
        borderRadius: isFullscreen ? '0' : '14px',
        overflow: 'hidden',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a' }}>
            {title}
          </span>
          <span style={{ fontSize: '0.7rem', background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
            {routeNodes.length} Nodes • {pits.length} Pits • {depthCaptures.length} Depths
          </span>
        </div>

        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '4px 8px',
            cursor: 'pointer',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.75rem',
            fontWeight: '600'
          }}
        >
          {isFullscreen ? <LucideMinimize2 size={14} /> : <LucideMaximize2 size={14} />}
          <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
      </div>

      {/* Map Container */}
      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

        {/* Map Legend Overlay Box */}
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 999,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(4px)',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '8px 12px',
          fontSize: '0.72rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{ fontWeight: '800', fontSize: '0.75rem', color: '#0f172a', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <LucideLayers size={13} color="#7c3aed" />
            <span>Map Layers Legend</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            <span>🟢 START Node</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <span>🔴 END Node</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6d28d9' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />
            <span>🟣 INTERMEDIATE Node</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#78350f' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span>🟡 PIT Marker & Depth</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#0284c7', display: 'inline-block' }} />
            <span>🔵 Depth Record Point</span>
          </div>
        </div>
      </div>
    </div>
  );
};
