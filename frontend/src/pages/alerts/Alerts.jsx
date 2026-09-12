import React, { useEffect, useState } from 'react';
import { alertService } from '../../services/alertService';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideAlertTriangle,
  LucideAlertOctagon,
  LucideBell,
  LucideCheckCircle,
  LucideSearch,
  LucideRefreshCw,
  LucideFilter,
  LucideBuilding2,
  LucideTruck,
  LucideClock,
  LucideCheck
} from 'lucide-react';
import '../../styles/screens.css';

export const Alerts = () => {
  const { user, isAdmin, vendors } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [vendorList, setVendorList] = useState([]);

  // Default rich initial alerts state
  const demoAlerts = [
    {
      id: 1,
      title: 'Low Fuel Level Warning',
      message: 'Fuel level reached 20% on machine A800 HDD (8593). Please schedule refuel.',
      severity: 'CRITICAL',
      machine_code: 'A800 HDD (8593)',
      vendor_name: 'Naveen Telecom Network 2',
      is_read: false,
      timestamp: '18m ago',
      created_at: new Date(Date.now() - 18 * 60000).toISOString()
    },
    {
      id: 2,
      title: 'PM Maintenance Due Soon',
      message: 'Scheduled 500-hour service inspection due in 25 engine hours on XCMG 320 (7421).',
      severity: 'WARNING',
      machine_code: 'XCMG 320 (7421)',
      vendor_name: 'Gurukripa Enterprises',
      is_read: false,
      timestamp: '2h ago',
      created_at: new Date(Date.now() - 120 * 60000).toISOString()
    },
    {
      id: 3,
      title: 'Engine Temperature Spike',
      message: 'Coolant temperature reached 98°C during high-load trenching operation.',
      severity: 'CRITICAL',
      machine_code: 'VERMEER D24x40 (9102)',
      vendor_name: 'HARPAL INFRA DEVELOPMENT',
      is_read: true,
      timestamp: '5h ago',
      created_at: new Date(Date.now() - 300 * 60000).toISOString()
    },
    {
      id: 4,
      title: 'Daily Attendance Checklist Complete',
      message: 'Operator Swarnim Mittal logged in and verified machine safety checklist.',
      severity: 'INFO',
      machine_code: 'A800 HDD (8593)',
      vendor_name: 'Naveen Telecom Network 2',
      is_read: true,
      timestamp: '1d ago',
      created_at: new Date(Date.now() - 1440 * 60000).toISOString()
    }
  ];

  useEffect(() => {
    if (isAdmin) {
      vendorService.getVendors({ page: 0, size: 50 })
        .then(res => {
          const list = res.data?.data?.results || res.data?.results || res.data?.content || res.data || [];
          setVendorList(Array.isArray(list) ? list : []);
        })
        .catch(console.error);
    }
  }, [isAdmin]);

  const fetchAlerts = () => {
    setLoading(true);
    const params = {};
    if (selectedVendor !== 'all') params.vendor_id = selectedVendor;

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
  }, [selectedVendor]);

  const handleMarkRead = (alertId) => {
    alertService.markRead(alertId).catch(() => {});
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
  };

  const activeVendorName = vendors && vendors.length > 0 ? (vendors[0].name || vendors[0].partnerName) : 'Your Vendor Account';

  const filteredAlerts = alerts.filter(a => {
    if (!isAdmin) {
      // Non-admin Vendor user: Strictly restrict to vendor's alerts!
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#111827' }}>
              Alert Center & Real-Time Monitoring
            </h1>
            {isAdmin ? (
              <span style={{ fontSize: '0.72rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 10px', borderRadius: '12px', fontWeight: '700' }}>
                ● Admin View (All System Alerts)
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: '12px', fontWeight: '700' }}>
                ● Vendor Scoped Alerts: {activeVendorName}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Machine health warnings, maintenance reminders, fuel level alerts, and breakdown notifications
          </p>
        </div>

        <button onClick={fetchAlerts} className="app-card" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>
          <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Alerts
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #0a2d23' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Total Active Alerts</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
            {alerts.length} <span style={{ fontSize: '0.8rem', color: '#0a2d23', fontWeight: '600' }}>Alerts</span>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #dc2626' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Critical Severity</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#dc2626', marginTop: '4px' }}>
            {criticalCount} <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: '600' }}>Critical</span>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #d97706' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Unread Alerts</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>
            {unreadCount} <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: '600' }}>Unread</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Search + Severity Filter + Vendor Dropdown */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
        <div style={{ flex: '1', minWidth: '260px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search alerts by title, machine code, or warning details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px 11px 40px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              fontSize: '0.88rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <LucideSearch size={18} color="#9ca3af" style={{ position: 'absolute', left: '14px', top: '12px' }} />
        </div>

        {/* Severity Pill Filter */}
        <div style={{ display: 'flex', gap: '6px', background: '#f3f4f6', padding: '4px', borderRadius: '10px' }}>
          {['ALL', 'CRITICAL', 'WARNING', 'INFO'].map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                background: severityFilter === sev ? '#0a2d23' : 'transparent',
                color: severityFilter === sev ? '#ffffff' : '#4b5563'
              }}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Admin Vendor Selection Dropdown */}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '10px', padding: '4px 12px' }}>
            <LucideBuilding2 size={16} color="#0a2d23" />
            <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Vendor:</span>
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.85rem',
                fontWeight: '600',
                color: '#111827',
                padding: '6px 4px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">🏢 All Vendors (Master View)</option>
              {vendorList.map(v => (
                <option key={v.id || v.external_vendor_id} value={v.id || v.external_vendor_id}>
                  {v.partnerName || v.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Alerts Cards List */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
          Loading real-time alert feed...
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="app-card" style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          <LucideAlertTriangle size={32} style={{ margin: '0 auto 8px', color: '#9ca3af' }} />
          <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No active alerts found</div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>All machines are operating within normal parameters.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredAlerts.map(alert => {
            const isCritical = (alert.severity || '').toUpperCase() === 'CRITICAL';
            const isWarning = (alert.severity || '').toUpperCase() === 'WARNING';
            const badgeBg = isCritical ? '#fef2f2' : isWarning ? '#fffbeb' : '#eff6ff';
            const badgeColor = isCritical ? '#991b1b' : isWarning ? '#92400e' : '#1e40af';
            const borderCol = isCritical ? '#fca5a5' : isWarning ? '#fde68a' : '#bfdbfe';

            return (
              <div
                key={alert.id}
                className="app-card"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  background: alert.is_read ? '#ffffff' : '#f9fafb',
                  borderLeft: `5px solid ${isCritical ? '#dc2626' : isWarning ? '#d97706' : '#2563eb'}`
                }}
              >
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flex: '1', minWidth: '260px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: badgeBg,
                    border: `1px solid ${borderCol}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isCritical ? <LucideAlertOctagon size={20} color="#dc2626" /> : isWarning ? <LucideAlertTriangle size={20} color="#d97706" /> : <LucideBell size={20} color="#2563eb" />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '0.98rem', fontWeight: '700', color: '#111827', margin: 0 }}>
                        {alert.title}
                      </h3>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: '800',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: badgeBg,
                        color: badgeColor,
                        border: `1px solid ${borderCol}`
                      }}>
                        {alert.severity || 'INFO'}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '4px 0 8px 0' }}>
                      {alert.message}
                    </p>

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.76rem', color: '#6b7280' }}>
                      {alert.machine_code && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', color: '#111827' }}>
                          <LucideTruck size={12} color="#0a2d23" /> {alert.machine_code}
                        </span>
                      )}
                      {alert.vendor_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', color: '#374151' }}>
                          <LucideBuilding2 size={12} color="#6b7280" /> {alert.vendor_name}
                        </span>
                      )}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#9ca3af' }}>
                        <LucideClock size={12} /> {alert.timestamp || (alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : 'Just now')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!alert.is_read ? (
                    <button
                      onClick={() => handleMarkRead(alert.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        background: '#0a2d23',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <LucideCheck size={14} /> Mark Read
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LucideCheckCircle size={14} /> Read
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
