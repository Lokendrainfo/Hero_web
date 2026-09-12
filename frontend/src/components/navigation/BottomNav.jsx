import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LucideHome, LucideTruck, LucideCheckSquare, LucideNavigation, LucideMoreHorizontal } from 'lucide-react';
import { isNavPathActive } from '../../utils/navActive';

export const BottomNav = ({ onOpenMore }) => {
  const { pathname } = useLocation();
  const itemClass = (path) => `bottom-nav-item ${isNavPathActive(path, pathname) ? 'active' : ''}`;

  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/dashboard" end className={itemClass('/dashboard')}>
        <LucideHome size={20} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/machines" className={itemClass('/machines')}>
        <LucideTruck size={20} />
        <span>Machines</span>
      </NavLink>
      <NavLink to="/tasks" className={itemClass('/tasks')}>
        <LucideCheckSquare size={20} />
        <span>Tasks</span>
      </NavLink>
      <NavLink to="/tracking" className={itemClass('/tracking')}>
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
