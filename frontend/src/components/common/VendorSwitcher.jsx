import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { SearchableSelect } from './Select';

export const VendorSwitcher = () => {
  const { vendors, selectedVendorId, setSelectedVendorId, isAdmin } = useAuth();
  const list = Array.isArray(vendors) ? vendors : [];

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
        return (
          <option key={id} value={id}>
            {v.name || v.code || id}
          </option>
        );
      })}
    </SearchableSelect>
  );
};
