import React, { useEffect, useState } from 'react';
import { fuelService } from '../../services/fuelService';
import { machineService } from '../../services/machineService';
import { useAuth } from '../../hooks/useAuth';
import { LucideFuel, LucideTruck, LucideBuilding2, LucideFilter, LucideRefreshCw, LucidePlus, LucideDollarSign } from 'lucide-react';
import '../../styles/components.css';
import { SearchableSelect } from '../../components/common/Select';

export const FuelDashboard = () => {
  const { selectedVendorId } = useAuth();
  const [logs, setLogs] = useState([]);
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchMachinesList = () => {
    const params = {};
    if (selectedVendorId && selectedVendorId !== 'all') {
      params.vendor_id = selectedVendorId;
    }
    machineService.getAll(params)
      .then(res => {
        const list = res.data?.results || res.data || (Array.isArray(res) ? res : []);
        setMachines(list);
      })
      .catch(console.error);
  };

  const fetchLogs = () => {
    setLoading(true);
    const params = {};
    if (selectedVendorId && selectedVendorId !== 'all') {
      params.vendor_id = selectedVendorId;
    }
    if (selectedMachineId && selectedMachineId !== 'ALL') {
      params.machine_id = selectedMachineId;
    }

    fuelService.getAllLogs(params)
      .then(res => {
        const list = res.data?.results || res.data || (Array.isArray(res) ? res : []);
        setLogs(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMachinesList();
  }, [selectedVendorId]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => {
      fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedVendorId, selectedMachineId]);

  const totalLiters = logs.reduce((acc, l) => acc + (parseFloat(l.liters) || 0), 0);
  const totalCost = logs.reduce((acc, l) => acc + (parseFloat(l.cost) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Page Title & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontFamily: 'inherit', fontWeight: 'bold', color: '#111827' }}>
            Fuel Analytics & Machine Logs
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Machine-Wise & Vendor-Wise Fuel Tracking & Consumption History
          </p>
        </div>

        <button onClick={fetchLogs} className="app-card" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
          <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Logs
        </button>
      </div>

      {/* Filter Toolbar: Machine-Wise & Vendor-Wise */}
      <div className="app-card" style={{ padding: '14px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', background: '#f9fafb' }}>
        {/* Machine-Wise Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LucideTruck size={16} color="#0284c7" />
          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151' }}>Machine Filter:</label>
          <SearchableSelect
            value={selectedMachineId}
            onChange={(e) => setSelectedMachineId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.82rem',
              background: '#ffffff',
              color: '#111827',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">🚜 All Machines (Machine-Wise)</option>
            {machines.map(m => (
              <option key={m.id} value={m.id}>
                {m.machine_no || m.name || `Machine #${m.id}`} ({m.model_name || m.model || 'HDD'})
              </option>
            ))}
          </SearchableSelect>
        </div>

        {/* Selected Vendor Scope Indicator */}
        {selectedVendorId && selectedVendorId !== 'all' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#047857', fontWeight: '700' }}>
            <LucideBuilding2 size={14} /> Scope: Vendor ({selectedVendorId})
          </div>
        )}

        {selectedMachineId !== 'ALL' && (
          <button
            onClick={() => setSelectedMachineId('ALL')}
            style={{ padding: '6px 12px', fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}
          >
            Reset Machine Filter
          </button>
        )}
      </div>

      {/* Summary Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideFuel size={20} color="#059669" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total Fuel Logged</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#059669' }}>{totalLiters.toFixed(1)} L</div>
          </div>
        </div>

        <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideDollarSign size={20} color="#2563eb" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total Fuel Cost</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#2563eb' }}>₹{totalCost.toLocaleString()}</div>
          </div>
        </div>

        <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideTruck size={20} color="#7c3aed" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Active Machines</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#7c3aed' }}>{machines.length}</div>
          </div>
        </div>
      </div>

      {/* Fuel Logs Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Machine Number / Model</th>
              <th>Fuel Quantity (L)</th>
              <th>Cost (₹)</th>
              <th>Date & Time</th>
              <th>Remarks / Location</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ color: '#111827', fontSize: '0.9rem' }}>{l.machine_name || l.machine_no || `Machine #${l.machine}`}</strong>
                    <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>{l.machine_details?.model_name || 'HDD Machine'}</span>
                  </div>
                </td>
                <td>
                  <span style={{ fontWeight: 'bold', color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: '6px' }}>
                    +{l.liters} L
                  </span>
                </td>
                <td><strong>₹{l.cost}</strong></td>
                <td>{l.fuel_date || new Date(l.created_at).toLocaleDateString()}</td>
                <td style={{ color: '#4b5563', fontSize: '0.82rem' }}>{l.remarks || 'Regular Refueling'}</td>
              </tr>
            ))}

            {logs.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
                  {loading ? 'Loading fuel logs...' : 'No fuel logs recorded for the selected machine/vendor filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
