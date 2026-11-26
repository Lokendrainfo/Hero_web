import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LucideArrowLeft, LucideEye, LucideWrench } from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { Pagination } from '../../components/common/Pagination';
import { PmLayoutHeader, PM_FREQUENCY_LABELS, pmStatusBadge } from './PmLayoutHeader';
import { PmSubmissionDetailModal } from './PmSubmissionDetailModal';

export const PmMachineHistoryPage = () => {
  const { machineId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [roleInfo, setRoleInfo] = useState(null);
  const [machine, setMachine] = useState(null);
  const [history, setHistory] = useState([]);
  const [freqFilter, setFreqFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ count: 0, total_pages: 1, page_size: 20 });
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState(null);

  useEffect(() => {
    pmService.getFrequencies().then((res) => setRoleInfo(res?.data?.role_info || null)).catch(() => {});
    pmService.validateMachine(machineId)
      .then((res) => setMachine(res?.data || null))
      .catch((err) => showToast(err?.message || 'Unable to load machine info.', 'error'));
  }, [machineId, showToast]);

  const loadMachineHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, page_size: 20 };
      if (freqFilter !== 'ALL') params.frequency = freqFilter;
      const res = await pmService.getMachineHistory(machineId, params);
      setHistory(res?.data || []);
      if (res?.meta) setMeta(res.meta);
    } catch (err) {
      showToast(err?.message || 'Failed to load machine history.', 'error');
    } finally {
      setLoading(false);
    }
  }, [machineId, page, freqFilter, showToast]);

  useEffect(() => {
    loadMachineHistory();
  }, [loadMachineHistory]);

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
        title={`Machine History — ${machine?.machine_number || machineId}`}
        subtitle="Machine-wise preventive maintenance timeline, hour-meter progression, and verified photo evidence"
        roleInfo={roleInfo}
        actions={
          <button type="button" className="btn-secondary" onClick={() => navigate('/operations/machine-maintenance')}>
            <LucideArrowLeft size={14} /> Back to Dashboard
          </button>
        }
      />

      {machine ? (
        <div className="app-card" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', fontSize: '0.8rem' }}>
          <div><div style={{ color: 'var(--text-muted)' }}>Machine ID / Number</div><strong style={{ fontFamily: 'var(--font-mono)' }}>{machine.id} / {machine.machine_number}</strong></div>
          <div><div style={{ color: 'var(--text-muted)' }}>Model & Type</div><strong>{machine.machine_model} ({machine.machine_type})</strong></div>
          <div><div style={{ color: 'var(--text-muted)' }}>Vendor</div><strong>{machine.vendor_name}</strong></div>
          <div><div style={{ color: 'var(--text-muted)' }}>Assigned Operator</div><strong>{machine.assigned_operator}</strong></div>
          <div><div style={{ color: 'var(--text-muted)' }}>Current Hour Meter</div><strong style={{ fontFamily: 'var(--font-mono)' }}>{machine.engine_hours} hrs</strong></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            {roleInfo?.allowed_frequencies?.length > 0 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate(`/operations/machine-maintenance/perform/${machine.id}/${roleInfo.allowed_frequencies[0]}`)}
              >
                <LucideWrench size={14} /> Perform PM
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="filter-row">
        <button
          type="button"
          className={`filter-chip${freqFilter === 'ALL' ? ' active' : ''}`}
          onClick={() => { setFreqFilter('ALL'); setPage(1); }}
        >
          All Frequencies
        </button>
        {(roleInfo?.allowed_frequency_labels || []).map((f) => (
          <button
            key={f.code}
            type="button"
            className={`filter-chip${freqFilter === f.code ? ' active' : ''}`}
            onClick={() => { setFreqFilter(f.code); setPage(1); }}
          >
            {f.name || PM_FREQUENCY_LABELS[f.code] || f.code}
          </button>
        ))}
      </div>

      <div className="table-container app-card">
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading machine maintenance logs...</div>
        ) : history.length === 0 ? (
          <div className="empty-state" style={{ margin: '16px' }}>
            <h3>No maintenance submissions recorded for this machine</h3>
            <p>Submit a checklist inspection to begin building this machine&apos;s preventive maintenance history.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Submission #</th>
                <th>Frequency</th>
                <th>Hour Meter</th>
                <th>Performed By</th>
                <th>Items & Photos</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.submission_number}</td>
                  <td><span className="badge-pill badge-blue">{s.frequency_name}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.hour_meter_reading} hrs</td>
                  <td>{s.submitted_by_name} ({s.submitted_by_role})</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.completed_items_count}/{s.total_items} · {s.photo_count} photos</td>
                  <td><span className={pmStatusBadge(s.status)}>{s.status}</span></td>
                  <td><span className={pmStatusBadge(s.approval_status)}>{s.approval_status}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{new Date(s.submitted_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => openDetail(s.id)}>
                      <LucideEye size={13} /> View Checklist
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
          totalCount={meta.count || history.length}
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
          loadMachineHistory();
        }}
      />
    </div>
  );
};

