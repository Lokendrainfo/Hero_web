import React from 'react';
import { NavLink } from 'react-router-dom';
import { LucideHome, LucideTruck, LucideCheckSquare, LucideNavigation, LucideMoreHorizontal } from 'lucide-react';

export const BottomNav = ({ onOpenMore }) => {
  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/dashboard" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <LucideHome size={20} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/machines" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <LucideTruck size={20} />
        <span>Machines</span>
      </NavLink>
      <NavLink to="/tasks" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <LucideCheckSquare size={20} />
        <span>Tasks</span>
      </NavLink>
      <NavLink to="/tracking" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <LucideNavigation size={20} />
        <span>Tracking</span>
      </NavLink>
      <button onClick={onOpenMore} className="bottom-nav-item">
        <LucideMoreHorizontal size={20} />
        <span>More</span>
      </button>
    </nav>
  );
};
