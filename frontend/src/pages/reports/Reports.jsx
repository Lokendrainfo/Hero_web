import React, { useEffect, useMemo, useState } from 'react';
import { dashboardService } from '../../services/dashboardService';
import { reportService } from '../../services/reportService';
import { machineService } from '../../services/machineService';
import { useAuth } from '../../hooks/useAuth';
import { PageHeader } from '../../components/common/PageHeader';
import { BarChart } from '../../components/common/BarChart';
import { LucideDownload } from 'lucide-react';

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map((cell) => {
    const value = cell == null ? '' : String(cell);
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const unwrapList = (res) => {
  const payload = res?.data || res;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
};

export const Reports = () => {
  const { selectedVendorId } = useAuth();
  const [summary, setSummary] = useState(null);
  const [machines, setMachines] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (selectedVendorId && selectedVendorId !== 'all') params.vendor_id = selectedVendorId;

    Promise.all([
      dashboardService.getSummary({ ...params, date: new Date().toISOString().split('T')[0] }).catch(() => null),
      machineService.getAll({ page_size: 200, ...params }).catch(() => null),
      reportService.getFuelReport(params).catch(() => null)
    ]).then(([dashRes, machineRes, fuelRes]) => {
      setSummary(dashRes?.data || dashRes);
      setMachines(unwrapList(machineRes));
      setFuelLogs(unwrapList(fuelRes));
    }).finally(() => setLoading(false));
  }, [selectedVendorId]);

  const statusCounts = useMemo(() => {
    const counts = { Running: 0, Idle: 0, Maintenance: 0, Breakdown: 0, Offline: 0 };
    machines.forEach((m) => {
      const status = (m.status || 'OFFLINE').toUpperCase();
      if (status === 'RUNNING') counts.Running += 1;
      else if (status === 'IDLE') counts.Idle += 1;
      else if (status === 'MAINTENANCE') counts.Maintenance += 1;
      else if (status === 'BREAKDOWN') counts.Breakdown += 1;
      else counts.Offline += 1;
    });
    return counts;
  }, [machines]);

  const fuelByMachine = useMemo(() => {
    const map = {};
    fuelLogs.forEach((log) => {
      const name = log.machine_name || log.machine?.name || log.machine_id || 'Machine';
      map[name] = (map[name] || 0) + Number(log.quantity || log.filled_quantity || log.litres || 0);
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [fuelLogs]);

  const team = summary?.vendor_team_attendance || {};
  const stats = summary?.quick_stats || {};

  const exportMachines = () => {
    downloadCsv('hero-machine-report.csv', [
      ['Name', 'Chassis', 'Status', 'Vendor', 'Fuel %'],
      ...machines.map((m) => [
        m.name || '',
        m.machine_chassis_no || m.chassis_no || m.serial_number || '',
        m.status || '',
        m.vendor_name || '',
        m.fuel_percentage || m.fuel_level || ''
      ])
    ]);
  };

  const exportFuel = () => {
    downloadCsv('hero-fuel-report.csv', [
      ['Machine', 'Quantity', 'Date'],
      ...fuelLogs.map((log) => [
        log.machine_name || log.machine?.name || log.machine_id || '',
        log.quantity || log.filled_quantity || log.litres || '',
        log.created_at || log.date || log.filled_at || ''
      ])
    ]);
  };

  return (
    <div className="screen-container">
      <PageHeader
        title="Reports"
        subtitle="Fleet status, attendance, and fuel consumption"
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={exportMachines}>
              <LucideDownload size={14} /> Machines CSV
            </button>
            <button type="button" className="btn-secondary" onClick={exportFuel}>
              <LucideDownload size={14} /> Fuel CSV
            </button>
          </>
        }
      />

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-label">Machines</div>
          <div className="kpi-value">{stats.total_machines ?? machines.length}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Running</div>
          <div className="kpi-value">{stats.running_machines ?? statusCounts.Running}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Open alerts</div>
          <div className="kpi-value">{stats.alerts_count ?? 0}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Team present</div>
          <div className="kpi-value">{team.present ?? 0}<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}> / {team.total_team ?? 0}</span></div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <h3>Loading reports</h3>
          <p>Building charts from live operations data.</p>
        </div>
      ) : (
        <div className="split-2">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Machine status</h2>
              <span className="page-subtitle">{machines.length} units</span>
            </div>
            <BarChart
              items={[
                { label: 'Running', value: statusCounts.Running },
                { label: 'Idle', value: statusCounts.Idle },
                { label: 'Maintenance', value: statusCounts.Maintenance },
                { label: 'Breakdown', value: statusCounts.Breakdown },
                { label: 'Offline', value: statusCounts.Offline }
              ]}
            />
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Attendance</h2>
              <span className="page-subtitle">Today</span>
            </div>
            <BarChart
              items={[
                { label: 'Present', value: team.present ?? 0 },
                { label: 'Absent', value: team.absent ?? 0 },
                { label: 'Half day', value: team.half_day ?? 0 },
                { label: 'Leave', value: team.leave ?? 0 },
                { label: 'Not marked', value: team.not_marked ?? 0 }
              ]}
            />
          </section>
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Fuel consumption</h2>
          <span className="page-subtitle">{fuelLogs.length} log{fuelLogs.length === 1 ? '' : 's'}</span>
        </div>
        <BarChart items={fuelByMachine} />
      </section>
    </div>
  );
};
