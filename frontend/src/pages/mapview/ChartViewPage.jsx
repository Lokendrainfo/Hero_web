import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LucideLineChart,
  LucideRefreshCw,
  LucideArrowLeft,
  LucideCalendar,
  LucideMapPin,
  LucideInfo,
  LucideCheckCircle2,
  LucideChevronRight,
  LucideMaximize2,
  LucideActivity,
  LucideLayers
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { mapHddExecutionResponse } from '../../utils/mapHddExecutionResponse';
import { getAvailableStates, getAvailableDistricts, getAvailableBlocks } from '../../utils/geographyMaster';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchableSelect } from '../../components/common/Select';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { PhotoLightbox } from '../../components/common/PhotoLightbox';

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const ChartViewPage = () => {
  const { executionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { roles, isAdmin, hasPermission, user } = useAuth();

  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('chartview.view');
  const isAdvanceUser = user?.user_type === 'ADVANCE';
  const assignedCircle = user?.selected_circle_name ? user.selected_circle_name.toUpperCase() : null;
  const assignedDistrict = user?.selected_district_name ? user.selected_district_name.toUpperCase() : null;

  // View Mode: 'preview' or 'proportional'
  const [activeTab, setActiveTab] = useState('preview');

  // Loading & Tasks Dropdown State (SEPARATED loading flags)
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(null);
  const [tasksList, setTasksList] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(executionId || '');

  // Execution Data State
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [currentExecution, setCurrentExecution] = useState(null);

  // Geography & Shot Filters State (Strictly default to ALL - NO auto-locking)
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedBlock, setSelectedBlock] = useState('ALL');
  const [selectedShotId, setSelectedShotId] = useState('');
  const [hasFetched, setHasFetched] = useState(Boolean(executionId));

  // Available states dynamically
  const availableStates = useMemo(() => {
    return getAvailableStates(tasksList, isAdvanceUser && assignedCircle ? assignedCircle : null);
  }, [tasksList, isAdvanceUser, assignedCircle]);

  // Available districts dynamically (returns all districts across tasks if state === 'ALL')
  const availableDistricts = useMemo(() => {
    if (!tasksList || tasksList.length === 0) return [];
    if (selectedState === 'ALL') {
      const dists = new Set();
      tasksList.forEach(t => {
        const loc = t.locationSnapshot || t.location || {};
        const d = (t.district || loc.district || '').toUpperCase().trim();
        if (d) dists.add(d);
      });
      return Array.from(dists).sort();
    }
    return getAvailableDistricts(selectedState, tasksList);
  }, [tasksList, selectedState]);

  // Available blocks dynamically (returns all blocks across tasks if district === 'ALL')
  const availableBlocks = useMemo(() => {
    if (!tasksList || tasksList.length === 0) return [];
    if (selectedState === 'ALL' && selectedDistrict === 'ALL') {
      const blks = new Set();
      tasksList.forEach(t => {
        const loc = t.locationSnapshot || t.location || {};
        const b = (t.block || loc.blockName || loc.block || '').toUpperCase().trim();
        if (b) blks.add(b);
      });
      return Array.from(blks).sort();
    }
    if (selectedDistrict !== 'ALL') {
      const blks = new Set();
      tasksList.forEach(t => {
        const loc = t.locationSnapshot || t.location || {};
        const st = (t.state || loc.circle || loc.state || '').toUpperCase().trim();
        const d = (t.district || loc.district || '').toUpperCase().trim();
        const b = (t.block || loc.blockName || loc.block || '').toUpperCase().trim();
        if (d === selectedDistrict.toUpperCase() && b) {
          if (selectedState === 'ALL' || st === selectedState.toUpperCase() || selectedState.toUpperCase().includes(st)) {
            blks.add(b);
          }
        }
      });
      return Array.from(blks).sort();
    }
    return getAvailableBlocks(selectedState, selectedDistrict, tasksList);
  }, [tasksList, selectedState, selectedDistrict]);

  // Filtered tasks list (State, District, Block are OPTIONAL filters)
  const filteredTasksList = useMemo(() => {
    return tasksList.filter(t => {
      const loc = t.locationSnapshot || t.location || {};
      const exState = (t.state || loc.circle || loc.state || '').toUpperCase().trim();
      const exDist = (t.district || loc.district || '').toUpperCase().trim();
      const exBlock = (t.block || loc.blockName || loc.block || '').toUpperCase().trim();

      if (selectedState !== 'ALL' && exState && exState !== selectedState.toUpperCase() && !selectedState.toUpperCase().includes(exState) && !exState.includes(selectedState.toUpperCase())) {
        return false;
      }
      if (selectedDistrict !== 'ALL' && exDist && exDist !== selectedDistrict.toUpperCase() && !selectedDistrict.toUpperCase().includes(exDist) && !exDist.includes(selectedDistrict.toUpperCase())) {
        return false;
      }
      if (selectedBlock !== 'ALL' && exBlock && exBlock !== selectedBlock.toUpperCase() && !selectedBlock.toUpperCase().includes(exBlock) && !exBlock.includes(selectedBlock.toUpperCase())) {
        return false;
      }
      return true;
    });
  }, [tasksList, selectedState, selectedDistrict, selectedBlock]);

  // Tooltip & Lightbox state
  const [activeHoverPoint, setActiveHoverPoint] = useState(null);
  const [lightboxPhotos, setLightboxPhotos] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // 1. Fetch selected task's HDD execution data on-demand (STABLE DEPENDENCIES)
  const loadTaskExecution = useCallback(async (taskId) => {
    if (!taskId) {
      setCurrentExecution(null);
      return;
    }
    console.log('[DepthView] loadExecution start for taskId:', taskId);
    setExecutionLoading(true);
    setExecutionError(null);
    try {
      const [detailRes, execRes] = await Promise.all([
        taskService.getTaskDetail(taskId).catch(() => null),
        taskService.getTaskHddExecution(taskId).catch(() => null)
      ]);

      const taskDetail = detailRes?.data?.data || detailRes?.data || null;
      const execPayload = execRes?.data?.data || execRes?.data || null;

      if (!taskDetail && !execPayload) {
        setCurrentExecution(null);
        setExecutionError("Task execution not found or unauthorized");
        return;
      }

      const mapped = mapHddExecutionResponse(taskDetail || { id: taskId }, execPayload);
      console.log('[DepthView] execution response parsed, shots:', (mapped?.shots || []).length);
      setCurrentExecution(mapped);

      // Auto-select first HDD Shot if available
      const firstShot = mapped?.shots && mapped.shots.length > 0 ? mapped.shots[0] : null;
      if (firstShot) {
        setSelectedShotId(String(firstShot.id || firstShot.serialNo || 1));
      } else {
        setSelectedShotId('');
      }
    } catch (err) {
      console.error('[ChartViewPage] Error loading HDD execution:', err);
      setExecutionError('Failed to load HDD execution for selected task.');
      setCurrentExecution(null);
    } finally {
      setExecutionLoading(false);
    }
  }, []);

  // 2. Fetch FIBER_TRENCHING_DUCTING_TASK list on mount (STABLE DEPENDENCIES)
  const fetchTasks = useCallback(async () => {
    console.log('[DepthView] loadTasks start');
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await taskService.getMyTasks({
        task_type: 'FIBER_TRENCHING_DUCTING_TASK',
        size: 100
      });

      const rawList = res?.data?.data?.content || res?.data?.data?.results || res?.data?.data || res?.data?.results || (Array.isArray(res?.data) ? res.data : []);
      
      const filtered = rawList.filter(t => {
        const ttype = String(t.taskType || t.task_type || '').toUpperCase();
        return !ttype || ttype === 'FIBER_TRENCHING_DUCTING_TASK' || ttype.includes('TRENCH') || ttype.includes('DUCT');
      });

      console.log('[DepthView] tasks response count:', filtered.length);
      setTasksList(filtered);
      return filtered;
    } catch (err) {
      console.error('[ChartViewPage] Error fetching tasks list:', err);
      setTasksError('Could not load authorized tasks.');
      return [];
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // 3. Single lifecycle mount effect (Runs ONCE on mount or when URL route parameter executionId changes)
  useEffect(() => {
    let isMounted = true;
    console.log('[DepthView] mount / init executionId:', executionId);

    const init = async () => {
      const loadedTasks = await fetchTasks();
      if (!isMounted) return;

      if (executionId) {
        setSelectedTaskId(executionId);
        setHasFetched(true);
        loadTaskExecution(executionId);
      }
    };

    init();

    return () => {
      isMounted = false;
      console.log('[DepthView] unmount');
    };
  }, [executionId, fetchTasks, loadTaskExecution]);

  // Explicit handler for Fetch Data button
  const handleFetchData = useCallback(async () => {
    if (!selectedTaskId) return;
    setHasFetched(true);
    await loadTaskExecution(selectedTaskId);
  }, [selectedTaskId, loadTaskExecution]);

  // Handle task selection change from dropdown
  const handleTaskChange = (newTaskId) => {
    console.log('[DepthView] task selected:', newTaskId);
    setSelectedTaskId(newTaskId);
    setSelectedShotId('');
    setCurrentExecution(null);
    if (newTaskId) {
      setHasFetched(true);
      navigate(`/chart-view/${newTaskId}`, { replace: true });
      loadTaskExecution(newTaskId);
    } else {
      setHasFetched(false);
      navigate('/chart-view', { replace: true });
    }
  };

  // Process data for Chart plotting (HDD Shot-wise length measurement)
  const chartData = useMemo(() => {
    if (!currentExecution) {
      return {
        title: 'No Task Selected',
        taskCode: '',
        totalDistance: 0,
        numShots: 0,
        numPits: 0,
        numMeasuredPoints: 0,
        numCalculatedPoints: 0,
        avgMeasuredDepth: '0.00',
        maxDepth: '0.00',
        points: [],
        isDataEmpty: true
      };
    }

    const allShots = currentExecution.shots || [];
    const pits = currentExecution.pits || [];
    const depthPoints = currentExecution.depthPoints || [];

    // Filter by selected HDD Shot
    let shotsToProcess = [];
    const isSingleShotSelected = Boolean(selectedShotId && selectedShotId !== 'ALL');

    if (isSingleShotSelected) {
      const target = String(selectedShotId).toLowerCase().trim();
      shotsToProcess = allShots.filter((s, sIdx) => {
        const sId = String(s.id || '').toLowerCase().trim();
        const sSer = String(s.serialNo || s.hddShotSerialNo || '').toLowerCase().trim();
        const sName = String(s.name || s.hddShotName || '').toLowerCase().trim();
        const idxStr = String(sIdx + 1);
        return sId === target || sSer === target || sName === target || idxStr === target;
      });
    } else {
      shotsToProcess = allShots;
    }
    if (shotsToProcess.length === 0 && allShots.length > 0) {
      shotsToProcess = allShots;
    }

    const numShots = shotsToProcess.length;

    // Calculate unique active pits associated with the displayed shots
    const activePitsSet = new Set();
    shotsToProcess.forEach(shot => {
      if (shot.startPit) {
        const sId = typeof shot.startPit === 'object' ? (shot.startPit.id || shot.startPit.serialNo || shot.startPit.name) : shot.startPit;
        if (sId) activePitsSet.add(sId);
      }
      if (shot.endPit) {
        const eId = typeof shot.endPit === 'object' ? (shot.endPit.id || shot.endPit.serialNo || shot.endPit.name) : shot.endPit;
        if (eId) activePitsSet.add(eId);
      }
    });

    const numPits = isSingleShotSelected
      ? (activePitsSet.size > 0 ? activePitsSet.size : Math.min(2, pits.length || 2))
      : (activePitsSet.size > 0 ? activePitsSet.size : (pits.length || 0));

    let accumulatedDist = 0;
    const points = [];

    if (numShots > 0) {
      shotsToProcess.forEach((shot, sIdx) => {
        const readings = shot.depthReadings || [];
        const shotLen = shot.lengthMeters || (readings.length > 0 ? readings.length * 3 : 10);
        
        let prevLat = null, prevLng = null;
        let localCumulativeGPSDist = 0;

        // Base distance offset if readings have absolute route distance values
        let firstRawDist = null;
        if (readings.length > 0) {
          const r0 = readings[0];
          const d0 = r0.xDistance != null ? Number(r0.xDistance) : (r0.distance != null ? Number(r0.distance) : null);
          if (d0 != null && !isNaN(d0)) {
            firstRawDist = d0;
          }
        }

        readings.forEach((dp, idx) => {
          if (dp.lat && dp.lng) {
            if (prevLat !== null && prevLng !== null) {
              localCumulativeGPSDist += haversineMeters(prevLat, prevLng, dp.lat, dp.lng);
            }
            prevLat = dp.lat;
            prevLng = dp.lng;
          }

          const stepDist = readings.length > 1 ? (idx / (readings.length - 1)) * shotLen : (idx * 3);
          const rawDist = dp.xDistance != null ? Number(dp.xDistance) : (dp.distance != null ? Number(dp.distance) : null);
          
          let calculatedPtDist = 0;
          if (isSingleShotSelected) {
            // HDD Shot-wise length measurement: Start at 0m for the selected HDD shot
            if (rawDist != null && !isNaN(rawDist) && firstRawDist != null) {
              calculatedPtDist = rawDist - firstRawDist;
            } else if (localCumulativeGPSDist > 0) {
              calculatedPtDist = localCumulativeGPSDist;
            } else {
              calculatedPtDist = stepDist;
            }
          } else {
            // Multi-shot cumulative distance
            if (rawDist != null && !isNaN(rawDist)) {
              calculatedPtDist = rawDist;
            } else {
              calculatedPtDist = accumulatedDist + (localCumulativeGPSDist > 0 ? localCumulativeGPSDist : stepDist);
            }
          }

          const currentPointDist = Number(Math.max(0, calculatedPtDist)).toFixed(2);

          const mDepth = (dp.depth != null && !isNaN(Number(dp.depth))) ? Number(dp.depth) : 0;
          const rawCDepth = dp.calculatedDepth != null ? Number(dp.calculatedDepth) : (dp.offset != null ? Number(dp.offset) : null);
          const cDepth = (rawCDepth != null && !isNaN(Number(rawCDepth))) ? Number(rawCDepth) : mDepth;

          const measuredPlotY = mDepth > 0 ? -Math.abs(mDepth) : (mDepth < 0 ? mDepth : 0);
          const calculatedPlotY = cDepth > 0 ? -Math.abs(cDepth) : (cDepth < 0 ? cDepth : 0);

          points.push({
            id: dp.id || `DP-${shot.id}-${idx + 1}`,
            shotNo: shot.serialNo || shot.name || `HDD Shot ${sIdx + 1}`,
            pitNo: (shot.startPit?.name || shot.startPit?.id || shot.endPit?.name) || 'Pit N/A',
            pointNo: points.length + 1,
            xDistance: parseFloat(currentPointDist),
            measuredDepth: mDepth,
            calculatedDepth: cDepth,
            measuredPlotY,
            calculatedPlotY,
            pitch: dp.pitch || dp.temp || 0,
            temp: dp.temp,
            lat: dp.lat,
            lng: dp.lng,
            executionDate: dp.executionDate,
            photos: dp.photos || []
          });
        });

        accumulatedDist += Math.max(shotLen, localCumulativeGPSDist);
      });
    } else if (depthPoints.length > 0) {
      let prevLat = null, prevLng = null;
      let cumulativeGPSDist = 0;

      depthPoints.forEach((dp, idx) => {
        if (dp.lat && dp.lng) {
          if (prevLat !== null && prevLng !== null) {
            cumulativeGPSDist += haversineMeters(prevLat, prevLng, dp.lat, dp.lng);
          }
          prevLat = dp.lat;
          prevLng = dp.lng;
        }

        const rawDist = dp.xDistance != null ? Number(dp.xDistance) : (dp.distance != null ? Number(dp.distance) : null);
        const currentPointDist = Number((rawDist != null && !isNaN(rawDist))
          ? rawDist
          : (cumulativeGPSDist > 0 ? cumulativeGPSDist : idx * 5)).toFixed(2);

        const mDepth = (dp.depth != null && !isNaN(Number(dp.depth))) ? Number(dp.depth) : 0;
        const rawCDepth = dp.calculatedDepth != null ? Number(dp.calculatedDepth) : (dp.offset != null ? Number(dp.offset) : null);
        const cDepth = (rawCDepth != null && !isNaN(Number(rawCDepth))) ? Number(rawCDepth) : mDepth;

        const measuredPlotY = mDepth > 0 ? -Math.abs(mDepth) : (mDepth < 0 ? mDepth : 0);
        const calculatedPlotY = cDepth > 0 ? -Math.abs(cDepth) : (cDepth < 0 ? cDepth : 0);

        points.push({
          id: dp.id || `DP-${idx + 1}`,
          shotNo: `Shot 1`,
          pitNo: `Pit 1`,
          pointNo: idx + 1,
          xDistance: parseFloat(currentPointDist),
          measuredDepth: mDepth,
          calculatedDepth: cDepth,
          measuredPlotY,
          calculatedPlotY,
          pitch: dp.pitch || 0,
          temp: dp.temp,
          lat: dp.lat,
          lng: dp.lng,
          executionDate: dp.executionDate,
          photos: dp.photos || []
        });
      });

      accumulatedDist = Math.max(cumulativeGPSDist, (depthPoints.length - 1) * 5);
    }

    const validPoints = points.filter(p => !isNaN(p.xDistance) && !isNaN(p.measuredDepth) && !isNaN(p.calculatedDepth));

    const measuredDepths = validPoints.map(p => p.measuredDepth).filter(d => d > 0);
    const calculatedDepths = validPoints.map(p => p.calculatedDepth).filter(d => d > 0);

    const avgMeasuredDepth = measuredDepths.length > 0 ? (measuredDepths.reduce((s, d) => s + d, 0) / measuredDepths.length).toFixed(2) : '0.00';
    const maxDepth = validPoints.length > 0 ? Math.max(...validPoints.map(p => Math.max(p.measuredDepth, p.calculatedDepth))).toFixed(2) : '0.00';
    
    // Total X distance measurement (HDD shot-wise for single shot, task-wide for ALL)
    let totalDistVal = 0;
    if (validPoints.length > 0) {
      totalDistVal = validPoints[validPoints.length - 1].xDistance;
    }

    return {
      title: currentExecution.displayName || currentExecution.taskCode || 'HDD Task Execution Profile',
      taskCode: currentExecution.taskCode || selectedTaskId,
      user: currentExecution.user,
      vendorName: currentExecution.vendorName,
      block: currentExecution.block,
      district: currentExecution.district,
      state: currentExecution.state,
      totalDistance: Number(totalDistVal.toFixed(1)),
      numShots,
      numPits,
      numMeasuredPoints: measuredDepths.length > 0 ? measuredDepths.length : validPoints.length,
      numCalculatedPoints: calculatedDepths.length > 0 ? calculatedDepths.length : validPoints.length,
      avgMeasuredDepth,
      maxDepth,
      points: validPoints,
      isDataEmpty: validPoints.length === 0
    };
  }, [currentExecution, selectedTaskId, selectedShotId]);

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
  const points = chartData.points || [];
  const svgWidth = activeTab === 'proportional' ? Math.max(1600, points.length * 40) : 1000;
  const svgHeight = 380;
  const margin = { top: 40, right: 80, bottom: 60, left: 60 };
  const width = svgWidth - margin.left - margin.right;
  const height = svgHeight - margin.top - margin.bottom;

  // Compute Scales
  const maxX = Math.max(chartData.totalDistance || 100, ...points.map(p => p.xDistance));
  
  const allMeasuredPlot = points.map(p => p.measuredPlotY);
  const allCalculatedPlot = points.map(p => p.calculatedPlotY);
  const minY = Math.min(-12, ...allMeasuredPlot, ...allCalculatedPlot);
  const maxY = Math.max(4, ...allMeasuredPlot, ...allCalculatedPlot);

  const scaleX = (val) => margin.left + (val / (maxX || 1)) * width;
  const scaleY = (val) => {
    const ratio = (val - minY) / ((maxY - minY) || 1);
    return margin.top + height - (ratio * height);
  };

  const yTicks = [4, 2, 0, -2, -4, -6, -8, -10, -12].filter(tick => tick >= minY - 1 && tick <= maxY + 1);
  
  const stepX = maxX > 300 ? 100 : (maxX > 100 ? 50 : 20);
  const xTicks = [];
  for (let x = 0; x <= maxX; x += stepX) {
    xTicks.push(x);
  }
  if (xTicks[xTicks.length - 1] !== maxX && maxX - xTicks[xTicks.length - 1] > stepX / 2) {
    xTicks.push(maxX);
  }

  const measuredPointsStr = points.map(p => `${scaleX(p.xDistance)},${scaleY(p.measuredPlotY)}`).join(' ');
  const calculatedPointsStr = points.map(p => `${scaleX(p.xDistance)},${scaleY(p.calculatedPlotY)}`).join(' ');

  return (
    <div className="screen-container">
      <PageHeader
        title="Depth View"
        subtitle="HDD Execution Shots & Depth Chart Profile"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                fetchTasks();
                if (selectedTaskId) loadTaskExecution(selectedTaskId);
              }}
              disabled={tasksLoading || executionLoading}
              title="Refresh Data"
            >
              <LucideRefreshCw size={16} className={(tasksLoading || executionLoading) ? 'spin' : ''} />
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
                  <option key={st} value={st}>
                    {st}
                  </option>
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
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </SearchableSelect>
            </div>

            {/* Block Filter */}
            <div style={{ minWidth: 150 }}>
              <SearchableSelect
                value={selectedBlock}
                onChange={(e) => {
                  setSelectedBlock(e.target.value);
                }}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '500', color: '#0f172a' }}
              >
                <option value="ALL">All blocks</option>
                {availableBlocks.map(bl => (
                  <option key={bl} value={bl}>{bl}</option>
                ))}
              </SearchableSelect>
            </div>

            {/* Task Search / Dropdown (Strictly FIBER_TRENCHING_DUCTING_TASK) */}
            <div style={{ minWidth: 260, flex: 1 }}>
              <SearchableSelect
                value={selectedTaskId}
                disabled={tasksLoading}
                onChange={(e) => handleTaskChange(e.target.value)}
                placeholder={
                  tasksLoading
                    ? "Loading authorized tasks..."
                    : filteredTasksList.length > 0
                    ? "Select FIBER_TRENCHING_DUCTING Task..."
                    : "No execution tasks found"
                }
                options={[
                  ...filteredTasksList.map(t => {
                    const loc = t.locationSnapshot || t.location || {};
                    const st = t.state || loc.circle || loc.state || '';
                    const dist = t.district || loc.district || '';
                    const blk = t.block || loc.blockName || loc.block || '';
                    const code = t.taskCode || t.id;
                    const name = t.displayName || t.taskName || 'Segment Task';
                    const vName = t.vendorName || '';
                    const labelParts = [
                      code,
                      name,
                      vName ? `Vendor: ${vName}` : '',
                      blk ? `Block: ${blk}` : '',
                      dist ? `District: ${dist}` : '',
                      st ? `State: ${st}` : ''
                    ].filter(Boolean).join(' | ');
                    return {
                      value: String(t.id || code),
                      label: labelParts
                    };
                  })
                ]}
              />
            </div>

            {/* HDD Shot Filter */}
            <div style={{ minWidth: 180 }}>
              <SearchableSelect
                value={selectedShotId}
                onChange={(e) => setSelectedShotId(e.target.value)}
                placeholder={
                  !selectedTaskId
                    ? "Select Task first"
                    : executionLoading
                    ? "Loading HDD shots..."
                    : (!currentExecution || !(currentExecution.shots || []).length)
                    ? "No HDD shots for task"
                    : "Select HDD Shot..."
                }
                disabled={!selectedTaskId || executionLoading || !currentExecution || !(currentExecution.shots || []).length}
                options={[
                  { value: 'ALL', label: 'All HDD Shots' },
                  ...(currentExecution?.shots || []).map((s, idx) => ({
                    value: String(s.id || s.serialNo || idx + 1),
                    label: `${s.serialNo || s.name || `HDD Shot ${idx + 1}`} (${s.depthReadingsCount || s.depthReadings?.length || 0} pts)`
                  }))
                ]}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '500', color: '#0f172a' }}
              />
            </div>
          </div>

          {/* Fetch Data Primary Button */}
          <button
            type="button"
            onClick={handleFetchData}
            disabled={!selectedTaskId || tasksLoading || executionLoading}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: (!selectedTaskId || tasksLoading || executionLoading) ? '#94a3b8' : '#2563eb',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: (!selectedTaskId || tasksLoading || executionLoading) ? 'not-allowed' : 'pointer',
              boxShadow: (!selectedTaskId || tasksLoading || executionLoading) ? 'none' : '0 2px 4px rgba(37,99,235,0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            <LucideRefreshCw size={15} className={(tasksLoading || executionLoading) ? 'spin' : ''} />
            <span>{executionLoading ? 'Fetching Data...' : 'Fetch Data'}</span>
          </button>
        </div>
      </div>

      {/* Main Execution Telemetry & Chart View */}
      {executionError || tasksError ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState
            title="Unable to load Task Execution"
            subtitle={executionError || tasksError || "Task execution not found or unauthorized"}
          />
        </div>
      ) : !hasFetched || !selectedTaskId ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState
            title="Select a Segment Task"
            subtitle="Choose an authorized FIBER_TRENCHING_DUCTING Segment task from the dropdown and click 'Fetch Data' to load HDD execution shots & depth profile."
          />
        </div>
      ) : executionLoading ? (
        <div style={{ marginTop: 24, padding: '60px 0' }}>
          <LoadingSpinner title="Fetching Execution Data..." subtitle="Loading HDD shots, pits, and depth profile measurements" />
        </div>
      ) : !currentExecution ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState
            title="No Execution Record"
            subtitle={`Execution data is not available for task ${selectedTaskId}.`}
          />
        </div>
      ) : (
        <>
          {/* Shot Summary Metrics Card */}
          <div style={{
            margin: '16px 0',
            padding: '16px 20px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selected Segment Task</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
              {chartData.taskCode} {chartData.title && chartData.title !== chartData.taskCode ? `— ${chartData.title}` : ''}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
              {chartData.block ? `Block: ${chartData.block}` : ''} {chartData.district ? `| District: ${chartData.district}` : ''} {chartData.state ? `| State: ${chartData.state}` : ''} {currentExecution.vendorName ? `| Vendor: ${currentExecution.vendorName}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
            <div style={{ padding: '0 12px', borderLeft: '3px solid #2563eb' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>HDD Shots</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>{chartData.numShots}</div>
            </div>
            <div style={{ padding: '0 12px', borderLeft: '3px solid #64748b' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>HDD Pits</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{chartData.numPits}</div>
            </div>
            <div style={{ padding: '0 12px', borderLeft: '3px solid #e83e8c' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Measured Depth Points</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e83e8c' }}>{chartData.numMeasuredPoints}</div>
            </div>
            <div style={{ padding: '0 12px', borderLeft: '3px solid #000000' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Calculated Depth Points</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000000' }}>{chartData.numCalculatedPoints}</div>
            </div>
            <div style={{ padding: '0 12px', borderLeft: '3px solid #0f172a' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Total X Distance</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{chartData.totalDistance} m</div>
            </div>
            <div style={{ padding: '0 12px', borderLeft: '3px solid #059669' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Average Measured Depth</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>{chartData.avgMeasuredDepth} m</div>
            </div>
            <div style={{ padding: '0 12px', borderLeft: '3px solid #dc2626' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Maximum Depth</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>{chartData.maxDepth} m</div>
            </div>
          </div>
        </div>

      {/* Main Chart Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header & Tabs */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
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
          {selectedTaskId && chartData.isDataEmpty ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <LucideInfo size={44} style={{ color: '#94a3b8', marginBottom: 12 }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', margin: '0 0 6px 0' }}>
                No HDD execution points found.
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0 }}>
                The selected Segment task ({selectedTaskId}) has not recorded any HDD depth points for this selection.
              </p>
            </div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ width: '100%', height: 'auto', minWidth: 700, display: 'block' }}
              >
                {/* SVG Definitions */}
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
                  Measured Depth (m)
                </text>

                {/* X Axis Label (Right Side) */}
                <text x={svgWidth - margin.right + 15} y={scaleY(0) + 4} fontSize="12" fill="#6c757d" fontWeight="500">
                  Total X Distance (m)
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

                {/* Polyline for Measured Depth (Magenta/Pink line) */}
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
                  const cy = scaleY(pt.calculatedPlotY);
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
                  const cy = scaleY(pt.measuredPlotY);
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
                    top: Math.max(10, activeHoverPoint.cy - 130),
                    left: Math.min(window.innerWidth - 320, Math.max(20, activeHoverPoint.cx - 100)),
                    background: '#1e293b',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                    zIndex: 20,
                    pointerEvents: 'none',
                    border: '1px solid #334155',
                    minWidth: 220
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{activeHoverPoint.shotNo} • Point #{activeHoverPoint.pointNo}</span>
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
                    {activeHoverPoint.pitNo && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: '#94a3b8' }}>Pit:</span>{' '}
                        <strong style={{ color: '#f8fafc' }}>{activeHoverPoint.pitNo}</strong>
                      </div>
                    )}
                    {activeHoverPoint.lat && activeHoverPoint.lng && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: '#94a3b8' }}>Coordinates:</span>{' '}
                        <strong style={{ color: '#cbd5e1' }}>{activeHoverPoint.lat.toFixed(6)}, {activeHoverPoint.lng.toFixed(6)}</strong>
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
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Recorded HDD Shots</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              {chartData.numShots} Shots
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Depth Readings Count</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e83e8c', marginTop: 2 }}>
              {chartData.points.length} Points
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Calculated Depth Avg</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              {chartData.points.length > 0 ? (chartData.points.reduce((s, p) => s + p.calculatedDepth, 0) / chartData.points.length).toFixed(1) : 0} m
            </div>
          </div>
        </div>
      </div>
    </>
  )}

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
