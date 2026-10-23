import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { reportService } from '../../services/reportService';
import {
  FileSpreadsheet,
  Download,
  Filter,
  RefreshCw,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Calendar,
  Truck,
  Hash,
  Ruler,
  AlertCircle,
  MapPin,
  Clock,
  Table,
  Info,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

export const HddShotReport = ({ selectedVendorId, isStandalone = false }) => {
  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [machineId, setMachineId] = useState('');
  const [vendorId, setVendorId] = useState(selectedVendorId || '');
  const [circle, setCircle] = useState('');
  const [district, setDistrict] = useState('');
  const [block, setBlock] = useState('');
  const [executionSearch, setExecutionSearch] = useState('');
  const [dailySummarySearch, setDailySummarySearch] = useState('');

  // Pagination & view states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeTab, setActiveTab] = useState(isStandalone ? 'execution' : 'execution'); // 'execution' | 'today' | 'all' | 'daily_summary'

  // Data states
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportData, setReportData] = useState({
    results: [],
    today_records: [],
    effective_today: '',
    daily_summary: [],
    daily_machine_summary: null,
    pagination: { page: 1, page_size: 25, total_records: 0, total_pages: 1 },
    summary: { total_shots: 0, total_meters: 0, total_machines: 0, today_shots_count: 0, today_meters: 0, today_wip_count: 0, total_wip_count: 0, date_range: {} },
    filter_options: { machines: [], vendors: [], circles: [], districts: [], blocks: [] },
    execution_summary: null,
    selected_report_date: ''
  });
  const [error, setError] = useState(null);

  // Sync prop selectedVendorId if changed from TopHeader
  useEffect(() => {
    if (selectedVendorId && selectedVendorId !== 'all') {
      setVendorId(selectedVendorId);
    } else if (selectedVendorId === 'all') {
      setVendorId('');
    }
  }, [selectedVendorId]);

  // Fetch report data
  const fetchReport = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (chassisNumber.trim()) params.chassis_number = chassisNumber.trim();
      if (machineId.trim()) params.machine_id = machineId.trim();
      if (vendorId && vendorId !== 'all') params.vendor_id = vendorId;
      if (circle) params.circle = circle;
      if (district) params.district = district;
      if (block) params.block = block;
      if (activeTab === 'today' && !startDate && !endDate) params.today_only = 'true';
      if (refresh) params.refresh = 'true';

      const res = await reportService.getHddShotReport(params);
      const data = res?.data || res;
      if (data) {
        setReportData({
          results: Array.isArray(data.results) ? data.results : [],
          today_records: Array.isArray(data.today_records) ? data.today_records : [],
          effective_today: data.effective_today || '',
          daily_summary: Array.isArray(data.daily_summary) ? data.daily_summary : [],
          daily_machine_summary: data.daily_machine_summary || null,
          pagination: data.pagination || { page: 1, page_size: pageSize, total_records: 0, total_pages: 1 },
          summary: data.summary || { total_shots: 0, total_meters: 0, total_machines: 0, today_shots_count: 0, today_meters: 0, date_range: {} },
          filter_options: data.filter_options || { machines: [], vendors: [], circles: [], districts: [], blocks: [] },
          execution_summary: data.execution_summary || null,
          selected_report_date: data.selected_report_date || ''
        });
      }
    } catch (err) {
      console.error('Error fetching HDD shot report:', err);
      setError(err?.message || 'Failed to load HDD shot records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate, chassisNumber, machineId, vendorId, circle, district, block, activeTab]);

  // Load when filters or pagination change
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Reset filters
  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setChassisNumber('');
    setMachineId('');
    setCircle('');
    setDistrict('');
    setBlock('');
    setVendorId(selectedVendorId && selectedVendorId !== 'all' ? selectedVendorId : '');
    setPage(1);
  };

  // Quick Date Presets
  const handleQuickPreset = (preset) => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      if (activeTab !== 'execution') setActiveTab('today');
      setStartDate('');
      setEndDate('');
      setPage(1);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(today.getDate() - 1);
      const yStr = toYMD(y);
      setStartDate(yStr);
      setEndDate(yStr);
      if (activeTab === 'today') setActiveTab('all');
      setPage(1);
    } else if (preset === 'last7') {
      const d7 = new Date();
      d7.setDate(today.getDate() - 6);
      setStartDate(toYMD(d7));
      setEndDate(toYMD(today));
      if (activeTab === 'today') setActiveTab('all');
      setPage(1);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      if (activeTab === 'today') setActiveTab('all');
      setPage(1);
    }
  };

  // Export Excel
  const handleExportExcel = async (todayOnly = false) => {
    setExporting(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (chassisNumber.trim()) params.chassis_number = chassisNumber.trim();
      if (machineId.trim()) params.machine_id = machineId.trim();
      if (vendorId && vendorId !== 'all') params.vendor_id = vendorId;
      if (circle) params.circle = circle;
      if (district) params.district = district;
      if (block) params.block = block;
      if (todayOnly || (activeTab === 'today' && !startDate && !endDate)) {
        params.today_only = 'true';
      }

      const res = await reportService.exportHddShotReportExcel(params);
      const blob = res instanceof Blob ? res : new Blob([res], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateTag = reportData.selected_report_date || new Date().toISOString().slice(0, 10);
      const typeTag = (todayOnly || (activeTab === 'today' && !startDate && !endDate)) ? '_Today_Report' : '_Execution_Summary';
      const chassisTag = chassisNumber.trim() ? `_${chassisNumber.trim()}` : '';
      link.setAttribute('download', `Hero_HDD_Execution_Report${typeTag}${chassisTag}_${dateTag}.xlsx`);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel Export error:', err);
      alert('Failed to generate Excel export. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const {
    results,
    daily_summary,
    daily_machine_summary,
    pagination,
    summary,
    filter_options,
    effective_today,
    execution_summary,
    selected_report_date
  } = reportData;

  const dailyMachineSummary = daily_machine_summary || null;
  const dmsRows = dailyMachineSummary?.rows || [];
  const dmsWorkingCount = dailyMachineSummary?.working_count ?? 0;
  const dmsIdleCount = dailyMachineSummary?.idle_count ?? 0;
  const dmsTotalMachines = dailyMachineSummary?.total_machines ?? dmsRows.length;
  const dmsTotalMeters = dailyMachineSummary?.total_ftd_meters ?? 0;
  const dmsTotalShots = dailyMachineSummary?.total_shots ?? 0;
  const dmsReportingDate = dailyMachineSummary?.reporting_date || selected_report_date || effective_today;

  const filteredDmsRows = useMemo(() => {
    if (!dailySummarySearch.trim()) return dmsRows;
    const q = dailySummarySearch.toLowerCase();
    return dmsRows.filter(r =>
      (r.block && r.block.toLowerCase().includes(q)) ||
      (r.machine && String(r.machine).toLowerCase().includes(q)) ||
      (r.machine_status && r.machine_status.toLowerCase().includes(q)) ||
      (r.reason_of_idle && r.reason_of_idle.toLowerCase().includes(q)) ||
      (r.ageing_of_idle && r.ageing_of_idle.toLowerCase().includes(q)) ||
      (r.chassis_number && String(r.chassis_number).toLowerCase().includes(q))
    );
  }, [dmsRows, dailySummarySearch]);

  const dmsShotColsCount = useMemo(() => {
    const maxInRows = dmsRows.reduce((acc, r) => Math.max(acc, (r.shots_list || []).length), 0);
    return Math.max(4, maxInRows);
  }, [dmsRows]);

  const executionSummary = execution_summary;
  const bounds = executionSummary?.bounds;
  const weekDays = executionSummary?.week_days || [];
  const execRows = executionSummary?.rows || [];
  const execTotals = executionSummary?.totals;

  const formatNum = (val, maxDec = 3) => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const n = Number(val);
    const hasDecimals = !Number.isInteger(n);
    const decCount = hasDecimals ? (String(val).split('.')[1]?.length || 2) : 0;
    return n.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimals ? Math.min(2, Math.min(decCount, maxDec)) : 0,
      maximumFractionDigits: Math.min(Math.max(decCount, 2), maxDec)
    });
  };

  const formatDelta = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const n = Number(val);
    const formatted = formatNum(Math.abs(n));
    if (n > 0) return `+${formatted}`;
    if (n < 0) return `-${formatted}`;
    return '0';
  };

  const filteredExecRows = useMemo(() => {
    if (!executionSearch.trim()) return execRows;
    const q = executionSearch.toLowerCase();
    return execRows.filter(r =>
      (r.block && r.block.toLowerCase().includes(q)) ||
      (r.machine && String(r.machine).toLowerCase().includes(q)) ||
      (r.partner && r.partner.toLowerCase().includes(q)) ||
      (r.circle && r.circle.toLowerCase().includes(q)) ||
      (r.district && r.district.toLowerCase().includes(q)) ||
      (r.machine_name && r.machine_name.toLowerCase().includes(q))
    );
  }, [execRows, executionSearch]);

  const uniqueExecMachinesCount = useMemo(() => {
    const partnerRows = execRows.filter(r => r.partner && !['hero', 'hero infrastructure', 'none', 'null', '—', 'n/a', ''].includes(String(r.partner).trim().toLowerCase()));
    const targetRows = partnerRows.length > 0 ? partnerRows : execRows;
    return new Set(targetRows.map(r => r.machine || r.machine_id || r.chassis_number)).size;
  }, [execRows]);

  const filteredUniqueMachinesCount = useMemo(() => {
    const partnerRows = filteredExecRows.filter(r => r.partner && !['hero', 'hero infrastructure', 'none', 'null', '—', 'n/a', ''].includes(String(r.partner).trim().toLowerCase()));
    const targetRows = partnerRows.length > 0 ? partnerRows : filteredExecRows;
    return new Set(targetRows.map(r => r.machine || r.machine_id || r.chassis_number)).size;
  }, [filteredExecRows]);

  // Filter districts and blocks based on selected circle/district
  const availableDistricts = useMemo(() => {
    return filter_options.districts || [];
  }, [filter_options.districts]);

  const availableBlocks = useMemo(() => {
    return filter_options.blocks || [];
  }, [filter_options.blocks]);

  return (
    <section className="panel" id="hdd-shot-report" style={{ marginTop: isStandalone ? '0.75rem' : '1.5rem' }}>
      {/* Header */}
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 className="panel-title" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
              {isStandalone ? 'HDD Shot Records' : 'HDD Shot Report'}
            </h2>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
              Machine & Shot-Wise
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '12px', background: 'rgba(180, 83, 9, 0.1)', color: '#b45309' }}>
              3 Excel Sheets (Today + All Shots + Summary)
            </span>
          </div>
          <p className="page-subtitle" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Machine-wise and shot-wise HDD output in metres mapped to chassis, circle, district, and block.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchReport(true)}
            disabled={loading}
            title="Refresh shot records"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => handleExportExcel(false)}
            disabled={exporting || loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: '#059669',
              borderColor: '#059669',
              color: '#ffffff'
            }}
          >
            <FileSpreadsheet size={15} />
            {exporting ? 'Exporting...' : 'Export Excel (.xlsx)'}
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          margin: '1rem 0'
        }}
      >
        <div style={{ background: activeTab === 'today' ? 'rgba(180, 83, 9, 0.08)' : 'var(--bg-subtle)', padding: '0.75rem 1rem', borderRadius: '8px', border: activeTab === 'today' ? '1px solid #f59e0b' : '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: activeTab === 'today' ? '#b45309' : 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Today's Output</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: activeTab === 'today' ? '#b45309' : 'var(--text-primary)', marginTop: '0.2rem' }}>
            {summary.today_meters ? summary.today_meters.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : (summary.total_meters?.toLocaleString() ?? 0)} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>m</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {summary.today_shots_count ?? summary.total_shots} shots today{summary.today_wip_count ? ` (${summary.today_wip_count} WIP)` : ''}
          </div>
        </div>

        <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Filtered Output Metres</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#059669', marginTop: '0.2rem' }}>
            {summary.total_meters?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) ?? '0'} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>m</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {summary.total_shots?.toLocaleString() ?? 0} shots in period
          </div>
        </div>

        <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Active Machines</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#2563eb', marginTop: '0.2rem' }}>
            {summary.total_machines ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            drilling units with records
          </div>
        </div>

        <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Avg Shot Length</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {summary.total_shots > 0 ? (summary.total_meters / summary.total_shots).toFixed(1) : 0} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>m/shot</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            average bore per shot
          </div>
        </div>
      </div>

      {/* Quick Date Presets Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Presets:</span>
        <button
          type="button"
          onClick={() => handleQuickPreset('today')}
          style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '12px',
            border: activeTab === 'today' && !startDate && !endDate ? '1px solid #b45309' : '1px solid var(--border)',
            background: activeTab === 'today' && !startDate && !endDate ? 'rgba(180, 83, 9, 0.1)' : 'var(--bg-subtle)',
            color: activeTab === 'today' && !startDate && !endDate ? '#b45309' : 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s ease'
          }}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => handleQuickPreset('yesterday')}
          style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'all 0.15s ease'
          }}
        >
          Yesterday
        </button>
        <button
          type="button"
          onClick={() => handleQuickPreset('last7')}
          style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'all 0.15s ease'
          }}
        >
          Last 7 Days
        </button>
        <button
          type="button"
          onClick={() => handleQuickPreset('all')}
          style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '12px',
            border: activeTab === 'all' && !startDate && !endDate ? '1px solid #2563eb' : '1px solid var(--border)',
            background: activeTab === 'all' && !startDate && !endDate ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-subtle)',
            color: activeTab === 'all' && !startDate && !endDate ? '#2563eb' : 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s ease'
          }}
        >
          All Time
        </button>
      </div>

      {/* Filters Bar */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.85rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'flex-end'
        }}
      >
        {/* Start Date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '135px', flex: '1 1 135px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Start Date</label>
            {startDate && (
              <button
                type="button"
                onClick={() => { setStartDate(''); setPage(1); }}
                style={{ fontSize: '0.7rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                title="Clear Start Date"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="date"
            className="form-input"
            value={startDate}
            max={endDate || undefined}
            onClick={(e) => { try { e.target.showPicker?.(); } catch (_) { } }}
            onChange={(e) => {
              const val = e.target.value;
              setStartDate(val);
              setPage(1);
              if (val && activeTab === 'today') {
                setActiveTab('all');
              }
            }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px', cursor: 'pointer' }}
          />
        </div>

        {/* End Date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '135px', flex: '1 1 135px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>End Date</label>
            {endDate && (
              <button
                type="button"
                onClick={() => { setEndDate(''); setPage(1); }}
                style={{ fontSize: '0.7rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                title="Clear End Date"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="date"
            className="form-input"
            value={endDate}
            min={startDate || undefined}
            onClick={(e) => { try { e.target.showPicker?.(); } catch (_) { } }}
            onChange={(e) => {
              const val = e.target.value;
              setEndDate(val);
              setPage(1);
              if (val && activeTab === 'today') {
                setActiveTab('all');
              }
            }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px', cursor: 'pointer' }}
          />
        </div>

        {/* Circle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '130px', flex: '1 1 130px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Circle</label>
          <select
            className="form-input"
            value={circle}
            onChange={(e) => { setCircle(e.target.value); setPage(1); }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px' }}
          >
            <option value="">All Circles</option>
            {filter_options.circles?.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* District */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '130px', flex: '1 1 130px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>District</label>
          <select
            className="form-input"
            value={district}
            onChange={(e) => { setDistrict(e.target.value); setPage(1); }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px' }}
          >
            <option value="">All Districts</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '130px', flex: '1 1 130px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Block</label>
          <select
            className="form-input"
            value={block}
            onChange={(e) => { setBlock(e.target.value); setPage(1); }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px' }}
          >
            <option value="">All Blocks</option>
            {availableBlocks.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Machine Chassis Number */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '150px', flex: '1 1 150px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Chassis Number</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. 600202608398"
            value={chassisNumber}
            onChange={(e) => { setChassisNumber(e.target.value); setPage(1); }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px' }}
          />
        </div>

        {/* Machine ID */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '130px', flex: '1 1 130px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Machine ID / Code</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. MAC-8398"
            value={machineId}
            onChange={(e) => { setMachineId(e.target.value); setPage(1); }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px' }}
          />
        </div>

        {/* Partner */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '150px', flex: '1 1 150px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Partner / Vendor</label>
          <select
            className="form-input"
            value={vendorId}
            onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px' }}
          >
            <option value="">All Partners</option>
            {filter_options.vendors?.map((v) => (
              <option key={v.id || v.name} value={v.id || v.name}>{v.name}</option>
            ))}
          </select>
        </div>

        {/* Reset Filter Button */}
        {(startDate || endDate || chassisNumber || machineId || vendorId || circle || district || block) && (
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '36px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetFilters}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', height: '36px', padding: '0 10px' }}
              title="Reset all filters"
            >
              <RotateCcw size={13} />
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Tabs: Execution Summary | Today's Report | All Shots | Daily Summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('execution');
              setPage(1);
            }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'execution' ? '2px solid #0F2C59' : '2px solid transparent',
              color: activeTab === 'execution' ? '#0F2C59' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Table size={14} />
            Execution Summary (PTD / MTD)
            {uniqueExecMachinesCount > 0 && (
              <span style={{ fontSize: '0.72rem', background: 'rgba(15, 44, 89, 0.1)', color: '#0F2C59', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                {uniqueExecMachinesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('today');
              setStartDate('');
              setEndDate('');
              setPage(1);
            }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'today' ? '2px solid #b45309' : '2px solid transparent',
              color: activeTab === 'today' ? '#b45309' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={14} />
            Today's Shots ({summary.today_shots_count ?? 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily_summary')}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'daily_summary' ? '2px solid #059669' : '2px solid transparent',
              color: activeTab === 'daily_summary' ? '#059669' : 'var(--text-muted)'
            }}
          >
            Machine Daily Summary ({dailyMachineSummary ? dmsTotalMachines : daily_summary.length})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('all'); setPage(1); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'all' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'all' ? '#2563eb' : 'var(--text-muted)'
            }}
          >
            {startDate || endDate
              ? `Filtered Shots (${pagination.total_records.toLocaleString()})`
              : `All Historical Shots (${activeTab === 'all' ? pagination.total_records.toLocaleString() : (summary.total_historical_shots ?? summary.total_shots ?? 0).toLocaleString()})`
            }
          </button>
        </div>

        {/* Page Size Selector (for paginated shot lists) */}
        {activeTab !== 'daily_summary' && activeTab !== 'execution' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', opacity: 0.7 }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading HDD telemetry & date periods...</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Calculating PTD, MTD, Previous Month, Previous Week, and daily outputs.</div>
        </div>
      ) : activeTab === 'execution' ? (
        /* TAB 1: EXECUTION SUMMARY TABLE (PTD / MTD / WEEKLY / DELTA) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Period Metadata Strip */}
          {bounds && (
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Calendar size={15} style={{ color: '#0F2C59' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      HERO Reporting Boundaries
                    </span>
                  </div>
                  <span style={{ fontSize: '0.73rem', background: 'rgba(15, 44, 89, 0.1)', color: '#0F2C59', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                    Report Date: {bounds.selected_date_str}
                  </span>
                  <span style={{ fontSize: '0.73rem', background: 'rgba(0, 92, 138, 0.1)', color: '#005C8A', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                    PTD Start: Machine-Specific
                  </span>
                  <span style={{ fontSize: '0.73rem', background: 'rgba(100, 116, 139, 0.1)', color: '#475569', padding: '2px 8px', borderRadius: '10px' }}>
                    Timezone: Asia/Kolkata
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Info size={13} /> Calendar days inclusive &bull; Eligible completed HDD shots only
                </div>
              </div>

              {/* Period badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '6px', background: 'rgba(0, 92, 138, 0.08)', border: '1px solid rgba(0, 92, 138, 0.25)', color: '#005C8A' }} title="PTD (Production Till Date) is calculated individually per machine from its verified production start date through the selected report date">
                  <strong style={{ marginRight: '4px' }}>PTD (Production Till Date):</strong> Machine-Specific Start Dates to {bounds.selected_date_str}
                </div>
                <div style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '6px', background: 'rgba(30, 112, 152, 0.08)', border: '1px solid rgba(30, 112, 152, 0.25)', color: '#1E7098' }}>
                  <strong style={{ marginRight: '4px' }}>Previous Month:</strong> {bounds.prev_month?.label}
                </div>
                <div style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '6px', background: 'rgba(0, 153, 216, 0.08)', border: '1px solid rgba(0, 153, 216, 0.25)', color: '#007bb0' }}>
                  <strong style={{ marginRight: '4px' }}>MTD:</strong> {bounds.mtd?.label}
                </div>
                <div style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '6px', background: 'rgba(153, 204, 229, 0.25)', border: '1px solid rgba(153, 204, 229, 0.6)', color: '#0F2C59' }}>
                  <strong style={{ marginRight: '4px' }}>Previous Week:</strong> {bounds.prev_week?.label}
                </div>
                <div style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '6px', background: 'rgba(15, 44, 89, 0.08)', border: '1px solid rgba(15, 44, 89, 0.25)', color: '#0F2C59' }}>
                  <strong style={{ marginRight: '4px' }}>Current Week:</strong> {bounds.current_week?.label}
                </div>
              </div>
            </div>
          )}

          {/* Search bar inside Execution Summary tab */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ position: 'relative', minWidth: '260px', flex: '1 1 260px', maxWidth: '400px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by block, machine, or partner..."
                value={executionSearch}
                onChange={(e) => setExecutionSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing {filteredUniqueMachinesCount} machine{filteredUniqueMachinesCount === 1 ? '' : 's'} &bull; Values in linear metres
            </div>
          </div>

          {/* Execution Report Table matching Book3.xlsx1.xlsx screenshot */}
          <div className="table-container" style={{ border: '1px solid #94A3B8', borderRadius: '8px', overflowX: 'auto', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'inherit' }}>
              <thead>
                {/* Header Row 1 */}
                <tr>
                  <th rowSpan={2} style={{ background: '#0F2C59', color: '#FFFFFF', verticalAlign: 'middle', textAlign: 'center', border: '1px solid #94A3B8', padding: '10px 12px', minWidth: '95px', fontWeight: 700 }}>
                    Block
                  </th>
                  <th rowSpan={2} style={{ background: '#0F2C59', color: '#FFFFFF', verticalAlign: 'middle', textAlign: 'center', border: '1px solid #94A3B8', padding: '10px 12px', minWidth: '135px', fontWeight: 700 }}>
                    Machine
                  </th>
                  <th rowSpan={2} style={{ background: '#0F2C59', color: '#FFFFFF', verticalAlign: 'middle', textAlign: 'center', border: '1px solid #94A3B8', padding: '10px 12px', minWidth: '140px', fontWeight: 700 }}>
                    Partner
                  </th>
                  <th colSpan={2} style={{ background: '#005C8A', color: '#FFFFFF', textAlign: 'center', border: '1px solid #94A3B8', padding: '8px 10px', fontWeight: 700 }}>
                    PTD
                  </th>
                  <th colSpan={2} style={{ background: '#1E7098', color: '#FFFFFF', textAlign: 'center', border: '1px solid #94A3B8', padding: '8px 10px', fontWeight: 700 }}>
                    Previous Month
                  </th>
                  <th colSpan={2} style={{ background: '#0099D8', color: '#FFFFFF', textAlign: 'center', border: '1px solid #94A3B8', padding: '8px 10px', fontWeight: 700 }}>
                    MTD
                  </th>
                  <th colSpan={2} style={{ background: '#99CCE5', color: '#0F2C59', textAlign: 'center', border: '1px solid #94A3B8', padding: '8px 10px', fontWeight: 700 }}>
                    Previous Week
                  </th>
                  <th colSpan={weekDays.length + 1} style={{ background: '#0F2C59', color: '#FFFFFF', textAlign: 'center', border: '1px solid #94A3B8', padding: '8px 10px', fontWeight: 700 }}>
                    For the week
                  </th>
                  <th colSpan={2} style={{ background: '#0F2C59', color: '#FFFFFF', textAlign: 'center', border: '1px solid #94A3B8', padding: '8px 10px', fontWeight: 700 }}>
                    Delta
                  </th>
                </tr>

                {/* Header Row 2 (Subheaders) */}
                <tr>
                  <th style={{ background: '#CBD5E1', color: '#0F172A', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Total
                  </th>
                  <th style={{ background: '#CBD5E1', color: '#990000', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Per Day
                  </th>

                  <th style={{ background: '#CBD5E1', color: '#0F172A', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Total
                  </th>
                  <th style={{ background: '#CBD5E1', color: '#990000', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Per Day
                  </th>

                  <th style={{ background: '#CBD5E1', color: '#0F172A', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Total
                  </th>
                  <th style={{ background: '#CBD5E1', color: '#990000', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Per Day
                  </th>

                  <th style={{ background: '#CBD5E1', color: '#0F172A', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Total
                  </th>
                  <th style={{ background: '#CBD5E1', color: '#990000', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Per Day
                  </th>

                  {weekDays.map((wd) => (
                    <th key={wd.date} style={{ background: '#CBD5E1', color: '#0F172A', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '70px' }}>
                      {wd.label}
                    </th>
                  ))}

                  <th style={{ background: '#FECDD3', color: '#990000', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    Average
                  </th>

                  <th style={{ background: '#CBD5E1', color: '#0F172A', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '90px' }}>
                    Previous week
                  </th>
                  <th style={{ background: '#CBD5E1', color: '#0F172A', textAlign: 'center', border: '1px solid #94A3B8', padding: '6px 8px', fontSize: '0.78rem', fontWeight: 700, minWidth: '75px' }}>
                    MTD
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExecRows.length === 0 ? (
                  <tr>
                    <td colSpan={13 + weekDays.length} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', border: '1px solid #CBD5E1' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        No execution records found
                      </div>
                      <p style={{ margin: '0.25rem 0 0.75rem', fontSize: '0.82rem' }}>
                        No machine production data matches the selected filters and report date.
                      </p>
                      <button type="button" className="btn-secondary" onClick={handleResetFilters} style={{ fontSize: '0.8rem', margin: '0 auto' }}>
                        Clear Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredExecRows.map((r, idx) => (
                    <tr key={`${r.machine}_${r.partner}_${idx}`} style={{ background: idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF', transition: 'background 0.15s' }}>
                      {/* Block */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', color: '#0F172A', fontWeight: 500 }}>
                        {r.block || '—'}
                      </td>

                      {/* Machine */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'center', color: '#0F172A' }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.machine}</div>
                        {r.is_start_date_unknown ? (
                          <div style={{ fontSize: '0.7rem', color: '#B45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '2px' }} title="Production start date unknown — requires verification">
                            ⚠️ Start Unknown (Verify)
                          </div>
                        ) : r.is_future_start ? (
                          <div style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '2px' }} title="Production starts after report date">
                            ⚠️ Start: {r.ptd_start_formatted} (Future)
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }} title={`Production Start: ${r.ptd_start_formatted} (${r.ptd_days} calendar days through ${r.ptd_end_date})`}>
                            Start: {r.ptd_start_formatted} <span style={{ color: '#005C8A', fontWeight: 600 }}>({r.ptd_days}d)</span>
                          </div>
                        )}
                      </td>

                      {/* Partner */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', color: '#0F172A' }}>
                        {r.partner || '—'}
                      </td>

                      {/* PTD Total */}
                      <td
                        style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 500, color: '#0F172A' }}
                        title={r.is_start_date_unknown ? 'Start date unknown — flagged for verification' : (r.is_future_start ? 'Production starts after report date' : `PTD Total: ${r.ptd_total} m (${r.ptd_start_formatted} to ${r.ptd_end_date})`)}
                      >
                        {formatNum(r.ptd_total)}
                      </td>

                      {/* PTD Per Day (Bold Red) */}
                      <td
                        style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#990000' }}
                        title={r.is_start_date_unknown ? 'Start date unknown — flagged for verification' : (r.is_future_start ? 'Production starts after report date' : `PTD Per Day: ${r.ptd_total} m / ${r.ptd_days} days = ${r.ptd_per_day} m/day`)}
                      >
                        {formatNum(r.ptd_per_day)}
                      </td>

                      {/* Previous Month Total */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 500, color: '#0F172A' }}>
                        {formatNum(r.prev_month_total)}
                      </td>

                      {/* Previous Month Per Day (Bold Red) */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#990000' }}>
                        {formatNum(r.prev_month_per_day)}
                      </td>

                      {/* MTD Total */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 500, color: '#0F172A' }}>
                        {formatNum(r.mtd_total)}
                      </td>

                      {/* MTD Per Day (Bold Red) */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#990000' }}>
                        {formatNum(r.mtd_per_day)}
                      </td>

                      {/* Previous Week Total */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 500, color: '#0F172A' }}>
                        {formatNum(r.prev_week_total)}
                      </td>

                      {/* Previous Week Per Day (Bold Red) */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#990000' }}>
                        {formatNum(r.prev_week_per_day)}
                      </td>

                      {/* Daily Outputs */}
                      {r.daily_production?.map((val, dIdx) => (
                        <td
                          key={dIdx}
                          style={{
                            border: '1px solid #CBD5E1',
                            padding: '6px 10px',
                            textAlign: 'right',
                            color: val === 0 ? '#64748B' : '#0F172A',
                            fontWeight: val > 0 ? 500 : 400
                          }}
                        >
                          {val !== null ? formatNum(val) : ''}
                        </td>
                      ))}

                      {/* Average (Light Pink highlight, Bold Red text) */}
                      <td style={{ border: '1px solid #CBD5E1', padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#990000', background: '#FECDD3' }}>
                        {formatNum(r.current_week_average)}
                      </td>

                      {/* Previous Week Delta */}
                      <td
                        style={{
                          border: '1px solid #CBD5E1',
                          padding: '6px 10px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: r.prev_week_delta > 0 ? '#059669' : (r.prev_week_delta < 0 ? '#990000' : '#0F172A')
                        }}
                        title={r.prev_week_change_pct !== null ? `${r.prev_week_change_pct > 0 ? '+' : ''}${r.prev_week_change_pct}% change` : ''}
                      >
                        {formatDelta(r.prev_week_delta)}
                      </td>

                      {/* MTD Delta */}
                      <td
                        style={{
                          border: '1px solid #CBD5E1',
                          padding: '6px 10px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: r.mtd_delta > 0 ? '#059669' : (r.mtd_delta < 0 ? '#990000' : '#0F172A')
                        }}
                        title={r.mtd_change_pct !== null ? `${r.mtd_change_pct > 0 ? '+' : ''}${r.mtd_change_pct}% change` : ''}
                      >
                        {formatDelta(r.mtd_delta)}
                      </td>
                    </tr>
                  ))
                )}

                {/* Footer Totals Row */}
                {execTotals && filteredExecRows.length > 0 && (
                  <tr style={{ background: '#E2E8F0', borderTop: '2px solid #94A3B8', borderBottom: '3px double #0F172A', fontWeight: 700 }}>
                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', color: '#0F172A' }}>
                      Total
                    </td>
                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'center', color: '#0F172A' }}>
                      <div style={{ fontWeight: 700 }}>{filteredUniqueMachinesCount} Machines</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>Machine-Specific Starts</div>
                    </td>
                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px' }}></td>

                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#0F172A' }}>
                      {formatNum(execTotals.ptd_total)}
                    </td>
                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#990000' }}>
                      {formatNum(execTotals.ptd_per_day)}
                    </td>

                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#0F172A' }}>
                      {formatNum(execTotals.prev_month_total)}
                    </td>
                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#990000' }}>
                      {formatNum(execTotals.prev_month_per_day)}
                    </td>

                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#0F172A' }}>
                      {formatNum(execTotals.mtd_total)}
                    </td>
                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#990000' }}>
                      {formatNum(execTotals.mtd_per_day)}
                    </td>

                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#0F172A' }}>
                      {formatNum(execTotals.prev_week_total)}
                    </td>
                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#990000' }}>
                      {formatNum(execTotals.prev_week_per_day)}
                    </td>

                    {execTotals.daily_production?.map((val, dIdx) => (
                      <td
                        key={dIdx}
                        style={{
                          border: '1px solid #94A3B8',
                          padding: '8px 10px',
                          textAlign: 'right',
                          color: '#0F172A'
                        }}
                      >
                        {val !== null ? formatNum(val) : ''}
                      </td>
                    ))}

                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#990000', background: '#FECDD3' }}>
                      {formatNum(execTotals.current_week_average)}
                    </td>

                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#0F172A' }}>
                      {formatDelta(execTotals.prev_week_delta)}
                    </td>

                    <td style={{ border: '1px solid #94A3B8', padding: '8px 10px', textAlign: 'right', color: '#0F172A' }}>
                      {formatDelta(execTotals.mtd_delta)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'daily_summary' ? (
        /* TAB 3: DAILY MACHINE SUMMARY (SCREENSHOT 1 EXACT REPLICA) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls & Date Switcher Toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Reporting Date:
                </span>
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: '#059669',
                    color: '#FFFFFF'
                  }}
                >
                  {dmsReportingDate || '18-Oct-2026'}
                </span>
              </div>

              {/* Quick Date Shortcuts */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const t = effective_today || new Date().toISOString().slice(0, 10);
                    setStartDate(t);
                    setEndDate(t);
                    setPage(1);
                  }}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    height: '30px',
                    fontWeight: 600,
                    background: (startDate && startDate === effective_today) ? '#0F2C59' : undefined,
                    color: (startDate && startDate === effective_today) ? '#FFFFFF' : undefined
                  }}
                >
                  Today ({effective_today || 'Latest'})
                </button>
              </div>

              {/* Date Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pick Date:</span>
                <input
                  type="date"
                  className="form-input"
                  value={startDate || dmsReportingDate || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStartDate(val);
                    setEndDate(val);
                    setPage(1);
                  }}
                  style={{ fontSize: '0.8rem', padding: '3px 8px', height: '30px' }}
                />
              </div>
            </div>

            {/* Filter Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search Block or Machine..."
                value={dailySummarySearch}
                onChange={(e) => setDailySummarySearch(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '4px 10px', height: '30px', width: '220px' }}
              />
              {dailySummarySearch && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setDailySummarySearch('')}
                  style={{ fontSize: '0.75rem', padding: '4px 8px', height: '30px' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Screenshot 1 Top KPI Counter Block */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', paddingLeft: '1rem' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                border: '1px solid #7F7F7F',
                fontSize: '0.86rem',
                fontWeight: 700,
                fontFamily: 'Calibri, Arial, sans-serif',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }}
            >
              <tbody>
                <tr>
                  <td
                    style={{
                      background: '#C6EFCE',
                      color: '#006100',
                      padding: '4px 18px',
                      border: '1px solid #7F7F7F',
                      minWidth: '110px'
                    }}
                  >
                    Working
                  </td>
                  <td
                    style={{
                      background: '#FFFFFF',
                      color: '#000000',
                      padding: '4px 18px',
                      border: '1px solid #7F7F7F',
                      textAlign: 'center',
                      minWidth: '55px'
                    }}
                  >
                    {dmsWorkingCount}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      background: '#FF0000',
                      color: '#FFFFFF',
                      padding: '4px 18px',
                      border: '1px solid #7F7F7F',
                      minWidth: '110px'
                    }}
                  >
                    Idle
                  </td>
                  <td
                    style={{
                      background: '#FFFFFF',
                      color: '#000000',
                      padding: '4px 18px',
                      border: '1px solid #7F7F7F',
                      textAlign: 'center',
                      minWidth: '55px'
                    }}
                  >
                    {dmsIdleCount}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Main Operational Table (Matching Screenshot 1) */}
          <div
            className="table-container"
            style={{
              border: '1px solid #7F7F7F',
              borderRadius: '4px',
              overflowX: 'auto',
              background: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'Calibri, Arial, sans-serif',
                fontSize: '0.84rem'
              }}
            >
              <thead>
                <tr style={{ height: '34px' }}>
                  {/* BLOCK */}
                  <th
                    style={{
                      background: '#FFFF00',
                      color: '#000000',
                      fontWeight: 700,
                      border: '1px solid #7F7F7F',
                      padding: '6px 10px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    BLOCK
                  </th>

                  {/* Machine */}
                  <th
                    style={{
                      background: '#FFFF00',
                      color: '#000000',
                      fontWeight: 700,
                      border: '1px solid #7F7F7F',
                      padding: '6px 10px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Machine
                  </th>

                  {/* Machine Status Working /Idle */}
                  <th
                    style={{
                      background: '#FFFF00',
                      color: '#000000',
                      fontWeight: 700,
                      border: '1px solid #7F7F7F',
                      padding: '6px 10px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Machine Status Working /Idle
                  </th>

                  {/* FTD T&D (m) */}
                  <th
                    style={{
                      background: '#00B050',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      border: '1px solid #7F7F7F',
                      padding: '6px 10px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    FTD T&D (m)
                  </th>

                  {/* No. of shots */}
                  <th
                    style={{
                      background: '#00B050',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      border: '1px solid #7F7F7F',
                      padding: '6px 10px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    No. of shots
                  </th>

                  {/* Dynamic Shot 1 to Shot N */}
                  {Array.from({ length: dmsShotColsCount }).map((_, sIdx) => (
                    <th
                      key={sIdx}
                      style={{
                        background: '#FFFF00',
                        color: '#000000',
                        fontWeight: 700,
                        border: '1px solid #7F7F7F',
                        padding: '6px 10px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        minWidth: '65px'
                      }}
                    >
                      Shot {sIdx + 1}
                    </th>
                  ))}

                  {/* Reason Of Idle */}
                  <th
                    style={{
                      background: '#FF0000',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      border: '1px solid #7F7F7F',
                      padding: '6px 12px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      minWidth: '160px'
                    }}
                  >
                    Reason Of Idle
                  </th>

                  {/* Ageing of Idle */}
                  <th
                    style={{
                      background: '#FF0000',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      border: '1px solid #7F7F7F',
                      padding: '6px 12px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      minWidth: '140px'
                    }}
                  >
                    Ageing of Idle
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredDmsRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7 + dmsShotColsCount}
                      style={{
                        textAlign: 'center',
                        padding: '2.5rem 1rem',
                        color: '#64748B',
                        background: '#FFFFFF',
                        border: '1px solid #7F7F7F'
                      }}
                    >
                      No machine records found for the selected date and filters.
                    </td>
                  </tr>
                ) : (
                  filteredDmsRows.map((row, idx) => {
                    const isIdle = (row.machine_status || '').toLowerCase() === 'idle';
                    const meters = Number(row.ftd_meters ?? row.daily_total_meters ?? 0);
                    const shots = Number(row.no_of_shots ?? row.daily_shot_count ?? 0);
                    const shotList = row.shots_list || [];

                    return (
                      <tr key={`${row.chassis_number}_${row.machine}_${idx}`} style={{ height: '26px' }}>
                        {/* BLOCK */}
                        <td
                          style={{
                            background: '#FFFFFF',
                            color: '#000000',
                            border: '1px solid #7F7F7F',
                            padding: '4px 8px',
                            textAlign: 'left'
                          }}
                        >
                          {row.block || '—'}
                        </td>

                        {/* Machine */}
                        <td
                          style={{
                            background: '#FFFFFF',
                            color: '#000000',
                            border: '1px solid #7F7F7F',
                            padding: '4px 8px',
                            textAlign: 'center',
                            fontWeight: 500
                          }}
                        >
                          {row.machine || row.machine_id || '—'}
                        </td>

                        {/* Machine Status Working /Idle */}
                        <td
                          style={{
                            background: isIdle ? '#FFC7CE' : '#C6EFCE',
                            color: isIdle ? '#9C0006' : '#006100',
                            fontWeight: 600,
                            border: '1px solid #7F7F7F',
                            padding: '4px 8px',
                            textAlign: 'center'
                          }}
                        >
                          {row.machine_status}
                        </td>

                        {/* FTD T&D (m) */}
                        <td
                          style={{
                            background: meters === 0 ? '#FFC7CE' : '#C6EFCE',
                            color: meters === 0 ? '#9C0006' : '#006100',
                            fontWeight: meters === 0 ? 500 : 700,
                            border: '1px solid #7F7F7F',
                            padding: '4px 8px',
                            textAlign: 'center'
                          }}
                        >
                          {meters === 0 ? '0' : meters.toLocaleString()}
                        </td>

                        {/* No. of shots */}
                        <td
                          style={{
                            background: shots === 0 ? '#FFC7CE' : '#FFFFFF',
                            color: shots === 0 ? '#9C0006' : '#000000',
                            fontWeight: shots === 0 ? 500 : 600,
                            border: '1px solid #7F7F7F',
                            padding: '4px 8px',
                            textAlign: 'center'
                          }}
                        >
                          {shots}
                        </td>

                        {/* Shot 1 to Shot N */}
                        {Array.from({ length: dmsShotColsCount }).map((_, sIdx) => {
                          const val = shotList[sIdx];
                          return (
                            <td
                              key={sIdx}
                              style={{
                                background: '#FFFFFF',
                                color: '#000000',
                                border: '1px solid #7F7F7F',
                                padding: '4px 8px',
                                textAlign: 'center'
                              }}
                            >
                              {val !== undefined && val !== null ? val : ''}
                            </td>
                          );
                        })}

                        {/* Reason Of Idle */}
                        <td
                          style={{
                            background: '#FFFFFF',
                            color: '#000000',
                            border: '1px solid #7F7F7F',
                            padding: '4px 10px',
                            textAlign: 'left'
                          }}
                        >
                          {row.reason_of_idle || ''}
                        </td>

                        {/* Ageing of Idle */}
                        <td
                          style={{
                            background: '#FFFFFF',
                            color: '#000000',
                            border: '1px solid #7F7F7F',
                            padding: '4px 10px',
                            textAlign: 'left',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {row.ageing_of_idle || ''}
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Bottom Summary Row (Matching Screenshot 1) */}
                {filteredDmsRows.length > 0 && (
                  <tr style={{ height: '30px', fontWeight: 700 }}>
                    <td
                      colSpan={2}
                      style={{
                        background: '#D9E1F2',
                        border: '1px solid #7F7F7F',
                        padding: '4px 8px'
                      }}
                    ></td>

                    {/* Total Machines */}
                    <td
                      style={{
                        background: '#D9E1F2',
                        color: '#000000',
                        border: '1px solid #7F7F7F',
                        textAlign: 'center',
                        padding: '4px 8px'
                      }}
                    >
                      {Number(filteredDmsRows.length).toFixed(1)}
                    </td>

                    {/* Total FTD T&D */}
                    <td
                      style={{
                        background: '#C6EFCE',
                        color: '#006100',
                        border: '1px solid #7F7F7F',
                        textAlign: 'center',
                        padding: '4px 8px'
                      }}
                    >
                      {Number(
                        filteredDmsRows.reduce(
                          (sum, r) => sum + Number(r.ftd_meters ?? r.daily_total_meters ?? 0),
                          0
                        )
                      ).toLocaleString()}
                    </td>

                    {/* Total Shots */}
                    <td
                      style={{
                        background: '#C6EFCE',
                        color: '#006100',
                        border: '1px solid #7F7F7F',
                        textAlign: 'center',
                        padding: '4px 8px'
                      }}
                    >
                      {filteredDmsRows.reduce(
                        (sum, r) => sum + Number(r.no_of_shots ?? r.daily_shot_count ?? 0),
                        0
                      )}
                    </td>

                    {/* Shot columns blanks */}
                    {Array.from({ length: dmsShotColsCount }).map((_, sIdx) => (
                      <td
                        key={sIdx}
                        style={{
                          background: '#D9E1F2',
                          border: '1px solid #7F7F7F',
                          padding: '4px 8px'
                        }}
                      ></td>
                    ))}

                    {/* Reason & Ageing blanks */}
                    <td
                      colSpan={2}
                      style={{
                        background: '#D9E1F2',
                        border: '1px solid #7F7F7F',
                        padding: '4px 8px'
                      }}
                    ></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB 1 & 2: SHOTS TABLE (TODAY'S SHOTS OR ALL SHOTS) */
        <>
          <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto', background: 'var(--bg-card)' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Date</th>
                  <th>Circle</th>
                  <th>District</th>
                  <th>Block</th>
                  <th>Machine ID</th>
                  <th>Machine Name / Model</th>
                  <th>Chassis Number</th>
                  <th>Shot ID</th>
                  <th style={{ textAlign: 'center' }}>Shot Number</th>
                  <th style={{ textAlign: 'center' }}>Start Time</th>
                  <th style={{ textAlign: 'center' }}>End Time</th>
                  <th style={{ textAlign: 'right' }}>Shot Meters</th>
                  <th style={{ textAlign: 'right' }}>Daily Total Meters</th>
                  <th style={{ textAlign: 'center' }}>Daily Shot Count</th>
                  <th>Partner</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {activeTab === 'today' ? "No HDD shot records found for today" : "No HDD shot records found"}
                      </div>
                      <p style={{ margin: '0.25rem 0 0.75rem', fontSize: '0.82rem' }}>
                        {activeTab === 'today'
                          ? "No shots were logged today or they match different filter criteria. View All Historical Shots or select a date range above to view records."
                          : "No records match the current filters. Try adjusting the date range or machine filters."}
                      </p>
                      <button type="button" className="btn-secondary" onClick={handleResetFilters} style={{ fontSize: '0.8rem', margin: '0 auto' }}>
                        Clear Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  results.map((shot, idx) => (
                    <tr key={`${shot.chassis_number}_${shot.shot_id}_${idx}`} style={{ cursor: 'default' }}>
                      {/* Date */}
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {shot.date}
                      </td>

                      {/* Circle */}
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                        <span style={{ fontSize: '0.78rem', background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {shot.circle || '—'}
                        </span>
                      </td>

                      {/* District */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {shot.district || '—'}
                      </td>

                      {/* Block */}
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {shot.block || '—'}
                      </td>

                      {/* Machine ID */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                          {shot.machine_id || '—'}
                        </span>
                      </td>

                      {/* Machine Name/Model */}
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {shot.machine_name}
                      </td>

                      {/* Chassis Number */}
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {shot.chassis_number}
                      </td>

                      {/* Shot ID */}
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                        <span style={{ background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {shot.shot_id}
                        </span>
                      </td>

                      {/* Shot Number */}
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                        #{shot.shot_number}
                      </td>

                      {/* Start Time */}
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {shot.start_time || '—'}
                      </td>

                      {/* End Time */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {shot.is_wip || String(shot.end_time || '').trim().toUpperCase() === 'WIP' ? (
                          <span style={{
                            background: 'rgba(217, 119, 6, 0.12)',
                            color: '#d97706',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            letterSpacing: '0.04em'
                          }}>
                            WIP
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{shot.end_time || '—'}</span>
                        )}
                      </td>

                      {/* Shot Meters */}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                        {Number(shot.shot_meters).toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>m</span>
                      </td>

                      {/* Daily Total Meters */}
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {Number(shot.daily_total_meters).toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>m</span>
                      </td>

                      {/* Daily Shot Count */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, fontSize: '0.75rem' }}>
                          {shot.daily_shot_count}
                        </span>
                      </td>

                      {/* Hero */}
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {shot.vendor_name || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.total_records > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, pagination.total_records)} of {pagination.total_records.toLocaleString()} shots
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '5px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '2px' }}
                >
                  <ChevronLeft size={14} /> Previous
                </button>

                <span style={{ fontSize: '0.8rem', padding: '0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Page {page} of {pagination.total_pages}
                </span>

                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  style={{ padding: '5px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '2px' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default HddShotReport;
