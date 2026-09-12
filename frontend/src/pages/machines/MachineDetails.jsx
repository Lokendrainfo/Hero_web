import React, { useEffect, useState } from 'react';
import { machineService } from '../../services/machineService';
import { useParams, useNavigate } from 'react-router-dom';
import { LeafletMap } from '../../components/common/LeafletMap';
import { LucideMapPin, LucideAlertCircle, LucideWrench, LucideWifiOff, LucideFuel, LucideNavigation } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import '../../styles/screens.css';

export const MachineDetails = () => {
  const { id } = useParams();
  const [machine, setMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    if (id) {
      machineService.getById(id)
        .then(res => setMachine(res.data || res))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      machineService.getAll()
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
          setMachine(list[0]);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
        Loading machine details...
      </div>
    );
  }

  const isOnline = machine?.is_online !== undefined ? machine?.is_online : true;
  const status = (machine?.status || 'RUNNING').toUpperCase();
  const runtime = machine?.runtime_str || `${machine?.runtime_hours || 8}h ${machine?.runtime_minutes || 32}m`;
  const fuelPercent = machine?.fuel_percentage || machine?.fuel_level || 58;
  const location = machine?.site_name || machine?.location_name || 'Sujangarh-SITE, HR';

  return (
    <div className="screen-container">
      <PageHeader
        title={machine?.name || 'Machine'}
        subtitle={`${machine?.model_name || 'HDD'} · Chassis ${machine?.machine_chassis_no || machine?.serial_number || '—'}`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => navigate('/machines')}>Back</button>
            <button type="button" className="btn-primary" onClick={() => navigate(`/machines/${machine?.id || id}/tracking`)}>
              <LucideNavigation size={15} /> Live tracking
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate(`/machines/${machine?.id || id}/refuel`)}>
              <LucideFuel size={15} /> Fuel logs
            </button>
          </>
        }
      />

      {/* Main Machine Banner Card */}
      <div className="app-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '6px',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          flexShrink: 0
        }}>
          🚜
        </div>

        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span className={`badge-pill ${status === 'RUNNING' ? 'badge-running' : status === 'IDLE' ? 'badge-idle' : 'badge-maintenance'}`}>
              • {status.charAt(0) + status.slice(1).toLowerCase()}
            </span>
            <span className={`badge-pill ${isOnline ? 'badge-online' : 'badge-offline'}`}>
              • {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <div style={{ fontSize: '0.85rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
            <LucideMapPin size={15} color="#2563eb" />
            {location}
          </div>

          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>
            Operator: {machine?.operator?.name || 'Swarnim Mittal'} • Vendor: {machine?.vendor_name || 'Apex Equipment Services'}
          </div>
        </div>
      </div>

      {/* Metrics & Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {/* Overview Metrics Card */}
        <div className="app-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>Overview Metrics</span>
            <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>Live</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', textAlign: 'center' }}>
            <div style={{ background: '#f9fafb', padding: '10px', borderRadius: '10px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>{runtime}</div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Runtime Today</div>
            </div>
            <div style={{ background: '#f9fafb', padding: '10px', borderRadius: '10px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>{machine?.engine_hours !== undefined && machine?.engine_hours !== null ? machine.engine_hours : 0}h</div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Engine Hours</div>
            </div>
            <div style={{ background: '#f9fafb', padding: '10px', borderRadius: '10px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>{machine?.today_consumption !== undefined && machine?.today_consumption !== null ? machine.today_consumption : 0} L</div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Fuel Used Today</div>
            </div>
            <div style={{ background: '#f9fafb', padding: '10px', borderRadius: '10px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--live)' }}>{fuelPercent}%</div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Fuel Level</div>
            </div>
          </div>
        </div>

        {/* Live Location Widget with Embedded Leaflet Map */}
        <div className="app-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>Live GPS Location</span>
            <span
              onClick={() => navigate(`/machines/${machine?.id || id}/tracking`)}
              style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600', cursor: 'pointer' }}
            >
              Full Route →
            </span>
          </div>
          <LeafletMap singleMachine={machine} height="175px" zoom={12} />
        </div>

        {/* Fuel Status Ring Widget */}
        <div className="app-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>Fuel Status</span>
            <span
              onClick={() => navigate(`/machines/${machine?.id || id}/refuel/history`)}
              style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600', cursor: 'pointer' }}
            >
              Refuel History →
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#111827' }}>{fuelPercent}%</div>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginTop: '2px' }}>
                {machine?.current_fuel_level !== undefined && machine?.current_fuel_level !== null ? machine.current_fuel_level : 0} L / {machine?.fuel_capacity || (machine?.model_code === 'A800' ? 160 : 100)} L
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '4px' }}>
                Last refuel: {machine?.last_filled_text || '24 Aug • 40 L'}
              </div>
            </div>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              border: '6px solid var(--live)',
              borderTopColor: fuelPercent < 40 ? 'var(--warning)' : 'var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <LucideFuel size={22} color="var(--live)" />
            </div>
          </div>
        </div>
      </div>

      {/* Active Alerts Section */}
      <div className="app-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>Active Machine Alerts</span>
          <span onClick={() => navigate('/alerts')} style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600', cursor: 'pointer' }}>
            View Alert Center →
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', borderRadius: '10px', background: '#fef2f2' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LucideAlertCircle size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#991b1b' }}>Low Fuel Warning</div>
              <div style={{ fontSize: '0.72rem', color: '#7f1d1d' }}>Fuel level reached 20%. Please schedule refuel.</div>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: '600' }}>18m ago</span>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', borderRadius: '10px', background: '#fffbeeb' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LucideWrench size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#92400e' }}>PM Maintenance Due Soon</div>
              <div style={{ fontSize: '0.72rem', color: '#78350f' }}>Scheduled 500-hour service inspection due in 25 engine hours.</div>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: '600' }}>2h ago</span>
          </div>
        </div>
      </div>
    </div>
  );
};
