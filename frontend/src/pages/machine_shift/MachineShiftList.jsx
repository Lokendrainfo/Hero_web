import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LucideTruck, LucidePlus, LucideSearch, LucideFilter,
  LucideDownload, LucideRefreshCw, LucideEye, LucideCalendar,
  LucideMapPin, LucideShieldCheck, LucideCheckCircle, LucideAlertTriangle,
  LucideClock, LucideArrowRight, LucideX
} from 'lucide-react';
import { machineShiftService } from '../../services/machineShiftService';
import { vendorService } from '../../services/vendorService';
import { machineService } from '../../services/machineService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { MachineShiftDetailModal } from './MachineShiftDetailModal';
import { MachineShiftCreate } from './MachineShiftCreate';
import { Pagination } from '../../components/common/Pagination';
import { SearchableSelect } from '../../components/common/Select';
import '../../styles/components.css';

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

export const MachineShiftList = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, isAdmin, hasRole, hasPermission } = useAuth();

  // Role flags
  const isScm = isAdmin || hasRole('SCM') || hasRole('SCM_MANAGER') || hasPermission('machine_shift.scm_review') || hasPermission('machine_shift.scm_confirm');
  const isShifter = isAdmin || hasRole('SHIFTER') || hasRole('OPERATOR') || hasPermission('machine_shift.shift');
  const canCreate = isAdmin || hasPermission('machine_shift.create') || !user?.role || user?.role === 'VENDOR_ADMIN' || user?.role === 'VENDOR_USER' || user?.role === 'VENDOR';

  // Data states
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Masters for filters
  const [vendors, setVendors] = useState([]);
  const [machines, setMachines] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [machineFilter, setMachineFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modals
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Fetch filter masters
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const [vRes, mRes] = await Promise.all([
          vendorService.getVendors().catch(() => []),
          machineService.getAll({ page_size: 250 }).catch(() => [])
        ]);
        setVendors(ensureArray(vRes));
        setMachines(ensureArray(mRes));
      } catch (err) {
        console.error("Failed to load filter options", err);
      }
    };
    fetchMasters();
  }, []);

  // Fetch Shift Requests
  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: page,
        page_size: pageSize
      };
      if (search.trim()) params.search = search.trim();
      if (vendorFilter !== 'ALL') params.vendor = vendorFilter;
      if (machineFilter !== 'ALL') params.machine = machineFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await machineShiftService.getRequests(params);
      const dataList = ensureArray(res);
      const count = res?.meta?.count ?? res?.count ?? (res?.data?.total || dataList.length);

      setRequests(dataList);
      setTotalCount(count);
    } catch (err) {
      console.error("Error fetching machine shift requests", err);
      showToast('Failed to load machine shift requests.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, vendorFilter, machineFilter, statusFilter, dateFrom, dateTo, showToast]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Status Badge Helper
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PENDING_SHIFTING':
        return <span className="badge-pill badge-amber">Pending SCM</span>;
      case 'APPROVED_BY_SCM':
        return <span className="badge-pill badge-blue">Approved SCM</span>;
      case 'IN_PROGRESS':
        return <span className="badge-pill badge-purple">In Progress</span>;
      case 'SHIFTED':
        return <span className="badge-pill badge-blue">Shifted</span>;
      case 'CONFIRMED':
        return <span className="badge-pill badge-green">Confirmed</span>;
      case 'REJECTED':
        return <span className="badge-pill badge-breakdown">Rejected</span>;
      case 'CANCELLED':
        return <span className="badge-pill badge-neutral">Cancelled</span>;
      default:
        return <span className="badge-pill badge-neutral">{status}</span>;
    }
  };

  // KPI counts computed from current page / response
  const kpis = useMemo(() => {
    const counts = {
      total: totalCount,
      pending: requests.filter(r => r.status === 'PENDING_SHIFTING').length,
      approved: requests.filter(r => r.status === 'APPROVED_BY_SCM').length,
      inProgress: requests.filter(r => r.status === 'IN_PROGRESS').length,
      shifted: requests.filter(r => r.status === 'SHIFTED').length,
      confirmed: requests.filter(r => r.status === 'CONFIRMED').length,
    };
    return counts;
  }, [requests, totalCount]);

  const handleExportCsv = () => {
    const exportUrl = machineShiftService.exportCsvUrl();
    window.open(exportUrl, '_blank');
  };

  const handleClearFilters = () => {
    setSearch('');
    setVendorFilter('ALL');
    setMachineFilter('ALL');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleOpenDetail = async (req) => {
    try {
      // Fetch full detailed object
      const fullReq = await machineShiftService.getRequestById(req.id);
      setSelectedRequest(fullReq);
    } catch {
      setSelectedRequest(req);
    }
  };

  const handleRequestUpdated = () => {
    loadRequests();
    if (selectedRequest) {
      machineShiftService.getRequestById(selectedRequest.id)
        .then(updated => setSelectedRequest(updated))
        .catch(() => setSelectedRequest(null));
    }
  };

  return (
    <div className="app-page-container" style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <LucideTruck size={22} style={{ color: 'var(--accent)' }} /> Machine Shift Requests
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
            Manage machinery relocation requests, SCM approvals, shifter execution, and invoice confirmations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={handleExportCsv} title="Export CSV">
            <LucideDownload size={15} /> Export CSV
          </button>
          <button type="button" className="btn btn-secondary" onClick={loadRequests} title="Refresh">
            <LucideRefreshCw size={15} /> Refresh
          </button>
          {canCreate && (
            <button type="button" className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
              <LucidePlus size={16} /> New Shift Request
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Requests</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{kpis.total}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.75rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending SCM</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>{kpis.pending}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.75rem', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In Progress</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#8b5cf6', marginTop: 2 }}>{kpis.inProgress}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.75rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shifted</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#3b82f6', marginTop: 2 }}>{kpis.shifted}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.75rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confirmed & Locked</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981', marginTop: 2 }}>{kpis.confirmed}</div>
        </div>
      </div>

      {/* Filter Panel */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
          {/* Search */}
          <div style={{ gridColumn: 'span 1' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Search</label>
            <div style={{ position: 'relative' }}>
              <LucideSearch size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="ID, machine, vendor, site..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                style={{ paddingLeft: 30, height: 36, width: '100%' }}
              />
            </div>
          </div>

          {/* Vendor Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Vendor</label>
            <SearchableSelect
              value={vendorFilter}
              onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
              placeholder="All Vendors"
              searchPlaceholder="Search vendor..."
            >
              <option value="ALL">All Vendors</option>
              {vendors.map(v => (
                <option key={v.id || v.external_vendor_id} value={v.id || v.external_vendor_id}>{v.name}</option>
              ))}
            </SearchableSelect>
          </div>

          {/* Machine Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Machine</label>
            <SearchableSelect
              value={machineFilter}
              onChange={(e) => { setMachineFilter(e.target.value); setPage(1); }}
              placeholder="All Machines"
              searchPlaceholder="Search machine..."
            >
              <option value="ALL">All Machines</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.name} [{m.machine_chassis_no || m.serial_number || m.id}]</option>
              ))}
            </SearchableSelect>
          </div>

          {/* Status Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Status</label>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ height: 36, width: '100%' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_SHIFTING">Pending SCM</option>
              <option value="APPROVED_BY_SCM">Approved by SCM</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="SHIFTED">Shifted</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Required Date From</label>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              style={{ height: 36, width: '100%' }}
            />
          </div>

          {/* Date To */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Required Date To</label>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              style={{ height: 36, width: '100%' }}
            />
          </div>

          {/* Clear Button */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClearFilters}
              style={{ height: 36, width: '100%' }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Request ID</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Vendor</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Machine</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Origin (A) → Destination (B)</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Required Date</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Mode</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Reason</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Assigned Shifter</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Created By</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    Loading machine shift requests...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    No machine shift requests found matching criteria.
                  </td>
                </tr>
              ) : (
                requests.map(req => (
                  <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }} className="table-row-hover">
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span
                        onClick={() => handleOpenDetail(req)}
                        style={{ cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline' }}
                      >
                        {req.request_id}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>
                      <div>{req.vendor_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{req.vendor_code}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{req.machine_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {req.machine_chassis_no || req.machine_code}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#3b82f6', fontWeight: 500 }} title={req.a_point_name}>{req.a_point_name}</span>
                        <LucideArrowRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ color: '#10b981', fontWeight: 500 }} title={req.b_point_name}>{req.b_point_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      {req.required_date}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      {req.mode_of_shifting === 'OWN_HDD' ? 'Own-HDD' : 'By Truck'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      {req.reason_name}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {renderStatusBadge(req.status)}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      {req.assigned_shifter_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      <div>{req.created_by_name || 'System'}</div>
                      <div>{req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}</div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={() => handleOpenDetail(req)}
                      >
                        <LucideEye size={13} style={{ marginRight: 4 }} /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing {requests.length} of {totalCount} requests
          </div>
          {totalCount > pageSize && (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(totalCount / pageSize)}
              onPageChange={(newPage) => setPage(newPage)}
            />
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <MachineShiftDetailModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onUpdated={handleRequestUpdated}
          currentUser={user}
          isAdmin={isAdmin}
          isScm={isScm}
          isShifter={isShifter}
        />
      )}

      {/* Create Request Modal */}
      {isCreateModalOpen && (
        <MachineShiftCreate
          isModal={true}
          onCreated={() => {
            setIsCreateModalOpen(false);
            loadRequests();
          }}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      )}

    </div>
  );
};
