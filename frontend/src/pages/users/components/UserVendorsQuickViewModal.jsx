import React, { useState } from 'react';
import { LucideBuilding, LucideSearch, LucideX, LucideTrash2, LucideExternalLink, LucidePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const UserVendorsQuickViewModal = ({
  isOpen,
  user,
  onClose,
  onRemoveVendor,
  onOpenAssignModal
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  if (!isOpen || !user) return null;

  const assignedVendors = Array.isArray(user.vendors) ? user.vendors : [];
  const filteredVendors = assignedVendors.filter(v => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const name = (v.partnerName || v.name || '').toLowerCase();
    const code = (v.code || v.external_vendor_id || v.external_id || v.id || '').toLowerCase();
    return name.includes(q) || code.includes(q);
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
          maxWidth: '520px',
          padding: '24px',
          borderRadius: '12px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <LucideBuilding size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Assigned Vendors Scope
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                User: <strong>{user.name || user.username}</strong> • <strong>{assignedVendors.length}</strong> {assignedVendors.length === 1 ? 'Vendor' : 'Vendors'} Assigned
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

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Search assigned vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: '10px', top: '9px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
            >
              <LucideX size={14} />
            </button>
          )}
        </div>

        {/* Vendors List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '300px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '6px'
          }}
        >
          {filteredVendors.length > 0 ? (
            filteredVendors.map(v => (
              <div
                key={v.id || v.external_vendor_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                    {v.name || v.partnerName}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Code: <code style={{ background: 'var(--bg-surface)', padding: '1px 5px', borderRadius: '3px' }}>{v.code || v.external_vendor_id || v.id}</code>
                  </div>
                </div>

                {onRemoveVendor && (
                  <button
                    type="button"
                    onClick={() => onRemoveVendor(user.id, v.id || v.external_vendor_id)}
                    className="btn-danger"
                    style={{ padding: '4px 8px', height: '28px', fontSize: '0.75rem', borderRadius: '6px' }}
                    title="Remove Vendor Access"
                  >
                    <LucideTrash2 size={13} /> Remove
                  </button>
                )}
              </div>
            ))
          ) : (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              {search ? `No assigned vendors matching "${search}"` : 'No vendors currently assigned.'}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div>
            {onOpenAssignModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAssignModal(user);
                }}
                className="btn-secondary"
                style={{ fontSize: '0.78rem', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <LucidePlus size={14} /> Assign Another Vendor
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/users/${user.id}`);
              }}
              className="btn-primary"
              style={{ fontSize: '0.78rem', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              Open Full User Details <LucideExternalLink size={13} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ fontSize: '0.78rem', height: '32px' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
