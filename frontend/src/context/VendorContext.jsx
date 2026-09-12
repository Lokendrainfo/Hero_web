import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { vendorService } from '../services/vendorService';

const VendorContext = createContext(null);

export const VendorProvider = ({ children }) => {
  const { user, selectedVendorId } = useAuth();
  const [activeVendor, setActiveVendor] = useState(null);
  const [vendorMachines, setVendorMachines] = useState([]);
  const [vendorUsers, setVendorUsers] = useState([]);
  const [loadingVendor, setLoadingVendor] = useState(false);

  const fetchVendorData = useCallback(async () => {
    if (!user) {
      setActiveVendor(null);
      setVendorMachines([]);
      setVendorUsers([]);
      return;
    }

    setLoadingVendor(true);
    try {
      let targetId = 'me';
      if (selectedVendorId && selectedVendorId !== 'all') {
        targetId = selectedVendorId;
      }

      const res = await vendorService.getVendorById(targetId);
      const payload = res.data?.data || res.data || {};
      setActiveVendor(payload);
      setVendorMachines(payload.machines || payload.assigned_machines || []);
      setVendorUsers(payload.users || []);
    } catch (err) {
      console.error('[VendorContext] Error loading active vendor details:', err);
    } finally {
      setLoadingVendor(false);
    }
  }, [user, selectedVendorId]);

  useEffect(() => {
    fetchVendorData();
  }, [fetchVendorData]);

  const value = {
    activeVendor,
    vendorMachines,
    vendorUsers,
    vendorId: activeVendor?.id || activeVendor?.external_vendor_id || selectedVendorId,
    loadingVendor,
    refreshVendor: fetchVendorData
  };

  return (
    <VendorContext.Provider value={value}>
      {children}
    </VendorContext.Provider>
  );
};

export const useVendorContext = () => {
  const context = useContext(VendorContext);
  if (!context) {
    throw new Error('useVendorContext must be used within a VendorProvider');
  }
  return context;
};
