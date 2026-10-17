import React, { useState, useMemo } from 'react';
import {
  LucideFileCheck, LucidePlus, LucideFilter, LucideSearch, LucideRefreshCw,
  LucideFileText, LucideCheckCircle2, LucideClock, LucideAlertTriangle,
  LucideDollarSign, LucideLayers, LucideDownload, LucideX, LucideExternalLink,
  LucideArrowRight, LucideBuilding, LucideCalendar
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const INITIAL_CCNS = [
  {
    id: 'CCN-2026-041',
    title: 'Culvert & Canal Bypass Route Realignment',
    category: 'Route Realignment',
    stage: 'Under Review',
    status: 'In Review',
    taskRef: 'TASK-TR-Saha-04 (Kesri Link)',
    deviationType: 'Lateral Deviation & HDD Conversion',
    chainageImpact: '+180 meters (CH 12+200)',
    costDeltaInr: 185000,
    requestedBy: 'Premium Infra Solutions',
    approver: 'PMC Lead Engineer (RITES)',
    submissionDate: '11 Oct 2026',
    approvalDate: 'Pending',
    description: 'Irrigation department denied permission to dig open trench across minor canal bank. Required diverting 180m and boring 3.5m deep via HDD.',
    justification: 'Avoids 45-day canal cutting clearance stoppage. Keeps overall project delivery within target month.'
  },
  {
    id: 'CCN-2026-040',
    title: 'Hard Quartzite Strata Depth Deviation',
    category: 'Depth Deviation',
    stage: 'Approved',
    status: 'Approved',
    taskRef: 'TASK-TR-Hansi-09 (Sisai Link)',
    deviationType: 'Depth Reduction to 1.45m with Split-Pipe Protection',
    chainageImpact: 'CH 21+400 to 21+750 (350m)',
    costDeltaInr: -42000,
    requestedBy: 'Harpaal Infra Development',
    approver: 'BharatNet Project Director',
    submissionDate: '04 Oct 2026',
    approvalDate: '09 Oct 2026',
    description: 'Encountered solid unweathered granite rock at 1.5m. Authorized laying duct at 1.45m depth encased in Class-B DWC split pipe and reinforced concrete slab.',
    justification: 'Prevented excessive machine drill wear while guaranteeing 20-year structural protection per BharatNet spec.'
  },
  {
    id: 'CCN-2026-039',
    title: 'National Highway NH-44 Crossing Extension',
    category: 'Chainage Extension',
    stage: 'Pending PMC',
    status: 'Pending',
    taskRef: 'TASK-TR-Karnal-14',
    deviationType: 'Bore Span Extended from 60m to 110m',
    chainageImpact: '+50 meters',
    costDeltaInr: 220000,
    requestedBy: 'Naveen Telecom Network',
    approver: 'NHAI Liaison & PMC',
    submissionDate: '08 Oct 2026',
    approvalDate: 'Pending',
    description: 'NHAI service lane expansion requires extending HDD entry and exit pits beyond future highway boundary line.',
    justification: 'Ensures fiber conduit is outside NHAI future road widening excavation footprint.'
  },
  {
    id: 'CCN-2026-038',
    title: 'Trenching to Micro-Trenching Conversion in Congested Bazaar',
    category: 'Method Change',
    stage: 'Approved',
    status: 'Approved',
    taskRef: 'TASK-TR-Rohtak-02 (Kalanaur)',
    deviationType: 'Open Trenching to Micro-Trenching',
    chainageImpact: 'CH 01+100 to 01+550 (450m)',
    costDeltaInr: 95000,
    requestedBy: 'Premium Infra Solutions',
    approver: 'Municipal Committee & PMC',
    submissionDate: '26 Sept 2026',
    approvalDate: '02 Oct 2026',
    description: 'Dense commercial market area with heavy pedestrian footfall. Municipal committee prohibited conventional open ditch digging.',
    justification: 'Micro-trenching allowed laying microduct and backfilling with polymer concrete within 6 hours without traffic disruption.'
  },
  {
    id: 'CCN-2026-037',
    title: 'Substation High-Voltage Route Offset',
    category: 'Route Realignment',
    stage: 'Approved',
    status: 'Approved',
    taskRef: 'TASK-TR-Faridabad-07',
    deviationType: 'Right-side Verge Offset (25m)',
    chainageImpact: '+35 meters',
    costDeltaInr: 45000,
    requestedBy: 'Naveen Telecom',
    approver: 'State Electricity Board & PMC',
    submissionDate: '21 Sept 2026',
    approvalDate: '27 Sept 2026',
    description: 'Shifted alignment from left shoulder to right shoulder to maintain mandatory safety clearance from 66kV substation boundary wall.',
    justification: 'Safety hazard compliance verified by DISCOM electrical inspector.'
  }
];

export const TaskCcnPage = () => {
  const [ccns, setCcns] = useState(INITIAL_CCNS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedCcn, setSelectedCcn] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    category: 'Route Realignment',
    taskRef: '',
    deviationType: '',
    chainageImpact: '',
    costDeltaInr: '',
    requestedBy: 'Premium Infra Solutions',
    description: '',
    justification: ''
  });

  const filteredCcns = useMemo(() => {
    return ccns.filter(item => {
      if (statusFilter !== 'ALL' && item.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match = item.id.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.taskRef.toLowerCase().includes(q) ||
          item.requestedBy.toLowerCase().includes(q) ||
          item.approver.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [ccns, statusFilter, categoryFilter, search]);

  const metrics = useMemo(() => {
    const total = ccns.length;
    const pending = ccns.filter(c => c.status === 'In Review' || c.status === 'Pending').length;
    const approved = ccns.filter(c => c.status === 'Approved').length;
    const totalCostDelta = ccns.reduce((acc, c) => acc + (c.costDeltaInr || 0), 0);
    return { total, pending, approved, totalCostDelta };
  }, [ccns]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!formData.title || !formData.taskRef) {
      showToast('Please fill all required CCN details', 'error');
      return;
    }

    const newCcn = {
      id: `CCN-2026-${Math.floor(100 + Math.random() * 899)}`,
      title: formData.title,
      category: formData.category,
      stage: 'Pending PMC',
      status: 'Pending',
      taskRef: formData.taskRef,
      deviationType: formData.deviationType || 'Scope Deviation',
      chainageImpact: formData.chainageImpact || 'To be surveyed',
      costDeltaInr: parseInt(formData.costDeltaInr) || 0,
      requestedBy: formData.requestedBy,
      approver: 'Assigned PMC Lead',
      submissionDate: 'Today',
      approvalDate: 'Pending',
      description: formData.description || 'Change control notice logged for authority verification.',
      justification: formData.justification || 'Site condition change requirement.'
    };

    setCcns([newCcn, ...ccns]);
    setIsCreateOpen(false);
    showToast('✓ Change Control Notice (CCN) submitted for review', 'success');
  };

  const getStatusBadge = (status) => {
    const styles = {
      APPROVED: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', dot: '#10b981', label: 'Approved' },
      'IN REVIEW': { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd', dot: '#0284c7', label: 'In Review' },
      REJECTED: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444', label: 'Rejected' },
      PENDING: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b', label: 'Pending PMC' }
    };
    const s = (status || 'PENDING').toUpperCase();
    const style = styles[s] || styles.PENDING;
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
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', border: '1px solid #dcfce7' }}>
            <LucideFileCheck size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>Change Control Notices (CCN)</h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Route realignments, depth deviations, scope modifications, and engineering approvals</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => showToast('Exporting CCN change register to Excel...', 'info')}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucideDownload size={15} />
            Export CCN Log
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucidePlus size={16} />
            Raise New CCN
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total CCNs Raised</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>{metrics.total}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Across active contractors</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <LucideFileText size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #fde68a', background: '#fffef9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending PMC Review</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#d97706', marginTop: '4px' }}>{metrics.pending}</div>
            <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '2px' }}>Awaiting technical audit</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
            <LucideClock size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #a7f3d0', background: '#fcfdfd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Approved Variations</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#059669', marginTop: '4px' }}>{metrics.approved}</div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '2px' }}>Baseline route updated</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857' }}>
            <LucideCheckCircle2 size={22} />
          </div>
        </div>

        <div className="app-card" style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #bbf7d0', background: '#f7fee7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Net Cost Variation</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#16a34a', marginTop: '4px' }}>
              ₹{(metrics.totalCostDelta / 100000).toFixed(2)} Lakh
            </div>
            <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '2px' }}>Cumulative contract impact</div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
            <LucideDollarSign size={22} />
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
            placeholder="Search by CCN number, title, route ref..."
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
              <option value="Route Realignment">Route Realignment</option>
              <option value="Depth Deviation">Depth Deviation</option>
              <option value="Chainage Extension">Chainage Extension</option>
              <option value="Method Change">Method Change</option>
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
              <option value="APPROVED">Approved</option>
              <option value="IN REVIEW">In Review</option>
              <option value="PENDING">Pending PMC</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main CCN Table */}
      <div className="table-container" style={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>CCN Number</th>
                <th style={{ padding: '12px 16px' }}>Title & Scope Deviation</th>
                <th style={{ padding: '12px 16px' }}>Route Reference</th>
                <th style={{ padding: '12px 16px' }}>Category</th>
                <th style={{ padding: '12px 16px' }}>Contractor / Sign-off</th>
                <th style={{ padding: '12px 16px' }}>Cost Delta</th>
                <th style={{ padding: '12px 16px' }}>Approval Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCcns.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No change control notices match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredCcns.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedCcn(item)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: '600', fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a' }}></span>
                        {item.id}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '280px' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.deviationType}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.taskRef}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.chainageImpact}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '500', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                        {item.category}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.requestedBy}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PMC: {item.approver}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: '600', color: item.costDeltaInr >= 0 ? 'var(--text-primary)' : '#059669' }}>
                        {item.costDeltaInr >= 0 ? `+₹${item.costDeltaInr.toLocaleString('en-IN')}` : `-₹${Math.abs(item.costDeltaInr).toLocaleString('en-IN')}`}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {getStatusBadge(item.status)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedCcn(item)}
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: '600' }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect CCN Details Modal */}
      {selectedCcn && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '580px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                  <LucideFileCheck size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>{selectedCcn.id}: {selectedCcn.title}</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedCcn.category} • Submitted on {selectedCcn.submissionDate}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCcn(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.82rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Associated Route Task</div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '2px' }}>{selectedCcn.taskRef}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Impact: {selectedCcn.chainageImpact}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Contract Financial Impact</div>
                  <div style={{ fontWeight: '700', color: '#1e293b', marginTop: '2px', fontFamily: 'monospace' }}>
                    {selectedCcn.costDeltaInr >= 0 ? `+₹${selectedCcn.costDeltaInr.toLocaleString('en-IN')}` : `-₹${Math.abs(selectedCcn.costDeltaInr).toLocaleString('en-IN')}`}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>PMC Audit: {selectedCcn.approver}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Scope Deviation Details</div>
                <div style={{ marginTop: '4px', padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', lineHeight: '1.5', color: '#334155' }}>
                  {selectedCcn.description}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#047857', textTransform: 'uppercase', fontWeight: '600' }}>Technical Justification</div>
                <div style={{ marginTop: '4px', padding: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', lineHeight: '1.5', color: '#065f46' }}>
                  {selectedCcn.justification}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <div>
                  {getStatusBadge(selectedCcn.status)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedCcn.status !== 'Approved' && (
                    <button
                      onClick={() => {
                        setCcns(prev => prev.map(c => c.id === selectedCcn.id ? { ...c, status: 'Approved', approvalDate: 'Today' } : c));
                        setSelectedCcn(null);
                        showToast(`✓ Approved ${selectedCcn.id} successfully`, 'success');
                      }}
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                      Approve Notice
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedCcn(null)}
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

      {/* Raise New CCN Modal */}
      {isCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '520px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>Raise Change Control Notice (CCN)</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.82rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>CCN Subject / Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Canal Crossing Lateral Alignment Shift"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Variation Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                  >
                    <option value="Route Realignment">Route Realignment</option>
                    <option value="Depth Deviation">Depth Deviation</option>
                    <option value="Chainage Extension">Chainage Extension</option>
                    <option value="Method Change">Method Change</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Associated Task Route *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TASK-TR-Saha-04"
                    value={formData.taskRef}
                    onChange={(e) => setFormData({ ...formData, taskRef: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Deviation Specifics</label>
                  <input
                    type="text"
                    placeholder="e.g. HDD Conversion 3.5m deep"
                    value={formData.deviationType}
                    onChange={(e) => setFormData({ ...formData, deviationType: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Estimated Cost Delta (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 150000"
                    value={formData.costDeltaInr}
                    onChange={(e) => setFormData({ ...formData, costDeltaInr: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Change Scope Description</label>
                <textarea
                  rows={2}
                  placeholder="Detailed description of reason for deviation..."
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
                  Submit CCN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
