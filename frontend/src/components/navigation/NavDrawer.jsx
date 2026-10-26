import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { isNavPathActive } from '../../utils/navActive';
import {
  LucideLayoutDashboard, LucideTruck, LucideNavigation, LucideCheckSquare, LucideUsers, LucideCalendarCheck,
  LucideDollarSign, LucideFuel, LucideRepeat, LucideFileText, LucideWrench, LucideAlertOctagon, LucideAlertTriangle,
  LucidePackage, LucideBuilding, LucideUserCheck, LucideShieldCheck, LucideBell, LucideSettings, LucideX, LucideGlobe,
  LucideLayers, LucideTag, LucideLineChart, LucideArrowLeftRight, LucideBookOpen, LucideChevronDown, LucideChevronRight,
  LucideCompass, LucideNetwork, LucideFileCheck, LucideFileSpreadsheet, LucidePlay, LucideActivity, LucideRadio,
  LucideSpline, LucideLayers2
} from 'lucide-react';

const PLANNING_CATEGORIES = [
  { key: 'gp_survey', label: 'GP Survey' },
  { key: 'block', label: 'Block' },
  { key: 'fiber', label: 'Fiber' },
  { key: 'otdr', label: 'OTDR' },
  { key: 'dtp', label: 'DTP' },
  { key: 'green_v2', label: 'Green V2' },
  { key: 'land_based_v2', label: 'Land Based V2' },
  { key: 'brown', label: 'Brown' },
  { key: 'electric_meter', label: 'Electric Meter Task' }
];

const EXECUTION_INFRA_CATEGORIES = [
  { key: 'gp_infra', label: 'GP Infra' },
  { key: 'block_infra', label: 'Block Infra' }
];

const EXECUTION_FIBER_CATEGORIES = [
  { key: 'trenching_ducting', label: 'Trenching & Ducting' },
  { key: 'manhole', label: 'Manhole' },
  { key: 'blowing', label: 'Blowing' },
  { key: 'splicing', label: 'Splicing' },
  { key: 'otdr', label: 'OTDR' },
  { key: 'route_marker', label: 'Route Marker' }
];

