import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getDefaultRoute } from '../utils/permissions';

export const PublicRoute = () => {
  const { user, permissions, isAdmin, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>Loading Hero Web...</div>;
  }

  const defaultRoute = getDefaultRoute(permissions, isAdmin);
  return !user ? <Outlet /> : <Navigate to={defaultRoute} replace />;
};
