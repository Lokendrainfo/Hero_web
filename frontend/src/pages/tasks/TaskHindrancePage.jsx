import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  LucideAlertTriangle, LucidePlus, LucideFilter, LucideSearch, LucideRefreshCw,
  LucideClock, LucideCheckCircle2, LucideAlertOctagon, LucideMapPin,
  LucideBuilding2, LucideFileText, LucideExternalLink, LucideX, LucideLayers,
  LucideChevronRight, LucideCalendar, LucideUserCheck, LucideDownload, LucideDatabase
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { hindranceService } from '../../services/hindranceService';

export const TaskHindrancePage = () => {
  const [hindrances, setHindrances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [metrics, setMetrics] = useState({ total: 0, critical: 0, in_resolution: 0, resolved: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [selectedHindrance, setSelectedHindrance] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    category: 'Utility Crossing',
    sub_category: '',
    severity: 'High',
    chainage: '',
    chainage_from: '',
    chainage_to: '',
    district: 'Ambala',
    block: '',
    section: '',
    location: '',
    contractor: '',
    department: '',
    description: '',
    mitigation: '',
    latitude: '',
    longitude: ''
  });

  const loadHindrances = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (severityFilter !== 'ALL') params.severity = severityFilter;
      if (categoryFilter !== 'ALL') params.category = categoryFilter;
      if (sourceFilter !== 'ALL') params.source = sourceFilter;
      if (search.trim()) params.search = search.trim();

      const res = await hindranceService.getAll(params);
      const data = res?.results || res?.data?.results || res?.data || (Array.isArray(res) ? res : []);
      setHindrances(data);
      if (res?.metrics) {
        setMetrics(res.metrics);
      } else {
        const total = data.length;
        const critical = data.filter(h => (h.severity || '').toUpperCase() === 'CRITICAL' || (h.status || '').toUpperCase() === 'ESCALATED').length;
        const inProgress = data.filter(h => ['IN_PROGRESS', 'IN PROGRESS', 'IN REVIEW', 'IN_REVIEW', 'OPEN'].includes((h.status || '').toUpperCase())).length;
        const resolved = data.filter(h => (h.status || '').toUpperCase() === 'RESOLVED').length;
        setMetrics({ total, critical, in_resolution: inProgress, resolved });
      }
    } catch (err) {
      console.error('Failed to load hindrances:', err);
      showToast('Could not load hindrances from server', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, categoryFilter, sourceFilter, search, showToast]);

  useEffect(() => {
    loadHindrances();
  }, [loadHindrances]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      showToast('Connecting to iLync / Net Infra API...', 'info');
      const res = await hindranceService.syncExternal();
      const msg = res?.message || res?.data?.message || 'Sync completed successfully.';
      showToast(`✓ ${msg}`, 'success');
      loadHindrances();
    } catch (err) {
      console.error('iLync sync error:', err);
      showToast('iLync synchronization encountered an issue. See logs for details.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = () => {
    const url = hindranceService.exportCsvUrl();
    window.open(url, '_blank');
    showToast('Exporting hindrance register to CSV...', 'info');
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.chainage || !formData.district) {
      showToast('Please fill all required hindrance details', 'error');
      return;
    }

    try {
      await hindranceService.create({
        title: formData.title,
        category: formData.category,
        sub_category: formData.sub_category,
        severity: formData.severity.toUpperCase(),
        status: 'OPEN',
        chainage: formData.chainage,
        chainage_from: formData.chainage_from,
        chainage_to: formData.chainage_to,
        district: formData.district,
        block: formData.block || 'Central',
        section: formData.section || '',
        location: formData.location || '',
        contractor: formData.contractor || '',
        department: formData.department || '',
        description: formData.description || '',
        mitigation: formData.mitigation || '',
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      });

      setIsCreateOpen(false);
      showToast('✓ Hindrance logged successfully in register', 'success');
      setFormData({
        title: '',
        category: 'Utility Crossing',
        sub_category: '',
        severity: 'High',
        chainage: '',
        chainage_from: '',
        chainage_to: '',
        district: 'Ambala',
        block: '',
        section: '',
        location: '',
        contractor: '',
        department: '',
        description: '',
        mitigation: '',
        latitude: '',
        longitude: ''
      });
      loadHindrances();
    } catch (err) {
      console.error('Failed to create hindrance:', err);
      showToast('Failed to create hindrance record', 'error');
    }
  };

  const handleResolve = async (item) => {
    try {
      await hindranceService.update(item.id, { status: 'RESOLVED' });
      showToast(`✓ Marked ${item.hindrance_id || item.id} as Resolved`, 'success');
      setSelectedHindrance(null);
      loadHindrances();
    } catch (err) {
      console.error('Failed to resolve hindrance:', err);
      showToast('Failed to update hindrance status', 'error');
    }
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
      'IN_PROGRESS': { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      'IN PROGRESS': { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      'IN_REVIEW': { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      'IN REVIEW': { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      OPEN: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b' }
    };
    const s = (status || 'OPEN').toUpperCase().replace('_', ' ');
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

  const getSourceBadge = (source) => {
    const isIlync = (source || '').toUpperCase().includes('ILYNC') || (source || '').toUpperCase().includes('NET_INFRA');
    if (isIlync) {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '0.70rem',
          fontWeight: '600',
          background: '#f5f3ff',
          color: '#6d28d9',
          border: '1px solid #ddd6fe',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#8b5cf6' }}></span>
          iLync / Net Infra
        </span>
      );
    }
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.70rem',
        fontWeight: '600',
        background: '#f0fdf4',
        color: '#15803d',
        border: '1px solid #bbf7d0',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e' }}></span>
        HERO
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', fontSize: '0.82rem', fontWeight: '600' }}
            title="Safely sync external hindrance tasks from iLync / Net Infra API"
          >
            <LucideRefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync iLync'}
          </button>
          <button
            onClick={handleExport}
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
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#4f46e5', marginTop: '4px' }}>{metrics.in_resolution}</div>
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
        <div style={{ position: 'relative', flex: '1', minWidth: '260px', maxWidth: '380px' }}>
          <LucideSearch size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, chainage, contractor, agency..."
            style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--border)', background: '#f8fafc', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Sources</option>
              <option value="HERO">HERO Web</option>
              <option value="ILYNC">iLync / Net Infra</option>
            </select>
          </div>

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
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
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
                <th style={{ padding: '12px 16px' }}>Source</th>
                <th style={{ padding: '12px 16px' }}>Responsible Agency</th>
                <th style={{ padding: '12px 16px' }}>Severity</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Target Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <LucideRefreshCw size={18} className="animate-spin" />
                      Loading hindrance register from database...
                    </div>
                  </td>
                </tr>
              ) : hindrances.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hindrance records match the selected filters.
                  </td>
                </tr>
              ) : (
                hindrances.map((item) => (
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
                        {item.hindrance_id || `HND-${item.id}`}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '280px' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '—'}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.chainage || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.district || '—'} • {item.block || '—'}</div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {getSourceBadge(item.source_system)}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.department || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.contractor || item.vendor_name || '—'}</div>
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
                        {item.target_date || item.targetDate || '—'}
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
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '640px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}>
                  <LucideAlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>{selectedHindrance.hindrance_id || selectedHindrance.id}: {selectedHindrance.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedHindrance.category}</span>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    {getSourceBadge(selectedHindrance.source_system)}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedHindrance(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.82rem', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Location Chainage</div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '2px' }}>{selectedHindrance.chainage || '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{selectedHindrance.district || '—'}, {selectedHindrance.block || '—'}</div>
                  {selectedHindrance.latitude && selectedHindrance.longitude && (
                    <div style={{ fontSize: '0.72rem', color: '#2563eb', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LucideMapPin size={12} />
                      GPS: {selectedHindrance.latitude.toFixed(5)}, {selectedHindrance.longitude.toFixed(5)}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Responsible Agency</div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginTop: '2px' }}>{selectedHindrance.department || '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Contractor: {selectedHindrance.contractor || selectedHindrance.vendor_name || '—'}</div>
                  {selectedHindrance.external_task_id && (
                    <div style={{ fontSize: '0.70rem', color: '#7c3aed', marginTop: '4px', fontFamily: 'monospace' }}>
                      Ext Task: {selectedHindrance.external_task_id.substring(0, 16)}...
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Obstacle Description</div>
                <div style={{ marginTop: '4px', padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', lineHeight: '1.5', color: '#334155' }}>
                  {selectedHindrance.description || 'No description provided.'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#047857', textTransform: 'uppercase', fontWeight: '600' }}>Mitigation Action & Clearance Plan</div>
                <div style={{ marginTop: '4px', padding: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', lineHeight: '1.5', color: '#065f46' }}>
                  {selectedHindrance.mitigation || selectedHindrance.remarks || 'Awaiting initial authority coordination meeting.'}
                </div>
              </div>

              {/* Photos & Media if available */}
              {(selectedHindrance.start_photo || selectedHindrance.end_photo) && (
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600', marginBottom: '6px' }}>Site Photos</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    {selectedHindrance.start_photo && (
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '2px' }}>Start Photo</div>
                        <img src={selectedHindrance.start_photo} alt="Start" style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                      </div>
                    )}
                    {selectedHindrance.end_photo && (
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '2px' }}>End Photo</div>
                        <img src={selectedHindrance.end_photo} alt="End" style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getSeverityBadge(selectedHindrance.severity)}
                  {getStatusBadge(selectedHindrance.status)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedHindrance.status !== 'RESOLVED' && (
                    <button
                      onClick={() => handleResolve(selectedHindrance)}
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                      Mark as Resolved
                    </button>
                  )}
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
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '580px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>Log New Site Hindrance</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.82rem', maxHeight: '80vh', overflowY: 'auto' }}>
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
                    <option value="Forest Clearance">Forest Clearance</option>
                    <option value="Railway Crossing">Railway Crossing</option>
                    <option value="Other Obstacle">Other Obstacle</option>
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
                    placeholder="e.g. CH 12+400 to 12+480 (80m)"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Block</label>
                  <input
                    type="text"
                    placeholder="e.g. Saha"
                    value={formData.block}
                    onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Location / Section</label>
                  <input
                    type="text"
                    placeholder="e.g. Kesri Village Approach"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>GPS Latitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 30.2458"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>GPS Longitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 77.0125"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Responsible Agency / Department</label>
                  <input
                    type="text"
                    placeholder="e.g. GAIL, NHAI, Irrigation Dept"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Contractor / Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. Premium Infra Solutions"
                    value={formData.contractor}
                    onChange={(e) => setFormData({ ...formData, contractor: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>Obstacle Description</label>
                <textarea
                  rows={2}
                  placeholder="Detailed description of obstacle on site..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px', color: '#047857' }}>Mitigation Plan / Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Proposed mitigation action, trial trenching, authority meeting plan..."
                  value={formData.mitigation}
                  onChange={(e) => setFormData({ ...formData, mitigation: e.target.value })}
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

export default TaskHindrancePage;
