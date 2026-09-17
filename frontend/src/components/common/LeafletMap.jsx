import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';

const statusColors = {
  RUNNING: { fill: '#059669', ring: '#047857', glow: 'rgba(5, 150, 105, 0.28)', label: 'Working' },
  IDLE: { fill: '#d97706', ring: '#b45309', glow: 'rgba(217, 119, 6, 0.28)', label: 'Idle' },
  MAINTENANCE: { fill: '#7c3aed', ring: '#6d28d9', glow: 'rgba(124, 58, 237, 0.28)', label: 'Maintenance' },
  OFFLINE: { fill: '#64748b', ring: '#475569', glow: 'rgba(100, 116, 139, 0.28)', label: 'Offline' },
};

function fmt(val, digits = 1, suffix = '') {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return `${n.toFixed(digits)}${suffix}`;
}

function buildMarkerHtml(course, status) {
  const colors = statusColors[status] || statusColors.RUNNING;
  const deg = Number.isFinite(Number(course)) ? Number(course) : 0;
  return `
    <div class="tracking-arrow-wrap" style="
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
    ">
      <div style="
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: ${colors.fill};
        border: 2.5px solid #ffffff;
        box-shadow:
          0 0 0 2px ${colors.ring},
          0 2px 8px rgba(15, 23, 42, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          style="
            transform: rotate(${deg}deg);
            transform-origin: center center;
            display: block;
            transition: transform 0.3s ease;
          "
        >
          <path
            d="M12 2.5 L19.5 20.5 L12 16.2 L4.5 20.5 Z"
            fill="#ffffff"
            stroke="rgba(15,23,42,0.18)"
            stroke-width="0.8"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </div>
  `;
}

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
  fill = false,
  fitToken = null,
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const polylineRef = useRef(null);
  const hasFittedBoundsRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();

  const activeMachines = singleMachine ? [singleMachine] : machines;
  const machinesKey = useMemo(
    () => activeMachines.map((m) => m.id || m.machine_id || m.chassis_no).join(','),
    [activeMachines]
  );

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  useEffect(() => {
    hasFittedBoundsRef.current = false;
  }, [fitToken, machinesKey, singleMachine?.id]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

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

      L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      }).addTo(map);

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

    markersGroup.clearLayers();
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (!activeMachines || activeMachines.length === 0) return;

    const bounds = [];

    activeMachines.forEach(m => {
      const lat = parseFloat(m.latitude ?? m.current_latitude);
      const lng = parseFloat(m.longitude ?? m.current_longitude);

      if (isNaN(lat) || isNaN(lng)) return;

      bounds.push([lat, lng]);

      const course = m.course_deg ?? m.tilt ?? m.heading ?? 0;
      const status = (m.status || 'RUNNING').toUpperCase();
      const colors = statusColors[status] || statusColors.RUNNING;
      const headingLabel = m.heading_label || '';

      const customIcon = L.divIcon({
        className: 'tracking-arrow-marker custom-live-location-arrow-marker',
        html: buildMarkerHtml(course, status),
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const popupContent = `
        <div style="font-family: inherit; min-width: 240px; max-width: 280px; padding: 2px;">
          <div style="font-size: 0.95rem; font-weight: 700; color: #0f172a;">
            ${m.name || m.model_name || 'HDD Machine'}
          </div>
          <div style="font-size: 0.75rem; color: #64748b; margin: 2px 0 8px;">
            Chassis <strong style="color:#334155">${m.chassis_no || m.machine_chassis_no || m.serial_number || '—'}</strong>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
            <span style="background: ${colors.fill}; color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 700;">
              ${colors.label || status}
            </span>
            <span style="background: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600;">
              ${fmt(m.speed, 2)} km/h
            </span>
            <span style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600;">
              Heading ${fmt(course, 0)}° ${headingLabel}
            </span>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size: 0.75rem; color: #475569; line-height: 1.35;">
            <div>Lat <strong style="color:#0f172a">${lat.toFixed(6)}</strong></div>
            <div>Lng <strong style="color:#0f172a">${lng.toFixed(6)}</strong></div>
            <div>Fuel <strong style="color:#0f172a">${fmt(m.fuel_level ?? m.current_fuel_level, 1, ' L')}</strong></div>
            <div>Fuel % <strong style="color:#0f172a">${m.fuel_percentage != null ? `${m.fuel_percentage}%` : '—'}</strong></div>
            <div>RPM <strong style="color:#0f172a">${fmt(m.rpm, 0)}</strong></div>
            <div>Coolant <strong style="color:#0f172a">${fmt(m.coolant_temp, 1, '°C')}</strong></div>
            <div>Oil <strong style="color:#0f172a">${fmt(m.oil_pressure, 1)}</strong></div>
            <div>Voltage <strong style="color:#0f172a">${fmt(m.supply_voltage, 1, ' V')}</strong></div>
            <div>Battery <strong style="color:#0f172a">${fmt(m.internal_battery_v, 1, ' V')}</strong></div>
            <div>GNSS <strong style="color:#0f172a">${m.gnss_valid == null ? '—' : (m.gnss_valid ? 'Valid' : 'Invalid')}</strong></div>
          </div>
          <div style="margin-top: 8px; font-size: 0.72rem; color: #64748b;">
            ${m.state_label || m.state || ''}
            ${m.site_name || m.location_name ? `<br/>Site: <strong style="color:#334155">${m.site_name || m.location_name}</strong>` : ''}
            ${m.operator_name ? `<br/>Operator: <strong style="color:#334155">${m.operator_name}</strong>` : ''}
          </div>
          <button id="btn-inspect-${m.id || 1}" style="
            margin-top: 10px;
            width: 100%;
            background: #0f172a;
            color: #ffffff;
            border: none;
            padding: 7px 12px;
            border-radius: 8px;
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

    if (!hasFittedBoundsRef.current || singleMachine) {
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [50, 50] });
        hasFittedBoundsRef.current = true;
      } else if (bounds.length === 1) {
        map.setView(bounds[0], zoom);
        hasFittedBoundsRef.current = true;
      }
    }

    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* ignore */ }
    }, 80);
  }, [machines, singleMachine, zoom, showRoute, routePoints, fitToken, machinesKey, navigate]);

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

      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

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
