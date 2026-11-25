import React, { useEffect, useState } from 'react';
import { LucideAlertTriangle, LucideBookOpen, LucideCheckCircle2 } from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { PmLayoutHeader } from './PmLayoutHeader';

export const PmSafetyGuidelinesPage = () => {
  const { showToast } = useToast();
  const [roleInfo, setRoleInfo] = useState(null);
  const [guidelines, setGuidelines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([pmService.getFrequencies(), pmService.getSafetyGuidelines()])
      .then(([fRes, gRes]) => {
        setRoleInfo(fRes?.data?.role_info || null);
        setGuidelines(gRes?.data || []);
      })
      .catch((err) => showToast(err?.message || 'Failed to load safety guidelines.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="Safety Guidelines & SOP"
        subtitle="Apollo HDD Model A600V2 — General Safety Guidelines, Pre-Operating Instructions & Don'ts"
        roleInfo={roleInfo}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
        <div style={{ padding: '12px 14px', borderRadius: 'var(--radius)', background: '#ecfdf5', border: '1px solid #a7f3d0', fontSize: '0.8rem', color: '#065f46', display: 'flex', gap: '10px' }}>
          <LucideCheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Mandatory Daily Greasing:</strong> Total 16 points in Vise Clamp Assembly, Guide Rollers, Cylinder Pin & Bushings, and Water Swivels must be greased daily.
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 'var(--radius)', background: '#fef2f2', border: '1px solid #fecaca', fontSize: '0.8rem', color: '#991b1b', display: 'flex', gap: '10px' }}>
          <LucideAlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Critical Operational Limits:</strong> Marching/travel must not exceed 500m at one stretch. Suction hose must be 2&quot; or 3&quot; (never 40mm duct).
          </div>
        </div>
      </div>

      {loading ? (
        <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading SOP safety guidelines...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {guidelines.map((g) => (
            <div key={g.id} className="app-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LucideBookOpen size={16} />
                  <strong style={{ fontSize: '0.95rem' }}>{g.title}</strong>
                </div>
                {g.subtitle ? <span className="badge-pill badge-neutral">{g.subtitle}</span> : null}
              </div>
              <div style={{ whiteSpace: 'pre-line', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {g.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

