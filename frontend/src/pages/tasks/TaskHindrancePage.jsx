import React, { useState, useMemo } from 'react';
import {
  LucideAlertTriangle, LucidePlus, LucideFilter, LucideSearch, LucideRefreshCw,
  LucideClock, LucideCheckCircle2, LucideAlertOctagon, LucideMapPin,
  LucideBuilding2, LucideFileText, LucideExternalLink, LucideX, LucideLayers,
  LucideChevronRight, LucideCalendar, LucideUserCheck, LucideDownload
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const INITIAL_HINDRANCES = [
  {
    id: 'HND-2026-104',
    title: 'GAIL High-Pressure Gas Pipeline Crossing',
    category: 'Utility Crossing',
    severity: 'Critical',
    status: 'Escalated',
    chainage: 'CH 14+250 to 14+320 (70m)',
    district: 'Ambala',
    block: 'Saha',
    section: 'Block PoP to GP Kesri',
    contractor: 'Premium Infra Solutions',
    department: 'GAIL (India) Limited',
    loggedDate: '12 Oct 2026',
    targetDate: '24 Oct 2026',
    description: 'Encountered 18-inch cross-country natural gas pipeline at 2.4m depth. Requires GAIL NOC and supervised trial pit before HDD bore initiation.',
    mitigation: 'Joint trial trenching scheduled with GAIL inspection engineer on 18 Oct. HDD entry point adjusted 15m away to maintain 3m safety clearance.'
  },
  {
    id: 'HND-2026-103',
    title: 'NHAI Highway Crossing ROW Permission Delay',
    category: 'ROW Clearance',
    severity: 'High',
    status: 'In Review',
    chainage: 'CH 08+100 to 08+180 (80m)',
    district: 'Karnal',
    block: 'Gharaunda',
    section: 'Ring-A Feeder Route',
    contractor: 'Naveen Telecom Network',
    department: 'NHAI Project Unit Panipat',
    loggedDate: '09 Oct 2026',
    targetDate: '22 Oct 2026',
    description: 'National Highway NH-44 crossing approval submitted. Demand note received; bank guarantee verification in progress with nodal office.',
    mitigation: 'Demand note fee of ₹1,45,000 processed. Expedited clearance meeting requested with Project Director NHAI.'
  },
  {
    id: 'HND-2026-102',
    title: 'Hard Basalt Rock Strata at 2.8m Depth',
    category: 'Strata Obstacle',
    severity: 'High',
    status: 'In Progress',
    chainage: 'CH 21+400 to 21+750 (350m)',
    district: 'Hisar',
    block: 'Hansi-1',
    section: 'GP Sisai to GP Kheri',
    contractor: 'Harpaal Infra Development',
    department: 'Geology & Mining / Project Tech',
    loggedDate: '05 Oct 2026',
    targetDate: '20 Oct 2026',
    description: 'Machine encountering unweathered quartzitic rock exceeding 140 MPa compressive strength. Standard reamer wearing prematurely.',
    mitigation: 'Mobilizing mud-motor roller cone rock bits and high-viscosity bentonite polymer mix from central depot.'
  },
  {
    id: 'HND-2026-101',
    title: 'Irrigation Canal Siphon Embankment Clearance',
    category: 'Waterway / Canal',
    severity: 'Medium',
    status: 'Open',
    chainage: 'CH 03+650 to 03+720 (70m)',
    district: 'Sonipat',
    block: 'Ganaur',
    section: 'Western Yamuna Canal Spurt',
    contractor: 'Shree Shyam Enterprises',
    department: 'Haryana Irrigation Dept',
    loggedDate: '14 Oct 2026',
    targetDate: '28 Oct 2026',
    description: 'HDD bore path passes 4.5m beneath lined distributary canal. Requires canal engineer permission and bund stability certification.',
    mitigation: 'Engineering profile drawings submitted. Field inspection slated for Monday with Sub-Divisional Officer.'
  },
  {
    id: 'HND-2026-100',
    title: 'Gram Panchayat Village Road Trenching Dispute',
    category: 'Local ROW',
    severity: 'Medium',
    status: 'Resolved',
    chainage: 'CH 01+200 to 01+450 (250m)',
    district: 'Rohtak',
    block: 'Kalanaur',
    section: 'GP Anwal Village Approach',
    contractor: 'Premium Infra Solutions',
    department: 'Block Development Officer (BDO)',
    loggedDate: '01 Oct 2026',
    targetDate: '10 Oct 2026',
    description: 'Local panchayat raised objection regarding paver block dismantling along village main street.',
    mitigation: 'Tri-party agreement executed with Sarpanch. Contractor committed to restoring paver blocks within 48h of duct laying. Clearance granted.'
  },
  {
    id: 'HND-2026-099',
    title: 'State Electricity 33kV Underground Power Cable Clash',
    category: 'Utility Crossing',
    severity: 'Critical',
    status: 'Resolved',
    chainage: 'CH 11+820 to 11+860 (40m)',
    district: 'Faridabad',
    block: 'Ballabgarh',
    section: 'Substation Feeder Link',
    contractor: 'Naveen Telecom',
    department: 'DHBVN Electricity Board',
    loggedDate: '28 Sept 2026',
    targetDate: '08 Oct 2026',
    description: 'Uncharted 33kV high-voltage transmission line located along proposed trench route.',
    mitigation: 'Joint cable detection conducted. Depth profile revised to 3.8m beneath power conduit with concrete slab markers.'
  }
];

export const TaskHindrancePage = () => {
  const [hindrances, setHindrances] = useState(INITIAL_HINDRANCES);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedHindrance, setSelectedHindrance] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    category: 'Utility Crossing',
    severity: 'High',
    chainage: '',
    district: 'Ambala',
    block: '',
    section: '',
    contractor: '',
    department: '',
    description: '',
    mitigation: ''
  });

  const filteredHindrances = useMemo(() => {
    return hindrances.filter(item => {
      if (statusFilter !== 'ALL' && item.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (severityFilter !== 'ALL' && item.severity.toUpperCase() !== severityFilter.toUpperCase()) return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match = item.id.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.district.toLowerCase().includes(q) ||
          item.block.toLowerCase().includes(q) ||
          item.chainage.toLowerCase().includes(q) ||
          item.contractor.toLowerCase().includes(q) ||
          item.department.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [hindrances, statusFilter, severityFilter, categoryFilter, search]);

  const metrics = useMemo(() => {
    const total = hindrances.length;
    const critical = hindrances.filter(h => h.severity === 'Critical' || h.status === 'Escalated').length;
    const inProgress = hindrances.filter(h => h.status === 'In Progress' || h.status === 'In Review' || h.status === 'Open').length;
    const resolved = hindrances.filter(h => h.status === 'Resolved').length;
    return { total, critical, inProgress, resolved };
  }, [hindrances]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!formData.title || !formData.chainage || !formData.district) {
      showToast('Please fill all required hindrance details', 'error');
      return;
    }

    const newRecord = {
      id: `HND-2026-${Math.floor(105 + Math.random() * 900)}`,
      title: formData.title,
      category: formData.category,
      severity: formData.severity,
      status: 'Open',
      chainage: formData.chainage,
      district: formData.district,
      block: formData.block || 'Central',
      section: formData.section || 'Trenching Route Span',
      contractor: formData.contractor || 'Assigned Vendor',
      department: formData.department || 'Local Nodal Agency',
      loggedDate: 'Today',
      targetDate: 'In 14 Days',
      description: formData.description || 'Hindrance logged by field operational supervisor.',
      mitigation: formData.mitigation || 'Awaiting initial authority coordination meeting.'
    };

    setHindrances([newRecord, ...hindrances]);
    setIsCreateOpen(false);
    showToast('✓ Hindrance logged successfully in register', 'success');
  };

  const getSeverityBadge = (severity) => {
    const styles = {
      CRITICAL: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
      HIGH: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
      MEDIUM: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
      LOW: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' }
    };
    const s = (severity || 'LOW').toUpperCase();
    const style = styles[s] || styles.LOW;
    return (
      <span style={{
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '0.72rem',
        fontWeight: '600',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        display: 'inline-block'
      }}>
        {severity}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      RESOLVED: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', dot: '#10b981' },
      ESCALATED: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444' },
      'IN PROGRESS': { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      'IN REVIEW': { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      OPEN: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b' }
    };
    const s = (status || 'OPEN').toUpperCase();
    const style = styles[s] || styles.OPEN;
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
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48', border: '1px solid #ffe4e6' }}>
            <LucideAlertTriangle size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>Hindrance Management</h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Right-of-Way (ROW), utility clash, and site clearance obstacles register</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => showToast('Exporting hindrance register to Excel...', 'info')}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucideDownload size={15} />
            Export Register
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucidePlus size={16} />
            Log New Hindrance
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Registered</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{metrics.total}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Across active blocks</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <LucideFileText size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #fecaca', background: '#fffcfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Critical / Escalated</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#dc2626', marginTop: '4px' }}>{metrics.critical}</div>
            <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '2px' }}>Requires authority NOC</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}>
            <LucideAlertOctagon size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #c7d2fe', background: '#fafbff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In Resolution</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#4f46e5', marginTop: '4px' }}>{metrics.inProgress}</div>
            <div style={{ fontSize: '0.72rem', color: '#6366f1', marginTop: '2px' }}>Trial pits & review ongoing</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338ca' }}>
            <LucideClock size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #a7f3d0', background: '#fcfdfd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cleared & Resolved</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#059669', marginTop: '4px' }}>{metrics.resolved}</div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '2px' }}>Chainage handed to trenching</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857' }}>
            <LucideCheckCircle2 size={22} />
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
            placeholder="Search by ID, chainage, contractor, agency..."
            style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#f8fafc', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Categories</option>
              <option value="Utility Crossing">Utility Crossing</option>
              <option value="ROW Clearance">ROW Clearance</option>
              <option value="Strata Obstacle">Strata Obstacle</option>
              <option value="Waterway / Canal">Waterway / Canal</option>
              <option value="Local ROW">Local ROW</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
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
              <option value="OPEN">Open</option>
              <option value="IN PROGRESS">In Progress</option>
              <option value="ESCALATED">Escalated</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Hindrance Table */}
      <div className="table-container" style={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>Hindrance ID</th>
                <th style={{ padding: '12px 16px' }}>Obstacle & Description</th>
                <th style={{ padding: '12px 16px' }}>Location / Chainage</th>
                <th style={{ padding: '12px 16px' }}>Responsible Agency</th>
                <th style={{ padding: '12px 16px' }}>Severity</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Target Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredHindrances.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hindrance records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredHindrances.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedHindrance(item)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: '600', fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#94a3b8' }}></span>
                        {item.id}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '280px' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.chainage}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.district} • {item.block}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.department}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.contractor}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {getSeverityBadge(item.severity)}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {getStatusBadge(item.status)}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LucideCalendar size={13} color="#94a3b8" />
                        {item.targetDate}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedHindrance(item)}
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

      {/* Inspect Hindrance Modal */}
      {selectedHindrance && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '580px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}>
                  <LucideAlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>{selectedHindrance.id}: {selectedHindrance.title}</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedHindrance.category} • Logged on {selectedHindrance.loggedDate}</p>
                </div>
              </div>
              <button onClick={() => setSelectedHindrance(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.82rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Location Chainage</div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '2px' }}>{selectedHindrance.chainage}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{selectedHindrance.district}, {selectedHindrance.block}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Responsible Agency</div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '2px' }}>{selectedHindrance.department}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Contractor: {selectedHindrance.contractor}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Obstacle Description</div>
                <div style={{ marginTop: '4px', padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', lineHeight: '1.5', color: '#334155' }}>
                  {selectedHindrance.description}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#047857', textTransform: 'uppercase', fontWeight: '600' }}>Mitigation Action & Clearance Plan</div>
                <div style={{ marginTop: '4px', padding: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', lineHeight: '1.5', color: '#065f46' }}>
                  {selectedHindrance.mitigation}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getSeverityBadge(selectedHindrance.severity)}
                  {getStatusBadge(selectedHindrance.status)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setHindrances(prev => prev.map(h => h.id === selectedHindrance.id ? { ...h, status: 'Resolved' } : h));
                      setSelectedHindrance(null);
                      showToast(`✓ Marked ${selectedHindrance.id} as Resolved`, 'success');
                    }}
                    className="btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Mark as Resolved
                  </button>
                  <button
                    onClick={() => setSelectedHindrance(null)}
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

      {/* Log New Hindrance Modal */}
      {isCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '520px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>Log New Site Hindrance</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.82rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Hindrance Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NHAI Crossing Bank Guarantee Pending"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                  >
                    <option value="Utility Crossing">Utility Crossing</option>
                    <option value="ROW Clearance">ROW Clearance</option>
                    <option value="Strata Obstacle">Strata Obstacle</option>
                    <option value="Waterway / Canal">Waterway / Canal</option>
                    <option value="Local ROW">Local ROW</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Severity</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Chainage *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CH 12+400 to 12+480"
                    value={formData.chainage}
                    onChange={(e) => setFormData({ ...formData, chainage: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>District *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ambala"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Responsible Agency / Department</label>
                <input
                  type="text"
                  placeholder="e.g. GAIL, NHAI, Irrigation Dept, State PWD"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Obstacle Description</label>
                <textarea
                  rows={2}
                  placeholder="Detailed description of obstacle..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
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
                  Save Hindrance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
