import React from 'react';

export const LoadingSpinner = ({ title = 'Loading...', subtitle = 'Fetching map data & telemetry' }) => {
  return (
    <div style={{
      padding: '80px 20px',
      textAlign: 'center',
      color: '#475569',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes gis-ring-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes gis-dot-pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
      <div style={{ position: 'relative', width: '56px', height: '56px', marginBottom: '16px' }}>
        {/* Outer Gradient Spinner Ring */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid #e2e8f0',
          borderTopColor: '#059669',
          borderRightColor: '#34d399',
          animation: 'gis-ring-spin 0.9s linear infinite'
        }} />
        {/* Inner Reverse Spinner Ring */}
        <div style={{
          position: 'absolute',
          inset: '8px',
          borderRadius: '50%',
          border: '2.5px solid transparent',
          borderBottomColor: '#0284c7',
          borderLeftColor: '#38bdf8',
          animation: 'gis-ring-spin 0.6s linear infinite reverse'
        }} />
        {/* Center Pulsing Dot */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          marginTop: '-6px',
          marginLeft: '-6px',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#059669',
          boxShadow: '0 0 8px #059669',
          animation: 'gis-dot-pulse 1.2s ease-in-out infinite'
        }} />
      </div>
      <div style={{ fontWeight: '800', fontSize: '1.1rem', color: '#0f172a', letterSpacing: '0.02em', fontFamily: 'Outfit, sans-serif' }}>
        {title}
      </div>
      {subtitle && (
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '6px', margin: 0, fontFamily: 'Inter, sans-serif' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
};
