import React from 'react';
import { LucideCheckCircle2, LucideClock, LucideUserCheck, LucideXCircle } from 'lucide-react';
import { formatDateTimeShort } from './IlyncAttendancePhoto';

const getStepBadgeClass = (stepStatus) => {
  const s = String(stepStatus || '').toUpperCase();
  if (s === 'APPROVED') return 'badge-pill badge-green';
  if (s === 'REJECTED') return 'badge-pill badge-breakdown';
  if (s === 'PENDING') return 'badge-pill badge-amber';
  return 'badge-pill badge-neutral';
};

const getStepIcon = (stepStatus) => {
  const s = String(stepStatus || '').toUpperCase();
  if (s === 'APPROVED') return <LucideCheckCircle2 size={12} color="#15803d" />;
  if (s === 'REJECTED') return <LucideXCircle size={12} color="#b91c1c" />;
  return <LucideClock size={12} color="#b45309" />;
};

export const IlyncApprovalFlow = ({ record, compact = false }) => {
  if (!record) return null;

  const steps = Array.isArray(record.approvalSteps) && record.approvalSteps.length > 0
    ? record.approvalSteps
    : (Array.isArray(record.approverSnapshots) && record.approverSnapshots.length > 0
      ? record.approverSnapshots.map((snap, idx) => ({
          order: idx + 1,
          userId: snap.userId,
          empId: snap.empId || null,
          name: snap.name,
          designation: snap.designation || null,
          via: snap.via || null,
          status: idx < (record.currentApprovalStepIndex ?? 0) ? 'APPROVED' : 'PENDING',
          actedAt: null,
          remarks: null,
          candidateNames: snap.candidateNames || null,
          anyOne: snap.anyOne || false,
          actedByName: null,
        }))
      : []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: compact ? '170px' : 'auto' }}>
      {record.onBehalf ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.72rem' }}>
          <span className="badge-pill badge-amber" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
            On Behalf
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Filed by <strong>{record.submittedBySnapshot?.name || '—'}</strong>
          </span>
        </div>
      ) : null}

      {steps.length === 0 ? (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {steps.map((step, idx) => {
            const displayName =
              step.anyOne && Array.isArray(step.candidateNames) && step.candidateNames.length > 0
                ? step.actedByName || `Any of: ${step.candidateNames.join(', ')}`
                : step.name || step.actedByName || 'Approver';
            return (
              <div
                key={`${step.order || idx}-${step.userId || displayName}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  padding: compact ? '4px 6px' : '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg-subtle)',
                  fontSize: '0.74rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {getStepIcon(step.status)}
                    <span>{step.order ? `${step.order}. ` : ''}{displayName}</span>
                  </span>
                  <span className={getStepBadgeClass(step.status)} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                    {step.status || 'PENDING'}
                  </span>
                </div>

                {(step.designation || step.via || step.foundAt) ? (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {step.designation ? <span>{step.designation}</span> : null}
                    {step.via ? <span>· via {step.via}</span> : null}
                    {step.foundAt ? <span>· {step.foundAt}</span> : null}
                  </div>
                ) : null}

                {(step.actedAt || step.actedByName) ? (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <LucideUserCheck size={11} />
                    <span>
                      {step.actedByName ? `${step.actedByName}` : ''}
                      {step.actedAt ? ` · ${formatDateTimeShort(step.actedAt)}` : ''}
                    </span>
                  </div>
                ) : null}

                {step.remarks ? (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    “{step.remarks}”
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {record.rejectionReason ? (
        <div style={{ fontSize: '0.72rem', color: '#991b1b' }}>
          Rejection: {record.rejectionReason}
        </div>
      ) : null}
      {record.approverRemarks ? (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Approver Remarks: {record.approverRemarks}
        </div>
      ) : null}
    </div>
  );
};

