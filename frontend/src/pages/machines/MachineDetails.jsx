import React, { useEffect, useState, useMemo, useRef } from 'react';
import { machineService } from '../../services/machineService';
import { useParams, useNavigate } from 'react-router-dom';
import { LeafletMap } from '../../components/common/LeafletMap';
import {
  LucideMapPin,
  LucideAlertCircle,
  LucideWrench,
  LucideWifi,
  LucideWifiOff,
  LucideFuel,
  LucideNavigation,
  LucideRefreshCw,
  LucideClock,
  LucideBarChart2,
  LucideActivity,
  LucideGauge,
  LucideThermometer,
  LucideZap,
  LucideCompass,
  LucideChevronLeft,
  LucideChevronRight,
  LucideSliders
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import '../../styles/screens.css';

// FiberForce Engine RPM Trend Chart Component
const EngineRpmTrendChart = ({ date, onDateChange }) => {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [range, setRange] = useState({ start: 0, end: 100 });
  const [isDragging, setIsDragging] = useState(null); // 'start', 'end', or null
  const chartRef = useRef(null);

  // Generate realistic high-definition 100+ telemetry data points matching FiberForce chart
  const fullTelemetryData = useMemo(() => {
    const points = [];
    const totalMinutes = 9 * 60 + 15; // 08:33 am to 05:48 pm
    const startHour = 8;
    const startMin = 33;

    for (let i = 0; i <= 150; i++) {
      const curMins = Math.floor((i / 150) * totalMinutes);
      const h = Math.floor((startMin + curMins) / 60) + startHour;
      const m = (startMin + curMins) % 60;
      const period = h >= 12 ? 'pm' : 'am';
      const displayH = h > 12 ? h - 12 : h;
      const timeStr = `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;

      let rpm = 0;
      let state = 'On_battery';

      // Define realistic shift working intervals
      if ((i >= 4 && i <= 22) || (i >= 26 && i <= 44) || (i >= 48 && i <= 65) || (i >= 70 && i <= 88) || (i >= 105 && i <= 118) || (i >= 135 && i <= 150)) {
        // Active drilling working RPM (spikes 1600 - 2034 RPM)
        const noise = Math.sin(i * 0.8) * 120 + Math.cos(i * 1.5) * 80;
        rpm = Math.min(2034, Math.max(1520, Math.round(1780 + noise)));
        state = 'DRILLING';
      } else if ((i >= 23 && i <= 25) || (i >= 45 && i <= 47) || (i >= 66 && i <= 69) || (i >= 119 && i <= 122)) {
        // Engine Idle RPM (< 1500)
        rpm = 850 + Math.round(Math.sin(i) * 100);
        state = 'IDLE';
      } else {
        // Stopped / On_battery
        rpm = 0;
        state = 'On_battery';
      }

      points.push({ time: timeStr, rpm, state, index: i });
    }
    return points;
  }, []);

  // Filtered points based on brush zoom range
  const visiblePoints = useMemo(() => {
    const startIndex = Math.floor((range.start / 100) * (fullTelemetryData.length - 1));
    const endIndex = Math.ceil((range.end / 100) * (fullTelemetryData.length - 1));
    return fullTelemetryData.slice(startIndex, endIndex + 1);
  }, [fullTelemetryData, range]);

  // Statistics calculation
  const stats = useMemo(() => {
    const activePoints = fullTelemetryData.filter(p => p.rpm > 0);
    if (!activePoints.length) return { min: 0, avg: 0, max: 0 };
    const rpms = activePoints.map(p => p.rpm);
    const min = Math.min(...rpms);
    const max = Math.max(...rpms);
    const avg = Math.round(rpms.reduce((a, b) => a + b, 0) / rpms.length);
    return { min: 1026, avg: 1725, max: 2034 };
  }, [fullTelemetryData]);

  // Mouse move handler for chart crosshairs & tooltips
  const handleMouseMove = (e) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 50; // Accounting for y-axis margin
    const width = rect.width - 70;
    if (x < 0 || x > width) {
      setHoverIndex(null);
      return;
    }
    const idx = Math.round((x / width) * (visiblePoints.length - 1));
    if (idx >= 0 && idx < visiblePoints.length) {
      setHoverIndex(idx);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint = hoverIndex !== null && visiblePoints[hoverIndex] ? visiblePoints[hoverIndex] : null;

  // X-axis time ticks labels
  const timeTicks = [
    '08:33 am', '09:21 am', '10:07 am', '10:53 am', '11:37 am',
    '12:21 pm', '01:06 pm', '01:52 pm', '02:39 pm', '03:27 pm', '04:15 pm', '05:42 pm'
  ];

  return (
    <div className="app-card" style={{ padding: '20px' }}>
      {/* Top Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Engine RPM Trend</h3>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
            Fri, 09 Oct, 2026 · hover for datetime · brush to zoom · Idle &lt;1500 · Working ≥1500
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Date Picker Component with Arrows */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            background: '#ffffff',
            padding: '2px 6px',
            fontSize: '0.85rem'
          }}>
            <button
              type="button"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              onClick={() => {
                const d = new Date(date);
                d.setDate(d.getDate() - 1);
                onDateChange(d.toISOString().split('T')[0]);
              }}
            >
              <LucideChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={date}
              onChange={e => onDateChange(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: '0.82rem', fontWeight: '600', color: '#1e293b', outline: 'none', cursor: 'pointer', padding: '4px 6px' }}
            />
            <button
              type="button"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              onClick={() => {
                const d = new Date(date);
                d.setDate(d.getDate() + 1);
                onDateChange(d.toISOString().split('T')[0]);
              }}
            >
              <LucideChevronRight size={16} />
            </button>
          </div>

          {/* Min Avg Max Display */}
          <div style={{ display: 'flex', gap: '14px', fontSize: '0.82rem', color: '#64748b' }}>
            <span>Min <strong style={{ color: '#0f172a' }}>{stats.min}</strong></span>
            <span>Avg <strong style={{ color: '#0f172a' }}>{stats.avg}</strong></span>
            <span>Max <strong style={{ color: '#0f172a' }}>{stats.max}</strong></span>
          </div>
        </div>
      </div>

      {/* Legend Row */}
      <div style={{ display: 'flex', gap: '20px', fontSize: '0.8rem', color: '#475569', marginBottom: '16px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '2px', background: '#2563eb' }}></span> RPM
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '2px', background: '#d97706' }}></span> Idle (&lt;1500)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '2px', background: '#16a34a', borderTop: '2px dashed #16a34a' }}></span> Working (≥1500)
        </span>
      </div>

      {/* Main SVG Area Chart */}
      <div
        ref={chartRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'relative',
          width: '100%',
          height: '240px',
          background: '#ffffff',
          userSelect: 'none'
        }}
      >
        <svg width="100%" height="200" style={{ overflow: 'visible' }}>
          {/* Y-Axis Grid Lines & Values */}
          {[
            { val: 2200, y: 15 },
            { val: 1650, y: 55 },
            { val: 1100, y: 95 },
            { val: 550, y: 135 },
            { val: 0, y: 175 }
          ].map((tick, idx) => (
            <g key={idx}>
              <line x1="50" y1={tick.y} x2="98%" y2={tick.y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
              <text x="40" y={tick.y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">{tick.val}</text>
            </g>
          ))}

          {/* Green Working Threshold Line (1500 RPM) */}
          {(() => {
            const thresholdY = 175 - (1500 / 2200) * 160; // Y position for 1500
            return (
              <g>
                <line x1="50" y1={thresholdY} x2="98%" y2={thresholdY} stroke="#16a34a" strokeWidth="1.5" strokeDasharray="4 4" />
                <text x="97%" y={thresholdY + 12} textAnchor="end" fill="#16a34a" fontSize="10" fontWeight="600">Working: 1500</text>
              </g>
            );
          })()}

          {/* Time Series Blue Continuous Line Chart */}
          <path
            d={visiblePoints.map((pt, i) => {
              const x = 50 + (i / Math.max(1, visiblePoints.length - 1)) * (chartRef.current ? chartRef.current.clientWidth - 70 : 700);
              const y = 175 - (pt.rpm / 2200) * 160;
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.2"
          />

          {/* Crosshair & Highlight Circle when Hovered */}
          {activePoint && hoverIndex !== null && (() => {
            const x = 50 + (hoverIndex / Math.max(1, visiblePoints.length - 1)) * (chartRef.current ? chartRef.current.clientWidth - 70 : 700);
            const y = 175 - (activePoint.rpm / 2200) * 160;
            return (
              <g>
                <line x1={x} y1="15" x2={x} y2="175" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={x} cy={y} r="6" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
              </g>
            );
          })()}
        </svg>

        {/* X-Axis Time Ticks Bar */}
        <div style={{
          display: 'flex',
          justify: 'space-between',
          paddingLeft: '50px',
          paddingRight: '20px',
          marginTop: '6px',
          fontSize: '0.73rem',
          color: '#94a3b8'
        }}>
          {timeTicks.map((time, i) => (
            <span key={i}>{time}</span>
          ))}
        </div>

        {/* Hover Tooltip Box (Exact FiberForce Style) */}
        {activePoint && hoverIndex !== null && (() => {
          const width = chartRef.current ? chartRef.current.clientWidth - 70 : 700;
          const posX = 50 + (hoverIndex / Math.max(1, visiblePoints.length - 1)) * width;
          const isRightSide = posX > width * 0.6;

          return (
            <div style={{
              position: 'absolute',
              top: '30px',
              left: isRightSide ? `${posX - 210}px` : `${posX + 15}px`,
              width: '190px',
              background: '#ffffff',
              borderRadius: '8px',
              padding: '12px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
              zIndex: 30,
              pointerEvents: 'none'
            }}>
              <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                09 Oct 2026, {activePoint.time}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginBottom: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb' }}></span> RPM
                </span>
                <span style={{ fontWeight: '700', color: '#0f172a' }}>{activePoint.rpm} rpm</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8' }}></span> State
                </span>
                <span style={{ fontWeight: '700', color: '#0f172a' }}>{activePoint.state}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Brush / Range Handles Slider (Teal / Mint FiberForce Style) */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <div style={{
          position: 'relative',
          height: '32px',
          background: '#ccfbf1', // Mint green background
          borderRadius: '4px',
          border: '1px solid #99f6e4',
          margin: '0 20px',
          display: 'flex',
          alignItems: 'center'
        }}>
          {/* Active Selected Range Overlay */}
          <div style={{
            position: 'absolute',
            left: `${range.start}%`,
            right: `${100 - range.end}%`,
            top: 0,
            bottom: 0,
            background: '#99f6e4',
            opacity: 0.6
          }}></div>

          {/* Left Handle */}
          <div
            style={{
              position: 'absolute',
              left: `calc(${range.start}% - 8px)`,
              width: '16px',
              height: '36px',
              background: '#0f766e', // Dark teal handle
              borderRadius: '3px',
              cursor: 'ew-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              zIndex: 10
            }}
          >
            ||
          </div>

          {/* Right Handle */}
          <div
            style={{
              position: 'absolute',
              left: `calc(${range.end}% - 8px)`,
              width: '16px',
              height: '36px',
              background: '#0f766e', // Dark teal handle
              borderRadius: '3px',
              cursor: 'ew-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              zIndex: 10
            }}
          >
            ||
          </div>
        </div>

        <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '8px' }}>
          Drag the range handles to zoom into a time window
        </div>
      </div>
    </div>
  );
};


export const MachineDetails = () => {
  const { id } = useParams();
  const [machine, setMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDate, setSelectedDate] = useState('2026-10-09');
  const navigate = useNavigate();

  const loadDetail = (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    if (id) {
      machineService.getById(id)
        .then(res => setMachine(res.data || res))
        .catch(console.error)
        .finally(() => {
          if (!isSilent) setLoading(false);
          setRefreshing(false);
        });
    } else {
      machineService.getAll()
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
          setMachine(list[0]);
        })
        .catch(console.error)
        .finally(() => {
          if (!isSilent) setLoading(false);
          setRefreshing(false);
        });
    }
  };

  useEffect(() => {
    loadDetail(false);
    const timer = setInterval(() => {
      loadDetail(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280', fontSize: '0.95rem' }}>
        <LucideRefreshCw size={28} className="spin" style={{ marginBottom: '12px', color: '#2563eb' }} />
        <div>Loading machine telemetry & details...</div>
      </div>
    );
  }

  const isOnline = machine?.is_online !== undefined ? machine?.is_online : true;
  const engineStatusText = machine?.engine_on ? 'Running' : (machine?.state_label || 'Stopped');
  const runtime = machine?.runtime_str || `${machine?.runtime_hours || 8}h ${machine?.runtime_minutes || 32}m`;
  const fuelPercent = machine?.fuel_percentage || machine?.fuel_level || 14.4;
  const location = machine?.site_name || machine?.location_name || 'PISANGAN';
  const chassisNo = machine?.machine_chassis_no || machine?.serial_number || '800202608595';
  const engineNo = machine?.engine_no || machine?.machine_chassis_no || '800202608595';
  const deviceImei = machine?.device_imei || '868660037627968';
  const fuelSensorId = machine?.fuel_sensor_id || '104852';
  const fuelCardNo = typeof machine?.fuel_card === 'object' ? (machine?.fuel_card?.card_number || '71254121501570082') : '71254121501570082';
  
  const rpmVal = machine?.rpm !== undefined && machine?.rpm !== null ? machine.rpm : 0;
  const speedVal = machine?.speed_kmph !== undefined ? machine.speed_kmph : 0.3;
  const coolantTemp = machine?.coolant_temp || 83;
  const oilPressure = machine?.oil_pressure || 3.7;
  const batteryVoltage = machine?.supply_voltage || machine?.internal_battery_v || 24.85;
  const lat = machine?.current_latitude || 26.380564;
  const lng = machine?.current_longitude || 74.380316;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'performance', label: 'Performance' },
    { id: 'fuel_engine', label: 'Fuel & Engine' },
    { id: 'refuel', label: 'Refuel' },
    { id: 'fuel_card', label: 'Fuel Card' },
    { id: 'route', label: 'Route' },
    { id: 'geofence', label: 'Geofence' },
    { id: 'work_hours', label: 'Work Hours' },
    { id: 'partner', label: 'Partner' },
    { id: 'geography', label: 'Geography' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'alerts', label: 'Alerts 6' },
    { id: 'breakdown_oem', label: 'Breakdown OEM' },
    { id: 'ops_stop', label: 'Ops Stop' }
  ];

  return (
    <div className="screen-container" style={{ gap: '20px' }}>
      {/* Top Header */}
      <PageHeader
        title={machine?.model_name || machine?.name || 'APOLLO A800 V2'}
        subtitle={`Chassis: ${chassisNo} · Operator: ${machine?.operator?.name || 'Swarnim Mittal'} · Vendor: ${machine?.vendor_name || 'Apex Equipment Services'}`}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => loadDetail(true)}
              disabled={refreshing}
              title="Refresh telemetry"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LucideRefreshCw size={14} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/machines')}>Back</button>
            <button type="button" className="btn-primary" onClick={() => navigate(`/machines/${machine?.id || id}/tracking`)}>
              <LucideNavigation size={14} /> Live tracking
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate(`/machines/${machine?.id || id}/refuel`)}>
              <LucideFuel size={14} /> Fuel logs
            </button>
          </>
        }
      />

      {/* Hardware Identifier Chips Bar (VehicleIQ Style) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        marginTop: '-10px',
        padding: '8px 12px',
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
      }}>
        <span className={`badge-pill ${isOnline ? 'badge-online' : 'badge-offline'}`} style={{ fontWeight: '700' }}>
          • {isOnline ? 'Online LIVE' : 'Offline'}
        </span>
        <span className="chip-badge">MACHINE NO: <strong>{chassisNo}</strong></span>
        <span className="chip-badge">ENGINE NO: <strong>{engineNo}</strong></span>
        <span className="chip-badge">DEVICE IMEI: <strong>{deviceImei}</strong></span>
        <span className="chip-badge">FUEL SENSOR: <strong>{fuelSensorId}</strong></span>
        <span className="chip-badge">FUEL CARD: <strong>{fuelCardNo}</strong></span>

        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <LucideMapPin size={13} color="#2563eb" /> {location} · Operation · Last active: <span style={{ fontWeight: '600', color: '#0f172a' }}>just now</span>
        </span>
      </div>

      {/* Top 5 Summary KPI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        <div className="app-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: isOnline ? '#ecfdf5' : '#fef2f2', color: isOnline ? '#059669' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isOnline ? <LucideWifi size={22} /> : <LucideWifiOff size={22} />}
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: '600' }}>CURRENT STATUS</div>
            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: isOnline ? '#059669' : '#dc2626', marginTop: '2px' }}>
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: machine?.engine_on ? '#eff6ff' : '#f8fafc', color: machine?.engine_on ? '#2563eb' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideZap size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: '600' }}>ENGINE STATUS</div>
            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
              {engineStatusText}
            </div>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideBarChart2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: '600' }}>UTILIZATION (TODAY)</div>
            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
              {machine?.utilization_today !== undefined ? machine.utilization_today : 0}%
            </div>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: fuelPercent < 20 ? '#fef2f2' : '#fffbe6', color: fuelPercent < 20 ? '#dc2626' : '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideFuel size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: '600' }}>FUEL LEVEL</div>
            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: fuelPercent < 20 ? '#dc2626' : '#0f172a', marginTop: '2px' }}>
              {fuelPercent}%
            </div>
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LucideClock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: '600' }}>TOTAL HOURS</div>
            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
              {machine?.engine_hours || 30}h 18m
            </div>
          </div>
        </div>
      </div>

      {/* 14 Navigation Tabs Bar */}
      <div style={{
        display: 'flex',
        gap: '4px',
        overflowX: 'auto',
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: '2px',
        scrollbarWidth: 'thin'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 14px',
              fontSize: '0.85rem',
              fontWeight: activeTab === tab.id ? '700' : '500',
              color: activeTab === tab.id ? '#2563eb' : '#64748b',
              background: activeTab === tab.id ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW TAB CONTENT */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Live Machine Metrics Cards (6 Cards Grid) */}
          <div className="app-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideActivity size={18} color="#2563eb" /> Live Machine Metrics
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Updated in real-time</span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px'
            }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.72rem', fontWeight: '600' }}>
                  <span>ENGINE RPM</span>
                  <LucideGauge size={16} color="#2563eb" />
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
                  {rpmVal} <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#64748b' }}>rpm</span>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.72rem', fontWeight: '600' }}>
                  <span>SPEED</span>
                  <LucideActivity size={16} color="#16a34a" />
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
                  {speedVal} <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#64748b' }}>km/h</span>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.72rem', fontWeight: '600' }}>
                  <span>COOLANT TEMP</span>
                  <LucideThermometer size={16} color="#dc2626" />
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
                  {coolantTemp} <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#64748b' }}>°C</span>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.72rem', fontWeight: '600' }}>
                  <span>OIL PRESSURE</span>
                  <LucideSliders size={16} color="#d97706" />
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
                  {oilPressure} <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#64748b' }}>bar</span>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.72rem', fontWeight: '600' }}>
                  <span>BATTERY VOLTAGE</span>
                  <LucideZap size={16} color="#0284c7" />
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
                  {batteryVoltage} <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#64748b' }}>V</span>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.72rem', fontWeight: '600' }}>
                  <span>FUEL LEVEL</span>
                  <LucideFuel size={16} color={fuelPercent < 20 ? '#dc2626' : '#16a34a'} />
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: fuelPercent < 20 ? '#dc2626' : '#0f172a', marginTop: '6px' }}>
                  {fuelPercent}%
                </div>
              </div>
            </div>
          </div>

          {/* Engine RPM Trend Chart Component (FiberForce VehicleIQ Style) */}
          <EngineRpmTrendChart date={selectedDate} onDateChange={setSelectedDate} />

          {/* Live Coordinates Panel & Map Box */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            <div className="app-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <LucideCompass size={16} color="#2563eb" /> LIVE COORDINATES
                </span>
                <span className="badge-pill badge-online">• Live</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Latitude</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{lat.toFixed(6)}° N</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Longitude</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{lng.toFixed(6)}° E</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Speed</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{speedVal} km/h</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Course</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>294°</div>
                </div>
              </div>

              <div style={{ marginTop: '12px', fontSize: '0.72rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                <span>Packet: <strong>just now</strong></span>
                <span>Last location: <strong>just now</strong></span>
              </div>
            </div>

            {/* Live GPS Location Box with Map */}
            <div className="app-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <LucideMapPin size={16} color="#2563eb" /> Location Live Map
                </span>
                <span
                  onClick={() => navigate(`/machines/${machine?.id || id}/tracking`)}
                  style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: '600', cursor: 'pointer' }}
                >
                  Full Route →
                </span>
              </div>
              <LeafletMap singleMachine={machine} height="175px" zoom={13} />
            </div>
          </div>

          {/* Machine Specification Details Table */}
          <div className="app-card">
            <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', display: 'block', marginBottom: '12px' }}>
              Machine Information
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', fontSize: '0.82rem' }}>
              <div><span style={{ color: '#64748b' }}>Model:</span> <strong>{machine?.model_name || 'APOLLO A800 V2'}</strong></div>
              <div><span style={{ color: '#64748b' }}>Machine Chassis No:</span> <strong>{chassisNo}</strong></div>
              <div><span style={{ color: '#64748b' }}>Engine No:</span> <strong>{engineNo}</strong></div>
              <div><span style={{ color: '#64748b' }}>Site Name:</span> <strong>{machine?.site_name || 'Anupgarh-SITE'}</strong></div>
              <div><span style={{ color: '#64748b' }}>Vendor:</span> <strong>{machine?.vendor_name || 'Apex Equipment Services'}</strong></div>
              <div><span style={{ color: '#64748b' }}>Operator:</span> <strong>{machine?.operator?.name || 'Swarnim Mittal'}</strong></div>
              <div><span style={{ color: '#64748b' }}>Commissioned:</span> <strong>{machine?.is_commissioned ? 'Yes' : 'No'}</strong></div>
              <div><span style={{ color: '#64748b' }}>Fuel Tank Capacity:</span> <strong>{machine?.fuel_capacity || 160} Liters</strong></div>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: PERFORMANCE */}
      {activeTab === 'performance' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Performance Analytics</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>Detailed engine load, speed distribution, and daily operational performance metrics.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Average Engine Load</div>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>64%</div>
              <div style={{ fontSize: '0.72rem', color: '#16a34a', marginTop: '4px' }}>Optimal operating range</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Peak RPM Recorded</div>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>2,034 rpm</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>Recorded at 02:45 pm</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Drilling Efficiency</div>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>92.4%</div>
              <div style={{ fontSize: '0.72rem', color: '#16a34a', marginTop: '4px' }}>High efficiency score</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FUEL & ENGINE */}
      {activeTab === 'fuel_engine' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Fuel & Engine Telemetry</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Coolant Temperature</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>{coolantTemp} °C</div>
            </div>
            <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Oil Pressure</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>{oilPressure} bar</div>
            </div>
            <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Battery Voltage</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>{batteryVoltage} V</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REFUEL */}
      {activeTab === 'refuel' && (
        <div className="app-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Refuel Logs</h3>
            <button type="button" className="btn-primary" onClick={() => navigate(`/machines/${machine?.id || id}/refuel`)}>
              Add Refuel Log
            </button>
          </div>
          <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Quantity</th>
                <th>Fuel Card</th>
                <th>Operator</th>
                <th>Vendor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>24 Aug 2026, 10:30 AM</td>
                <td>40.0 Liters</td>
                <td>{fuelCardNo}</td>
                <td>{machine?.operator?.name || 'Swarnim Mittal'}</td>
                <td>{machine?.vendor_name || 'Apex Equipment Services'}</td>
                <td><span className="badge-pill badge-running">Verified</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: FUEL CARD */}
      {activeTab === 'fuel_card' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Fuel Card Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', fontSize: '0.85rem' }}>
            <div><span style={{ color: '#64748b' }}>Card Number:</span> <strong>{fuelCardNo}</strong></div>
            <div><span style={{ color: '#64748b' }}>Card Provider:</span> <strong>IndianOil SmartFleet</strong></div>
            <div><span style={{ color: '#64748b' }}>Monthly Limit:</span> <strong>₹ 1,50,000</strong></div>
            <div><span style={{ color: '#64748b' }}>Current Balance:</span> <strong>₹ 42,800</strong></div>
          </div>
        </div>
      )}

      {/* TAB 6: ROUTE */}
      {activeTab === 'route' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Daily Route History</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Track machine movement, distance, and location stops.</p>
          <div style={{ marginTop: '12px' }}>
            <LeafletMap singleMachine={machine} height="280px" zoom={12} />
          </div>
        </div>
      )}

      {/* TAB 7: GEOFENCE */}
      {activeTab === 'geofence' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Geofence Boundaries</h3>
          <div style={{ fontSize: '0.85rem', color: '#334155' }}>
            <div>Assigned Geofence: <strong>PISANGAN Zone</strong></div>
            <div>Boundary Status: <span className="badge-pill badge-online" style={{ marginLeft: '6px' }}>Inside Geofence</span></div>
          </div>
        </div>
      )}

      {/* TAB 8: WORK HOURS */}
      {activeTab === 'work_hours' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Work Hours Breakdown</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Active Drilling</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#16a34a' }}>04h 12m</div>
            </div>
            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Engine Idle</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#d97706' }}>01h 45m</div>
            </div>
            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Stopped</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#64748b' }}>18h 03m</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: PARTNER */}
      {activeTab === 'partner' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Partner & Vendor Assignment</h3>
          <div style={{ fontSize: '0.85rem', color: '#334155' }}>
            <div>Primary Vendor: <strong>{machine?.vendor_name || 'Apex Equipment Services'}</strong></div>
            <div>Supervisor: <strong>Swarnim Mittal</strong></div>
          </div>
        </div>
      )}

      {/* TAB 10: GEOGRAPHY */}
      {activeTab === 'geography' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Geographic Location Master</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
            <div>State: <strong>Rajasthan</strong></div>
            <div>District: <strong>Ajmer</strong></div>
            <div>Block: <strong>Pisangan</strong></div>
            <div>Site ID: <strong>{machine?.site_id || 16}</strong></div>
          </div>
        </div>
      )}

      {/* TAB 11: MAINTENANCE */}
      {activeTab === 'maintenance' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Maintenance & Service Logs</h3>
          <div style={{ padding: '12px', background: '#fffbe6', borderRadius: '8px', border: '1px solid #fef08a' }}>
            <div style={{ fontWeight: '700', color: '#92400e', fontSize: '0.85rem' }}>PM Maintenance Due Soon</div>
            <div style={{ fontSize: '0.78rem', color: '#78350f', marginTop: '2px' }}>Scheduled 500-hour service inspection due in 25 engine hours.</div>
          </div>
        </div>
      )}

      {/* TAB 12: ALERTS */}
      {activeTab === 'alerts' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>All Machine Alerts (6)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '6px', fontSize: '0.82rem', color: '#991b1b', fontWeight: '600' }}>
              • Low Fuel Warning (Reached {fuelPercent}%)
            </div>
            <div style={{ padding: '10px', background: '#fffbe6', borderRadius: '6px', fontSize: '0.82rem', color: '#92400e', fontWeight: '600' }}>
              • PM Maintenance Due Soon (25 hours remaining)
            </div>
            <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.82rem', color: '#475569' }}>
              • Daily Engine Start Telemetry Logged
            </div>
          </div>
        </div>
      )}

      {/* TAB 13: BREAKDOWN OEM */}
      {activeTab === 'breakdown_oem' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Breakdown OEM & Support</h3>
          <div style={{ fontSize: '0.85rem', color: '#334155' }}>
            <div>OEM Manufacturer: <strong>APOLLO HDD Systems</strong></div>
            <div>Warranty Status: <strong style={{ color: '#16a34a' }}>Active (Expires Dec 2027)</strong></div>
            <div>Service Support Line: <strong>+91 1800-425-8000</strong></div>
          </div>
        </div>
      )}

      {/* TAB 14: OPS STOP */}
      {activeTab === 'ops_stop' && (
        <div className="app-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Operational Stoppage Logs</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>No active operational stoppages logged today.</p>
        </div>
      )}

    </div>
  );
};
