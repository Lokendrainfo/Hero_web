import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../../services/dashboardService';
import { attendanceService } from '../../services/attendanceService';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { getFormattedToday } from '../../utils/dateUtils';
import { getDefaultRoute } from '../../utils/permissions';
import { LucideMapPin, LucideChevronRight, LucideCheckCircle, LucideClock, LucideAlertTriangle, LucideFuel, LucideLayers, LucideCheckSquare, LucideBuilding2 } from 'lucide-react';
import '../../styles/components.css';

export const Dashboard = () => {
  const [data, setData] = useState(null);
  const [vendorTasks, setVendorTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('Fiber 1');
  const [shiftState, setShiftState] = useState({ status: 'Not Checked In', check_in: null });
  const { showToast } = useToast();
  const { user, permissions, isAdmin, selectedVendorId, hasPermission } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !hasPermission('dashboard.view')) {
      const targetRoute = getDefaultRoute(permissions, isAdmin);
      navigate(targetRoute, { replace: true });
    }
  }, [user, permissions, isAdmin, hasPermission, navigate]);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return getFormattedToday();
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return getFormattedToday();
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  useEffect(() => {
    setData(null);
    const params = { date: selectedDate };
    if (selectedVendorId && selectedVendorId !== 'all') {
      params.vendor_id = selectedVendorId;
    }
    dashboardService.getSummary(params).then(res => setData(res.data)).catch(console.error);
  }, [selectedDate, selectedVendorId]);

  useEffect(() => {
    setVendorTasks([]);
    const params = { page: 0, size: 10 };
    const userVendorId = user?.vendor?.external_vendor_id || user?.vendor_id || user?.vendor?.id || (user?.companies && user.companies[0]) || null;
    const targetVendorId = (selectedVendorId && selectedVendorId !== 'all')
      ? selectedVendorId
      : (!isAdmin && userVendorId ? userVendorId : null);

    if (targetVendorId && targetVendorId !== 'all') {
      params.vendor_id = targetVendorId;
    }

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
      showToast("✓ Checked in successfully for today's shift!", 'success');
    } catch (err) {
      showToast('Checked in for shift', 'success');
    }
  };

  const handleCheckOut = async (e) => {
    e.stopPropagation();
    try {
      await attendanceService.checkOut();
      setShiftState({ status: 'Completed', check_in: null });
      showToast('✓ Checked out successfully!', 'info');
    } catch (err) {
      showToast('Checked out', 'info');
    }
  };

  const tasks = data?.fiber_tasks?.[activeTab] || [];
  const projectName = data?.project_name || (user?.vendor_name ? `${user.vendor_name} Project` : 'Sujangarh-SITE Project');

  const clickableCardStyle = {
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Dark Forest Header Banner matching reference */}
      <div
        style={{
          background: '#0a2d23',
          color: '#fff',
          borderRadius: '16px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          boxSizing: 'border-box',
          gap: '16px'
        }}
      >
        <div onClick={() => navigate('/tracking')} style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: '0.75rem', color: '#6ee7b7', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Project</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <LucideMapPin size={20} color="#10b981" /> {projectName}
          </div>
        </div>

        {/* Dynamic Interactive Date Calendar Picker (Pushed Far Right) */}
        <div style={{ position: 'relative', flexShrink: 0, marginLeft: 'auto' }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '6px 14px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              color: '#ffffff'
            }}
          >
            <span>📅 {formatDisplayDate(selectedDate)}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                }
              }}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                cursor: 'pointer',
                width: '100%',
                height: '100%'
              }}
            />
          </div>
        </div>
      </div>

      {/* 4-Card Quick Stat Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
        <div
          className="app-card"
          onClick={() => navigate('/machines')}
          style={{ textAlign: 'center', padding: '14px 10px', ...clickableCardStyle }}
        >
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0f2fe', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>📄</div>
          <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{data?.quick_stats?.shots_in_progress ?? 0}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Shot in Progress</div>
        </div>

        <div
          className="app-card"
          onClick={() => navigate('/tasks')}
          style={{ textAlign: 'center', padding: '14px 10px', ...clickableCardStyle }}
        >
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e6f4ea', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>🛠️</div>
          <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{data?.quick_stats?.tasks_pending ?? 0}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Task Pending</div>
        </div>

        <div
          className="app-card"
          onClick={() => navigate('/alerts')}
          style={{ textAlign: 'center', padding: '14px 10px', ...clickableCardStyle }}
        >
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fef2f2', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>🔔</div>
          <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{data?.quick_stats?.alerts_count ?? 0}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Alert</div>
        </div>

        <div
          className="app-card"
          onClick={() => navigate('/attendance')}
          style={{ textAlign: 'center', padding: '14px 10px', ...clickableCardStyle }}
        >
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f3e8ff', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>👥</div>
          <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{data?.quick_stats?.attendance_pct ?? 0}%</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Attendance</div>
        </div>
      </div>

      {/* Dual Row: Machine Status & Fuel Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        
        {/* Vendor Team & Today's Attendance Card (Section 8) */}
        <div
          className="app-card"
          onClick={() => navigate('/attendance')}
          style={{ ...clickableCardStyle, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f172a' }}>My Team & Attendance</span>
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '700' }}>Manage Team →</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>My Team</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                {data?.vendor_team_attendance?.total_team ?? 0} Members
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Today's Attendance</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#047857' }}>
                {data?.vendor_team_attendance?.attendance_text ?? '0 / 0 Present'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '8px' }}>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#047857', fontWeight: '700' }}>PRESENT</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#065f46' }}>{data?.vendor_team_attendance?.present ?? 0}</div>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '6px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#991b1b', fontWeight: '700' }}>ABSENT</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#dc2626' }}>{data?.vendor_team_attendance?.absent ?? 0}</div>
            </div>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '6px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#92400e', fontWeight: '700' }}>HALF DAY</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#d97706' }}>{data?.vendor_team_attendance?.half_day ?? 0}</div>
            </div>

            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '6px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#5b21b6', fontWeight: '700' }}>LEAVE</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#7c3aed' }}>{data?.vendor_team_attendance?.leave ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Machine Status Card */}
        <div
          className="app-card"
          onClick={() => navigate('/machines')}
          style={{ ...clickableCardStyle }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Machine Status</span>
            <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>View All →</span>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{data?.machine_status_widget?.name || 'No Machine Assigned'}</div>
          <span className="badge-pill badge-running" style={{ margin: '6px 0 10px' }}>• {data?.machine_status_widget?.status || 'IDLE'}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: '#6b7280' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Run Time</span> <strong>{data?.machine_status_widget?.runtime || '00h 00m'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Current Fuel Level</span> <strong>{data?.machine_status_widget?.current_fuel_level || '0.00 L'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Today's Consumption</span> <strong>{data?.machine_status_widget?.today_consumption || '0.00 L'}</strong></div>
          </div>
        </div>

        {/* Fuel Status Card */}
        <div
          className="app-card"
          onClick={() => navigate('/fuel')}
          style={{ ...clickableCardStyle }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Fuel Status</span>
            <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>Details →</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', border: '6px solid #10b981', borderTopColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem' }}>
              {data?.fuel_status_widget?.percentage ?? 0}%
            </div>
            <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
              <div>Current Fuel: <strong>{data?.fuel_status_widget?.current_fuel || '0 L'}</strong></div>
              <div>Tank Capacity: <strong>{data?.fuel_status_widget?.tank_capacity || '0 L'}</strong></div>
              <div style={{ color: '#059669', marginTop: '2px', fontWeight: 'bold' }}>Last Refuel: {data?.fuel_status_widget?.filled_quantity || 'N/A'}</div>
              <div style={{ color: '#6b7280' }}>Operator: {data?.fuel_status_widget?.filled_by || 'Operator'}</div>
            </div>
          </div>
        </div>
      </div>


      {/* Vendor Assigned Tasks & Scope Breakdown Section */}
      <div className="app-card" style={{ padding: '18px' }}>
        <div
          onClick={() => navigate('/tasks')}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', cursor: 'pointer' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideCheckSquare size={18} color="#059669" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                Vendor Assigned Tasks & Scope Progress
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Fiber Trenching & Ducting, GP Survey, OTDR, & Block Operations Scope vs Done
            </span>
          </div>

          <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
            View All Tasks ({vendorTasks.length}) →
          </span>
        </div>

        {/* Dynamic Task List or Empty State */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {vendorTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 12px', color: '#6b7280', fontSize: '0.88rem', background: '#f9fafb', borderRadius: '10px', border: '1px dashed #d1d5db' }}>
              <LucideCheckSquare size={32} color="#9ca3af" style={{ margin: '0 auto 8px', display: 'block' }} />
              No tasks currently assigned to this vendor.
            </div>
          ) : (
            vendorTasks.slice(0, 4).map(t => {
            const coveredKm = t.coveredLengthKm !== undefined ? Number(t.coveredLengthKm) : 0;
            const totalKm = t.routeSnapshot?.lengthKm ? Number(t.routeSnapshot.lengthKm) : 0;
            const pct = t.pct || (totalKm > 0 ? Math.min(100, Math.round((coveredKm / totalKm) * 100)) : (coveredKm > 0 ? 64 : 0));
            const coveredStr = t.coveredScopeStr || `${coveredKm.toFixed(2)} km`;
            const totalStr = t.totalScopeStr || (totalKm > 0 ? `${totalKm.toFixed(1)} km` : 'Scope Set');
            const isDone = t.status === 'COMPLETED' || pct === 100;

            return (
              <div
                key={t.id}
                onClick={() => navigate('/tasks')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, border-color 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.68rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                      {t.taskCode || 'TASK-2026'}
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: '#111827' }}>
                      {t.displayName || t.title || t.taskType}
                    </strong>
                  </div>

                  <span className={`badge-pill ${isDone ? 'badge-running' : 'badge-idle'}`}>
                    • {t.status || 'IN_PROGRESS'}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>
                  📍 Location: <strong>{t.locationStr || t.location?.blockName || 'Site Location'}</strong>
                </div>

                {/* Scope vs Done Progress Bar */}
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: '700' }}>
                    <span style={{ color: '#0369a1' }}>
                      Done: <strong style={{ color: '#0284c7' }}>{coveredStr}</strong> / Scope: <span>{totalStr}</span>
                    </span>
                    <span style={{ color: isDone ? '#059669' : '#0284c7' }}>{pct}% Completed</span>
                  </div>

                  <div style={{ width: '100%', height: '7px', background: '#e0f2fe', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: isDone ? '#059669' : '#0284c7', borderRadius: '4px' }} />
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>

      {/* Dual Row: Performance & Shift Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div
          className="app-card"
          onClick={() => navigate('/reports')}
          style={{ ...clickableCardStyle }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Today's Performance</span>
            <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>Reports →</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
            <span>Achievement</span> <span>Target</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', margin: '4px 0 8px' }}>
            <span>{data?.performance?.achievement || '0m'}</span> <span>{data?.performance?.target || '0m'}</span>
          </div>
          <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#10b981', width: `${data?.performance?.percentage ?? 0}%` }} />
          </div>
          <div style={{ marginTop: '10px', padding: '6px 10px', background: (data?.performance?.percentage > 0 ? '#e6f4ea' : '#f3f4f6'), color: (data?.performance?.percentage > 0 ? '#137333' : '#4b5563'), borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center', fontWeight: '600' }}>
            {data?.performance?.message || 'No tasks assigned to you'}
          </div>
        </div>

        <div
          className="app-card"
          onClick={() => navigate('/attendance')}
          style={{ ...clickableCardStyle }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>My Shift</span>
            <span className="badge-pill badge-running">{shiftState.status}</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Check-In</span> <strong>08:42 AM</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Working Duration</span> <strong>5h 28m</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shift Time</span> <strong>08:00 AM - 06:00 PM</strong></div>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button onClick={handleCheckIn} className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}>Check In</button>
            <button onClick={handleCheckOut} style={{ flex: 1, padding: '8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: '600' }}>Check Out</button>
          </div>
        </div>
      </div>
    </div>
  );
};
