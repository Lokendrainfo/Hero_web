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
  Clock
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

  // Pagination & view states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'all' | 'daily_summary'

  // Data states
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportData, setReportData] = useState({
    results: [],
    today_records: [],
    effective_today: '',
    daily_summary: [],
    pagination: { page: 1, page_size: 25, total_records: 0, total_pages: 1 },
    summary: { total_shots: 0, total_meters: 0, total_machines: 0, today_shots_count: 0, today_meters: 0, today_wip_count: 0, total_wip_count: 0, date_range: {} },
    filter_options: { machines: [], vendors: [], circles: [], districts: [], blocks: [] }
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
          pagination: data.pagination || { page: 1, page_size: pageSize, total_records: 0, total_pages: 1 },
          summary: data.summary || { total_shots: 0, total_meters: 0, total_machines: 0, today_shots_count: 0, today_meters: 0, date_range: {} },
          filter_options: data.filter_options || { machines: [], vendors: [], circles: [], districts: [], blocks: [] }
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
      setActiveTab('today');
      setStartDate('');
      setEndDate('');
      setPage(1);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(today.getDate() - 1);
      const yStr = toYMD(y);
      setStartDate(yStr);
      setEndDate(yStr);
      setActiveTab('all');
      setPage(1);
    } else if (preset === 'last7') {
      const d7 = new Date();
      d7.setDate(today.getDate() - 6);
      setStartDate(toYMD(d7));
      setEndDate(toYMD(today));
      setActiveTab('all');
      setPage(1);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      setActiveTab('all');
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
      if ((todayOnly && !startDate && !endDate) || (activeTab === 'today' && !startDate && !endDate)) {
        params.today_only = 'true';
      }

      const res = await reportService.exportHddShotReportExcel(params);
      const blob = res instanceof Blob ? res : new Blob([res], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateTag = new Date().toISOString().slice(0, 10);
      const typeTag = (todayOnly || (activeTab === 'today' && !startDate && !endDate)) ? '_Today_Report' : '_All_Sheets';
      const chassisTag = chassisNumber.trim() ? `_${chassisNumber.trim()}` : '';
      link.setAttribute('download', `Hero_HDD_Report${typeTag}${chassisTag}_${dateTag}.xlsx`);
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

  const { results, daily_summary, pagination, summary, filter_options, effective_today } = reportData;

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

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '150px', flex: '1 1 150px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Hero</label>
          <select
            className="form-input"
            value={vendorId}
            onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
            style={{ fontSize: '0.82rem', padding: '6px 10px', height: '36px' }}
          >
            <option value="">All Hero</option>
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

      {/* Tabs: Today's Report | All Shots | Daily Summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
            Machine Daily Summary ({daily_summary.length})
          </button>
        </div>

        {/* Page Size Selector */}
        {activeTab !== 'daily_summary' && (
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
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading HDD shot telemetry...</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Aggregating shot-wise, machine-wise, and circle/district/block metres.</div>
        </div>
      ) : activeTab === 'daily_summary' ? (
        /* TAB 3: DAILY SUMMARY TABLE */
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
                <th>Hero</th>
                <th style={{ textAlign: 'center' }}>Daily Shot Count</th>
                <th style={{ textAlign: 'right' }}>Daily Total Meters</th>
              </tr>
            </thead>
            <tbody>
              {daily_summary.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                    No daily summary records found.
                  </td>
                </tr>
              ) : (
                daily_summary.map((row, idx) => (
                  <tr key={`${row.chassis_number}_${row.date}_${idx}`} style={{ cursor: 'default' }}>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.date}
                    </td>
                    <td style={{ fontWeight: 500 }}>{row.circle || '—'}</td>
                    <td>{row.district || '—'}</td>
                    <td>{row.block || '—'}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                        {row.machine_id || '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{row.machine_name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.chassis_number}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.vendor_name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, fontSize: '0.75rem' }}>
                        {row.daily_shot_count} shots
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                      {Number(row.daily_total_meters).toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>m</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
                  <th>Hero</th>
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
