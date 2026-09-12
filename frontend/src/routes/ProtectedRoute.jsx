import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>Loading Hero Web...</div>;
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
};
