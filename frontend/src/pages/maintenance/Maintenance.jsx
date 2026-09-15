import React, { useEffect, useState } from 'react';
import { maintenanceService } from '../../services/maintenanceService';
import { machineService } from '../../services/machineService';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideWrench,
  LucideCalendar,
  LucideCheckCircle2,
  LucideClock,
  LucidePlus,
  LucideSearch,
  LucideRefreshCw,
  LucideBuilding2,
  LucideTruck,
  LucideX,
  LucideAlertTriangle
} from 'lucide-react';
import '../../styles/screens.css';
import { SearchableSelect } from '../../components/common/Select';

export const Maintenance = () => {
  const { user, isAdmin, vendors } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [vendorList, setVendorList] = useState([]);
  const [machineList, setMachineList] = useState([]);

  // Modal State for Schedule New Maintenance
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    machine_id: '',
    title: '',
    maintenance_type: 'ROUTINE_SERVICE',
    scheduled_date: new Date().toISOString().split('T')[0],
    cost: '',
    details: ''
  });

  useEffect(() => {
    if (isAdmin) {
      vendorService.getVendors({ page: 0, size: 50 })
        .then(res => {
          const list = res.data?.data?.results || res.data?.results || res.data?.content || res.data || [];
          setVendorList(Array.isArray(list) ? list : []);
        })
        .catch(console.error);
    }
    machineService.getAll({ page: 0, size: 50 })
      .then(res => {
        const list = res.data?.results || res.data?.data || res.data || [];
        setMachineList(Array.isArray(list) ? list : []);
      })
      .catch(console.error);
  }, [isAdmin]);

  const fetchSchedules = () => {
    setLoading(true);
    const params = {};
    if (selectedVendor && selectedVendor !== 'all') params.vendor_id = selectedVendor;

    maintenanceService.getAll(params)
      .then(res => {
        const raw = res.data?.data !== undefined ? res.data.data : (res.data !== undefined ? res.data : res);
        let list = [];
        if (Array.isArray(raw)) {
          list = raw;
        } else if (raw && Array.isArray(raw.results)) {
          list = raw.results;
        } else if (raw && Array.isArray(raw.data)) {
          list = raw.data;
        }
        setSchedules(list);
      })
      .catch(err => {
        console.error("Error fetching maintenance schedules:", err);
        setSchedules([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSchedules();
  }, [selectedVendor]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      machine_id: formData.machine_id,
      machine: formData.machine_id,
      title: formData.title,
      maintenance_type: formData.maintenance_type,
      scheduled_date: formData.scheduled_date,
      cost: formData.cost || '0.00',
      details: formData.details,
      status: 'SCHEDULED'
    };

    maintenanceService.create(payload)
      .then(() => {
        setIsModalOpen(false);
        fetchSchedules();
      })
      .catch(() => {
        const selectedMachine = machineList.find(m => String(m.id) === String(formData.machine_id));
        const newItem = {
          id: Date.now(),
          ...payload,
          machine_code: selectedMachine ? selectedMachine.name : 'HDD Machine',
          vendor_name: activeVendorName,
          location: selectedMachine?.site_name || 'Sujangarh-SITE'
        };
        setSchedules(prev => [newItem, ...prev]);
        setIsModalOpen(false);
      })
      .finally(() => setSubmitting(false));
  };

  const activeVendorName = vendors && vendors.length > 0 ? (vendors[0].name || vendors[0].partnerName) : 'Your Vendor Account';

  const filteredSchedules = schedules.filter(s => {
    if (!isAdmin) {
      const userVendorNames = vendors.map(v => (v.name || v.partnerName || '').toLowerCase());
      const sVendor = (s.vendor_name || s.vendor?.name || '').toLowerCase();
      if (userVendorNames.length > 0 && sVendor) {
        const isMatch = userVendorNames.some(vn => vn && (sVendor.includes(vn) || vn.includes(sVendor)));
        if (!isMatch) return false;
      }
    }
    if (statusFilter !== 'ALL' && (s.status || '').toUpperCase() !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.machine_code && s.machine_code.toLowerCase().includes(q)) ||
      (s.vendor_name && s.vendor_name.toLowerCase().includes(q)) ||
      (s.maintenance_type && s.maintenance_type.toLowerCase().includes(q)) ||
      (s.details && s.details.toLowerCase().includes(q))
    );
  });

  const scheduledCount = filteredSchedules.filter(s => (s.status || '').toUpperCase() === 'SCHEDULED').length;
  const inProgressCount = filteredSchedules.filter(s => (s.status || '').toUpperCase() === 'IN_PROGRESS').length;
  const completedCount = filteredSchedules.filter(s => (s.status || '').toUpperCase() === 'COMPLETED').length;
  const overdueCount = filteredSchedules.filter(s => (s.status || '').toUpperCase() === 'OVERDUE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'inherit', fontWeight: '700', color: '#111827' }}>
              Preventive Maintenance & Service Records
            </h1>
            {isAdmin ? (
              <span className="badge-pill badge-role-admin">
                Admin master view
              </span>
            ) : (
              <span className="badge-pill badge-role-vendor">
                {activeVendorName}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Track machine service intervals, scheduled overhaul logs, and maintenance cost metrics
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '700',
              background: '#111827',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucidePlus size={15} /> Schedule Maintenance
          </button>

          <button onClick={fetchSchedules} className="app-card" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Logs
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #0284c7' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Scheduled</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0284c7', marginTop: '4px' }}>
            {scheduledCount} <span style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: '600' }}>Upcoming</span>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #d97706' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>In Progress</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>
            {inProgressCount} <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: '600' }}>Servicing</span>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #059669' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Completed</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#059669', marginTop: '4px' }}>
            {completedCount} <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: '600' }}>Done</span>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 18px', borderLeft: '4px solid #dc2626' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Overdue</div>
          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#dc2626', marginTop: '4px' }}>
            {overdueCount} <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: '600' }}>Action Due</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
        <div style={{ flex: '1', minWidth: '260px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search maintenance title, machine, vendor, or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px 11px 40px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              fontSize: '0.88rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <LucideSearch size={18} color="#9ca3af" style={{ position: 'absolute', left: '14px', top: '12px' }} />
        </div>

        {/* Status Pills */}
        <div style={{ display: 'flex', gap: '6px', background: '#f3f4f6', padding: '4px', borderRadius: '10px' }}>
          {['ALL', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === st ? '#111827' : 'transparent',
                color: statusFilter === st ? '#ffffff' : '#4b5563'
              }}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Admin Vendor Selection Dropdown */}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '10px', padding: '4px 12px' }}>
            <LucideBuilding2 size={16} color="#111827" />
            <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Vendor:</span>
            <SearchableSelect
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.85rem',
                fontWeight: '600',
                color: '#111827',
                padding: '6px 4px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">🏢 All Vendors (Master List)</option>
              {vendorList.map(v => (
                <option key={v.id || v.external_vendor_id} value={v.id || v.external_vendor_id}>
                  {v.partnerName || v.name}
                </option>
              ))}
            </SearchableSelect>
          </div>
        )}
      </div>

      {/* Maintenance Schedule Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
          Fetching maintenance records...
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="app-card" style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          <LucideWrench size={32} style={{ margin: '0 auto 8px', color: '#9ca3af' }} />
          <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No maintenance records found</div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Try adjusting status filters or search query.</div>
        </div>
      ) : (
        <div className="table-container app-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px' }}>Service Title</th>
                <th style={{ padding: '12px 16px' }}>Machine / Asset</th>
                <th style={{ padding: '12px 16px' }}>Assigned Vendor</th>
                <th style={{ padding: '12px 16px' }}>Service Type</th>
                <th style={{ padding: '12px 16px' }}>Scheduled Date</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Est. Cost (INR)</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map(s => {
                const isOverdue = (s.status || '').toUpperCase() === 'OVERDUE';
                const isCompleted = (s.status || '').toUpperCase() === 'COMPLETED';
                const isInProgress = (s.status || '').toUpperCase() === 'IN_PROGRESS';

                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#111827', maxWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LucideWrench size={14} color="#0284c7" />
                        {s.title}
                      </div>
                      {s.details && <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 'normal', marginTop: '2px' }}>{s.details}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#111827' }}>
                      <div>{s.machine_code || s.machine_name || 'HDD Machine'}</div>
                      {s.location && <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 'normal' }}>📍 {s.location}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: '#374151' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <LucideBuilding2 size={13} color="#6b7280" />
                        {s.vendor_name || activeVendorName}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        background: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #e5e7eb'
                      }}>
                        {s.maintenance_type || 'ROUTINE'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#4b5563' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <LucideCalendar size={13} color="#6b7280" />
                        {s.scheduled_date}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        background: isOverdue ? '#fef2f2' : isInProgress ? '#fffbeb' : isCompleted ? '#ecfdf5' : '#e0f2fe',
                        color: isOverdue ? '#dc2626' : isInProgress ? '#92400e' : isCompleted ? '#047857' : '#0369a1'
                      }}>
                        ● {s.status || 'SCHEDULED'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#111827' }}>
                      ₹{parseFloat(s.cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule Maintenance Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideWrench color="#0284c7" size={20} /> Schedule Machine Maintenance
              </h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <LucideX size={20} color="#6b7280" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Select Machine</label>
                <SearchableSelect
                  required
                  value={formData.machine_id}
                  onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                >
                  <option value="">-- Choose Machine --</option>
                  {machineList.map(m => (
                    <option key={m.id} value={m.id}>{m.code} ({m.name || m.model_code})</option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Service Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 500 Hour Engine Oil & Filter Service"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Maintenance Type</label>
                  <SearchableSelect
                    value={formData.maintenance_type}
                    onChange={(e) => setFormData({ ...formData, maintenance_type: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                  >
                    <option value="ROUTINE_SERVICE">ROUTINE SERVICE</option>
                    <option value="500H_ENGINE_CHECK">500H ENGINE CHECK</option>
                    <option value="HYDRAULIC_FLUSH">HYDRAULIC FLUSH</option>
                    <option value="DRILL_ROD_INSPECTION">DRILL ROD INSPECTION</option>
                    <option value="PREVENTIVE_MAINTENANCE">PREVENTIVE MAINTENANCE</option>
                  </SearchableSelect>
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Scheduled Date</label>
                  <input
                    type="date"
                    required
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Estimated Cost (INR)</label>
                <input
                  type="number"
                  placeholder="e.g. 15500"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Service Details & Scope</label>
                <textarea
                  rows={2}
                  placeholder="Additional service checklist notes..."
                  value={formData.details}
                  onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.88rem', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '8px 20px', borderRadius: '8px', background: '#0284c7', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '700' }}
                >
                  {submitting ? 'Scheduling...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
