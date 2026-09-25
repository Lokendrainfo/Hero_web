import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { SearchableSelect } from './Select';
import { vendorService } from '../../services/vendorService';

export const VendorSwitcher = () => {
  const { vendors, selectedVendorId, setSelectedVendorId, isAdmin } = useAuth();
  const [liveVendors, setLiveVendors] = useState([]);

  useEffect(() => {
    let cancelled = false;
    vendorService.getAll()
      .then(res => {
        if (cancelled) return;
        const payload = res.data?.data || res.data || {};
        const vList = payload.results || payload.content || (Array.isArray(payload) ? payload : (payload.vendors || []));
        if (Array.isArray(vList) && vList.length > 0) {
          setLiveVendors(vList);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => {
    const map = new Map();
    (Array.isArray(vendors) ? vendors : []).forEach(v => {
      const id = String(v.external_vendor_id || v.id || '').trim();
      if (id) map.set(id, v);
    });
    liveVendors.forEach(v => {
      const id = String(v.external_vendor_id || v.id || '').trim();
      if (id) {
        const prev = map.get(id) || {};
        map.set(id, { ...prev, ...v });
      }
    });
    return Array.from(map.values());
  }, [vendors, liveVendors]);

  if (!list.length && !isAdmin) return null;

  return (
    <SearchableSelect
      className="vendor-switcher"
      value={selectedVendorId || 'all'}
      onChange={(e) => setSelectedVendorId(e.target.value)}
      title="Filter by vendor"
      aria-label="Filter by vendor"
      searchPlaceholder="Search vendors…"
    >
      <option value="all">{isAdmin ? 'All vendors' : 'All assigned vendors'}</option>
      {list.map((v) => {
        const id = v.external_vendor_id || v.id;
        const name = (v.partnerName || v.name || v.code || id).trim();
        return (
          <option key={id} value={id}>
            {name}
          </option>
        );
      })}
    </SearchableSelect>
  );
};
