import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideShield,
  LucideMapPin,
  LucideGauge,
  LucideLayers,
  LucideCalendar,
  LucideAlertCircle,
  LucideRefreshCw,
  LucideMaximize2,
  LucideMinimize2,
} from 'lucide-react';

export const BharatNetLiveViewPage = () => {
  const { token } = useParams();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Live view token is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    axios
      .get(`/api/v1/live-view/${token}/`)
      .catch(() => axios.get(`/api/v1/bharatnet/live-view/${token}/`))
      .then((res) => {
        if (res.data && res.data.data) {
          const d = res.data.data;
          if (d.taskId) {
            const redirectUrl = `/map-view/${d.taskId}?userId=${encodeURIComponent(d.userId || '')}&userName=${encodeURIComponent(d.userName || d.userId || '')}&block=${encodeURIComponent(d.block || '')}&district=${encodeURIComponent(d.district || '')}&state=${encodeURIComponent(d.circle || '')}&date=${encodeURIComponent(d.date || '')}&mode=user`;
            window.location.replace(redirectUrl);
            return;
          }
          setData(d);
        } else {
          setError('No telemetry data available for this live view session.');
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.message || 'Invalid or expired live view session.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Leaflet Map Initialization
  useEffect(() => {
    if (!data || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    });
    mapInstanceRef.current = map;

    // CartoDB Voyager or OpenStreetMap
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    const latLngs = [];

    // Add Pits
    const pitIcon = L.divIcon({
      className: 'bharatnet-pit-icon',
      html: `<div style="background:#dc2626;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.3);">P</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    (data.pits || []).forEach((pit) => {
      const lat = parseFloat(pit.latitude);
      const lng = parseFloat(pit.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        latLngs.push([lat, lng]);
        L.marker([lat, lng], { icon: pitIcon })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:sans-serif;padding:4px;">
              <strong>${pit.pitName || 'Pit'}</strong><br/>
              Type: ${pit.type || 'Standard'}<br/>
              GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}
            </div>`
          );
      }
    });

    // Add Depth Points and Path
    const depthPoints = [];
    (data.shots || []).forEach((shot) => {
      const shotPoints = [];
      (shot.depthCaptures || []).forEach((dp) => {
        const lat = parseFloat(dp.latitude);
        const lng = parseFloat(dp.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          latLngs.push([lat, lng]);
          shotPoints.push([lat, lng]);
          depthPoints.push(dp);

          const depthM = parseFloat(dp.depth) || 0;
          const dotColor = depthM >= 1.65 ? '#16a34a' : depthM >= 1.2 ? '#eab308' : '#dc2626';

          const depthIcon = L.divIcon({
            className: 'bharatnet-dp-icon',
            html: `<div style="background:${dotColor};width:10px;height:10px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);" title="${depthM.toFixed(2)}m"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });

          L.marker([lat, lng], { icon: depthIcon })
            .addTo(map)
            .bindPopup(
              `<div style="font-family:sans-serif;padding:4px;">
                <strong>Depth: ${depthM.toFixed(2)} meters</strong><br/>
                Captured: ${dp.capturedAt || 'N/A'}<br/>
                Offset: ${dp.offset ? dp.offset + 'm' : 'N/A'}<br/>
                GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}
              </div>`
            );
        }
      });

      if (shotPoints.length > 1) {
        L.polyline(shotPoints, {
          color: '#2563eb',
          weight: 4,
          opacity: 0.8,
          dashArray: '6, 6',
        }).addTo(map);
      }
    });

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([26.9124, 75.7873], 7); // Default to Rajasthan center
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [data]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // Compute depth stats
  const allDepths = (data?.shots || [])
    .flatMap((s) => s.depthCaptures || [])
    .map((dp) => parseFloat(dp.depth))
    .filter((d) => !isNaN(d) && d > 0);

  const avgDepth = allDepths.length
    ? (allDepths.reduce((a, b) => a + b, 0) / allDepths.length).toFixed(2)
    : '—';
  const minDepth = allDepths.length ? Math.min(...allDepths).toFixed(2) : '—';
  const maxDepth = allDepths.length ? Math.max(...allDepths).toFixed(2) : '—';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <LucideRefreshCw size={36} color="#0f766e" className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', color: '#0f172a', fontWeight: '700', margin: 0 }}>
            Loading BharatNet T&D Execution...
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '6px' }}>
            Verifying cryptographic token & streaming live telemetry
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px' }}>
        <div style={{ maxWidth: '440px', background: '#ffffff', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid #fee2e2', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#dc2626' }}>
            <LucideAlertCircle size={30} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#991b1b', margin: 0 }}>
            Session Expired or Unauthorized
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', lineHeight: '1.5' }}>
            {error}
          </p>
          <div style={{ marginTop: '20px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.75rem', color: '#94a3b8' }}>
            BharatNet Phase-3 T&D Monitoring Security Gateway
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', color: '#f8fafc', overflow: 'hidden' }}>
      {/* Top Banner */}
      <div
        style={{
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          zIndex: 1000,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#0f766e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
            <LucideShield size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                BharatNet Phase-3 T&D Monitoring
              </h1>
              <span style={{ background: '#047857', color: '#a7f3d0', fontSize: '0.68rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                Verified Stream
              </span>
            </div>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
              Live read-only depth capture inspection & execution geometry
            </p>
          </div>
        </div>

        {/* Location & Machine Metadata Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideMapPin size={14} color="#38bdf8" />
            <span style={{ color: '#94a3b8' }}>Circle:</span>
            <strong style={{ color: '#f8fafc' }}>{data.circle}</strong>
            <span style={{ color: '#64748b' }}>•</span>
            <strong style={{ color: '#f8fafc' }}>{data.district}</strong>
            <span style={{ color: '#64748b' }}>•</span>
            <strong style={{ color: '#38bdf8' }}>{data.block}</strong>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideGauge size={14} color="#34d399" />
            <span style={{ color: '#94a3b8' }}>Rig:</span>
            <strong style={{ color: '#34d399' }}>{data.machineId}</strong>
            <span style={{ color: '#64748b' }}>•</span>
            <span style={{ color: '#94a3b8' }}>Operator ID:</span>
            <strong style={{ color: '#f8fafc' }}>{data.userId}</strong>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideCalendar size={14} color="#fbbf24" />
            <span style={{ color: '#94a3b8' }}>Date:</span>
            <strong style={{ color: '#fbbf24' }}>{data.date}</strong>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '6px 10px',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <LucideMinimize2 size={16} /> : <LucideMaximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div
        style={{
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          padding: '8px 24px',
          display: 'flex',
          gap: '24px',
          alignItems: 'center',
          fontSize: '0.78rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span style={{ color: '#94a3b8' }}>Shots Executed:</span>{' '}
          <strong style={{ color: '#38bdf8' }}>{data.shots?.length || 0}</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Pits Monitored:</span>{' '}
          <strong style={{ color: '#f87171' }}>{data.pits?.length || 0}</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Depth Capture Points:</span>{' '}
          <strong style={{ color: '#34d399' }}>{allDepths.length}</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Avg Depth:</span>{' '}
          <strong style={{ color: '#a7f3d0' }}>{avgDepth} m</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Min / Max Depth:</span>{' '}
          <strong style={{ color: '#f8fafc' }}>
            {minDepth} m / {maxDepth} m
          </strong>
        </div>
      </div>

      {/* Map Container */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Legend Overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '0.74rem',
            zIndex: 1000,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: '700', marginBottom: '8px', color: '#f8fafc' }}>Depth Legend</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#16a34a' }} />
              <span>Compliant Depth (&ge; 1.65 m)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#eab308' }} />
              <span>Sub-standard (1.20 - 1.64 m)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#dc2626' }} />
              <span>Critical Under-depth (&lt; 1.20 m)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#dc2626', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '8px', fontWeight: 'bold' }}>P</div>
              <span>Pit Location</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default BharatNetLiveViewPage;
