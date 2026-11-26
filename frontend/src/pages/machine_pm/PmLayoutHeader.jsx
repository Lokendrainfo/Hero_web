import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LucideClipboardCheck,
  LucideHistory,
  LucideLayoutDashboard,
  LucidePlus,
  LucideSettings,
  LucideShieldAlert,
  LucideWrench,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../hooks/useAuth';

export const PM_FREQUENCY_LABELS = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  EVERY_15_DAYS: 'Every 15 Days',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

export const pmStatusBadge = (status) => {
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'APPROVED') return 'badge-pill badge-green';
  if (s === 'DUE' || s === 'PARTIALLY_COMPLETED' || s === 'PENDING_REVIEW' || s === 'CHANGES_REQUESTED') {
    return 'badge-pill badge-amber';
  }
  if (s === 'OVERDUE' || s === 'REJECTED' || s === 'NOT_COMPLETED') return 'badge-pill badge-breakdown';
  if (s === 'PENDING' || s === 'SCHEDULED') return 'badge-pill badge-blue';
  return 'badge-pill badge-neutral';
};

export const formatPmStatusLabel = (status) => {
  const s = (status || '').replace(/_/g, ' ').toLowerCase();
  return s ? s.replace(/\b\w/g, (ch) => ch.toUpperCase()) : '-';
};

export const PmLayoutHeader = ({ title, subtitle, roleInfo, actions }) => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const showAdmin = isAdmin || roleInfo?.is_admin;

  const tabs = [
    { label: 'Dashboard', path: '/operations/machine-maintenance', icon: LucideLayoutDashboard, end: true },
    { label: 'My Checklist', path: '/operations/machine-maintenance/my-checklists', icon: LucideClipboardCheck },
    { label: 'Perform Maintenance', path: '/operations/machine-maintenance/perform', icon: LucideWrench },
    { label: 'History', path: '/operations/machine-maintenance/history', icon: LucideHistory },
    { label: 'Safety Guidelines', path: '/operations/machine-maintenance/safety-guidelines', icon: LucideShieldAlert },
  ];

  if (showAdmin) {
    tabs.push({ label: 'Configuration', path: '/operations/machine-maintenance/admin-config', icon: LucideSettings });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PageHeader
        title={title || 'Machine Preventive Maintenance'}
        subtitle={subtitle || 'Operations → Machine Maintenance · Apollo HDD A600V2'}
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {roleInfo?.role ? (
              <span className={roleInfo.is_admin ? 'badge-pill badge-role-admin' : 'badge-pill badge-role-pm'}>
                Role: {roleInfo.role.replace(/_/g, ' ')}
              </span>
            ) : null}
            {actions}
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/operations/machine-maintenance/perform')}
            >
              <LucidePlus size={14} />
              New PM Check
            </button>
          </div>
        }
      />

      <div className="tab-bar" style={{ overflowX: 'auto' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};

