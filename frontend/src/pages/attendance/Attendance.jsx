import React, { useCallback, useEffect, useState } from 'react';
import {
  LucideCalendar,
  LucideCalendarCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideClock,
  LucideEye,
  LucideLock,
  LucideMapPin,
  LucideRefreshCw,
  LucideSearch,
  LucideShieldAlert,
  LucideUsers,
  LucideX,
} from 'lucide-react';
import '../../styles/components.css';
import { ilyncAttendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { DateField } from '../../components/common/DateField';
import { SearchableSelect } from '../../components/common/Select';
import {
  IlyncMachineProofCell,
  IlyncSecureImage,
  IlyncTeamProofCell,
  formatCoords,
  formatDateTimeShort,
  getGeoVerdictBadgeStyle,
} from './IlyncAttendancePhoto';
import { IlyncApprovalFlow } from './IlyncApprovalFlow';
import { IlyncAttendanceDetailModal, getStatusBadgeClass } from './IlyncAttendanceDetailModal';

export const Attendance = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('records'); // 'records' | 'pending' | 'today'

  // All Records state (exact iLance response data.{content, page})
  const [records, setRecords] = useState([]);
  const [pageInfo, setPageInfo] = useState({ size: 10, number: 0, totalElements: 0, totalPages: 0 });
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState('');

  // Exact iLance list query parameters (forwarded directly, no HERO-side filtering)
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [statusParam, setStatusParam] = useState('');
  const [onBehalfParam, setOnBehalfParam] = useState('');
  const [fromDateParam, setFromDateParam] = useState('');
  const [toDateParam, setToDateParam] = useState('');
  const [districtParam, setDistrictParam] = useState('');
  const [blockParam, setBlockParam] = useState('');

  // Pending Approval state (exact GET /api/attendance/pending-approval)
  const [pendingRecords, setPendingRecords] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState('');

  // Today / Daily + Eligible Users state
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [selectedForUserId, setSelectedForUserId] = useState('');
  const [todayRecord, setTodayRecord] = useState(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState('');

  // Lightbox & Detail modal
  const [detailRecord, setDetailRecord] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const fetchAllRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const params = { page, size: pageSize };
      if (searchParam) params.search = searchParam;
      if (statusParam) params.status = statusParam;
      if (onBehalfParam !== '') params.onBehalf = onBehalfParam;
      if (fromDateParam) params.fromDate = fromDateParam;
      if (toDateParam) params.toDate = toDateParam;
      if (districtParam.trim()) params.district = districtParam.trim();
      if (blockParam.trim()) params.block = blockParam.trim();

      const res = await ilyncAttendanceService.getList(params);
      const dataObj = res?.data || {};
      const content = Array.isArray(dataObj.content) ? dataObj.content : [];
      const p = dataObj.page || { size: pageSize, number: page, totalElements: content.length, totalPages: 0 };
      setRecords(content);
      setPageInfo({
        size: p.size ?? pageSize,
        number: p.number ?? page,
        totalElements: p.totalElements ?? content.length,
        totalPages: p.totalPages ?? 0,
      });
    } catch (err) {
      const msg = err?.message || 'Failed to fetch attendance records from iLance.';
      setRecordsError(msg);
      setRecords([]);
      showToast(msg, 'error');
    } finally {
      setRecordsLoading(false);
    }
  }, [page, pageSize, searchParam, statusParam, onBehalfParam, fromDateParam, toDateParam, districtParam, blockParam, showToast]);

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError('');
    try {
      const res = await ilyncAttendanceService.getPendingApproval();
      const list = Array.isArray(res?.data) ? res.data : [];
      setPendingRecords(list);
    } catch (err) {
      const msg = err?.message || 'Failed to fetch pending approvals from iLance.';
      setPendingError(msg);
      setPendingRecords([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const fetchEligibleAndToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError('');
    try {
      const [eligRes, todayRes] = await Promise.allSettled([
        ilyncAttendanceService.getEligibleUsers(),
        ilyncAttendanceService.getToday(selectedForUserId || undefined),
      ]);
      if (eligRes.status === 'fulfilled') {
        const list = Array.isArray(eligRes.value?.data) ? eligRes.value.data : [];
        setEligibleUsers(list);
      }
      if (todayRes.status === 'fulfilled') {
        setTodayRecord(todayRes.value?.data || null);
      } else {
        setTodayError(todayRes.reason?.message || 'Failed to fetch daily attendance from iLance.');
        setTodayRecord(null);
      }
    } finally {
      setTodayLoading(false);
    }
  }, [selectedForUserId]);

  useEffect(() => {
    if (activeTab === 'records') {
      fetchAllRecords();
    } else if (activeTab === 'pending') {
      fetchPending();
    } else if (activeTab === 'today') {
      fetchEligibleAndToday();
    }
  }, [activeTab, fetchAllRecords, fetchPending, fetchEligibleAndToday]);

  // Also load pending count badge once on mount (lightweight GET)
  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleRefreshActive = () => {
    if (activeTab === 'records') fetchAllRecords();
    else if (activeTab === 'pending') fetchPending();
    else fetchEligibleAndToday();
  };

  const handleOpenLightbox = (attendanceId, photoObj, label, subtitle) => {
    if (!attendanceId || !photoObj?.photoKey) return;
    setLightbox({ attendanceId, photoObj, label, subtitle });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearchParam('');
    setStatusParam('');
    setOnBehalfParam('');
    setFromDateParam('');
    setToDateParam('');
    setDistrictParam('');
    setBlockParam('');
    setPage(0);
  };

  const overduePendingCount = pendingRecords.filter((r) => (r?.ageHours ?? 0) > 48).length;

  const renderAttendanceRow = (rec, idx) => {
    const loc = rec.locationSnapshot || {};
    const assignee = rec.assigneeSnapshot || {};
    const locationLine = [loc.blockName || loc.locationName || rec.locationCode, loc.district]
      .filter(Boolean)
      .join(' · ');

    return (
      <tr key={rec.id || `${rec.attendanceDate}-${rec.assigneeUserId}-${idx}`}>
        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <button
              type="button"
              onClick={() => setDetailRecord(rec)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                color: 'var(--primary)',
                fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
              }}
            >
              {rec.attendanceDate || '—'}
            </button>
            {rec.ageHours != null ? (
              <span style={{ fontSize: '0.7rem', color: rec.ageHours > 48 ? '#b45309' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <LucideClock size={10} /> {Math.round(rec.ageHours)}h old
              </span>
            ) : null}
          </div>
        </td>

        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
              {assignee.name || rec.assigneeUserId || '—'}
            </strong>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {[assignee.designation, locationLine].filter(Boolean).join(' · ') || '—'}
            </span>
          </div>
        </td>

        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
            <span className={getStatusBadgeClass(rec.personalMark)}>
              {rec.personalMark || '—'}
            </span>
            {rec.absenceReason ? (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{rec.absenceReason}</span>
            ) : null}
          </div>
        </td>

        <td>
          <IlyncTeamProofCell record={rec} onOpenLightbox={handleOpenLightbox} />
        </td>

        <td>
          <IlyncMachineProofCell record={rec} onOpenLightbox={handleOpenLightbox} />
        </td>

        <td>
          <IlyncApprovalFlow record={rec} compact />
        </td>

        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {rec.manDays ?? '—'}
        </td>

        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
            <span className={getStatusBadgeClass(rec.status)}>{rec.status || '—'}</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDetailRecord(rec)}
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
            >
              <LucideEye size={12} /> View
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Attendance</h1>
            <span className="badge-pill badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <LucideLock size={11} /> Read-Only · Live iLance Sync
            </span>
          </div>
          <p className="page-subtitle">
            Live read-only NetInfra / iLance attendance records, proof photographs, GPS verification, and approval trail
          </p>
        </div>

        <div className="filter-row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={`filter-chip ${activeTab === 'records' ? 'active' : ''}`}
            onClick={() => setActiveTab('records')}
          >
            <LucideCalendarCheck size={14} /> All Records
          </button>
          <button
            type="button"
            className={`filter-chip ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <LucideClock size={14} /> Pending Approval
            {pendingRecords.length > 0 ? (
              <span className="badge-pill badge-amber" style={{ marginLeft: '4px', padding: '0 6px', fontSize: '0.7rem' }}>
                {pendingRecords.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`filter-chip ${activeTab === 'today' ? 'active' : ''}`}
            onClick={() => setActiveTab('today')}
          >
            <LucideCalendar size={14} /> Daily / Today
          </button>
          <button type="button" className="btn-secondary" onClick={handleRefreshActive}>
            <LucideRefreshCw size={14} className={recordsLoading || pendingLoading || todayLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ALL RECORDS TAB (GET /api/attendance) */}
      {activeTab === 'records' ? (
        <>
          <form
            className="app-card"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setSearchParam(searchInput.trim());
            }}
            style={{
              padding: '14px 16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
              alignItems: 'end',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Search
              </label>
              <div style={{ position: 'relative' }}>
                <LucideSearch size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search person or block..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  style={{ width: '100%', height: '36px', padding: '0 10px 0 30px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '0.8125rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Status
              </label>
              <SearchableSelect value={statusParam} onChange={(e) => { setStatusParam(e.target.value); setPage(0); }}>
                <option value="">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </SearchableSelect>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                From Date
              </label>
              <DateField value={fromDateParam} onChange={(e) => { setFromDateParam(e?.target?.value ?? ''); setPage(0); }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                To Date
              </label>
              <DateField value={toDateParam} onChange={(e) => { setToDateParam(e?.target?.value ?? ''); setPage(0); }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Filing Mode
              </label>
              <SearchableSelect value={onBehalfParam} onChange={(e) => { setOnBehalfParam(e.target.value); setPage(0); }}>
                <option value="">All</option>
                <option value="false">Self</option>
                <option value="true">On Behalf</option>
              </SearchableSelect>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                District / Block
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="District"
                  value={districtParam}
                  onChange={(e) => { setDistrictParam(e.target.value); setPage(0); }}
                  style={{ width: '50%', height: '36px', padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '0.8rem' }}
                />
                <input
                  type="text"
                  placeholder="Block"
                  value={blockParam}
                  onChange={(e) => { setBlockParam(e.target.value); setPage(0); }}
                  style={{ width: '50%', height: '36px', padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '0.8rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn-primary" style={{ height: '36px' }}>
                Apply
              </button>
              <button type="button" className="btn-secondary" onClick={handleResetFilters} style={{ height: '36px' }}>
                Clear
              </button>
            </div>
          </form>

          {recordsError ? (
            <div className="app-card" style={{ padding: '14px 16px', borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b', fontSize: '0.84rem' }}>
              {recordsError}
            </div>
          ) : null}

          <div className="app-card" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Attendance Date</th>
                  <th>Person / Location</th>
                  <th>Attendance Mark</th>
                  <th>Proof Photograph & GPS</th>
                  <th>Machine Photograph</th>
                  <th>Approval</th>
                  <th>Man-days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recordsLoading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      Loading live attendance records from iLance...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No attendance records returned by iLance (`totalElements: {pageInfo.totalElements ?? 0}`).
                    </td>
                  </tr>
                ) : (
                  records.map(renderAttendanceRow)
                )}
              </tbody>
            </table>

            {/* Upstream iLance Page Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: '10px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
              }}
            >
              <div>
                Total Elements: <strong style={{ fontFamily: 'var(--font-mono)' }}>{pageInfo.totalElements ?? 0}</strong> · Page{' '}
                <strong style={{ fontFamily: 'var(--font-mono)' }}>
                  {(pageInfo.totalPages ?? 0) > 0 ? (pageInfo.number ?? 0) + 1 : 0}
                </strong>{' '}
                of <strong style={{ fontFamily: 'var(--font-mono)' }}>{pageInfo.totalPages ?? 0}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.78rem' }}>Rows:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                  style={{ height: '30px', padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: '6px', background: '#fff' }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>

                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 0 || recordsLoading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  style={{ padding: '4px 10px' }}
                >
                  <LucideChevronLeft size={14} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={recordsLoading || (pageInfo.totalPages ?? 0) === 0 || page + 1 >= (pageInfo.totalPages ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                  style={{ padding: '4px 10px' }}
                >
                  Next <LucideChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* PENDING APPROVAL TAB (GET /api/attendance/pending-approval) */}
      {activeTab === 'pending' ? (
        <div className="app-card" style={{ overflowX: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <strong style={{ fontSize: '0.9rem' }}>Pending Approval Queue (Read-Only)</strong>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="badge-pill badge-amber">{pendingRecords.length} awaiting</span>
              {overduePendingCount > 0 ? (
                <span className="badge-pill badge-breakdown">{overduePendingCount} &gt; 48h</span>
              ) : null}
            </div>
          </div>

          {pendingError ? (
            <div style={{ padding: '14px 16px', color: '#991b1b', background: '#fef2f2', fontSize: '0.84rem' }}>
              {pendingError}
            </div>
          ) : null}

          <table className="data-table">
            <thead>
              <tr>
                <th>Attendance Date</th>
                <th>Person / Location</th>
                <th>Attendance Mark</th>
                <th>Proof Photograph & GPS</th>
                <th>Machine Photograph</th>
                <th>Approval</th>
                <th>Man-days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    Loading pending approval records from iLance...
                  </td>
                </tr>
              ) : pendingRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Nothing awaiting approval in iLance.
                  </td>
                </tr>
              ) : (
                pendingRecords.map(renderAttendanceRow)
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* DAILY / TODAY TAB (GET /api/attendance/today & /api/attendance/eligible-users) */}
      {activeTab === 'today' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="app-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideUsers size={16} />
              <strong style={{ fontSize: '0.9rem' }}>Daily / Today Attendance</strong>
              <span className="badge-pill badge-neutral">
                Eligible Users: {eligibleUsers.length}
              </span>
            </div>

            {eligibleUsers.length > 0 ? (
              <div style={{ minWidth: '240px' }}>
                <SearchableSelect value={selectedForUserId} onChange={(e) => setSelectedForUserId(e.target.value)}>
                  <option value="">Current Account (Default)</option>
                  {eligibleUsers.map((u) => (
                    <option key={u.userId || u.id} value={u.userId || u.id}>
                      {u.name || u.username || u.userId} {u.designation ? `(${u.designation})` : ''}
                    </option>
                  ))}
                </SearchableSelect>
              </div>
            ) : null}
          </div>

          {todayError ? (
            <div className="app-card" style={{ padding: '14px 16px', background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontSize: '0.84rem' }}>
              {todayError}
            </div>
          ) : null}

          {todayLoading ? (
            <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading today&apos;s attendance from iLance...
            </div>
          ) : !todayRecord ? (
            <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No daily attendance record returned by iLance.
            </div>
          ) : (
            <div className="app-card" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Attendance Date</th>
                    <th>Person / Location</th>
                    <th>Attendance Mark</th>
                    <th>Proof Photograph & GPS</th>
                    <th>Machine Photograph</th>
                    <th>Approval</th>
                    <th>Man-days</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>{renderAttendanceRow(todayRecord, 0)}</tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <IlyncAttendanceDetailModal
        isOpen={Boolean(detailRecord)}
        onClose={() => setDetailRecord(null)}
        initialRecord={detailRecord}
        onOpenLightbox={handleOpenLightbox}
      />

      {/* Full Photo + GPS Telemetry Lightbox */}
      {lightbox ? (
        <div className="modal-overlay" onClick={() => setLightbox(null)} style={{ zIndex: 960 }}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '780px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong>{lightbox.label} Photograph</strong>
                {lightbox.subtitle ? <span className="badge-pill badge-neutral">{lightbox.subtitle}</span> : null}
                {lightbox.photoObj?.cameraLive ? <span className="badge-pill badge-green">Live Camera</span> : null}
                {lightbox.photoObj?.geoVerdict ? (
                  <span className={getGeoVerdictBadgeStyle(lightbox.photoObj.geoVerdict)}>
                    {lightbox.photoObj.geoVerdict}
                  </span>
                ) : null}
              </div>
              <button type="button" className="btn-ghost" onClick={() => setLightbox(null)} aria-label="Close photo">
                <LucideX size={18} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                background: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                minHeight: '300px',
              }}
            >
              <IlyncSecureImage
                attendanceId={lightbox.attendanceId}
                photoKey={lightbox.photoObj.photoKey}
                alt={lightbox.label}
                style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '6px' }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '10px',
                padding: '14px 18px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                fontSize: '0.76rem',
              }}
            >
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Photo Captured At</div>
                <strong>{formatDateTimeShort(lightbox.photoObj?.photoCapturedAt)}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>GPS Coordinates</div>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>
                  <LucideMapPin size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  {formatCoords(lightbox.photoObj) || '—'}
                </strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Accuracy / Provider</div>
                <strong>
                  {lightbox.photoObj?.accuracyMeters != null ? `±${Math.round(lightbox.photoObj.accuracyMeters)} m` : '—'}
                  {lightbox.photoObj?.provider ? ` (${lightbox.photoObj.provider})` : ''}
                </strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Geo Check / Mock Flag</div>
                <strong>
                  {lightbox.photoObj?.geoCheckedAgainst || lightbox.photoObj?.geoVerdict || '—'}
                  {lightbox.photoObj?.mockLocationFlagged ? (
                    <span style={{ color: '#b91c1c', marginLeft: '6px' }}>
                      <LucideShieldAlert size={12} /> Mock GPS Flagged
                    </span>
                  ) : null}
                </strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
