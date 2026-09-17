import React, { useEffect, useMemo, useState } from 'react';
import { trackingService } from '../../services/trackingService';
import { LeafletMap } from '../../components/common/LeafletMap';
import { LucideRefreshCw, LucideSearch } from 'lucide-react';

const isCommissioned = (m) => Boolean(m?.is_vendor_assigned || m?.is_commissioned_tab);

export const LiveTracking = () => {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('Commissioned');
  const [selectedMachine, setSelectedMachine] = useState(null);

  const fetchTrackingData = (showLoading = true) => {
    if (showLoading) setLoading(true);
    trackingService.getLiveLocations()
      .then(res => {
        const raw = res.data?.data !== undefined ? res.data.data : (res.data !== undefined ? res.data : res);
        let list = [];
        if (Array.isArray(raw)) {
          list = raw;
        } else if (raw && Array.isArray(raw.results)) {
          list = raw.results;
        } else if (raw && Array.isArray(raw.data)) {
          list = raw.data;
        }
        setTelemetry(list);
      })
      .catch(console.error)
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  };

  useEffect(() => {
    fetchTrackingData(true);

    const pollInterval = setInterval(() => {
      fetchTrackingData(false);
    }, 10000);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/tracking/`;
    let ws = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);
          if (update && (update.id || update.machine_id)) {
            const updateId = update.id || update.machine_id;
            setTelemetry(prev => {
              const exists = prev.some(m => m.id === updateId);
              if (exists) {
                return prev.map(m => m.id === updateId ? { ...m, ...update } : m);
              }
              return [...prev, update];
            });
          }
        } catch (e) {
          console.error('[LiveTracking WS Error]', e);
        }
      };
    } catch (err) {
      console.warn('[LiveTracking WS] Could not connect to WebSocket:', err);
    }

    return () => {
      clearInterval(pollInterval);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  const counts = useMemo(() => ({
    Commissioned: telemetry.filter(isCommissioned).length,
    All: telemetry.length,
    Working: telemetry.filter(m => (m.status || '').toUpperCase() === 'RUNNING').length,
    Idle: telemetry.filter(m => (m.status || '').toUpperCase() === 'IDLE').length,
  }), [telemetry]);

  const filteredTelemetry = useMemo(() => {
    return telemetry.filter((m) => {
      const status = (m.status || '').toUpperCase();
      if (activeFilter === 'Commissioned') return isCommissioned(m);
      if (activeFilter === 'Working') return status === 'RUNNING';
      if (activeFilter === 'Idle') return status === 'IDLE';
      return true; // All
    }).filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [m.name, m.chassis_no, m.machine_chassis_no, m.serial_number, m.model_name, m.site_name, m.location_name, m.operator_name, m.state_label]
        .some((value) => (value || '').toLowerCase().includes(q));
    }).filter((m) => m.latitude != null && m.longitude != null);
  }, [telemetry, activeFilter, search]);

  // Keep selection in filtered set
  useEffect(() => {
    if (!selectedMachine) return;
    const stillVisible = filteredTelemetry.some((m) => m.id === selectedMachine.id);
    if (!stillVisible) setSelectedMachine(null);
  }, [filteredTelemetry, selectedMachine]);

  return (
    <div className="map-fill-page">
      <div className="page-toolbar" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.05rem' }}>Live tracking</h1>
          <p className="page-subtitle">
            {counts.Commissioned} commissioned · heading from FiberForce course_deg
          </p>
        </div>
        <div className="input-wrap" style={{ flex: 1, minWidth: 180, maxWidth: 320 }}>
          <LucideSearch size={15} className="input-icon" />
          <input
            type="search"
            placeholder="Search chassis, operator, or site"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-row">
          {[
            { label: 'Commissioned', count: counts.Commissioned },
            { label: 'All', count: counts.All },
            { label: 'Working', count: counts.Working },
            { label: 'Idle', count: counts.Idle },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              className={`filter-chip ${activeFilter === f.label ? 'active' : ''}`}
              onClick={() => {
                setActiveFilter(f.label);
                setSelectedMachine(null);
              }}
            >
              {f.label} {f.count}
            </button>
          ))}
        </div>
        <button type="button" className="btn-secondary" onClick={() => fetchTrackingData(true)}>
          <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="map-fill-canvas">
        {filteredTelemetry.length === 0 && !loading ? (
          <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>No machines on map</h3>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                Try another filter, or wait for live GPS from FiberForce.
              </p>
            </div>
          </div>
        ) : (
          <LeafletMap
            machines={filteredTelemetry}
            singleMachine={selectedMachine}
            height="100%"
            zoom={11}
            showRoute={false}
            title="Fleet map"
            chrome={false}
            fill
            fitToken={activeFilter}
          />
        )}
      </div>

      {filteredTelemetry.length > 0 && (
        <div className="filter-row" style={{ flexShrink: 0 }}>
          {filteredTelemetry.map((m) => {
            const course = m.course_deg ?? m.heading ?? 0;
            return (
              <button
                key={m.id}
                type="button"
                className={`filter-chip ${selectedMachine?.id === m.id ? 'active' : ''}`}
                onClick={() => setSelectedMachine(selectedMachine?.id === m.id ? null : m)}
                title={`${m.heading_label || ''} ${Number(course).toFixed(0)}°`}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: (m.status || '').toUpperCase() === 'RUNNING' ? '#059669' : '#d97706',
                    border: '1.5px solid #fff',
                    boxShadow: '0 0 0 1px rgba(15,23,42,0.12)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    style={{ transform: `rotate(${Number(course) || 0}deg)` }}
                  >
                    <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#fff" />
                  </svg>
                </span>
                {m.name || m.model_name || 'Machine'}
                <span style={{ opacity: 0.75, fontWeight: 600 }}>
                  {Number(course).toFixed(0)}°
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
