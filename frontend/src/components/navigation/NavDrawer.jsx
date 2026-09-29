import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { isNavPathActive } from '../../utils/navActive';
import {
  LucideLayoutDashboard, LucideTruck, LucideNavigation, LucideCheckSquare, LucideUsers, LucideCalendarCheck,
  LucideDollarSign, LucideFuel, LucideRepeat, LucideFileText, LucideWrench, LucideAlertOctagon, LucideAlertTriangle,
  LucidePackage, LucideBuilding, LucideUserCheck, LucideShieldCheck, LucideBell, LucideSettings, LucideX, LucideGlobe,
  LucideLayers, LucideTag, LucideLineChart, LucideArrowLeftRight, LucideBookOpen, LucideChevronDown
} from 'lucide-react';

export const NavDrawer = ({ isOpen, isVisible = true, isMobileOpen, onClose }) => {
  const { hasPermission, roles, isAdmin } = useAuth();
  const { pathname } = useLocation();
  const activeMobile = isMobileOpen !== undefined ? isMobileOpen : isOpen;
  const activeVisible = isVisible !== undefined ? isVisible : true;
  const canSee = (perm) => isAdmin || !perm || (Array.isArray(perm) ? perm.some(p => hasPermission(p)) : hasPermission(perm));

  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = localStorage.getItem('hero_collapsed_nav_sections');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleSection = (title) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem('hero_collapsed_nav_sections', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

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
        { label: 'Refuel', path: '/refuel', icon: LucideFuel, perm: 'refuel.view' },
        { label: 'Tasks', path: '/tasks', icon: LucideCheckSquare, perm: 'tasks.view' },
        { label: 'Machine Shift Request', path: '/machine-shift', icon: LucideArrowLeftRight, perm: 'machine_shift.view' },
        { label: 'Depth View', path: '/chart-view', icon: LucideLineChart, perm: 'chartview.view' },
        { label: 'Attendance', path: '/attendance', icon: LucideCalendarCheck, perm: 'attendance.view' }
      ]
    },
    {
      title: 'Map View',
      items: [
        { label: 'Dashboard', path: '/map-view', icon: LucideLayoutDashboard, perm: 'mapview.dashboard' },
        { label: 'Trenching', path: '/map-view/trenching', icon: LucideGlobe, perm: 'mapview.view' }
      ]
    },
    {
      title: 'Finance',
      items: [
        { label: 'Expenses', path: '/expenses', icon: LucideDollarSign, perm: 'expenses.view' },
        { label: 'Fuel Logs', path: '/fuel', icon: LucideFuel, perm: 'fuel.view' },
        { label: 'Reports', path: '/reports', icon: LucideFileText, perm: 'reports.view' }
      ]
    },
    {
      title: 'Masters',
      items: [
        { label: 'Expense Categories', path: '/expense-categories', icon: LucideLayers, perm: 'expense_categories.view' },
        { label: 'Subcategories', path: '/expense-subcategories', icon: LucideTag, perm: 'expense_subcategories.view' }
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
      title: 'Setup',
      items: [
        { label: 'API Docs', path: '/setup/api', icon: LucideBookOpen, perm: 'api_docs.view' }
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

  // Auto-expand section if active route is inside it
  useEffect(() => {
    menuSections.forEach(section => {
      const hasActiveChild = section.items.some(item => isNavPathActive(pathname, item.path));
      if (hasActiveChild && collapsedSections[section.title]) {
        setCollapsedSections(prev => {
          const next = { ...prev, [section.title]: false };
          try {
            localStorage.setItem('hero_collapsed_nav_sections', JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    });
  }, [pathname]);

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

        <nav className="sidebar-nav">
          {menuSections.map((section, idx) => {
            const visibleItems = section.items.filter(item => canSee(item.perm));
            if (visibleItems.length === 0) return null;

            const isCollapsed = Boolean(collapsedSections[section.title]);

            return (
              <div key={idx} className={`nav-section ${isCollapsed ? 'is-collapsed' : ''}`}>
                <button
                  type="button"
                  className={`nav-section-header ${isCollapsed ? 'is-collapsed' : ''}`}
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={!isCollapsed}
                  title={`${isCollapsed ? 'Expand' : 'Collapse'} ${section.title}`}
                >
                  <span className="nav-section-title-text">{section.title}</span>
                  <LucideChevronDown size={14} className="nav-section-chevron" />
                </button>
                {!isCollapsed && (
                  <div className="nav-section-items">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = isNavPathActive(pathname, item.path);
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={`nav-link-item ${isActive ? 'active' : ''}`}
                          onClick={() => {
                            if (isMobileOpen && onClose) onClose();
                          }}
                        >
                          <Icon size={18} className="nav-icon" />
                          <span className="nav-label">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
