import React, { useState, useMemo } from 'react';
import {
  LucideNetwork, LucidePlus, LucideFilter, LucideSearch, LucideRefreshCw,
  LucideActivity, LucideCheckCircle2, LucideAlertTriangle, LucideServer,
  LucideArrowUpRight, LucideX, LucideLayers, LucideRadio, LucideCalendar,
  LucideDownload, LucideCpu, LucideSliders
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const INITIAL_OTN_SPANS = [
  {
    id: 'OTN-SP-101',
    name: 'Block PoP Saha to GP Kesri',
    ring: 'Ring-A (Ambala Core)',
    lengthKm: 14.8,
    fiberType: '48F Armored Ribbon',
    coresAllocated: 24,
    totalCores: 48,
    rxPowerDbm: -18.2,
    txPowerDbm: 2.1,
    attenuationDbKm: 0.22,
    oltTerminal: 'Tejas TJ1400-7 OLT-01',
    ontTerminal: 'GP ON-Premise ONT-04',
    vendor: 'Premium Infra Solutions',
    status: 'Active',
    lastSync: '10 mins ago',
    commissionDate: '28 Sept 2026'
  },
  {
    id: 'OTN-SP-102',
    name: 'Kesri Node to GP Bihta Spurt',
    ring: 'Ring-A (Ambala Core)',
    lengthKm: 8.4,
    fiberType: '24F Micro-duct Fiber',
    coresAllocated: 12,
    totalCores: 24,
    rxPowerDbm: -16.5,
    txPowerDbm: 1.8,
    attenuationDbKm: 0.21,
    oltTerminal: 'Tejas TJ1400 OLT-01',
    ontTerminal: 'Cisco C9200 Node',
    vendor: 'Naveen Telecom Network',
    status: 'Active',
    lastSync: '15 mins ago',
    commissionDate: '02 Oct 2026'
  },
  {
    id: 'OTN-SP-103',
    name: 'Gharaunda PoP to GP Chaura',
    ring: 'Ring-B (Karnal Link)',
    lengthKm: 22.1,
    fiberType: '96F Armored Trunk',
    coresAllocated: 48,
    totalCores: 96,
    rxPowerDbm: -26.9,
    txPowerDbm: 2.5,
    attenuationDbKm: 0.38,
    oltTerminal: 'Nokia 7360 ISAM FX',
    ontTerminal: 'Tejas TJ1600 Core',
    vendor: 'Harpaal Infra Development',
    status: 'Degraded',
    lastSync: '5 mins ago',
    commissionDate: '10 Oct 2026'
  },
  {
    id: 'OTN-SP-104',
    name: 'GP Chaura to GP Kohand Sub-ring',
    ring: 'Ring-B (Karnal Link)',
    lengthKm: 11.2,
    fiberType: '48F Armored Ribbon',
    coresAllocated: 16,
    totalCores: 48,
    rxPowerDbm: -19.4,
    txPowerDbm: 2.0,
    attenuationDbKm: 0.24,
    oltTerminal: 'Nokia 7360 ISAM',
    ontTerminal: 'Huawei OptiX OSN',
    vendor: 'Naveen Telecom Network',
    status: 'Active',
    lastSync: '22 mins ago',
    commissionDate: '08 Oct 2026'
  },
  {
    id: 'OTN-SP-105',
    name: 'Hansi-1 PoP to GP Sisai Central',
    ring: 'Ring-C (Hisar-Hansi)',
    lengthKm: 18.6,
    fiberType: '48F Micro-duct Fiber',
    coresAllocated: 0,
    totalCores: 48,
    rxPowerDbm: null,
    txPowerDbm: null,
    attenuationDbKm: null,
    oltTerminal: 'Tejas TJ1400-7 OLT-02',
    ontTerminal: 'Pending GP Node Enclosure',
    vendor: 'Shree Shyam Enterprises',
    status: 'Testing',
    lastSync: '1 hour ago',
    commissionDate: 'Pending'
  },
  {
    id: 'OTN-SP-106',
    name: 'Ballabgarh Central PoP to GP Mohna',
    ring: 'Ring-D (Faridabad Spur)',
    lengthKm: 16.3,
    fiberType: '48F Armored Ribbon',
    coresAllocated: 24,
    totalCores: 48,
    rxPowerDbm: -31.4,
    txPowerDbm: 1.5,
    attenuationDbKm: 0.49,
    oltTerminal: 'Cisco NCS 2000 OLT',
    ontTerminal: 'Tejas TJ1400 Sub',
    vendor: 'Premium Infra Solutions',
    status: 'Down',
    lastSync: '2 mins ago',
    commissionDate: '04 Oct 2026'
  }
];

export const TaskOtnPage = () => {
  const [spans, setSpans] = useState(INITIAL_OTN_SPANS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [ringFilter, setRingFilter] = useState('ALL');
  const [selectedSpan, setSelectedSpan] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    ring: 'Ring-A (Ambala Core)',
    lengthKm: '',
    fiberType: '48F Armored Ribbon',
    totalCores: '48',
    oltTerminal: 'Tejas TJ1400-7 OLT',
    ontTerminal: 'GP Premise ONT',
    vendor: 'Premium Infra Solutions'
  });

  const filteredSpans = useMemo(() => {
    return spans.filter(item => {
      if (statusFilter !== 'ALL' && item.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (ringFilter !== 'ALL' && item.ring !== ringFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match = item.id.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.ring.toLowerCase().includes(q) ||
          item.oltTerminal.toLowerCase().includes(q) ||
          item.vendor.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [spans, statusFilter, ringFilter, search]);

  const metrics = useMemo(() => {
    const total = spans.length;
    const active = spans.filter(s => s.status === 'Active').length;
    const testing = spans.filter(s => s.status === 'Testing').length;
    const degradedOrDown = spans.filter(s => s.status === 'Degraded' || s.status === 'Down').length;
    return { total, active, testing, degradedOrDown };
  }, [spans]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.lengthKm) {
      showToast('Please fill all required span parameters', 'error');
      return;
    }

    const newSpan = {
      id: `OTN-SP-${Math.floor(107 + Math.random() * 800)}`,
      name: formData.name,
      ring: formData.ring,
      lengthKm: parseFloat(formData.lengthKm) || 10.0,
      fiberType: formData.fiberType,
      coresAllocated: 0,
      totalCores: parseInt(formData.totalCores) || 48,
      rxPowerDbm: -19.0,
      txPowerDbm: 2.0,
      attenuationDbKm: 0.23,
      oltTerminal: formData.oltTerminal,
      ontTerminal: formData.ontTerminal,
      vendor: formData.vendor,
      status: 'Testing',
      lastSync: 'Just now',
      commissionDate: 'In Commissioning'
    };

    setSpans([newSpan, ...spans]);
    setIsCreateOpen(false);
    showToast('✓ New OTN Link registered for optical commissioning', 'success');
  };

  const getStatusBadge = (status) => {
    const styles = {
      ACTIVE: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', dot: '#10b981', label: 'Traffic Live' },
      DEGRADED: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b', label: 'High dB Loss' },
      DOWN: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444', label: 'Link Down' },
      TESTING: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6', label: 'Testing' }
    };
    const s = (status || 'TESTING').toUpperCase();
    const style = styles[s] || styles.TESTING;
    return (
      <span style={{
        padding: '3px 10px',
        borderRadius: '20px',
        fontSize: '0.72rem',
        fontWeight: '600',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: style.dot }}></span>
        {style.label}
      </span>
    );
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', border: '1px solid #e0f2fe' }}>
            <LucideNetwork size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>Optical Transport Network (OTN)</h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fiber link monitoring, optical power dBm calibration, and ring commissioning</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => showToast('Syncing live optical power metrics from OLT NMS...', 'info')}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucideRefreshCw size={15} />
            Sync Optical Power
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucidePlus size={16} />
            Add OTN Link
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Monitored Spans</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{metrics.total}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>91.4 km active route fiber</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <LucideLayers size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #a7f3d0', background: '#fcfdfd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Traffic Live & Stable</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#059669', marginTop: '4px' }}>{metrics.active}</div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '2px' }}>Rx Power &lt; -24 dBm spec</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857' }}>
            <LucideRadio size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #bae6fd', background: '#f8fcff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Testing & Splicing</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#0284c7', marginTop: '4px' }}>{metrics.testing}</div>
            <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: '2px' }}>OTDR trace calibration</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
            <LucideActivity size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #fecaca', background: '#fffcfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Degraded / Down</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#dc2626', marginTop: '4px' }}>{metrics.degradedOrDown}</div>
            <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '2px' }}>Loss &gt; 0.35 dB/km</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}>
            <LucideAlertTriangle size={22} />
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="app-card" style={{ padding: '12px 18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '280px', maxWidth: '420px' }}>
          <LucideSearch size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Span ID, ring name, terminal node..."
            style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#f8fafc', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>Ring:</span>
            <select
              value={ringFilter}
              onChange={(e) => setRingFilter(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Optical Rings</option>
              <option value="Ring-A (Ambala Core)">Ring-A (Ambala Core)</option>
              <option value="Ring-B (Karnal Link)">Ring-B (Karnal Link)</option>
              <option value="Ring-C (Hisar-Hansi)">Ring-C (Hisar-Hansi)</option>
              <option value="Ring-D (Faridabad Spur)">Ring-D (Faridabad Spur)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Traffic Live</option>
              <option value="TESTING">Testing</option>
              <option value="DEGRADED">Degraded</option>
              <option value="DOWN">Down</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main OTN Table */}
      <div className="table-container" style={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>Span ID</th>
                <th style={{ padding: '12px 16px' }}>Span Route Name</th>
                <th style={{ padding: '12px 16px' }}>Ring & Architecture</th>
                <th style={{ padding: '12px 16px' }}>Distance & Spec</th>
                <th style={{ padding: '12px 16px' }}>Cores Allocated</th>
                <th style={{ padding: '12px 16px' }}>Optical Rx / Loss</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSpans.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No OTN spans match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredSpans.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedSpan(item)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: '600', fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#0284c7' }}></span>
                        {item.id}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '280px' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.oltTerminal} &rarr; {item.ontTerminal}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.ring}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.vendor}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.lengthKm} km</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.fiberType}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.coresAllocated} / {item.totalCores}</span>
                        <div style={{ width: '60px', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${(item.coresAllocated / item.totalCores) * 100}%`, height: '100%', background: '#0284c7', borderRadius: '4px' }}></div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {item.rxPowerDbm ? (
                        <div>
                          <span style={{ fontFamily: 'monospace', fontWeight: '600', color: item.rxPowerDbm < -25 ? '#dc2626' : '#1e293b' }}>
                            {item.rxPowerDbm} dBm
                          </span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>
                            {item.attenuationDbKm} dB/km
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Pending Trace</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {getStatusBadge(item.status)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedSpan(item)}
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: '600' }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Span Details Modal */}
      {selectedSpan && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '580px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                  <LucideNetwork size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>{selectedSpan.id}: {selectedSpan.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedSpan.ring} • {selectedSpan.lengthKm} km</p>
                </div>
              </div>
              <button onClick={() => setSelectedSpan(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.82rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Origin OLT Terminal</div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '2px' }}>{selectedSpan.oltTerminal}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Destination ONT Node</div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '2px' }}>{selectedSpan.ontTerminal}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Rx Optical Power</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', fontFamily: 'monospace', color: '#1e293b', marginTop: '4px' }}>
                    {selectedSpan.rxPowerDbm ? `${selectedSpan.rxPowerDbm} dBm` : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#059669', marginTop: '2px' }}>Within spec</div>
                </div>
                <div style={{ padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Span Attenuation</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', fontFamily: 'monospace', color: '#1e293b', marginTop: '4px' }}>
                    {selectedSpan.attenuationDbKm ? `${selectedSpan.attenuationDbKm} dB/km` : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>Target &lt; 0.25</div>
                </div>
                <div style={{ padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Cores Utilization</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '700', fontFamily: 'monospace', color: '#1e293b', marginTop: '4px' }}>
                    {selectedSpan.coresAllocated} / {selectedSpan.totalCores}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#0284c7', marginTop: '2px' }}>
                    {Math.round((selectedSpan.coresAllocated / selectedSpan.totalCores) * 100)}% active
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Contractor & Commissioning Details</div>
                <div style={{ marginTop: '4px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#334155' }}>
                  Partner: {selectedSpan.vendor} • Commissioned Date: {selectedSpan.commissionDate}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <div>
                  {getStatusBadge(selectedSpan.status)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => {
                      showToast(`Triggered live OTDR trace diagnostic for ${selectedSpan.id}`, 'info');
                    }}
                    className="btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Run OTDR Trace
                  </button>
                  <button
                    onClick={() => setSelectedSpan(null)}
                    className="btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add OTN Link Modal */}
      {isCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '520px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>Commission New OTN Span Link</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.82rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Span Route Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Block PoP Saha to GP Kesri Link"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Target Optical Ring</label>
                  <select
                    value={formData.ring}
                    onChange={(e) => setFormData({ ...formData, ring: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                  >
                    <option value="Ring-A (Ambala Core)">Ring-A (Ambala Core)</option>
                    <option value="Ring-B (Karnal Link)">Ring-B (Karnal Link)</option>
                    <option value="Ring-C (Hisar-Hansi)">Ring-C (Hisar-Hansi)</option>
                    <option value="Ring-D (Faridabad Spur)">Ring-D (Faridabad Spur)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Route Length (km) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="e.g. 14.5"
                    value={formData.lengthKm}
                    onChange={(e) => setFormData({ ...formData, lengthKm: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Fiber Specification</label>
                  <select
                    value={formData.fiberType}
                    onChange={(e) => setFormData({ ...formData, fiberType: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                  >
                    <option value="24F Micro-duct Fiber">24F Micro-duct Fiber</option>
                    <option value="48F Armored Ribbon">48F Armored Ribbon</option>
                    <option value="96F Armored Trunk">96F Armored Trunk</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Total Cores Count</label>
                  <input
                    type="number"
                    value={formData.totalCores}
                    onChange={(e) => setFormData({ ...formData, totalCores: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>OLT Terminal Node</label>
                  <input
                    type="text"
                    placeholder="e.g. Tejas TJ1400-7 OLT-01"
                    value={formData.oltTerminal}
                    onChange={(e) => setFormData({ ...formData, oltTerminal: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>ONT Destination Node</label>
                  <input
                    type="text"
                    placeholder="e.g. GP Kesri On-Premise"
                    value={formData.ontTerminal}
                    onChange={(e) => setFormData({ ...formData, ontTerminal: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                >
                  Register OTN Span
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
