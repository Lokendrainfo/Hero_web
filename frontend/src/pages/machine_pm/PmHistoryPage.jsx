import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LucideEye, LucideRefreshCw, LucideSearch } from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/Select';
import { DateField } from '../../components/common/DateField';
import { Pagination } from '../../components/common/Pagination';
import { PmLayoutHeader, pmStatusBadge } from './PmLayoutHeader';
import { PmSubmissionDetailModal } from './PmSubmissionDetailModal';

export const PmHistoryPage = () => {
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const [roleInfo, setRoleInfo] = useState(null);
  const [freqOptions, setFreqOptions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ count: 0, total_pages: 1, page_size: 20 });

  const [onlyMine, setOnlyMine] = useState(false);
  const [frequency, setFrequency] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [approvalFilter, setApprovalFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [selectedDetail, setSelectedDetail] = useState(null);

  useEffect(() => {
    pmService.getFrequencies()
      .then((res) => {
        const d = res?.data || {};
        setRoleInfo(d.role_info || null);
        setFreqOptions(d.role_info?.allowed_frequency_labels || d.allowed_frequencies || []);
      })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, page_size: 20 };
      if (frequency !== 'ALL') params.frequency = frequency;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (approvalFilter !== 'ALL') params.approval_status = approvalFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (search.trim()) params.search = search.trim();

      const res = onlyMine ? await pmService.getUserHistory(null, params) : await pmService.getSubmissions(params);
      setSubmissions(res?.data || []);
      if (res?.meta) setMeta(res.meta);
    } catch (err) {
      showToastRef.current(err?.message || 'Failed to load maintenance history.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, onlyMine, frequency, statusFilter, approvalFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const openDetail = async (id) => {
    try {
      const res = await pmService.getSubmissionDetail(id);
      setSelectedDetail(res?.data || null);
    } catch (err) {
      showToast(err?.message || 'Failed to load submission detail.', 'error');
    }
  };

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="Maintenance History"
        subtitle="Audit trail of submitted checklists, hour-meter readings, approvals, and photo evidence"
        roleInfo={roleInfo}
        actions={
          <button type="button" className="btn-secondary" onClick={loadHistory}>
            <LucideRefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="app-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="filter-row">
          <button type="button" className={`filter-chip${!onlyMine ? ' active' : ''}`} onClick={() => { setOnlyMine(false); setPage(1); }}>
            All Authorized Submissions
          </button>
          <button type="button" className={`filter-chip${onlyMine ? ' active' : ''}`} onClick={() => { setOnlyMine(true); setPage(1); }}>
            My Submissions Only
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <LucideSearch size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              type="search"
              placeholder="Search submission, machine, user..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ width: '100%', height: '36px', padding: '0 10px 0 30px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '0.8125rem' }}
            />
          </div>

          <SearchableSelect value={frequency} onChange={(e) => { setFrequency(e.target.value); setPage(1); }}>
            <option value="ALL">All Frequencies</option>
            {freqOptions.map((f) => (
              <option key={f.code} value={f.code}>{f.name}</option>
            ))}
          </SearchableSelect>

          <SearchableSelect value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="ALL">All Checklist Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PARTIALLY_COMPLETED">Partially Completed</option>
          </SearchableSelect>

          <SearchableSelect value={approvalFilter} onChange={(e) => { setApprovalFilter(e.target.value); setPage(1); }}>
            <option value="ALL">All Approval Statuses</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="APPROVED">Approved</option>
            <option value="CHANGES_REQUESTED">Changes Requested</option>
            <option value="REJECTED">Rejected</option>
          </SearchableSelect>

          <DateField value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="From date" />
          <DateField value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="To date" />
        </div>
      </div>

      <div className="table-container app-card">
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading maintenance history...</div>
        ) : submissions.length === 0 ? (
          <div className="empty-state" style={{ margin: '16px' }}>
            <h3>No maintenance submissions found</h3>
            <p>No preventive maintenance records match your current filter selection.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Submission #</th>
                <th>Machine</th>
                <th>Frequency</th>
                <th>Hour Meter</th>
                <th>Performed By</th>
                <th>Checklist / Photos</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Submitted At</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.submission_number}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.machine_number}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{s.vendor_name}</div>
                  </td>
                  <td><span className="badge-pill badge-blue">{s.frequency_name}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.hour_meter_reading} hrs</td>
                  <td>
                    <div>{s.submitted_by_name}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{s.submitted_by_role}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>
                    {s.completed_items_count}/{s.total_items} · {s.photo_count} photos{s.video_count ? ` · ${s.video_count} videos` : ''}{s.location_count ? ` · ${s.location_count} GPS` : ''}
                  </td>
                  <td><span className={pmStatusBadge(s.status)}>{s.status}</span></td>
                  <td><span className={pmStatusBadge(s.approval_status)}>{s.approval_status}</span></td>
                  <td style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                    {new Date(s.submitted_at).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => openDetail(s.id)}>
                      <LucideEye size={13} /> Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination
          currentPage={page}
          totalPages={meta.total_pages || 1}
          totalCount={meta.count || submissions.length}
          pageSize={meta.page_size || 20}
          onPageChange={setPage}
        />
      </div>

      <PmSubmissionDetailModal
        isOpen={Boolean(selectedDetail)}
        onClose={() => setSelectedDetail(null)}
        submission={selectedDetail}
        canReview={roleInfo?.can_review}
        onReviewed={() => {
          if (selectedDetail) openDetail(selectedDetail.id);
          loadHistory();
        }}
      />
    </div>
  );
};

