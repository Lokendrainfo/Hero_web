import React from 'react';

export const LoadingSpinner = ({ title = 'Loading…', subtitle = 'Please wait' }) => {
  return (
    <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
      <div
        className="animate-spin"
        style={{
          width: 22,
          height: 22,
          border: '2px solid var(--border)',
          borderTopColor: 'var(--text-primary)',
          borderRadius: '50%',
          margin: '0 auto 12px'
        }}
      />
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
};
