import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LucideGlobe,
  LucideLayers,
  LucideArrowRight,
  LucideAlertCircle,
  LucideX
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const MapViewPage = () => {
  const navigate = useNavigate();
  const { roles, vendors, isAdmin, hasPermission } = useAuth();
  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('mapview.view');

  const [modalModule, setModalModule] = useState(null);

  const modules = [
    {
      id: 'all',
      title: 'All Execution',
      subtitle: 'Combined GIS View',
      description: 'View all active execution modules together on live GIS map.',
      icon: '🌐',
      active: true,
      route: '/map-view/trenching',
      color: '#0284c7',
      bg: '#f0f9ff'
    },
    {
      id: 'trenching',
      title: 'Trenching',
      subtitle: 'HDD / Trenching Execution',
      description: 'View pits, trenches, depth captures, and field inspection photos on live GIS map.',
      icon: '🚜',
      active: true,
      route: '/map-view/trenching',
      color: '#059669',
      bg: '#ecfdf5'
    },
    {
      id: 'manhole',
      title: 'Manhole',
      subtitle: 'Manhole Execution',
      description: 'Track manhole placement, chambers, cover photos, and telemetry.',
      icon: '⭕',
      active: false,
      color: '#d97706',
      bg: '#fffbeb'
    },
    {
      id: 'blowing',
      title: 'Blowing',
      subtitle: 'Fiber Blowing',
      description: 'Monitor duct integrity, blowing distance, and cable tension.',
      icon: '💨',
      active: false,
      color: '#0284c7',
      bg: '#f0f9ff'
    },
    {
      id: 'splicing',
      title: 'Splicing',
      subtitle: 'Fiber Splicing',
      description: 'Inspect joint closures, fiber tray assignment, and splice photos.',
      icon: '✂️',
      active: false,
      color: '#7c3aed',
      bg: '#f5f3ff'
    },
    {
      id: 'otdr',
      title: 'OTDR',
      subtitle: 'OTDR Testing',
      description: 'View fiber trace measurements, loss events, and test reports.',
      icon: '📊',
      active: false,
      color: '#ec4899',
      bg: '#fdf2f8'
    },
    {
      id: 'route_marker',
      title: 'Route Marker',
      subtitle: 'Route Markers',
      description: 'Track electronic route markers, depth logs, and survey points.',
      icon: '📍',
      active: false,
      color: '#6366f1',
      bg: '#eef2ff'
    }
  ];

  if (isVendorAccount) {
    return (
      <div style={{ padding: '60px 20px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <LucideAlertCircle size={44} color="#dc2626" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#991b1b', margin: 0 }}>Access Denied</h3>
          <p style={{ fontSize: '0.88rem', color: '#7f1d1d', marginTop: '8px' }}>
            Map View is restricted and not accessible for Vendor accounts.
          </p>
          <button onClick={() => navigate('/tasks')} className="btn-primary" style={{ marginTop: '16px', padding: '8px 18px', fontSize: '0.84rem' }}>
            ← Go to My Tasks
          </button>
        </div>
      </div>
    );
  }

  const handleModuleClick = (mod) => {
    if (mod.active && mod.route) {
      navigate(mod.route);
    } else {
      setModalModule(mod);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>

      {/* Coming Soon Modal */}
      {modalModule && (
        <div
          onClick={() => setModalModule(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '440px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
              border: '1px solid #e2e8f0',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setModalModule(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              <LucideX size={18} />
            </button>

            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{modalModule.icon}</div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>
              {modalModule.title}
            </h3>
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', marginBottom: '16px' }}>
              {modalModule.subtitle}
            </div>

            <div style={{
              display: 'inline-block',
              padding: '4px 16px',
              background: '#fef3c7',
              color: '#b45309',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: '800',
              marginBottom: '16px'
            }}>
              Coming Soon
            </div>

            <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              This module will be available in a future release.
            </p>

            <button
              onClick={() => setModalModule(null)}
              style={{
                width: '100%',
                padding: '10px',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              Understand & Close
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Banner */}
      <div
        className="app-card"
        style={{
          padding: '18px 22px',
          background: 'linear-gradient(135deg, #0a2d23 0%, #114b3a 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          boxShadow: '0 4px 16px rgba(10, 45, 35, 0.12)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(52, 211, 153, 0.2)', padding: '10px', borderRadius: '10px' }}>
            <LucideGlobe size={26} color="#34d399" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontFamily: 'Outfit, sans-serif', fontWeight: '800', margin: 0, color: '#ffffff' }}>
              ilync-Live
            </h1>
            <div style={{ fontSize: '0.82rem', color: '#a7f3d0', marginTop: '1px', fontWeight: '600' }}>
              Field Execution Map View & Telemetry Operations
            </div>
          </div>
        </div>
      </div>

      {/* 2. Sub-Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
          <LucideLayers size={18} color="#059669" />
          <span>Execution Modules</span>
        </div>
        <span style={{ fontSize: '0.78rem', background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '8px', fontWeight: '700' }}>
          Select an execution module to proceed
        </span>
      </div>

      {/* 3. Small Compact Module Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '10px',
          alignItems: 'stretch'
        }}
      >
        {modules.map((mod) => (
          <div
            key={mod.id}
            onClick={() => handleModuleClick(mod)}
            style={{
              background: '#ffffff',
              border: mod.active ? `2px solid ${mod.color}` : '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: mod.active ? `0 3px 10px ${mod.color}1e` : '0 1px 2px rgba(0,0,0,0.03)',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              position: 'relative'
            }}
          >
            {/* Top row: Icon + Status tag */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: mod.bg || '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem'
              }}>
                {mod.icon}
              </div>

              {mod.active ? (
                <span style={{
                  fontSize: '0.62rem',
                  background: mod.color,
                  color: '#ffffff',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontWeight: '800'
                }}>
                  ACTIVE
                </span>
              ) : (
                <span style={{
                  fontSize: '0.62rem',
                  background: '#fef3c7',
                  color: '#d97706',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontWeight: '800'
                }}>
                  SOON
                </span>
              )}
            </div>

            {/* Title & Subtitle */}
            <div style={{ marginBottom: '8px' }}>
              <h3 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', margin: '0 0 2px 0' }}>
                {mod.title}
              </h3>
              <div style={{ fontSize: '0.70rem', fontWeight: '700', color: mod.color }}>
                {mod.subtitle}
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.70rem',
              fontWeight: '800',
              color: mod.active ? mod.color : '#94a3b8',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '6px'
            }}>
              <span>{mod.active ? 'Open Module' : 'Coming Soon'}</span>
              {mod.active ? <LucideArrowRight size={12} /> : null}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
