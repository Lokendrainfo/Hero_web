import React, { useEffect, useState } from 'react';
import { trackingService } from '../../services/trackingService';
import { LeafletMap } from '../../components/common/LeafletMap';
import { LucideRefreshCw, LucideSearch } from 'lucide-react';

export const LiveTracking = () => {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
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

    // Continuous 3-second live telemetry polling for real-time fleet movement
    const pollInterval = setInterval(() => {
      fetchTrackingData(false);
    }, 3000);

    // WebSocket real-time telemetry socket
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

  const counts = {
    All: telemetry.length,
    Running: telemetry.filter(m => (m.status || '').toUpperCase() === 'RUNNING').length,
    Idle: telemetry.filter(m => (m.status || '').toUpperCase() === 'IDLE').length,
    Maintenance: telemetry.filter(m => (m.status || '').toUpperCase() === 'MAINTENANCE').length
  };

  const filteredTelemetry = telemetry.filter(m => {
    const status = (m.status || '').toUpperCase();
    if (activeFilter === 'Running') return status === 'RUNNING';
    if (activeFilter === 'Idle') return status === 'IDLE';
    if (activeFilter === 'Maintenance') return status === 'MAINTENANCE';
    return true;
  }).filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [m.name, m.chassis_no, m.serial_number, m.model_name, m.site_name, m.location_name, m.operator_name]
      .some((value) => (value || '').toLowerCase().includes(q));
  });

  return (
    <div className="map-fill-page">
      <div className="page-toolbar" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.05rem' }}>Live tracking</h1>
          <p className="page-subtitle">Full-screen fleet positions</p>
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
          {['All', 'Running', 'Idle', 'Maintenance'].map((f) => (
            <button
              key={f}
              type="button"
              className={`filter-chip ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
        <button type="button" className="btn-secondary" onClick={fetchTrackingData}>
          <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="map-fill-canvas">
        <LeafletMap
          machines={filteredTelemetry}
          singleMachine={selectedMachine}
          height="100%"
          zoom={11}
          showRoute={false}
          title="Fleet map"
          chrome={false}
          fill
        />
      </div>

      {filteredTelemetry.length > 0 && (
        <div className="filter-row" style={{ flexShrink: 0 }}>
          {filteredTelemetry.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`filter-chip ${selectedMachine?.id === m.id ? 'active' : ''}`}
              onClick={() => setSelectedMachine(m)}
            >
              {m.name || m.model_name || 'Machine'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
