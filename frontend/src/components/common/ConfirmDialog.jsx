import React from 'react';
import { createPortal } from 'react-dom';

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}) => {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal-card"
        style={{ maxWidth: 400, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div style={{ padding: '18px 20px 8px' }}>
          <h2 id="confirm-title" className="page-title" style={{ fontSize: '1rem' }}>{title}</h2>
          {message ? <p className="page-subtitle" style={{ marginTop: 8, lineHeight: 1.5 }}>{message}</p> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px 18px' }}>
          <button type="button" className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
