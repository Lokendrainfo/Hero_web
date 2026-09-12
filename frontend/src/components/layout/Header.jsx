import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const Header = ({ viewMode, setViewMode }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header style={{
      height: '60px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontWeight: 'bold', fontFamily: 'inherit', fontSize: '1.1rem' }}>HERO Operations</span>
        
        {/* Device View Mode Switcher */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
          <button
            onClick={() => setViewMode('mobile')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: '600',
              background: viewMode === 'mobile' ? '#3b82f6' : 'transparent',
              color: '#fff'
            }}
          >
            📱 Mobile Screen Frame (390×732)
          </button>
          <button
            onClick={() => setViewMode('desktop')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: '600',
              background: viewMode === 'desktop' ? '#3b82f6' : 'transparent',
              color: '#fff'
            }}
          >
            💻 Desktop Enterprise View
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.85rem' }}>
        <div>Vendor: <strong>{user?.vendor_details?.name || 'HERO INFRASTRUCTURE'}</strong></div>
        <div>User: <strong>{user?.first_name || user?.username}</strong></div>
      </div>
    </header>
  );
};
