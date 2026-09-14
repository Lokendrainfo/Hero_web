import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';

export const LeafletMap = ({
  machines = [],
  singleMachine = null,
  height = '480px',
  zoom = 13,
  showRoute = false,
  routePoints = [],
  title = "Location",
  loading = false,
  chrome = true,
  fill = false
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const polylineRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();

  const activeMachines = singleMachine ? [singleMachine] : machines;

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

    // Initialize map instance if not existing
    if (!mapInstanceRef.current) {
      const defaultCenter = singleMachine
        ? [singleMachine.latitude || singleMachine.current_latitude || 27.714995, singleMachine.longitude || singleMachine.current_longitude || 74.64694]
        : [27.714995, 74.64694];

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: zoom,
        zoomControl: false,
        attributionControl: false
      });

      // Google Maps Roadmap Tile Layer
      L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      }).addTo(map);

      // Custom Attribution Control matching screenshot
      const attributionControl = L.control({ position: 'bottomright' });
      attributionControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'leaflet-control-attribution');
        div.style.background = 'rgba(255, 255, 255, 0.85)';
        div.style.padding = '2px 8px';
        div.style.fontSize = '11px';
        div.style.color = '#374151';
        div.style.borderRadius = '4px 0 0 0';
        div.innerHTML = '<a href="https://maps.google.com" target="_blank" style="color: #2563eb; text-decoration: none;">Google Maps</a>';
        return div;
      };
      attributionControl.addTo(map);

      mapInstanceRef.current = map;
      markersGroupRef.current = L.featureGroup().addTo(map);
    }

    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;

    // Clear previous markers & polylines
    markersGroup.clearLayers();
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (!activeMachines || activeMachines.length === 0) return;

    const bounds = [];

    activeMachines.forEach(m => {
      const lat = parseFloat(m.latitude || m.current_latitude || 27.714995);
      const lng = parseFloat(m.longitude || m.current_longitude || 74.64694);

      if (isNaN(lat) || isNaN(lng)) return;

      bounds.push([lat, lng]);

      const course = m.course_deg || m.heading || 45;
      const status = (m.status || 'RUNNING').toUpperCase();

      // Custom mint-green circular disc directional arrow marker matching screenshot 1
      const customIcon = L.divIcon({
        className: 'custom-live-location-disc-marker',
        html: `
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #6ee7b7;
            border: 2.5px solid #059669;
            box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.28), 0 3px 8px rgba(0, 0, 0, 0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.15s ease;
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" style="transform: rotate(${course}deg); transform-origin: center;">
              <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#0f172a" />
            </svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const popupContent = `
        <div style="font-family: Inter, sans-serif; min-width: 220px; padding: 4px;">
          <div style="font-family: Inter, sans-serif; font-size: 0.9375rem; font-weight: 600; color: #111827;">
            ${m.name || m.model_name || 'HDD Machine'}
          </div>
          <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 6px;">
            Chassis: <strong>${m.chassis_no || m.machine_chassis_no || m.serial_number || '600202608396'}</strong>
          </div>
          <div style="display: flex; gap: 6px; margin-bottom: 8px;">
            <span style="background: #111827; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 600;">
              ${status}
            </span>
            <span style="background: #f3f4f6; color: #374151; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 600;">
              ${m.speed !== undefined ? m.speed + ' km/h' : '0.92 km/h'}
            </span>
          </div>
          <div style="font-size: 0.78rem; color: #4b5563; line-height: 1.5;">
            📍 Latitude: <strong>${lat.toFixed(6)}</strong><br/>
            📍 Longitude: <strong>${lng.toFixed(6)}</strong><br/>
            📍 Site: <strong>${m.site_name || m.location_name || 'Sujangarh-SITE'}</strong><br/>
            👤 Operator: <strong>${m.operator_name || (m.operator?.name) || 'Swarnim Mittal'}</strong><br/>
            ⛽ Fuel Level: <strong>${m.fuel_level || m.current_fuel_level || 6} L</strong>
          </div>
          <button id="btn-inspect-${m.id || 1}" style="
            margin-top: 10px;
            width: 100%;
            background: #111827;
            color: #ffffff;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.78rem;
            font-weight: 600;
            cursor: pointer;
          ">
            Inspect Machine →
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-inspect-${m.id || 1}`);
        if (btn) {
          btn.onclick = () => navigate(`/machines/${m.id || 1}`);
        }
      });

      markersGroup.addLayer(marker);
    });

    // Draw historic route polyline only if showRoute is true AND explicit routePoints are provided
    if (showRoute && Array.isArray(routePoints) && routePoints.length > 1) {
      polylineRef.current = L.polyline(routePoints, {
        color: '#111827',
        weight: 2,
        dashArray: '4, 6',
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
    }

    // Fit map view bounds
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], zoom);
    }

    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* ignore */ }
    }, 80);
  }, [machines, singleMachine, zoom, showRoute, routePoints]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const el = wrapperRef.current;
    if (!map || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      try { map.invalidateSize(); } catch (e) { /* ignore */ }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: isFullscreen || fill ? '100%' : height,
        borderRadius: isFullscreen || !chrome ? '0' : '6px',
        overflow: 'hidden',
        background: '#ffffff',
        border: chrome && !fill && !isFullscreen ? '1px solid #e5e7eb' : 'none',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      {chrome ? (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
            {title}
          </span>
          <span className="badge-pill badge-running">Live</span>
        </div>

        <button
          type="button"
          className="header-icon-btn"
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
        >
          ⤢
        </button>
      </div>
      ) : (
        <button
          type="button"
          className="header-icon-btn"
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 20, background: '#fff', border: '1px solid #e5e7eb' }}
        >
          ⤢
        </button>
      )}

      {/* Map Container */}
      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

        {/* Compass Rose Widget in Bottom Right */}
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '14px',
          zIndex: 999,
          width: '44px',
          height: '44px',
          background: '#ffffff',
          borderRadius: '50%',
          boxShadow: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #e5e7eb',
          pointerEvents: 'none'
        }}>
          <svg width="36" height="36" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#e5e7eb" strokeWidth="2"/>
            <text x="50" y="20" fontSize="15" fontWeight="bold" fill="#dc2626" textAnchor="middle">N</text>
            <text x="50" y="92" fontSize="14" fontWeight="bold" fill="#4b5563" textAnchor="middle">S</text>
            <text x="14" y="55" fontSize="14" fontWeight="bold" fill="#4b5563" textAnchor="middle">W</text>
            <text x="86" y="55" fontSize="14" fontWeight="bold" fill="#4b5563" textAnchor="middle">E</text>
            <polygon points="50,26 44,50 50,44 56,50" fill="#dc2626"/>
            <polygon points="50,74 44,50 50,56 56,50" fill="#6b7280"/>
          </svg>
        </div>
      </div>
    </div>
  );
};
