import React, { useEffect, useState, useMemo } from 'react';
import { refuelService } from '../../services/refuelService';
import { machineService } from '../../services/machineService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import {
  LucideRepeat,
  LucideTruck,
  LucidePlus,
  LucideRefreshCw,
  LucideCalendar,
  LucideSearch,
  LucideFilter,
  LucideIndianRupee,
  LucideClock,
  LucideUser,
  LucideGauge,
  LucideFuel,
  LucideX,
  LucideCheckCircle2,
  LucideFileText
} from 'lucide-react';
import '../../styles/components.css';
import { SearchableSelect } from '../../components/common/Select';

const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.results)) return val.results;
  if (val && Array.isArray(val.data)) return val.data;
  if (val && val.data && Array.isArray(val.data.results)) return val.data.results;
  return [];
};

export const Refuel = () => {
  const auth = useAuth();
  const selectedVendorId = auth?.selectedVendorId;

  const toastContext = useToast();
  const showToast = typeof toastContext?.showToast === 'function' ? toastContext.showToast : () => {};

  const [activeTab, setActiveTab] = useState('Fuel Logs'); // Fuel Logs (sensor) | Refuel Log (manual)
  const [refuelEntries, setRefuelEntries] = useState([]);
  const [sensorLogs, setSensorLogs] = useState([]);
  const [sensorMeta, setSensorMeta] = useState({ pending_ack_count: 0, total_litres: 0, total: 0 });
  const [sensorStatus, setSensorStatus] = useState('ALL'); // ALL | PENDING | CONFIRMED | DENIED
  const [sensorDays, setSensorDays] = useState(30);
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // New Refuel Entry Modal state
  const [showModal, setShowModal] = useState(false);
  const [targetMachineId, setTargetMachineId] = useState('');
  const [quantity, setQuantity] = useState('50');
  const [pricePerLiter, setPricePerLiter] = useState('95.00');
  const [meterReading, setMeterReading] = useState('100.0');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchMachinesList = React.useCallback(() => {
    const params = {};
    if (selectedVendorId && selectedVendorId !== 'all') {
      params.vendor_id = selectedVendorId;
    }
    machineService.getAll(params)
      .then(res => {
        const list = ensureArray(res);
        setMachines(list);
        if (list.length > 0 && !targetMachineId) {
          setTargetMachineId(String(list[0].id));
        }
      })
      .catch(console.error);
  }, [selectedVendorId, targetMachineId]);

  const fetchRefuels = React.useCallback(() => {
    setLoading(true);
    const params = {};
    if (selectedVendorId && selectedVendorId !== 'all') {
      params.vendor_id = selectedVendorId;
    }
    if (selectedMachineId && selectedMachineId !== 'ALL') {
      params.machine_id = selectedMachineId;
    }

    refuelService.getAll(params)
      .then(res => {
        const list = ensureArray(res);
        setRefuelEntries(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedVendorId, selectedMachineId]);

  const fetchSensorLogs = React.useCallback(() => {
    setLoading(true);
    const params = {
      days: sensorDays,
      page: 1,
      page_size: 200,
    };
    if (selectedVendorId && selectedVendorId !== 'all') {
      params.vendor_id = selectedVendorId;
    }
    if (selectedMachineId && selectedMachineId !== 'ALL') {
      params.machine_id = selectedMachineId;
    }
    if (sensorStatus && sensorStatus !== 'ALL') {
      params.status = sensorStatus;
    }

    refuelService.getSensorLogs(params)
      .then((res) => {
        const payload = res?.data || res || {};
        const list = Array.isArray(payload.results)
          ? payload.results
          : (Array.isArray(payload.data) ? payload.data : ensureArray(payload));
        setSensorLogs(list);
        setSensorMeta({
          pending_ack_count: payload.pending_ack_count ?? list.filter((r) => (r.status || '').toUpperCase() === 'PENDING').length,
          total_litres: payload.total_litres ?? list.reduce((a, r) => a + (parseFloat(r.litres || r.quantity_liters) || 0), 0),
          total: payload.total ?? list.length,
          variance_threshold_pct: payload.variance_threshold_pct ?? 3,
        });
      })
      .catch((err) => {
        console.error(err);
        setSensorLogs([]);
        showToast('Failed to load sensor fuel logs from FiberForce', 'error');
      })
      .finally(() => setLoading(false));
  }, [selectedVendorId, selectedMachineId, sensorStatus, sensorDays, showToast]);

  useEffect(() => {
    fetchMachinesList();
  }, [fetchMachinesList]);

  useEffect(() => {
    if (activeTab === 'Fuel Logs') {
      fetchSensorLogs();
      const interval = setInterval(fetchSensorLogs, 15000);
      return () => clearInterval(interval);
    }
    fetchRefuels();
    const interval = setInterval(fetchRefuels, 10000);
    return () => clearInterval(interval);
  }, [activeTab, fetchRefuels, fetchSensorLogs]);

  const handleCreateRefuel = async (e) => {
    if (e) e.preventDefault();
    if (!targetMachineId) {
      showToast('Please select a target machine', 'error');
      return;
    }

    const qtyNum = parseFloat(quantity) || 0;
    const priceNum = parseFloat(pricePerLiter) || 95.0;

    if (qtyNum <= 0) {
      showToast('Please enter a valid fuel quantity', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await refuelService.create({
        machine: targetMachineId,
        quantity_liters: qtyNum,
        price_per_liter: priceNum,
        total_cost: qtyNum * priceNum,
        meter_reading: parseFloat(meterReading) || 0,
        notes: notes
      });
      showToast('✓ Refuel entry recorded successfully!', 'success');
      setShowModal(false);
      setNotes('');
      fetchRefuels();
    } catch (err) {
      console.error("Error creating refuel:", err);
      showToast('Refuel entry failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const machineListSafe = useMemo(() => ensureArray(machines), [machines]);
  const refuelEntriesSafe = useMemo(() => ensureArray(refuelEntries), [refuelEntries]);
  const sensorLogsSafe = useMemo(() => ensureArray(sensorLogs), [sensorLogs]);

  // Client-side search filtering
  const filteredRefuelEntries = useMemo(() => {
    if (!searchQuery.trim()) return refuelEntriesSafe;
    const q = searchQuery.toLowerCase();
    return refuelEntriesSafe.filter(r => {
      const code = String(r.machine_code || r.machine_no || r.machine_name || r.machine || '').toLowerCase();
      const perf = String(r.performed_by_name || '').toLowerCase();
      const n = String(r.notes || '').toLowerCase();
      return code.includes(q) || perf.includes(q) || n.includes(q);
    });
  }, [refuelEntriesSafe, searchQuery]);

  const filteredSensorLogs = useMemo(() => {
    if (!searchQuery.trim()) return sensorLogsSafe;
    const q = searchQuery.toLowerCase();
    return sensorLogsSafe.filter((r) => {
      const hay = [
        r.machine_chassis_no, r.machine_code, r.machine_name, r.machine_model,
        r.status, r.verify_source, r.confirm_batch_id, r.deny_reason,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [sensorLogsSafe, searchQuery]);

  const isFuelLogsTab = activeTab === 'Fuel Logs';
  const displayRows = isFuelLogsTab ? filteredSensorLogs : filteredRefuelEntries;

  const totalAddedLiters = useMemo(() => {
    if (isFuelLogsTab) {
      return filteredSensorLogs.reduce((acc, r) => acc + (parseFloat(r.litres ?? r.quantity_liters) || 0), 0);
    }
    return filteredRefuelEntries.reduce((acc, r) => acc + (parseFloat(r.quantity_liters) || 0), 0);
  }, [isFuelLogsTab, filteredSensorLogs, filteredRefuelEntries]);

  const totalCost = useMemo(() => {
    if (isFuelLogsTab) {
      return filteredSensorLogs.reduce((acc, r) => acc + (parseFloat(r.amount_paid ?? r.total_cost) || 0), 0);
    }
    return filteredRefuelEntries.reduce((acc, r) => acc + (parseFloat(r.total_cost) || 0), 0);
  }, [isFuelLogsTab, filteredSensorLogs, filteredRefuelEntries]);

  const avgPricePerLiter = useMemo(() => {
    if (totalAddedLiters <= 0) return 95.0;
    return totalCost / totalAddedLiters;
  }, [totalCost, totalAddedLiters]);

  const pendingCount = useMemo(() => {
    if (isFuelLogsTab) return sensorMeta.pending_ack_count ?? filteredSensorLogs.filter((r) => (r.status || '').toUpperCase() === 'PENDING').length;
    return 0;
  }, [isFuelLogsTab, sensorMeta, filteredSensorLogs]);

  const statusBadge = (st) => {
    const s = (st || '').toUpperCase();
    if (s === 'CONFIRMED') return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
    if (s === 'DENIED') return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }; // PENDING
  };

  const formatWhen = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch {
      return String(iso);
    }
  };

  const calculatedModalTotal = useMemo(() => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(pricePerLiter) || 95.0;
    return q * p;
  }, [quantity, pricePerLiter]);

  const refreshActive = () => {
    if (isFuelLogsTab) fetchSensorLogs();
    else fetchRefuels();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--live)' }}>
              <LucideFuel size={18} />
            </div>
            <h2 style={{ fontSize: '1.35rem', fontFamily: 'inherit', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Refuel Records & Diesel Logs
            </h2>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px', margin: 0 }}>
            {isFuelLogsTab
              ? 'Sensor-detected tank fills from FiberForce (occurred_at timestamps)'
              : 'Manual field refuel entries logged in HERO'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={refreshActive}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: '600',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'none',
              cursor: 'pointer'
            }}
          >
            <LucideRefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {!isFuelLogsTab && (
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary"
              style={{
                padding: '9px 18px',
                fontSize: '0.85rem',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: 'none'
              }}
            >
              <LucidePlus size={18} /> Add Refuel Record
            </button>
          )}
        </div>
      </div>

      <div className="filter-row">
        {[
          { label: 'Fuel Logs', count: sensorMeta.total || sensorLogsSafe.length },
          { label: 'Refuel Log', count: refuelEntriesSafe.length },
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            className={`filter-chip ${activeTab === tab.label ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.label)}
          >
            {tab.label} {tab.count}
          </button>
        ))}
      </div>

      {/* Modern KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        {/* Metric 1 */}
        <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideRepeat size={22} color="#059669" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isFuelLogsTab ? 'Sensor Fills' : 'Refuel Entries'}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {displayRows.length}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '600', marginTop: '2px' }}>
              {isFuelLogsTab ? `${pendingCount} pending ack` : 'Logged logs in system'}
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideFuel size={22} color="#2563eb" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fuel Added
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#2563eb', lineHeight: 1.2, marginTop: '2px' }}>
              {totalAddedLiters.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
            </div>
            <div style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: '600', marginTop: '2px' }}>
              Diesel volume delivered
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideIndianRupee size={22} color="#7c3aed" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Refuel Spend
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#7c3aed', lineHeight: 1.2, marginTop: '2px' }}>
              ₹{totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: '600', marginTop: '2px' }}>
              Total field refuel cost
            </div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideGauge size={22} color="#d97706" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Avg Diesel Rate
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#d97706', lineHeight: 1.2, marginTop: '2px' }}>
              ₹{avgPricePerLiter.toFixed(2)} / L
            </div>
            <div style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: '600', marginTop: '2px' }}>
              Average field fuel rate
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="app-card" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1 }}>
          
          {/* Machine Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '240px' }}>
            <LucideTruck size={16} color="#0284c7" />
            <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>Machine:</label>
            <SearchableSelect
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                background: '#ffffff',
                color: '#0f172a',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Fleet Machines ({machineListSafe.length})</option>
              {machineListSafe.map(m => (
                <option key={m.id} value={m.id}>
                  {m.machine_chassis_no || m.code || m.name || `Machine #${m.id}`} ({m.model_name || m.model_code || 'HDD Rig'})
                </option>
              ))}
            </SearchableSelect>
          </div>

          {isFuelLogsTab && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideFilter size={15} color="#64748b" />
                <SearchableSelect
                  value={sensorStatus}
                  onChange={(e) => setSensorStatus(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    background: '#ffffff',
                    fontWeight: '600',
                    outline: 'none',
                  }}
                >
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="DENIED">DENIED</option>
                </SearchableSelect>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideCalendar size={15} color="#64748b" />
                <SearchableSelect
                  value={sensorDays}
                  onChange={(e) => setSensorDays(Number(e.target.value))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    background: '#ffffff',
                    fontWeight: '600',
                    outline: 'none',
                  }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={365}>Last 365 days</option>
                </SearchableSelect>
              </div>
            </>
          )}

          {/* Client-side Search Input */}
          <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
            <LucideSearch size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by machine code, operator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Reset button */}
          {(selectedMachineId !== 'ALL' || searchQuery) && (
            <button
              onClick={() => { setSelectedMachineId('ALL'); setSearchQuery(''); }}
              style={{
                padding: '7px 12px',
                fontSize: '0.78rem',
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <LucideX size={14} /> Clear Filters
            </button>
          )}
        </div>

        {/* Counter Tag */}
        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>
          Showing <strong style={{ color: '#0f172a' }}>{displayRows.length}</strong> entries
        </div>
      </div>

      {/* Data Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            {isFuelLogsTab ? (
              <tr>
                <th style={{ paddingLeft: '20px' }}>Machine / Chassis</th>
                <th>Occurred At</th>
                <th>Sensor Litres</th>
                <th>Level Before → After</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Verify / Slip</th>
                <th>Variance</th>
              </tr>
            ) : (
              <tr>
                <th style={{ paddingLeft: '20px' }}>Machine & Model</th>
                <th>Fuel Added</th>
                <th>Meter Reading</th>
                <th>Price / Liter</th>
                <th>Total Cost</th>
                <th>Refuel Date</th>
                <th>Performed By</th>
                <th>Remarks / Site</th>
              </tr>
            )}
          </thead>
          <tbody>
            {isFuelLogsTab ? (
              <>
                {filteredSensorLogs.map((r) => {
                  const badge = statusBadge(r.status);
                  return (
                    <tr key={r.id || `${r.machine_chassis_no}-${r.occurred_at}`}>
                      <td style={{ paddingLeft: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                            <LucideTruck size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.88rem' }}>
                              {r.machine_name || r.machine_code || 'Machine'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                                {r.machine_chassis_no || '—'}
                              </code>
                              {r.machine_model ? ` · ${r.machine_model}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: '#475569' }}>
                          <LucideCalendar size={13} color="#94a3b8" />
                          {formatWhen(r.occurred_at || r.refuel_date)}
                        </div>
                        {r.date && (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{r.date}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge-pill badge-green" style={{ fontSize: '0.82rem', fontWeight: '700' }}>
                          <LucideFuel size={13} />
                            +{parseFloat(r.litres ?? r.quantity_liters ?? 0).toFixed(1)} L
                        </span>
                        {r.acknowledged_litres != null && Number(r.acknowledged_litres) !== Number(r.litres) && (
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                            Ack: {parseFloat(r.acknowledged_litres).toFixed(1)} L
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                          {r.level_before_l != null ? `${parseFloat(r.level_before_l).toFixed(1)} L` : '—'}
                          {' → '}
                          {r.level_after_l != null ? `${parseFloat(r.level_after_l).toFixed(1)} L` : '—'}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#047857' }}>
                          {r.amount_paid != null && Number(r.amount_paid) > 0
                            ? `₹${parseFloat(r.amount_paid).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                            : '—'}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}>
                          {r.status || 'PENDING'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                          {r.verify_source || 'Sensor'}
                        </div>
                        {r.confirm_batch_id && (
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
                            batch {String(r.confirm_batch_id).slice(0, 8)}…
                          </div>
                        )}
                        {r.slip_image_url && (
                          <a
                            href={r.slip_image_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 600 }}
                          >
                            View slip
                          </a>
                        )}
                      </td>
                      <td>
                        {r.is_abnormality || r.variance_pct != null ? (
                          <div style={{ fontSize: '0.78rem' }}>
                            <span style={{ color: r.variance_ok === false ? '#b91c1c' : '#047857', fontWeight: 700 }}>
                              {r.variance_pct != null ? `${r.variance_pct}%` : '—'}
                            </span>
                            {r.variance_disposition && (
                              <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{r.variance_disposition}</div>
                            )}
                            {r.needs_variance_ack && (
                              <div style={{ color: '#b45309', fontSize: '0.7rem', fontWeight: 600 }}>Needs review</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>
                        )}
                        {r.deny_reason && (
                          <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: 2 }}>{r.deny_reason}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredSensorLogs.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <LucideFuel size={36} color="#cbd5e1" />
                        <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#334155' }}>
                          {loading ? 'Fetching sensor fuel logs…' : 'No sensor refuel fills found'}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, maxWidth: '360px' }}>
                          Try another machine, status, or look-back window. PENDING fills are ready for slip mapping.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ) : (
              <>
                {filteredRefuelEntries.map(r => (
                  <tr key={r.id}>
                    <td style={{ paddingLeft: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                          <LucideTruck size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.88rem' }}>
                            {r.machine_code || r.machine_no || r.machine_name || `Machine #${r.machine}`}
                          </div>
                          {r.machine_model && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {r.machine_model}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="badge-pill badge-green" style={{ fontSize: '0.82rem', fontWeight: '700' }}>
                        <LucideFuel size={13} />
                        +{parseFloat(r.quantity_liters || 0).toFixed(1)} L
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#334155', fontWeight: '600', fontSize: '0.83rem' }}>
                        <LucideClock size={14} color="#64748b" />
                        {r.meter_reading ? `${parseFloat(r.meter_reading).toFixed(1)} hrs` : 'N/A'}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.83rem', color: '#475569' }}>
                        ₹{parseFloat(r.price_per_liter || 95.0).toFixed(2)} / L
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#047857' }}>
                        ₹{parseFloat(r.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: '#475569' }}>
                        <LucideCalendar size={13} color="#94a3b8" />
                        {r.refuel_date ? new Date(r.refuel_date).toLocaleDateString() : 'Today'}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: '700', color: '#475569' }}>
                          <LucideUser size={13} />
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#1e293b' }}>
                          {r.performed_by_name || 'Field Operator'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: r.notes ? 'normal' : 'italic' }}>
                        {r.notes || '—'}
                      </span>
                    </td>
                  </tr>
                ))}

                {filteredRefuelEntries.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <LucideFuel size={36} color="#cbd5e1" />
                        <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#334155' }}>
                          {loading ? 'Fetching refuel records...' : 'No refuel log entries match your filter criteria'}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, maxWidth: '360px' }}>
                          Try selecting a different machine filter or search term, or create a new refuel log entry.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Styled Add Refuel Record Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '18px 22px', background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LucideFuel size={20} color="var(--live)" />
                <h3 style={{ fontSize: '1.05rem', fontFamily: 'inherit', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  Record Machine Refueling
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <LucideX size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateRefuel} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Target Machine / HDD Rig <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <SearchableSelect
                  value={targetMachineId}
                  onChange={(e) => setTargetMachineId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontWeight: '600'
                  }}
                >
                  {machineListSafe.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.code || m.name || `Machine #${m.id}`} ({m.model_name || m.model_code || 'HDD Rig'})
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Quantity (Liters) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontWeight: '600'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Rate (₹ / Liter)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={pricePerLiter}
                    onChange={(e) => setPricePerLiter(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontWeight: '600'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Engine Hour Meter (hrs) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={meterReading}
                  onChange={(e) => setMeterReading(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontWeight: '600'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Remarks / Location Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Filled at Sujangarh Trenching Site"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Calculated Total Card */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#166534' }}>Estimated Total Cost:</span>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#047857' }}>
                  ₹{calculatedModalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                  style={{
                    flex: 1.5,
                    padding: '11px',
                    borderRadius: '10px',
                    fontSize: '0.85rem'
                  }}
                >
                  {submitting ? 'Saving...' : 'Save Refuel Log Entry'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Refuel;
