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
  const siteName = machine?.site_name || machine?.location_name || '';

  return (
    <div className="map-fill-page">
      <div className="page-toolbar" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.05rem' }}>{machine?.name || 'Machine'}</h1>
          <p className="page-subtitle">Chassis {machine?.machine_chassis_no || machine?.serial_number || '—'}</p>
        </div>
        <span className="badge-pill badge-running"><LucideRadio size={12} /> Live GPS</span>
        <span className="page-subtitle">Speed {speed} · {siteName} · {status}</span>
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
      </div>
      <div className="map-fill-canvas">
        <LeafletMap
          singleMachine={machine}
          height="100%"
          zoom={13}
          showRoute={false}
          chrome={false}
          fill
        />
      </div>
    </div>
  );
};
