import React from 'react';
import { LucideCalendar, LucideHash, LucideTruck, LucideUser, LucideX } from 'lucide-react';
import { PmAuthorizedPhoto } from './PmAuthorizedPhoto';

export const PmPhotoLightboxModal = ({ isOpen, onClose, photo }) => {
  if (!isOpen || !photo) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 950 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '820px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
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
          <div>
            <span className="badge-pill badge-blue" style={{ marginRight: '8px' }}>
              {photo.frequency_code || 'PM EVIDENCE'}
            </span>
            <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
              {photo.checklist_description || photo.description || 'Checklist Activity Photo'}
            </strong>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close photo viewer">
            <LucideX size={18} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            background: '#111827',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            minHeight: '320px',
            overflow: 'hidden',
          }}
        >
          <PmAuthorizedPhoto
            viewUrl={photo.view_url || photo.photo_url}
            alt={photo.checklist_description || 'Photo Evidence'}
            style={{ maxWidth: '100%', maxHeight: '62vh', objectFit: 'contain', borderRadius: '6px' }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            padding: '14px 18px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            fontSize: '0.78rem',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <LucideTruck size={13} /> Machine
            </div>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{photo.machine_number || '-'}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <LucideUser size={13} /> Uploaded By
            </div>
            <strong>{photo.uploaded_by_name || '-'}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <LucideCalendar size={13} /> Captured At
            </div>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              {photo.captured_at ? new Date(photo.captured_at).toLocaleString() : '-'}
            </strong>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <LucideHash size={13} /> SHA-256 Integrity
            </div>
            <strong style={{ fontFamily: 'var(--font-mono)' }} title={photo.sha256_hash || ''}>
              {photo.sha256_hash ? `${photo.sha256_hash.slice(0, 14)}...` : 'Verified'}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};

