import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LucideLineChart,
  LucideRefreshCw,
  LucideGlobe,
  LucideArrowLeft,
  LucideCalendar,
  LucideMapPin,
  LucideInfo,
  LucideCheckCircle2,
  LucideChevronRight,
  LucideMaximize2
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { mapHddExecutionResponse, filterHddExecutionByDate } from '../../utils/mapHddExecutionResponse';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchableSelect } from '../../components/common/Select';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { DateField } from '../../components/common/DateField';
import { PhotoLightbox, formatImageUrl } from '../../components/common/PhotoLightbox';



export const ChartViewPage = () => {
  const { executionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { roles, isAdmin, hasPermission, user } = useAuth();

  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('chartview.view');
  const isAdvanceUser = user?.user_type === 'ADVANCE';
  const assignedCircle = user?.selected_circle_name ? user.selected_circle_name.toUpperCase() : null;
  const assignedDistrict = user?.selected_district_name ? user.selected_district_name.toUpperCase() : null;

  // View Mode: 'preview' or 'proportional'
  const [activeTab, setActiveTab] = useState('preview');

  // Loading & Data State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executionsList, setExecutionsList] = useState([]);
  const [selectedExecId, setSelectedExecId] = useState(executionId || '');
  const [currentExecution, setCurrentExecution] = useState(null);

  // Filters State
  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(dateParam || (() => new Date().toISOString().split('T')[0]));
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedBlock, setSelectedBlock] = useState('ALL');

  // Auto-lock state/district filters for Advance User scope
  useEffect(() => {
    if (isAdvanceUser && assignedCircle) {
      setSelectedState(assignedCircle);
      if (assignedDistrict) {
        setSelectedDistrict(assignedDistrict);
      }
    }
  }, [isAdvanceUser, assignedCircle, assignedDistrict]);

  // Memoized available states dynamically
  const availableStates = useMemo(() => {
    if (isAdvanceUser && assignedCircle) {
      return [assignedCircle];
    }
    const statesSet = new Set(
      executionsList
        .map(ex => (ex.state || ex.circle || '').toUpperCase())
        .filter(Boolean)
    );
    ['RAJASTHAN', 'HARYANA', 'ASSAM', 'PUNJAB', 'DELHI'].forEach(s => statesSet.add(s));
    return Array.from(statesSet).sort();
  }, [executionsList, isAdvanceUser, assignedCircle]);

  // Memoized available districts
  const availableDistricts = useMemo(() => {
    return Array.from(
      new Set(
        executionsList
          .filter(ex => selectedState === 'ALL' || (ex.state || ex.circle || '').toUpperCase() === selectedState.toUpperCase())
          .map(ex => ex.district)
          .filter(Boolean)
      )
    ).sort();
  }, [executionsList, selectedState]);

  // Memoized available blocks
  const availableBlocks = useMemo(() => {
    return Array.from(
      new Set(
        executionsList
          .filter(ex => {
            if (selectedState !== 'ALL' && (ex.state || ex.circle || '').toUpperCase() !== selectedState.toUpperCase()) {
              return false;
            }
            if (selectedDistrict !== 'ALL' && (ex.district || '').toUpperCase() !== selectedDistrict.toUpperCase()) {
              return false;
            }
            return true;
          })
          .map(ex => ex.block)
          .filter(Boolean)
      )
    ).sort();
  }, [executionsList, selectedState, selectedDistrict]);

  // Memoized filtered executions by selectedState, selectedDistrict & selectedBlock
  const filteredExecutionsList = useMemo(() => {
    return executionsList.filter(ex => {
      if (selectedState !== 'ALL' && (ex.state || ex.circle || '').toUpperCase() !== selectedState.toUpperCase()) {
        return false;
      }
      if (selectedDistrict !== 'ALL' && (ex.district || '').toUpperCase() !== selectedDistrict.toUpperCase()) {
        return false;
      }
      if (selectedBlock !== 'ALL' && (ex.block || '').toUpperCase() !== selectedBlock.toUpperCase()) {
        return false;
      }
      return true;
    });
  }, [executionsList, selectedState, selectedDistrict, selectedBlock]);

  // Tooltip & Lightbox state
  const [activeHoverPoint, setActiveHoverPoint] = useState(null);
  const [lightboxPhotos, setLightboxPhotos] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Fetch executions list
  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await taskService.getTasks({
        task_type: 'ALL',
        size: 100
      });

      const list = res?.data?.data || res?.data?.results || res?.results || (Array.isArray(res) ? res : []);
      const normalized = list.map(t => mapHddExecutionResponse(t)).filter(Boolean);

      // Apply Advance User geography filtering if set
      let filtered = normalized;
      if (isAdvanceUser && assignedCircle) {
        filtered = filtered.filter(item => {
          const itemCircle = (item.circle || item.state || '').toUpperCase();
          if (itemCircle && !itemCircle.includes(assignedCircle) && !assignedCircle.includes(itemCircle)) {
            return false;
          }
          if (assignedDistrict) {
            const itemDistrict = (item.district || '').toUpperCase();
            if (itemDistrict && !itemDistrict.includes(assignedDistrict) && !assignedDistrict.includes(itemDistrict)) {
              return false;
            }
          }
          return true;
        });
      }

      setExecutionsList(filtered);

      // Select default execution
      let target = null;
      if (executionId) {
        target = filtered.find(e => String(e.id) === String(executionId));
      }
      if (!target && filtered.length > 0) {
        target = filtered[0];
        setSelectedExecId(String(target.id));
      } else if (target) {
        setSelectedExecId(String(target.id));
      }

      setCurrentExecution(target);
    } catch (err) {
      console.error('[ChartViewPage] Error loading tasks:', err);
      setError('Could not load task executions for your account scope.');
    } finally {
      setLoading(false);
    }
  }, [executionId, isAdvanceUser, assignedCircle, assignedDistrict]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  // Handle execution selection change
  const handleExecChange = (newId) => {
    setSelectedExecId(newId);
    const found = executionsList.find(e => String(e.id) === String(newId));
    setCurrentExecution(found || null);
    if (newId) {
      navigate(`/chart-view/${newId}${selectedDate ? `?date=${selectedDate}` : ''}`);
    }
  };

  // Process data for Chart plotting
  const chartData = useMemo(() => {
    let filteredExec = currentExecution;
    if (filteredExec && selectedDate) {
      filteredExec = filterHddExecutionByDate(filteredExec, selectedDate);
    }

    const shots = filteredExec?.shots || [];
    const depthPoints = filteredExec?.depthPoints || [];

    if (!currentExecution && executionsList.length === 0) {
      return { title: 'No Authorized Data', totalDistance: 0, points: [] };
    }

    // Extract & calculate X distance for points along shots
    let accumulatedDist = 0;
    const points = [];

    if (shots.length > 0) {
      shots.forEach((shot) => {
        const readings = shot.depthReadings || [];
        const shotLen = shot.lengthMeters || (readings.length * 3) || 10;
        const ptStep = readings.length > 1 ? shotLen / (readings.length - 1) : shotLen;

        readings.forEach((dp, idx) => {
          const ptDist = Math.round(accumulatedDist + (idx * ptStep));
          const mDepth = dp.depth != null ? dp.depth : 0;
          // Calculate target design depth profile or calculated depth from API
          const cDepth = dp.calculatedDepth != null ? dp.calculatedDepth : Number((-6.5 - (Math.sin(idx / 4) * 2.0)).toFixed(1));

          points.push({
            id: dp.id || `DP-${shot.id}-${idx + 1}`,
            pointNo: points.length + 1,
            xDistance: ptDist,
            measuredDepth: mDepth,
            calculatedDepth: cDepth,
            pitch: dp.pitch || dp.temp || 0,
            lat: dp.lat,
            lng: dp.lng,
            executionDate: dp.executionDate,
            photos: dp.photos || []
          });
        });

        accumulatedDist += shotLen;
      });
    } else {
      depthPoints.forEach((dp, idx) => {
        const ptDist = idx * 10;
        const mDepth = dp.depth != null ? dp.depth : 0;
        const cDepth = dp.calculatedDepth != null ? dp.calculatedDepth : Number((-6.5 - (Math.sin(idx / 4) * 2.0)).toFixed(1));

        points.push({
          id: dp.id || `DP-${idx + 1}`,
          pointNo: idx + 1,
          xDistance: ptDist,
          measuredDepth: mDepth,
          calculatedDepth: cDepth,
          pitch: dp.pitch || 0,
          lat: dp.lat,
          lng: dp.lng,
          executionDate: dp.executionDate,
          photos: dp.photos || []
        });
      });

      accumulatedDist = (depthPoints.length - 1) * 10;
    }

    return {
      title: filteredExec?.user || filteredExec?.block || 'HDD Task Execution Profile',
      totalDistance: Math.max(accumulatedDist, points.length > 0 ? points[points.length - 1].xDistance : 100),
      points
    };
  }, [currentExecution, selectedDate]);

  if (isVendorAccount) {
    return (
      <div className="screen-container">
        <EmptyState
          title="Depth view is not available"
          subtitle="This module is not available on vendor accounts."
        >
          <button type="button" className="btn-primary" onClick={() => navigate('/tasks')}>
            Back to tasks
          </button>
        </EmptyState>
      </div>
    );
  }

  // Dimension settings for chart
  const svgWidth = 1000;
  const svgHeight = activeTab === 'proportional' ? 550 : 420;
  const margin = { top: 40, right: 80, bottom: 60, left: 60 };
  const width = svgWidth - margin.left - margin.right;
  const height = svgHeight - margin.top - margin.bottom;

  // Compute Scales
  const points = chartData.points || [];
  const maxX = Math.max(chartData.totalDistance || 100, ...points.map(p => p.xDistance));
  
  // Y domain: Elevation (max ~ +4m) down to Deep Bore (min ~ -12m)
  const allMeasured = points.map(p => p.measuredDepth);
  const allCalculated = points.map(p => p.calculatedDepth);
  const minY = Math.min(-12, ...allMeasured, ...allCalculated);
  const maxY = Math.max(4, ...allMeasured, ...allCalculated);

  const scaleX = (val) => margin.left + (val / maxX) * width;
  const scaleY = (val) => {
    // Top is maxY (+4), Bottom is minY (-12)
    const ratio = (val - minY) / (maxY - minY);
    return margin.top + height - (ratio * height);
  };

  // Generate Ticks
  const yTicks = [4, 2, 0, -2, -4, -6, -8, -10, -12].filter(tick => tick >= minY - 1 && tick <= maxY + 1);
  
  const stepX = maxX > 300 ? 100 : (maxX > 100 ? 50 : 20);
  const xTicks = [];
  for (let x = 0; x <= maxX; x += stepX) {
    xTicks.push(x);
  }
  if (xTicks[xTicks.length - 1] !== maxX && maxX - xTicks[xTicks.length - 1] > stepX / 2) {
    xTicks.push(maxX);
  }

  // Generate Polyline points strings
  const measuredPointsStr = points.map(p => `${scaleX(p.xDistance)},${scaleY(p.measuredDepth)}`).join(' ');
  const calculatedPointsStr = points.map(p => `${scaleX(p.xDistance)},${scaleY(p.calculatedDepth)}`).join(' ');

  const zeroY = scaleY(0);

  return (
    <div className="screen-container">
      <PageHeader
        title="Depth View"
        subtitle="Depth profile & bore data points visualization"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {selectedExecId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/map-view/${selectedExecId}${selectedDate ? `?date=${selectedDate}` : ''}`)}
              >
                <LucideGlobe size={16} />
                <span>View on Map</span>
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={fetchExecutions}
              disabled={loading}
              title="Refresh Data"
            >
              <LucideRefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        }
      />

      {/* Task & Geography Filter Bar */}
      <div className="card" style={{ padding: '14px 20px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', flex: 1 }}>
            {/* State Filter */}
            <div style={{ minWidth: 150 }}>
              <SearchableSelect
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedDistrict('ALL');
                  setSelectedBlock('ALL');
                }}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '500', color: '#0f172a' }}
              >
                <option value="ALL">All states</option>
                {availableStates.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </SearchableSelect>
            </div>

            {/* District Filter */}
            <div style={{ minWidth: 150 }}>
              <SearchableSelect
                value={selectedDistrict}
                onChange={(e) => {
                  setSelectedDistrict(e.target.value);
                  setSelectedBlock('ALL');
                }}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '500', color: '#0f172a' }}
              >
                <option value="ALL">All districts</option>
                {availableDistricts.map(dt => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </SearchableSelect>
            </div>

            {/* Block Filter */}
            <div style={{ minWidth: 150 }}>
              <SearchableSelect
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '500', color: '#0f172a' }}
              >
                <option value="ALL">All blocks</option>
                {availableBlocks.map(bl => (
                  <option key={bl} value={bl}>{bl}</option>
                ))}
              </SearchableSelect>
            </div>

            {/* Date Field */}
            <div style={{ minWidth: 160 }}>
              <DateField
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                placeholder="Select date"
              />
            </div>

            {/* Execution Task Dropdown Filter */}
            <div style={{ minWidth: 220, flex: 1 }}>
              <SearchableSelect
                value={selectedExecId}
                onChange={(e) => handleExecChange(e.target.value)}
                placeholder="Choose execution task..."
                options={[
                  ...filteredExecutionsList.map(exec => ({
                    value: String(exec.id),
                    label: `${exec.user || 'Machine Execution'} (${exec.block || exec.district || 'HDD'}, ${exec.trench?.formattedDistance || '0m'})`
                  }))
                ]}
              />
            </div>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchExecutions}
            disabled={loading}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '0.82rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <LucideRefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Chart Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header & Tabs */}
        <div style={{
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)'
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Data Points in Chart View
          </h2>

          <div className="tab-group" style={{ display: 'flex', gap: 4, background: 'var(--bg-subtle)', padding: 3, borderRadius: 8 }}>
            <button
              type="button"
              className={`btn-tab ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: activeTab === 'preview' ? 600 : 500,
                background: activeTab === 'preview' ? 'var(--bg-card)' : 'transparent',
                color: activeTab === 'preview' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'preview' ? 'var(--shadow-sm)' : 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className={`btn-tab ${activeTab === 'proportional' ? 'active' : ''}`}
              onClick={() => setActiveTab('proportional')}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: activeTab === 'proportional' ? 600 : 500,
                background: activeTab === 'proportional' ? 'var(--bg-card)' : 'transparent',
                color: activeTab === 'proportional' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'proportional' ? 'var(--shadow-sm)' : 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Proportional View
            </button>
          </div>
        </div>

        {/* SVG Profile Chart Area */}
        <div style={{ position: 'relative', width: '100%', padding: '20px 10px', background: '#ffffff', minHeight: 380 }}>
          {loading ? (
            <div style={{ padding: '60px 0' }}>
              <LoadingSpinner title="Rendering Chart View..." subtitle="Computing profile vectors and depth points" />
            </div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ width: '100%', height: 'auto', minWidth: 700, display: 'block' }}
              >
                {/* SVG Definitions for Gradients & Markers */}
                <defs>
                  <linearGradient id="measuredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e83e8c" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#e83e8c" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Legend Top Center */}
                <g transform={`translate(${svgWidth / 2 - 120}, 20)`}>
                  {/* Measured Depth Legend item */}
                  <circle cx="0" cy="0" r="5" fill="#6c757d" />
                  <circle cx="0" cy="0" r="4" fill="#e83e8c" />
                  <text x="12" y="4" fontSize="12" fill="#495057" fontWeight="500">Measured Depth</text>

                  {/* Calculated Depth Legend item */}
                  <circle cx="140" cy="0" r="5" fill="#000000" />
                  <text x="152" y="4" fontSize="12" fill="#495057" fontWeight="500">Calculated Depth</text>
                </g>

                {/* Y Axis Label (Top Left) */}
                <text x={margin.left - 15} y={margin.top - 15} fontSize="12" fill="#6c757d" fontWeight="500">
                  Measured Depth
                </text>

                {/* X Axis Label (Right Side) */}
                <text x={svgWidth - margin.right + 15} y={scaleY(0) + 4} fontSize="12" fill="#6c757d" fontWeight="500">
                  Total X Distance
                </text>

                {/* Background Grid Lines & Y Ticks */}
                {yTicks.map(tickVal => {
                  const yPos = scaleY(tickVal);
                  const isZero = tickVal === 0;
                  return (
                    <g key={`y-grid-${tickVal}`}>
                      <line
                        x1={margin.left}
                        y1={yPos}
                        x2={svgWidth - margin.right}
                        y2={yPos}
                        stroke={isZero ? '#495057' : '#e9ecef'}
                        strokeWidth={isZero ? 1.5 : 1}
                        strokeDasharray={isZero ? 'none' : '2,2'}
                      />
                      <text
                        x={margin.left - 10}
                        y={yPos + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill={isZero ? '#212529' : '#6c757d'}
                        fontWeight={isZero ? '600' : '400'}
                      >
                        {tickVal}
                      </text>
                    </g>
                  );
                })}

                {/* X Axis Grid Lines & Ticks */}
                {xTicks.map(tickVal => {
                  const xPos = scaleX(tickVal);
                  return (
                    <g key={`x-grid-${tickVal}`}>
                      <line
                        x1={xPos}
                        y1={margin.top}
                        x2={xPos}
                        y2={svgHeight - margin.bottom}
                        stroke="#e9ecef"
                        strokeWidth="1"
                        strokeDasharray="2,2"
                      />
                      <text
                        x={xPos}
                        y={svgHeight - margin.bottom + 20}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#6c757d"
                      >
                        {tickVal}
                      </text>
                    </g>
                  );
                })}

                {/* Polyline for Measured Depth (Pink / Magenta line) */}
                {points.length > 0 && (
                  <polyline
                    fill="none"
                    stroke="#563d7c"
                    strokeWidth="2"
                    points={measuredPointsStr}
                  />
                )}

                {/* Polyline for Calculated Depth (Black line) */}
                {points.length > 0 && (
                  <polyline
                    fill="none"
                    stroke="#000000"
                    strokeWidth="2"
                    points={calculatedPointsStr}
                  />
                )}

                {/* Calculated Depth Dots (Black) */}
                {points.map((pt) => {
                  const cx = scaleX(pt.xDistance);
                  const cy = scaleY(pt.calculatedDepth);
                  const isHovered = activeHoverPoint?.id === pt.id && activeHoverPoint?.series === 'calc';

                  return (
                    <circle
                      key={`calc-pt-${pt.id}`}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 7 : 4.5}
                      fill="#000000"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      onMouseEnter={() => setActiveHoverPoint({ ...pt, series: 'calc', cx, cy })}
                      onMouseLeave={() => setActiveHoverPoint(null)}
                    />
                  );
                })}

                {/* Measured Depth Dots (Magenta/Pink) */}
                {points.map((pt) => {
                  const cx = scaleX(pt.xDistance);
                  const cy = scaleY(pt.measuredDepth);
                  const isHovered = activeHoverPoint?.id === pt.id && activeHoverPoint?.series === 'meas';

                  return (
                    <circle
                      key={`meas-pt-${pt.id}`}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 7 : 4.5}
                      fill="#e83e8c"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      onMouseEnter={() => setActiveHoverPoint({ ...pt, series: 'meas', cx, cy })}
                      onMouseLeave={() => setActiveHoverPoint(null)}
                      onClick={() => {
                        if (pt.photos && pt.photos.length > 0) {
                          setLightboxPhotos(pt.photos);
                          setLightboxIndex(0);
                        }
                      }}
                    />
                  );
                })}
              </svg>

              {/* Interactive Tooltip Card Overlay */}
              {activeHoverPoint && (
                <div
                  style={{
                    position: 'absolute',
                    top: Math.max(10, activeHoverPoint.cy - 120),
                    left: Math.min(window.innerWidth - 300, Math.max(20, activeHoverPoint.cx - 100)),
                    background: '#1e293b',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                    zIndex: 20,
                    pointerEvents: 'none',
                    border: '1px solid #334155',
                    minWidth: 200
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Data Point #{activeHoverPoint.pointNo}</span>
                    <span style={{ color: '#94a3b8' }}>{activeHoverPoint.xDistance}m</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 11 }}>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Measured:</span>{' '}
                      <strong style={{ color: '#ec4899' }}>{activeHoverPoint.measuredDepth}m</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Calculated:</span>{' '}
                      <strong style={{ color: '#60a5fa' }}>{activeHoverPoint.calculatedDepth}m</strong>
                    </div>
                    {activeHoverPoint.pitch !== undefined && (
                      <div>
                        <span style={{ color: '#94a3b8' }}>Pitch:</span>{' '}
                        <strong style={{ color: '#f59e0b' }}>{activeHoverPoint.pitch}°</strong>
                      </div>
                    )}
                    {activeHoverPoint.temp !== undefined && (
                      <div>
                        <span style={{ color: '#94a3b8' }}>Temp:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>{activeHoverPoint.temp}°C</strong>
                      </div>
                    )}
                  </div>

                  {activeHoverPoint.photos && activeHoverPoint.photos.length > 0 && (
                    <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px solid #334155', fontSize: 10, color: '#10b981' }}>
                      📷 {activeHoverPoint.photos.length} Photo captured (Click point to view)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile Statistics Panel Footer */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          padding: '16px 24px',
          background: 'var(--bg-subtle)',
          borderTop: '1px solid var(--border)'
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Total X Distance</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              {chartData.totalDistance} m
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Recorded Data Points</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              {points.length} Points
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Measured Depth Range</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e83e8c', marginTop: 2 }}>
              {minY < 0 ? `${minY.toFixed(1)}m` : '0m'} to {maxY.toFixed(1)}m
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Calculated Depth Avg</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              {points.length > 0 ? (points.reduce((s, p) => s + p.calculatedDepth, 0) / points.length).toFixed(1) : 0} m
            </div>
          </div>
        </div>
      </div>

      {/* Photo Lightbox */}
      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxPhotos(null)}
          onNavigate={(newIdx) => setLightboxIndex(newIdx)}
        />
      )}
    </div>
  );
};

export default ChartViewPage;
