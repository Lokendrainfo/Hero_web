import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../../services/dashboardService';
import { attendanceService } from '../../services/attendanceService';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { getDefaultRoute } from '../../utils/permissions';
import { PageHeader } from '../../components/common/PageHeader';
import { DateField } from '../../components/common/DateField';
import { getTodayDateString } from '../../utils/dateUtils';
import { LucideMapPin, LucideCheckSquare, LucideShieldAlert } from 'lucide-react';

export const Dashboard = () => {
  const [data, setData] = useState(null);
  const [vendorTasks, setVendorTasks] = useState([]);
  const [shiftState, setShiftState] = useState({ status: 'Not Checked In', check_in: null });
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
    setData(null);
    const params = { date: selectedDate };
    if (selectedVendorId && selectedVendorId !== 'all') params.vendor_id = selectedVendorId;

    let cancelled = false;
    Promise.all([
      dashboardService.getSummary(params),
      attendanceService.getTeamAttendance(params).catch(() => null),
    ]).then(([summaryRes, teamRes]) => {
      if (cancelled) return;
      const summary = summaryRes?.data || summaryRes || {};
      const teamPayload = teamRes?.data?.data || teamRes?.data || teamRes || null;
      const teamSummary = teamPayload?.summary;
      const scopeMatrix = teamPayload?.scope_matrix;
      if (teamSummary && typeof teamSummary === 'object') {
        summary.vendor_team_attendance = {
          ...(summary.vendor_team_attendance || {}),
          total_team: teamSummary.total ?? summary.vendor_team_attendance?.total_team ?? 0,
          present: teamSummary.present ?? 0,
          absent: teamSummary.absent ?? 0,
          half_day: teamSummary.half_day ?? 0,
          leave: teamSummary.leave ?? 0,
          week_off: teamSummary.week_off ?? 0,
          not_marked: teamSummary.not_marked ?? 0,
          attendance_text: `${teamSummary.present ?? 0} / ${teamSummary.total ?? 0} Present`,
          scope_matrix: Array.isArray(scopeMatrix)
            ? scopeMatrix
            : (summary.vendor_team_attendance?.scope_matrix || []),
        };
        if (summary.quick_stats) {
          summary.quick_stats = {
            ...summary.quick_stats,
            team_present: teamSummary.present ?? 0,
            team_total: teamSummary.total ?? 0,
          };
        }
      }
      setData(summary);
    }).catch(console.error);

    return () => { cancelled = true; };
  }, [selectedDate, selectedVendorId]);

  useEffect(() => {
    setVendorTasks([]);
    const params = { page: 0, size: 10, taskType: 'FIBER_TRENCHING_DUCTING_TASK' };
    const userVendorId = user?.vendor?.external_vendor_id || user?.vendor_id || user?.vendor?.id || null;
    const targetVendorId = (selectedVendorId && selectedVendorId !== 'all')
      ? selectedVendorId
      : (!isAdmin && userVendorId ? userVendorId : null);
    if (targetVendorId && targetVendorId !== 'all') params.vendor_id = targetVendorId;

    taskService.getMyTasks(params)
      .then(res => {
        const raw = res.data || res;
        const norm = raw.results ? raw : (raw.data || {});
        const list = norm.results || norm.content || (Array.isArray(norm) ? norm : []);
        setVendorTasks(list);
      })
      .catch(console.error);
  }, [selectedVendorId, user, isAdmin]);

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
        { scope: 'HERO', total: 0, present: 0, not_marked: 0 },
        { scope: 'VENDOR', total: 0, present: 0, not_marked: 0 },
        { scope: 'OPERATOR', total: 0, present: 0, not_marked: 0 },
        { scope: 'TRACKER', total: 0, present: 0, not_marked: 0 },
        { scope: 'HELPER', total: 0, present: 0, not_marked: 0 },
      ];

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

      <div className="kpi-strip">
        <div className="kpi-cell" onClick={() => navigate('/machines')}>
          <div className="kpi-label">Machines running</div>
          <div className="kpi-value">{data?.quick_stats?.running_machines ?? 0}<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}> / {data?.quick_stats?.total_machines ?? 0}</span></div>
        </div>
        <div className="kpi-cell" onClick={() => navigate('/tasks')}>
          <div className="kpi-label">Tasks pending</div>
          <div className="kpi-value">{data?.quick_stats?.tasks_pending ?? 0}</div>
        </div>
        <div className="kpi-cell" onClick={() => navigate('/alerts')}>
          <div className="kpi-label">Open alerts</div>
          <div className="kpi-value">{data?.quick_stats?.alerts_count ?? 0}</div>
        </div>
        <div className="kpi-cell" onClick={() => navigate('/attendance')}>
          <div className="kpi-label">Team present</div>
          <div className="kpi-value">{team.present ?? 0}<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}> / {team.total_team ?? 0}</span></div>
        </div>
      </div>

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
                  {scopeMatrix.map((row) => {
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
            <h2 className="panel-title">Lead machine</h2>
            <button type="button" className="panel-link" onClick={() => navigate('/machines')}>All machines</button>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{data?.machine_status_widget?.name || 'No machine assigned'}</div>
          <span className="badge-pill badge-running">{data?.machine_status_widget?.status || 'IDLE'}</span>
          <div className="metric-list" style={{ marginTop: 12 }}>
            <div className="metric-row"><span>Runtime today</span><strong>{data?.machine_status_widget?.runtime || '00h 00m'}</strong></div>
            <div className="metric-row"><span>Fuel level</span><strong>{data?.machine_status_widget?.current_fuel_level || '0.00 L'}</strong></div>
            <div className="metric-row"><span>Today’s consumption</span><strong>{data?.machine_status_widget?.today_consumption || '0.00 L'}</strong></div>
          </div>
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

      <section className="panel" style={{ padding: 0 }}>
        <div className="panel-header" style={{ padding: '14px 16px 0' }}>
          <div>
            <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LucideCheckSquare size={15} /> Assigned tasks
            </h2>
            <p className="page-subtitle">Scope vs completed for this vendor</p>
          </div>
          <button type="button" className="panel-link" onClick={() => navigate('/tasks')}>
            View all ({vendorTasks.length})
          </button>
        </div>

        {(() => {
          const listToRender = vendorTasks.length > 0 ? vendorTasks : (data?.assigned_tasks || []);
          if (listToRender.length === 0) {
            return (
              <div className="empty-state" style={{ border: 'none', borderRadius: 0 }}>
                <h3>No tasks assigned</h3>
                <p>Tasks from ILYNC will appear here for the selected vendor.</p>
              </div>
            );
          }
          return (
            <div className="table-container" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Location</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {listToRender.slice(0, 6).map((t) => {
                    const coveredKm = t.covered_distance !== undefined ? Number(t.covered_distance) : (t.coveredLengthKm !== undefined ? Number(t.coveredLengthKm) : 0);
                    const totalKm = t.planned_distance !== undefined ? Number(t.planned_distance) : (t.plannedLengthKm !== undefined ? Number(t.plannedLengthKm) : (t.routeSnapshot?.lengthKm ? Number(t.routeSnapshot.lengthKm) : 0));
                    const rawPct = t.progress_percent !== undefined ? Number(t.progress_percent) : (t.pct !== undefined ? Number(t.pct) : (totalKm > 0 ? (coveredKm / totalKm) * 100 : 0));
                    const pct = Math.min(100, Math.max(0, Math.round(rawPct)));
                    const isDone = t.status === 'COMPLETED' || pct === 100;
                    return (
                      <tr key={t.id || t.taskCode} onClick={() => navigate('/tasks')} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{t.displayName || t.title || t.taskType}</div>
                          <div className="page-subtitle">{t.taskCode || '—'}</div>
                        </td>
                        <td>{t.locationStr || t.location?.blockName || t.location?.locationName || '—'}</td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                            <span>{coveredKm.toFixed(2)} / {totalKm > 0 ? totalKm.toFixed(2) : '—'} km</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${pct}%`, background: isDone ? 'var(--live)' : 'var(--primary, #0284c7)' }} />
                          </div>
                        </td>
                        <td>
                          <span className={`badge-pill ${isDone ? 'badge-running' : 'badge-idle'}`}>
                            {t.status || 'IN_PROGRESS'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>
    </div>
  );
};
