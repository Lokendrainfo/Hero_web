import React, { useEffect, useState } from 'react';
import { LucideLoader2, LucideX } from 'lucide-react';
import { ilyncAttendanceService } from '../../services/attendanceService';
import {
  IlyncMachineProofCell,
  IlyncTeamProofCell,
  formatDateTimeShort,
} from './IlyncAttendancePhoto';
import { IlyncApprovalFlow } from './IlyncApprovalFlow';

export const getStatusBadgeClass = (statusVal) => {
  const s = String(statusVal || '').toUpperCase();
  if (s === 'APPROVED' || s === 'PRESENT') return 'badge-pill badge-green';
  if (s === 'SUBMITTED') return 'badge-pill badge-blue';
  if (s === 'REJECTED' || s === 'ABSENT') return 'badge-pill badge-breakdown';
  if (s === 'DRAFT' || s === 'PENDING') return 'badge-pill badge-amber';
  return 'badge-pill badge-neutral';
};

export const IlyncAttendanceDetailModal = ({ isOpen, onClose, initialRecord, onOpenLightbox }) => {
  const [record, setRecord] = useState(initialRecord || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setRecord(initialRecord || null);
    setError('');

    if (!isOpen || !initialRecord?.id) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    ilyncAttendanceService
      .getDetail(initialRecord.id)
      .then((res) => {
        if (!active) return;
        if (res?.data && typeof res.data === 'object') {
          setRecord(res.data);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Could not refresh detail from iLance.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, initialRecord]);

  if (!isOpen || !record) return null;

  const loc = record.locationSnapshot || {};
  const assignee = record.assigneeSnapshot || {};
  const submittedBy = record.submittedBySnapshot || {};

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 900 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '880px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1rem' }}>
              {assignee.name || record.assigneeUserId || 'Attendance Record'} · {record.attendanceDate || '—'}
            </strong>
            <span className={getStatusBadgeClass(record.status)}>{record.status || '—'}</span>
            {record.personalMark ? (
              <span className={getStatusBadgeClass(record.personalMark)}>{record.personalMark}</span>
            ) : null}
            {loading ? <LucideLoader2 size={15} className="spin" /> : null}
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close detail">
            <LucideX size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error ? (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '0.8rem' }}>
              {error}
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '10px',
              padding: '12px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: '0.8rem',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Assignee</div>
              <strong>{assignee.name || '—'}</strong>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {assignee.designation || '—'} {assignee.mobile ? `· ${assignee.mobile}` : ''}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Submitted By</div>
              <strong>{submittedBy.name || '—'}</strong>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {record.onBehalf ? `On behalf${record.onBehalfReason ? `: ${record.onBehalfReason}` : ''}` : 'Self submission'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Location</div>
              <strong>{loc.locationName || loc.blockName || record.locationCode || '—'}</strong>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {[loc.district, loc.circle, loc.company].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Mark & Man-days</div>
              <strong>{record.personalMark || '—'} · {record.manDays ?? '—'} man-day(s)</strong>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Resubmits: {record.resubmitCount ?? 0} {record.ageHours != null ? `· Age: ${Math.round(record.ageHours)}h` : ''}
              </div>
            </div>
          </div>

          {(record.absenceReason || record.remarks || record.rejectionReason || record.approverRemarks) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              {record.absenceReason ? <div><strong>Absence Reason:</strong> {record.absenceReason}</div> : null}
              {record.remarks ? <div><strong>Remarks:</strong> {record.remarks}</div> : null}
              {record.rejectionReason ? <div style={{ color: '#991b1b' }}><strong>Rejection Reason:</strong> {record.rejectionReason}</div> : null}
              {record.approverRemarks ? <div><strong>Approver Remarks:</strong> {record.approverRemarks}</div> : null}
            </div>
          ) : null}

          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 8px' }}>
              Proof Photographs & GPS Telemetry
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Team Photo</div>
                <IlyncTeamProofCell record={record} onOpenLightbox={onOpenLightbox} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Machine Information & Photo</div>
                <IlyncMachineProofCell record={record} onOpenLightbox={onOpenLightbox} />
              </div>
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 8px' }}>
              Approval Steps
            </h4>
            <IlyncApprovalFlow record={record} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '8px',
              fontSize: '0.74rem',
              color: 'var(--text-secondary)',
              paddingTop: '8px',
              borderTop: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div>ID: {record.id ?? 'null'}</div>
            <div>Submitted: {formatDateTimeShort(record.submittedAt)}</div>
            <div>Approved: {formatDateTimeShort(record.approvedAt)}</div>
            <div>Updated: {formatDateTimeShort(record.updatedAt)}</div>
            <div>Version: {record.version ?? '—'}</div>
            <div>Client Ref: {record.clientAttendanceId || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

