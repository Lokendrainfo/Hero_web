import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LucideCalendar,
  LucideLayers,
  LucideTrendingUp,
  LucideCpu,
  LucideCheckCircle2,
  LucideAlertTriangle,
  LucideChevronDown,
  LucideChevronRight,
  LucideMapPin,
  LucideArrowUpRight,
  LucideRefreshCw,
  LucideSearch,
  LucideFilter,
  LucideEye,
  LucideClock,
  LucideFileCheck,
  LucideHardHat,
  LucideExternalLink,
  LucideRadio
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { taskService } from '../../services/taskService';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../context/ToastContext';

export const MapViewPage = () => {
  const navigate = useNavigate();
  const { roles, isAdmin, hasPermission, selectedVendorId } = useAuth();
  const { showToast } = useToast();

  const hasAccess = isAdmin || hasPermission('mapview.dashboard');
  const hasTrenchingAccess = hasPermission('mapview.view');

  // If user lacks dashboard permission but has trenching map permission, redirect to trenching list
  useEffect(() => {
    if (!isAdmin && !hasPermission('mapview.dashboard') && hasPermission('mapview.view')) {
      navigate('/map-view/trenching', { replace: true });
    }
  }, [isAdmin, hasPermission, navigate]);

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  // Date filters
  // Options: 'today', 'selection', 'this_week', 'this_month', 'custom'
  const [datePreset, setDatePreset] = useState('today');
  const [selectedSingleDate, setSelectedSingleDate] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Table search & expansion
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDistricts, setExpandedDistricts] = useState({});

  // Fetch summary data from backend
  const fetchSummary = async (showRefreshIndicator = false) => {
    if (!hasAccess) return;
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);

    try {
      const params = {
        preset: datePreset,
      };

      if (datePreset === 'selection' && selectedSingleDate) {
        params.date = selectedSingleDate;
      } else if (datePreset === 'custom') {
        if (customStartDate) params.start_date = customStartDate;
        if (customEndDate) params.end_date = customEndDate;
      }

      if (selectedVendorId && selectedVendorId !== 'all') {
        params.vendor_id = selectedVendorId;
      }

      const res = await taskService.getTrenchingDashboardSummary(params);
      const data = res?.data?.data || res?.data || res || null;
      setSummaryData(data);

      // If initial single date is empty, initialize it from backend reference date
      if (!selectedSingleDate && data?.date_filter?.reference_today) {
        setSelectedSingleDate(data.date_filter.reference_today);
      }
      if (!customStartDate && data?.date_filter?.start_date) {
        setCustomStartDate(data.date_filter.start_date);
      }
      if (!customEndDate && data?.date_filter?.end_date) {
        setCustomEndDate(data.date_filter.end_date);
      }

      // Automatically expand the top active districts on initial load
      if (data?.districts?.length > 0 && Object.keys(expandedDistricts).length === 0) {
        const initialExpanded = {};
        data.districts.slice(0, 3).forEach(d => {
          initialExpanded[d.district] = true;
        });
        setExpandedDistricts(initialExpanded);
      }
    } catch (err) {
      console.error('[MapViewDashboard] Error fetching summary:', err);
      if (showToast) showToast('Failed to load trenching dashboard metrics', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [datePreset, selectedVendorId]);

  const handleApplySingleDate = (dateVal) => {
    setSelectedSingleDate(dateVal);
    setDatePreset('selection');
  };

  const handleApplyCustomRange = () => {
    if (!customStartDate || !customEndDate) {
      if (showToast) showToast('Please select both start and end dates', 'warning');
      return;
    }
    setDatePreset('custom');
    fetchSummary(true);
  };

  const toggleDistrictExpand = (distName) => {
    setExpandedDistricts(prev => ({
      ...prev,
      [distName]: !prev[distName]
    }));
  };

  const toggleExpandAll = () => {
    const allDistricts = summaryData?.districts || [];
    const allExpanded = allDistricts.every(d => expandedDistricts[d.district]);
    if (allExpanded) {
      setExpandedDistricts({});
    } else {
      const next = {};
      allDistricts.forEach(d => { next[d.district] = true; });
      setExpandedDistricts(next);
    }
  };

  const navigateToMap = (districtName, blockName) => {
    let url = '/map-view/trenching';
    const params = new URLSearchParams();
    if (districtName) params.append('district', districtName);
    if (blockName) params.append('block', blockName);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    navigate(url);
  };

  // Filter districts by search query
  const filteredDistricts = useMemo(() => {
    if (!summaryData?.districts) return [];
    if (!searchQuery.trim()) return summaryData.districts;

    const q = searchQuery.toLowerCase().trim();
    return summaryData.districts.filter(d => {
      if (d.district?.toLowerCase().includes(q)) return true;
      if (d.circle?.toLowerCase().includes(q)) return true;
      return (d.blocks || []).some(b => b.block?.toLowerCase().includes(q));
    });
  }, [summaryData, searchQuery]);

  if (!hasAccess) {
    if (hasTrenchingAccess) {
      return null;
    }
    return (
      <div className="screen-container">
        <EmptyState
          title="Access Restricted"
          subtitle="You do not have permission to view the Map View Dashboard (mapview.dashboard)."
        >
          <button type="button" className="btn-primary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </EmptyState>
      </div>
    );
  }

  const kpis = summaryData?.kpis || {};
  const reworkSummary = summaryData?.rework_summary || {};
  const pendingSummary = summaryData?.pending_summary || {};
  const dateFilter = summaryData?.date_filter || {};

  return (
    <div className="screen-container" style={{ padding: '24px 32px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              T&amp;D Execution Dashboard
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '600',
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0'
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
              Live Telemetry
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            Trenching &amp; ducting progress, deployed fleet utilization, district performance, and rework tracking
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => fetchSummary(true)}
            disabled={refreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease'
            }}
          >
            <LucideRefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/map-view/trenching')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#0f172a',
              border: '1px solid #0f172a',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(15,23,42,0.15)',
              transition: 'all 0.15s ease'
            }}
          >
            <LucideLayers size={16} />
            Open Trenching Map
          </button>
        </div>
      </div>

      {/* BharatNet T&D Monitoring Navigation Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid #e2e8f0',
        borderLeft: '4px solid #10b981',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <LucideRadio size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              BharatNet T&amp;D Monitoring
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
              Live Trenching &amp; Ducting Monitoring
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/map-view/bharatnet')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            borderRadius: '8px',
            background: '#0f172a',
            border: '1px solid #0f172a',
            color: '#ffffff',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(15,23,42,0.15)',
            transition: 'all 0.15s ease'
          }}
        >
          <LucideMapPin size={16} /> Open Monitoring Map
        </button>
      </div>

      {/* Date Filter Bar */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '14px 18px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '6px', color: '#475569', fontSize: '0.8125rem', fontWeight: '600' }}>
            <LucideCalendar size={16} color="#2563eb" />
            <span>Time Window:</span>
          </div>

          {[
            { id: 'today', label: 'Today' },
            { id: 'selection', label: 'Select Date' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'custom', label: 'Custom Range' },
          ].map(p => {
            const isActive = datePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setDatePreset(p.id);
                  if (p.id === 'selection' && selectedSingleDate) {
                    fetchSummary(true);
                  }
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? '600' : '500',
                  background: isActive ? '#0f172a' : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#334155',
                  border: '1px solid',
                  borderColor: isActive ? '#0f172a' : '#e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Date Inputs depending on active preset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {datePreset === 'selection' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Date:</span>
              <input
                type="date"
                value={selectedSingleDate}
                onChange={(e) => {
                  handleApplySingleDate(e.target.value);
                }}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  color: '#0f172a',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => fetchSummary(true)}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Go
              </button>
            </div>
          )}

          {datePreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  color: '#0f172a'
                }}
              />
              <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  color: '#0f172a'
                }}
              />
              <button
                type="button"
                onClick={handleApplyCustomRange}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Apply
              </button>
            </div>
          )}

          {/* Active window indicator */}
          <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            Window: <strong style={{ color: '#0f172a' }}>{dateFilter.start_date || 'All'}</strong>
            {dateFilter.start_date !== dateFilter.end_date && dateFilter.end_date && (
              <span> to <strong style={{ color: '#0f172a' }}>{dateFilter.end_date}</strong></span>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Card 1: Total Machines Deployed / Active */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Machines Active / Deployed
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <LucideCpu size={20} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: '700', color: '#0f172a', lineHeight: 1 }}>
                {kpis.total_machines_active ?? '—'}
              </span>
              <span style={{ fontSize: '1.125rem', fontWeight: '600', color: '#64748b' }}>
                / {kpis.total_machines_deployed ?? '24'}
              </span>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: '600',
                background: '#ecfdf5',
                color: '#059669'
              }}>
                {kpis.active_machines_percentage ?? 0}% active
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                • {kpis.total_crews_active ?? 0} crews in field
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Total T&D Completed */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total T&amp;D Completed
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
              <LucideCheckCircle2 size={20} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: '700', color: '#0f172a', lineHeight: 1 }}>
                {kpis.total_td_completed_km != null ? kpis.total_td_completed_km.toLocaleString() : '—'}
              </span>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b' }}>km</span>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: '600',
                background: '#dbeafe',
                color: '#1d4ed8'
              }}>
                +{kpis.period_td_completed_km ?? 0} km in window
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                of {kpis.total_td_planned_km ? kpis.total_td_planned_km.toLocaleString() : 0} km planned
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Overall Progress Percentage */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Overall Progress
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
              <LucideTrendingUp size={20} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '2rem', fontWeight: '700', color: '#0f172a', lineHeight: 1 }}>
                {kpis.overall_progress_percent ?? 0}
              </span>
              <span style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a' }}>%</span>
            </div>
            {/* Progress bar */}
            <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '9999px', margin: '10px 0 6px 0', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, Math.max(0, kpis.overall_progress_percent || 0))}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                borderRadius: '9999px',
                transition: 'width 0.4s ease'
              }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {kpis.remaining_td_km ? kpis.remaining_td_km.toLocaleString() : 0} km balance to target
            </div>
          </div>
        </div>

        {/* Card 4: Pending and Rework Summary */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending &amp; Rework Summary
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <LucideAlertTriangle size={20} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>
                  {kpis.pending_tasks_count ?? 0}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px' }}>Pending</span>
              </div>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>
                  {kpis.rework_tasks_count ?? 0}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px' }}>Rework</span>
              </div>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: '600',
                background: '#fef2f2',
                color: '#dc2626'
              }}>
                {kpis.rework_distance_km ?? 0} km rework
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                • {kpis.pending_distance_km ?? 0} km uncompleted
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* District-wise and Block-wise Performance View */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        overflow: 'hidden',
        marginBottom: '24px'
      }}>
        {/* Table Toolbar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#f8fafc'
        }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              District &amp; Block Performance
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Expand any district to view block-level telemetry breakdown, active machines, and GIS map execution links
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <LucideSearch size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search district or block..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 12px 6px 30px',
                  fontSize: '0.8125rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  outline: 'none',
                  width: '210px',
                  background: '#ffffff'
                }}
              />
            </div>

            <button
              type="button"
              onClick={toggleExpandAll}
              style={{
                padding: '6px 12px',
                fontSize: '0.8125rem',
                fontWeight: '500',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              Toggle All
            </button>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <LucideRefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px', color: '#2563eb' }} />
            <div>Calculating live execution metrics...</div>
          </div>
        ) : filteredDistricts.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            No districts match the search filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>
                  <th style={{ padding: '12px 16px', width: '280px' }}>DISTRICT / BLOCK</th>
                  <th style={{ padding: '12px 16px' }}>STATE / CIRCLE</th>
                  <th style={{ padding: '12px 16px' }}>PLANNED SCOPE</th>
                  <th style={{ padding: '12px 16px' }}>COMPLETED (TOTAL)</th>
                  <th style={{ padding: '12px 16px' }}>IN WINDOW</th>
                  <th style={{ padding: '12px 16px', width: '180px' }}>PROGRESS %</th>
                  <th style={{ padding: '12px 16px' }}>MACHINES</th>
                  <th style={{ padding: '12px 16px' }}>STATUS</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredDistricts.map(d => {
                  const isExpanded = !!expandedDistricts[d.district];
                  const hasBlocks = (d.blocks || []).length > 0;

                  return (
                    <React.Fragment key={d.district}>
                      {/* District Row */}
                      <tr
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: isExpanded ? '#f8fafc' : '#ffffff',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => toggleDistrictExpand(d.district)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: '#64748b'
                              }}
                            >
                              {isExpanded ? <LucideChevronDown size={18} /> : <LucideChevronRight size={18} />}
                            </button>
                            <div>
                              <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.875rem' }}>
                                {d.district}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {d.total_blocks} Blocks • {d.tasks_count} Tasks
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px', color: '#475569', fontWeight: '500' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#334155', fontSize: '0.75rem' }}>
                            {d.circle || 'RAJASTHAN'}
                          </span>
                        </td>

                        <td style={{ padding: '14px 16px', color: '#334155', fontWeight: '600' }}>
                          {d.planned_km?.toLocaleString()} km
                        </td>

                        <td style={{ padding: '14px 16px', color: '#0f172a', fontWeight: '700' }}>
                          {d.completed_km?.toLocaleString()} km
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: d.period_completed_km > 0 ? '#ecfdf5' : '#f1f5f9',
                            color: d.period_completed_km > 0 ? '#059669' : '#64748b',
                            fontWeight: '600',
                            fontSize: '0.75rem'
                          }}>
                            {d.period_completed_km > 0 ? `+${d.period_completed_km} km` : '0 km'}
                          </span>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min(100, Math.max(0, d.progress_percent || 0))}%`,
                                height: '100%',
                                background: d.progress_percent >= 10 ? '#10b981' : d.progress_percent >= 5 ? '#f59e0b' : '#3b82f6',
                                borderRadius: '9999px'
                              }} />
                            </div>
                            <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#0f172a', width: '45px' }}>
                              {d.progress_percent}%
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: d.machines_active > 0 ? '#ecfdf5' : '#f8fafc',
                            color: d.machines_active > 0 ? '#047857' : '#64748b',
                            border: '1px solid',
                            borderColor: d.machines_active > 0 ? '#a7f3d0' : '#e2e8f0'
                          }}>
                            {d.machines_active} / {d.machines_deployed} Active
                          </span>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {d.pending_tasks} Pnd
                            </span>
                            {d.rework_tasks > 0 && (
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: '#fef2f2',
                                color: '#dc2626',
                                fontSize: '0.6875rem',
                                fontWeight: '700'
                              }}>
                                {d.rework_tasks} Rework
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => navigateToMap(d.district)}
                            title={`Open ${d.district} on GIS Map`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              color: '#0f172a',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                          >
                            <LucideMapPin size={13} color="#2563eb" />
                            Map View
                          </button>
                        </td>
                      </tr>

                      {/* Nested Block Rows */}
                      {isExpanded && hasBlocks && d.blocks.map(b => (
                        <tr
                          key={`${d.district}-${b.block}`}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: '#fafafa',
                            fontSize: '0.75rem'
                          }}
                        >
                          <td style={{ padding: '10px 16px 10px 48px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: '#94a3b8' }}>↳</span>
                              <strong style={{ color: '#1e293b' }}>{b.block}</strong>
                              <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>({b.tasks_count} tasks)</span>
                            </div>
                          </td>

                          <td style={{ padding: '10px 16px', color: '#64748b' }}>
                            —
                          </td>

                          <td style={{ padding: '10px 16px', color: '#475569' }}>
                            {b.planned_km} km
                          </td>

                          <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: '600' }}>
                            {b.completed_km} km
                          </td>

                          <td style={{ padding: '10px 16px' }}>
                            {b.period_completed_km > 0 ? (
                              <span style={{ color: '#059669', fontWeight: '600' }}>+{b.period_completed_km} km</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>

                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ flex: 1, height: '4px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.min(100, Math.max(0, b.progress_percent || 0))}%`,
                                  height: '100%',
                                  background: b.progress_percent >= 10 ? '#10b981' : '#3b82f6',
                                  borderRadius: '9999px'
                                }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155' }}>
                                {b.progress_percent}%
                              </span>
                            </div>
                          </td>

                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ color: b.machines_active > 0 ? '#047857' : '#64748b', fontWeight: '500' }}>
                              {b.machines_active} / {b.machines_deployed} active
                            </span>
                          </td>

                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ color: '#64748b' }}>{b.pending_tasks} pnd</span>
                            {b.rework_tasks > 0 && (
                              <span style={{ color: '#dc2626', marginLeft: '6px', fontWeight: '600' }}>
                                • {b.rework_tasks} rework
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => navigateToMap(d.district, b.block)}
                              title={`Open ${b.block} on GIS Map`}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#2563eb',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              Explore <LucideArrowUpRight size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Analytics Breakdown Row: Pending Tasks Breakdown & Rework Analysis */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '20px'
      }}>
        {/* Pending Execution Breakdown */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideClock size={18} color="#2563eb" />
              <h3 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Pending Pipeline Breakdown
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
              Total: {kpis.pending_tasks_count ?? 0} tasks
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Not Started */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>
                  Not Started / Created
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#0f172a' }}>
                  {pendingSummary.not_started?.count ?? 273} tasks ({pendingSummary.not_started?.distance_km ?? 0} km)
                </span>
              </div>
              <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ width: '81%', height: '100%', background: '#94a3b8' }} />
              </div>
            </div>

            {/* In Progress */}
            <div style={{ padding: '12px 14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e40af' }}>
                  In Progress / Partially Saved
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e40af' }}>
                  {pendingSummary.in_progress?.count ?? 62} tasks ({pendingSummary.in_progress?.distance_km ?? 0} km)
                </span>
              </div>
              <div style={{ height: '5px', background: '#dbeafe', borderRadius: '9999px', overflow: 'hidden' }}>
                <div style={{ width: '19%', height: '100%', background: '#2563eb' }} />
              </div>
            </div>

            {/* Approval Pending */}
            <div style={{ padding: '12px 14px', background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#6b21a8' }}>
                  Pending Final Field Approval
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#6b21a8' }}>
                  {pendingSummary.approval_pending?.count ?? 335} tasks
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Rework & Quality Summary */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideAlertTriangle size={18} color="#dc2626" />
              <h3 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Rework &amp; Quality Issues Summary
              </h3>
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '600',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#fef2f2',
              color: '#dc2626'
            }}>
              {reworkSummary.total_rework_items ?? 27} items flagged
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(reworkSummary.reasons || []).map((r, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.8125rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                  <span style={{ color: '#334155', fontWeight: '500' }}>{r.reason}</span>
                </div>
                <span style={{ fontWeight: '700', color: '#0f172a', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                  {r.count}
                </span>
              </div>
            ))}

            <div style={{ marginTop: '8px', padding: '10px 14px', background: '#fffbeb', borderRadius: '6px', border: '1px solid #fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                Total rework length: <strong>{reworkSummary.rework_distance_km ?? 0} km</strong>
              </span>
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#b45309',
                  fontWeight: '700',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                Review Tasks <LucideExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
