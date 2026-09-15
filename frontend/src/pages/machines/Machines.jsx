import React, { useEffect, useMemo, useState } from 'react';
import { machineService } from '../../services/machineService';
import { LucideRefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';

const statusClass = (status) => {
  const s = (status || '').toUpperCase();
  if (s === 'RUNNING') return 'badge-running';
  if (s === 'IDLE') return 'badge-idle';
  if (s === 'MAINTENANCE') return 'badge-maintenance';
  if (s === 'BREAKDOWN') return 'badge-breakdown';
  return 'badge-offline';
};

const unwrapMachines = (res) => {
  const payload = res?.data && !Array.isArray(res.data) && (res.data.results || res.data.status_counts)
    ? res.data
    : (res?.data && !res.results && !res.status_counts ? res.data : res) || {};
  const list = Array.isArray(payload)
    ? payload
    : (payload.results || (Array.isArray(payload.data) ? payload.data : []) || []);
  return {
    list: Array.isArray(list) ? list : [],
    statusCounts: payload.status_counts || payload.data?.status_counts || null,
    emptyStateCode: payload.empty_state_code || payload.data?.empty_state_code || null,
    emptyStateMessage: payload.empty_state_message || payload.data?.empty_state_message || '',
  };
};

export const Machines = () => {
  const [allMachines, setAllMachines] = useState([]);
  const [statusCounts, setStatusCounts] = useState(null);
  const [emptyStateCode, setEmptyStateCode] = useState(null);
  const [emptyStateMessage, setEmptyStateMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchMachines = (shouldResync = false, isSilent = false) => {
    if (!isSilent) setLoading(true);
    const params = {};
    if (shouldResync) params.resync = 'true';

    machineService.getAll(params)
      .then((res) => {
        const next = unwrapMachines(res);
        setAllMachines(next.list);
        setStatusCounts(next.statusCounts);
        setEmptyStateCode(next.emptyStateCode);
        setEmptyStateMessage(next.emptyStateMessage);
      })
      .catch(console.error)
      .finally(() => {
        if (!isSilent) setLoading(false);
      });
  };

  useEffect(() => {
    fetchMachines(false, false);
    const interval = setInterval(() => {
      fetchMachines(false, true); // Silent auto-refresh every 10s
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const counts = {
    All: statusCounts?.ALL ?? allMachines.length,
    Live: statusCounts?.LIVE ?? allMachines.filter((m) => m.is_online).length,
    Running: statusCounts?.RUNNING ?? allMachines.filter((m) => (m.status || '').toUpperCase() === 'RUNNING').length,
    Idle: statusCounts?.IDLE ?? allMachines.filter((m) => (m.status || '').toUpperCase() === 'IDLE').length,
    Maintenance: statusCounts?.MAINTENANCE ?? allMachines.filter((m) => (m.status || '').toUpperCase() === 'MAINTENANCE').length,
  };

  const machines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMachines.filter((m) => {
      if (activeFilter === 'Live' && !m.is_online) return false;
      if (activeFilter === 'Running' && (m.status || '').toUpperCase() !== 'RUNNING') return false;
      if (activeFilter === 'Idle' && (m.status || '').toUpperCase() !== 'IDLE') return false;
      if (activeFilter === 'Maintenance' && (m.status || '').toUpperCase() !== 'MAINTENANCE') return false;
      if (!q) return true;
      const hay = [
        m.model_name, m.name, m.model_code, m.machine_chassis_no,
        m.serial_number, m.site_name, m.location_name, m.operator_name,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [allMachines, activeFilter, search]);

  const renderEmptyMessage = () => {
    let title = 'No machines found';
    let body = emptyStateMessage || 'Nothing matches this filter or search.';
    if (allMachines.length > 0) {
      body = 'Nothing matches this filter or search.';
    } else if (emptyStateCode === 'NO_ASSIGNED_MACHINES') {
      title = 'No machines assigned';
      body = 'This vendor has no machines in ILYNC.';
    } else if (emptyStateCode === 'NOT_IN_FIBERFORCE') {
      title = 'Assigned, but not on FiberForce';
      body = 'The vendor has machines in ILYNC, but live telemetry is not available.';
    }
    return (
      <div className="empty-state">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    );
  };

  return (
    <div className="screen-container">
      <PageHeader
        title="Machines"
        subtitle={`${counts.All} units from FiberForce (${counts.Live} live), scoped to your vendor`}
        actions={
          <button type="button" className="btn-secondary" onClick={() => fetchMachines(true)}>
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="page-toolbar">
        <div className="input-wrap" style={{ flex: 1, minWidth: 220 }}>
          <input
            type="search"
            placeholder="Search chassis, model, site, or operator"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="filter-row">
        {[
          { label: 'All', count: counts.All },
          { label: 'Live', count: counts.Live },
          { label: 'Running', count: counts.Running },
          { label: 'Idle', count: counts.Idle },
          { label: 'Maintenance', count: counts.Maintenance }
        ].map(f => (
          <button
            key={f.label}
            type="button"
            className={`filter-chip ${activeFilter === f.label ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.label)}
          >
            {f.label} {f.count}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading machines…</p></div>
      ) : machines.length === 0 ? (
        renderEmptyMessage()
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Chassis</th>
                <th>Status</th>
                <th>Site</th>
                <th>Fuel</th>
                <th>Runtime</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const fuelPercent = m.fuel_percentage ?? 0;
                return (
                  <tr key={m.id} onClick={() => navigate(`/machines/${m.id}`)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.model_name || m.name || `APOLLO ${m.model_code || ''}`}</div>
                      <div className="page-subtitle">{m.model_code || 'HDD'}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {m.machine_chassis_no || m.serial_number || '—'}
                    </td>
                    <td>
                      <span className={`badge-pill ${statusClass(m.status)}`}>{m.status || 'IDLE'}</span>
                      <div className="page-subtitle">{m.is_online ? 'Online' : 'Offline'}</div>
                    </td>
                    <td>{m.site_name || m.location_name || '—'}</td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ fontSize: '0.75rem', marginBottom: 4 }}>{fuelPercent}%</div>
                      <div className="fuel-bar-track">
                        <div
                          className="fuel-bar-fill"
                          style={{
                            width: `${Math.min(100, Math.max(0, fuelPercent))}%`,
                            background: fuelPercent < 20 ? '#dc2626' : fuelPercent < 40 ? '#b45309' : '#059669'
                          }}
                        />
                      </div>
                    </td>
                    <td>{m.runtime_str || '00h 00m'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
