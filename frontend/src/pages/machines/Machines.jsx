import React, { useEffect, useState } from 'react';
import { machineService } from '../../services/machineService';
import { MachineCard } from '../../components/machines/MachineCard';
import { LucideSearch, LucideRefreshCw, LucideRadio, LucideShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../../styles/screens.css';

export const Machines = () => {
  const [machines, setMachines] = useState([]);
  const [statusCounts, setStatusCounts] = useState(null);
  const [emptyStateCode, setEmptyStateCode] = useState(null);
  const [emptyStateMessage, setEmptyStateMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchMachines = () => {
    setLoading(true);
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (activeFilter && activeFilter !== 'All') params.status = activeFilter;

    machineService.getAll(params)
      .then(res => {
        const payload = res.data || res;
        const list = Array.isArray(payload)
          ? payload
          : (payload.results || payload.data?.results || (Array.isArray(payload.data) ? payload.data : []));
        setMachines(list);

        const countsObj = payload.status_counts || payload.data?.status_counts;
        if (countsObj) {
          setStatusCounts(countsObj);
        }
        setEmptyStateCode(payload.empty_state_code || payload.data?.empty_state_code || null);
        setEmptyStateMessage(payload.empty_state_message || payload.data?.empty_state_message || '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMachines();
  }, [activeFilter, search]);

  const counts = {
    All: statusCounts?.ALL ?? machines.length,
    Commissioned: statusCounts?.COMMISSIONED ?? machines.filter(m => m.is_commissioned).length,
    A600: machines.filter(m => (m.model_code || m.model || '').toUpperCase() === 'A600').length,
    A800: machines.filter(m => (m.model_code || m.model || '').toUpperCase() === 'A800').length,
    Running: statusCounts?.RUNNING ?? machines.filter(m => (m.status || '').toUpperCase() === 'RUNNING').length,
    Idle: statusCounts?.IDLE ?? machines.filter(m => (m.status || '').toUpperCase() === 'IDLE').length,
    Maintenance: statusCounts?.MAINTENANCE ?? machines.filter(m => (m.status || '').toUpperCase() === 'MAINTENANCE').length
  };

  const filteredMachines = machines;

  const renderEmptyMessage = () => {
    if (emptyStateCode === 'NO_ASSIGNED_MACHINES') {
      return (
        <div className="app-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🚜</div>
          <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#111827' }}>No machines are assigned to this vendor.</div>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '6px' }}>
            Your vendor account currently has 0 assigned machines in the iLync system.
          </p>
        </div>
      );
    }

    if (emptyStateCode === 'NOT_IN_FIBERFORCE') {
      return (
        <div className="app-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>⚠️</div>
          <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#b45309' }}>Machine assigned to vendor but not available in FiberForce.</div>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '6px' }}>
            Machine exists in iLync vendor assignments, but live telemetry data is not currently broadcast on FiberForce API.
          </p>
        </div>
      );
    }

    return (
      <div className="app-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🚜</div>
        <div style={{ fontWeight: '700', fontSize: '1rem', color: '#111827' }}>No machines found</div>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
          No FiberForce machinery matching your filter or search query.
        </p>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#374151', cursor: 'pointer', padding: '4px', border: 'none', background: 'none' }}
          >
            ←
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#111827' }}>
                Machines
              </h1>
              <span style={{ fontSize: '0.72rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 8px', borderRadius: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <LucideRadio size={12} color="#10b981" /> FiberForce API ({counts.All})
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Live HDD Fleet from FiberForce REST API (api.hdd.fiberforce.in)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={fetchMachines}
            className="app-card"
            style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}
          >
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Sync API
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          placeholder="Search by chassis (e.g. 600202608396), model (A600/A800), site, operator, or fuel card..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px 12px 40px',
            borderRadius: '10px',
            border: '1px solid #d1d5db',
            background: '#ffffff',
            fontSize: '0.88rem',
            boxSizing: 'border-box',
            outline: 'none',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}
        />
        <LucideSearch size={18} color="#9ca3af" style={{ position: 'absolute', left: '14px', top: '14px' }} />
      </div>

      {/* Filter Pills */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
        {[
          { label: 'All', count: counts.All },
          { label: 'Commissioned', count: counts.Commissioned },
          { label: 'A600', count: counts.A600 },
          { label: 'A800', count: counts.A800 },
          { label: 'Running', count: counts.Running },
          { label: 'Idle', count: counts.Idle },
          { label: 'Maintenance', count: counts.Maintenance }
        ].map(f => (
          <button
            key={f.label}
            onClick={() => setActiveFilter(f.label)}
            style={{
              padding: '7px 16px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: '600',
              background: activeFilter === f.label ? '#0a2d23' : '#ffffff',
              color: activeFilter === f.label ? '#ffffff' : '#374151',
              border: activeFilter === f.label ? '1px solid #0a2d23' : '1px solid #d1d5db',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Machines List / Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
          Loading vendor machines...
        </div>
      ) : filteredMachines.length === 0 ? (
        renderEmptyMessage()
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '14px',
          width: '100%'
        }}>
          {filteredMachines.map(m => (
            <MachineCard key={m.id} machine={m} />
          ))}
        </div>
      )}
    </div>
  );
};
