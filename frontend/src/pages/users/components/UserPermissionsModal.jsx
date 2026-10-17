import React, { useState } from 'react';
import { LucideShield, LucideSearch, LucideX } from 'lucide-react';
import { roleBadgeClass } from '../../../utils/roleBadge';

export const UserPermissionsModal = ({ isOpen, user, onClose }) => {
  const [filterQuery, setFilterQuery] = useState('');

  if (!isOpen || !user) return null;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const filteredPermissions = permissions.filter(p =>
    p.toLowerCase().includes(filterQuery.toLowerCase().trim())
  );

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
          maxWidth: '560px',
          padding: '24px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '12px'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <LucideShield size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                {user.name || user.first_name || user.username}
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                External ID: <code style={{ color: '#047857', background: '#ecfdf5', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>{user.external_user_id || user.employee_id || user.id}</code>
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

        {/* Role & Summary */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-subtle)', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              Assigned HERO Role
            </div>
            <div style={{ marginTop: '4px' }}>
              <span className={`badge-pill ${roleBadgeClass(user.role || 'VIEWER')}`} style={{ fontSize: '0.8rem', padding: '3px 10px' }}>
                {user.role || 'VIEWER'}
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              Active Permissions
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>
              {permissions.length} <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-muted)' }}>granted</span>
            </div>
          </div>
        </div>

        {/* Filter Input */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Search permissions..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
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
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              style={{ position: 'absolute', right: '10px', top: '9px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
            >
              <LucideX size={14} />
            </button>
          )}
        </div>

        {/* Permissions list container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '340px',
            padding: '8px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            alignContent: 'flex-start'
          }}
        >
          {filteredPermissions.length > 0 ? (
            filteredPermissions.map(p => (
              <span
                key={p}
                className="badge-pill badge-neutral"
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)'
                }}
              >
                {p}
              </span>
            ))
          ) : (
            <div style={{ width: '100%', textAlign: 'center', padding: '28px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {filterQuery ? `No permissions matching "${filterQuery}"` : 'No active permissions assigned to this user.'}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '8px 20px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
