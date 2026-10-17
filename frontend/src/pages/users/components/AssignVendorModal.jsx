import React, { useState } from 'react';
import { LucideBuilding, LucideSearch, LucideX, LucideCheck } from 'lucide-react';
import { userService } from '../../../services/userService';

export const AssignVendorModal = ({ isOpen, user, onClose, onSuccess, systemVendors = [] }) => {
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !user) return null;

  const handleAssign = async () => {
    if (!selectedVendorId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await userService.assignVendor(user.id, selectedVendorId);
      const updatedUser = res.data;
      if (onSuccess) {
        onSuccess(updatedUser, `Vendor assigned successfully to ${user.username || user.name}`);
      }
      onClose();
    } catch (err) {
      console.error('Failed to assign vendor:', err);
      const msg = err.response?.data?.message || err.response?.data?.detail || 'Failed to assign vendor scope.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredVendors = (systemVendors || []).filter(v => {
    if (!vendorSearch.trim()) return true;
    const q = vendorSearch.toLowerCase().trim();
    const name = (v.partnerName || v.name || '').toLowerCase();
    const code = (v.code || v.external_vendor_id || v.external_id || v.id || '').toLowerCase();
    const contact = (v.contactName || v.contact_person || '').toLowerCase();
    return name.includes(q) || code.includes(q) || contact.includes(q);
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="app-card"
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: '24px',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <LucideBuilding size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Assign Vendor Scope
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                User: <strong>{user.name || user.username}</strong>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="header-icon-btn"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '6px' }}
            title="Close"
          >
            <LucideX size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '0.8rem', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {/* Vendor Search */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Select Vendor from System Registry ({systemVendors.length} available):
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search vendor by name, code, contact..."
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '1px solid var(--border-strong)',
                fontSize: '0.82rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <LucideSearch size={15} color="#9ca3af" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            {vendorSearch && (
              <button
                onClick={() => setVendorSearch('')}
                style={{ position: 'absolute', right: '10px', top: '9px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
              >
                <LucideX size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Vendors List */}
        <div
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            padding: '4px',
            marginBottom: '18px'
          }}
        >
          {filteredVendors.length > 0 ? (
            filteredVendors.map(v => {
              const targetVal = v.id || v.external_vendor_id;
              const isSelected = String(selectedVendorId) === String(targetVal);
              const name = v.partnerName || v.name;
              const contact = v.contactName || v.contact_person || 'N/A';
              const code = v.legalEntityType || v.code || v.external_vendor_id || 'VENDOR';

              return (
                <div
                  key={targetVal}
                  onClick={() => setSelectedVendorId(targetVal)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: isSelected ? '#ecfdf5' : 'transparent',
                    border: isSelected ? '1px solid #059669' : '1px solid transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: isSelected ? '700' : '600', fontSize: '0.84rem', color: isSelected ? '#065f46' : 'var(--text-primary)' }}>
                      {name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Contact: {contact} • <code style={{ background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: '3px' }}>{code}</code>
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <LucideCheck size={14} /> Selected
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No vendors found matching your search.
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.82rem' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedVendorId || submitting}
            className="btn-primary"
            style={{ padding: '8px 18px', fontSize: '0.82rem', background: '#059669', borderColor: '#059669' }}
          >
            {submitting ? 'Assigning...' : 'Confirm Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
};
