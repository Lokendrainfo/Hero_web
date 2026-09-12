import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideLayoutDashboard, LucideTruck, LucideNavigation, LucideCheckSquare, LucideUsers, LucideCalendarCheck,
  LucideDollarSign, LucideFuel, LucideRepeat, LucideFileText, LucideWrench, LucideAlertOctagon, LucideAlertTriangle,
  LucidePackage, LucideBuilding, LucideUserCheck, LucideShieldCheck, LucideBell, LucideSettings, LucideX, LucideGlobe,
  LucideLayers, LucideTag
} from 'lucide-react';

export const NavDrawer = ({ isOpen, isVisible = true, isMobileOpen, onClose }) => {
  const { hasPermission, roles, vendors, isAdmin } = useAuth();
  const activeMobile = isMobileOpen !== undefined ? isMobileOpen : isOpen;
  const activeVisible = isVisible !== undefined ? isVisible : true;

  const isExplicitVendorRole = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR');

  const menuSections = [
    {
      title: 'Main',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: LucideLayoutDashboard, perm: 'dashboard.view' }
      ]
    },
    {
      title: 'Operations',
      items: [
        { label: 'Machines', path: '/machines', icon: LucideTruck, perm: 'machines.view' },
        { label: 'Live Tracking', path: '/tracking', icon: LucideNavigation, perm: 'tracking.view' },
        { label: 'My Tasks', path: '/tasks', icon: LucideCheckSquare, perm: 'tasks.view' },
        { label: 'Map View', path: '/map-view', icon: LucideGlobe, perm: 'mapview.view' },
        { label: 'Team', path: '/team', icon: LucideUsers, perm: 'team.view' },
        { label: 'Attendance', path: '/attendance', icon: LucideCalendarCheck, perm: 'attendance.view' }
      ]
    },
    {
      title: 'Finance & Fuel',
      items: [
        { label: 'Expenses', path: '/expenses', icon: LucideDollarSign, perm: 'expenses.view' },
        { label: 'Fuel Logs', path: '/fuel', icon: LucideFuel, perm: 'fuel.view' },
        { label: 'Refuel Records', path: '/refuel', icon: LucideRepeat, perm: 'refuel.view' },
        { label: 'Reports', path: '/reports', icon: LucideFileText, perm: 'reports.view' }
      ]
    },
    {
      title: 'Masters',
      adminOnly: true,
      items: [
        { label: 'Category Master', path: '/expense-categories', icon: LucideLayers, perm: 'expenses.manage' },
        { label: 'Subcategory Master', path: '/expense-subcategories', icon: LucideTag, perm: 'expenses.manage' }
      ]
    },
    {
      title: 'Maintenance',
      items: [
        { label: 'Maintenance', path: '/maintenance', icon: LucideWrench, perm: 'maintenance.view' },
        { label: 'Breakdowns', path: '/breakdown', icon: LucideAlertOctagon, perm: 'breakdowns.view' },
        { label: 'Alert Center', path: '/alerts', icon: LucideAlertTriangle, perm: 'alerts.view' }
      ]
    },
    {
      title: 'Inventory',
      items: [
        { label: 'Stock & Spares', path: '/stock', icon: LucidePackage, perm: 'inventory.view' }
      ]
    },
    {
      title: 'Management',
      items: [
        { label: 'Vendors', path: '/vendors', icon: LucideBuilding, perm: 'vendors.view' },
        { label: 'Users', path: '/users', icon: LucideUserCheck, perm: 'users.view' },
        { label: 'Roles & Permissions', path: '/roles', icon: LucideShieldCheck, perm: 'roles.view' }
      ]
    },
    {
      title: 'System',
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
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 'bold', letterSpacing: '0.04em' }}>HERO</span>
          <LucideX size={20} className="mobile-close-btn" onClick={onClose} style={{ cursor: 'pointer' }} />
        </div>

        <div style={{ flex: 1, paddingBottom: '30px', overflowY: 'auto' }}>
          {menuSections.map(sec => {
            if (sec.adminOnly && !isAdmin && !hasPermission('expenses.manage')) return null;

            const visibleItems = sec.items.filter(item => {
              if (isExplicitVendorRole && item.path === '/map-view' && !hasPermission('mapview.view')) return false;
              return isAdmin || !item.perm || hasPermission(item.perm);
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
                      onClick={onClose}
                      className={({ isActive }) => {
                        const isCustomActive = isActive || (item.path === '/map-view' && window.location.pathname.startsWith('/map-view'));
                        return `menu-item-link ${isCustomActive ? 'active' : ''}`;
                      }}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};
