import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LucideChevronRight, LucideMapPin, LucideClock, LucideUser, LucideCreditCard, LucideShieldCheck } from 'lucide-react';

export const MachineCard = ({ machine }) => {
  const navigate = useNavigate();

  if (!machine) return null;

  const chassisNo = machine.machine_chassis_no || machine.serial_number || 'N/A';
  const modelName = machine.model_name || `APOLLO ${machine.model_code || 'A600'} V2`;
  const modelCode = machine.model_code || 'A600';
  const siteName = machine.site_name || machine.location_name || 'Sujangarh-SITE';
  const isCommissioned = machine.is_commissioned !== undefined ? machine.is_commissioned : false;
  const operatorName = machine.operator?.name || (machine.operator ? 'Mapped' : 'No Operator');
  const fuelCard = machine.fuel_card;

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'RUNNING') return <span className="badge-pill badge-running">• Running</span>;
    if (s === 'IDLE') return <span className="badge-pill badge-idle">• Idle</span>;
    if (s === 'MAINTENANCE') return <span className="badge-pill badge-maintenance">• Maintenance</span>;
    if (s === 'BREAKDOWN') return <span className="badge-pill badge-breakdown" style={{ background: '#fef2f2', color: '#dc2626' }}>• Breakdown</span>;
    return <span className="badge-pill badge-offline">• {status || 'Idle'}</span>;
  };

  const isOnline = machine.is_online !== undefined ? machine.is_online : true;
  const fuelPercent = machine.fuel_percentage !== undefined && machine.fuel_percentage !== null ? machine.fuel_percentage : 0;
  const fuelLitres = machine.current_fuel_level !== undefined && machine.current_fuel_level !== null ? Number(machine.current_fuel_level) : 0;
  const fuelCapacity = machine.fuel_capacity ? Number(machine.fuel_capacity) : (modelCode === 'A800' ? 160 : 100);
  const runtime = machine.runtime_str || '00h 00m';

  return (
    <div
      className="ui-card machine-card-item"
      onClick={() => navigate(`/machines/${machine.id}`)}
      style={{
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Top Header: Model & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="badge-pill badge-neutral">{modelCode}</span>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', marginTop: '4px' }}>
            {modelName}
          </h3>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', fontFamily: 'monospace' }}>
            Chassis: {chassisNo}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {getStatusBadge(machine.status)}
          <span className={`badge-pill ${isOnline ? 'badge-online' : 'badge-offline'}`}>
            • {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Attributes Badges: Commissioned & Operator */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
        <span style={{
          fontSize: '0.7rem',
          padding: '2px 8px',
          borderRadius: '6px',
          background: isCommissioned ? '#e6f4ea' : '#f3f4f6',
          color: isCommissioned ? '#137333' : '#4b5563',
          fontWeight: '600',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <LucideShieldCheck size={12} />
          {isCommissioned ? 'Commissioned' : 'Uncommissioned'}
        </span>

        <span style={{
          fontSize: '0.7rem',
          padding: '2px 8px',
          borderRadius: '6px',
          background: '#f0f9ff',
          color: '#0369a1',
          fontWeight: '600',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <LucideUser size={12} />
          {operatorName}
        </span>

        {fuelCard && (
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '6px',
            background: '#fffbeeb',
            color: '#b45309',
            fontWeight: '600',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <LucideCreditCard size={12} />
            {fuelCard.name} ({fuelCard.card_number.slice(-4)})
          </span>
        )}
      </div>

      {/* Location */}
      <div style={{ fontSize: '0.78rem', color: '#4b5563', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <LucideMapPin size={14} color="#2563eb" />
        <span>{siteName}</span>
      </div>

      {/* Runtime & Fuel Progress */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>Runtime</div>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1f2937', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <LucideClock size={13} color="#6b7280" />
            {runtime}
          </div>
        </div>

        <div style={{ width: '52%', maxWidth: '200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '3px' }}>
            <span style={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              Fuel ({fuelLitres.toFixed(0)} L / {fuelCapacity} L)
            </span>
            <strong style={{ color: '#111827' }}>{fuelPercent}%</strong>
          </div>
          <div className="fuel-bar-track">
            <div
              className="fuel-bar-fill"
              style={{
                width: `${Math.min(100, Math.max(0, fuelPercent))}%`,
                background: fuelPercent < 20 ? '#ef4444' : fuelPercent < 40 ? '#f59e0b' : '#10b981'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
