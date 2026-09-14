import React, { createContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { VIEWER_FALLBACK_PERMS } from '../utils/permissions';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [userVendorsList, setUserVendorsList] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async () => {
    try {
      const res = await authService.getMe();
      const payload = res?.data || res;
      const uData = payload?.user || (payload?.id !== undefined ? payload : null);
      const vData = payload?.vendors || uData?.vendors || [];
      const primaryVendor = payload?.vendor || uData?.vendor_details || uData?.vendor || null;
      setUser(uData);
      setVendor(primaryVendor);
      setUserVendorsList(vData);
      return uData;
    } catch (err) {
      console.error("[AuthContext] Failed to fetch user profile:", err);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setUser(null);
      setVendor(null);
      setUserVendorsList([]);
      return null;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          await fetchUserProfile();
        } catch (err) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (username, password) => {
    const res = await authService.login(username, password);
    const data = res?.data || res;
    const { access_token, refresh_token } = data;

    if (access_token) localStorage.setItem('access_token', access_token);
    if (refresh_token) localStorage.setItem('refresh_token', refresh_token);

    const profile = await fetchUserProfile();
    return profile || data.user;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (e) { }
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);
    setVendor(null);
    setUserVendorsList([]);
  };

  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
  const userPermissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const userVendors = userVendorsList.length > 0 ? userVendorsList : (Array.isArray(user?.vendors) ? user.vendors : []);

  const [selectedVendorId, setSelectedVendorId] = useState('all');

  const isAdmin = userRoles.includes('ADMIN') || !!user?.is_superuser;
  const isVendor = userRoles.some(r => (r || '').toUpperCase().includes('VENDOR')) || userVendors.length > 0 || !!user?.vendor || !!user?.vendor_id;
  const hasNoVendors = !isAdmin && userVendors.length === 0;

  const isAllViewer = userRoles.some(r => (r || '').toUpperCase() === 'ALL_VIEWER');

  const hasPermission = (code) => {
    if (!user) return false;
    if (isAdmin) return true;
    if (isAllViewer && (code.endsWith('.view') || code.includes('view'))) return true;
    if (userPermissions.includes(code)) return true;
    if (userPermissions.length === 0 && VIEWER_FALLBACK_PERMS.includes(code)) return true;
    return false;
  };

  const hasRole = (roleName) => {
    if (!user) return false;
    if (user?.is_superuser && roleName === 'ADMIN') return true;
    return userRoles.some(r => (r || '').toUpperCase() === (roleName || '').toUpperCase());
  };

  return (
    <AuthContext.Provider value={{
      user,
      vendor,
      loading,
      roles: userRoles,
      permissions: userPermissions,
      vendors: userVendors,
      selectedVendorId,
      setSelectedVendorId,
      isAdmin,
      isVendor,
      hasNoVendors,
      hasPermission,
      hasRole,
      login,
      logout,
      refreshProfile: fetchUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
