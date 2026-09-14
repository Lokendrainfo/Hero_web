import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { isNavPathActive } from '../../utils/navActive';
import {
  LucideLayoutDashboard, LucideTruck, LucideNavigation, LucideCheckSquare, LucideUsers, LucideCalendarCheck,
  LucideDollarSign, LucideFuel, LucideRepeat, LucideFileText, LucideWrench, LucideAlertOctagon, LucideAlertTriangle,
  LucidePackage, LucideBuilding, LucideUserCheck, LucideShieldCheck, LucideBell, LucideSettings, LucideX, LucideGlobe,
  LucideLayers, LucideTag
} from 'lucide-react';

export const NavDrawer = ({ isOpen, isVisible = true, isMobileOpen, onClose }) => {
  const { hasPermission, roles, isAdmin } = useAuth();
  const { pathname } = useLocation();
  const activeMobile = isMobileOpen !== undefined ? isMobileOpen : isOpen;
  const activeVisible = isVisible !== undefined ? isVisible : true;
  const isExplicitVendorRole = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR');
  const canSee = (perm) => isAdmin || !perm || hasPermission(perm);

  const menuSections = [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: LucideLayoutDashboard, perm: 'dashboard.view' }
      ]
    },
    {
      title: 'Operations',
      items: [
        { label: 'Machines', path: '/machines', icon: LucideTruck, perm: 'machines.view' },
        { label: 'Live Tracking', path: '/tracking', icon: LucideNavigation, perm: 'tracking.view' },
        { label: 'Tasks', path: '/tasks', icon: LucideCheckSquare, perm: 'tasks.view' },
        { label: 'Map View', path: '/map-view', icon: LucideGlobe, perm: 'mapview.view' },
        { label: 'Team', path: '/team', icon: LucideUsers, perm: 'team.view' },
        { label: 'Attendance', path: '/attendance', icon: LucideCalendarCheck, perm: 'attendance.view' }
      ]
    },
    {
      title: 'Finance',
      items: [
        { label: 'Expenses', path: '/expenses', icon: LucideDollarSign, perm: 'expenses.view' },
        { label: 'Fuel Logs', path: '/fuel', icon: LucideFuel, perm: 'fuel.view' },
        { label: 'Refuel', path: '/refuel', icon: LucideRepeat, perm: 'refuel.view' },
        { label: 'Reports', path: '/reports', icon: LucideFileText, perm: 'reports.view' }
      ]
    },
    {
      title: 'Masters',
      adminOnly: true,
      items: [
        { label: 'Expense Categories', path: '/expense-categories', icon: LucideLayers, perm: 'expenses.manage' },
        { label: 'Subcategories', path: '/expense-subcategories', icon: LucideTag, perm: 'expenses.manage' }
      ]
    },
    {
      title: 'Workshop',
      items: [
        { label: 'Maintenance', path: '/maintenance', icon: LucideWrench, perm: 'maintenance.view' },
        { label: 'Breakdowns', path: '/breakdown', icon: LucideAlertOctagon, perm: 'breakdowns.view' },
        { label: 'Alerts', path: '/alerts', icon: LucideAlertTriangle, perm: 'alerts.view' }
      ]
    },
    {
      title: 'Inventory',
      items: [
        { label: 'Stock', path: '/stock', icon: LucidePackage, perm: 'inventory.view' }
      ]
    },
    {
      title: 'Admin',
      items: [
        { label: 'Vendors', path: '/vendors', icon: LucideBuilding, perm: 'vendors.view' },
        { label: 'Users', path: '/users', icon: LucideUserCheck, perm: 'users.view' },
        { label: 'Roles', path: '/roles', icon: LucideShieldCheck, perm: 'roles.view' }
      ]
    },
    {
      title: 'Account',
      items: [
        { label: 'Notifications', path: '/notifications', icon: LucideBell, perm: 'notifications.view' },
        { label: 'Settings', path: '/settings', icon: LucideSettings, perm: 'settings.view' }
      ]
    }
  ];

  return (
    <>
      {activeMobile && <div className="drawer-backdrop" onClick={onClose} />}

      <aside className={`nav-sidebar-container ${activeMobile ? 'mobile-open' : ''} ${!activeVisible ? 'collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-mark">H</div>
            <div className="sidebar-wordmark">HERO</div>
          </div>
          <button type="button" className="header-icon-btn mobile-close-btn" onClick={onClose} aria-label="Close menu">
            <LucideX size={18} />
          </button>
        </div>

        <nav className="sidebar-scroll" aria-label="Main">
          {menuSections.map(sec => {
            if (sec.adminOnly && !isAdmin && !hasPermission('expenses.manage')) return null;

            const visibleItems = sec.items.filter(item => {
              if (isExplicitVendorRole && item.path === '/map-view' && !hasPermission('mapview.view')) return false;
              return canSee(item.perm);
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={sec.title}>
                <div className="menu-section-title">{sec.title}</div>
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/dashboard'}
                      onClick={onClose}
                      className={() => `menu-item-link ${isNavPathActive(item.path, pathname) ? 'active' : ''}`}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
