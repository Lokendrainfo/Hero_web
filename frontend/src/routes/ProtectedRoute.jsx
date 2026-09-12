import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="empty-state" style={{ margin: 40, borderStyle: 'solid' }}><p>Loading HERO…</p></div>;
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
};