export const NavDrawer = ({ isOpen, isVisible = true, isMobileOpen, onClose }) => {
  const { hasPermission, roles, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname, search } = location;
  const activeMobile = isMobileOpen !== undefined ? isMobileOpen : isOpen;
  const activeVisible = isVisible !== undefined ? isVisible : true;
  const canSee = (perm) => isAdmin || !perm || (Array.isArray(perm) ? perm.some(p => hasPermission(p)) : hasPermission(perm));

  const searchParams = new URLSearchParams(search);
  const currentTab = searchParams.get('tab') || (pathname.includes('/execution') ? 'execution' : 'planning');
  const currentGroup = searchParams.get('group') || (currentTab === 'execution' ? 'infra' : null);
  const currentCategory = searchParams.get('category') || (currentTab === 'planning' ? 'gp_survey' : (currentGroup === 'infra' ? 'gp_infra' : 'trenching_ducting'));

  const isTaskRoute = (pathname === '/tasks' || pathname.startsWith('/tasks/planning') || pathname.startsWith('/tasks/execution')) &&
    !['/tasks/hindrance', '/tasks/otn', '/tasks/ccn'].includes(pathname);
  const isExecutionTab = isTaskRoute && currentTab === 'execution';
  const isPlanningTab = isTaskRoute && currentTab === 'planning';
  const isInfraGroup = isExecutionTab && (currentGroup === 'infra' || currentCategory === 'gp_infra' || currentCategory === 'block_infra');
  const isFiberGroup = isExecutionTab && !isInfraGroup;

  const [taskTreeOpen, setTaskTreeOpen] = useState(true);
  const [planningOpen, setPlanningOpen] = useState(isPlanningTab || !isExecutionTab);
  const [executionOpen, setExecutionOpen] = useState(isExecutionTab);

  // Auto-expand active branch when URL changes, keeping inactive branch collapsed
  useEffect(() => {
    if (isTaskRoute) {
      setTaskTreeOpen(true);
      if (isPlanningTab) {
        setPlanningOpen(true);
        setExecutionOpen(false);
      } else if (isExecutionTab) {
        setExecutionOpen(true);
        setPlanningOpen(false);
      }
    }
  }, [pathname, search, isTaskRoute, isPlanningTab, isExecutionTab]);

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
      } catch { }
      return next;
    });
  };

  const menuSections = [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: LucideLayoutDashboard, perm: 'dashboard.view' },
        { label: 'Project Dashboard', path: '/project-dashboard', icon: LucideLayers, perm: 'dashboard.view' }
      ]
    },
    {
      title: 'Operations',
      items: [
        { label: 'Machines', path: '/machines', icon: LucideTruck, perm: 'machines.view' },
        { label: 'Live Tracking', path: '/tracking', icon: LucideNavigation, perm: 'tracking.view' },
        { label: 'Refuel', path: '/refuel', icon: LucideFuel, perm: 'refuel.view' },
        { label: 'Machine Shift Request', path: '/machine-shift', icon: LucideArrowLeftRight, perm: 'machine_shift.view' },
        { label: 'Depth View', path: '/chart-view', icon: LucideLineChart, perm: 'chartview.view' },
        { label: 'Attendance', path: '/attendance', icon: LucideCalendarCheck, perm: 'attendance.view' }
      ]
    },
    {
      title: 'TASK',
      isTaskSection: true,
      items: [
        { label: 'Hindrance', path: '/tasks/hindrance', icon: LucideAlertTriangle, perm: 'tasks.view' },
        { label: 'OTN', path: '/tasks/otn', icon: LucideNetwork, perm: 'tasks.view' },
        { label: 'CCN', path: '/tasks/ccn', icon: LucideFileCheck, perm: 'tasks.view' }
      ]
    },
    {
      title: 'Map View',
      items: [
        { label: 'Dashboard', path: '/map-view', icon: LucideLayoutDashboard, perm: 'mapview.dashboard' },
        { label: 'Trenching', path: '/map-view/trenching', icon: LucideGlobe, perm: 'mapview.view' },
        { label: 'Green Survey', path: '/map-view/green', icon: LucideCompass, perm: ['mapview.green_field', 'green_field.view', 'mapview.green_survey'] }
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
      title: 'Reports',
      items: [
        { label: 'Execution Report', path: '/reports/execution', icon: LucideFileSpreadsheet, perm: 'reports.view' }
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
          } catch { }
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
                    {section.isTaskSection && (
                      <div className="nav-nested-tree">
                        {/* Task Parent Node */}
                        <div className="nav-nested-node">
                          <button
                            type="button"
                            className={`nav-nested-btn nav-level-0 ${isTaskRoute ? 'active-parent' : ''}`}
                            onClick={() => {
                              setTaskTreeOpen(prev => !prev);
                              if (!isTaskRoute) {
                                navigate('/tasks?tab=planning&category=gp_survey');
                                if (isMobileOpen && onClose) onClose();
                              }
                            }}
                          >
                            <div className="node-left">
                              <LucideCheckSquare size={18} className="node-icon" />
                              <span className="nav-label" style={{ fontWeight: 600 }}>Task</span>
                            </div>
                            <LucideChevronRight size={14} className={`node-chevron ${taskTreeOpen ? 'expanded' : ''}`} />
                          </button>

                          {taskTreeOpen && (
                            <div className="nav-nested-children">
                              {/* 1. Planning Submenu */}
                              <div className="nav-nested-node">
                                <button
                                  type="button"
                                  className={`nav-nested-btn nav-level-1 ${isPlanningTab ? 'active-parent' : ''}`}
                                  onClick={() => {
                                    setPlanningOpen(prev => {
                                      const next = !prev;
                                      if (next) setExecutionOpen(false);
                                      return next;
                                    });
                                    if (!isPlanningTab) {
                                      navigate('/tasks?tab=planning&category=gp_survey');
                                      if (isMobileOpen && onClose) onClose();
                                    }
                                  }}
                                >
                                  <div className="node-left">
                                    <span className="node-bullet" />
                                    <span className="node-label" style={{ fontWeight: 600 }}>Planning</span>
                                  </div>
                                  <LucideChevronRight size={14} className={`node-chevron ${planningOpen ? 'expanded' : ''}`} />
                                </button>

                                {planningOpen && (
                                  <div className="nav-nested-children">
                                    {PLANNING_CATEGORIES.map(cat => {
                                      const isLeafActive = isPlanningTab && currentCategory === cat.key;
                                      return (
                                        <NavLink
                                          key={cat.key}
                                          to={`/tasks?tab=planning&category=${cat.key}`}
                                          className={`nav-nested-btn nav-level-2 ${isLeafActive ? 'active-leaf' : ''}`}
                                          onClick={() => {
                                            if (isMobileOpen && onClose) onClose();
                                          }}
                                        >
                                          <div className="node-left">
                                            <span className="node-bullet" />
                                            <span className="node-label">{cat.label}</span>
                                          </div>
                                        </NavLink>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* 2. Execution Submenu */}
                              <div className="nav-nested-node">
                                <button
                                  type="button"
                                  className={`nav-nested-btn nav-level-1 ${isExecutionTab ? 'active-parent' : ''}`}
                                  onClick={() => {
                                    setExecutionOpen(prev => {
                                      const next = !prev;
                                      if (next) setPlanningOpen(false);
                                      return next;
                                    });
                                    if (!isExecutionTab) {
                                      navigate('/tasks?tab=execution&group=infra&category=gp_infra');
                                      if (isMobileOpen && onClose) onClose();
                                    }
                                  }}
                                >
                                  <div className="node-left">
                                    <span className="node-bullet" />
                                    <span className="node-label" style={{ fontWeight: 600 }}>Execution</span>
                                  </div>
                                  <LucideChevronRight size={14} className={`node-chevron ${executionOpen ? 'expanded' : ''}`} />
                                </button>

                                {executionOpen && (
                                  <div className="nav-nested-children">
                                    {/* Infra Category Leaf */}
                                    <NavLink
                                      to="/tasks?tab=execution&group=infra&category=gp_infra"
                                      className={`nav-nested-btn nav-level-2 ${isExecutionTab && isInfraGroup ? 'active-leaf' : ''}`}
                                      onClick={() => {
                                        if (isMobileOpen && onClose) onClose();
                                      }}
                                    >
                                      <div className="node-left">
                                        <span className="node-bullet" />
                                        <span className="node-label">Infra</span>
                                      </div>
                                    </NavLink>

                                    {/* Fiber Category Leaf */}
                                    <NavLink
                                      to="/tasks?tab=execution&group=fiber&category=trenching_ducting"
                                      className={`nav-nested-btn nav-level-2 ${isExecutionTab && isFiberGroup ? 'active-leaf' : ''}`}
                                      onClick={() => {
                                        if (isMobileOpen && onClose) onClose();
                                      }}
                                    >
                                      <div className="node-left">
                                        <span className="node-bullet" />
                                        <span className="node-label">Fiber</span>
                                      </div>
                                    </NavLink>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = isNavPathActive(pathname, item.path);
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === '/tasks' || item.path === '/dashboard'}
                          className={() => `nav-link-item ${isActive ? 'active' : ''}`}
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
