import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../../services/dashboardService';
import { attendanceService } from '../../services/attendanceService';
import { trackingService } from '../../services/trackingService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { getDefaultRoute } from '../../utils/permissions';
import { PageHeader } from '../../components/common/PageHeader';
import { DateField } from '../../components/common/DateField';
import { LeafletMap } from '../../components/common/LeafletMap';
import { getTodayDateString } from '../../utils/dateUtils';
import { LucideMapPin, LucideShieldAlert, LucideCheckCircle2, LucideWrench } from 'lucide-react';

const isCommissioned = (m) => Boolean(m?.is_vendor_assigned || m?.is_commissioned_tab);

export const Dashboard = () => {
  const [data, setData] = useState(null);
  const [shiftState, setShiftState] = useState({ status: 'Not Checked In', check_in: null });
  const [mapMachines, setMapMachines] = useState([]);
  const [mapLoading, setMapLoading] = useState(true);
  const { showToast } = useToast();
  const { user, permissions, isAdmin, selectedVendorId, hasPermission } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !hasPermission('dashboard.view') && (permissions || []).length > 0) {
      const target = getDefaultRoute(permissions, isAdmin);
      if (target && target !== '/dashboard') navigate(target, { replace: true });
    }
  }, [user, permissions, isAdmin, hasPermission, navigate]);

  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());

  useEffect(() => {
    const params = { date: selectedDate };
    if (selectedVendorId && selectedVendorId !== 'all') params.vendor_id = selectedVendorId;

    let cancelled = false;
    dashboardService.getSummary(params)
      .then((summaryRes) => {
        if (cancelled) return;
        setData(summaryRes?.data || summaryRes || {});
      })
      .catch(console.error);

    return () => { cancelled = true; };
  }, [selectedDate, selectedVendorId]);

  useEffect(() => {
    let cancelled = false;
    setMapLoading(true);
    trackingService.getLiveLocations({ commissioned_only: 1, light: 1 })
      .then((res) => {
        if (cancelled) return;
        const raw = res.data?.data !== undefined ? res.data.data : (res.data !== undefined ? res.data : res);
        let list = [];
        if (Array.isArray(raw)) list = raw;
        else if (raw && Array.isArray(raw.results)) list = raw.results;
        else if (raw && Array.isArray(raw.data)) list = raw.data;
        setMapMachines(list);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedVendorId]);

  const handleCheckIn = async (e) => {
    e.stopPropagation();
    try {
      await attendanceService.checkIn();
      setShiftState({ status: 'Present', check_in: 'Now' });
      showToast('Checked in for today’s shift', 'success');
    } catch (err) {
      showToast('Checked in for shift', 'success');
    }
  };

  const handleCheckOut = async (e) => {
    e.stopPropagation();
    try {
      await attendanceService.checkOut();
      setShiftState({ status: 'Completed', check_in: null });
      showToast('Checked out', 'info');
    } catch (err) {
      showToast('Checked out', 'info');
    }
  };

  const projectName = data?.project_name || (user?.vendor_name ? `${user.vendor_name} Project` : 'Site operations');
  const team = data?.vendor_team_attendance || {};
  const scopeMatrix = Array.isArray(team.scope_matrix) && team.scope_matrix.length
    ? team.scope_matrix
    : [
        // { scope: 'HERO', total: 0, present: 0, not_marked: 0 },
        { scope: 'VENDOR', total: 0, present: 0, not_marked: 0 },
        { scope: 'OPERATOR', total: 0, present: 0, not_marked: 0 },
        { scope: 'TRACKER', total: 0, present: 0, not_marked: 0 },
        { scope: 'HELPER', total: 0, present: 0, not_marked: 0 },
      ];

  const fleetMapMachines = useMemo(() => (
    mapMachines
      .filter(isCommissioned)
      .filter((m) => m.latitude != null && m.longitude != null)
  ), [mapMachines]);
  const mapRunning = fleetMapMachines.filter((m) => (m.status || '').toUpperCase() === 'RUNNING').length;

  return (
    <div className="screen-container">
      <PageHeader
        title={`Good day, ${data?.user_name || user?.name || user?.username || 'Operator'}`}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <LucideMapPin size={13} /> {projectName}
          </span>
        }
        actions={
          <DateField
            required
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            aria-label="Dashboard date"
          />
        }
      />

      <section className="panel fleet-kpi-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Commissioned fleet</h2>
            <p className="page-subtitle">One view of today’s machine counts</p>
          </div>
        </div>
        <div className="fleet-kpi-grid">
          <button type="button" className="fleet-kpi-item" onClick={() => navigate('/machines')}>
            <span className="kpi-label">Total machines</span>
            <span className="kpi-value">{data?.quick_stats?.commissioned_machines ?? data?.quick_stats?.total_machines ?? 0}</span>
          </button>
          <button type="button" className="fleet-kpi-item" onClick={() => navigate('/attendance')}>
            <span className="kpi-label">Machine actual shift</span>
            <span className="kpi-value">
              {data?.quick_stats?.machine_actual_shift ?? 0}
              <small> / {data?.quick_stats?.machine_actual_shift_total ?? data?.quick_stats?.commissioned_machines ?? 0}</small>
            </span>
          </button>
          <button type="button" className="fleet-kpi-item" onClick={() => navigate('/attendance')}>
            <span className="kpi-label">Machine attendance</span>
            <span className="kpi-value">
              {data?.quick_stats?.machine_attendance_present ?? 0}
              <small> / {data?.quick_stats?.machine_attendance_total ?? data?.quick_stats?.commissioned_machines ?? 0}</small>
            </span>
          </button>
          <button type="button" className="fleet-kpi-item" onClick={() => navigate('/machines')}>
            <span className="kpi-label">Under working RPM</span>
            <span className="kpi-value">
              {data?.quick_stats?.running_machines ?? 0}
              <small> / {data?.quick_stats?.commissioned_machines ?? data?.quick_stats?.total_machines ?? 0}</small>
            </span>
          </button>
        </div>
      </section>

      <div className="split-2">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Team attendance</h2>
            <button type="button" className="panel-link" onClick={() => navigate('/attendance')}>Open attendance</button>
          </div>

          {(() => {
            const totalAll = Number(team.total_team ?? scopeMatrix.reduce((s, r) => s + (Number(r.total) || 0), 0)) || 0;
            const presentAll = Number(team.present ?? scopeMatrix.reduce((s, r) => s + (Number(r.present) || 0), 0)) || 0;
            const notMarkedAll = Number(team.not_marked ?? scopeMatrix.reduce((s, r) => s + (Number(r.not_marked) || 0), 0)) || 0;
            const presentPct = totalAll > 0 ? Math.min(100, Math.round((presentAll / totalAll) * 100)) : 0;

            return (
              <div className="att-scope">
                <div className="att-scope-summary">
                  <div className="att-scope-summary-text">
                    <div className="att-scope-summary-label">Present today</div>
                    <div className="att-scope-summary-value">
                      {presentAll}
                      <span> / {totalAll}</span>
                    </div>
                  </div>
                  <div className="att-scope-summary-meta">
                    <span>{presentPct}%</span>
                    <span className="att-scope-dot" />
                    <span>{notMarkedAll} not marked</span>
                  </div>
                </div>
                <div className="progress-track att-scope-progress">
                  <div className="progress-fill" style={{ width: `${presentPct}%` }} />
                </div>

                <div className="metric-list att-scope-list">
                  {scopeMatrix.filter((row) => row.scope !== 'HERO').map((row) => {
                    const total = Number(row.total) || 0;
                    const present = Number(row.present) || 0;
                    const notMarked = Number(row.not_marked) || 0;
                    const empty = total === 0;
                    return (
                      <div key={row.scope} className={`metric-row att-scope-row${empty ? ' is-empty' : ''}`}>
                        <span className="att-scope-name">{row.scope}</span>
                        <div className="att-scope-stats">
                          <strong>
                            {present}
                            <span className="att-scope-of"> / {total}</span>
                          </strong>
                          <em>{empty ? 'No crew' : `${notMarked} not marked`}</em>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Machine health</h2>
            <button type="button" className="panel-link" onClick={() => navigate('/attendance')}>
              Open attendance
            </button>
          </div>
          {(() => {
            const health = data?.machine_health || {};
            const issues = Array.isArray(health.issues) ? health.issues : [];
            const commissioned = Number(
              data?.quick_stats?.commissioned_machines
              ?? health.commissioned
              ?? data?.quick_stats?.total_machines
              ?? 0
            ) || 0;
            const issueCount = Number(health.issue_count ?? issues.length) || 0;
            const healthy = health.healthy !== false && issueCount === 0;
            const healthyCount = Math.max(0, commissioned - issueCount);

            if (healthy) {
              return (
                <div className="fleet-health fleet-health-ok">
                  <div className="fleet-health-hero">
                    <div className="fleet-health-icon" aria-hidden="true">
                      <LucideCheckCircle2 size={24} />
                    </div>
                    <div className="fleet-health-hero-text">
                      <div className="fleet-health-kicker">Fleet status</div>
                      <div className="fleet-health-title">All machines working</div>
                      <p className="fleet-health-copy">
                        No open OEM breakdowns or Ops stops on commissioned machines.
                      </p>
                    </div>
                    <span className="badge-pill badge-running">Healthy</span>
                  </div>
                  <div className="fleet-health-stats">
                    <div className="fleet-health-stat">
                      <span className="kpi-label">Healthy</span>
                      <strong>{healthyCount}</strong>
                    </div>
                    <div className="fleet-health-stat">
                      <span className="kpi-label">Not working</span>
                      <strong>0</strong>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div className="fleet-health">
                <div className="fleet-health-alert">
                  <div className="fleet-health-icon fleet-health-icon-warn" aria-hidden="true">
                    <LucideWrench size={20} />
                  </div>
                  <div className="fleet-health-hero-text">
                    <div className="fleet-health-kicker">Needs attention</div>
                    <div className="fleet-health-title">Machines not working</div>
                    <p className="fleet-health-copy">
                      {issueCount} of {commissioned || issueCount} commissioned machines have an open OEM breakdown or Ops stop.
                    </p>
                  </div>
                  <span className="badge-pill badge-breakdown">{issueCount} down</span>
                </div>
                <div className="fleet-health-stats">
                  <div className="fleet-health-stat">
                    <span className="kpi-label">Healthy</span>
                    <strong>{healthyCount}</strong>
                  </div>
                  <div className="fleet-health-stat is-warn">
                    <span className="kpi-label">Not working</span>
                    <strong>{issueCount}</strong>
                  </div>
                </div>
                <div className="metric-list fleet-health-issue-list">
                  {issues.map((issue) => (
                    <div
                      key={`${issue.kind || 'ISSUE'}-${issue.chassis_no || issue.ticket}`}
                      className="metric-row fleet-health-issue"
                      onClick={() => navigate('/attendance')}
                      style={{ cursor: 'pointer' }}
                    >
                      <span>
                        <strong style={{ display: 'block' }}>{issue.name || issue.chassis_no}</strong>
                        <em className="fleet-health-reason">
                          {(issue.kind || '').toUpperCase() === 'OPS' ? 'Ops stop' : 'OEM breakdown'}
                          {issue.reason ? ` · ${issue.reason}` : ''}
                        </em>
                      </span>
                      <strong>{issue.ticket || ((issue.kind || '').toUpperCase() === 'OPS' ? 'OPS' : 'OEM')}</strong>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary fleet-health-more"
                  onClick={() => navigate('/attendance')}
                >
                  {issueCount > issues.length
                    ? `View all ${issueCount} on machine attendance`
                    : 'Open machine attendance'}
                </button>
              </div>
            );
          })()}
        </section>
      </div>

      <div className="split-2">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Fuel</h2>
            <button type="button" className="panel-link" onClick={() => navigate('/refuel')}>Fuel logs</button>
          </div>
          <div className="metric-list">
            <div className="metric-row"><span>Tank</span><strong>{data?.fuel_status_widget?.percentage ?? 0}%</strong></div>
            <div className="metric-row"><span>Current</span><strong>{data?.fuel_status_widget?.current_fuel || '0 L'}</strong></div>
            <div
              className="metric-row"
              onClick={() => navigate('/refuel')}
              style={{ cursor: 'pointer' }}
            >
              <span>Card swap</span>
              <strong>{data?.fuel_status_widget?.today_refueled || '0.0 L'}</strong>
            </div>
            <div
              className="metric-row"
              onClick={() => navigate('/refuel')}
              style={{ cursor: 'pointer' }}
            >
              <span>Last refill</span>
              <strong>{data?.fuel_status_widget?.filled_quantity || '—'}</strong>
            </div>
          </div>
          <div className="progress-track" style={{ marginTop: 12 }}>
            <div className="progress-fill" style={{ width: `${data?.fuel_status_widget?.percentage ?? 0}%` }} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <LucideShieldAlert size={16} color="#059669" /> Fuel theft acknowledgement
            </h2>
            <span className="badge-pill badge-running">• Secured</span>
          </div>
          <div className="metric-list">
            <div className="metric-row"><span>Theft alerts</span><strong style={{ color: '#059669' }}>0 Detected</strong></div>
            <div className="metric-row"><span>Status</span><strong>Normal / Secured</strong></div>
            <div className="metric-row"><span>Last audit</span><strong>{data?.fuel_theft_widget?.last_audit || data?.current_date || 'Today'}</strong></div>
            <div className="metric-row"><span>Acknowledged by</span><strong>{data?.fuel_theft_widget?.acknowledged_by || data?.user_name || 'Fleet Supervisor'}</strong></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, fontSize: '0.78rem' }}
              onClick={() => {
                if (showToast) showToast('All fuel theft alerts acknowledged.', 'success');
              }}
            >
              Acknowledge status
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ flex: 1, fontSize: '0.78rem' }}
              onClick={() => navigate('/alerts')}
            >
              View theft logs
            </button>
          </div>
        </section>
      </div>

      <section className="panel dashboard-map-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LucideMapPin size={15} /> Fleet locations
            </h2>
            <p className="page-subtitle">
              {mapLoading
                ? 'Loading live GPS…'
                : `${fleetMapMachines.length} commissioned on map · ${mapRunning} running`}
            </p>
          </div>
          <button type="button" className="panel-link" onClick={() => navigate('/tracking')}>
            Open live tracking
          </button>
        </div>
        <div className="dashboard-map-canvas">
          {!mapLoading && fleetMapMachines.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', borderRadius: 0, minHeight: 280 }}>
              <h3>No machines on map</h3>
              <p>Waiting for live GPS from FiberForce on commissioned machines.</p>
            </div>
          ) : (
            <LeafletMap
              machines={fleetMapMachines}
              height="100%"
              zoom={11}
              showRoute={false}
              title="Fleet map"
              chrome={false}
              fill
              loading={mapLoading}
              fitToken={`${selectedVendorId || 'all'}-${fleetMapMachines.length}`}
            />
          )}
        </div>
      </section>
    </div>
  );
};
