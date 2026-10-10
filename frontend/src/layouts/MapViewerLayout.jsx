import React from 'react';
import { Outlet } from 'react-router-dom';

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[MapErrorBoundary] Caught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: '#0f172a',
          color: '#ffffff',
          padding: 24,
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 8, fontWeight: 700 }}>Map view encountered an issue</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: 16, maxWidth: 480, textAlign: 'center' }}>
            {this.state.error?.message || 'An error occurred while displaying the telemetry map.'}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                background: '#334155',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const MapViewerLayout = () => (
  <div className="map-viewer-shell">
    <MapErrorBoundary>
      <Outlet />
    </MapErrorBoundary>
  </div>
);
