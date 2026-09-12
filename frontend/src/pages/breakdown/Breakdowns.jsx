import React, { useEffect, useState } from 'react';
import { breakdownService } from '../../services/breakdownService';
import { vendorService } from '../../services/vendorService';
import { machineService } from '../../services/machineService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideWrench,
  LucideAlertOctagon,
  LucideCheckCircle2,
  LucideClock,
  LucidePlus,
  LucideSearch,
  LucideRefreshCw,
  LucideBuilding2,
  LucideTruck,
  LucideX,
  LucideFileText,
  LucideAlertTriangle
} from 'lucide-react';
import '../../styles/screens.css';

export const Breakdowns = () => {
  const { user, isAdmin, vendors } = useAuth();
  const [breakdowns, setBreakdowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [vendorList, setVendorList] = useState([]);
  const [machineList, setMachineList] = useState([]);

  // Modal state for Report New Breakdown
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    machine_id: '',
    description: '',
    severity: 'HIGH',
    reported_by: '',
    location: ''
  });

  // Default demo breakdown history logs
  const demoBreakdowns = [
    {
      id: 101,
      ticket_code: 'BD-2026-0891',
      machine_code: 'A800 HDD (8593)',
      machine_model: 'A800 HDD Heavy Rig',
      vendor_name: 'Naveen Telecom Network 2',
      description: 'Mud pump pressure drop during deep trenching. Hydraulic pressure valve replacement required.',
      severity: 'HIGH',
      status: 'IN_PROGRESS',
      reported_by: 'Swarnim Mittal (Operator)',
      location: 'Sujangarh-SITE (Ch: 12+400)',
      reported_at: '2026-09-07T14:30:00Z',
      downtime_hours: '4.5 hrs'
    },
    {
      id: 104,
      ticket_code: 'BD-2026-0914',
      machine_code: 'A800 HDD (8593)',
      machine_model: 'A800 HDD Heavy Rig',
      vendor_name: 'Naveen Telecom Network 2',
      description: 'Cooling system temperature warning during prolonged drilling operation. Radiator flushed.',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      reported_by: 'Dalveer choudhary (Operator)',
      location: 'Sujangarh-SITE (Ch: 14+200)',
      reported_at: '2026-09-04T11:00:00Z',
      downtime_hours: '1.5 hrs'
    },
    {
      id: 105,
      ticket_code: 'BD-2026-0925',
      machine_code: 'A800 HDD (8593)',
      machine_model: 'A800 HDD Heavy Rig',
      vendor_name: 'Naveen Telecom Network 2',
      description: 'Drill rod thread inspection required before starting Ring 02 HDD pullback section.',
      severity: 'LOW',
      status: 'OPEN',
      reported_by: 'Jugal kishor (Tracker)',
      location: 'Sujangarh Ring Route',
      reported_at: '2026-09-08T08:00:00Z',
      downtime_hours: '0.5 hrs'
    },
    {
      id: 102,
      ticket_code: 'BD-2026-0854',
      machine_code: 'XCMG 320 (7421)',
      machine_model: 'XCMG 320 HDD Rig',
      vendor_name: 'Gurukripa Enterprises',
      description: 'Hydraulic hose leak near primary carriage motor assembly. Hose replaced and fluid refilled.',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      reported_by: 'HDD OP Mahaveer',
      location: 'Chhitroli Block (Ch: 04+120)',
      reported_at: '2026-09-05T09:15:00Z',
      downtime_hours: '2.0 hrs'
    },
    {
      id: 103,
      ticket_code: 'BD-2026-0812',
      machine_code: 'VERMEER D24x40 (9102)',
      machine_model: 'Vermeer D24x40 III',
      vendor_name: 'HARPAL INFRA DEVELOPMENT',
      description: 'Radiator fan belt snapped under heavy load. Maintenance crew dispatched with replacement belt.',
      severity: 'HIGH',
      status: 'OPEN',
      reported_by: 'Harpal Singh',
      location: 'Bagru Ring Route 01',
      reported_at: '2026-09-08T06:00:00Z',
      downtime_hours: '8.0 hrs'
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
    machineService.getAll({ page: 0, size: 50 })
      .then(res => {
        const list = res.data?.results || res.data?.data || res.data || [];
        setMachineList(Array.isArray(list) ? list : []);
      })
      .catch(console.error);
  }, [isAdmin]);

  const fetchBreakdowns = () => {
    setLoading(true);
    const params = {};
    if (selectedVendor !== 'all') params.vendor_id = selectedVendor;

    breakdownService.getAll(params)
      .then(res => {
        const payload = res.data?.data || res.data || {};
        const list = payload.results || payload.content || (Array.isArray(payload) ? payload : []);
        setBreakdowns(Array.isArray(list) ? list : []);
      })
      .catch(err => {
        console.error("Error fetching breakdowns:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBreakdowns();
  }, [selectedVendor]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...formData,
      ticket_code: `BD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'OPEN',
      reported_at: new Date().toISOString()
    };

    breakdownService.create(payload)
      .then(() => {
        setIsModalOpen(false);
        fetchBreakdowns();
      })
      .catch(() => {
        // Fallback local update
        const newTicket = {
          id: Date.now(),
          ...payload,
          machine_code: machineList.find(m => String(m.id) === String(formData.machine_id))?.code || 'HDD RIG',
          vendor_name: activeVendorName,
          downtime_hours: '0.5 hrs'
        };
        setBreakdowns(prev => [newTicket, ...prev]);
        setIsModalOpen(false);
      })
      .finally(() => setSubmitting(false));
  };

  const activeVendorName = vendors && vendors.length > 0 ? (vendors[0].name || vendors[0].partnerName) : 'Your Vendor Account';

  const filteredBreakdowns = breakdowns.filter(b => {
    if (!isAdmin) {
      // Non-admin Vendor user: Strictly restrict to vendor's items!
      const userVendorNames = vendors.map(v => (v.name || v.partnerName || '').toLowerCase());
      const bVendor = (b.vendor_name || b.vendor?.name || '').toLowerCase();
      if (userVendorNames.length > 0 && bVendor) {
        const isMatch = userVendorNames.some(vn => vn && (bVendor.includes(vn) || vn.includes(bVendor)));
        if (!isMatch) return false;
      }
    }
    if (statusFilter !== 'ALL' && (b.status || '').toUpperCase() !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (b.ticket_code && b.ticket_code.toLowerCase().includes(q)) ||
      (b.machine_code && b.machine_code.toLowerCase().includes(q)) ||
      (b.description && b.description.toLowerCase().includes(q)) ||
      (b.vendor_name && b.vendor_name.toLowerCase().includes(q)) ||
      (b.reported_by && b.reported_by.toLowerCase().includes(q))
    );
  });

  const openCount = filteredBreakdowns.filter(b => (b.status || '').toUpperCase() === 'OPEN').length;
  const inProgressCount = filteredBreakdowns.filter(b => (b.status || '').toUpperCase() === 'IN_PROGRESS').length;
  const resolvedCount = filteredBreakdowns.filter(b => (b.status || '').toUpperCase() === 'RESOLVED' || (b.status || '').toUpperCase() === 'CLOSED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#111827' }}>
              Breakdown Tickets & Repair History
            </h1>
            {isAdmin ? (
              <span style={{ fontSize: '0.72rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 10px', borderRadius: '12px', fontWeight: '700' }}>
                ● Admin Master View (All Breakdown Tickets)
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: '12px', fontWeight: '700' }}>
                ● Vendor Scoped Breakdown History: {activeVendorName}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Track machine breakdown reports, hydraulic/engine repair history, and downtime logs
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '700',
              background: '#0a2d23',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucidePlus size={15} /> Report New Breakdown
          </button>

          <button onClick={fetchBreakdowns} className="app-card" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh History
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #dc2626' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Open Tickets</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#dc2626', marginTop: '4px' }}>
            {openCount} <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: '600' }}>Open</span>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #d97706' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Under Repair</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>
            {inProgressCount} <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: '600' }}>In Repair</span>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #059669' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Resolved Tickets</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#059669', marginTop: '4px' }}>
            {resolvedCount} <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: '600' }}>Resolved</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Search + Status Filter + Admin Vendor Selection */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
        <div style={{ flex: '1', minWidth: '260px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search breakdowns by ticket code, machine, description, or operator..."
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

        {/* Status Pills */}
        <div style={{ display: 'flex', gap: '6px', background: '#f3f4f6', padding: '4px', borderRadius: '10px' }}>
          {['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === st ? '#0a2d23' : 'transparent',
                color: statusFilter === st ? '#ffffff' : '#4b5563'
              }}
            >
              {st}
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
              <option value="all">🏢 All Vendors (Master List)</option>
              {vendorList.map(v => (
                <option key={v.id || v.external_vendor_id} value={v.id || v.external_vendor_id}>
                  {v.partnerName || v.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Breakdown History Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
          Fetching breakdown ticket history...
        </div>
      ) : filteredBreakdowns.length === 0 ? (
        <div className="app-card" style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          <LucideWrench size={32} style={{ margin: '0 auto 8px', color: '#9ca3af' }} />
          <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No breakdown tickets found</div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Try adjusting status filters or search query.</div>
        </div>
      ) : (
        <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px' }}>Ticket Code</th>
                <th style={{ padding: '12px 16px' }}>Machine / Asset</th>
                <th style={{ padding: '12px 16px' }}>Assigned Vendor</th>
                <th style={{ padding: '12px 16px' }}>Problem Description</th>
                <th style={{ padding: '12px 16px' }}>Severity</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Reported Date & Downtime</th>
              </tr>
            </thead>
            <tbody>
              {filteredBreakdowns.map(b => {
                const isHigh = (b.severity || '').toUpperCase() === 'HIGH' || (b.severity || '').toUpperCase() === 'CRITICAL';
                const isOpen = (b.status || '').toUpperCase() === 'OPEN';
                const isInProgress = (b.status || '').toUpperCase() === 'IN_PROGRESS';

                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#0369a1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LucideWrench size={14} color="#0369a1" />
                        {b.ticket_code || `BD-${b.id}`}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#111827' }}>
                      <div>{b.machine_code || b.machine_name || 'HDD Machine'}</div>
                      {b.location && <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 'normal' }}>📍 {b.location}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: '#374151' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <LucideBuilding2 size={13} color="#6b7280" />
                        {b.vendor_name || activeVendorName}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151', maxWidth: '300px' }}>
                      <div>{b.description}</div>
                      {b.reported_by && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '2px' }}>Reported by: {b.reported_by}</div>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        background: isHigh ? '#fef2f2' : '#fffbeb',
                        color: isHigh ? '#dc2626' : '#d97706',
                        border: `1px solid ${isHigh ? '#fca5a5' : '#fde68a'}`
                      }}>
                        {b.severity || 'HIGH'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        background: isOpen ? '#fef2f2' : isInProgress ? '#fffbeb' : '#ecfdf5',
                        color: isOpen ? '#dc2626' : isInProgress ? '#92400e' : '#047857'
                      }}>
                        ● {b.status || 'OPEN'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6b7280' }}>
                      <div>{b.reported_at ? new Date(b.reported_at).toLocaleDateString() : 'Recent'}</div>
                      <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: '600' }}>⏱️ {b.downtime_hours || '2.0 hrs'}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Report New Breakdown Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            boxSizing: 'border-box',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideAlertOctagon color="#dc2626" size={20} /> Report Machine Breakdown
              </h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <LucideX size={20} color="#6b7280" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Select Machine</label>
                <select
                  required
                  value={formData.machine_id}
                  onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                >
                  <option value="">-- Choose Machine --</option>
                  {machineList.map(m => (
                    <option key={m.id} value={m.id}>{m.code} ({m.model || m.category})</option>
                  ))}
                  <option value="999">A800 HDD (8593)</option>
                  <option value="998">XCMG 320 (7421)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Breakdown Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe failure details (e.g. mud pump pressure drop, hydraulic hose leak)..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Severity</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                  >
                    <option value="HIGH">CRITICAL / HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Reporter Name</label>
                  <input
                    type="text"
                    placeholder="Operator name"
                    value={formData.reported_by}
                    onChange={(e) => setFormData({ ...formData, reported_by: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Site Location</label>
                <input
                  type="text"
                  placeholder="e.g. Sujangarh-SITE (Ch: 12+400)"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '8px 20px', borderRadius: '8px', background: '#dc2626', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '700' }}
                >
                  {submitting ? 'Submitting...' : 'Submit Breakdown Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
