import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { machineService } from '../../services/machineService';
import { LeafletMap } from '../../components/common/LeafletMap';
import { LucideRadio, LucideNavigation, LucideClock, LucideGauge, LucideMapPin, LucideShieldCheck, LucideUser, LucideFuel } from 'lucide-react';
import '../../styles/components.css';

export const MachineTracking = () => {
  const { machineId, id } = useParams();
  const targetId = machineId || id;
  const [machine, setMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    if (targetId) {
      machineService.getById(targetId)
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
  }, [targetId]);

  const isOnline = machine?.is_online !== undefined ? machine?.is_online : true;
  const status = (machine?.status || 'RUNNING').toUpperCase();
  const speed = status === 'RUNNING' ? '18.5 km/h' : '0.0 km/h';
  const siteName = machine?.site_name || machine?.location_name || 'Sujangarh-SITE, HR';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Screen Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => navigate(-1)} style={{ fontSize: '1.4rem', cursor: 'pointer', fontWeight: 'bold', border: 'none', background: 'none' }}>←</button>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontFamily: 'Outfit, sans-serif', fontWeight: 'bold', color: '#111827' }}>
              {machine?.name || 'A600 HDD'} — GPS Route Tracking
            </h1>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', fontFamily: 'monospace' }}>
              Chassis: {machine?.machine_chassis_no || machine?.serial_number || '600202608396'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', background: '#0a2d23', color: '#6ee7b7', padding: '4px 10px', borderRadius: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <LucideRadio size={14} color="#10b981" /> ● LIVE GPS
          </span>
        </div>
      </div>

      {/* Live Map Canvas Component */}
      <div style={{ width: '100%' }}>
        <LeafletMap
          singleMachine={machine}
          height="450px"
          zoom={13}
          showRoute={false}
        />
      </div>

      {/* Telemetry Indicator Strip */}
      <div className="app-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' }}>Current Speed</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#10b981', marginTop: '2px' }}>{speed}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' }}>Heading</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1f2937', marginTop: '2px' }}>NE (45°)</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' }}>Distance Today</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1f2937', marginTop: '2px' }}>24.6 km</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' }}>Moving Time</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1f2937', marginTop: '2px' }}>2h 35m</div>
        </div>
      </div>

      {/* Machine & Operator Details Card */}
      <div className="app-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>Machine Telemetry Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.82rem' }}>
          <div>
            <span style={{ color: '#6b7280' }}>Site Location:</span> <strong>{siteName}</strong>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Operator:</span> <strong>{machine?.operator?.name || 'Swarnim Mittal'}</strong>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Fuel Capacity:</span> <strong>{machine?.fuel_capacity || 500} L</strong>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Fuel Level:</span> <strong style={{ color: '#10b981' }}>{machine?.fuel_percentage || 58}% ({machine?.current_fuel_level || 290} L)</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
