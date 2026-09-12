import React, { useEffect, useState } from 'react';
import { alertService } from '../../services/alertService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideAlertTriangle,
  LucideAlertOctagon,
  LucideBell,
  LucideCheckCircle,
  LucideSearch,
  LucideRefreshCw,
  LucideBuilding2,
  LucideTruck,
  LucideClock,
  LucideCheck
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';

const severityBadge = (severity) => {
  const s = (severity || 'INFO').toUpperCase();
  if (s === 'CRITICAL') return 'badge-breakdown';
  if (s === 'WARNING') return 'badge-maintenance';
  return 'badge-idle';
};

export const Alerts = () => {
  const { isAdmin, vendors, selectedVendorId } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  const fetchAlerts = () => {
    setLoading(true);
    const params = {};
    if (selectedVendorId && selectedVendorId !== 'all') params.vendor_id = selectedVendorId;

    alertService.getAll(params)
      .then(res => {
        const payload = res.data?.data || res.data || {};
        const list = payload.results || payload.content || (Array.isArray(payload) ? payload : []);
        setAlerts(Array.isArray(list) ? list : []);
      })
      .catch(err => {
        console.error("Error fetching alerts:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAlerts();
  }, [selectedVendorId]);

  const handleMarkRead = (alertId) => {
    alertService.markRead(alertId).catch(() => {});
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
  };

  const activeVendorName = vendors && vendors.length > 0 ? (vendors[0].name || vendors[0].partnerName) : 'Your vendor';

  const filteredAlerts = alerts.filter(a => {
    if (!isAdmin) {
      const userVendorNames = vendors.map(v => (v.name || v.partnerName || '').toLowerCase());
      const aVendor = (a.vendor_name || a.vendor?.name || '').toLowerCase();
      if (userVendorNames.length > 0 && aVendor) {
        const isMatch = userVendorNames.some(vn => vn && (aVendor.includes(vn) || vn.includes(aVendor)));
        if (!isMatch) return false;
      }
    }
    if (severityFilter !== 'ALL' && (a.severity || '').toUpperCase() !== severityFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.title && a.title.toLowerCase().includes(q)) ||
      (a.message && a.message.toLowerCase().includes(q)) ||
      (a.machine_code && a.machine_code.toLowerCase().includes(q)) ||
      (a.vendor_name && a.vendor_name.toLowerCase().includes(q))
    );
  });

  const criticalCount = filteredAlerts.filter(a => (a.severity || '').toUpperCase() === 'CRITICAL').length;
  const unreadCount = filteredAlerts.filter(a => !a.is_read).length;

  return (
    <div className="screen-container">
      <PageHeader
        title="Alerts"
        subtitle={
          isAdmin
            ? (selectedVendorId && selectedVendorId !== 'all'
              ? 'Alerts for the selected vendor'
              : 'All system alerts across vendors')
            : `Scoped to ${activeVendorName}`
        }
        actions={
          <>
            <span className={`badge-pill ${isAdmin ? 'badge-neutral' : 'badge-maintenance'}`}>
              {isAdmin
                ? (selectedVendorId && selectedVendorId !== 'all' ? 'Admin · vendor' : 'Admin · all vendors')
                : 'Vendor scoped'}
            </span>
            <button type="button" className="btn-secondary" onClick={fetchAlerts}>
              <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </>
        }
      />

      <div className="kpi-strip">
        <div className="kpi-cell" onClick={() => setSeverityFilter('ALL')}>
          <div className="kpi-label">Active alerts</div>
          <div className="kpi-value">{alerts.length}</div>
        </div>
        <div className="kpi-cell" onClick={() => setSeverityFilter('CRITICAL')}>
          <div className="kpi-label">Critical</div>
          <div className="kpi-value">{criticalCount}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Unread</div>
          <div className="kpi-value">{unreadCount}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Showing</div>
          <div className="kpi-value">{filteredAlerts.length}</div>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="input-wrap" style={{ flex: 1, minWidth: 220 }}>
          <LucideSearch size={15} className="input-icon" />
          <input
            type="search"
            placeholder="Search title, machine, or vendor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-row">
          {['ALL', 'CRITICAL', 'WARNING', 'INFO'].map((sev) => (
            <button
              key={sev}
              type="button"
              className={`filter-chip ${severityFilter === sev ? 'active' : ''}`}
              onClick={() => setSeverityFilter(sev)}
            >
              {sev === 'ALL' ? 'All' : sev.charAt(0) + sev.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <h3>Loading alerts</h3>
          <p>Fetching the current machine and operations feed.</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          title="No alerts"
          subtitle="Nothing matches this filter. Machines in view are within normal parameters."
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Severity</th>
                <th>Machine</th>
                <th>Vendor</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((alert) => {
                const isCritical = (alert.severity || '').toUpperCase() === 'CRITICAL';
                const isWarning = (alert.severity || '').toUpperCase() === 'WARNING';
                return (
                  <tr key={alert.id} style={{ cursor: 'default' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ marginTop: 2, color: isCritical ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--info)' }}>
                          {isCritical ? <LucideAlertOctagon size={16} /> : isWarning ? <LucideAlertTriangle size={16} /> : <LucideBell size={16} />}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{alert.title}</div>
                          <div className="page-subtitle">{alert.message}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge-pill ${severityBadge(alert.severity)}`}>
                        {alert.severity || 'INFO'}
                      </span>
                    </td>
                    <td>
                      {alert.machine_code ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <LucideTruck size={13} /> {alert.machine_code}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {alert.vendor_name ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <LucideBuilding2 size={13} /> {alert.vendor_name}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                        <LucideClock size={13} />
                        {alert.timestamp || (alert.created_at ? new Date(alert.created_at).toLocaleString() : '—')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!alert.is_read ? (
                        <button type="button" className="btn-secondary" onClick={() => handleMarkRead(alert.id)}>
                          <LucideCheck size={14} /> Mark read
                        </button>
                      ) : (
                        <span className="badge-pill badge-running">
                          <LucideCheckCircle size={12} /> Read
                        </span>
                      )}
                    </td>
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
