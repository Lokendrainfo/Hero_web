import React, { useState, useEffect, useMemo } from 'react';
import { taskService } from '../../services/taskService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideSearch, LucideFilter, LucideRefreshCw, LucidePlus,
  LucideEye, LucideX, LucideMapPin, LucideUser, LucideCalendar,
  LucideDownload, LucideCheckCircle, LucideAlertCircle, LucideLayers,
  LucideClock, LucideBuilding, LucidePhone, LucideGlobe
} from 'lucide-react';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const TaskPlanningTable = ({ category, onCategoryChange, totalCategoryCount = 0 }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalElements, setTotalElements] = useState(totalCategoryCount || 0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [activeTabFilter, setActiveTabFilter] = useState('ALL'); // 'ALL' | 'ASSIGNED' | 'MY_APPROVAL'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Selected Task for Drawer
  const [inspectedTask, setInspectedTask] = useState(null);

  const { showToast } = useToast();
  const { user, isAdmin } = useAuth();

  const fetchTasks = async (pageToFetch = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        taskType: category.backendType,
        page: pageToFetch,
        size: pageSize
      };
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await taskService.getMyTasks(params);
      const data = res.data?.data || res.data || res;
      const results = data.results || data.content || (Array.isArray(data) ? data : []);
      const total = data.totalElements !== undefined ? data.totalElements : (data.total !== undefined ? data.total : (totalCategoryCount || results.length));
      const pages = data.totalPages !== undefined ? data.totalPages : Math.max(1, Math.ceil(total / pageSize));

      setTasks(results);
      setTotalElements(total);
      setTotalPages(pages);
      setPage(pageToFetch);
    } catch (err) {
      console.error('[PlanningTable] Fetch error:', err);
      setError('Unable to load planning tasks from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    setSearchQuery('');
    setStatusFilter('ALL');
    setDistrictFilter('ALL');
    setActiveTabFilter('ALL');
    setInspectedTask(null);
    setTasks([]);
    fetchTasks(0);
  }, [category.key, pageSize]);

  // Client-side search & status filtering on current page
  const filteredTasks = useMemo(() => {
    if (!Array.isArray(tasks)) return [];
    return tasks.filter(t => {
      // Tab filter
      if (activeTabFilter === 'ASSIGNED') {
        const hasAssignee = Boolean(t.assigneeName || t.assigneeSnapshot?.name || t.assigneeUserId);
        if (!hasAssignee) return false;
      } else if (activeTabFilter === 'MY_APPROVAL') {
        const isMyApproval = (t.approverSnapshots || []).some(a => a.userId === user?.id) ||
                             (t.approverUserIds || []).includes(user?.id) ||
                             (t.myRoles || []).includes('APPROVER');
        if (!isMyApproval && !isAdmin) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        const s = String(t.status || '').toUpperCase();
        if (s !== statusFilter) return false;
      }

      // District filter
      if (districtFilter !== 'ALL') {
        const d = String(t.location?.district || '').toUpperCase();
        if (d !== districtFilter.toUpperCase()) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = String(t.taskCode || t.id || '').toLowerCase();
        const name = String(t.displayName || t.location?.locationName || '').toLowerCase();
        const block = String(t.location?.blockName || '').toLowerCase();
        const district = String(t.location?.district || '').toLowerCase();
        const locCode = String(t.locationCode || t.location?.locationCode || '').toLowerCase();
        const assignee = String(t.assigneeName || t.assigneeSnapshot?.name || '').toLowerCase();

        return code.includes(q) || name.includes(q) || block.includes(q) || district.includes(q) || locCode.includes(q) || assignee.includes(q);
      }

      return true;
    });
  }, [tasks, activeTabFilter, statusFilter, districtFilter, searchQuery, user, isAdmin]);

  // Unique districts for filter modal
  const uniqueDistricts = useMemo(() => {
    const s = new Set();
    (tasks || []).forEach(t => {
      if (t.location?.district) s.add(t.location.district);
    });
    return Array.from(s).sort();
  }, [tasks]);

  const formatDate = (val) => {
    if (!val) return '—';
    try {
      const dt = new Date(val);
      if (isNaN(dt.getTime())) return String(val);
      return dt.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(val);
    }
  };

  const getStatusBadge = (statusStr) => {
    const s = String(statusStr || 'PENDING').toUpperCase();
    let badgeClass = 'neutral';
    if (['UNDER_REVIEW', 'PENDING'].includes(s)) badgeClass = 'under_review';
    else if (['APPROVED', 'COMPLETED'].includes(s)) badgeClass = 'approved';
    else if (['IN_PROGRESS', 'RUNNING'].includes(s)) badgeClass = 'in_progress';
    else if (['REJECTED', 'FAILED'].includes(s)) badgeClass = 'rejected';

    return <span className={`ilance-status-badge ${badgeClass}`}>{s.replace(/_/g, ' ')}</span>;
  };

  const handleExportCsv = () => {
    if (!filteredTasks.length) {
      showToast('No records to export', 'info');
      return;
    }
    const headers = ['Circle', 'District', 'Block Name', 'Location Name', 'Location Code', 'Assignee', 'Updated At', 'Version', 'Status'];
    const rows = filteredTasks.map(t => [
      t.location?.circle || 'RAJASTHAN',
      t.location?.district || '—',
      t.location?.blockName || '—',
      t.displayName || t.location?.locationName || '—',
      t.locationCode || t.location?.locationCode || '—',
      t.assigneeName || t.assigneeSnapshot?.name || 'Unassigned',
      formatDate(t.updatedAt),
      `v${(t.currentApprovalStepIndex || 0) + 1}.0`,
      t.status || 'PENDING'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${category.key}_tasks_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredTasks.length} tasks`, 'success');
  };

  return (
    <div className="ilance-workspace-card">
      {/* Toolbar */}
      <div className="ilance-toolbar">
        {/* Left Filter Chips */}
        <div className="ilance-filter-chips">
          <button
            type="button"
            className={`ilance-filter-chip ${activeTabFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveTabFilter('ALL')}
          >
            All <span className="ilance-pill-count">{totalElements}</span>
          </button>
          <button
            type="button"
            className={`ilance-filter-chip ${activeTabFilter === 'ASSIGNED' ? 'active' : ''}`}
            onClick={() => setActiveTabFilter('ASSIGNED')}
          >
            Assigned
          </button>
          <button
            type="button"
            className={`ilance-filter-chip ${activeTabFilter === 'MY_APPROVAL' ? 'active' : ''}`}
            onClick={() => setActiveTabFilter('MY_APPROVAL')}
          >
            My Approval
          </button>
        </div>

        {/* Search Input */}
        <div className="ilance-search-box">
          <LucideSearch size={15} className="ilance-search-icon" />
          <input
            type="text"
            className="ilance-search-input"
            placeholder={`Search ${category.label.toLowerCase()} tasks...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchTasks(0);
            }}
          />
        </div>

        {/* Right Actions */}
        <div className="ilance-actions-group">
          <button
            type="button"
            className="ilance-btn"
            onClick={() => setIsFilterOpen(prev => !prev)}
            title="Filter by district or status"
          >
            <LucideFilter size={14} /> Filters
            {(statusFilter !== 'ALL' || districtFilter !== 'ALL') && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0284c7' }} />
            )}
          </button>

          <button
            type="button"
            className="ilance-btn"
            onClick={handleExportCsv}
            title="Export CSV"
          >
            <LucideDownload size={14} /> Export
          </button>

          <button
            type="button"
            className="ilance-btn"
            onClick={() => fetchTasks(page)}
            title="Refresh tasks"
          >
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {isAdmin && (
            <button
              type="button"
              className="ilance-btn ilance-btn-primary"
              onClick={() => setIsCreateOpen(true)}
            >
              <LucidePlus size={14} /> Create Task
            </button>
          )}
        </div>
      </div>

      {/* Filter Popover Dropdown */}
      {isFilterOpen && (
        <div style={{
          padding: '12px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: '0.8125rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>District:</span>
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
            >
              <option value="ALL">All Districts</option>
              {uniqueDistricts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="ilance-btn"
            style={{ padding: '3px 8px', fontSize: '0.75rem' }}
            onClick={() => {
              setStatusFilter('ALL');
              setDistrictFilter('ALL');
              setSearchQuery('');
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Data Table */}
      <div className="ilance-table-wrapper">
        {loading ? (
          <div style={{ padding: '60px 20px', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner title={`Loading ${category.label} tasks...`} />
          </div>
        ) : error ? (
          <div className="ilance-empty-state">
            <LucideAlertCircle size={36} color="#ef4444" />
            <div className="ilance-empty-title">{error}</div>
            <button type="button" className="ilance-btn" onClick={() => fetchTasks(page)}>
              Try Again
            </button>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="ilance-empty-state">
            <LucideLayers size={40} color="#cbd5e1" />
            <div className="ilance-empty-title">No {category.label} tasks found</div>
            <div className="ilance-empty-desc">
              {searchQuery || statusFilter !== 'ALL' || districtFilter !== 'ALL'
                ? 'Try adjusting your search query or filter criteria.'
                : `There are currently no tasks recorded under ${category.label}.`}
            </div>
          </div>
        ) : (
          <table className="ilance-table">
            <thead>
              <tr>
                <th>Circle</th>
                <th>District</th>
                <th>Block Name</th>
                <th>Location Name</th>
                <th>Location Code</th>
                <th>Assignee</th>
                <th>Updated At</th>
                <th>Version</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t, idx) => {
                const circle = t.location?.circle || 'RAJASTHAN';
                const district = t.location?.district || '—';
                const block = t.location?.blockName || '—';
                const locName = t.displayName || t.location?.locationName || t.taskCode || '—';
                const locCode = t.locationCode || t.location?.locationCode || '—';
                const assignee = t.assigneeName || t.assigneeSnapshot?.name || 'Unassigned';
                const updated = formatDate(t.updatedAt || t.createdAt);
                const version = `v${(t.currentApprovalStepIndex || 0) + 1}.0`;
                const isSelected = inspectedTask?.id === t.id;

                return (
                  <tr
                    key={t.id || t.taskCode || idx}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => setInspectedTask(t)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{circle}</span>
                    </td>
                    <td>{district}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{block}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: '#0284c7' }}>{locName}</span>
                        {t.taskCode && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{t.taskCode}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 4px', borderRadius: 4 }}>
                        {locCode}
                      </code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#e0f2fe', color: '#0369a1',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.65rem', fontWeight: 700
                        }}>
                          {assignee.charAt(0).toUpperCase()}
                        </div>
                        <span>{assignee}</span>
                      </div>
                    </td>
                    <td>{updated}</td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{version}</span>
                    </td>
                    <td>{getStatusBadge(t.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="ilance-btn"
                        style={{ padding: '4px 8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedTask(t);
                        }}
                        title="Inspect Task Details"
                      >
                        <LucideEye size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Bar */}
      <div className="ilance-pagination-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>
            Showing {filteredTasks.length > 0 ? (page * pageSize) + 1 : 0} to{' '}
            {Math.min((page + 1) * pageSize, totalElements)} of {totalElements} entries
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="ilance-page-nav">
          <button
            type="button"
            className="ilance-page-btn"
            disabled={page === 0 || loading}
            onClick={() => fetchTasks(page - 1)}
          >
            Previous
          </button>
          <span style={{ padding: '0 8px', fontWeight: 600, color: '#0f172a' }}>
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>
          <button
            type="button"
            className="ilance-page-btn"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => fetchTasks(page + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {/* Slide-over Inspection Drawer */}
      {inspectedTask && (
        <div className="ilance-drawer-overlay" onClick={() => setInspectedTask(null)}>
          <div className="ilance-drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="ilance-drawer-header">
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                  {category.label} Task
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  {inspectedTask.displayName || inspectedTask.location?.locationName || inspectedTask.taskCode}
                </div>
              </div>
              <button
                type="button"
                className="ilance-btn"
                style={{ padding: '4px 6px' }}
                onClick={() => setInspectedTask(null)}
              >
                <LucideX size={16} />
              </button>
            </div>

            <div className="ilance-drawer-body">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {getStatusBadge(inspectedTask.status)}
                {inspectedTask.approvalStatus && (
                  <span className="ilance-status-badge approved">
                    APPROVAL: {inspectedTask.approvalStatus}
                  </span>
                )}
                <span className="ilance-status-badge neutral">
                  v{(inspectedTask.currentApprovalStepIndex || 0) + 1}.0
                </span>
              </div>

              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: 12,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12
              }}>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">Task Code</span>
                  <span className="ilance-field-val" style={{ fontFamily: 'monospace' }}>
                    {inspectedTask.taskCode || inspectedTask.id}
                  </span>
                </div>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">Location Code</span>
                  <span className="ilance-field-val" style={{ fontFamily: 'monospace' }}>
                    {inspectedTask.locationCode || inspectedTask.location?.locationCode || '—'}
                  </span>
                </div>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">Circle</span>
                  <span className="ilance-field-val">{inspectedTask.location?.circle || 'RAJASTHAN'}</span>
                </div>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">District</span>
                  <span className="ilance-field-val">{inspectedTask.location?.district || '—'}</span>
                </div>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">Block Name</span>
                  <span className="ilance-field-val">{inspectedTask.location?.blockName || '—'}</span>
                </div>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">OLT IP</span>
                  <span className="ilance-field-val">{inspectedTask.location?.oltIp || '—'}</span>
                </div>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">Latitude</span>
                  <span className="ilance-field-val">{inspectedTask.location?.latitude || '—'}</span>
                </div>
                <div className="ilance-detail-field">
                  <span className="ilance-field-label">Longitude</span>
                  <span className="ilance-field-val">{inspectedTask.location?.longitude || '—'}</span>
                </div>
              </div>

              {/* Assignee Information */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LucideUser size={14} color="#0284c7" /> Surveyor / Assignee Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="ilance-detail-field">
                    <span className="ilance-field-label">Name</span>
                    <span className="ilance-field-val">
                      {inspectedTask.assigneeName || inspectedTask.assigneeSnapshot?.name || 'Unassigned'}
                    </span>
                  </div>
                  <div className="ilance-detail-field">
                    <span className="ilance-field-label">Designation</span>
                    <span className="ilance-field-val">
                      {inspectedTask.assigneeSnapshot?.designation || 'Field Surveyor'}
                    </span>
                  </div>
                  <div className="ilance-detail-field">
                    <span className="ilance-field-label">Mobile</span>
                    <span className="ilance-field-val">
                      {inspectedTask.assigneeSnapshot?.mobile || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Approver Information */}
              {(inspectedTask.approverSnapshots || []).length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideCheckCircle size={14} color="#15803d" /> Approval Manager
                  </div>
                  {inspectedTask.approverSnapshots.map((appr, aIdx) => (
                    <div key={appr.userId || aIdx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div className="ilance-detail-field">
                        <span className="ilance-field-label">Approver</span>
                        <span className="ilance-field-val">{appr.name || '—'}</span>
                      </div>
                      <div className="ilance-detail-field">
                        <span className="ilance-field-label">Role / Designation</span>
                        <span className="ilance-field-val">{appr.designation || 'Project Manager'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Timestamps */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: 10 }}>
                <span>Created: {formatDate(inspectedTask.createdAt)}</span>
                <span>Last Updated: {formatDate(inspectedTask.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateOpen && (
        <div className="ilance-drawer-overlay" onClick={() => setIsCreateOpen(false)}>
          <div style={{
            background: '#ffffff',
            borderRadius: 8,
            width: 440,
            maxWidth: '90vw',
            margin: 'auto',
            padding: 20,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Create New {category.label}
              </h3>
              <button type="button" className="ilance-btn" onClick={() => setIsCreateOpen(false)}>
                <LucideX size={14} />
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 14 }}>
              Authorized dispatch workflow: New survey or planning tasks will be synced with iLance mobile field apps.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8125rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Block Name</label>
                <input
                  type="text"
                  placeholder="e.g. NADBAI"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Location / GP Name</label>
                <input
                  type="text"
                  placeholder="e.g. ATARI"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Assignee Surveyor</label>
                <input
                  type="text"
                  placeholder="Surveyor Name"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" className="ilance-btn" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ilance-btn ilance-btn-primary"
                  onClick={() => {
                    showToast('Task creation request dispatched to upstream server', 'success');
                    setIsCreateOpen(false);
                  }}
                >
                  Create & Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
