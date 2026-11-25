import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LucideDownload,
  LucideEye,
  LucideHistory,
  LucideRefreshCw,
  LucideSearch,
  LucideWrench,
} from 'lucide-react';
import { pmService } from '../../services/pmService';
import { vendorService } from '../../services/vendorService';
import { userService } from '../../services/userService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/Select';
import { DateField } from '../../components/common/DateField';
import { PmLayoutHeader, PM_FREQUENCY_LABELS, pmStatusBadge } from './PmLayoutHeader';
import { PmSubmissionDetailModal } from './PmSubmissionDetailModal';

const unwrapList = (res) => {
  const payload = res?.data || res || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.vendors)) return payload.vendors;
  return [];
};

export const PmDashboardPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({
    role_info: { role: '', is_admin: false, can_review: false, allowed_frequencies: [] },
    kpis: {
      total_machines: 0,
      maintenance_due: 0,
      maintenance_completed: 0,
      pending_maintenance: 0,
      overdue_maintenance: 0,
      total_submissions: 0,
    },
    frequency_completion: [],
    machines: [],
  });

  // Filters (Date range, Machine, Vendor, User, Frequency, Status)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [machineFilter, setMachineFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [frequencyFilter, setFrequencyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Dropdown Masters
  const [machineOptions, setMachineOptions] = useState([]);
  const [vendorOptions, setVendorOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);

  // Detail Modal
  const [selectedDetail, setSelectedDetail] = useState(null);

  useEffect(() => {
    pmService.getMachines().then((res) => setMachineOptions(res?.data || [])).catch(() => {});
    if (isAdmin) {
      vendorService.getVendors({ page_size: 100 }).then((res) => setVendorOptions(unwrapList(res))).catch(() => {});
      userService.getUsers({ page_size: 200 }).then((res) => setUserOptions(unwrapList(res))).catch(() => {});
    }
  }, [isAdmin]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (machineFilter !== 'ALL') params.machine_id = machineFilter;
      if (vendorFilter !== 'ALL') params.vendor_id = vendorFilter;
      if (userFilter !== 'ALL') params.user_id = userFilter;
      if (frequencyFilter !== 'ALL') params.frequency = frequencyFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await pmService.getDashboard(params);
      if (res?.data) {
        setDashboard(res.data);
      }
    } catch (err) {
      showToast(err?.message || 'Failed to load maintenance dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, machineFilter, vendorFilter, userFilter, frequencyFilter, statusFilter, search, showToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleOpenLastSubmission = async (submissionId) => {
    try {
      const res = await pmService.getSubmissionDetail(submissionId);
      setSelectedDetail(res?.data || null);
    } catch (err) {
      showToast(err?.message || 'Unable to load maintenance record.', 'error');
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (machineFilter !== 'ALL') params.machine_id = machineFilter;
      if (vendorFilter !== 'ALL') params.vendor_id = vendorFilter;
      if (userFilter !== 'ALL') params.user_id = userFilter;
      if (frequencyFilter !== 'ALL') params.frequency = frequencyFilter;
      const blob = await pmService.downloadReportCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pm_maintenance_report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err?.message || 'Failed to export CSV report.', 'error');
    }
  };

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setMachineFilter('ALL');
    setVendorFilter('ALL');
    setUserFilter('ALL');
    setFrequencyFilter('ALL');
    setStatusFilter('ALL');
    setSearch('');
  };

  const { kpis, role_info: roleInfo, frequency_completion: freqCompletion, machines } = dashboard;
  const allowedFreqs = roleInfo?.allowed_frequencies || [];

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="Machine Preventive Maintenance"
        subtitle="Operations → Machine Maintenance · Fleet PM compliance, checklists & photo evidence"
        roleInfo={roleInfo}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={handleExportCsv}>
              <LucideDownload size={14} /> Export CSV
            </button>
            <button type="button" className="btn-secondary" onClick={loadDashboard}>
              <LucideRefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </>
        }
      />

      {/* KPI Summary Strip */}
      <div className="kpi-strip">
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Total Machines</div>
          <div className="kpi-value">{kpis.total_machines}</div>
          <div className="kpi-sub">Authorized HERO fleet</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Maintenance Due</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{kpis.maintenance_due}</div>
          <div className="kpi-sub">Approaching interval</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Maintenance Completed</div>
          <div className="kpi-value" style={{ color: 'var(--live)' }}>{kpis.maintenance_completed}</div>
          <div className="kpi-sub">{kpis.total_submissions || 0} submissions in range</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Pending Maintenance</div>
          <div className="kpi-value" style={{ color: 'var(--info)' }}>{kpis.pending_maintenance}</div>
          <div className="kpi-sub">Scheduled in cycle</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Overdue Maintenance</div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{kpis.overdue_maintenance}</div>
          <div className="kpi-sub">Immediate action required</div>
        </div>
      </div>

      {/* Frequency-wise Completion */}
      {freqCompletion && freqCompletion.length > 0 ? (
        <div className="app-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Frequency-wise Completion</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Allowed Frequencies: {allowedFreqs.map((f) => PM_FREQUENCY_LABELS[f] || f).join(', ') || 'None'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            {freqCompletion.map((fc) => (
              <div
                key={fc.frequency_code}
                style={{
                  padding: '12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '0.82rem' }}>{fc.frequency_name}</strong>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {fc.completion_rate}%
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(100, fc.completion_rate)}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  <span>Done: {fc.completed}</span>
                  <span>Due: {fc.due}</span>
                  <span style={{ color: fc.overdue > 0 ? 'var(--danger)' : undefined }}>Overdue: {fc.overdue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Filters Toolbar */}
      <div className="app-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="filter-row">
          <button
            type="button"
            className={`filter-chip${frequencyFilter === 'ALL' ? ' active' : ''}`}
            onClick={() => setFrequencyFilter('ALL')}
          >
            All Allowed Frequencies
          </button>
          {allowedFreqs.map((fCode) => (
            <button
              key={fCode}
              type="button"
              className={`filter-chip${frequencyFilter === fCode ? ' active' : ''}`}
              onClick={() => setFrequencyFilter(fCode)}
            >
              {PM_FREQUENCY_LABELS[fCode] || fCode}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <LucideSearch size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              type="search"
              placeholder="Search machine, chassis, vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: '36px',
                padding: '0 10px 0 30px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius)',
                fontSize: '0.8125rem',
              }}
            />
          </div>

          <SearchableSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses</option>
            <option value="DUE">Maintenance Due</option>
            <option value="OVERDUE">Overdue</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
          </SearchableSelect>

          <SearchableSelect value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)}>
            <option value="ALL">All Machines</option>
            {machineOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.machine_chassis_no || m.name}
              </option>
            ))}
          </SearchableSelect>

          {isAdmin ? (
            <SearchableSelect value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
              <option value="ALL">All Vendors</option>
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </SearchableSelect>
          ) : null}

          {isAdmin ? (
            <SearchableSelect value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="ALL">All Users</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.username} ({u.role})</option>
              ))}
            </SearchableSelect>
          ) : null}

          <DateField value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From date" />
          <DateField value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To date" />

          <button type="button" className="btn-secondary" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      </div>

      {/* Machine-wise Maintenance Status Table */}
      <div className="table-container app-card">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Machine-wise Maintenance Status</strong>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {machines.length} machines
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Loading fleet maintenance status...
          </div>
        ) : machines.length === 0 ? (
          <div className="empty-state" style={{ margin: '16px' }}>
            <h3>No machines match your filters</h3>
            <p>Try clearing status, frequency, or date filters.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Model & Hour Meter</th>
                <th>Vendor & Operator</th>
                <th>Last Maintenance</th>
                <th>Next Due</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const defaultFreq = frequencyFilter !== 'ALL' ? frequencyFilter : (allowedFreqs[0] || 'DAILY');
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{m.machine_number}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {m.name} ({m.code})
                      </div>
                    </td>
                    <td>
                      <div>{m.model_name || 'APOLLO A600 V2'}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {m.engine_hours} hrs
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.vendor_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Op: {m.operator_name}</div>
                    </td>
                    <td>
                      {m.last_maintenance ? (
                        <button
                          type="button"
                          onClick={() => handleOpenLastSubmission(m.last_maintenance.id)}
                          style={{ textAlign: 'left', color: 'var(--link)', fontSize: '0.78rem', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            {m.last_maintenance.frequency_name} · {m.last_maintenance.date}
                          </div>
                          <div style={{ color: 'var(--text-muted)' }}>
                            By {m.last_maintenance.performed_by} ({m.last_maintenance.hour_meter} hrs)
                          </div>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Never Recorded</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{m.next_due_label}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{m.location_name}</div>
                    </td>
                    <td>
                      <span className={pmStatusBadge(m.status)}>{m.status}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {allowedFreqs.length > 0 ? (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                            onClick={() => navigate(`/operations/machine-maintenance/perform/${m.id}/${defaultFreq}`)}
                          >
                            <LucideWrench size={13} /> Perform
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                          onClick={() => navigate(`/operations/machine-maintenance/machine/${m.id}`)}
                          title="Machine-wise maintenance history"
                        >
                          <LucideHistory size={13} /> History
                        </button>
                        {m.last_maintenance ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ padding: '5px 8px' }}
                            onClick={() => handleOpenLastSubmission(m.last_maintenance.id)}
                            title="View latest submission"
                          >
                            <LucideEye size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <PmSubmissionDetailModal
        isOpen={Boolean(selectedDetail)}
        onClose={() => setSelectedDetail(null)}
        submission={selectedDetail}
        canReview={roleInfo?.can_review}
        onReviewed={() => {
          if (selectedDetail) handleOpenLastSubmission(selectedDetail.id);
          loadDashboard();
        }}
      />
    </div>
  );
};

