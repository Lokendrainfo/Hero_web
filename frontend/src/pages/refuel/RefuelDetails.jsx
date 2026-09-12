import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { refuelService } from '../../services/refuelService';
import { LucideFileText } from 'lucide-react';
import { getFormattedDateTime } from '../../utils/dateUtils';
import '../../styles/components.css';

export const RefuelDetails = () => {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      refuelService.getById(id).then(res => setDetail(res.data || res)).catch(console.error);
    }
  }, [id]);

  const recordDate = detail?.refuel_date || getFormattedDateTime();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span onClick={() => navigate(-1)} style={{ fontSize: '1.4rem', cursor: 'pointer', fontWeight: 'bold' }}>←</span>
        <h2 style={{ fontSize: '1.25rem', fontFamily: 'inherit', fontWeight: 'bold' }}>Refuel Details</h2>
      </div>

      {/* Main Refuel Badge Card */}
      <div className="app-card" style={{ background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px' }}>
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{recordDate}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginTop: '4px', color: 'var(--live)' }}>
            +{detail?.quantity_liters || 40} L
          </div>
        </div>
        <LucideFileText size={36} color="var(--live)" />
      </div>

      {/* Information Table Card */}
      <div className="app-card">
        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '14px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
          Refuel Information
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Refueled By</span>
            <strong>{detail?.performed_by_name || 'Rahul Kumar'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Fuel Added</span>
            <strong style={{ color: '#059669' }}>{detail?.quantity_liters || 40} L</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Fuel Type</span>
            <strong>Diesel</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Engine Hours</span>
            <strong>{detail?.meter_reading || 1250}h</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Site Location</span>
            <strong>{detail?.site_name || 'Sujangarh-SITE'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
