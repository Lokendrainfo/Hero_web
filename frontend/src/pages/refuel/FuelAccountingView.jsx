import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { refuelService } from '../../services/refuelService';
import { SearchableSelect } from '../../components/common/Select';
import {
  LucideRepeat,
  LucideFuel,
  LucideIndianRupee,
  LucideGauge,
  LucideLayers,
  LucideFilter,
  LucideCalendar,
  LucideSearch,
  LucideRefreshCw,
  LucideTruck,
  LucideCheckCircle2,
  LucideAlertCircle,
  LucideChevronDown,
  LucideChevronUp,
  LucideX,
  LucideCheck,
  LucideClock,
  LucideEye,
  LucideFileText,
  LucideAlertTriangle,
  LucideScale,
  LucidePlus,
} from 'lucide-react';

const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.results)) return val.results;
  if (val && Array.isArray(val.data)) return val.data;
  if (val && val.data && Array.isArray(val.data.results)) return val.data.results;
  return [];
};

export const FuelAccountingView = ({
  machines = [],
  selectedMachineId = 'ALL',
  setSelectedMachineId = () => {},
  user = null,
  showToast = () => {},
  onOpenManualSlip = () => {},
}) => {
  // Navigation & Filter states
  const [subnavTab, setSubnavTab] = useState('Fuel Accounting');
  // 'Pending fills' | 'Petro verified' | 'Fuel Accounting' | 'Variance review' | 'Machine variance' | 'Square-off ledger'
  const [fuelSourceFilter, setFuelSourceFilter] = useState('ALL'); // ALL | ABNORMALITIES | MANUAL | PETRO | ARCHIVED | EXTERNAL
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | PENDING | DONE
  const [days, setDays] = useState(90);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Data states
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    fills: 0,
    archived_count: 0,
    total_litres: 0,
    manual_litres: 0,
    petro_litres: 0,
    total_amount_paid: 0,
    count_with_amount: 0,
    total_batches: 0,
    avg_price_per_ltr: 98.4,
  });
  const [analytics, setAnalytics] = useState({
    amount_by_day: [],
    amount_by_machine: [],
  });

  // UI state for expanded multi-fill rows
  const [expandedBatchIds, setExpandedBatchIds] = useState(new Set());

  // Square-off Modal state
  const [showSquareOffModal, setShowSquareOffModal] = useState(false);
  const [targetBatchForSquareOff, setTargetBatchForSquareOff] = useState(null);
  const [squareOffForm, setSquareOffForm] = useState({
    action_type: 'SQUARE_OFF',
    recovery_amount: '',
    gap_litres: 0,
    disposition: '',
    notes: '',
  });
  const [submittingSquareOff, setSubmittingSquareOff] = useState(false);

  // View Details Modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [targetBatchDetails, setTargetBatchDetails] = useState(null);

  // Fetch Live Fuel Accounting Data from Backend API
  const fetchAccountingData = useCallback(() => {
    setLoading(true);
    const params = {
      days,
    };
    if (selectedMachineId && selectedMachineId !== 'ALL') {
      params.machine_id = selectedMachineId;
    }
    if (fuelSourceFilter && fuelSourceFilter !== 'ALL') {
      params.fuel_source = fuelSourceFilter;
    }
    if (statusFilter && statusFilter !== 'ALL') {
      params.status = statusFilter;
    }
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }

    refuelService
      .getFuelAccounting(params)
      .then((res) => {
        const payload = res?.data || res || {};
        const rowList = ensureArray(payload.rows || payload.results || payload.data);
        setRows(rowList);
        if (payload.summary) {
          setSummary(payload.summary);
        }
        if (payload.analytics) {
          setAnalytics({
            amount_by_day: payload.analytics.amount_by_day || [],
            amount_by_machine: payload.analytics.amount_by_machine || [],
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load fuel accounting data:', err);
        showToast('Failed to load live fuel accounting data', 'error');
      })
      .finally(() => setLoading(false));
  }, [days, selectedMachineId, fuelSourceFilter, statusFilter, searchQuery, showToast]);

  useEffect(() => {
    fetchAccountingData();
  }, [fetchAccountingData]);

  // Handle Subnav switching
  const handleSubnavChange = (tabName) => {
    setSubnavTab(tabName);
    if (tabName === 'Pending fills') {
      setStatusFilter('PENDING');
      setFuelSourceFilter('ALL');
    } else if (tabName === 'Petro verified') {
      setFuelSourceFilter('PETRO');
      setStatusFilter('ALL');
    } else if (tabName === 'Variance review') {
      setFuelSourceFilter('ABNORMALITIES');
      setStatusFilter('ALL');
    } else if (tabName === 'Square-off ledger') {
      setStatusFilter('DONE');
      setFuelSourceFilter('ALL');
    } else {
      // Fuel Accounting
      setStatusFilter('ALL');
      setFuelSourceFilter('ALL');
    }
  };

  // Toggle multi-fill drawer
  const toggleExpandBatch = (batchId) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  // Open Square-Off Modal
  const handleOpenSquareOff = (row) => {
    setTargetBatchForSquareOff(row);
    const suggestedRecovery = row.gap_ltr > 0.5 ? Math.round(row.gap_ltr * row.purchase_per_ltr) : 0;
    setSquareOffForm({
      action_type: row.gap_ltr > 0.5 ? 'VENDOR_DEBIT' : 'SQUARE_OFF',
      recovery_amount: String(suggestedRecovery),
      gap_litres: row.gap_ltr,
      disposition: row.disposition || (row.gap_ltr > 0.5 ? 'Vendor Debited for missing volume' : 'Tolerance Approved'),
      notes: row.notes || '',
    });
    setShowSquareOffModal(true);
  };

  // Submit Square-off
  const handleSubmitSquareOff = async (e) => {
    if (e) e.preventDefault();
    if (!targetBatchForSquareOff) return;

    setSubmittingSquareOff(true);
    try {
      await refuelService.squareOff({
        batch_key: targetBatchForSquareOff.batch_id,
        machine_id: targetBatchForSquareOff.machine_id || targetBatchForSquareOff.machine_chassis_no,
        action_type: squareOffForm.action_type,
        recovery_amount: parseFloat(squareOffForm.recovery_amount) || 0.0,
        gap_litres: parseFloat(squareOffForm.gap_litres) || 0.0,
        status: 'DONE',
        disposition: squareOffForm.disposition,
        notes: squareOffForm.notes,
      });
      showToast('✓ Batch squared off successfully!', 'success');
      setShowSquareOffModal(false);
      fetchAccountingData();
    } catch (err) {
      console.error('Square off error:', err);
      showToast('Failed to square off batch', 'error');
    } finally {
      setSubmittingSquareOff(false);
    }
  };

  // SVG Chart Calculations for Amount by Day
  const chartDayData = useMemo(() => {
    const list = analytics.amount_by_day || [];
    if (!list.length) return { points: '', fillPoints: '', maxAmt: 10000, ticks: [] };
    const maxAmt = Math.max(...list.map((d) => d.amount), 30000);
    const w = 560;
    const h = 180;
    const pad = 24;

    const coords = list.map((item, idx) => {
      const x = pad + (idx / Math.max(1, list.length - 1)) * (w - pad * 2);
      const y = h - pad - (item.amount / maxAmt) * (h - pad * 2);
      return { x, y, ...item };
    });

    const points = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const fillPoints = `${pad},${h - pad} ${points} ${coords[coords.length - 1].x},${h - pad}`;

    return { points, fillPoints, coords, maxAmt, width: w, height: h };
  }, [analytics.amount_by_day]);

  // Max amount for Amount by Machine chart
  const maxMachineAmt = useMemo(() => {
    const list = analytics.amount_by_machine || [];
    if (!list.length) return 50000;
    return Math.max(...list.map((m) => m.amount), 50000);
  }, [analytics.amount_by_machine]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Subnav Tabs Bar (Matching Screenshot 1) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        {[
          { label: 'Pending fills' },
          { label: 'Petro verified' },
          { label: 'Fuel Accounting' },
          { label: 'Variance review' },
          { label: 'Machine variance' },
          { label: 'Square-off ledger' },
        ].map((tab) => {
          const isActive = subnavTab === tab.label;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => handleSubnavChange(tab.label)}
              style={{
                padding: '8px 16px',
                fontSize: '0.85rem',
                fontWeight: isActive ? '700' : '600',
                background: isActive ? '#0f172a' : '#f8fafc',
                color: isActive ? '#ffffff' : '#475569',
                border: '1px solid',
                borderColor: isActive ? '#0f172a' : '#cbd5e1',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Top Filter Controls Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Machine Dropdown */}
          <div style={{ minWidth: '220px' }}>
            <SearchableSelect
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                background: '#ffffff',
                fontWeight: '600',
              }}
            >
              <option value="ALL">All machines</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code || m.machine_chassis_no || m.name} ({m.model_name || m.model_code || 'HDD'})
                </option>
              ))}
            </SearchableSelect>
          </div>

          {/* Time Window Dropdown */}
          <div>
            <SearchableSelect
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                background: '#ffffff',
                fontWeight: '600',
              }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last 1 year</option>
            </SearchableSelect>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchAccountingData}
            className="btn btn-outline"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '600',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Source Pills (Matching Screenshot 1) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          {[
            { id: 'ALL', label: 'All' },
            { id: 'ABNORMALITIES', label: 'Abnormalities' },
            { id: 'MANUAL', label: 'Manual' },
            { id: 'PETRO', label: 'Petro' },
            { id: 'ARCHIVED', label: 'Archived' },
            { id: 'EXTERNAL', label: 'External' },
          ].map((pill) => {
            const isPillActive = fuelSourceFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFuelSourceFilter(pill.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: isPillActive ? '700' : '600',
                  background: isPillActive ? '#0f172a' : '#f1f5f9',
                  color: isPillActive ? '#ffffff' : '#475569',
                  border: isPillActive ? '1px solid #0f172a' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 Summary Cards (Section 2 - Matching Screenshot 3) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: FILLS */}
        <div
          className="app-card"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            FILLS
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', lineHeight: 1.1 }}>
            {summary.fills || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>
            {summary.archived_count || 0} archived
          </div>
        </div>

        {/* Card 2: LITRES */}
        <div
          className="app-card"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            LITRES
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', lineHeight: 1.1 }}>
            {(summary.total_litres || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
            L
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>
            Manual {Math.round(summary.manual_litres || 0)} • Petro {Math.round(summary.petro_litres || 0)}
          </div>
        </div>

        {/* Card 3: AMOUNT PAID */}
        <div
          className="app-card"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            AMOUNT PAID
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', lineHeight: 1.1 }}>
            ₹{Math.round(summary.total_amount_paid || 0).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>
            {summary.count_with_amount || 0}/{summary.total_batches || 0} with amount
          </div>
        </div>

        {/* Card 4: AVG ₹/L */}
        <div
          className="app-card"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            AVG ₹/L
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0f172a', lineHeight: 1.1 }}>
            ₹{(summary.avg_price_per_ltr || 98.4).toFixed(1)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>
            Average purchase rate
          </div>
        </div>
      </div>

      {/* Analytics Section (Section 5 - Matching Screenshot 1 & 3) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Chart 1: Amount by Day */}
        <div
          className="app-card"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
            Amount by day
          </div>
          {analytics.amount_by_day && analytics.amount_by_day.length > 0 ? (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                viewBox={`0 0 ${chartDayData.width} ${chartDayData.height}`}
                style={{ width: '100%', height: '190px' }}
              >
                <defs>
                  <linearGradient id="amountDayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-axis Guidelines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const y = 24 + pct * (180 - 48);
                  const amtVal = Math.round(chartDayData.maxAmt * (1 - pct));
                  return (
                    <g key={i}>
                      <line x1="24" y1={y} x2="536" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                      <text x="20" y={y + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
                        {amtVal >= 1000 ? `${Math.round(amtVal / 1000)}k` : amtVal}
                      </text>
                    </g>
                  );
                })}

                {/* Area Fill & Curve */}
                {chartDayData.fillPoints && (
                  <polygon points={chartDayData.fillPoints} fill="url(#amountDayGrad)" />
                )}
                {chartDayData.points && (
                  <polyline
                    fill="none"
                    stroke="#0f766e"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartDayData.points}
                  />
                )}

                {/* Data points */}
                {chartDayData.coords &&
                  chartDayData.coords.map((c, idx) => (
                    <circle key={idx} cx={c.x} cy={c.y} r="2.5" fill="#0f766e">
                      <title>{`${c.date}: ₹${c.amount.toLocaleString()} (${c.litres}L)`}</title>
                    </circle>
                  ))}

                {/* X-axis date labels */}
                {chartDayData.coords &&
                  chartDayData.coords
                    .filter((_, i) => i % Math.ceil(chartDayData.coords.length / 7) === 0 || i === chartDayData.coords.length - 1)
                    .map((c, idx) => (
                      <text key={idx} x={c.x} y={174} fontSize="9" fill="#64748b" textAnchor="middle">
                        {c.date ? c.date.slice(5) : ''}
                      </text>
                    ))}
              </svg>
            </div>
          ) : (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              No spend data in this time window
            </div>
          )}
        </div>

        {/* Chart 2: Amount by Machine */}
        <div
          className="app-card"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
            Amount by machine
          </div>
          {analytics.amount_by_machine && analytics.amount_by_machine.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '190px',
                overflowY: 'auto',
                paddingRight: '6px',
              }}
            >
              {analytics.amount_by_machine.map((m, idx) => {
                const widthPct = Math.min(100, Math.max(8, (m.amount / maxMachineAmt) * 100));
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '110px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        color: '#475569',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${m.chassis} (${m.code})`}
                    >
                      {m.chassis || m.code}
                    </div>
                    <div style={{ flex: 1, background: '#f1f5f9', height: '14px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: '100%',
                          background: '#0f766e',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <div style={{ width: '85px', textAlign: 'right', fontSize: '0.72rem', fontWeight: '700', color: '#0f172a' }}>
                      ₹{Math.round(m.amount).toLocaleString('en-IN')}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              No machine spend data in this time window
            </div>
          )}
        </div>
      </div>

      {/* Filter / Search Bar for Accounting Table */}
      <div
        className="app-card"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '12px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1 }}>
          {/* Search box */}
          <div
            style={{
              position: 'relative',
              minWidth: '260px',
              maxWidth: '380px',
              flex: 1,
            }}
          >
            <LucideSearch
              size={15}
              color="#94a3b8"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search by machine, chassis, batch ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <LucideX size={14} />
              </button>
            )}
          </div>

          {/* Status selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569' }}>Status:</label>
            <SearchableSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                background: '#ffffff',
                fontWeight: '600',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="DONE">Done</option>
            </SearchableSelect>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
            Showing {rows.length} entries
          </span>
          <button
            type="button"
            onClick={onOpenManualSlip}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            <LucidePlus size={15} /> Add Manual Slip
          </button>
        </div>
      </div>

      {/* Fuel Accounting Grouped Table (Section 3 & 4 - Matching Screenshot 2) */}
      <div
        className="app-card"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.83rem',
              textAlign: 'left',
            }}
          >
            {/* Grouped Table Headers (Screenshot 2 Excel Layout) */}
            <thead>
              <tr>
                <th
                  rowSpan="2"
                  style={{
                    background: '#f8fafc',
                    color: '#334155',
                    fontWeight: '800',
                    padding: '12px 14px',
                    borderRight: '1px solid #e2e8f0',
                    borderBottom: '1px solid #cbd5e1',
                    verticalAlign: 'middle',
                    width: '180px',
                  }}
                >
                  M/C
                </th>
                <th
                  colSpan="4"
                  style={{
                    background: '#fef08a',
                    color: '#854d0e',
                    textAlign: 'center',
                    fontWeight: '800',
                    padding: '10px 14px',
                    letterSpacing: '0.04em',
                    borderRight: '1px solid #facc15',
                    borderBottom: '1px solid #facc15',
                    fontSize: '0.82rem',
                  }}
                >
                  FUEL PURCHASE
                </th>
                <th
                  colSpan="3"
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    textAlign: 'center',
                    fontWeight: '800',
                    padding: '10px 14px',
                    letterSpacing: '0.04em',
                    borderRight: '1px solid #7dd3fc',
                    borderBottom: '1px solid #7dd3fc',
                    fontSize: '0.82rem',
                  }}
                >
                  FUEL FILL
                </th>
                <th
                  rowSpan="2"
                  style={{
                    background: '#f8fafc',
                    color: '#334155',
                    fontWeight: '800',
                    padding: '12px 14px',
                    textAlign: 'center',
                    borderRight: '1px solid #e2e8f0',
                    borderBottom: '1px solid #cbd5e1',
                    verticalAlign: 'middle',
                    minWidth: '130px',
                  }}
                >
                  Action
                </th>
                <th
                  rowSpan="2"
                  style={{
                    background: '#f8fafc',
                    color: '#334155',
                    fontWeight: '800',
                    padding: '12px 14px',
                    textAlign: 'right',
                    borderRight: '1px solid #e2e8f0',
                    borderBottom: '1px solid #cbd5e1',
                    verticalAlign: 'middle',
                    minWidth: '110px',
                  }}
                >
                  Recovery
                </th>
                <th
                  rowSpan="2"
                  style={{
                    background: '#f8fafc',
                    color: '#334155',
                    fontWeight: '800',
                    padding: '12px 14px',
                    textAlign: 'center',
                    borderBottom: '1px solid #cbd5e1',
                    verticalAlign: 'middle',
                    minWidth: '100px',
                  }}
                >
                  Status
                </th>
              </tr>
              <tr>
                {/* Sub-columns under FUEL PURCHASE */}
                <th
                  style={{
                    background: '#fef9c3',
                    color: '#713f12',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    padding: '8px 12px',
                    borderBottom: '1px solid #cbd5e1',
                    borderRight: '1px solid #fef08a',
                  }}
                >
                  Date
                </th>
                <th
                  style={{
                    background: '#fef9c3',
                    color: '#713f12',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid #cbd5e1',
                    borderRight: '1px solid #fef08a',
                  }}
                >
                  LTR
                </th>
                <th
                  style={{
                    background: '#fef9c3',
                    color: '#713f12',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid #cbd5e1',
                    borderRight: '1px solid #fef08a',
                  }}
                >
                  Amount
                </th>
                <th
                  style={{
                    background: '#fef9c3',
                    color: '#713f12',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid #cbd5e1',
                    borderRight: '1px solid #cbd5e1',
                  }}
                >
                  Purchase Per LTR
                </th>

                {/* Sub-columns under FUEL FILL */}
                <th
                  style={{
                    background: '#f0f9ff',
                    color: '#075985',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid #cbd5e1',
                    borderRight: '1px solid #e0f2fe',
                  }}
                >
                  LTR
                </th>
                <th
                  style={{
                    background: '#f0f9ff',
                    color: '#075985',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    textAlign: 'center',
                    padding: '8px 12px',
                    borderBottom: '1px solid #cbd5e1',
                    borderRight: '1px solid #e0f2fe',
                  }}
                >
                  Variance
                </th>
                <th
                  style={{
                    background: '#f0f9ff',
                    color: '#075985',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid #cbd5e1',
                    borderRight: '1px solid #cbd5e1',
                  }}
                >
                  Gap
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <LucideRefreshCw size={18} className="animate-spin" /> Loading Fuel Accounting records...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    <LucideFuel size={36} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.95rem' }}>
                      No Fuel Accounting records found
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                      Try selecting another machine, time window, or source filter.
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isExpanded = expandedBatchIds.has(r.batch_id);
                  const isDone = r.status.toUpperCase() === 'DONE';
                  const hasGap = r.gap_ltr > 0.5;

                  return (
                    <React.Fragment key={r.batch_id}>
                      <tr
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9',
                          background: isExpanded ? '#fafafa' : '#ffffff',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* 1. M/C */}
                        <td
                          style={{
                            padding: '12px 14px',
                            borderRight: '1px solid #f1f5f9',
                            verticalAlign: 'middle',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.88rem' }}>
                              {r.machine_code}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {r.machine_chassis_no}
                            </div>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: '700',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: r.fuel_source === 'PETRO' ? '#f3e8ff' : '#f1f5f9',
                                  color: r.fuel_source === 'PETRO' ? '#7e22ce' : '#475569',
                                }}
                              >
                                {r.fuel_source}
                              </span>
                              {r.is_multi_fill && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandBatch(r.batch_id)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    fontSize: '0.65rem',
                                    fontWeight: '700',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: '#dbeafe',
                                    color: '#1d4ed8',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                  title="Click to view linked fills breakdown"
                                >
                                  1 slip · {r.fills_count} fills {isExpanded ? <LucideChevronUp size={11} /> : <LucideChevronDown size={11} />}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* FUEL PURCHASE: Date */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #f1f5f9',
                            fontSize: '0.82rem',
                            color: '#334155',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.date || '—'}
                        </td>

                        {/* FUEL PURCHASE: LTR */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #f1f5f9',
                            fontSize: '0.86rem',
                            fontWeight: '700',
                            color: '#0f172a',
                            textAlign: 'right',
                          }}
                        >
                          {r.purchase_ltr.toFixed(1)} L
                        </td>

                        {/* FUEL PURCHASE: Amount */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #f1f5f9',
                            fontSize: '0.88rem',
                            fontWeight: '800',
                            color: '#0f172a',
                            textAlign: 'right',
                          }}
                        >
                          ₹{r.purchase_amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>

                        {/* FUEL PURCHASE: Purchase Per LTR */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #cbd5e1',
                            fontSize: '0.82rem',
                            color: '#475569',
                            textAlign: 'right',
                          }}
                        >
                          ₹{r.purchase_per_ltr.toFixed(1)}
                        </td>

                        {/* FUEL FILL: LTR */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #f1f5f9',
                            fontSize: '0.86rem',
                            fontWeight: '700',
                            color: '#0284c7',
                            textAlign: 'right',
                          }}
                        >
                          {r.fuel_fill_ltr.toFixed(1)} L
                        </td>

                        {/* FUEL FILL: Variance */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #f1f5f9',
                            textAlign: 'center',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              background: r.variance_ok ? '#ecfdf5' : '#fef2f2',
                              color: r.variance_ok ? '#059669' : '#dc2626',
                            }}
                          >
                            {r.variance_pct.toFixed(1)}%
                          </span>
                        </td>

                        {/* FUEL FILL: Gap */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #cbd5e1',
                            textAlign: 'right',
                            fontWeight: hasGap ? '800' : '600',
                            color: hasGap ? '#dc2626' : '#059669',
                            fontSize: '0.83rem',
                          }}
                        >
                          {r.gap_ltr > 0 ? `+${r.gap_ltr.toFixed(1)} L` : '0.0 L'}
                        </td>

                        {/* Action: Square-off / Debt */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #f1f5f9',
                            textAlign: 'center',
                          }}
                        >
                          {isDone ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                color: '#059669',
                                background: '#ecfdf5',
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              <LucideCheck size={12} /> {r.action || 'Matched'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenSquareOff(r)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                color: '#b45309',
                                background: '#fef3c7',
                                border: '1px solid #fde68a',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <LucideScale size={12} /> Square-off / Debt
                            </button>
                          )}
                        </td>

                        {/* Recovery: 0 / Debit Amount */}
                        <td
                          style={{
                            padding: '12px 12px',
                            borderRight: '1px solid #f1f5f9',
                            textAlign: 'right',
                            fontWeight: '700',
                            fontSize: '0.83rem',
                            color: r.recovery_amount > 0 ? '#b91c1c' : '#475569',
                          }}
                        >
                          {r.recovery_amount > 0 ? (
                            <span
                              style={{
                                background: '#fee2e2',
                                color: '#991b1b',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              ₹{Math.round(r.recovery_amount).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            '₹0'
                          )}
                        </td>

                        {/* Status: Pending / Done */}
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'center',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              background: isDone ? '#dcfce7' : '#fef3c7',
                              color: isDone ? '#15803d' : '#b45309',
                            }}
                          >
                            {isDone ? <LucideCheckCircle2 size={12} /> : <LucideClock size={12} />}
                            {r.status}
                          </span>
                        </td>
                      </tr>

                      {/* Expandable Linked Fills Breakdown (Matching Screenshot 1) */}
                      {isExpanded && (
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan="11" style={{ padding: '12px 18px 16px 28px' }}>
                            <div
                              style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '12px 16px',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  color: '#475569',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  marginBottom: '8px',
                                }}
                              >
                                LINKED SENSOR FILLS IN THIS PURCHASE BATCH ({r.linked_fills.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {r.linked_fills.map((lf) => (
                                  <div
                                    key={lf.id}
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      justifyContent: 'space-between',
                                      fontSize: '0.78rem',
                                      color: '#334155',
                                      padding: '4px 0',
                                      borderBottom: '1px dashed #f1f5f9',
                                    }}
                                  >
                                    <div>
                                      <span style={{ fontWeight: '700', color: '#0f172a' }}>
                                        {lf.index}. {lf.formatted_time}
                                      </span>
                                      <span style={{ marginLeft: '10px', color: '#64748b' }}>
                                        (Sensor Fill #{lf.id})
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                      <span>
                                        Sensor:{' '}
                                        <strong style={{ color: '#0284c7' }}>{lf.sensor_ltr.toFixed(1)} L</strong>
                                      </span>
                                      <span>→</span>
                                      <span>
                                        Slip: <strong>{lf.slip_ltr.toFixed(1)} L</strong>
                                      </span>
                                      <span
                                        style={{
                                          fontSize: '0.7rem',
                                          fontWeight: '700',
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          background: lf.status === 'CONFIRMED' ? '#dcfce7' : '#fef3c7',
                                          color: lf.status === 'CONFIRMED' ? '#166534' : '#854d0e',
                                        }}
                                      >
                                        {lf.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div
                                style={{
                                  marginTop: '10px',
                                  paddingTop: '8px',
                                  borderTop: '1px solid #e2e8f0',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: '0.8rem',
                                  fontWeight: '700',
                                  color: '#0f172a',
                                }}
                              >
                                <span>Batch Total:</span>
                                <span>
                                  Sensor {r.fuel_fill_ltr.toFixed(1)} L → Slip {r.purchase_ltr.toFixed(1)} L • ₹
                                  {r.purchase_amount.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Square-off / Debt Action Modal */}
      {showSquareOffModal && targetBatchForSquareOff && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 22px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideScale size={20} color="#b45309" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                  Square-Off & Debt Resolution
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSquareOffModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <LucideX size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitSquareOff} style={{ padding: '20px 22px' }}>
              <div
                style={{
                  background: '#fefce8',
                  border: '1px solid #fef08a',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '0.8rem',
                  color: '#713f12',
                }}
              >
                <div>
                  Machine: <strong>{targetBatchForSquareOff.machine_code}</strong> ({targetBatchForSquareOff.machine_chassis_no})
                </div>
                <div>
                  Purchase Volume: <strong>{targetBatchForSquareOff.purchase_ltr} L</strong> • Sensor Fill:{' '}
                  <strong>{targetBatchForSquareOff.fuel_fill_ltr} L</strong>
                </div>
                <div>
                  Discrepancy Gap: <strong style={{ color: '#b91c1c' }}>+{targetBatchForSquareOff.gap_ltr} L</strong> • Amount:{' '}
                  <strong>₹{targetBatchForSquareOff.purchase_amount.toLocaleString('en-IN')}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Action Type */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Resolution Action:
                  </label>
                  <SearchableSelect
                    value={squareOffForm.action_type}
                    onChange={(e) => setSquareOffForm({ ...squareOffForm, action_type: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                    }}
                  >
                    <option value="SQUARE_OFF">Square-Off (Normal Tolerance / Approved)</option>
                    <option value="VENDOR_DEBIT">Debit Vendor Account</option>
                    <option value="OPERATOR_RECOVERY">Recover from Field Operator</option>
                    <option value="TOLERANCE_SETTLED">Meter Tolerance Settled</option>
                  </SearchableSelect>
                </div>

                {/* Recovery / Debit Amount */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Recovery / Debit Amount (₹):
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
                        fontWeight: '700',
                      }}
                    >
                      ₹
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={squareOffForm.recovery_amount}
                      onChange={(e) => setSquareOffForm({ ...squareOffForm, recovery_amount: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 28px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        color: '#0f172a',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                    Calculated from Gap ({targetBatchForSquareOff.gap_ltr} L × ₹{targetBatchForSquareOff.purchase_per_ltr}/L)
                  </div>
                </div>

                {/* Disposition */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Disposition Title:
                  </label>
                  <input
                    type="text"
                    value={squareOffForm.disposition}
                    onChange={(e) => setSquareOffForm({ ...squareOffForm, disposition: e.target.value })}
                    placeholder="e.g. Vendor debited on next invoice"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                {/* Notes / Justification */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Audit Notes / Remarks:
                  </label>
                  <textarea
                    rows={2}
                    value={squareOffForm.notes}
                    onChange={(e) => setSquareOffForm({ ...squareOffForm, notes: e.target.value })}
                    placeholder="Enter reconciliation reason, supervisor approval, or slip notes..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      resize: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Audit trail footnote */}
              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#94a3b8',
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <LucideClock size={12} />
                Action performed by {user?.first_name || 'Admin'} will be logged with IST timestamp.
              </div>

              {/* Modal Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '18px',
                  paddingTop: '14px',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowSquareOffModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSquareOff}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#059669',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {submittingSquareOff ? <LucideRefreshCw size={14} className="animate-spin" /> : <LucideCheck size={14} />}
                  Confirm Square-Off
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
