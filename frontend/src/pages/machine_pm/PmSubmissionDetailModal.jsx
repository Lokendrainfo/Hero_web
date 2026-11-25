import React, { useState } from 'react';
import {
  LucideCheckCircle2,
  LucideEye,
  LucideShieldCheck,
  LucideX,
  LucideXCircle,
} from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { PmAuthorizedPhoto } from './PmAuthorizedPhoto';
import { PmPhotoLightboxModal } from './PmPhotoLightboxModal';
import { pmStatusBadge } from './PmLayoutHeader';

export const PmSubmissionDetailModal = ({ isOpen, onClose, submission, canReview = false, onReviewed }) => {
  const { showToast } = useToast();
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  if (!isOpen || !submission) return null;

  const responses = submission.responses || [];
  const machineItems = responses.filter((r) => (r.category_code || '').toUpperCase() === 'MACHINE' || (r.category_name || '').toLowerCase() === 'machine');
  const engineItems = responses.filter((r) => (r.category_code || '').toUpperCase() === 'ENGINE' || (r.category_name || '').toLowerCase() === 'engine');

  const handleReviewSubmit = async (action) => {
    if ((action === 'REJECTED' || action === 'CHANGES_REQUESTED') && !reviewRemarks.trim()) {
      showToast('Remarks are required when rejecting or requesting changes.', 'error');
      return;
    }
    try {
      setSubmittingReview(true);
      await pmService.reviewSubmission(submission.id, { action, remarks: reviewRemarks.trim() });
      showToast(`Submission marked ${action}.`, 'success');
      setReviewAction('');
      setReviewRemarks('');
      if (onReviewed) onReviewed();
    } catch (err) {
      showToast(err?.message || 'Failed to submit review.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const renderResponseRow = (item, idx) => (
    <div
      key={item.id || idx}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 12px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: item.status === 'NOT_COMPLETED' ? '#fef2f2' : 'var(--bg-surface)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="badge-pill badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>
            {item.item_code}
          </span>
          <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{item.description_snapshot}</strong>
          <span className={pmStatusBadge(item.status)}>{item.status.replace('_', ' ')}</span>
        </div>
        {item.remarks ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Remarks: {item.remarks}
          </div>
        ) : null}
        {item.captured_at ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            Captured: {new Date(item.captured_at).toLocaleString()} · Hash: {item.photo_hash ? `${item.photo_hash.slice(0, 12)}...` : 'Verified'}
          </div>
        ) : null}
      </div>

      {item.photo_url ? (
        <button
          type="button"
          onClick={() =>
            setLightboxPhoto({
              view_url: item.photo_url,
              checklist_description: item.description_snapshot,
              frequency_code: submission.frequency_code,
              machine_number: submission.machine_number,
              uploaded_by_name: submission.submitted_by_name,
              captured_at: item.captured_at,
              sha256_hash: item.photo_hash,
            })
          }
          style={{
            position: 'relative',
            width: '64px',
            height: '64px',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid var(--border-strong)',
            flexShrink: 0,
            cursor: 'pointer',
            padding: 0,
          }}
          title="Click to inspect full photo evidence"
        >
          <PmAuthorizedPhoto
            viewUrl={item.photo_url}
            alt={item.description_snapshot}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: '2px',
              right: '2px',
              background: 'rgba(17,24,39,0.75)',
              color: '#fff',
              borderRadius: '4px',
              padding: '2px',
              display: 'inline-flex',
            }}
          >
            <LucideEye size={11} />
          </span>
        </button>
      ) : (
        <span className="badge-pill badge-breakdown">No Photo</span>
      )}
    </div>
  );

  return (
    <>
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 850 }}>
        <div
          className="modal-card"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '920px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
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
              <LucideShieldCheck size={18} />
              <strong style={{ fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>{submission.submission_number}</strong>
              <span className="badge-pill badge-blue">{submission.frequency_name || submission.frequency_code}</span>
              <span className={pmStatusBadge(submission.status)}>{submission.status}</span>
              <span className={pmStatusBadge(submission.approval_status)}>{submission.approval_status}</span>
            </div>
            <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
              <LucideX size={18} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                padding: '12px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '0.8rem',
              }}
            >
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Machine Number</div>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{submission.machine_number}</strong>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{submission.machine_name}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Model & Type</div>
                <strong>{submission.machine_model || 'APOLLO A600 V2'}</strong>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Type: {submission.machine_type || 'HDD'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Hour Meter Reading</div>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{submission.hour_meter_reading} hrs</strong>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Vendor: {submission.vendor_name}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Performed By</div>
                <strong>{submission.submitted_by_name}</strong>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Role: {submission.submitted_by_role} · Assigned Op: {submission.assigned_operator || 'Unassigned'}
                </div>
              </div>
            </div>

            {submission.general_remarks ? (
              <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem' }}>
                <strong>General Remarks:</strong> {submission.general_remarks}
              </div>
            ) : null}

            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
                Machine Checklist ({machineItems.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {machineItems.length ? machineItems.map(renderResponseRow) : <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No machine activities in this frequency.</div>}
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
                Engine Checklist ({engineItems.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {engineItems.length ? engineItems.map(renderResponseRow) : <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No engine activities in this frequency.</div>}
              </div>
            </div>

            {submission.reviews && submission.reviews.length > 0 ? (
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Approval / Review Trail</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {submission.reviews.map((rev) => (
                    <div key={rev.id} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.8rem' }}>
                      <span className={pmStatusBadge(rev.action)} style={{ marginRight: '8px' }}>{rev.action}</span>
                      <strong>{rev.reviewer_name}</strong> ({rev.reviewer_role}) · {new Date(rev.reviewed_at).toLocaleString()}
                      {rev.remarks ? <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>{rev.remarks}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {canReview ? (
              <div style={{ padding: '12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-subtle)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>Reviewer Decision (Area Manager / Admin)</div>
                <textarea
                  rows={2}
                  placeholder="Enter review remarks (mandatory for Reject / Request Changes)..."
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', marginBottom: '10px', fontSize: '0.82rem' }}
                />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={submittingReview}
                    onClick={() => handleReviewSubmit('APPROVED')}
                  >
                    <LucideCheckCircle2 size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={submittingReview}
                    onClick={() => handleReviewSubmit('CHANGES_REQUESTED')}
                  >
                    Request Changes
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={submittingReview}
                    onClick={() => handleReviewSubmit('REJECTED')}
                  >
                    <LucideXCircle size={14} /> Reject
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {submission.completed_items_count}/{submission.total_items} Completed · {submission.photo_count} Verified Photos
            </span>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      <PmPhotoLightboxModal
        isOpen={Boolean(lightboxPhoto)}
        onClose={() => setLightboxPhoto(null)}
        photo={lightboxPhoto}
      />
    </>
  );
};

