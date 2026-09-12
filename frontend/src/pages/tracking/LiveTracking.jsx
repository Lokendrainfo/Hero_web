import React, { useEffect, useState } from 'react';
import { trackingService } from '../../services/trackingService';
import { machineService } from '../../services/machineService';
import { LeafletMap } from '../../components/common/LeafletMap';
import { LucideRadio, LucideRefreshCw, LucideSearch, LucideTruck, LucideMapPin, LucideGauge, LucideNavigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../../styles/screens.css';

export const LiveTracking = () => {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedMachine, setSelectedMachine] = useState(null);
  const navigate = useNavigate();

  const fetchTrackingData = () => {
    setLoading(true);
    trackingService.getLiveLocations()
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
        setTelemetry(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTrackingData();
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
    const name = (m.name || '').toLowerCase();
    const chassis = (m.chassis_no || m.serial_number || '').toLowerCase();
    const model = (m.model_name || '').toLowerCase();
    const site = (m.site_name || m.location_name || '').toLowerCase();
    const op = (m.operator_name || '').toLowerCase();

    return name.includes(q) || chassis.includes(q) || model.includes(q) || site.includes(q) || op.includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#374151', cursor: 'pointer', padding: '4px' }}>
            ←
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#111827' }}>
                Live GPS Fleet Tracking
              </h1>
              <span style={{ fontSize: '0.72rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 8px', borderRadius: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <LucideRadio size={12} color="#10b981" /> WebSocket Live
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Real-time spatial telemetry & route mapping across FiberForce HDD sites
            </p>
          </div>
        </div>

        <button
          onClick={fetchTrackingData}
          className="app-card"
          style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}
        >
          <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Positions
        </button>
      </div>

      {/* Fleet Telemetry Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        <div className="app-card" style={{ textAlign: 'center', padding: '12px' }}>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Active Fleet</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#111827', marginTop: '2px' }}>{telemetry.length}</div>
          <div style={{ fontSize: '0.68rem', color: '#10b981', marginTop: '2px' }}>● 100% Connected</div>
        </div>

        <div className="app-card" style={{ textAlign: 'center', padding: '12px' }}>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Operating</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#10b981', marginTop: '2px' }}>{counts.Running}</div>
          <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '2px' }}>HDD Drilling</div>
        </div>

        <div className="app-card" style={{ textAlign: 'center', padding: '12px' }}>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Idle / Stationary</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#3b82f6', marginTop: '2px' }}>{counts.Idle}</div>
          <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '2px' }}>On Standby</div>
        </div>

        <div className="app-card" style={{ textAlign: 'center', padding: '12px' }}>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Primary Site</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginTop: '2px' }}>Sujangarh</div>
          <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '2px' }}>Rajasthan Corridor</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Search machine on map by chassis, operator, site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 38px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />
          <LucideSearch size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
        </div>

        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {['All', 'Running', 'Idle', 'Maintenance'].map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: '600',
                background: activeFilter === f ? '#0a2d23' : '#ffffff',
                color: activeFilter === f ? '#ffffff' : '#374151',
                border: activeFilter === f ? '1px solid #0a2d23' : '1px solid #d1d5db',
                cursor: 'pointer'
              }}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {/* Interactive OpenStreetMap Leaflet Map Component */}
      <div style={{ width: '100%' }}>
        <LeafletMap
          machines={filteredTelemetry}
          singleMachine={selectedMachine}
          height="540px"
          zoom={11}
          showRoute={false}
        />
      </div>

      {/* Quick Machine Select Strip */}
      <div className="app-card">
        <div style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '10px', color: '#111827' }}>
          Select Machine to Focus on Map ({filteredTelemetry.length})
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {filteredTelemetry.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMachine(m)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: selectedMachine?.id === m.id ? '2px solid #2563eb' : '1px solid #e5e7eb',
                background: selectedMachine?.id === m.id ? '#eff6ff' : '#ffffff',
                fontSize: '0.78rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ fontWeight: '700', color: '#111827' }}>{m.name}</div>
              <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>Chassis: {m.chassis_no}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
