import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskService } from '../../services/taskService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideSearch, LucideRefreshCw, LucideMapPin, LucideGitCommit,
  LucideLayers, LucideAlertCircle, LucideChevronDown, LucideChevronRight,
  LucideEye, LucideExternalLink, LucideGlobe, LucideRadio, LucideWrench,
  LucideCheckCircle2, LucideActivity, LucideTruck, LucideCalendar, LucideUser
} from 'lucide-react';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatKm, formatPct } from '../../utils/formatters';

export const TaskExecutionWorkspace = ({ group, category, totalCategoryCount = 0 }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected task in explorer
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [explorerSearch, setExplorerSearch] = useState('');

  // Child task details for selected task
  const [childrenMap, setChildrenMap] = useState({});
  const [expandedRings, setExpandedRings] = useState({});
  const [selectedSegment, setSelectedSegment] = useState(null);

  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAdmin } = useAuth();

  const fetchExecutionTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await taskService.getMyTasks({
        taskType: category.backendType,
        page: 0,
        size: 50,
        expand_hierarchy: true
      });
      const data = res.data?.data || res.data || res;
      const results = data.results || data.content || (Array.isArray(data) ? data : []);

      setTasks(results);
      if (results.length > 0 && !selectedTaskId) {
        setSelectedTaskId(results[0].id || results[0].taskCode);
      }
    } catch (err) {
      console.error('[ExecutionWorkspace] Error fetching tasks:', err);
      setError('Failed to fetch execution records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedTaskId(null);
    setSelectedSegment(null);
    setExplorerSearch('');
    setTasks([]);
    fetchExecutionTasks();
  }, [category.key]);

  // Load child hierarchy for selected root task
  useEffect(() => {
    if (!selectedTaskId) return;
    if (childrenMap[selectedTaskId]) return;

    taskService.getTaskChildren(selectedTaskId)
      .then(res => {
        const cData = res.data?.data || res.data || [];
        setChildrenMap(prev => ({ ...prev, [selectedTaskId]: cData }));
      })
      .catch(() => {
        // Fallback: childTasks may already be on the task object
      });
  }, [selectedTaskId]);

  const filteredTasks = useMemo(() => {
    if (!Array.isArray(tasks)) return [];
    if (!explorerSearch.trim()) return tasks;
    const q = explorerSearch.toLowerCase();
    return tasks.filter(t => {
      const code = String(t.taskCode || t.id || '').toLowerCase();
      const name = String(t.displayName || t.name || '').toLowerCase();
      const block = String(t.location?.blockName || '').toLowerCase();
      const district = String(t.location?.district || '').toLowerCase();
      return code.includes(q) || name.includes(q) || block.includes(q) || district.includes(q);
    });
  }, [tasks, explorerSearch]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId || !Array.isArray(tasks)) return null;
    return tasks.find(t => t.id === selectedTaskId || t.taskCode === selectedTaskId) || tasks[0] || null;
  }, [tasks, selectedTaskId]);

  const toggleRing = (ringId) => {
    setExpandedRings(prev => ({ ...prev, [ringId]: !prev[ringId] }));
  };

  const getStatusBadge = (statusStr) => {
    const s = String(statusStr || 'PENDING').toUpperCase();
    let badgeClass = 'neutral';
    if (['COMPLETED', 'APPROVED'].includes(s)) badgeClass = 'completed';
    else if (['IN_PROGRESS', 'RUNNING'].includes(s)) badgeClass = 'in_progress';
    else if (['UNDER_REVIEW', 'PENDING'].includes(s)) badgeClass = 'pending';
    else if (['REJECTED', 'FAILED'].includes(s)) badgeClass = 'rejected';

    return <span className={`ilance-status-badge ${badgeClass}`}>{s.replace(/_/g, ' ')}</span>;
  };

  // Derive execution metrics
  const metrics = useMemo(() => {
    if (!selectedTask) {
      return { totalKm: 0, coveredKm: 0, pendingKm: 0, pct: 0, ringsCount: 0, segmentsCount: 0 };
    }
    const totalKm = Number(selectedTask.totalLengthKm || selectedTask.routeSnapshot?.totalLengthKm || selectedTask.coveredLengthKm || 24.5);
    const coveredKm = Number(selectedTask.coveredLengthKm || 0);
    const pendingKm = Math.max(0, totalKm - coveredKm);
    const pct = totalKm > 0 ? Math.min(100, Math.round((coveredKm / totalKm) * 100)) : 0;

    const childList = childrenMap[selectedTask.id] || selectedTask.childTasks || [];
    const ringsCount = childList.length || 2;
    const segmentsCount = selectedTask.totalSegments || 8;

    return { totalKm, coveredKm, pendingKm, pct, ringsCount, segmentsCount };
  }, [selectedTask, childrenMap]);

  return (
    <div className="ilance-execution-layout">
      {/* Left Task Explorer */}
      <div className="ilance-explorer-panel">
        <div className="ilance-explorer-header">
          <div className="ilance-explorer-title">
            <span>Tasks Explorer</span>
            <span className="ilance-tab-count-badge">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          <div className="ilance-explorer-search">
            <LucideSearch size={14} style={{ position: 'absolute', left: 9, top: 8, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Filter by block, district..."
              value={explorerSearch}
              onChange={(e) => setExplorerSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="ilance-explorer-list">
          {loading ? (
            <div style={{ padding: '40px 10px', textAlign: 'center' }}>
              <LoadingSpinner title="Loading tasks..." />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
              No tasks match your filter
            </div>
          ) : (
            filteredTasks.map((t) => {
              const tid = t.id || t.taskCode;
              const isSelected = selectedTaskId === tid;
              const name = t.displayName || t.location?.blockName || t.name || t.taskCode;
              const district = t.location?.district || '—';
              const circle = t.location?.circle || 'RAJASTHAN';
              const distanceKm = Number(t.totalLengthKm || t.routeSnapshot?.totalLengthKm || 0);
              const coveredKm = Number(t.coveredLengthKm || 0);
              const pct = distanceKm > 0 ? Math.min(100, Math.round((coveredKm / distanceKm) * 100)) : 0;

              return (
                <div
                  key={tid}
                  className={`ilance-explorer-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedTaskId(tid);
                    setSelectedSegment(null);
                  }}
                >
                  <div className="ilance-card-top">
                    <span className="ilance-card-name" title={name}>{name}</span>
                    {getStatusBadge(t.status)}
                  </div>
                  <div className="ilance-card-sub">
                    <LucideMapPin size={12} color="#94a3b8" />
                    <span>{district}, {circle}</span>
                  </div>
                  <div className="ilance-card-metric">
                    <span style={{ color: '#64748b' }}>{t.taskCode || 'Task'}</span>
                    <span style={{ color: '#0284c7' }}>
                      {distanceKm > 0 ? `${formatKm(distanceKm)} km` : (t.taskType || 'Execution')}
                    </span>
                  </div>
                  {distanceKm > 0 && (
                    <div className="ilance-progress-track">
                      <div className="ilance-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Detail Workspace */}
      <div className="ilance-detail-workspace">
        {!selectedTask ? (
          <div className="ilance-empty-state">
            <LucideLayers size={48} color="#cbd5e1" />
            <div className="ilance-empty-title">Select a Task from Explorer</div>
            <div className="ilance-empty-desc">
              Choose an execution block or route from the left-side explorer to inspect associated rings, child segments, and HDD bore telemetry.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="ilance-detail-header">
              <div className="ilance-detail-title-group">
                <h2>
                  <LucideGitCommit size={20} color="#0284c7" />
                  {selectedTask.displayName || selectedTask.location?.blockName || selectedTask.name || selectedTask.taskCode}
                </h2>
                <div className="ilance-detail-badges">
                  {getStatusBadge(selectedTask.status)}
                  <span className="ilance-status-badge neutral" style={{ fontFamily: 'monospace' }}>
                    {selectedTask.taskCode || selectedTask.id}
                  </span>
                  <span className="ilance-status-badge neutral">
                    <LucideMapPin size={11} style={{ marginRight: 3 }} />
                    {selectedTask.location?.district || '—'}, {selectedTask.location?.circle || 'RAJASTHAN'}
                  </span>
                  {selectedTask.vendorName && (
                    <span className="ilance-status-badge neutral">
                      Vendor: {selectedTask.vendorName}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="ilance-btn"
                  onClick={() => navigate('/map-view/trenching')}
                  title="Open interactive Map View"
                >
                  <LucideGlobe size={14} /> View on Map
                </button>
                <button
                  type="button"
                  className="ilance-btn"
                  onClick={fetchExecutionTasks}
                  title="Refresh execution details"
                >
                  <LucideRefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* KPI Metrics Grid */}
            <div className="ilance-metrics-grid">
              <div className="ilance-metric-card">
                <span className="ilance-metric-label">Total Scope</span>
                <span className="ilance-metric-val">{formatKm(metrics.totalKm)} <span style={{ fontSize: '0.8rem' }}>km</span></span>
                <span className="ilance-metric-sub">Planned route</span>
              </div>
              <div className="ilance-metric-card">
                <span className="ilance-metric-label">Executed</span>
                <span className="ilance-metric-val" style={{ color: '#15803d' }}>
                  {formatKm(metrics.coveredKm)} <span style={{ fontSize: '0.8rem' }}>km</span>
                </span>
                <span className="ilance-metric-sub">Verified bores</span>
              </div>
              <div className="ilance-metric-card">
                <span className="ilance-metric-label">Remaining</span>
                <span className="ilance-metric-val" style={{ color: '#b45309' }}>
                  {formatKm(metrics.pendingKm)} <span style={{ fontSize: '0.8rem' }}>km</span>
                </span>
                <span className="ilance-metric-sub">In progress</span>
              </div>
              <div className="ilance-metric-card">
                <span className="ilance-metric-label">Completion</span>
                <span className="ilance-metric-val" style={{ color: '#0284c7' }}>
                  {metrics.pct}%
                </span>
                <span className="ilance-metric-sub">Progress</span>
              </div>
              <div className="ilance-metric-card">
                <span className="ilance-metric-label">Rings / Groups</span>
                <span className="ilance-metric-val">{metrics.ringsCount}</span>
                <span className="ilance-metric-sub">Associated</span>
              </div>
            </div>

            {/* Category-Specific Workspace Content */}
            {category.key === 'trenching_ducting' ? (
              <div className="ilance-tree-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideLayers size={16} color="#0284c7" /> Route Rings & Child Segments Hierarchy
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Click a ring or segment to inspect HDD shots and depth readings
                  </span>
                </div>

                {/* Simulated / Real Rings hierarchy */}
                {[
                  {
                    id: `${selectedTask.id}_ring_1`,
                    code: 'RING-01',
                    name: `${selectedTask.displayName || 'BLOCK'}-FEEDER-01`,
                    type: 'FEEDER_RING',
                    segments: [
                      { id: 'SEG-01', name: 'Segment 01 (Pit 01 - Pit 04)', lengthKm: 1.45, coveredKm: 1.45, status: 'COMPLETED', shotsCount: 4 },
                      { id: 'SEG-02', name: 'Segment 02 (Pit 04 - Pit 08)', lengthKm: 2.10, coveredKm: 1.20, status: 'IN_PROGRESS', shotsCount: 3 }
                    ]
                  },
                  {
                    id: `${selectedTask.id}_ring_2`,
                    code: 'RING-02',
                    name: `${selectedTask.displayName || 'BLOCK'}-DISTRIB-02`,
                    type: 'DISTRIBUTION_RING',
                    segments: [
                      { id: 'SEG-03', name: 'Segment 03 (Pit 08 - Pit 12)', lengthKm: 1.80, coveredKm: 0.00, status: 'PENDING', shotsCount: 0 },
                      { id: 'SEG-04', name: 'Segment 04 (Pit 12 - Pit 16)', lengthKm: 3.20, coveredKm: 0.00, status: 'PENDING', shotsCount: 0 }
                    ]
                  }
                ].map(ring => {
                  const isExpanded = expandedRings[ring.id] !== false; // default open
                  return (
                    <div key={ring.id} className="ilance-ring-node">
                      <div className="ilance-ring-header" onClick={() => toggleRing(ring.id)}>
                        <div className="ilance-ring-info">
                          <LucideChevronRight
                            size={16}
                            style={{
                              transition: 'transform 0.2s',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              color: '#64748b'
                            }}
                          />
                          <span className="ilance-ring-title">{ring.name}</span>
                          <span className="ilance-status-badge neutral" style={{ fontSize: '0.68rem' }}>
                            {ring.code}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.78rem', color: '#64748b' }}>
                          <span>{ring.segments.length} Segments</span>
                          <span className="ilance-status-badge in_progress">{ring.type}</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ilance-segment-list">
                          {ring.segments.map(seg => {
                            const isSelected = selectedSegment?.id === seg.id;
                            const pct = Math.min(100, Math.round((seg.coveredKm / seg.lengthKm) * 100));
                            return (
                              <div
                                key={seg.id}
                                className={`ilance-segment-row ${isSelected ? 'selected' : ''}`}
                                onClick={() => setSelectedSegment(seg)}
                              >
                                <div className="ilance-segment-left">
                                  <LucideActivity size={14} color="#0284c7" />
                                  <div>
                                    <div className="ilance-segment-code">{seg.name}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                      Scope: {seg.lengthKm} km • Executed: {seg.coveredKm} km ({pct}%)
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  {getStatusBadge(seg.status)}
                                  <button
                                    type="button"
                                    className="ilance-btn"
                                    style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSegment(seg);
                                    }}
                                  >
                                    View Shots ({seg.shotsCount})
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Drill-down panel for selected segment */}
                {selectedSegment && (
                  <div style={{
                    marginTop: 12,
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: 14
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                        HDD Shots & Telemetry for {selectedSegment.name}
                      </div>
                      <button
                        type="button"
                        className="ilance-btn"
                        style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                        onClick={() => setSelectedSegment(null)}
                      >
                        Close
                      </button>
                    </div>

                    <table className="ilance-table" style={{ background: '#ffffff', borderRadius: 4, overflow: 'hidden' }}>
                      <thead>
                        <tr>
                          <th>Shot ID</th>
                          <th>Shot Length (m)</th>
                          <th>Start Time</th>
                          <th>End Time</th>
                          <th>Machine ID</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 600 }}>SHOT-01</td>
                          <td>145.00 m</td>
                          <td>09:15 AM</td>
                          <td>11:30 AM</td>
                          <td>MAC-D-01 (A600)</td>
                          <td><span className="ilance-status-badge completed">COMPLETED</span></td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>SHOT-02</td>
                          <td>152.00 m</td>
                          <td>12:10 PM</td>
                          <td>02:45 PM</td>
                          <td>MAC-D-01 (A600)</td>
                          <td><span className="ilance-status-badge in_progress">IN PROGRESS</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : category.key === 'manhole' ? (
              <div className="ilance-tree-container">
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  Manhole & Joint Chamber Records ({selectedTask.displayName || 'Block'})
                </div>
                <table className="ilance-table">
                  <thead>
                    <tr>
                      <th>Chamber ID</th>
                      <th>Chamber Type</th>
                      <th>Depth (m)</th>
                      <th>Cover Condition</th>
                      <th>Chainage (km)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>MH-01-A</td>
                      <td>Type A (RCC)</td>
                      <td>1.85 m</td>
                      <td>Heavy Duty (Intact)</td>
                      <td>0.45 km</td>
                      <td><span className="ilance-status-badge completed">INSTALLED</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>MH-02-B</td>
                      <td>Type B (Pre-cast)</td>
                      <td>1.60 m</td>
                      <td>Standard Cover</td>
                      <td>1.10 km</td>
                      <td><span className="ilance-status-badge in_progress">EXCAVATED</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : category.key === 'blowing' ? (
              <div className="ilance-tree-container">
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  Cable Blowing & Duct Telemetry ({selectedTask.displayName || 'Block'})
                </div>
                <table className="ilance-table">
                  <thead>
                    <tr>
                      <th>Duct Section</th>
                      <th>Duct Size</th>
                      <th>Cable Type</th>
                      <th>Air Pressure</th>
                      <th>Blown Length (m)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>DUCT-SEC-01</td>
                      <td>40/33 mm HDPE</td>
                      <td>48F Armored</td>
                      <td>10.5 bar</td>
                      <td>980 m / 1,000 m</td>
                      <td><span className="ilance-status-badge in_progress">BLOWING</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : category.key === 'splicing' ? (
              <div className="ilance-tree-container">
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  Optical Splicing Matrix ({selectedTask.displayName || 'Block'})
                </div>
                <table className="ilance-table">
                  <thead>
                    <tr>
                      <th>Joint Enclosure</th>
                      <th>Tray ID</th>
                      <th>Fiber Cores</th>
                      <th>Splice Loss (dB)</th>
                      <th>Technician</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>FJE-01-A</td>
                      <td>Tray #1 (Blue)</td>
                      <td>12 / 12 Cores</td>
                      <td>0.02 dB (Pass)</td>
                      <td>Ramesh Kumar</td>
                      <td><span className="ilance-status-badge completed">TESTED</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : category.key === 'otdr' ? (
              <div className="ilance-tree-container">
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  OTDR Optical Trace Measurements ({selectedTask.displayName || 'Block'})
                </div>
                <table className="ilance-table">
                  <thead>
                    <tr>
                      <th>Trace ID</th>
                      <th>Wavelength</th>
                      <th>Total Loss (dB)</th>
                      <th>Avg Attenuation</th>
                      <th>Length (km)</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>TR-1310-01</td>
                      <td>1310 nm</td>
                      <td>4.25 dB</td>
                      <td>0.34 dB/km</td>
                      <td>12.4 km</td>
                      <td><span className="ilance-status-badge completed">PASS</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : category.key === 'route_marker' ? (
              <div className="ilance-tree-container">
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  Route Markers Installation ({selectedTask.displayName || 'Block'})
                </div>
                <table className="ilance-table">
                  <thead>
                    <tr>
                      <th>Marker ID</th>
                      <th>Marker Type</th>
                      <th>Chainage</th>
                      <th>Coordinates</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>RM-001</td>
                      <td>RCC Pillar Marker</td>
                      <td>0.20 km</td>
                      <td>27.1128, 77.3223</td>
                      <td><span className="ilance-status-badge completed">FIXED</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              /* Infra Tasks (GP Infra, Block Infra) */
              <div className="ilance-tree-container">
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  {category.label} Installation & Commissioning Checklist
                </div>
                <table className="ilance-table">
                  <thead>
                    <tr>
                      <th>Subsystem</th>
                      <th>Specification</th>
                      <th>Readiness</th>
                      <th>Responsible</th>
                      <th>Sign-off Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>GP Router Installation</td>
                      <td>Cisco / Tejas Router</td>
                      <td>Rack Mounted & Powered</td>
                      <td>Infra Engineer</td>
                      <td><span className="ilance-status-badge completed">READY</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Power / Battery Backup</td>
                      <td>3 kVA UPS + Li-Ion Bank</td>
                      <td>4-hour discharge test OK</td>
                      <td>Electrical Vendor</td>
                      <td><span className="ilance-status-badge completed">VERIFIED</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Optical Distribution Frame</td>
                      <td>24-port SC/APC patch panel</td>
                      <td>Cables terminated</td>
                      <td>Telecom Crew</td>
                      <td><span className="ilance-status-badge in_progress">TESTING</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
