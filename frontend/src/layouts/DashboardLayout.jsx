import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TopHeader } from '../components/navigation/TopHeader';
import { BottomNav } from '../components/navigation/BottomNav';
import { NavDrawer } from '../components/navigation/NavDrawer';
import '../styles/globals.css';
import '../styles/components.css';

export const DashboardLayout = () => {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleToggleSidebar = () => {
    // Toggle desktop sidebar or mobile drawer
    if (window.innerWidth < 1024) {
      setMobileDrawerOpen(prev => !prev);
    } else {
      setSidebarVisible(prev => !prev);
    }
  };

  return (
    <div className="app-shell">
      {/* Single Responsive Navigation Sidebar/Drawer */}
      <NavDrawer
        isVisible={sidebarVisible}
        isMobileOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />

      {/* Main Viewport */}
      <div className="main-viewport">
        <TopHeader
          onToggleSidebar={handleToggleSidebar}
          onOpenDrawer={() => setMobileDrawerOpen(true)}
        />
        <main className="page-content">
          <Outlet />
        </main>
        <BottomNav onOpenMore={() => setMobileDrawerOpen(true)} />
      </div>
    </div>
  );
};
