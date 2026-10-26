import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LucideCrosshair,
  LucideFileText,
  LucideCompass,
  LucideCalculator,
  LucideWrench,
  LucideRadio,
  LucideFileCheck,
  LucideSettings,
  LucideMapPin,
  LucideChevronDown,
  LucideX,
  LucideDownload,
  LucideExternalLink,
  LucideSearch,
  LucideRefreshCw
} from 'lucide-react';
import { projectDashboardService } from '../../services/projectDashboardService';
import { MASTER_GEOGRAPHY } from '../../utils/geographyMaster';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useToast } from '../../context/ToastContext';
import './ProjectDashboard.css';

// Formatter for numbers with Indian comma separation (e.g. 1,27,560 or 127,560)
const formatNumber = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0';
  if (typeof val === 'number' && !Number.isInteger(val)) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Number(val).toLocaleString('en-US');
};

export const ProjectDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  // 1. Top Filter State
  const initialMode = searchParams.get('mode') || 'project';
  const initialState = searchParams.get('state') || 'Rajasthan';
  const initialDistrict = searchParams.get('district') || 'All';
  const initialBlock = searchParams.get('block') || 'All';
  const initialDuration = searchParams.get('duration') || 'all';

  const [activeTab, setActiveTab] = useState(initialMode); // 'project' | 'om'
  const [selectedState, setSelectedState] = useState(initialState);
  const [selectedDistrict, setSelectedDistrict] = useState(initialDistrict);
  const [selectedBlock, setSelectedBlock] = useState(initialBlock);
  const [selectedDuration, setSelectedDuration] = useState(initialDuration);

  // Staged filter state (for Apply/Reset buttons)
  const [stagedState, setStagedState] = useState(initialState);
  const [stagedDistrict, setStagedDistrict] = useState(initialDistrict);
  const [stagedBlock, setStagedBlock] = useState(initialBlock);
  const [stagedDuration, setStagedDuration] = useState(initialDuration);

  // 2. Data State
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Collapsible cards state
  const [collapsedCards, setCollapsedCards] = useState({});

  // 3. Drilldown Modal State
  const [drilldownModal, setDrilldownModal] = useState({
    isOpen: false,
    card: '',
    section: '',
    metric: '',
    label: '',
    value: 0
  });
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [drilldownPage, setDrilldownPage] = useState(0);

  // Available dropdown options
  const availableStates = useMemo(() => {
    const list = Object.keys(MASTER_GEOGRAPHY).map(s => {
      // Title case formatting: 'RAJASTHAN' -> 'Rajasthan'
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    });
    return list;
  }, []);

  const availableDistricts = useMemo(() => {
    const stUpper = (stagedState || 'RAJASTHAN').toUpperCase();
    if (MASTER_GEOGRAPHY[stUpper]) {
      return ['All', ...Object.keys(MASTER_GEOGRAPHY[stUpper]).map(d => {
        return d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
      })];
    }
    return ['All'];
  }, [stagedState]);

  const availableBlocks = useMemo(() => {
    const stUpper = (stagedState || 'RAJASTHAN').toUpperCase();
    const distUpper = (stagedDistrict || 'ALL').toUpperCase();

    if (distUpper !== 'ALL' && MASTER_GEOGRAPHY[stUpper]?.[distUpper]) {
      return ['All', ...MASTER_GEOGRAPHY[stUpper][distUpper].map(b => {
        return b.charAt(0).toUpperCase() + b.slice(1).toLowerCase();
      })];
    }
    return ['All'];
  }, [stagedState, stagedDistrict]);

  // Handle dependent filter cascading
  const handleStateChange = (e) => {
    const newState = e.target.value;
    setStagedState(newState);
    setStagedDistrict('All');
    setStagedBlock('All');
  };

  const handleDistrictChange = (e) => {
    const newDist = e.target.value;
    setStagedDistrict(newDist);
    setStagedBlock('All');
  };

  const handleBlockChange = (e) => {
    setStagedBlock(e.target.value);
  };

  const handleDurationChange = (e) => {
    setStagedDuration(e.target.value);
  };

  // Fetch dashboard metrics
  const fetchDashboardMetrics = useCallback(async (stateVal, distVal, blkVal, durVal, modeVal) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        state: stateVal,
        district: distVal,
        block: blkVal,
        duration: durVal,
        mode: modeVal
      };
      const res = await projectDashboardService.getProjectSummary(params);
      setDashboardData(res);
    } catch (err) {
      console.error('[ProjectDashboard] Error fetching summary:', err);
      setError('Failed to load project dashboard metrics. Please try again.');
      showToast?.('Error loading dashboard metrics', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Initial load
  useEffect(() => {
    fetchDashboardMetrics(selectedState, selectedDistrict, selectedBlock, selectedDuration, activeTab);
  }, [selectedState, selectedDistrict, selectedBlock, selectedDuration, activeTab, fetchDashboardMetrics]);

  // Apply filters
  const handleApplyFilters = () => {
    setSelectedState(stagedState);
    setSelectedDistrict(stagedDistrict);
    setSelectedBlock(stagedBlock);
    setSelectedDuration(stagedDuration);

    setSearchParams({
      mode: activeTab,
      state: stagedState,
      district: stagedDistrict,
      block: stagedBlock,
      duration: stagedDuration
    });

    fetchDashboardMetrics(stagedState, stagedDistrict, stagedBlock, stagedDuration, activeTab);
    showToast?.('Filters applied', 'success');
  };

  // Reset filters
  const handleResetFilters = () => {
    const defaultState = 'Rajasthan';
    const defaultDistrict = 'All';
    const defaultBlock = 'All';
    const defaultDuration = 'all';

    setStagedState(defaultState);
    setStagedDistrict(defaultDistrict);
    setStagedBlock(defaultBlock);
    setStagedDuration(defaultDuration);

    setSelectedState(defaultState);
    setSelectedDistrict(defaultDistrict);
    setSelectedBlock(defaultBlock);
    setSelectedDuration(defaultDuration);

    setSearchParams({
      mode: activeTab,
      state: defaultState,
      district: defaultDistrict,
      block: defaultBlock,
      duration: defaultDuration
    });

    fetchDashboardMetrics(defaultState, defaultDistrict, defaultBlock, defaultDuration, activeTab);
    showToast?.('Filters reset to default', 'info');
  };

  // Tab change
  const handleTabChange = (mode) => {
    setActiveTab(mode);
    setSearchParams({
      mode,
      state: selectedState,
      district: selectedDistrict,
      block: selectedBlock,
      duration: selectedDuration
    });
    fetchDashboardMetrics(selectedState, selectedDistrict, selectedBlock, selectedDuration, mode);
  };

  // Toggle card collapsed state
  const toggleCardCollapse = (cardId) => {
    setCollapsedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  // 4. Drill-Down Handler
  const handleMetricClick = (card, section, metric, label, value) => {
    setDrilldownModal({
      isOpen: true,
      card,
      section,
      metric,
      label,
      value
    });
    setDrilldownSearch('');
    setDrilldownPage(0);
    fetchDrilldownData(card, section, metric, '', 0);
  };

  const fetchDrilldownData = async (card, section, metric, search, page) => {
    setDrilldownLoading(true);
    try {
      const params = {
        card,
        section,
        metric,
        state: selectedState,
        district: selectedDistrict,
        block: selectedBlock,
        search,
        page,
        page_size: 15
      };
      const res = await projectDashboardService.getProjectDrilldown(params);
      setDrilldownData(res);
    } catch (err) {
      console.error('[ProjectDashboard] Error fetching drilldown:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const handleDrilldownSearchChange = (e) => {
    const val = e.target.value;
    setDrilldownSearch(val);
    setDrilldownPage(0);
    fetchDrilldownData(drilldownModal.card, drilldownModal.section, drilldownModal.metric, val, 0);
  };

  const handleDrilldownPageChange = (newPage) => {
    setDrilldownPage(newPage);
    fetchDrilldownData(drilldownModal.card, drilldownModal.section, drilldownModal.metric, drilldownSearch, newPage);
  };

  const handleCloseDrilldown = () => {
    setDrilldownModal({ isOpen: false, card: '', section: '', metric: '', label: '', value: 0 });
    setDrilldownData(null);
  };

  // Export Drilldown to CSV
  const handleExportDrilldownCSV = () => {
    if (!drilldownData?.results || drilldownData.results.length === 0) return;
    const rows = drilldownData.results;
    const headers = ['Block Name', 'District', 'Circle', 'Category', 'Status', 'Total GPs', 'Scope RKM', 'Completed RKM', 'Blowing RKM'];
    const csvContent = [
      headers.join(','),
      ...rows.map(r => [
        `"${r.block_name}"`,
        `"${r.district_name}"`,
        `"${r.circle_name}"`,
        `"${r.category}"`,
        `"${r.status}"`,
        r.total_gps,
        r.scope_rkm,
        r.completed_rkm,
        r.blowing_rkm
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${drilldownModal.card}_${drilldownModal.section}_${drilldownModal.metric}_drilldown.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cards = dashboardData?.cards || {};

  return (
    <div className="project-dashboard-container">
      {/* 1. Top Filter Bar & Tabs */}
      <div className="project-dashboard-topbar">
        <div className="project-dashboard-tabs">
          <button
            type="button"
            className={`project-tab-btn ${activeTab === 'project' ? 'active' : ''}`}
            onClick={() => handleTabChange('project')}
          >
            Project
          </button>
          <button
            type="button"
            className={`project-tab-btn ${activeTab === 'om' ? 'active' : ''}`}
            onClick={() => handleTabChange('om')}
          >
            O&M
          </button>
        </div>

        <div className="project-dashboard-filters">
          {/* State / Region Selector */}
          <div className="project-filter-group">
            <LucideMapPin size={15} className="project-filter-icon" />
            <select
              className="project-filter-select with-icon"
              value={stagedState}
              onChange={handleStateChange}
              aria-label="State/Region selector"
            >
              {availableStates.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* District Selector */}
          <div className="project-filter-group">
            <select
              className="project-filter-select"
              value={stagedDistrict}
              onChange={handleDistrictChange}
              aria-label="District selector"
            >
              {availableDistricts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Block Selector */}
          <div className="project-filter-group">
            <select
              className="project-filter-select"
              value={stagedBlock}
              onChange={handleBlockChange}
              aria-label="Block selector"
            >
              {availableBlocks.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Duration Selector */}
          <div className="project-filter-group">
            <select
              className="project-filter-select"
              value={stagedDuration}
              onChange={handleDurationChange}
              aria-label="Duration selector"
            >
              <option value="all">-- Duration --</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="mtd">Month to Date (MTD)</option>
              <option value="qtd">Quarter to Date (QTD)</option>
              <option value="ytd">Year to Date (YTD)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            className="project-btn-apply"
            onClick={handleApplyFilters}
          >
            Apply
          </button>
          <button
            type="button"
            className="project-btn-reset"
            onClick={handleResetFilters}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && !dashboardData && (
        <div style={{ padding: '4rem 0' }}>
          <LoadingSpinner title="Loading Project Dashboard..." subtitle="Aggregating live project & rollout metrics across circles" />
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* 2. Responsive 3-Column Grid of 8 Dashboard Cards */}
      {dashboardData && (
        <div className="project-cards-grid">
          {/* Card 1: SCOPE */}
          <div className="project-card">
            <div className="project-card-header header-scope">
              <div className="project-card-header-left">
                <LucideCrosshair size={18} />
                <span className="project-card-header-title">SCOPE</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.scope ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('scope')}
                aria-label="Toggle Scope card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.scope && (
              <div className="project-card-body">
                {/* Total Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Total</div>
                  <div className="project-metrics-row cols-3">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Total', 'Block', 'Total Blocks', cards.scope?.total?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.scope?.total?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Total', 'GPs', 'Total GPs', cards.scope?.total?.gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.scope?.total?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Total', 'RKM', 'Total RKM', cards.scope?.total?.rkm)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.scope?.total?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                  </div>
                </div>

                {/* Green Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Green</div>
                  <div className="project-metrics-row cols-3">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Green', 'Block', 'Green Blocks', cards.scope?.green?.block)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.scope?.green?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Green', 'GPs', 'Green GPs', cards.scope?.green?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.scope?.green?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Green', 'RKM', 'Green RKM', cards.scope?.green?.rkm)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.scope?.green?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                  </div>
                </div>

                {/* Brown Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Brown</div>
                  <div className="project-metrics-row cols-3">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Brown', 'Block', 'Brown Blocks', cards.scope?.brown?.block)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.scope?.brown?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Brown', 'GPs', 'Brown GPs', cards.scope?.brown?.gps)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.scope?.brown?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('SCOPE', 'Brown', 'RKM', 'Brown RKM', cards.scope?.brown?.rkm)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.scope?.brown?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: DTP / DTR */}
          <div className="project-card">
            <div className="project-card-header header-dtp">
              <div className="project-card-header-left">
                <LucideFileText size={18} />
                <span className="project-card-header-title">DTP</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.dtp ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('dtp')}
                aria-label="Toggle DTP card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.dtp && (
              <div className="project-card-body">
                {/* YTS Section */}
                <div className="project-card-section">
                  <div className="project-section-title">YTS</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'YTS', 'Block', 'DTR YTS Blocks', cards.dtr?.yts?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.yts?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'YTS', 'Tot_GPs', 'DTR YTS Total GPs', cards.dtr?.yts?.tot_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.yts?.tot_gps)}</span>
                      <span className="project-metric-label">Tot. GPs</span>
                    </div>
                  </div>
                </div>

                {/* WIP Section */}
                <div className="project-card-section">
                  <div className="project-section-title">WIP</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'WIP', 'Block', 'DTR WIP Blocks', cards.dtr?.wip?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.wip?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'WIP', 'Tot_GPs', 'DTR WIP Total GPs', cards.dtr?.wip?.tot_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.wip?.tot_gps)}</span>
                      <span className="project-metric-label">Tot. GPs</span>
                    </div>
                  </div>
                </div>

                {/* Completed Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Completed</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'Completed', 'Block', 'DTR Completed Blocks', cards.dtr?.completed?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.completed?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'Completed', 'Tot_GPs', 'DTR Completed Total GPs', cards.dtr?.completed?.tot_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.completed?.tot_gps)}</span>
                      <span className="project-metric-label">Tot. GPs</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'Completed', 'AMC_GPs', 'DTR AMC GPs', cards.dtr?.completed?.amc_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.completed?.amc_gps)}</span>
                      <span className="project-metric-label">AMC GPs</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('DTR', 'Completed', 'RKM', 'DTR Completed RKM', cards.dtr?.completed?.rkm)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.dtr?.completed?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: PHYSICAL SURVEY */}
          <div className="project-card">
            <div className="project-card-header header-physical-survey">
              <div className="project-card-header-left">
                <LucideCompass size={18} />
                <span className="project-card-header-title">PHYSICAL SURVEY</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.physical_survey ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('physical_survey')}
                aria-label="Toggle Physical Survey card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.physical_survey && (
              <div className="project-card-body">
                {/* Summary Pill */}
                <div className="project-card-summary-pill">
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-navy">{formatNumber(cards.physical_survey?.summary?.block)}</span>
                    <span className="summary-pill-label">Block</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-blue">{formatNumber(cards.physical_survey?.summary?.tot_cps)}</span>
                    <span className="summary-pill-label">Tot. CPs</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-blue">{formatNumber(cards.physical_survey?.summary?.awc_cps)}</span>
                    <span className="summary-pill-label">AWC CPs</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-blue">{formatNumber(cards.physical_survey?.summary?.rkm)}</span>
                    <span className="summary-pill-label">RKM</span>
                  </div>
                </div>

                {/* YTS Section */}
                <div className="project-card-section">
                  <div className="project-section-title">YTS</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'YTS', 'Total', 'Survey YTS Total', cards.physical_survey?.yts?.total)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.yts?.total)}</span>
                      <span className="project-metric-label">Total</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'YTS', 'Green', 'Survey YTS Green', cards.physical_survey?.yts?.green)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.yts?.green)}</span>
                      <span className="project-metric-label">Green</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'YTS', 'Brown', 'Survey YTS Brown', cards.physical_survey?.yts?.brown)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.physical_survey?.yts?.brown)}</span>
                      <span className="project-metric-label">Brown</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'YTS', 'GPs', 'Survey YTS GPs', cards.physical_survey?.yts?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.yts?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                  </div>
                </div>

                {/* WIP Section */}
                <div className="project-card-section">
                  <div className="project-section-title">WIP</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'WIP', 'Total', 'Survey WIP Total', cards.physical_survey?.wip?.total)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.wip?.total)}</span>
                      <span className="project-metric-label">Total</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'WIP', 'Green', 'Survey WIP Green', cards.physical_survey?.wip?.green)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.wip?.green)}</span>
                      <span className="project-metric-label">Green</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'WIP', 'Brown', 'Survey WIP Brown', cards.physical_survey?.wip?.brown)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.physical_survey?.wip?.brown)}</span>
                      <span className="project-metric-label">Brown</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'WIP', 'GPs', 'Survey WIP GPs', cards.physical_survey?.wip?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.wip?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                  </div>
                </div>

                {/* Submitted Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Submitted</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'Submitted', 'Total', 'Survey Submitted Total', cards.physical_survey?.submitted?.total)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.submitted?.total)}</span>
                      <span className="project-metric-label">Total</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'Submitted', 'Green', 'Survey Submitted Green', cards.physical_survey?.submitted?.green)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.submitted?.green)}</span>
                      <span className="project-metric-label">Green</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'Submitted', 'Brown', 'Survey Submitted Brown', cards.physical_survey?.submitted?.brown)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.physical_survey?.submitted?.brown)}</span>
                      <span className="project-metric-label">Brown</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'Submitted', 'GPs', 'Survey Submitted GPs', cards.physical_survey?.submitted?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.submitted?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                  </div>
                </div>

                {/* PO Issued/Approved Section */}
                <div className="project-card-section">
                  <div className="project-section-title">PO Issued/Approved</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'PO_Issued', 'Total', 'PO Issued Total', cards.physical_survey?.po_issued?.total)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.po_issued?.total)}</span>
                      <span className="project-metric-label">Total</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'PO_Issued', 'Green', 'PO Issued Green', cards.physical_survey?.po_issued?.green)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.po_issued?.green)}</span>
                      <span className="project-metric-label">Green</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'PO_Issued', 'Brown', 'PO Issued Brown', cards.physical_survey?.po_issued?.brown)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.physical_survey?.po_issued?.brown)}</span>
                      <span className="project-metric-label">Brown</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('PHYSICAL_SURVEY', 'PO_Issued', 'GPs', 'PO Issued GPs', cards.physical_survey?.po_issued?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.physical_survey?.po_issued?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 4: BOQ */}
          <div className="project-card">
            <div className="project-card-header header-boq">
              <div className="project-card-header-left">
                <LucideCalculator size={18} />
                <span className="project-card-header-title">BOQ</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.boq ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('boq')}
                aria-label="Toggle BOQ card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.boq && (
              <div className="project-card-body">
                {/* Summary Pill */}
                <div className="project-card-summary-pill">
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-navy">{formatNumber(cards.boq?.summary?.total)}</span>
                    <span className="summary-pill-label">Total</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.boq?.summary?.green)}</span>
                    <span className="summary-pill-label">Green</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-brown">{formatNumber(cards.boq?.summary?.brown)}</span>
                    <span className="summary-pill-label">Brown</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.boq?.summary?.cps)}</span>
                    <span className="summary-pill-label">CPs</span>
                  </div>
                </div>

                {/* YTS Section */}
                <div className="project-card-section">
                  <div className="project-section-title">YTS</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'YTS', 'Block', 'BOQ YTS Blocks', cards.boq?.yts?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.boq?.yts?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'YTS', 'Tot_GPs', 'BOQ YTS Total GPs', cards.boq?.yts?.tot_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.boq?.yts?.tot_gps)}</span>
                      <span className="project-metric-label">Tot. GPs</span>
                    </div>
                  </div>
                </div>

                {/* Submitted Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Submitted</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'Submitted', 'Block', 'BOQ Submitted Blocks', cards.boq?.submitted?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.boq?.submitted?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'Submitted', 'Tot_GPs', 'BOQ Submitted Total GPs', cards.boq?.submitted?.tot_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.boq?.submitted?.tot_gps)}</span>
                      <span className="project-metric-label">Tot. GPs</span>
                    </div>
                  </div>
                </div>

                {/* Approved Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Approved</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'Approved', 'Total', 'BOQ Approved Total', cards.boq?.approved?.total)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.boq?.approved?.total)}</span>
                      <span className="project-metric-label">Total</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'Approved', 'Green', 'BOQ Approved Green', cards.boq?.approved?.green)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.boq?.approved?.green)}</span>
                      <span className="project-metric-label">Green</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'Approved', 'Brown', 'BOQ Approved Brown', cards.boq?.approved?.brown)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.boq?.approved?.brown)}</span>
                      <span className="project-metric-label">Brown</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('BOQ', 'Approved', 'GPs', 'BOQ Approved GPs', cards.boq?.approved?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.boq?.approved?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 5: Construction */}
          <div className="project-card">
            <div className="project-card-header header-construction">
              <div className="project-card-header-left">
                <LucideWrench size={18} />
                <span className="project-card-header-title">Construction</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.construction ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('construction')}
                aria-label="Toggle Construction card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.construction && (
              <div className="project-card-body">
                {/* Summary Pill */}
                <div className="project-card-summary-pill">
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-navy">{formatNumber(cards.construction?.summary?.total)}</span>
                    <span className="summary-pill-label">Total</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.construction?.summary?.green)}</span>
                    <span className="summary-pill-label">Green</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-brown">{formatNumber(cards.construction?.summary?.brown)}</span>
                    <span className="summary-pill-label">Brown</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.construction?.summary?.cps)}</span>
                    <span className="summary-pill-label">CPs</span>
                  </div>
                </div>

                {/* YTS Section */}
                <div className="project-card-section">
                  <div className="project-section-title">YTS</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'YTS', 'Block', 'Construction YTS Blocks', cards.construction?.yts?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.construction?.yts?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'YTS', 'RKM', 'Construction YTS RKM', cards.construction?.yts?.rkm)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.construction?.yts?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                  </div>
                </div>

                {/* WIP Section */}
                <div className="project-card-section">
                  <div className="project-section-title">WIP</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'WIP', 'Block', 'Construction WIP Blocks', cards.construction?.wip?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.construction?.wip?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'WIP', 'RKM_Planned', 'RKM Planned', cards.construction?.wip?.rkm_planned)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.construction?.wip?.rkm_planned)}</span>
                      <span className="project-metric-label">RKM Planned</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'WIP', 'RKM_Completed', 'RKM Completed', cards.construction?.wip?.rkm_completed)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.construction?.wip?.rkm_completed)}</span>
                      <span className="project-metric-label">RKM Completed</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'WIP', 'Blowing_RKM', 'Blowing RKM', cards.construction?.wip?.blowing_rkm)}
                    >
                      <span className="project-metric-value metric-emerald">{formatNumber(cards.construction?.wip?.blowing_rkm)}</span>
                      <span className="project-metric-label">Blowing RKM</span>
                    </div>
                  </div>
                </div>

                {/* Acceptance Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Acceptance</div>
                  <div className="project-metrics-row cols-3">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'Acceptance', 'Block', 'Acceptance Blocks', cards.construction?.acceptance?.block)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.construction?.acceptance?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'Acceptance', 'GPs', 'Acceptance GPs', cards.construction?.acceptance?.gps)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.construction?.acceptance?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'Acceptance', 'RKM', 'Acceptance RKM', cards.construction?.acceptance?.rkm)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.construction?.acceptance?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                  </div>
                </div>

                {/* Invoiceable Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Invoiceable</div>
                  <div className="project-metrics-row cols-3">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'Invoiceable', 'Block', 'Invoiceable Blocks', cards.construction?.invoiceable?.block)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.construction?.invoiceable?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'Invoiceable', 'GPs', 'Invoiceable GPs', cards.construction?.invoiceable?.gps)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.construction?.invoiceable?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('CONSTRUCTION', 'Invoiceable', 'RKM', 'Invoiceable RKM', cards.construction?.invoiceable?.rkm)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.construction?.invoiceable?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 6: INFRA */}
          <div className="project-card">
            <div className="project-card-header header-infra">
              <div className="project-card-header-left">
                <LucideRadio size={18} />
                <span className="project-card-header-title">INFRA</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.infra ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('infra')}
                aria-label="Toggle Infra card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.infra && (
              <div className="project-card-body">
                {/* Summary Pill */}
                <div className="project-card-summary-pill">
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-navy">{formatNumber(cards.infra?.summary?.block)}</span>
                    <span className="summary-pill-label">Block</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.infra?.summary?.rkm_plan)}</span>
                    <span className="summary-pill-label">RKM Plan</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-brown">{formatNumber(cards.infra?.summary?.rkm)}</span>
                    <span className="summary-pill-label">RKM</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.infra?.summary?.blowing)}</span>
                    <span className="summary-pill-label">Blowing</span>
                  </div>
                </div>

                {/* YTS Section */}
                <div className="project-card-section">
                  <div className="project-section-title">YTS</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'YTS', 'Block', 'Infra YTS Blocks', cards.infra?.yts?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.yts?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'YTS', 'Total_GPs', 'Infra YTS Total GPs', cards.infra?.yts?.total_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.yts?.total_gps)}</span>
                      <span className="project-metric-label">Total GPs</span>
                    </div>
                  </div>
                </div>

                {/* WIP Section */}
                <div className="project-card-section">
                  <div className="project-section-title">WIP</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'WIP', 'Block', 'Infra WIP Blocks', cards.infra?.wip?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.wip?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'WIP', 'Total_GPs', 'Infra WIP Total GPs', cards.infra?.wip?.total_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.wip?.total_gps)}</span>
                      <span className="project-metric-label">Total GPs</span>
                    </div>
                  </div>
                </div>

                {/* Completed Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Completed</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'Completed', 'Block', 'Infra Completed Blocks', cards.infra?.completed?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.completed?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'Completed', 'Total_GPs', 'Infra Completed Total GPs', cards.infra?.completed?.total_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.completed?.total_gps)}</span>
                      <span className="project-metric-label">Total GPs</span>
                    </div>
                  </div>
                </div>

                {/* Handed Over Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Handed Over</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'Handed_Over', 'Block', 'Infra Handed Over Blocks', cards.infra?.handed_over?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.handed_over?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('INFRA', 'Handed_Over', 'Total_GPs', 'Infra Handed Over Total GPs', cards.infra?.handed_over?.total_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.infra?.handed_over?.total_gps)}</span>
                      <span className="project-metric-label">Total GPs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 7: HOTO */}
          <div className="project-card">
            <div className="project-card-header header-hoto">
              <div className="project-card-header-left">
                <LucideFileCheck size={18} />
                <span className="project-card-header-title">HOTO</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.hoto ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('hoto')}
                aria-label="Toggle HOTO card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.hoto && (
              <div className="project-card-body">
                {/* Summary Pill */}
                <div className="project-card-summary-pill">
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-navy">{formatNumber(cards.hoto?.summary?.block)}</span>
                    <span className="summary-pill-label">Block</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.hoto?.summary?.total_cps)}</span>
                    <span className="summary-pill-label">Total CP's</span>
                  </div>
                </div>

                {/* YTS Section */}
                <div className="project-card-section">
                  <div className="project-section-title">YTS</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'YTS', 'Block', 'HOTO YTS Blocks', cards.hoto?.yts?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.hoto?.yts?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'YTS', 'Tot_GPs', 'HOTO YTS Total GPs', cards.hoto?.yts?.tot_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.hoto?.yts?.tot_gps)}</span>
                      <span className="project-metric-label">Tot. GPs</span>
                    </div>
                  </div>
                </div>

                {/* WIP Section */}
                <div className="project-card-section">
                  <div className="project-section-title">WIP</div>
                  <div className="project-metrics-row cols-2">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'WIP', 'Block', 'HOTO WIP Blocks', cards.hoto?.wip?.block)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.hoto?.wip?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'WIP', 'Tot_GPs', 'HOTO WIP Total GPs', cards.hoto?.wip?.tot_gps)}
                    >
                      <span className="project-metric-value metric-blue">{formatNumber(cards.hoto?.wip?.tot_gps)}</span>
                      <span className="project-metric-label">Tot. GPs</span>
                    </div>
                  </div>
                </div>

                {/* Approved Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Approved</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'Approved', 'Total', 'HOTO Approved Total', cards.hoto?.approved?.total)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.hoto?.approved?.total)}</span>
                      <span className="project-metric-label">Total</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'Approved', 'Green', 'HOTO Approved Green', cards.hoto?.approved?.green)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.hoto?.approved?.green)}</span>
                      <span className="project-metric-label">Green</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'Approved', 'Brown', 'HOTO Approved Brown', cards.hoto?.approved?.brown)}
                    >
                      <span className="project-metric-value metric-brown">{formatNumber(cards.hoto?.approved?.brown)}</span>
                      <span className="project-metric-label">Brown</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('HOTO', 'Approved', 'GPs', 'HOTO Approved GPs', cards.hoto?.approved?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.hoto?.approved?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 8: OPERATION */}
          <div className="project-card">
            <div className="project-card-header header-operation">
              <div className="project-card-header-left">
                <LucideSettings size={18} />
                <span className="project-card-header-title">OPERATION</span>
              </div>
              <button
                type="button"
                className={`project-card-header-toggle ${collapsedCards.operation ? 'collapsed' : ''}`}
                onClick={() => toggleCardCollapse('operation')}
                aria-label="Toggle Operation card"
              >
                <LucideChevronDown size={18} />
              </button>
            </div>
            {!collapsedCards.operation && (
              <div className="project-card-body">
                {/* Summary Pill */}
                <div className="project-card-summary-pill">
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-navy">{formatNumber(cards.operation?.summary?.total)}</span>
                    <span className="summary-pill-label">Total</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.operation?.summary?.green)}</span>
                    <span className="summary-pill-label">Green</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-brown">{formatNumber(cards.operation?.summary?.brown)}</span>
                    <span className="summary-pill-label">Brown</span>
                  </div>
                  <div className="summary-pill-item">
                    <span className="summary-pill-val summary-val-green">{formatNumber(cards.operation?.summary?.cps)}</span>
                    <span className="summary-pill-label">CPs</span>
                  </div>
                </div>

                {/* From O&M Section */}
                <div className="project-card-section">
                  <div className="project-section-title">From O&M</div>
                  <div className="project-metrics-row cols-3">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'From_OM', 'Block', 'O&M Blocks', cards.operation?.from_om?.block)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.from_om?.block)}</span>
                      <span className="project-metric-label">Block</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'From_OM', 'RKM', 'O&M RKM', cards.operation?.from_om?.rkm)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.from_om?.rkm)}</span>
                      <span className="project-metric-label">RKM</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'From_OM', 'AMC_GPs', 'O&M AMC GPs', cards.operation?.from_om?.amc_gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.from_om?.amc_gps)}</span>
                      <span className="project-metric-label">AMC GPs</span>
                    </div>
                  </div>
                </div>

                {/* From Constructions Section */}
                <div className="project-card-section">
                  <div className="project-section-title">From Constructions</div>
                  <div className="project-metrics-row cols-4">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'From_Constructions', 'Block_Routers', 'Block Routers', cards.operation?.from_constructions?.block_routers)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.from_constructions?.block_routers)}</span>
                      <span className="project-metric-label">Block Routers</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'From_Constructions', 'Rings', 'Rings', cards.operation?.from_constructions?.rings)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.from_constructions?.rings)}</span>
                      <span className="project-metric-label">Rings</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'From_Constructions', 'GP_Routers', 'GP Routers', cards.operation?.from_constructions?.gp_routers)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.from_constructions?.gp_routers)}</span>
                      <span className="project-metric-label">GP Routers</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'From_Constructions', 'GPs', 'Operation GPs', cards.operation?.from_constructions?.gps)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.from_constructions?.gps)}</span>
                      <span className="project-metric-label">GPs</span>
                    </div>
                  </div>
                </div>

                {/* Racks & RFMS Section */}
                <div className="project-card-section">
                  <div className="project-section-title">Racks & RFMS</div>
                  <div className="project-metrics-row cols-3">
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'Racks_RFMS', 'Block_Racks', 'Block Racks', cards.operation?.racks_rfms?.block_racks)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.racks_rfms?.block_racks)}</span>
                      <span className="project-metric-label">Block Racks</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'Racks_RFMS', 'GP_Rack', 'GP Rack', cards.operation?.racks_rfms?.gp_rack)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.racks_rfms?.gp_rack)}</span>
                      <span className="project-metric-label">GP Rack</span>
                    </div>
                    <div
                      className="project-metric-tile"
                      onClick={() => handleMetricClick('OPERATION', 'Racks_RFMS', 'RFMS', 'RFMS Sensors', cards.operation?.racks_rfms?.rfms)}
                    >
                      <span className="project-metric-value metric-green">{formatNumber(cards.operation?.racks_rfms?.rfms)}</span>
                      <span className="project-metric-label">RFMS</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Interactive Drill-Down Modal / Drawer */}
      {drilldownModal.isOpen && (
        <div className="drilldown-backdrop" onClick={handleCloseDrilldown}>
          <div className="drilldown-modal" onClick={e => e.stopPropagation()}>
            <div className="drilldown-header">
              <div>
                <div className="drilldown-title">
                  {drilldownModal.card} → {drilldownModal.section} → {drilldownModal.label} ({drilldownData?.total ?? drilldownModal.value})
                </div>
                <div className="drilldown-subtitle">
                  Active Context: {selectedState} | District: {selectedDistrict} | Block: {selectedBlock} | Mode: {activeTab.toUpperCase()}
                </div>
              </div>

              <div className="drilldown-header-actions">
                <input
                  type="text"
                  className="drilldown-search-input"
                  placeholder="Search blocks / status..."
                  value={drilldownSearch}
                  onChange={handleDrilldownSearchChange}
                />
                <button
                  type="button"
                  className="drilldown-export-btn"
                  onClick={handleExportDrilldownCSV}
                  title="Export to CSV"
                >
                  <LucideDownload size={14} /> Export
                </button>
                <button
                  type="button"
                  className="drilldown-close-btn"
                  onClick={handleCloseDrilldown}
                  aria-label="Close drilldown modal"
                >
                  <LucideX size={20} />
                </button>
              </div>
            </div>

            <div className="drilldown-body">
              {drilldownLoading ? (
                <div style={{ padding: '3rem 0' }}>
                  <LoadingSpinner title="Loading drill-down records..." />
                </div>
              ) : drilldownData?.results?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#64748b' }}>
                  No matching records found for the selected criteria.
                </div>
              ) : (
                <table className="drilldown-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Block Name</th>
                      <th>District</th>
                      <th>Circle</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>GPs</th>
                      <th>Scope RKM</th>
                      <th>Done RKM</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownData?.results?.map((row, idx) => (
                      <tr key={row.id}>
                        <td>{drilldownPage * 15 + idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{row.block_name}</td>
                        <td>{row.district_name}</td>
                        <td>{row.circle_name}</td>
                        <td>
                          <span className={`drilldown-category-badge ${row.category === 'GREEN' ? 'badge-green' : 'badge-brown'}`}>
                            {row.category}
                          </span>
                        </td>
                        <td>
                          <span className="badge-status">{row.status}</span>
                        </td>
                        <td>{formatNumber(row.total_gps)}</td>
                        <td>{formatNumber(row.scope_rkm)}</td>
                        <td>{formatNumber(row.completed_rkm)}</td>
                        <td>
                          <button
                            type="button"
                            className="drilldown-action-link"
                            style={{ background: 'none', border: 'none', padding: 0 }}
                            onClick={() => {
                              handleCloseDrilldown();
                              navigate(`/map-view/bharatnet?circle=${row.circle_name}&district=${row.district_name}&block=${row.block_name}`);
                            }}
                          >
                            Map <LucideExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="drilldown-footer">
              <div>
                Showing {Math.min((drilldownPage * 15) + 1, drilldownData?.total || 0)} to {Math.min((drilldownPage + 1) * 15, drilldownData?.total || 0)} of {drilldownData?.total || 0} entries
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="drilldown-pagination-btn"
                  disabled={drilldownPage === 0}
                  onClick={() => handleDrilldownPageChange(drilldownPage - 1)}
                >
                  Previous
                </button>
                <span>Page {drilldownPage + 1} of {drilldownData?.total_pages || 1}</span>
                <button
                  type="button"
                  className="drilldown-pagination-btn"
                  disabled={drilldownPage + 1 >= (drilldownData?.total_pages || 1)}
                  onClick={() => handleDrilldownPageChange(drilldownPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDashboard;
