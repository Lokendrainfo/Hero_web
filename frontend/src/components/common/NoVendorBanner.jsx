import React from 'react';
import { LucideShieldAlert } from 'lucide-react';

export const NoVendorBanner = () => {
  return (
    <div style={{
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '12px',
      padding: '32px 24px',
      textAlign: 'center',
      color: '#991b1b',
      margin: '24px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px'
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: '#fee2e2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <LucideShieldAlert size={28} color="#dc2626" />
      </div>
      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 6px 0', color: '#7f1d1d' }}>
          No vendor has been assigned to your account.
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#991b1b', margin: 0 }}>
          Please contact an administrator to request vendor access scoping.
        </p>
      </div>
    </div>
  );
};
