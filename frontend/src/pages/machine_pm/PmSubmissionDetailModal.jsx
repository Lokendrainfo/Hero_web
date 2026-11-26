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
import { PmAuthorizedVideo } from './PmAuthorizedVideo';
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
  const categoryGroups = [];
  const groupByKey = new Map();
  responses.forEach((resp) => {
    const code = (resp.category_code || resp.category_name || 'GENERAL').toUpperCase();
    const name = resp.category_name || resp.category_code || 'Maintenance';
    if (!groupByKey.has(code)) {
      const grp = { code, name, items: [] };
      groupByKey.set(code, grp);
      categoryGroups.push(grp);
    }
    groupByKey.get(code).items.push(resp);
  });

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

  const renderResponseRow = (item, idx) => {
    const photos = Array.isArray(item.photos) && item.photos.length > 0
      ? item.photos
      : (item.photo_url ? [{ id: item.photo_id || idx, requirement_name: '', requirement_description: '', view_url: item.photo_url, sha256_hash: item.photo_hash, captured_at: item.captured_at }] : []);
    const videos = Array.isArray(item.videos) ? item.videos : [];
    const locations = Array.isArray(item.locations) ? item.locations : [];
    const questionAnswers = Array.isArray(item.questions_snapshot) && item.questions_snapshot.length > 0
      ? item.questions_snapshot.map((q) => ({
          id: q.question_id,
          label: q.question_name,
          description: q.question_description,
          type: q.answer_type,
          is_mandatory: q.is_mandatory,
          value: q.answer,
        }))
      : (Array.isArray(item.custom_field_values) ? item.custom_field_values : []).map((cf) => ({
          id: cf.field_id,
          label: cf.field_label || cf.field_name,
          description: cf.field_description || '',
          type: cf.field_type,
          is_mandatory: cf.is_mandatory,
          value: cf.value,
        }));
    const questionLabelById = Object.fromEntries(
      questionAnswers.filter((qa) => qa.id).map((qa) => [String(qa.id), qa.label])
    );

    return (
      <div
        key={item.id || idx}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '12px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: item.status === 'NOT_COMPLETED' ? '#fef2f2' : 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
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
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              {item.captured_at ? `Captured: ${new Date(item.captured_at).toLocaleString()} · ` : ''}
              Questions: {questionAnswers.length} · Photos: {photos.length} · Videos: {videos.length} · GPS: {locations.length}
            </div>
          </div>
        </div>

        {questionAnswers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px', padding: '10px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border)' }}>
            {questionAnswers.map((qa, cIdx) => {
              const displayVal = Array.isArray(qa.value) ? qa.value.join(', ') : (qa.value !== null && qa.value !== undefined && String(qa.value) !== '' ? String(qa.value) : 'Not answered');
              return (
                <div key={qa.id || cIdx} style={{ fontSize: '0.76rem' }}>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <span>{qa.label}</span>
                    {qa.is_mandatory !== undefined && (
                      <span className={`badge-pill ${qa.is_mandatory ? 'badge-red' : 'badge-neutral'}`} style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                        {qa.is_mandatory ? 'Mandatory' : 'Optional'}
                      </span>
                    )}
                  </div>
                  {qa.description ? <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{qa.description}</div> : null}
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>{displayVal}</div>
                </div>
              );
            })}
          </div>
        )}

        {photos.length > 0 ? (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {photos.map((p, pIdx) => (
              <div key={p.id || pIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '175px' }}>
                <button
                  type="button"
                  onClick={() =>
                    setLightboxPhoto({
                      view_url: p.view_url,
                      checklist_description: p.requirement_name ? `${item.description_snapshot} — ${p.requirement_name}` : item.description_snapshot,
                      frequency_code: submission.frequency_code,
                      machine_number: submission.machine_number,
                      uploaded_by_name: submission.submitted_by_name,
                      captured_at: p.captured_at || item.captured_at,
                      sha256_hash: p.sha256_hash || item.photo_hash,
                    })
                  }
                  style={{
                    position: 'relative',
                    width: '96px',
                    height: '72px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-strong)',
                    flexShrink: 0,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title={p.requirement_name || 'Click to inspect full photo evidence'}
                >
                  <PmAuthorizedPhoto
                    viewUrl={p.view_url}
                    alt={p.requirement_name || item.description_snapshot}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  {p.requirement_name ? (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 700, wordBreak: 'break-word' }}>
                      {p.requirement_name}
                    </span>
                  ) : null}
                  {p.is_mandatory_snapshot !== undefined && (
                    <span className={`badge-pill ${p.is_mandatory_snapshot ? 'badge-red' : 'badge-neutral'}`} style={{ fontSize: '0.64rem', padding: '1px 5px' }}>
                      {p.is_mandatory_snapshot ? 'Mandatory' : 'Optional'}
                    </span>
                  )}
                </div>
                {p.question_id && questionLabelById[String(p.question_id)] ? (
                  <span style={{ fontSize: '0.68rem', color: '#1d4ed8', fontWeight: 600 }}>
                    Q: {questionLabelById[String(p.question_id)]}
                  </span>
                ) : null}
                {p.requirement_description ? (
                  <span style={{ fontSize: '0.69rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                    {p.requirement_description}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <span className="badge-pill badge-neutral" style={{ alignSelf: 'flex-start' }}>No Photo Required / Attached</span>
        )}

        {videos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {videos.map((v, vIdx) => (
              <div
                key={v.id || vIdx}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '8px',
                  background: '#0f172a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f8fafc', display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'center' }}>
                  <span>
                    {v.requirement_name || `Video #${vIdx + 1}`}
                    {v.is_mandatory_snapshot !== undefined ? ` (${v.is_mandatory_snapshot ? 'Mandatory' : 'Optional'})` : ''}
                  </span>
                  <span style={{ color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>{v.duration_seconds || 0}s</span>
                </div>
                {v.question_id && questionLabelById[String(v.question_id)] ? (
                  <div style={{ fontSize: '0.69rem', color: '#93c5fd', fontWeight: 600 }}>
                    Question: {questionLabelById[String(v.question_id)]}
                  </div>
                ) : null}
                {v.requirement_description ? (
                  <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>{v.requirement_description}</div>
                ) : null}
                <PmAuthorizedVideo
                  viewUrl={v.view_url}
                  style={{ width: '100%', maxHeight: '180px', borderRadius: '4px', display: 'block' }}
                />
              </div>
            ))}
          </div>
        )}

        {locations.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px' }}>
            {locations.map((loc, lIdx) => (
              <div
                key={loc.id || lIdx}
                style={{
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  background: '#f0fdf4',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.76rem', color: '#166534' }}>
                    {loc.requirement_name || `GPS Location #${lIdx + 1}`}
                  </strong>
                  <span className={`badge-pill ${loc.is_mandatory_snapshot ? 'badge-red' : 'badge-neutral'}`} style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                    {loc.is_mandatory_snapshot ? 'Mandatory' : 'Optional'}
                  </span>
                </div>
                {loc.question_id && questionLabelById[String(loc.question_id)] ? (
                  <div style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 600 }}>
                    Question: {questionLabelById[String(loc.question_id)]}
                  </div>
                ) : null}
                {loc.requirement_description ? (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{loc.requirement_description}</div>
                ) : null}
                <div style={{ fontSize: '0.73rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '2px' }}>
                  {loc.latitude !== null && loc.latitude !== undefined && <span>Lat: {loc.latitude}</span>}
                  {loc.longitude !== null && loc.longitude !== undefined && <span>Lng: {loc.longitude}</span>}
                  {loc.accuracy_meters !== null && loc.accuracy_meters !== undefined && <span>Accuracy: ±{loc.accuracy_meters}m</span>}
                  {loc.captured_at && <span>Time: {new Date(loc.captured_at).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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

            {categoryGroups.map((group) => (
              <div key={group.code}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
                  {group.name.replace(/\s*Checklist$/i, '')} Checklist ({group.items.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {group.items.map(renderResponseRow)}
                </div>
              </div>
            ))}

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

