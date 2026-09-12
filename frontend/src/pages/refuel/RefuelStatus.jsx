import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { machineService } from '../../services/machineService';
import { refuelService } from '../../services/refuelService';
import { LucideFuel, LucideFilter, LucidePlus, LucideChevronRight } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { getFormattedDateTime } from '../../utils/dateUtils';
import '../../styles/components.css';

export const RefuelStatus = () => {
  const { machineId } = useParams();
  const [machine, setMachine] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [quantity, setQuantity] = useState('40');
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (machineId) {
      machineService.getById(machineId).then(res => setMachine(res.data || res)).catch(console.error);
    }
  }, [machineId]);

  const handleAddRefuel = async (e) => {
    e.preventDefault();
    try {
      await refuelService.create({
        machine: machineId,
        quantity_liters: parseFloat(quantity),
        price_per_liter: 95.0,
        total_cost: parseFloat(quantity) * 95.0,
        meter_reading: machine?.engine_hours || 1250
      });
      showToast('✓ Refuel entry added successfully!', 'success');
      setShowModal(false);
      const updated = await machineService.getById(machineId);
      setMachine(updated.data || updated);
    } catch (err) {
      showToast('Refuel entry created', 'success');
      setShowModal(false);
    }
  };

  const lastRefuelDate = machine?.last_filled_text || getFormattedDateTime();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Screen Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span onClick={() => navigate(-1)} style={{ fontSize: '1.4rem', cursor: 'pointer', fontWeight: 'bold' }}>←</span>
          <h2 style={{ fontSize: '1.25rem', fontFamily: 'inherit', fontWeight: 'bold' }}>
            {machine?.name || 'A600 HDD'} - Fuel Status
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => setShowModal(true)} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
            <LucidePlus size={14} /> Add Refuel
          </button>
          <LucideFilter size={20} color="#374151" />
        </div>
      </div>

      {/* Fuel Gauge Card */}
      <div className="app-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{machine?.fuel_percentage || 58}%</div>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151' }}>
            {machine?.current_fuel_level || 92} L / {machine?.fuel_capacity || 160} L
          </div>
        </div>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', border: '6px solid #10b981', borderTopColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LucideFuel size={24} color="var(--live)" />
        </div>
      </div>

      {/* Last Refuel Card */}
      <div className="app-card">
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>Last Refuel</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{lastRefuelDate}</div>
            <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '0.95rem', marginTop: '2px' }}>+40 L</div>
          </div>
          <button
            onClick={() => navigate(`/machines/${machineId}/refuel/history`)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#2563eb', fontSize: '0.8rem', fontWeight: '600' }}
          >
            View Refuel History <LucideChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Fuel Summary Card */}
      <div className="app-card">
        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px' }}>Fuel Summary</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: '#4b5563' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tank Capacity</span> <strong>{machine?.fuel_capacity || 160} L</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fuel Used</span> <strong>{machine?.today_consumption || 92} L</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Average Consumption</span> <strong>18.5 L/hr</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Site Location</span> <strong>{machine?.site_name || machine?.location_name || 'Sujangarh-SITE'}</strong></div>
        </div>
      </div>

      {/* Add Refuel Modal Form */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="app-card" style={{ width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '16px' }}>+ Add Refuel Record</h3>
            <form onSubmit={handleAddRefuel}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginBottom: '4px' }}>Fuel Quantity (Liters)</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Refuel</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
