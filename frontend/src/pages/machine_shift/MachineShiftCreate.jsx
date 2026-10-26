import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LucideTruck, LucideCalendar, LucideMapPin, LucideBuilding,
  LucideAlertCircle, LucideX, LucideSave, LucideInfo
} from 'lucide-react';
import { machineShiftService } from '../../services/machineShiftService';
import { vendorService } from '../../services/vendorService';
import { machineService } from '../../services/machineService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import { SearchableSelect } from '../../components/common/Select';
import { DateField } from '../../components/common/DateField';

// Helper to safely extract arrays from any API response structure
const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.results)) return val.results;
  if (val && Array.isArray(val.vendors)) return val.vendors;
  if (val && Array.isArray(val.data)) return val.data;
  if (val && val.data && Array.isArray(val.data.results)) return val.data.results;
  if (val && val.data && Array.isArray(val.data.vendors)) return val.data.vendors;
  if (val && val.data && Array.isArray(val.data.data)) return val.data.data;
  if (val && val.data && Array.isArray(val.data)) return val.data;
  return [];
};

export const MachineShiftCreate = ({ onCreated, onCancel, isModal = false }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, isAdmin, vendors: authVendors } = useAuth();

  // Data states
  const [vendors, setVendors] = useState([]);
  const [allMachines, setAllMachines] = useState([]);
  const [filteredMachines, setFilteredMachines] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    vendor: '',
    machine: '',
    reason: '',
    reason_text: '',
    a_point_name: '',
    a_point_latitude: '',
    a_point_longitude: '',
    b_point_name: '',
    b_point_latitude: '',
    b_point_longitude: '',
    required_date: new Date().toISOString().split('T')[0],
    mode_of_shifting: 'OWN_HDD'
  });

  // Load Vendors, Machines, Reasons
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingInitial(true);
        const [vendorsRes, machinesRes, reasonsRes] = await Promise.all([
          vendorService.getVendors().catch(() => ({ results: [] })),
          machineService.getAll({ page_size: 250 }).catch(() => ({ results: [] })),
          machineShiftService.getReasons().catch(() => ({ results: [] }))
        ]);

        const vendorList = ensureArray(vendorsRes);
        const machineList = ensureArray(machinesRes);
        const reasonList = ensureArray(reasonsRes);

        let finalVendors = vendorList;
        const assignedVendors = (Array.isArray(user?.vendors) && user.vendors.length > 0)
          ? user.vendors
          : (Array.isArray(authVendors) && authVendors.length > 0 ? authVendors : []);

        // When user is not admin and has assigned vendors, strictly enforce showing only assigned vendors
        if (!isAdmin && assignedVendors.length > 0) {
          const allowedIds = new Set(
            assignedVendors.flatMap(v => [
              String(v.id).toLowerCase(),
              v.external_vendor_id ? String(v.external_vendor_id).toLowerCase() : null,
              v.code ? String(v.code).toLowerCase() : null,
              v.name ? String(v.name).trim().toLowerCase() : null
            ].filter(Boolean))
          );

          const matchedFromApi = vendorList.filter(v => {
            const vId = String(v.id || '').toLowerCase();
            const vExt = String(v.external_vendor_id || '').toLowerCase();
            const vDbId = String(v.db_id || '').toLowerCase();
            const vCode = String(v.code || '').toLowerCase();
            const vName = String(v.name || v.partnerName || '').trim().toLowerCase();
            const vNameClean = vName.replace(/\s*[\(\[]?vnd[\)\]]?\s*$/i, '').trim();
            return allowedIds.has(vId) || allowedIds.has(vExt) || allowedIds.has(vDbId) || (vCode && allowedIds.has(vCode)) || allowedIds.has(vName) || allowedIds.has(vNameClean);
          });

          const finalMap = new Map();
          matchedFromApi.forEach(v => {
            const key = String(v.id || v.external_vendor_id);
            finalMap.set(key, v);
          });

          // Ensure all assigned vendors from the user serializer are included
          assignedVendors.forEach(av => {
            const key = String(av.id || av.external_vendor_id);
            const exists = Array.from(finalMap.values()).some(v =>
              String(v.id) === String(av.id) ||
              String(v.db_id) === String(av.id) ||
              (av.external_vendor_id && (String(v.id) === String(av.external_vendor_id) || String(v.external_vendor_id) === String(av.external_vendor_id))) ||
              String(v.name || '').trim().toLowerCase() === String(av.name || '').trim().toLowerCase()
            );
            if (!exists) {
              finalMap.set(key, {
                id: av.id,
                external_vendor_id: av.external_vendor_id || String(av.id),
                db_id: av.id,
                name: av.name,
                code: av.code || 'VND',
                machines: []
              });
            }
          });

          finalVendors = Array.from(finalMap.values());
        }

        setVendors(finalVendors);
        setAllMachines(machineList);
        setReasons(reasonList);

        // Pre-select default reason if exists
        const defaultReason = reasonList.find(r => r.name?.toLowerCase().includes('task')) || reasonList[0];
        if (defaultReason) {
          setFormData(prev => ({ ...prev, reason: defaultReason.id }));
        }

        // If only 1 vendor is available, pre-select vendor
        if (finalVendors.length === 1) {
          setFormData(prev => ({ ...prev, vendor: finalVendors[0].id || finalVendors[0].external_vendor_id }));
        } else if (user?.vendor_id && (!assignedVendors || assignedVendors.length <= 1)) {
          setFormData(prev => ({ ...prev, vendor: user.vendor_id }));
        }
      } catch (err) {
        console.error("Error loading shift request prerequisites", err);
      } finally {
        setLoadingInitial(false);
      }
    };

    fetchData();
  }, [user, isAdmin, authVendors]);

  // VENDOR -> MACHINE DEPENDENCY FILTERING
  useEffect(() => {
    if (!formData.vendor) {
      setFilteredMachines([]);
      setFormData(prev => ({ ...prev, machine: '' }));
      return;
    }

    const selectedVendor = (vendors || []).find(v =>
      String(v.id) === String(formData.vendor) ||
      String(v.external_vendor_id) === String(formData.vendor) ||
      String(v.db_id) === String(formData.vendor) ||
      String(v.code) === String(formData.vendor) ||
      String(v.name).trim().toLowerCase() === String(formData.vendor).trim().toLowerCase()
    );

    if (!selectedVendor) {
      setFilteredMachines([]);
      return;
    }

    const vId = String(selectedVendor.id || '');
    const extId = String(selectedVendor.external_vendor_id || '');
    const dbId = String(selectedVendor.db_id || '');
    const vName = String(selectedVendor.name || '').trim().toLowerCase();

    // 1. Gather machines directly from the vendor's iLance portal data
    const iLanceMachines = Array.isArray(selectedVendor.machines) ? selectedVendor.machines : [];
    
    const combined = [];
    const seenChassis = new Set();

    // Add iLance machines first
    iLanceMachines.forEach(im => {
      const chassis = String(im.machineNo || im.machine_no || im.name || im.code || '').trim();
      // Find corresponding Machine from DB list if present
      const dbMatch = (allMachines || []).find(dbM =>
        (chassis && (
          String(dbM.machine_chassis_no) === chassis ||
          String(dbM.serial_number) === chassis ||
          String(dbM.machineNo) === chassis ||
          String(dbM.name).includes(chassis)
        ))
      );

      const mId = dbMatch ? dbMatch.id : (chassis || im.id);
      const mName = dbMatch
        ? `${dbMatch.name} [${dbMatch.machine_chassis_no || dbMatch.serial_number || chassis}]`
        : `${im.code || 'HDD'} (${chassis || im.name || 'Machine'})`;

      const key = String(dbMatch ? dbMatch.id : (chassis || im.id));
      if (!seenChassis.has(key)) {
        seenChassis.add(key);
        combined.push({
          id: mId,
          name: mName,
          machine_chassis_no: dbMatch ? dbMatch.machine_chassis_no : chassis,
        });
      }
    });

    // 2. Also include any machines in DB assigned to this vendor
    (allMachines || []).forEach(dbM => {
      const isAssigned = (
        (dbM.vendor_id && (String(dbM.vendor_id) === vId || (extId && String(dbM.vendor_id) === extId) || (dbId && String(dbM.vendor_id) === dbId))) ||
        (dbM.vendor && typeof dbM.vendor === 'object' && (String(dbM.vendor.id) === vId || (extId && String(dbM.vendor.external_vendor_id) === extId) || (dbId && String(dbM.vendor.id) === dbId))) ||
        (dbM.externalVendorId && extId && String(dbM.externalVendorId) === extId) ||
        (dbM.vendorName && vName && String(dbM.vendorName).trim().toLowerCase() === vName) ||
        (dbM.vendor_name && vName && String(dbM.vendor_name).trim().toLowerCase() === vName)
      );

      if (isAssigned && !seenChassis.has(String(dbM.id))) {
        seenChassis.add(String(dbM.id));
        combined.push({
          id: dbM.id,
          name: `${dbM.name} [${dbM.machine_chassis_no || dbM.serial_number}]`,
          machine_chassis_no: dbM.machine_chassis_no
        });
      }
    });

    setFilteredMachines(combined);

    // Reset machine selection if currently selected machine is not in filtered list
    setFormData(prev => {
      const isCurrentMachineValid = combined.some(m => String(m.id) === String(prev.machine));
      return { ...prev, machine: isCurrentMachineValid ? prev.machine : (combined.length === 1 ? combined[0].id : '') };
    });
  }, [formData.vendor, vendors, allMachines]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.vendor) {
      setErrorMsg('Please select a Vendor.');
      return;
    }

    if (!formData.machine) {
      setErrorMsg('Please select a Machine belonging to the selected vendor.');
      return;
    }

    if (!formData.a_point_name.trim()) {
      setErrorMsg('Origin (A Point Name) is required.');
      return;
    }

    if (!formData.b_point_name.trim()) {
      setErrorMsg('Destination (B Point Name) is required.');
      return;
    }

    if (!formData.required_date) {
      setErrorMsg('Shifting Required Date is required.');
      return;
    }

    if (!formData.reason && !formData.reason_text.trim()) {
      setErrorMsg('Please select a Reason from the dropdown or enter custom Reason text.');
      return;
    }

    const payload = {
      vendor: formData.vendor,
      machine: formData.machine,
      reason: formData.reason ? Number(formData.reason) : null,
      reason_text: (formData.reason_text || '').trim(),
      a_point_name: formData.a_point_name.trim(),
      a_point_latitude: formData.a_point_latitude ? Number(formData.a_point_latitude) : null,
      a_point_longitude: formData.a_point_longitude ? Number(formData.a_point_longitude) : null,
      b_point_name: formData.b_point_name.trim(),
      b_point_latitude: formData.b_point_latitude ? Number(formData.b_point_latitude) : null,
      b_point_longitude: formData.b_point_longitude ? Number(formData.b_point_longitude) : null,
      required_date: formData.required_date,
      mode_of_shifting: formData.mode_of_shifting
    };

    try {
      setSubmitting(true);
      const res = await machineShiftService.createRequest(payload);
      showToast('Machine Shift Request created successfully!', 'success');
      if (onCreated) {
        onCreated(res);
      } else {
        navigate('/machine-shift');
      }
    } catch (err) {
      console.error("Create shift request failed", err);
      let msg = err?.data?.message || err?.response?.data?.message || err?.message || err?.detail || 'Failed to submit shift request.';
      const resData = err?.response?.data || err?.data;
      if (resData && typeof resData === 'object') {
        if (resData.message) {
          msg = resData.message;
        } else if (resData.detail) {
          msg = resData.detail;
        } else {
          const firstKey = Object.keys(resData)[0];
          const firstVal = resData[firstKey];
          const cleanVal = Array.isArray(firstVal) ? firstVal[0] : firstVal;
          msg = `${firstKey}: ${cleanVal}`;
        }
      }
      setErrorMsg(typeof msg === 'object' ? JSON.stringify(msg) : String(msg));
      showToast('Failed to create shift request.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/machine-shift');
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {errorMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius)', color: '#ef4444', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LucideAlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SECTION 1: VENDOR & MACHINE */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LucideBuilding size={16} style={{ color: 'var(--accent)' }} /> 1. Vendor & Machinery Selection
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* 1. Vendor */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Select Vendor <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <SearchableSelect
              value={formData.vendor}
              onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              placeholder="— Search & Select Vendor —"
              searchPlaceholder="Search vendor by name or code..."
            >
              <option value="">— Select Vendor Organization —</option>
              {(vendors || []).map(v => (
                <option key={v.id || v.external_vendor_id} value={v.id || v.external_vendor_id}>
                  {v.name} ({v.code || 'VND'})
                </option>
              ))}
            </SearchableSelect>
          </div>

          {/* 2. Machine (Vendor Dependent) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Select Machine <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <SearchableSelect
              value={formData.machine}
              onChange={(e) => setFormData({ ...formData, machine: e.target.value })}
              placeholder={
                !formData.vendor
                  ? '— Select a vendor first —'
                  : filteredMachines.length === 0
                  ? '— No machines registered for this vendor —'
                  : '— Search & Select Machine —'
              }
              searchPlaceholder="Search machine by chassis or name..."
              disabled={!formData.vendor || filteredMachines.length === 0}
            >
              <option value="">
                {!formData.vendor
                  ? '— Select a vendor first —'
                  : filteredMachines.length === 0
                  ? '— No machines registered for this vendor —'
                  : '— Select Fleet Rig —'}
              </option>
              {(filteredMachines || []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} [{m.machine_chassis_no || m.serial_number || m.id}]
                </option>
              ))}
            </SearchableSelect>

            {formData.vendor && filteredMachines.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <LucideAlertCircle size={12} /> No machinery registered or available for this vendor.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: A POINT (ORIGIN) */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LucideMapPin size={16} style={{ color: '#3b82f6' }} /> 2. Origin (A Point) Location
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              A Point Name / Site Location <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="form-control"
              value={formData.a_point_name}
              onChange={(e) => setFormData({ ...formData, a_point_name: e.target.value })}
              placeholder="e.g. Ring 3 Crossing, Jaipur-Ajmer Expressway"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Latitude
            </label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={formData.a_point_latitude}
              onChange={(e) => setFormData({ ...formData, a_point_latitude: e.target.value })}
              placeholder="e.g. 26.9124"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Longitude
            </label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={formData.a_point_longitude}
              onChange={(e) => setFormData({ ...formData, a_point_longitude: e.target.value })}
              placeholder="e.g. 75.7873"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: B POINT (DESTINATION) */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LucideMapPin size={16} style={{ color: '#10b981' }} /> 3. Destination (B Point) Location
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              B Point Name / Destination Site <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="form-control"
              value={formData.b_point_name}
              onChange={(e) => setFormData({ ...formData, b_point_name: e.target.value })}
              placeholder="e.g. Block C Feeder Route, Alwar Central"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Latitude
            </label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={formData.b_point_latitude}
              onChange={(e) => setFormData({ ...formData, b_point_latitude: e.target.value })}
              placeholder="e.g. 27.5530"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Longitude
            </label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={formData.b_point_longitude}
              onChange={(e) => setFormData({ ...formData, b_point_longitude: e.target.value })}
              placeholder="e.g. 76.6346"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 4: REASON & TIMING */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LucideCalendar size={16} style={{ color: '#8b5cf6' }} /> 4. Reason & Scheduling
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {/* Reason Master Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Reason for Shifting (Dropdown)
            </label>
            <SearchableSelect
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="— Select from Dropdown —"
              searchPlaceholder="Search reason..."
            >
              <option value="">— Select from Dropdown —</option>
              {reasons.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SearchableSelect>
          </div>

          {/* Reason Free Text */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Reason Details / Notes (Free Text)
            </label>
            <input
              type="text"
              className="form-control"
              value={formData.reason_text}
              onChange={(e) => setFormData({ ...formData, reason_text: e.target.value })}
              placeholder="Type custom reason or site remarks..."
              style={{ width: '100%', height: 38 }}
            />
          </div>

          {/* Shifting Required Date */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Shifting Required Date <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="date"
              required
              className="form-control"
              value={formData.required_date}
              onChange={(e) => setFormData({ ...formData, required_date: e.target.value })}
              style={{ width: '100%', height: 38 }}
            >
            </input>
          </div>

          {/* Mode of Shifting */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Mode of Shifting <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              className="form-control"
              value={formData.mode_of_shifting}
              onChange={(e) => setFormData({ ...formData, mode_of_shifting: e.target.value })}
              required
              style={{ width: '100%', height: 38 }}
            >
              <option value="OWN_HDD">Own-HDD</option>
              <option value="BY_TRUCK">By Truck</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 10 }}>
          ℹ️ You can select a standard reason category from the dropdown, enter custom free-text details/remarks, or provide both.
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleCancelClick}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || (formData.vendor && filteredMachines.length === 0)}
          style={{ minWidth: 140 }}
        >
          {submitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </form>
  );

  if (isModal) {
    return (
      <div className="modal-overlay">
        <div className="modal-card" style={{ maxWidth: '780px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle)' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Create Machine Shift Request
            </h3>
            <button type="button" className="header-icon-btn" onClick={handleCancelClick} aria-label="Close">
              <LucideX size={18} />
            </button>
          </div>
          <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
            {formContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-container" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
          New Machine Shift Request
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          Submit a relocation request for fleet machinery between operations sites.
        </p>
      </div>
      {formContent}
    </div>
  );
};
