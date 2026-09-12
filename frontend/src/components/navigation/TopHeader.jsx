import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LucideMenu, LucideBell, LucideLogOut, LucideShield } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/machines': 'Machines',
  '/tracking': 'Live Tracking',
  '/tasks': 'My Tasks',
  '/map-view': 'Map View',
  '/team': 'Team',
  '/attendance': 'Attendance',
  '/expenses': 'Expenses',
  '/expense-categories': 'Category Master',
  '/expense-subcategories': 'Subcategory Master',
  '/fuel': 'Fuel Logs',
  '/refuel': 'Refuel Records',
  '/reports': 'Reports',
  '/maintenance': 'Maintenance',
  '/breakdown': 'Breakdowns',
  '/alerts': 'Alert Center',
  '/stock': 'Stock & Spares',
  '/vendors': 'Vendors',
  '/users': 'Users',
  '/roles': 'Roles & Permissions',
  '/notifications': 'Notifications',
  '/settings': 'Settings'
};

export const TopHeader = ({ onToggleSidebar, onOpenDrawer }) => {
  const { user, roles, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const toggleHandler = onToggleSidebar || onOpenDrawer;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Dynamically resolve page title based on current location
  const currentPath = location.pathname;
  let pageTitle = ROUTE_TITLES[currentPath];
  if (!pageTitle) {
    const matchedKey = Object.keys(ROUTE_TITLES).find(k => k !== '/' && currentPath.startsWith(k));
    pageTitle = matchedKey ? ROUTE_TITLES[matchedKey] : 'Dashboard';
  }

  const primaryRole = roles && roles.length > 0 ? roles[0] : (user?.role || 'VIEWER');
  const extId = user?.external_user_id || user?.id;

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={toggleHandler}
          style={{ color: '#fff', cursor: 'pointer', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center' }}
          title="Toggle Sidebar"
          id="sidebar-toggle-btn"
        >
          <LucideMenu size={24} />
        </button>
        <span className="header-brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
          {pageTitle}
        </span>
      </div>

      {/* User Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/notifications')}>
          <LucideBell size={20} color="#fff" />
          <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }} />
        </div>

        <div style={{ position: 'relative' }}>
          <div onClick={() => setDropdownOpen(!dropdownOpen)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem', color: '#fff' }}>
              {user?.name ? user.name[0].toUpperCase() : (user?.first_name ? user.first_name[0].toUpperCase() : 'U')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }} className="desktop-username">
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff' }}>
                {user?.name || user?.first_name || user?.username}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#6ee7b7', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <LucideShield size={10} /> {primaryRole}
              </span>
            </div>
          </div>

          {dropdownOpen && (
            <div style={{ position: 'absolute', right: 0, top: '44px', background: '#ffffff', color: '#111827', borderRadius: '10px', width: '220px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb', padding: '8px 0', zIndex: 101 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 'bold', color: '#111827' }}>{user?.name || user?.username}</div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '2px' }}>
                  Ext ID: <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' }}>{extId}</code>
                </div>
                <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {roles.map(r => (
                    <span key={r} style={{ fontSize: '0.65rem', background: '#0a2d23', color: '#6ee7b7', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div onClick={handleLogout} style={{ padding: '10px 16px', fontSize: '0.85rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <LucideLogOut size={16} /> Sign Out
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
