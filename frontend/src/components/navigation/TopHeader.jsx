import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LucideMenu, LucideBell, LucideLogOut, LucideSettings, LucideUser } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { VendorSwitcher } from '../common/VendorSwitcher';
import { ConfirmDialog } from '../common/ConfirmDialog';

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/machines': 'Machines',
  '/tracking': 'Live Tracking',
  '/tasks': 'Tasks',
  '/map-view': 'Map View',
  '/chart-view': 'Depth View',
  '/team': 'Team',
  '/attendance': 'Attendance',
  '/expenses': 'Expenses',
  '/expense-categories': 'Expense Categories',
  '/expense-subcategories': 'Subcategories',
  '/fuel': 'Fuel Logs',
  '/refuel': 'Refuel',
  '/reports': 'Reports',
  '/maintenance': 'Maintenance',
  '/breakdown': 'Breakdowns',
  '/alerts': 'Alerts',
  '/stock': 'Stock',
  '/vendors': 'Vendors',
  '/users': 'Users',
  '/roles': 'Roles',
  '/notifications': 'Notifications',
  '/settings': 'Profile',
  '/setup/api': 'External API',
  '/api-docs': 'API Docs'
};

export const TopHeader = ({ onToggleSidebar, onOpenDrawer }) => {
  const { user, vendor, roles, vendors, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef(null);
  const toggleHandler = onToggleSidebar || onOpenDrawer;

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setDropdownOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        if (!signingOut) setLogoutOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [signingOut]);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setSigningOut(false);
      setLogoutOpen(false);
    }
  };

  const currentPath = location.pathname;
  let pageTitle = ROUTE_TITLES[currentPath];
  if (!pageTitle) {
    const matchedKey = Object.keys(ROUTE_TITLES).find(k => k !== '/' && currentPath.startsWith(k));
    pageTitle = matchedKey ? ROUTE_TITLES[matchedKey] : 'HERO';
  }

  const displayName = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'User';
  const primaryRole = user?.designation || (roles && roles.length > 0 ? roles[0] : (user?.role || 'VIEWER'));
  const vendorName = vendor?.name || user?.vendor_name || (vendors || [])[0]?.name || '—';
  const initials = displayName[0].toUpperCase();

  const metaRows = [
    { label: 'Email', value: user?.email || '—' },
    { label: 'Username', value: user?.username || '—' },
    { label: 'Employee ID', value: user?.employee_id || '—' },
    { label: 'External ID', value: user?.external_user_id || user?.id || '—' },
    { label: 'Vendor', value: vendorName },
    { label: 'Phone', value: user?.phone_number || '—' }
  ];

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <button type="button" className="header-icon-btn" onClick={toggleHandler} aria-label="Toggle navigation">
          <LucideMenu size={18} />
        </button>
        <span className="header-brand">{pageTitle}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <VendorSwitcher />

        <button type="button" className="header-icon-btn" onClick={() => navigate('/notifications')} aria-label="Notifications">
          <LucideBell size={18} />
        </button>

        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            type="button"
            className="header-user"
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <div className="avatar">{initials}</div>
            <div className="desktop-username" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: 1.2 }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{displayName}</span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{primaryRole}</span>
            </div>
          </button>

          {dropdownOpen && (
            <div className="header-dropdown" role="menu">
              <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar">{initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{displayName}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {user?.email || user?.username}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(roles || []).length > 0
                    ? roles.map((r) => <span key={r} className="badge-pill badge-neutral">{r}</span>)
                    : <span className="badge-pill badge-neutral">{primaryRole}</span>}
                  {user?.is_superuser ? <span className="badge-pill badge-idle">SUPERUSER</span> : null}
                  {user?.is_staff ? <span className="badge-pill badge-neutral">STAFF</span> : null}
                </div>
              </div>

              <dl className="header-dropdown-meta">
                {metaRows.map((row) => (
                  <div key={row.label} className="header-meta-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>

              <button
                type="button"
                className="header-dropdown-action"
                onClick={() => { setDropdownOpen(false); navigate('/settings'); }}
              >
                <LucideUser size={15} /> View profile
              </button>
              <button
                type="button"
                className="header-dropdown-action"
                onClick={() => { setDropdownOpen(false); navigate('/settings'); }}
              >
                <LucideSettings size={15} /> Account settings
              </button>
              <button
                type="button"
                className="header-dropdown-action danger"
                onClick={() => { setDropdownOpen(false); setLogoutOpen(true); }}
              >
                <LucideLogOut size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="Sign out of HERO?"
        message="You will need to sign in again to access fleet operations, maps, and reports."
        confirmLabel={signingOut ? 'Signing out…' : 'Sign out'}
        cancelLabel="Stay signed in"
        danger
        onCancel={() => { if (!signingOut) setLogoutOpen(false); }}
        onConfirm={handleLogout}
      />
    </header>
  );
};
