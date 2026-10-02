import React, { useEffect, useState, useMemo } from 'react';
import { refuelService } from '../../services/refuelService';
import { machineService } from '../../services/machineService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { FuelAccountingView } from './FuelAccountingView';
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
  LucideFileText,
  LucideUpload,
  LucideAlertCircle,
  LucideInfo,
  LucideTrash2,
  LucideCheck,
  LucidePhone
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

  const [activeTab, setActiveTab] = useState('Fuel Accounting'); // Fuel Accounting | Fuel Logs (sensor) | Refuel Log (manual)
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

  // Selection state for PENDING sensor fills
  const [selectedPendingIds, setSelectedPendingIds] = useState([]);

  // Confirmation Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTargetFills, setConfirmTargetFills] = useState([]);
  const [confirmFormData, setConfirmFormData] = useState({
    litres: '',
    amount_paid: '',
    mobile: '',
    note: '',
    variance_disposition: ''
  });
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [confirmSuccessData, setConfirmSuccessData] = useState(null);

  // Manual Slip Modal state (HDD / FiberForce)
  const [showManualSlipModal, setShowManualSlipModal] = useState(false);
  const [manualMachineId, setManualMachineId] = useState('');
  const [manualDate, setManualDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  });
  const [manualLitres, setManualLitres] = useState('50.0');
  const [manualPricePerLiter, setManualPricePerLiter] = useState('95.00');
  const [manualTotalCost, setManualTotalCost] = useState('4750');
  const [manualMeterReading, setManualMeterReading] = useState('');
  const [manualMobile, setManualMobile] = useState('');
  const [manualPumpName, setManualPumpName] = useState('');
  const [manualSlipNo, setManualSlipNo] = useState('');
  const [manualVarianceDisp, setManualVarianceDisp] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualSlipFile, setManualSlipFile] = useState(null);
  const [manualSlipPreviewUrl, setManualSlipPreviewUrl] = useState(null);
  const [manualSelectedTrackerIds, setManualSelectedTrackerIds] = useState([]);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [manualSuccessData, setManualSuccessData] = useState(null);

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

  const pendingFills = useMemo(() => {
    return filteredSensorLogs.filter(r => (r.status || '').toUpperCase() === 'PENDING');
  }, [filteredSensorLogs]);

  const selectedFillsSummary = useMemo(() => {
    const selected = sensorLogsSafe.filter(r => selectedPendingIds.includes(r.id));
    const totalLitres = selected.reduce((acc, r) => acc + (parseFloat(r.litres ?? r.quantity_liters) || 0), 0);
    const machineName = selected[0]?.machine_name || selected[0]?.machine_code || selected[0]?.machine_chassis_no || 'Machine';
    return { count: selected.length, totalLitres, machineName, items: selected };
  }, [sensorLogsSafe, selectedPendingIds]);

  const handleToggleSelect = (fill) => {
    const id = fill.id;
    if (selectedPendingIds.includes(id)) {
      setSelectedPendingIds(prev => prev.filter(x => x !== id));
      return;
    }

    if (selectedPendingIds.length > 0) {
      const alreadySelected = sensorLogsSafe.find(r => selectedPendingIds.includes(r.id));
      if (alreadySelected && alreadySelected.machine_chassis_no && fill.machine_chassis_no &&
          alreadySelected.machine_chassis_no !== fill.machine_chassis_no) {
        showToast('HDD Fiber requires all selected fills in a single confirmation to belong to the same machine rig.', 'error');
        return;
      }
    }

    setSelectedPendingIds(prev => [...prev, id]);
  };

  const handleSelectAllPending = () => {
    if (selectedPendingIds.length > 0) {
      setSelectedPendingIds([]);
      return;
    }
    if (pendingFills.length === 0) return;

    const firstMachineChassis = pendingFills[0]?.machine_chassis_no;
    const sameMachineFills = pendingFills.filter(r => r.machine_chassis_no === firstMachineChassis);
    setSelectedPendingIds(sameMachineFills.map(r => r.id));
    if (sameMachineFills.length < pendingFills.length) {
      showToast(`Selected ${sameMachineFills.length} fills for machine ${firstMachineChassis}. (HDD Fiber requires same-machine batching)`, 'info');
    }
  };

  const openConfirmModalForFills = (fills) => {
    if (!fills || fills.length === 0) return;
    const totalSensorL = fills.reduce((acc, r) => acc + (parseFloat(r.litres ?? r.quantity_liters) || 0), 0);
    const estAmount = Math.round(totalSensorL * 95);
    const userPhone = auth?.user?.phone_number || auth?.user?.mobile || auth?.user?.phone || '';

    setConfirmTargetFills(fills);
    setConfirmFormData({
      litres: totalSensorL > 0 ? String(totalSensorL.toFixed(1)) : '',
      amount_paid: estAmount > 0 ? String(estAmount) : '',
      mobile: userPhone,
      note: '',
      variance_disposition: ''
    });
    setSlipFile(null);
    setSlipPreviewUrl(null);
    setConfirmError(null);
    setConfirmSuccessData(null);
    setShowConfirmModal(true);
  };

  const handleAcknowledgeSelected = () => {
    const fills = sensorLogsSafe.filter(r => selectedPendingIds.includes(r.id));
    if (fills.length === 0) {
      showToast('Please select at least one pending sensor fill to confirm.', 'error');
      return;
    }
    openConfirmModalForFills(fills);
  };

  const handleAcknowledgeSingle = (fill) => {
    openConfirmModalForFills([fill]);
  };

  const handleConfirmSubmit = async (e) => {
    if (e) e.preventDefault();
    setConfirmError(null);

    const litresNum = parseFloat(confirmFormData.litres);
    if (isNaN(litresNum) || litresNum < 0) {
      setConfirmError('Please enter a valid Total Litres amount (>= 0).');
      return;
    }

    if (!confirmFormData.mobile || !confirmFormData.mobile.trim()) {
      setConfirmError('Mobile number is mandatory for HDD Fiber confirmation.');
      return;
    }

    setConfirming(true);
    try {
      const fd = new FormData();
      confirmTargetFills.forEach(f => {
        fd.append('refuel_tracker_ids', String(f.id));
      });
      fd.append('litres', String(litresNum));
      if (confirmFormData.amount_paid) {
        fd.append('amount_paid', String(confirmFormData.amount_paid));
      }
      fd.append('mobile', confirmFormData.mobile.trim());
      if (confirmFormData.note) {
        fd.append('note', confirmFormData.note.trim());
      }
      if (confirmFormData.variance_disposition) {
        fd.append('variance_disposition', confirmFormData.variance_disposition);
      }
      if (slipFile) {
        fd.append('slip', slipFile);
      }

      const res = await refuelService.confirmSensor(fd);
      const resData = res?.data || res || {};
      showToast('✓ Refuel confirmed successfully with HDD Fiber!', 'success');
      setConfirmSuccessData(resData);
      
      setSelectedPendingIds([]);
      fetchSensorLogs();
    } catch (err) {
      console.error("Refuel confirmation failed:", err);
      const msg = err?.data?.message || err?.message || err?.error || 'Failed to confirm refuel with HDD Fiber.';
      setConfirmError(typeof msg === 'object' ? JSON.stringify(msg) : msg);
      showToast('HDD Fiber Refuel confirmation failed', 'error');
    } finally {
      setConfirming(false);
    }
  };

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

  const currentMachinePendingFills = useMemo(() => {
    if (!manualMachineId) return [];
    const selMachine = machineListSafe.find(m => String(m.id) === String(manualMachineId));
    if (!selMachine) return [];
    const chassis = (selMachine.machine_chassis_no || selMachine.code || '').toLowerCase().trim();
    if (!chassis) return [];
    return sensorLogsSafe.filter(r => {
      const matchChassis = String(r.machine_chassis_no || r.machine_code || '').toLowerCase().trim() === chassis;
      const isPending = (r.status || '').toUpperCase() === 'PENDING';
      return matchChassis && isPending;
    });
  }, [manualMachineId, machineListSafe, sensorLogsSafe]);

  const openManualSlipModal = (preselectedMachineId = null) => {
    const list = ensureArray(machines);
    const targetId = preselectedMachineId || (list.length > 0 ? String(list[0].id) : '');
    setManualMachineId(targetId);
    const selMachine = list.find(m => String(m.id) === String(targetId));
    setManualMeterReading(selMachine?.current_hours ? String(selMachine.current_hours) : '0.0');
    setManualMobile(auth?.user?.phone_number || auth?.user?.mobile || auth?.user?.phone || '');
    setManualLitres('50.0');
    setManualPricePerLiter('95.00');
    setManualTotalCost('4750');
    setManualPumpName('');
    setManualSlipNo('');
    setManualNotes('');
    setManualVarianceDisp('');
    setManualSlipFile(null);
    setManualSlipPreviewUrl(null);
    setManualSelectedTrackerIds([]);
    setManualError(null);
    setManualSuccessData(null);
    setShowManualSlipModal(true);
  };

  const handleManualMachineSelect = (mId) => {
    setManualMachineId(mId);
    const selMachine = machineListSafe.find(m => String(m.id) === String(mId));
    if (selMachine?.current_hours) {
      setManualMeterReading(String(selMachine.current_hours));
    }
    setManualSelectedTrackerIds([]);
  };

  const handleManualLitresChange = (val) => {
    setManualLitres(val);
    const l = parseFloat(val) || 0;
    const p = parseFloat(manualPricePerLiter) || 95.0;
    setManualTotalCost(String(Math.round(l * p)));
  };

  const handleManualPriceChange = (val) => {
    setManualPricePerLiter(val);
    const l = parseFloat(manualLitres) || 0;
    const p = parseFloat(val) || 0;
    setManualTotalCost(String(Math.round(l * p)));
  };

  const handleToggleManualTrackerId = (fill) => {
    const tid = String(fill.id);
    let nextIds = [];
    if (manualSelectedTrackerIds.includes(tid)) {
      nextIds = manualSelectedTrackerIds.filter(x => x !== tid);
    } else {
      nextIds = [...manualSelectedTrackerIds, tid];
    }
    setManualSelectedTrackerIds(nextIds);

    if (nextIds.length > 0) {
      const fills = currentMachinePendingFills.filter(f => nextIds.includes(String(f.id)));
      const sumL = fills.reduce((a, b) => a + (parseFloat(b.litres ?? b.quantity_liters) || 0), 0);
      if (sumL > 0) {
        setManualLitres(sumL.toFixed(1));
        const rate = parseFloat(manualPricePerLiter) || 95.0;
        setManualTotalCost(String(Math.round(sumL * rate)));
      }
    }
  };

  const handleManualSlipSubmit = async (e) => {
    if (e) e.preventDefault();
    setManualError(null);

    if (!manualMachineId) {
      setManualError('Please select a fleet machine.');
      return;
    }

    const litresNum = parseFloat(manualLitres);
    if (isNaN(litresNum) || litresNum <= 0) {
      setManualError('Please enter a valid fuel volume in Litres (> 0).');
      return;
    }

    if (!manualMobile || !manualMobile.trim()) {
      setManualError('Mobile number is mandatory for HDD Fiber confirmation & verification.');
      return;
    }

    setManualSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('machine', manualMachineId);
      fd.append('litres', String(litresNum));
      fd.append('price_per_liter', manualPricePerLiter || '95.00');
      fd.append('total_cost', manualTotalCost || String(Math.round(litresNum * 95)));
      if (manualMeterReading) {
        fd.append('meter_reading', manualMeterReading);
      }
      fd.append('mobile', manualMobile.trim());
      if (manualDate) {
        fd.append('refuel_date', manualDate);
      }
      if (manualPumpName) {
        fd.append('pump_name', manualPumpName.trim());
      }
      if (manualSlipNo) {
        fd.append('slip_no', manualSlipNo.trim());
      }
      if (manualVarianceDisp) {
        fd.append('variance_disposition', manualVarianceDisp);
      }
      if (manualNotes) {
        fd.append('notes', manualNotes.trim());
      }
      if (manualSlipFile) {
        fd.append('slip', manualSlipFile);
      }
      manualSelectedTrackerIds.forEach(tid => {
        fd.append('refuel_tracker_ids', String(tid));
      });

      const res = await refuelService.postManualSlip(fd);
      const resData = res?.data?.data || res?.data || res || {};

      showToast('✓ Manual refuel slip recorded & posted to HDD / FiberForce successfully!', 'success');
      setManualSuccessData(resData);

      fetchSensorLogs();
      fetchRefuels();
    } catch (err) {
      console.error('Manual slip submission failed:', err);
      const msg = err?.data?.message || err?.message || err?.error || 'Failed to post manual slip to HDD / FiberForce.';
      setManualError(typeof msg === 'object' ? JSON.stringify(msg) : msg);
      showToast('Refuel slip submission failed', 'error');
    } finally {
      setManualSubmitting(false);
    }
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

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isFuelLogsTab && selectedPendingIds.length > 0 && (
              <button
                type="button"
                onClick={handleAcknowledgeSelected}
                className="btn-primary"
                style={{
                  padding: '7px 14px',
                  fontSize: '0.8rem',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: 'none',
                  background: '#059669',
                  borderColor: '#059669'
                }}
              >
                <LucideCheckCircle2 size={15} /> Acknowledge Selected ({selectedPendingIds.length})
              </button>
            )}

            <button
              type="button"
              onClick={refreshActive}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontWeight: '600',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: 'none',
                cursor: 'pointer'
              }}
            >
              <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <button
            type="button"
            onClick={() => openManualSlipModal()}
            className="btn-primary"
            style={{
              padding: '8px 18px',
              fontSize: '0.84rem',
              fontWeight: '700',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease'
            }}
            title="Fill manual refuel slip and post to HDD / FiberForce"
          >
            <LucidePlus size={16} /> Add Manual Slip
          </button>
        </div>
      </div>

      <div className="filter-row">
        {[
          { label: 'Fuel Accounting', count: null },
          { label: 'Fuel Logs', count: sensorMeta.total || sensorLogsSafe.length },
          { label: 'Refuel Log', count: refuelEntriesSafe.length },
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            className={`filter-chip ${activeTab === tab.label ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.label)}
          >
            {tab.label} {tab.count !== null ? `(${tab.count})` : ''}
          </button>
        ))}
      </div>

      {activeTab === 'Fuel Accounting' ? (
        <FuelAccountingView
          machines={machineListSafe}
          selectedMachineId={selectedMachineId}
          setSelectedMachineId={setSelectedMachineId}
          user={auth?.user}
          showToast={showToast}
          onOpenManualSlip={openManualSlipModal}
        />
      ) : (
        <>
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
                <th style={{ width: '40px', paddingLeft: '16px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={pendingFills.length > 0 && selectedPendingIds.length === pendingFills.length}
                    onChange={handleSelectAllPending}
                    title="Select all pending fills"
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </th>
                <th style={{ paddingLeft: '12px' }}>Machine / Chassis</th>
                <th>Occurred At</th>
                <th>Sensor Litres</th>
                <th>Level Before → After</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Verify / Slip</th>
                <th>Variance</th>
                <th style={{ textAlign: 'center', paddingRight: '20px' }}>Action</th>
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
                      <td style={{ width: '40px', paddingLeft: '16px', textAlign: 'center' }}>
                        {(r.status || '').toUpperCase() === 'PENDING' ? (
                          <input
                            type="checkbox"
                            checked={selectedPendingIds.includes(r.id)}
                            onChange={() => handleToggleSelect(r)}
                            style={{ cursor: 'pointer', width: 16, height: 16 }}
                          />
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>
                      <td style={{ paddingLeft: '12px' }}>
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

                      {/* Action Column */}
                      <td style={{ textAlign: 'center', paddingRight: '20px' }}>
                        {(r.status || '').toUpperCase() === 'PENDING' ? (
                          <button
                            type="button"
                            onClick={() => handleAcknowledgeSingle(r)}
                            style={{
                              padding: '5px 12px',
                              fontSize: '0.76rem',
                              fontWeight: '700',
                              borderRadius: '6px',
                              background: '#059669',
                              color: '#ffffff',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            title="Confirm and acknowledge refuel with HDD Fiber"
                          >
                            <LucideCheckCircle2 size={13} /> Acknowledge
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <LucideCheck size={14} /> Confirmed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredSensorLogs.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
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
    </>
  )}

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

      {/* STICKY FLOATING SELECTION BAR FOR PENDING FILLS */}
      {selectedPendingIds.length > 0 && isFuelLogsTab && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: '#0f172a',
          color: '#ffffff',
          borderRadius: '14px',
          padding: '12px 22px',
          boxShadow: '0 12px 28px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          border: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideCheck size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>
                {selectedPendingIds.length} Pending Fill{selectedPendingIds.length > 1 ? 's' : ''} Selected
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Rig: {selectedFillsSummary.machineName} · Total: {selectedFillsSummary.totalLitres.toFixed(1)} L
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAcknowledgeSelected}
              style={{
                padding: '8px 18px',
                fontSize: '0.84rem',
                fontWeight: 700,
                background: '#059669',
                borderColor: '#059669',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <LucideCheckCircle2 size={16} /> Acknowledge & Confirm Refuel
            </button>
            <button
              type="button"
              onClick={() => setSelectedPendingIds([])}
              style={{
                background: 'transparent',
                border: '1px solid #475569',
                color: '#cbd5e1',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* HDD FIBER / FIBERFORCE MANUAL SLIP MODAL */}
      {showManualSlipModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '640px', width: '95%', maxHeight: '92vh', overflowY: 'auto' }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <LucideFuel size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Manual Refuel Slip
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Fill diesel pump slip & post verification to HDD / FiberForce
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowManualSlipModal(false); setManualSuccessData(null); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
              >
                <LucideX size={20} />
              </button>
            </div>

            {/* Modal Content */}
            {manualSuccessData ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                  <LucideCheckCircle2 size={32} />
                </div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  Refuel Slip Recorded & Posted!
                </h4>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 20px 0' }}>
                  {manualSuccessData.fiberforce_synced
                    ? 'The manual refuel slip has been verified and confirmed with HDD / FiberForce.'
                    : 'The refuel slip has been recorded in HERO Fleet Operations and queued for FiberForce sync.'}
                </p>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20, textAlign: 'left', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Machine:</span>
                    <span style={{ fontWeight: 700 }}>{manualSuccessData.machine_name || manualSuccessData.machine || 'Rig'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Delivered Litres:</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{manualSuccessData.quantity_liters || manualLitres} L</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Total Cost:</span>
                    <span style={{ fontWeight: 700 }}>₹{manualSuccessData.total_cost || manualTotalCost}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Status:</span>
                    <span style={{ fontWeight: 700, color: manualSuccessData.fiberforce_synced ? '#059669' : '#2563eb' }}>
                      {manualSuccessData.fiberforce_synced ? 'CONFIRMED on HDD FiberForce' : 'LOGGED IN HERO'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { setShowManualSlipModal(false); setManualSuccessData(null); }}
                  style={{ width: '100%', padding: '10px' }}
                >
                  Done & Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleManualSlipSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {manualError && (
                  <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, color: '#ef4444', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LucideAlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{manualError}</span>
                  </div>
                )}

                {/* Machine Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Fleet Machine / Chassis <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <SearchableSelect
                    value={manualMachineId}
                    onChange={(e) => handleManualMachineSelect(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.84rem',
                      fontWeight: '600'
                    }}
                  >
                    <option value="">— Select Machine —</option>
                    {machineListSafe.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.machine_chassis_no || m.code || m.name} ({m.model_name || m.model_code || 'Rig'})
                      </option>
                    ))}
                  </SearchableSelect>
                </div>

                {/* Detected Pending Sensor Fills for this Machine */}
                {currentMachinePendingFills.length > 0 && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                      <LucideCheckCircle2 size={15} color="#059669" />
                      <span>{currentMachinePendingFills.length} Pending FiberForce Sensor Fill(s) Detected for this Machine</span>
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#334155', marginBottom: 8 }}>
                      Optionally select which sensor fill(s) this manual slip maps & confirms:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 110, overflowY: 'auto' }}>
                      {currentMachinePendingFills.map((fill) => {
                        const isChecked = manualSelectedTrackerIds.includes(String(fill.id));
                        return (
                          <label
                            key={fill.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 10px',
                              background: '#ffffff',
                              border: isChecked ? '1px solid #059669' : '1px solid #e2e8f0',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: '0.78rem'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleManualTrackerId(fill)}
                              style={{ width: 15, height: 15 }}
                            />
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>Fill #{fill.id}</span>
                            <span style={{ color: '#64748b' }}>· {formatWhen(fill.occurred_at || fill.refuel_date)}</span>
                            <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#059669' }}>
                              +{parseFloat(fill.litres ?? fill.quantity_liters ?? 0).toFixed(1)} L
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Date & Mobile Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Refuel Date & Time <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="form-control"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Operator / Supervisor Mobile <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      className="form-control"
                      value={manualMobile}
                      onChange={(e) => setManualMobile(e.target.value)}
                      placeholder="e.g. 9876543210"
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>
                </div>

                {/* Litres, Rate & Total Amount Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Fuel Volume (Litres) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      className="form-control"
                      value={manualLitres}
                      onChange={(e) => handleManualLitresChange(e.target.value)}
                      placeholder="50.0"
                      style={{ width: '100%', height: 38, fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Rate (₹ / L)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      value={manualPricePerLiter}
                      onChange={(e) => handleManualPriceChange(e.target.value)}
                      placeholder="95.00"
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Total Amount Paid (₹)
                    </label>
                    <input
                      type="number"
                      step="1"
                      className="form-control"
                      value={manualTotalCost}
                      onChange={(e) => setManualTotalCost(e.target.value)}
                      placeholder="4750"
                      style={{ width: '100%', height: 38, fontWeight: 700, color: '#2563eb' }}
                    />
                  </div>
                </div>

                {/* Engine Hours & Pump Name Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Engine Hour Meter (hrs)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      value={manualMeterReading}
                      onChange={(e) => setManualMeterReading(e.target.value)}
                      placeholder="e.g. 142.5"
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Diesel Pump / Vendor Name
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={manualPumpName}
                      onChange={(e) => setManualPumpName(e.target.value)}
                      placeholder="e.g. Indian Oil / BPCL Pump"
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>
                </div>

                {/* Slip Number & Variance Disposition */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Pump Slip / Invoice # (Optional)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={manualSlipNo}
                      onChange={(e) => setManualSlipNo(e.target.value)}
                      placeholder="e.g. SLIP-8921"
                      style={{ width: '100%', height: 38 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Variance Disposition (Optional)
                    </label>
                    <select
                      className="form-control"
                      value={manualVarianceDisp}
                      onChange={(e) => setManualVarianceDisp(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                    >
                      <option value="">— Normal / Standard Fill —</option>
                      <option value="Meter Tolerance / Normal">Meter Tolerance / Normal (≤ 3%)</option>
                      <option value="Dispenser Nozzle Difference">Dispenser Nozzle Difference</option>
                      <option value="Tank Calibration Adjustment">Tank Calibration Adjustment</option>
                      <option value="Spillage / Test Sample">Spillage / Test Sample</option>
                      <option value="Operator Reported Discrepancy">Operator Reported Discrepancy</option>
                      <option value="Other">Other Reason</option>
                    </select>
                  </div>
                </div>

                {/* Slip Photo Upload */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Pump Slip / Bill Photo (Recommended)
                  </label>
                  {!manualSlipPreviewUrl ? (
                    <label style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 14,
                      border: '2px dashed #cbd5e1',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: '#f8fafc'
                    }}>
                      <LucideUpload size={22} color="#94a3b8" />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginTop: 4 }}>
                        Click to upload diesel pump slip or invoice photo
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Supports JPG, PNG, WebP, PDF (Max 10MB)
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setManualSlipFile(file);
                            setManualSlipPreviewUrl(URL.createObjectURL(file));
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <img src={manualSlipPreviewUrl} alt="Slip Preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {manualSlipFile?.name || 'Slip Attached'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {manualSlipFile ? `${(manualSlipFile.size / 1024).toFixed(1)} KB` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setManualSlipFile(null); setManualSlipPreviewUrl(null); }}
                        style={{ background: '#fee2e2', border: 'none', color: '#dc2626', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        <LucideTrash2 size={13} /> Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Remarks / Location Notes */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Optional Remarks / Site Notes
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="e.g. Refueled before second drilling shift at Nagaur bypass"
                    style={{ width: '100%', height: 38 }}
                  />
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    onClick={() => setShowManualSlipModal(false)}
                    disabled={manualSubmitting}
                    style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={manualSubmitting}
                    className="btn-primary"
                    style={{
                      padding: '9px 22px',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#2563eb',
                      borderColor: '#2563eb'
                    }}
                  >
                    <LucideUpload size={16} />
                    {manualSubmitting ? 'Posting to HDD / FiberForce...' : 'Post to HDD / FiberForce'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <LucideFuel size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Confirm & Acknowledge Refuel
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Maps manual slip & payment details to HDD Fiber sensor fills
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowConfirmModal(false); setConfirmSuccessData(null); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
              >
                <LucideX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            {confirmSuccessData ? (
              /* Success View */
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                  <LucideCheckCircle2 size={32} />
                </div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  Refuel Confirmed with HDD Fiber!
                </h4>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 20px 0' }}>
                  The sensor fill(s) have been verified and marked as CONFIRMED on the HDD Fiber platform and synced with HERO internal records.
                </p>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20, textAlign: 'left', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Status:</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>CONFIRMED</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Acknowledged Litres:</span>
                    <span style={{ fontWeight: 700 }}>{confirmSuccessData.acknowledged_litres || confirmFormData.litres} L</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Amount Paid:</span>
                    <span style={{ fontWeight: 700 }}>₹{confirmSuccessData.amount_paid || confirmFormData.amount_paid || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Confirmed By Mobile:</span>
                    <span style={{ fontWeight: 600 }}>{confirmSuccessData.confirmed_by_mobile || confirmFormData.mobile}</span>
                  </div>
                  {confirmSuccessData.variance_pct != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Variance:</span>
                      <span style={{ fontWeight: 700, color: confirmSuccessData.variance_ok === false ? '#b91c1c' : '#059669' }}>
                        {confirmSuccessData.variance_pct}% ({confirmSuccessData.variance_ok === false ? 'Exceeds limit' : 'OK'})
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { setShowConfirmModal(false); setConfirmSuccessData(null); }}
                  style={{ width: '100%', padding: '10px' }}
                >
                  Done & Refresh Logs
                </button>
              </div>
            ) : (
              /* Confirmation Form View */
              <form onSubmit={handleConfirmSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {confirmError && (
                  <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, color: '#ef4444', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LucideAlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{confirmError}</span>
                  </div>
                )}

                {/* Selected Fills Card */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Selected Sensor Fill(s): {confirmTargetFills.length}</span>
                    <span style={{ color: '#2563eb' }}>Rig: {confirmTargetFills[0]?.machine_name || confirmTargetFills[0]?.machine_code || confirmTargetFills[0]?.machine_chassis_no}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 100, overflowY: 'auto' }}>
                    {confirmTargetFills.map((f, i) => (
                      <div key={f.id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#334155', background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                        <span>Fill #{f.id} · {formatWhen(f.occurred_at || f.refuel_date)}</span>
                        <span style={{ fontWeight: 700, color: '#059669' }}>+{parseFloat(f.litres ?? f.quantity_liters ?? 0).toFixed(1)} L</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                    <span>Total Detected Sensor Volume:</span>
                    <span style={{ color: '#2563eb' }}>
                      {confirmTargetFills.reduce((a, b) => a + (parseFloat(b.litres ?? b.quantity_liters) || 0), 0).toFixed(1)} L
                    </span>
                  </div>
                </div>

                {/* Litres & Amount Paid Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Total Confirmed Litres <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      required
                      className="form-control"
                      value={confirmFormData.litres}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfirmFormData(prev => ({
                          ...prev,
                          litres: val,
                          amount_paid: prev.amount_paid ? prev.amount_paid : (val ? String(Math.round(parseFloat(val) * 95)) : '')
                        }));
                      }}
                      placeholder="e.g. 46.0"
                      style={{ width: '100%', height: 38, fontWeight: 700, fontSize: '0.95rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Amount Paid (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      value={confirmFormData.amount_paid}
                      onChange={(e) => setConfirmFormData({ ...confirmFormData, amount_paid: e.target.value })}
                      placeholder="e.g. 4370"
                      style={{ width: '100%', height: 38, fontWeight: 700, fontSize: '0.95rem' }}
                    />
                  </div>
                </div>

                {/* Mobile Number & Variance Disposition Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Mobile Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      className="form-control"
                      value={confirmFormData.mobile}
                      onChange={(e) => setConfirmFormData({ ...confirmFormData, mobile: e.target.value })}
                      placeholder="e.g. 9876543210"
                      style={{ width: '100%', height: 38 }}
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      Used by HDD Fiber to attribute acknowledgment
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Variance Disposition (Optional)
                    </label>
                    <select
                      className="form-control"
                      value={confirmFormData.variance_disposition}
                      onChange={(e) => setConfirmFormData({ ...confirmFormData, variance_disposition: e.target.value })}
                      style={{ width: '100%', height: 38 }}
                    >
                      <option value="">— Select Disposition (If Variance) —</option>
                      <option value="Meter Tolerance / Normal">Meter Tolerance / Normal (≤ 3%)</option>
                      <option value="Dispenser Nozzle Difference">Dispenser Nozzle Difference</option>
                      <option value="Tank Calibration Adjustment">Tank Calibration Adjustment</option>
                      <option value="Spillage / Test Sample">Spillage / Test Sample</option>
                      <option value="Operator Reported Discrepancy">Operator Reported Discrepancy</option>
                      <option value="Other">Other Reason</option>
                    </select>
                  </div>
                </div>

                {/* Real-time Variance Calculation Banner */}
                {(() => {
                  const sensorL = confirmTargetFills.reduce((a, b) => a + (parseFloat(b.litres ?? b.quantity_liters) || 0), 0);
                  const enteredL = parseFloat(confirmFormData.litres);
                  if (sensorL > 0 && !isNaN(enteredL)) {
                    const diff = enteredL - sensorL;
                    const pct = (diff / sensorL) * 100;
                    const isWithin = Math.abs(pct) <= 3.0;
                    return (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: isWithin ? '#ecfdf5' : '#fffbeb',
                        border: `1px solid ${isWithin ? '#a7f3d0' : '#fde68a'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8125rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <LucideInfo size={16} color={isWithin ? '#059669' : '#d97706'} />
                          <span style={{ color: isWithin ? '#065f46' : '#92400e', fontWeight: 600 }}>
                            Variance: {pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`} ({diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} L)
                          </span>
                        </div>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: isWithin ? '#059669' : '#d97706',
                          color: '#fff'
                        }}>
                          {isWithin ? '✓ OK (Within 3%)' : '⚠ Requires Disposition'}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Optional Slip Photo Upload */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Refuel Slip / Invoice Photo (Optional)
                  </label>
                  
                  {!slipPreviewUrl ? (
                    <label style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 16,
                      border: '2px dashed #cbd5e1',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: '#f8fafc',
                      transition: 'all 0.2s'
                    }}>
                      <LucideUpload size={24} color="#94a3b8" />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginTop: 6 }}>
                        Click to upload diesel pump slip or invoice photo
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Supports JPG, PNG, WebP (Max 10MB)
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSlipFile(file);
                            setSlipPreviewUrl(URL.createObjectURL(file));
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <img src={slipPreviewUrl} alt="Slip Preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {slipFile?.name || 'Slip Photo Attached'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {slipFile ? `${(slipFile.size / 1024).toFixed(1)} KB` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSlipFile(null); setSlipPreviewUrl(null); }}
                        style={{ background: '#fee2e2', border: 'none', color: '#dc2626', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        <LucideTrash2 size={13} /> Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Optional Note */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Optional Remarks / Slip Note
                  </label>
                  <textarea
                    rows={2}
                    className="form-control"
                    value={confirmFormData.note}
                    onChange={(e) => setConfirmFormData({ ...confirmFormData, note: e.target.value })}
                    placeholder="e.g. Pump slip #48291, Bharat Petroleum Sujangarh bypass"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                {/* Modal Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={confirming}
                    style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={confirming}
                    className="btn-primary"
                    style={{ padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, background: '#059669', borderColor: '#059669' }}
                  >
                    <LucideCheckCircle2 size={16} />
                    {confirming ? 'Confirming with HDD Fiber...' : 'Confirm Refuel'}
                  </button>
                </div>

              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default Refuel;
