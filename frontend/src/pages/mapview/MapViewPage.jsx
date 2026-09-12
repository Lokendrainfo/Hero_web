import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LucideArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

export const MapViewPage = () => {
  const navigate = useNavigate();
  const { roles, isAdmin, hasPermission } = useAuth();
  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('mapview.view');

  const [modalModule, setModalModule] = useState(null);

  const modules = [
    {
      id: 'all',
      title: 'All execution',
      subtitle: 'Combined GIS view',
      description: 'View all active execution modules together on the live GIS map.',
      active: true,
      route: '/map-view/trenching',
    },
    {
      id: 'trenching',
      title: 'Trenching',
      subtitle: 'HDD / trenching execution',
      description: 'Pits, trenches, depth captures, and field inspection photos.',
      active: true,
      route: '/map-view/trenching',
    },
    {
      id: 'manhole',
      title: 'Manhole',
      subtitle: 'Manhole execution',
      description: 'Track manhole placement, chambers, cover photos, and telemetry.',
      active: false,
    },
    {
      id: 'blowing',
      title: 'Blowing',
      subtitle: 'Fiber blowing',
      description: 'Monitor duct integrity, blowing distance, and cable tension.',
      active: false,
    },
    {
      id: 'splicing',
      title: 'Splicing',
      subtitle: 'Fiber splicing',
      description: 'Inspect joint closures, fiber tray assignment, and splice photos.',
      active: false,
    },
    {
      id: 'otdr',
      title: 'OTDR',
      subtitle: 'OTDR testing',
      description: 'View fiber trace measurements, loss events, and test reports.',
      active: false,
    },
    {
      id: 'route_marker',
      title: 'Route marker',
      subtitle: 'Route markers',
      description: 'Track electronic route markers, depth logs, and survey points.',
      active: false,
    }
  ];

  if (isVendorAccount) {
    return (
      <div className="screen-container">
        <EmptyState
          title="Map view is not available"
          subtitle="This module is not available on vendor accounts."
        >
          <button type="button" className="btn-primary" onClick={() => navigate('/tasks')}>
            Back to tasks
          </button>
        </EmptyState>
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
    <div className="screen-container">

      <ConfirmDialog
        open={Boolean(modalModule)}
        title={`${modalModule?.title || 'This module'} is coming soon`}
        message="This layer will be available in a future release."
        confirmLabel="Close"
        cancelLabel="Back"
        onConfirm={() => setModalModule(null)}
        onCancel={() => setModalModule(null)}
      />

      <PageHeader
        title="Map view"
        subtitle="GIS execution layers for trenching and field work"
      />

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Description</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {modules.map((mod) => (
              <tr key={mod.id} onClick={() => handleModuleClick(mod)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{mod.title}</div>
                  <div className="page-subtitle">{mod.subtitle}</div>
                </td>
                <td>{mod.description}</td>
                <td>
                  <span className={`badge-pill ${mod.active ? 'badge-running' : 'badge-neutral'}`}>
                    {mod.active ? 'Available' : 'Coming soon'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                  {mod.active ? <LucideArrowRight size={14} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
