import React, { Suspense, lazy, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideMaximize2,
  LucideMinimize2,
  Globe,
  LucideRuler,
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import {
  mapHddExecutionResponse,
  filterHddExecutionByDate,
  parseDateToYMD,
  parseAnyDate,
  isMongoHexId,
  hasHddShotOrTrenchingStarted,
  getVisiblePitsForMap,
  mergeMultipleTasksExecution
} from '../../utils/mapHddExecutionResponse';
import { trackingService } from '../../services/trackingService';
import { PhotoLightbox, formatImageUrl } from '../../components/common/PhotoLightbox';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { DateField } from '../../components/common/DateField';
import { AlignPlanMapButton } from '../../components/planner/AlignPlanMapButton';
import { PlanLayerManagementPanel } from '../../components/planner/PlanLayerManagementPanel';
import { renderPlannerLayersOnLeaflet, calculateMultiPlanBounds } from '../../utils/plannerMapUtils';
import { formatDepthM } from '../../utils/formatters';
import {
  applyGisZoomLabels,
  depthDotSize,
  depthLabelStep,
  depthPointIcon,
  depthSampleStep,
  gisPopupHtml,
  pitIcon,
  pitPopupHtml,
  resolvePitRole,
} from '../../utils/gisMapMarkers';

const GisExecutionMap3D = lazy(() => import('../../components/maps/GisExecutionMap3D'));

const machineStatusColors = {
  RUNNING: { fill: '#059669', ring: '#a7f3d0' },
  WORKING: { fill: '#059669', ring: '#a7f3d0' },
  IDLE: { fill: '#d97706', ring: '#fde68a' },
  STOPPED: { fill: '#dc2626', ring: '#fecaca' },
  OFFLINE: { fill: '#64748b', ring: '#cbd5e1' },
};

const buildMachineMarkerHtml = (course, status, name, isAssigned) => {
  const st = (status || 'RUNNING').toUpperCase();
  const colors = machineStatusColors[st] || machineStatusColors.RUNNING;
  const deg = Number(course) || 0;
  const ringColor = isAssigned ? '#38bdf8' : colors.ring;
  const borderWidth = isAssigned ? '3.5px' : '2.5px';

  return `
    <div style="
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    ">
      <div style="
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: ${colors.fill};
        border: ${borderWidth} solid #ffffff;
        box-shadow: 0 0 0 2.5px ${ringColor}, 0 4px 12px rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          style="
            transform: rotate(${deg}deg);
            transform-origin: center center;
            display: block;
            transition: transform 0.3s ease;
          "
        >
          <path
            d="M12 2.5 L19.5 20.5 L12 16.2 L4.5 20.5 Z"
            fill="#ffffff"
            stroke="rgba(15,23,42,0.22)"
            stroke-width="0.8"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      ${name ? `
        <div style="
          position: absolute;
          top: 38px;
          left: 50%;
          transform: translateX(-50%);
          background: ${isAssigned ? '#0284c7' : 'rgba(15, 23, 42, 0.92)'};
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          border: 1px solid rgba(255,255,255,0.3);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          pointer-events: none;
        ">
          ${isAssigned ? '★ ' : ''}${name}
        </div>
      ` : ''}
    </div>
  `;
};

export const isMachineMatchingUser = (liveMachine, userMachineKeys) => {
  if (!liveMachine || !userMachineKeys || userMachineKeys.length === 0) return false;

  const mChassis = String(liveMachine.machine_chassis_no || liveMachine.chassis_no || liveMachine.serial_number || '').trim().toLowerCase();
  const mName = String(liveMachine.name || liveMachine.model_name || '').trim().toLowerCase();
  const mId = String(liveMachine.id ?? '').trim().toLowerCase();

  const liveChassisDigits = mChassis.match(/\d{4,}/);
  const liveNameDigits = mName.match(/\d{4,}/);
  const liveLast4 = (liveChassisDigits ? liveChassisDigits[0] : (liveNameDigits ? liveNameDigits[0] : '')).slice(-4);

  for (const rawKey of userMachineKeys) {
    if (!rawKey) continue;
    const key = String(rawKey).trim().toLowerCase();
    if (!key) continue;

    // 1. Direct equality with chassis, name, or id
    if (mChassis === key || mName === key || mId === key) {
      return true;
    }

    // 2. Substring match
    if (key.length >= 4) {
      if (mChassis.includes(key) || mName.includes(key)) {
        return true;
      }
      if (key.includes(mChassis) && mChassis.length >= 4) {
        return true;
      }
    }

    // 3. Last 4 digits match (e.g. chassis 600202608409 ends with 8409 or name 'A600 HDD (8409)' contains 8409)
    const keyDigits = key.match(/\d{4,}/);
    if (keyDigits) {
      const keyLast4 = keyDigits[0].slice(-4);
      if (liveLast4 && liveLast4 === keyLast4) {
        return true;
      }
      if (mChassis.endsWith(keyLast4) || mName.includes(keyLast4)) {
        return true;
      }
    }
  }

  return false;
};

const segmentMetaCache = new Map();

const registerSegmentMeta = (task) => {
  if (!task) return;
  const mongoId = String(task.id || task._id || task.taskId || '');
  if (!mongoId || !isMongoHexId(mongoId)) return;

  const rawCodes = [task.taskCode, task.task_code, task.code, task.title, task.name, task.externalTaskId];
  const tCode = rawCodes.find(c => c && typeof c === 'string' && !isMongoHexId(c)) || '';

  const segmentSnapshots = Array.isArray(task.segmentSnapshots) ? task.segmentSnapshots : [];
  const firstSeg = segmentSnapshots[0] || {};
  const sName = String(
    (task.displayName && !task.displayName.toUpperCase().endsWith('-BOQ') && !task.displayName.toUpperCase().endsWith('-BLOCK') ? task.displayName : '') ||
    task.segmentName ||
    task.segment_name ||
    firstSeg.segmentName ||
    firstSeg.name ||
    firstSeg.displayName ||
    task.routeSnapshot?.segmentName ||
    task.routeSnapshot?.routeName ||
    task.taskName ||
    ''
  );

  const rawRing = String(
    task.ring ||
    task.ringId ||
    task.ringCode ||
    task.ringName ||
    task.routeSnapshot?.parentRouteName ||
    task.routeSnapshot?.ringName ||
    task.routeSnapshot?.ring ||
    ''
  );

  if (tCode || sName) {
    segmentMetaCache.set(mongoId, {
      taskCode: tCode,
      segmentName: sName,
      ring: rawRing
    });
  }
};

const formatLastModified = (val) => {
  if (!val || val === '—' || val === 'N/A') return '—';
  const d = parseAnyDate(val) || new Date(val);
  if (!d || isNaN(d.getTime())) return String(val);
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value || '';
  let month = parts.find(p => p.type === 'month')?.value || '';
  if (month === 'Sep') month = 'Sept';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value || '').toLowerCase();
  return `${day} ${month}, ${hour}:${minute} ${dayPeriod}`;
};

class Map3dBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[Gis3D]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="gis-map3d-loading">
          3D view could not start. Switch back to 2D.
          {this.state.error?.message ? ` (${this.state.error.message})` : ''}
        </div>
      );
    }
    return this.props.children;
  }
}

export const HddExecutionMapPage = ({ isBharatNetMap: isBharatNetMapProp } = {}) => {
  const { executionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { roles, isAdmin, hasPermission } = useAuth();

  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('mapview.view');

  const isBharatNetMap = Boolean(
    isBharatNetMapProp ||
    ['true', '1'].includes((searchParams.get('isBharatNetMap') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('isBharatNet') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('is_bharatnet') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('is_bharat_net') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('bharatnet') || '').toLowerCase()) ||
    ['bharatnet', 'td-monitoring', 'td_monitoring'].includes((searchParams.get('source') || '').toLowerCase()) ||
    (typeof window !== 'undefined' && window.location.pathname.toLowerCase().includes('/bharatnet')) ||
    (searchParams.get('mode') === 'user' && searchParams.get('source') !== 'trenching')
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Execution Data State
  const [rawExecutionData, setRawExecutionData] = useState(null);
  const [executionData, setExecutionData] = useState(null);

  // Date Filter State
  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(dateParam || '');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Map & GIS state
  const [mapType, setMapType] = useState('satellite'); // Default to Satellite view
  const [viewMode, setViewMode] = useState('2d');
  const [fitNonce, setFitNonce] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // BharatNet map remains strictly 2D
  useEffect(() => {
    if (isBharatNetMap && viewMode !== '2d') {
      setViewMode('2d');
    }
  }, [isBharatNetMap, viewMode]);

  // Lightbox State
  const [lightboxPhotos, setLightboxPhotos] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const pitLayerRef = useRef(null);
  const depthLayerRef = useRef(null);
  const machineLayerRef = useRef(null);
  const plannerLayerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const wrapperRef = useRef(null);

  // Ruler / Interactive Distance Measurement Tool
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measureTotalDist, setMeasureTotalDist] = useState(0);
  const measureLayerRef = useRef(null);
  const rubberBandLineRef = useRef(null);

  const toggleMeasurementRuler = useCallback(() => {
    if (isBharatNetMap) return;
    setIsMeasuring((prev) => {
      const next = !prev;
      if (!next) {
        if (rubberBandLineRef.current && mapInstanceRef.current) {
          try { mapInstanceRef.current.removeLayer(rubberBandLineRef.current); } catch (e) { }
          rubberBandLineRef.current = null;
        }
        if (mapContainerRef.current) {
          mapContainerRef.current.style.cursor = '';
        }
      } else {
        if (mapContainerRef.current) {
          mapContainerRef.current.style.cursor = 'crosshair';
        }
      }
      return next;
    });
  }, [isBharatNetMap]);

  const clearMeasurement = useCallback(() => {
    setMeasurePoints([]);
    setMeasureTotalDist(0);
    if (measureLayerRef.current) {
      measureLayerRef.current.clearLayers();
    }
    if (rubberBandLineRef.current && mapInstanceRef.current) {
      try { mapInstanceRef.current.removeLayer(rubberBandLineRef.current); } catch (e) { }
      rubberBandLineRef.current = null;
    }
  }, []);

  // Disable and clean up measurement ruler on BharatNet map
  useEffect(() => {
    if (isBharatNetMap && isMeasuring) {
      setIsMeasuring(false);
      clearMeasurement();
    }
  }, [isBharatNetMap, isMeasuring, clearMeasurement]);

  // Live Machines State from FiberForce / Fiber HDD Portal API
  const [liveMachines, setLiveMachines] = useState([]);
  const [showLiveMachines, setShowLiveMachines] = useState(true);
  const [selectedLiveMachine, setSelectedLiveMachine] = useState(null);

  const fetchLiveMachines = React.useCallback(async () => {
    if (isBharatNetMap) return;
    try {
      const res = await trackingService.getLiveLocations();
      const raw = res?.data?.data !== undefined ? res.data.data : (res?.data !== undefined ? res.data : res);
      let list = [];
      if (Array.isArray(raw)) list = raw;
      else if (raw && Array.isArray(raw.results)) list = raw.results;
      else if (raw && Array.isArray(raw.data)) list = raw.data;
      setLiveMachines(list.filter((m) => m && m.latitude != null && m.longitude != null));
    } catch (err) {
      console.warn('[HddExecutionMapPage] Could not load live machines:', err);
    }
  }, [isBharatNetMap]);

  useEffect(() => {
    if (isBharatNetMap) return;
    fetchLiveMachines();
    const interval = setInterval(fetchLiveMachines, 10000);
    return () => clearInterval(interval);
  }, [isBharatNetMap, fetchLiveMachines]);

  // Target Machine Keys for the active execution/block user(s)
  const userMachineKeys = useMemo(() => {
    const keys = new Set();
    const addKey = (val) => {
      if (val != null) {
        const s = String(val).trim();
        if (s && s !== '—' && s !== 'N/A' && s !== 'null' && s !== 'undefined') {
          if (s.includes(',')) {
            s.split(',').forEach((sub) => {
              const cleanSub = sub.trim();
              if (cleanSub) keys.add(cleanSub);
            });
          } else {
            keys.add(s);
          }
        }
      }
    };

    // 1. From searchParams machineId (e.g. from user row or block button)
    addKey(searchParams.get('machineId'));

    // 2. From current executionData
    if (executionData) {
      addKey(executionData.machineId);
      addKey(executionData.machineName);
      addKey(executionData.machineModel);
      if (Array.isArray(executionData.machineIds)) {
        executionData.machineIds.forEach(addKey);
      }
      if (Array.isArray(executionData.machineNames)) {
        executionData.machineNames.forEach(addKey);
      }
      if (Array.isArray(executionData.machinesList)) {
        executionData.machinesList.forEach((m) => {
          if (m) {
            addKey(m.machineId);
            addKey(m.machineName);
            addKey(m.machineModel);
          }
        });
      }
      if (executionData.machineDetails && typeof executionData.machineDetails === 'object') {
        addKey(executionData.machineDetails.machineId);
        addKey(executionData.machineDetails.chassisNo);
        addKey(executionData.machineDetails.registrationNo);
        addKey(executionData.machineDetails.serialNumber);
        addKey(executionData.machineDetails.name);
      }
    }

    // 3. From rawExecutionData
    if (rawExecutionData) {
      addKey(rawExecutionData.machineId);
      addKey(rawExecutionData.machineName);
      if (Array.isArray(rawExecutionData.machineIds)) {
        rawExecutionData.machineIds.forEach(addKey);
      }
      if (Array.isArray(rawExecutionData.machineNames)) {
        rawExecutionData.machineNames.forEach(addKey);
      }
      if (Array.isArray(rawExecutionData.machinesList)) {
        rawExecutionData.machinesList.forEach((m) => {
          if (m) {
            addKey(m.machineId);
            addKey(m.machineName);
          }
        });
      }
    }

    return Array.from(keys);
  }, [executionData, rawExecutionData, searchParams]);

  // STRICTLY filter live machines to ONLY what this user / block has (NEVER on BharatNet map):
  const userFilteredMachines = useMemo(() => {
    if (isBharatNetMap) return [];
    if (!liveMachines || liveMachines.length === 0 || userMachineKeys.length === 0) {
      return [];
    }
    return liveMachines.filter((m) => isMachineMatchingUser(m, userMachineKeys));
  }, [isBharatNetMap, liveMachines, userMachineKeys]);

  const plannerLayerGroupsRef = useRef(new Map());
  const [activePlansList, setActivePlansList] = useState([]);

  const handleAlignMultiPlans = (plansList, combinedBounds, summaryStats) => {
    if (!Array.isArray(plansList) || plansList.length === 0) return;

    setActivePlansList(plansList);

    if (mapInstanceRef.current) {
      // Clear existing per-plan layer groups
      plannerLayerGroupsRef.current.forEach((fg) => {
        try { mapInstanceRef.current.removeLayer(fg); } catch (e) { }
      });
      plannerLayerGroupsRef.current.clear();

      plansList.forEach((plan) => {
        const fg = L.featureGroup().addTo(mapInstanceRef.current);
        plannerLayerGroupsRef.current.set(plan.planId, fg);

        renderPlannerLayersOnLeaflet(
          fg,
          plan.paths,
          plan.nodes,
          {
            routeColor: plan.color?.stroke || '#0284c7',
            nodeColor: plan.color?.node || '#0369a1',
            planName: plan.planName,
            clear: true
          }
        );
      });

      // ALWAYS bring execution route and depth layers to front so they are never obscured
      if (layerGroupRef.current) {
        layerGroupRef.current.bringToFront();
      }
      if (pitLayerRef.current) {
        pitLayerRef.current.bringToFront();
      }
      if (depthLayerRef.current) {
        depthLayerRef.current.bringToFront();
      }
      if (machineLayerRef.current) {
        machineLayerRef.current.bringToFront();
      }

      // Check if there is an active execution route on the map
      const execGroups = [layerGroupRef.current, pitLayerRef.current, depthLayerRef.current].filter(Boolean);
      const execBounds = execGroups.reduce((acc, group) => {
        try {
          const next = group.getBounds();
          if (!next || !next.isValid()) return acc;
          return acc ? acc.extend(next) : next;
        } catch (e) {
          return acc;
        }
      }, null);

      if (execBounds && execBounds.isValid()) {
        // Keep the map focused on the execution route so it remains clearly visible!
        mapInstanceRef.current.fitBounds(execBounds, {
          padding: [60, 60],
          maxZoom: 17,
          animate: true
        });
      } else if (combinedBounds) {
        mapInstanceRef.current.fitBounds(combinedBounds, {
          padding: [40, 40],
          maxZoom: 18,
          animate: true
        });
      }
    }
  };

  const togglePlanVisibility = (planId) => {
    setActivePlansList((prev) => {
      const next = prev.map((p) => {
        if (p.planId === planId) {
          const newVis = !p.visible;
          const fg = plannerLayerGroupsRef.current.get(planId);
          if (fg && mapInstanceRef.current) {
            if (newVis) {
              mapInstanceRef.current.addLayer(fg);
              if (layerGroupRef.current) layerGroupRef.current.bringToFront();
              if (pitLayerRef.current) pitLayerRef.current.bringToFront();
              if (depthLayerRef.current) depthLayerRef.current.bringToFront();
            } else {
              mapInstanceRef.current.removeLayer(fg);
            }
          }
          return { ...p, visible: newVis };
        }
        return p;
      });

      const execGroups = [layerGroupRef.current, pitLayerRef.current, depthLayerRef.current].filter(Boolean);
      const hasExecBounds = execGroups.some(g => {
        try { return g.getBounds()?.isValid(); } catch (e) { return false; }
      });

      if (!hasExecBounds) {
        const visiblePlans = next.filter((p) => p.visible);
        const newBounds = calculateMultiPlanBounds(visiblePlans);
        if (newBounds && mapInstanceRef.current) {
          mapInstanceRef.current.fitBounds(newBounds, { padding: [40, 40], maxZoom: 18, animate: true });
        }
      }

      return next;
    });
  };

  const removePlanFromMap = (planId) => {
    setActivePlansList((prev) => {
      const next = prev.filter((p) => p.planId !== planId);
      const fg = plannerLayerGroupsRef.current.get(planId);
      if (fg && mapInstanceRef.current) {
        try { mapInstanceRef.current.removeLayer(fg); } catch (e) { }
        plannerLayerGroupsRef.current.delete(planId);
      }

      const execGroups = [layerGroupRef.current, pitLayerRef.current, depthLayerRef.current].filter(Boolean);
      const hasExecBounds = execGroups.some(g => {
        try { return g.getBounds()?.isValid(); } catch (e) { return false; }
      });

      if (!hasExecBounds) {
        const visiblePlans = next.filter((p) => p.visible);
        const newBounds = calculateMultiPlanBounds(visiblePlans);
        if (newBounds && mapInstanceRef.current) {
          mapInstanceRef.current.fitBounds(newBounds, { padding: [40, 40], maxZoom: 18, animate: true });
        }
      }

      return next;
    });
  };

  const handleAlignPlan = (planSummary) => {
    if (!planSummary) return;
    handleAlignMultiPlans([planSummary], planSummary.bounds);
  };

  // Batch resolve S3 Presigned URLs via POST /api/survey/photo-urls (disabled as requested: do not load photos)
  const resolvePhotoUrlsForExecution = async (normalized) => {
    return normalized;
  };

  const resolveExecutionData = async (targetId, maxDepth = 3) => {
    if (!targetId || maxDepth <= 0) return null;

    try {
      const [taskRes, execRes] = await Promise.all([
        taskService.getTaskDetail(targetId).catch(() => null),
        taskService.getTaskExecution(targetId).catch(execErr => {
          console.log(`[HddExecutionMapPage] Execution endpoint response for ${targetId}:`, execErr);
          return null;
        })
      ]);

      const taskData = taskRes?.data?.data || taskRes?.data || null;
      if (!taskData) return null;

      // Ensure taskData has a valid human-readable taskCode (e.g. TASK-2026-XXXXX), fallback to my-tasks if missing
      if (!taskData.taskCode || isMongoHexId(taskData.taskCode)) {
        try {
          const myTasksRes = await taskService.getMyTasks();
          const list = myTasksRes?.data?.data?.results || myTasksRes?.data?.results || myTasksRes?.data?.data || myTasksRes?.data || [];
          const matched = Array.isArray(list) && list.find(t =>
            String(t.id || t._id) === String(targetId) ||
            String(t.id || t._id).startsWith(String(targetId)) ||
            String(t.taskCode) === String(targetId)
          );
          if (matched && matched.taskCode && !isMongoHexId(matched.taskCode)) {
            taskData.taskCode = matched.taskCode;
            if (!taskData.displayName || isMongoHexId(taskData.displayName)) {
              taskData.displayName = matched.displayName || matched.name;
            }
          }
        } catch (e) { /* ignore fallback error */ }
      }

      const execData = execRes?.data?.data || execRes?.data || null;
      let normalized = mapHddExecutionResponse(taskData, execData);
      if (!normalized) return null;

      // Check if child tasks under this task have telemetry, and aggregate them into THIS user's task
      try {
        let children = taskData.children;
        if (!Array.isArray(children) || children.length === 0) {
          const childrenRes = await taskService.getTaskChildren(targetId);
          children = childrenRes?.data?.data || childrenRes?.data || [];
        }

        if (Array.isArray(children) && children.length > 0) {
          const childResults = await Promise.all(
            children.map(child => {
              const childId = child.id || child._id || child.taskId;
              return childId ? resolveExecutionData(childId, maxDepth - 1) : Promise.resolve(null);
            })
          );

          // Merge any valid child shots, pits, and depth points into execution object
          childResults.filter(Boolean).forEach(childNorm => {
            if (childNorm.shots && childNorm.shots.length > 0) {
              const mergedShots = [...(normalized.shots || [])];
              const seenShotKeys = new Set(mergedShots.map(s => `${s.serialNo || s.name || ''}_${s.startTime || ''}`));
              childNorm.shots.forEach(s => {
                const k = `${s.serialNo || s.name || ''}_${s.startTime || ''}`;
                if (!seenShotKeys.has(k)) {
                  seenShotKeys.add(k);
                  mergedShots.push(s);
                }
              });
              normalized.shots = mergedShots;
            }
            if (childNorm.machineId || childNorm.machineName) {
              if (!normalized.machineIds) normalized.machineIds = [];
              if (childNorm.machineId && !normalized.machineIds.includes(childNorm.machineId)) {
                normalized.machineIds.push(childNorm.machineId);
              }
              if (!normalized.machinesList) normalized.machinesList = [];
              if (!normalized.machinesList.some(m => m.machineId === childNorm.machineId)) {
                normalized.machinesList.push({
                  machineId: childNorm.machineId,
                  machineName: childNorm.machineName,
                  machineModel: childNorm.machineModel,
                  machineVendor: childNorm.machineVendor
                });
              }
            }
            if (childNorm.pits && childNorm.pits.length > 0) {
              const mergedPits = [...(normalized.pits || [])];
              const seenPitKeys = new Set(mergedPits.map(p => `${p.serialNo || p.name || ''}_${p.diggingTime || ''}`));
              childNorm.pits.forEach(p => {
                const k = `${p.serialNo || p.name || ''}_${p.diggingTime || ''}`;
                if (!seenPitKeys.has(k)) {
                  seenPitKeys.add(k);
                  mergedPits.push(p);
                }
              });
              normalized.pits = mergedPits;
            }
            registerSegmentMeta(childNorm);
            if (childNorm.depthPoints && childNorm.depthPoints.length > 0) {
              const mergedDps = [...(normalized.depthPoints || [])];
              childNorm.depthPoints.forEach(dp => {
                const existingIdx = mergedDps.findIndex(d => {
                  if (d.id && dp.id && String(d.id) === String(dp.id)) return true;
                  if (d.lat != null && dp.lat != null && d.lng != null && dp.lng != null) {
                    const dLat = Math.abs(Number(d.lat) - Number(dp.lat));
                    const dLng = Math.abs(Number(d.lng) - Number(dp.lng));
                    if (dLat < 0.00005 && dLng < 0.00005) return true;
                  }
                  const u1 = (d.photo && (d.photo.photoUrl || d.photo.url)) || d.photoUrl;
                  const u2 = (dp.photo && (dp.photo.photoUrl || dp.photo.url)) || dp.photoUrl;
                  if (u1 && u2 && String(u1) === String(u2)) return true;
                  return false;
                });
                const cSegName = childNorm.segmentName || childNorm.displayName || childNorm.taskName;
                const cTaskCode = childNorm.taskCode || childNorm.taskId;
                const cRing = childNorm.ring || childNorm.ringId;

                if (existingIdx !== -1) {
                  if (cSegName && !isMongoHexId(cSegName)) {
                    mergedDps[existingIdx].segmentName = cSegName;
                    mergedDps[existingIdx].taskName = cSegName;
                  }
                  if (cTaskCode && !isMongoHexId(cTaskCode)) {
                    mergedDps[existingIdx].taskCode = cTaskCode;
                    mergedDps[existingIdx].taskId = cTaskCode;
                  }
                  if (cRing) {
                    mergedDps[existingIdx].ring = cRing;
                    mergedDps[existingIdx].ringId = cRing;
                  }
                } else {
                  if (cSegName && !isMongoHexId(cSegName)) {
                    dp.segmentName = cSegName;
                    dp.taskName = cSegName;
                  }
                  if (cTaskCode && !isMongoHexId(cTaskCode)) {
                    dp.taskCode = cTaskCode;
                    dp.taskId = cTaskCode;
                  }
                  if (cRing) {
                    dp.ring = cRing;
                    dp.ringId = cRing;
                  }
                  mergedDps.push(dp);
                }
              });
              normalized.depthPoints = mergedDps;
            }
            if (childNorm.availableDates && childNorm.availableDates.length > 0) {
              const mergedDates = new Set([...(normalized.availableDates || []), ...childNorm.availableDates]);
              normalized.availableDates = Array.from(mergedDates).sort();
            }
            if (childNorm.updatedAt) {
              const dNorm = parseAnyDate(normalized.updatedAt);
              const dChild = parseAnyDate(childNorm.updatedAt);
              const tNorm = dNorm ? dNorm.getTime() : 0;
              const tChild = dChild ? dChild.getTime() : 0;
              if (tChild > tNorm) {
                normalized.updatedAt = childNorm.updatedAt;
                normalized.lastModified = childNorm.lastModified || normalized.lastModified;
              }
            }
          });
        }
      } catch (childErr) {
        console.log(`[HddExecutionMapPage] getTaskChildren error for ${targetId}:`, childErr);
      }

      // If this task has a parentTaskId (e.g. route segment), resolve sibling segments to ensure full route telemetry
      if (taskData.parentTaskId && maxDepth > 1) {
        try {
          const parentChildrenRes = await taskService.getTaskChildren(taskData.parentTaskId);
          const siblings = parentChildrenRes?.data?.data || parentChildrenRes?.data || [];
          if (Array.isArray(siblings) && siblings.length > 1) {
            const thisUserId = taskData.assignee?.id || taskData.assignee?._id || taskData.assigneeId || (typeof taskData.assignee === 'string' ? taskData.assignee : null);
            const siblingTasks = siblings.filter(s => {
              if (!(s.id || s._id) || String(s.id || s._id) === String(targetId)) return false;
              if (thisUserId) {
                const sUserId = s.assignee?.id || s.assignee?._id || s.assigneeId || (typeof s.assignee === 'string' ? s.assignee : null);
                if (sUserId && String(sUserId) !== String(thisUserId)) return false;
              }
              return true;
            });
            const siblingResults = await Promise.all(
              siblingTasks.map(sib => {
                const sibId = sib.id || sib._id;
                return sibId ? resolveExecutionData(sibId, 1) : Promise.resolve(null);
              })
            );

            siblingResults.filter(Boolean).forEach(sibNorm => {
              if (sibNorm.shots && sibNorm.shots.length > 0) {
                const mergedShots = [...(normalized.shots || [])];
                const seenShotKeys = new Set(mergedShots.map(s => `${s.serialNo || s.name || ''}_${s.startTime || ''}`));
                sibNorm.shots.forEach(s => {
                  const k = `${s.serialNo || s.name || ''}_${s.startTime || ''}`;
                  if (!seenShotKeys.has(k)) {
                    seenShotKeys.add(k);
                    mergedShots.push(s);
                  }
                });
                normalized.shots = mergedShots;
              }
              if (sibNorm.machineId || sibNorm.machineName) {
                if (!normalized.machineIds) normalized.machineIds = [];
                if (sibNorm.machineId && !normalized.machineIds.includes(sibNorm.machineId)) {
                  normalized.machineIds.push(sibNorm.machineId);
                }
                if (!normalized.machinesList) normalized.machinesList = [];
                if (!normalized.machinesList.some(m => m.machineId === sibNorm.machineId)) {
                  normalized.machinesList.push({
                    machineId: sibNorm.machineId,
                    machineName: sibNorm.machineName,
                    machineModel: sibNorm.machineModel,
                    machineVendor: sibNorm.machineVendor
                  });
                }
              }
              if (sibNorm.pits && sibNorm.pits.length > 0) {
                const mergedPits = [...(normalized.pits || [])];
                const seenPitKeys = new Set(mergedPits.map(p => `${p.serialNo || p.name || ''}_${p.diggingTime || ''}`));
                sibNorm.pits.forEach(p => {
                  const k = `${p.serialNo || p.name || ''}_${p.diggingTime || ''}`;
                  if (!seenPitKeys.has(k)) {
                    seenPitKeys.add(k);
                    mergedPits.push(p);
                  }
                });
                normalized.pits = mergedPits;
              }
              if (sibNorm.depthPoints && sibNorm.depthPoints.length > 0) {
                const mergedDps = [...(normalized.depthPoints || [])];
                sibNorm.depthPoints.forEach(dp => {
                  const k = `${dp.id || ''}_${dp.lat}_${dp.lng}_${dp.capturedAt || ''}`;
                  const existingIdx = mergedDps.findIndex(d => `${d.id || ''}_${d.lat}_${d.lng}_${d.capturedAt || ''}` === k);
                  const sSegName = sibNorm.segmentName || sibNorm.displayName || sibNorm.taskName;
                  const sTaskCode = sibNorm.taskCode || sibNorm.taskId;
                  const sRing = sibNorm.ring || sibNorm.ringId;

                  if (existingIdx !== -1) {
                    if (sSegName && !isMongoHexId(sSegName)) {
                      mergedDps[existingIdx].segmentName = sSegName;
                      mergedDps[existingIdx].taskName = sSegName;
                    }
                    if (sTaskCode && !isMongoHexId(sTaskCode)) {
                      mergedDps[existingIdx].taskCode = sTaskCode;
                      mergedDps[existingIdx].taskId = sTaskCode;
                    }
                    if (sRing) {
                      mergedDps[existingIdx].ring = sRing;
                      mergedDps[existingIdx].ringId = sRing;
                    }
                  } else {
                    if (sSegName && !isMongoHexId(sSegName)) {
                      dp.segmentName = sSegName;
                      dp.taskName = sSegName;
                    }
                    if (sTaskCode && !isMongoHexId(sTaskCode)) {
                      dp.taskCode = sTaskCode;
                      dp.taskId = sTaskCode;
                    }
                    if (sRing) {
                      dp.ring = sRing;
                      dp.ringId = sRing;
                    }
                    mergedDps.push(dp);
                  }
                });
                normalized.depthPoints = mergedDps;
              }
              if (sibNorm.availableDates && sibNorm.availableDates.length > 0) {
                const mergedDates = new Set([...(normalized.availableDates || []), ...sibNorm.availableDates]);
                normalized.availableDates = Array.from(mergedDates).sort();
              }
            });
          }
        } catch (sibErr) {
          console.log(`[HddExecutionMapPage] Sibling resolution error for ${targetId}:`, sibErr);
        }
      }

      return normalized;
    } catch (err) {
      console.error(`[HddExecutionMapPage] Error resolving target ${targetId}:`, err);
      return null;
    }
  };

  // Auto Refresh & Data State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isInitialFitDoneRef = useRef(false);

  const fetchExecutionDetail = async (isInitial = false) => {
    if (!executionId) return;
    if (isInitial || !rawExecutionData) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const mode = searchParams.get('mode');
    const paramUserId = searchParams.get('userId');
    const paramUserName = searchParams.get('userName');
    const paramBlock = searchParams.get('block');
    const paramDistrict = searchParams.get('district');
    const paramState = searchParams.get('state');

    const isBlockMode = mode === 'block' || executionId === 'block';
    const isUserMode = mode === 'user' || Boolean(paramUserId) || Boolean(paramUserName);
    const cleanId = String(executionId || '').replace('_route_', '').split('_')[0];

    try {
      if (isBlockMode) {
        const blkParams = {
          task_type: 'FIBER_TRENCHING_DUCTING_TASK',
          page: 0,
          size: 50
        };
        if (paramState && paramState !== 'all') blkParams.state = paramState;
        if (paramDistrict && paramDistrict !== 'all' && paramDistrict !== 'OTHER') blkParams.district = paramDistrict;
        if (paramBlock && paramBlock !== 'all' && paramBlock !== 'OTHER') blkParams.block = paramBlock;

        const res = await taskService.getMapViewExecutions(blkParams);
        const resData = res?.data?.data || res?.data || res;
        let tasks = resData?.results || resData?.content || (Array.isArray(resData) ? resData : []);

        if (!tasks || tasks.length === 0) {
          setError('No execution data found for this block.');
          setLoading(false);
          setIsRefreshing(false);
          return;
        }

        const mergedBlock = mergeMultipleTasksExecution(tasks, selectedDate || dateParam, {
          mode: 'block',
          block: paramBlock,
          district: paramDistrict,
          state: paramState
        });

        if (!mergedBlock || ((mergedBlock.shots || []).length === 0 && (mergedBlock.pits || []).length === 0 && (mergedBlock.depthPoints || []).length === 0)) {
          setError('No execution data found for this block.');
          setLoading(false);
          setIsRefreshing(false);
          return;
        }

        setRawExecutionData(mergedBlock);

        let activeDate = dateParam || selectedDate;
        if (!activeDate && mergedBlock.availableDates && mergedBlock.availableDates.length > 0) {
          activeDate = mergedBlock.availableDates[mergedBlock.availableDates.length - 1];
        }
        if (!activeDate) {
          activeDate = new Date().toISOString().split('T')[0];
        }
        setSelectedDate(activeDate);

        const dateFiltered = filterHddExecutionByDate(mergedBlock, activeDate);
        const fullyResolved = await resolvePhotoUrlsForExecution(dateFiltered);
        setExecutionData(fullyResolved);

        const now = new Date();
        setLastUpdated(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase());
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (isUserMode) {
        const targetUserId = paramUserId || paramUserName;
        const userParams = {
          task_type: 'FIBER_TRENCHING_DUCTING_TASK',
          page: 0,
          size: 50,
          userId: targetUserId
        };
        if (paramState && paramState !== 'all') userParams.state = paramState;
        if (paramDistrict && paramDistrict !== 'all' && paramDistrict !== 'OTHER') userParams.district = paramDistrict;
        if (paramBlock && paramBlock !== 'all' && paramBlock !== 'OTHER') userParams.block = paramBlock;

        const res = await taskService.getMapViewExecutions(userParams);
        const resData = res?.data?.data || res?.data || res;
        let tasks = resData?.results || resData?.content || (Array.isArray(resData) ? resData : []);

        // If block parameter was overly restrictive or caused 0 results, retry without block
        if ((!tasks || tasks.length === 0) && userParams.block) {
          const { block, ...relaxedParams } = userParams;
          const retryRes = await taskService.getMapViewExecutions(relaxedParams);
          const rData = retryRes?.data?.data || retryRes?.data || retryRes;
          const rTasks = rData?.results || rData?.content || (Array.isArray(rData) ? rData : []);
          if (rTasks && rTasks.length > 0) {
            tasks = rTasks;
          }
        }

        // If still 0 tasks and cleanId is a valid task ID, try resolving the specific task
        if ((!tasks || tasks.length === 0) && cleanId && cleanId !== 'block' && cleanId !== 'user') {
          const directTask = await resolveExecutionData(cleanId);
          if (directTask && (directTask.shots?.length || directTask.pits?.length || directTask.depthPoints?.length)) {
            tasks = [directTask];
          }
        }

        if (!tasks || tasks.length === 0) {
          setError('No execution data found for this user.');
          setLoading(false);
          setIsRefreshing(false);
          return;
        }

        const mergedUser = mergeMultipleTasksExecution(tasks, selectedDate || dateParam, {
          mode: 'user',
          userId: targetUserId,
          userName: paramUserName,
          block: paramBlock,
          district: paramDistrict,
          state: paramState
        });

        if (!mergedUser || ((mergedUser.shots || []).length === 0 && (mergedUser.pits || []).length === 0 && (mergedUser.depthPoints || []).length === 0)) {
          setError('No execution data found for this user.');
          setLoading(false);
          setIsRefreshing(false);
          return;
        }

        setRawExecutionData(mergedUser);

        let activeDate = dateParam || selectedDate;
        if (!activeDate && mergedUser.availableDates && mergedUser.availableDates.length > 0) {
          activeDate = mergedUser.availableDates[mergedUser.availableDates.length - 1];
        }
        if (!activeDate) {
          activeDate = new Date().toISOString().split('T')[0];
        }
        setSelectedDate(activeDate);

        const dateFiltered = filterHddExecutionByDate(mergedUser, activeDate);
        const fullyResolved = await resolvePhotoUrlsForExecution(dateFiltered);
        setExecutionData(fullyResolved);

        const now = new Date();
        setLastUpdated(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase());
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Fallback: direct task ID resolution
      const rawResult = await resolveExecutionData(cleanId);
      if (!rawResult) {
        setError(`Execution ID "${executionId}" not found.`);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      setRawExecutionData(rawResult);

      let activeDate = dateParam || selectedDate;
      if (!activeDate && rawResult.availableDates && rawResult.availableDates.length > 0) {
        activeDate = rawResult.availableDates[rawResult.availableDates.length - 1];
      }
      if (!activeDate) {
        activeDate = new Date().toISOString().split('T')[0];
      }

      setSelectedDate(activeDate);

      const dateFiltered = filterHddExecutionByDate(rawResult, activeDate);
      const fullyResolved = await resolvePhotoUrlsForExecution(dateFiltered);
      setExecutionData(fullyResolved);

      const now = new Date();
      setLastUpdated(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase());
    } catch (err) {
      console.error('[HddExecutionMapPage] Error loading execution detail:', err);
      setError(err?.message || (isBlockMode ? 'Failed to load block execution map.' : 'Failed to load user execution map.'));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    isInitialFitDoneRef.current = false;
    setRawExecutionData(null);
    setExecutionData(null);
    setError(null);
    fetchExecutionDetail(true);
  }, [
    executionId,
    searchParams.get('userId'),
    searchParams.get('userName'),
    searchParams.get('mode'),
    searchParams.get('block'),
    searchParams.get('district')
  ]);

  // Handle Date Change
  const handleDateChange = async (newDate) => {
    setSelectedDate(newDate);
    isInitialFitDoneRef.current = false;
    const nextParams = new URLSearchParams(searchParams);
    if (newDate) {
      nextParams.set('date', newDate);
    } else {
      nextParams.delete('date');
    }
    setSearchParams(nextParams, { replace: true });

    if (rawExecutionData) {
      const dateFiltered = filterHddExecutionByDate(rawExecutionData, newDate);
      const fullyResolved = await resolvePhotoUrlsForExecution(dateFiltered);
      setExecutionData(fullyResolved);
    }
  };


  // Leaflet Cleanup on Unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) { }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const openLightbox = (photos, index = 0) => {
    if (!photos || photos.length === 0) return;
    setLightboxPhotos(photos);
    setLightboxIndex(index);
  };

  // Leaflet Map Initialization & Rendering
  useEffect(() => {
    if (viewMode !== '2d') {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (e) { /* ignore */ }
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
        pitLayerRef.current = null;
        depthLayerRef.current = null;
        tileLayerRef.current = null;
        measureLayerRef.current = null;
        scaleControlRef.current = null;
        isInitialFitDoneRef.current = false;
      }
      return;
    }
    if (!mapContainerRef.current || !executionData) return;

    if (mapInstanceRef.current) {
      try {
        const container = mapInstanceRef.current.getContainer();
        if (!container || !document.body.contains(container)) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      } catch (e) {
        mapInstanceRef.current = null;
      }
    }

    if (!mapInstanceRef.current) {
      const defaultCenter = [29.841128, 73.536244];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        maxZoom: 20,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
      layerGroupRef.current = L.featureGroup().addTo(map);
      pitLayerRef.current = L.featureGroup().addTo(map);
      depthLayerRef.current = L.featureGroup().addTo(map);
      plannerLayerRef.current = L.featureGroup().addTo(map);
      measureLayerRef.current = L.featureGroup().addTo(map);
    }

    if (Array.isArray(activePlansList) && activePlansList.length > 0 && mapInstanceRef.current) {
      activePlansList.forEach((plan) => {
        if (!plan || !plan.visible) return;
        let fg = plannerLayerGroupsRef.current.get(plan.planId);
        if (!fg || !mapInstanceRef.current.hasLayer(fg)) {
          fg = L.featureGroup().addTo(mapInstanceRef.current);
          plannerLayerGroupsRef.current.set(plan.planId, fg);
          renderPlannerLayersOnLeaflet(
            fg,
            plan.paths,
            plan.nodes,
            {
              routeColor: plan.color?.stroke || '#0284c7',
              nodeColor: plan.color?.node || '#0369a1',
              planName: plan.planName,
              clear: true
            }
          );
        }
      });
      if (layerGroupRef.current) layerGroupRef.current.bringToFront();
      if (pitLayerRef.current) pitLayerRef.current.bringToFront();
      if (depthLayerRef.current) depthLayerRef.current.bringToFront();
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    // Handle Tile Layers (Street vs Satellite)
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    if (mapType === 'satellite') {
      tileLayerRef.current = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      }).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      }).addTo(map);
    }

    // Clear previous markers & polylines
    layerGroup.clearLayers();

    if (!pitLayerRef.current) {
      pitLayerRef.current = L.featureGroup().addTo(map);
    }
    if (!depthLayerRef.current) {
      depthLayerRef.current = L.featureGroup().addTo(map);
    }

    const allBounds = [];
    const frameBounds = [];

    const taskCodeForMedia = [executionData.taskCode, executionData.taskId].find(v => v && !isMongoHexId(v)) || '';
    const taskNameForMedia = [executionData.displayName, executionData.taskName].find(v => v && !isMongoHexId(v)) || '';
    const ringForMedia = [executionData.ring, executionData.ringId, executionData.ringCode].find(v => v && !isMongoHexId(v)) || '';

    // Build complete list of all depth photos for sequential lightbox navigation
    const allDepthPhotos = (executionData.depthPoints || []).map((dp, idx) => {
      const dpPhotos = dp.photos || [];
      const photoObj = dpPhotos[0] || {};
      const imgUrl = photoObj.photoUrl || (dp.photo && (dp.photo.photoUrl || dp.photo.url)) || photoObj.key || null;
      const dpId = dp.id || `ASH-DPT${String(dp.pointNo || idx + 1).padStart(8, '0')}`;

      const urlMatch = imgUrl ? String(imgUrl).match(/surveys\/([0-9a-fA-F]{24})\//) : null;
      const urlMeta = urlMatch ? segmentMetaCache.get(urlMatch[1]) : null;

      const photoCode = (dp.taskCode && !isMongoHexId(dp.taskCode))
        ? dp.taskCode
        : (urlMeta?.taskCode || (photoObj.taskCode && !isMongoHexId(photoObj.taskCode) ? photoObj.taskCode : taskCodeForMedia));

      const photoName = (dp.segmentName && !isMongoHexId(dp.segmentName))
        ? dp.segmentName
        : (urlMeta?.segmentName || ((dp.taskName && !isMongoHexId(dp.taskName)) ? dp.taskName : (photoObj.segmentName || photoObj.taskName || taskNameForMedia)));

      const photoRing = (dp.ring && !isMongoHexId(dp.ring))
        ? dp.ring
        : (urlMeta?.ring || dp.ringId || ringForMedia || '');

      return {
        id: dpId,
        key: photoObj.key || imgUrl,
        photoUrl: imgUrl,
        url: imgUrl,
        src: imgUrl,
        label: dpId.startsWith('Depth Point') ? dpId : `Depth Point ${dpId}`,
        title: dpId.startsWith('Depth Point') ? dpId : `Depth Point ${dpId}`,
        taskId: photoCode,
        taskCode: photoCode,
        taskName: photoName,
        segmentName: photoName,
        ring: photoRing,
        ringId: photoRing,
        depth: dp.depth,
        capturedAt: dp.capturedAt,
        latitude: dp.lat,
        longitude: dp.lng,
        accuracy: dp.accuracy ?? photoObj.accuracy ?? dp.photo?.accuracy ?? dp.depthoMeterImage?.accuracy ?? dp.gpsAccuracy ?? photoObj.gpsAccuracy ?? dp.gps_accuracy ?? photoObj.gps_accuracy ?? dp.accuracyMeters ?? photoObj.accuracyMeters ?? null,
        altitude: dp.altitude ?? photoObj.altitude ?? dp.photo?.altitude ?? dp.depthoMeterImage?.altitude ?? dp.alt ?? photoObj.alt ?? null,
        pointNo: dp.pointNo || idx + 1
      };
    });

    const startPitIds = new Set();
    const endPitIds = new Set();
    (executionData.shots || []).forEach((shot) => {
      if (shot.startPit?.id) startPitIds.add(shot.startPit.id);
      if (shot.startPit?.name) startPitIds.add(shot.startPit.name);
      if (shot.endPit?.id) endPitIds.add(shot.endPit.id);
      if (shot.endPit?.name) endPitIds.add(shot.endPit.name);
    });

    const statusUpper = String(executionData.status || executionData.taskStatus || '').toUpperCase();
    const isOngoing = statusUpper.includes('PROGRESS') ||
      statusUpper.includes('RUNNING') ||
      statusUpper.includes('EXECUTION') ||
      statusUpper.includes('ACTIVE') ||
      statusUpper.includes('STARTED') ||
      (executionData.depthPoints?.length > 0 && selectedDate === executionData.availableDates?.[executionData.availableDates.length - 1]);

    // 1. Trench path — soft halo so the chain reads on satellite
    (executionData.shots || []).forEach((shot, sIdx) => {
      const cleanShotId = String(shot.id || `shot_${sIdx}`).replace(/[^a-zA-Z0-9]/g, '_');
      window[`__openTrenchLightbox_${cleanShotId}`] = () => {
        if (shot.photos && shot.photos.length > 0) {
          const enrichedShotPhotos = shot.photos.map(ph => {
            const photoCode = (ph.taskCode && !isMongoHexId(ph.taskCode)) ? ph.taskCode : taskCodeForMedia;
            const photoName = (ph.taskName && !isMongoHexId(ph.taskName)) ? ph.taskName : taskNameForMedia;
            return {
              ...ph,
              label: ph.label || `Trench Shot ${shot.name || shot.id}`,
              title: ph.title || `Trench Shot ${shot.name || shot.id}`,
              taskId: photoCode,
              taskCode: photoCode,
              taskName: photoName,
              depth: shot.depth,
              accuracy: ph.accuracy ?? null,
              altitude: ph.altitude ?? null,
            };
          });
          openLightbox(enrichedShotPhotos, 0);
        }
      };

      if (shot.route && shot.route.length > 1) {
        L.polyline(shot.route, {
          color: '#ffffff',
          weight: 8,
          opacity: 0.62,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        }).addTo(layerGroup);

        const line = L.polyline(shot.route, {
          color: '#0284c7',
          weight: 3.5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(layerGroup);

        shot.route.forEach((pt) => {
          allBounds.push(pt);
          frameBounds.push(pt);
        });

        const popupContent = gisPopupHtml({
          eyebrow: 'Trench',
          title: shot.serialNo || shot.id || 'Trench',
          rows: [
            ['Start', shot.startPit?.name || '—'],
            ['End', shot.endPit?.name || '—'],
            ['Avg depth', formatDepthM(shot.depth)],
            ['Length', shot.formattedLength],
            ['Captures', shot.depthReadingsCount],
            ['Strata', shot.strataType],
          ],
          actionLabel: shot.photos?.length ? `View media (${shot.photos.length})` : '',
        });

        line.bindPopup(popupContent, { maxWidth: 260, className: 'gis-popup' });
        if (shot.photos?.length) {
          line.on('popupopen', (e) => {
            const btn = e.popup.getElement()?.querySelector('.gis-popup-btn');
            if (btn) btn.onclick = () => window[`__openTrenchLightbox_${cleanShotId}`]();
          });
        }
      }
    });

    // 2. Identify users and live pits/depths
    const pits = getVisiblePitsForMap(executionData);
    const depthPoints = executionData.depthPoints || [];

    pits.forEach((pit) => {
      if (pit.lat != null && pit.lng != null) {
        const pt = [pit.lat, pit.lng];
        allBounds.push(pt);
        frameBounds.push(pt);
      }
    });

    depthPoints.forEach((dp) => {
      if (dp.lat != null && dp.lng != null) allBounds.push([dp.lat, dp.lng]);
    });

    // Identify users who have depth points vs users who only have pits
    const usersWithDepths = new Set(depthPoints.map(dp => String(dp.userId || dp.user || '').trim().toLowerCase()).filter(Boolean));
    const userLatestPitMap = new Map();

    pits.forEach((pit, pIdx) => {
      const uKey = String(pit.userId || pit.user || '').trim().toLowerCase();
      if (uKey && !usersWithDepths.has(uKey)) {
        const pTime = parseAnyDate(pit.diggingTime || pit.createdAt);
        const t = pTime ? pTime.getTime() : pIdx;
        if (!userLatestPitMap.has(uKey) || t >= userLatestPitMap.get(uKey).time) {
          userLatestPitMap.set(uKey, { pitId: String(pit.id || pit.serialNo || pit.name), time: t });
        }
      }
    });
    const livePitIds = new Set(Array.from(userLatestPitMap.values()).map(v => v.pitId));

    // Determine latest capture index FOR EACH USER!
    const liveIndicesSet = new Set();
    const userLatestMap = new Map();

    depthPoints.forEach((dp, idx) => {
      const uKey = String(dp.userId || dp.user || 'default').trim().toLowerCase();
      const capTime = parseAnyDate(dp.capturedAt || dp.createdAt);
      const t = capTime ? capTime.getTime() : idx;

      if (!userLatestMap.has(uKey)) {
        userLatestMap.set(uKey, { idx, time: t });
      } else {
        const current = userLatestMap.get(uKey);
        if (t >= current.time) {
          userLatestMap.set(uKey, { idx, time: t });
        }
      }
    });

    userLatestMap.forEach(({ idx }) => {
      liveIndicesSet.add(idx);
    });
    const lastDepthIdx = depthPoints.length - 1;
    if (lastDepthIdx >= 0) {
      liveIndicesSet.add(lastDepthIdx);
    }

    const bindDepthMarkerEvents = (m, dp, idx) => {
      let dateStr = '';
      if (dp.capturedAt) {
        try {
          const d = parseAnyDate(dp.capturedAt) || new Date(dp.capturedAt);
          if (d && !isNaN(d.getTime())) {
            const parts = new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }).formatToParts(d);
            const day = parts.find(p => p.type === 'day')?.value || '';
            let month = parts.find(p => p.type === 'month')?.value || '';
            if (month === 'Sep') month = 'Sept';
            const hour = parts.find(p => p.type === 'hour')?.value || '';
            const minute = parts.find(p => p.type === 'minute')?.value || '';
            const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value || '').toLowerCase();
            dateStr = `${day} ${month}, ${hour}:${minute} ${dayPeriod}`;
          }
        } catch (e) { /* ignore */ }
      }

      const parsedDepth = parseFloat(String(dp.depth ?? ''));
      const isBelowThreshold = !isNaN(parsedDepth) && parsedDepth < 1.65;

      const tooltipText = [
        formatDepthM(dp.depth) + (isBelowThreshold ? ' (Below 1.65m)' : ''),
        dateStr
      ].filter(Boolean).join(' · ');

      m.bindTooltip(tooltipText, {
        direction: 'top',
        offset: [0, -26],
        className: isBelowThreshold ? 'gis-tip gis-tip--below-threshold' : 'gis-tip',
        opacity: 1,
      });

      if (allDepthPhotos.length > 0) {
        m.on('click', () => openLightbox(allDepthPhotos, idx));
      }
    };

    const paintAllMarkers = () => {
      const map = mapInstanceRef.current;
      const depthLayer = depthLayerRef.current;
      const pitLayer = pitLayerRef.current;
      if (!map || !depthLayer || !pitLayer) return;

      depthLayer.clearLayers();
      pitLayer.clearLayers();

      const z = map.getZoom();
      const bounds = map.getBounds().pad(0.3); // 30% viewport buffer for smooth panning

      // Screen positions of all placed pins and badges
      const placedPinPixels = [];
      const placedBadgeBoxes = [];

      const canPlaceBadgeBox = (box) => {
        for (let i = 0; i < placedBadgeBoxes.length; i++) {
          const b = placedBadgeBoxes[i];
          if (box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1) {
            return false;
          }
        }
        return true;
      };

      const getBadgeBox = (pt, pos = 'top') => {
        const w = 76;
        const h = 28;
        if (pos === 'bottom') {
          return { x1: pt.x - w / 2, x2: pt.x + w / 2, y1: pt.y + 4, y2: pt.y + 4 + h };
        }
        if (pos === 'right') {
          return { x1: pt.x + 8, x2: pt.x + 8 + w, y1: pt.y - h / 2, y2: pt.y + h / 2 };
        }
        if (pos === 'left') {
          return { x1: pt.x - 8 - w, x2: pt.x - 8, y1: pt.y - h / 2, y2: pt.y + h / 2 };
        }
        return { x1: pt.x - w / 2, x2: pt.x + w / 2, y1: pt.y - 4 - h, y2: pt.y - 4 };
      };

      // 1. Pits Rendering with Decluttering & Viewport Culling
      pits.forEach((pit) => {
        if (pit.lat == null || pit.lng == null) return;
        const ptCoords = [pit.lat, pit.lng];
        if (!bounds.contains(ptCoords)) return;

        const isLivePit = livePitIds.has(String(pit.id)) || livePitIds.has(String(pit.serialNo)) || livePitIds.has(String(pit.name));
        const isStartPit = startPitIds.has(String(pit.id)) || startPitIds.has(String(pit.name));
        const isEndPit = endPitIds.has(String(pit.id)) || endPitIds.has(String(pit.name));
        const isKeyPit = isLivePit || isStartPit || isEndPit;

        // In overview zooms (z < 14.2), only show key pits to prevent orange clutter
        if (!isKeyPit && z < 14.2) return;

        let ptPx;
        try {
          ptPx = map.latLngToContainerPoint(ptCoords);
        } catch (e) {
          return;
        }

        // Distance check for intermediate pits (must be at least 26px from any placed pin)
        if (!isKeyPit) {
          const tooClose = placedPinPixels.some((p) => Math.hypot(ptPx.x - p.x, ptPx.y - p.y) < 26);
          if (tooClose) return;
        }

        placedPinPixels.push(ptPx);

        const pitPhotosList = (pit.photos && pit.photos.length > 0) ? pit.photos.map(ph => {
          const photoCode = (ph.taskCode && !isMongoHexId(ph.taskCode)) ? ph.taskCode : taskCodeForMedia;
          const photoName = (ph.taskName && !isMongoHexId(ph.taskName)) ? ph.taskName : taskNameForMedia;
          return {
            ...ph,
            label: ph.label || `Pit ${pit.name || pit.id}`,
            title: ph.title || `Pit ${pit.name || pit.id}`,
            taskId: photoCode,
            taskCode: photoCode,
            taskName: photoName,
            depth: pit.depth,
            latitude: pit.lat,
            longitude: pit.lng,
            isPitPhoto: true,
            side: pit.side || ph.side || 'Left (LHS)',
            pitSide: pit.side || ph.pitSide || ph.side || 'Left (LHS)'
          };
        }) : [];
        const pitName = pit.name || pit.id || 'Pit';
        const depthStr = pit.depth != null ? formatDepthM(pit.depth) : '';
        const role = 'mid';

        const tooltipText = [depthStr, pitName].filter(Boolean).join(' · ');

        const m = L.marker(ptCoords, {
          icon: pitIcon({ role: 'mid', name: pitName, depth: pit.depth, showLabel: false, isLive: false }),
          zIndexOffset: isLivePit ? 550 : (isKeyPit ? 480 : 420)
        });

        m.bindTooltip(tooltipText, {
          direction: 'top',
          offset: [0, -28],
          className: 'gis-tip',
          opacity: 1
        });

        if (pitPhotosList.length > 0) {
          m.on('click', () => openLightbox(pitPhotosList, 0));
        } else {
          m.bindPopup(gisPopupHtml({
            eyebrow: isLivePit ? 'Live Pit' : 'Pit',
            title: pitName,
            rows: [
              ['Depth', pit.depth != null ? formatDepthM(pit.depth) : '—'],
              ['Width', pit.width != null ? `${Number(pit.width).toFixed(2)}m` : '—'],
              ['Side', pit.side],
              ['Type', pit.type],
              ['Time', pit.diggingTime],
            ],
          }), { maxWidth: 260, className: 'gis-popup' });
        }

        pitLayer.addLayer(m);
      });

      // 2. Depth Points with Viewport Culling & Adaptive Stride
      const visibleDps = [];
      for (let i = 0; i < depthPoints.length; i++) {
        const dp = depthPoints[i];
        if (dp.lat == null || dp.lng == null) continue;
        if (bounds.contains([dp.lat, dp.lng])) {
          visibleDps.push({ dp, idx: i });
        }
      }

      // Adaptive Stride: Cap maximum DOM markers in the viewport to ~130 to guarantee 60fps
      const MAX_VIEWPORT_MARKERS = 130;
      let step = 1;
      if (visibleDps.length > MAX_VIEWPORT_MARKERS) {
        step = Math.ceil(visibleDps.length / MAX_VIEWPORT_MARKERS);
      }

      const size = depthDotSize(z);
      const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

      const livePoints = [];
      const candidatePoints = [];

      visibleDps.forEach((item) => {
        if (liveIndicesSet.has(item.idx)) {
          livePoints.push(item);
        } else {
          candidatePoints.push(item);
        }
      });

      // Priority 1: Render All Active Live Points in Viewport
      livePoints.forEach(({ dp, idx }) => {
        let ptPx;
        try {
          ptPx = map.latLngToContainerPoint([dp.lat, dp.lng]);
        } catch (e) {
          return;
        }

        placedPinPixels.push(ptPx);

        // Find non-overlapping badge position: top -> bottom -> right -> left
        let badgePos = 'top';
        const boxTop = getBadgeBox(ptPx, 'top');
        if (canPlaceBadgeBox(boxTop)) {
          badgePos = 'top';
          placedBadgeBoxes.push(boxTop);
        } else {
          const boxBottom = getBadgeBox(ptPx, 'bottom');
          if (canPlaceBadgeBox(boxBottom)) {
            badgePos = 'bottom';
            placedBadgeBoxes.push(boxBottom);
          } else {
            const boxRight = getBadgeBox(ptPx, 'right');
            if (canPlaceBadgeBox(boxRight)) {
              badgePos = 'right';
              placedBadgeBoxes.push(boxRight);
            } else {
              placedBadgeBoxes.push(boxTop);
            }
          }
        }

        let isStale = false;
        const capTime = parseAnyDate(dp.capturedAt || dp.createdAt);
        if (capTime && !isNaN(capTime.getTime())) {
          isStale = (Date.now() - capTime.getTime()) > SIX_HOURS_MS;
        } else {
          const execTime = parseAnyDate(executionData?.lastModified || executionData?.updatedAt);
          if (execTime && !isNaN(execTime.getTime())) {
            isStale = (Date.now() - execTime.getTime()) > SIX_HOURS_MS;
          }
        }

        const m = L.marker([dp.lat, dp.lng], {
          icon: depthPointIcon({
            depth: dp.depth,
            size,
            showLabel: true,
            isKey: true,
            isLive: true,
            isStale,
            side: idx % 2 === 0 ? 'right' : 'left',
            badgePosition: badgePos,
          }),
          zIndexOffset: 700,
        });

        bindDepthMarkerEvents(m, dp, idx);
        depthLayer.addLayer(m);
      });

      // Priority 2: Intermediate Sampled Points
      candidatePoints.forEach(({ dp, idx }) => {
        const isFirst = idx === 0;
        if (!isFirst && idx % step !== 0) return;

        let ptPx;
        try {
          ptPx = map.latLngToContainerPoint([dp.lat, dp.lng]);
        } catch (e) {
          return;
        }

        // Screen distance check: must be at least 22px away from any placed pin
        const tooClose = placedPinPixels.some((p) => Math.hypot(ptPx.x - p.x, ptPx.y - p.y) < 22);
        if (tooClose && !isFirst) return;

        placedPinPixels.push(ptPx);

        // Do not show static depth badge by default on depth points.
        // It becomes visible when cursor goes there (hover), as requested by user.
        const m = L.marker([dp.lat, dp.lng], {
          icon: depthPointIcon({
            depth: dp.depth,
            size,
            showLabel: false,
            isKey: isFirst,
            isLive: false,
            side: idx % 2 === 0 ? 'right' : 'left',
            badgePosition: 'top',
          }),
          zIndexOffset: isFirst ? 500 : 250,
        });

        bindDepthMarkerEvents(m, dp, idx);
        depthLayer.addLayer(m);
      });

      applyGisZoomLabels(map);
    };

    let paintTimer = null;
    const schedulePaint = (delay = 45) => {
      if (paintTimer) clearTimeout(paintTimer);
      paintTimer = setTimeout(() => {
        if (!mapInstanceRef.current) return;
        requestAnimationFrame(paintAllMarkers);
      }, delay);
    };

    if (map.__gisSchedulePaint) {
      map.off('zoomend', map.__gisSchedulePaint);
      map.off('moveend', map.__gisSchedulePaint);
    }
    map.__gisSchedulePaint = () => schedulePaint(45);
    map.on('zoomend', map.__gisSchedulePaint);
    map.on('moveend', map.__gisSchedulePaint);
    paintAllMarkers();

    if (layerGroupRef.current) layerGroupRef.current.bringToBack();
    if (pitLayerRef.current) pitLayerRef.current.bringToFront();
    if (depthLayerRef.current) depthLayerRef.current.bringToFront();
    if (machineLayerRef.current) machineLayerRef.current.bringToFront();

    // Frame the trench on first load — overview, then zoom in for depths
    if (!isInitialFitDoneRef.current) {
      const fit = frameBounds.length ? frameBounds : allBounds;
      if (fit.length > 1) {
        map.fitBounds(fit, { padding: [80, 96], maxZoom: 16, animate: false });
      } else if (fit.length === 1) {
        map.setView(fit[0], 16);
      }
      isInitialFitDoneRef.current = true;
      schedulePaint(30);
    }

    setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.invalidateSize();
        } catch (e) { }
      }
    }, 150);
  }, [executionData, mapType, selectedDate, viewMode]);

  // Paint Live Machines on Leaflet Map (ONLY machines belonging to this user / block)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (!machineLayerRef.current) {
      machineLayerRef.current = L.featureGroup().addTo(mapInstanceRef.current);
    }
    const layer = machineLayerRef.current;
    layer.clearLayers();

    if (isBharatNetMap || !showLiveMachines || !userFilteredMachines || userFilteredMachines.length === 0) return;

    userFilteredMachines.forEach((m) => {
      const lat = parseFloat(m.latitude);
      const lng = parseFloat(m.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const course = m.course_deg ?? m.heading ?? m.tilt ?? 0;
      const status = (m.status || 'RUNNING').toUpperCase();
      const name = m.name || m.model_name || `HDD ${m.id}`;

      const icon = L.divIcon({
        className: 'live-machine-leaflet-marker',
        html: buildMachineMarkerHtml(course, status, name, true),
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22],
      });

      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: 1500,
      });

      const popupHtml = `
        <div style="font-family: inherit; min-width: 250px; max-width: 300px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="font-size: 0.95rem; font-weight: 700; color: #0f172a;">
              ${name}
            </div>
            <span style="background: ${status === 'RUNNING' ? '#059669' : '#d97706'}; color: #fff; padding: 2px 7px; border-radius: 999px; font-size: 0.7rem; font-weight: 700;">
              ${status}
            </span>
          </div>
          <div style="font-size: 0.75rem; color: #64748b; margin: 2px 0 8px;">
            Chassis <strong style="color: #334155">${m.chassis_no || m.machine_chassis_no || m.serial_number || '—'}</strong>
            <span style="margin-left: 6px; color: #0284c7; font-weight: 700;">● Assigned machine</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px;">
            <span style="background: #f1f5f9; color: #334155; padding: 2px 7px; border-radius: 999px; font-size: 0.7rem; font-weight: 600;">
              Speed: ${Number(m.speed || 0).toFixed(1)} km/h
            </span>
            <span style="background: #eff6ff; color: #1d4ed8; padding: 2px 7px; border-radius: 999px; font-size: 0.7rem; font-weight: 600;">
              Heading: ${Number(course).toFixed(0)}° ${m.heading_label || ''}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px 8px; font-size: 0.75rem; color: #475569; line-height: 1.35;">
            <div>Lat: <strong style="color: #0f172a">${lat.toFixed(6)}</strong></div>
            <div>Lng: <strong style="color: #0f172a">${lng.toFixed(6)}</strong></div>
            <div>Fuel: <strong style="color: #0f172a">${m.fuel_level != null ? `${Number(m.fuel_level).toFixed(1)} L` : '—'}</strong></div>
            <div>Fuel %: <strong style="color: #0f172a">${m.fuel_percentage != null ? `${m.fuel_percentage}%` : '—'}</strong></div>
            <div>RPM: <strong style="color: #0f172a">${m.rpm || 0}</strong></div>
            <div>Coolant: <strong style="color: #0f172a">${m.coolant_temp ? `${Number(m.coolant_temp).toFixed(1)}°C` : '—'}</strong></div>
          </div>
          ${m.operator_name ? `<div style="margin-top: 6px; font-size: 0.72rem; color: #64748b;">Operator: <strong style="color: #334155">${m.operator_name}</strong></div>` : ''}
          <button id="btn-inspect-live-m-${m.id}" style="
            margin-top: 10px;
            width: 100%;
            background: #0f172a;
            color: #ffffff;
            border: none;
            padding: 7px 12px;
            border-radius: 6px;
            font-size: 0.78rem;
            font-weight: 600;
            cursor: pointer;
          ">
            Inspect Machine Dashboard →
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 300, className: 'gis-popup' });
      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-inspect-live-m-${m.id}`);
        if (btn) {
          btn.onclick = () => window.open(`/machines/${m.id}`, '_blank');
        }
      });

      layer.addLayer(marker);
    });

    layer.bringToFront();
  }, [isBharatNetMap, userFilteredMachines, showLiveMachines]);

  // Interactive Measurement Ruler Map Click & Move Listener
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!isMeasuring) {
      if (mapContainerRef.current) {
        mapContainerRef.current.style.cursor = '';
      }
      if (rubberBandLineRef.current) {
        try { map.removeLayer(rubberBandLineRef.current); } catch (e) { }
        rubberBandLineRef.current = null;
      }
      return;
    }

    if (mapContainerRef.current) {
      mapContainerRef.current.style.cursor = 'crosshair';
    }

    const onMapClick = (e) => {
      const latlng = e.latlng;
      if (!latlng) return;

      if (!measureLayerRef.current) {
        measureLayerRef.current = L.featureGroup().addTo(map);
      }
      const layer = measureLayerRef.current;

      setMeasurePoints((prev) => {
        const newPts = [...prev, latlng];
        let cumDist = 0;
        for (let i = 1; i < newPts.length; i++) {
          cumDist += newPts[i - 1].distanceTo(newPts[i]);
        }
        setMeasureTotalDist(cumDist);

        const ptIdx = newPts.length;
        const formattedDist = cumDist >= 1000 ? `${(cumDist / 1000).toFixed(2)} km` : `${cumDist.toFixed(1)} m`;

        // Circle marker for point
        const marker = L.circleMarker(latlng, {
          radius: 6,
          color: '#ffffff',
          weight: 2.5,
          fillColor: ptIdx === 1 ? '#10b981' : '#38bdf8',
          fillOpacity: 1,
          zIndexOffset: 3000
        });

        const labelText = ptIdx === 1 ? 'Start' : formattedDist;
        marker.bindTooltip(labelText, {
          permanent: true,
          direction: 'top',
          offset: [0, -10],
          className: 'gis-ruler-tooltip'
        });
        layer.addLayer(marker);

        // Connect previous point to this point
        if (newPts.length >= 2) {
          const prevPt = newPts[newPts.length - 2];
          const segDist = prevPt.distanceTo(latlng);
          const segFormatted = segDist >= 1000 ? `${(segDist / 1000).toFixed(2)} km` : `${segDist.toFixed(1)} m`;

          const line = L.polyline([prevPt, latlng], {
            color: '#38bdf8',
            weight: 3.5,
            dashArray: '6, 6',
            opacity: 0.95,
            zIndexOffset: 2500
          });
          layer.addLayer(line);

          // Midpoint distance badge
          const midLat = (prevPt.lat + latlng.lat) / 2;
          const midLng = (prevPt.lng + latlng.lng) / 2;
          const midMarker = L.circleMarker([midLat, midLng], {
            radius: 0.1,
            opacity: 0,
            fillOpacity: 0
          });
          midMarker.bindTooltip(`+${segFormatted}`, {
            permanent: true,
            direction: 'center',
            className: 'gis-ruler-seg-tooltip'
          });
          layer.addLayer(midMarker);
        }

        layer.bringToFront();
        return newPts;
      });
    };

    const onMouseMove = (e) => {
      if (measurePoints.length === 0) return;
      const lastPt = measurePoints[measurePoints.length - 1];
      const currentLatLng = e.latlng;
      if (!lastPt || !currentLatLng) return;

      if (!rubberBandLineRef.current) {
        rubberBandLineRef.current = L.polyline([lastPt, currentLatLng], {
          color: '#f59e0b',
          weight: 2.5,
          dashArray: '4, 6',
          opacity: 0.85
        }).addTo(map);
      } else {
        rubberBandLineRef.current.setLatLngs([lastPt, currentLatLng]);
      }
    };

    map.on('click', onMapClick);
    map.on('mousemove', onMouseMove);

    return () => {
      map.off('click', onMapClick);
      map.off('mousemove', onMouseMove);
    };
  }, [isMeasuring, measurePoints]);

  const closeMap = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/map-view/trenching');
  };

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const fitRouteBounds = () => {
    if (viewMode === '3d') {
      setFitNonce((n) => n + 1);
      return;
    }
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const groups = [layerGroupRef.current, pitLayerRef.current, depthLayerRef.current].filter(Boolean);
    const bounds = groups.reduce((acc, group) => {
      const next = group.getBounds();
      if (!next.isValid()) return acc;
      return acc ? acc.extend(next) : next;
    }, null);
    if (bounds?.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [80, 96], maxZoom: 16 });
    }
  };

  if (loading) {
    return <LoadingSpinner title="Loading..." subtitle="Fetching map data & telemetry" />;
  }

  const isBlockMode = searchParams.get('mode') === 'block' || executionId === 'block';

  if (error || !executionData) {
    return (
      <div className="screen-container">
        <EmptyState
          title={isBlockMode ? "Block map could not load" : "User map could not load"}
          subtitle={error || (isBlockMode ? 'No execution data found for this block.' : 'No execution data found for this user.')}
        >
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {!isBharatNetMap && (
              <button type="button" className="btn-secondary" onClick={closeMap}>Close</button>
            )}
            <button type="button" className="btn-primary" onClick={() => fetchExecutionDetail(true)}>Retry</button>
          </div>
        </EmptyState>
      </div>
    );
  }

  const displayPits = getVisiblePitsForMap(executionData);
  const hddStarted = hasHddShotOrTrenchingStarted(executionData);
  const hasGpsData = (executionData.depthPoints && executionData.depthPoints.length > 0) ||
    (hddStarted && displayPits.length > 0) ||
    (hddStarted && executionData.shots && executionData.shots.length > 0);

  const activeTaskCode = [executionData?.taskCode, executionData?.taskId].find(v => v && !isMongoHexId(v)) || '';
  const activeTaskName = [executionData?.displayName, executionData?.taskName].find(v => v && !isMongoHexId(v)) || '';
  const activeRing = [executionData?.ring, executionData?.ringId, executionData?.ringCode].find(v => v && !isMongoHexId(v)) || '';

  return (
    <div className="map-viewer-page">

      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          taskId={activeTaskCode}
          taskCode={activeTaskCode}
          taskName={activeTaskName}
          ring={activeRing}
          ringId={activeRing}
          onClose={() => setLightboxPhotos(null)}
          onNavigate={(newIdx) => setLightboxIndex(newIdx)}
        />
      )}

      <div className="map-viewer-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {!isBharatNetMap && (
            <button type="button" className="btn-secondary" onClick={closeMap} title="Close map">
              <LucideArrowLeft size={16} /> Close
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="page-title" style={{ fontSize: '0.9375rem' }}>
              {executionData.isBlockMap ? `Block Map: ${executionData.block || '—'}` : 'Execution map'}
            </div>
            <div className="page-subtitle" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {executionData.isBlockMap ? (
                <span>
                  <strong>Block: {executionData.block || '—'}</strong> · {executionData.district || '—'}, {executionData.state || '—'}
                  {executionData.usersList?.length ? ` · ${executionData.usersList.length} ${executionData.usersList.length === 1 ? 'user' : 'users'}` : ''}
                </span>
              ) : (
                <span>
                  <strong>User: {executionData.user || 'Supervisor'}</strong>
                  {Boolean(executionData.machineId || executionData.machineName || searchParams.get('machineId')) && (
                    <> · Machine: <strong style={{ color: 'var(--text-main, #0f172a)' }}>
                      {String(
                        typeof executionData.machineId === 'string'
                          ? executionData.machineId
                          : (typeof executionData.machineName === 'string'
                              ? executionData.machineName
                              : (searchParams.get('machineId') || ''))
                      )}
                    </strong></>
                  )}
                  {' '}· Block: {executionData.block || '—'} · {executionData.district || executionData.state || '—'}
                </span>
              )}
              {(executionData.lastModified || executionData.updatedAt) && (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Last modified: <strong style={{ color: 'var(--text-main, #0f172a)' }}>{formatLastModified(executionData.lastModified || executionData.updatedAt)}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="map-viewer-toolbar-meta">
          <DateField
            required
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            aria-label="Execution date"
          />
          <span className="map-viewer-toolbar-stats">
            {executionData.statistics.totalShots} trenches
            {' · '}
            {displayPits.length} pits
            {' · '}
            {executionData.statistics.formattedDistance}
            {' · '}
            {executionData.statistics.totalDepthReadings} depths
            {executionData.statistics.depthRange ? ` · ${executionData.statistics.depthRange}` : ''}
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchExecutionDetail(false)}
            disabled={isRefreshing}
          >
            <LucideRefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Main Full-Width Interactive GIS Map Container */}
      <div
        ref={wrapperRef}
        className="map-viewer-canvas"
      >
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 400, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="gis-map-chip">
            <button type="button" className={mapType === 'street' ? 'is-active' : ''} onClick={() => setMapType('street')}>
              Map
            </button>
            <button type="button" className={mapType === 'satellite' ? 'is-active' : ''} onClick={() => setMapType('satellite')}>
              Satellite
            </button>
          </div>
        </div>

        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 400, display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 'min(520px, calc(100% - 180px))' }}>
          {!isBharatNetMap && viewMode === '3d' && (
            <div className="gis-map-note">
              Some points overlap in 3D for a clearer view. Switch to 2D for full detail.
            </div>
          )}
          {!isBharatNetMap && (
            <div className="gis-map-chip">
              <button type="button" className={viewMode === '2d' ? 'is-active' : ''} onClick={() => setViewMode('2d')}>
                2D
              </button>
              <button type="button" className={viewMode === '3d' ? 'is-active' : ''} onClick={() => setViewMode('3d')}>
                3D
              </button>
            </div>
          )}
          {!isBharatNetMap && (
            <AlignPlanMapButton
              currentPlanId={executionData?.planId || executionData?.plan_id || ''}
              onAlignMultiPlans={handleAlignMultiPlans}
              onAlignPlan={handleAlignPlan}
            />
          )}
          {!isBharatNetMap && userFilteredMachines.length > 0 && (
            <button
              type="button"
              className="gis-map-chip"
              onClick={() => setShowLiveMachines(prev => !prev)}
              title="Toggle live machine location"
              style={{
                padding: '0 10px',
                height: 32,
                background: showLiveMachines ? 'rgba(5, 150, 105, 0.9)' : 'rgba(15, 23, 42, 0.75)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                fontSize: '0.78rem',
                fontWeight: 650,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer'
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: showLiveMachines ? '#10b981' : '#94a3b8',
                boxShadow: showLiveMachines ? '0 0 6px #10b981' : 'none'
              }} />
              {userFilteredMachines.length === 1
                ? `Live Machine (${userFilteredMachines[0].name || userFilteredMachines[0].model_name || '1'})`
                : `Live Machines (${userFilteredMachines.length})`}
            </button>
          )}
          {!isBharatNetMap && (
            <button
              type="button"
              className={`gis-map-icon-btn ${isMeasuring ? 'is-active' : ''}`}
              onClick={toggleMeasurementRuler}
              title={isMeasuring ? 'Exit measurement ruler' : 'Measure distance on map (Ruler)'}
              style={{
                background: isMeasuring ? '#0284c7' : undefined,
                color: isMeasuring ? '#ffffff' : undefined,
                borderColor: isMeasuring ? '#38bdf8' : undefined,
                boxShadow: isMeasuring ? '0 0 12px rgba(56, 189, 248, 0.45)' : undefined,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 650
              }}
            >
              <LucideRuler size={15} />
              <span>Ruler</span>
            </button>
          )}
          <button type="button" className="gis-map-icon-btn" onClick={fitRouteBounds} title="Fit to trench">
            <Globe size={15} /> Fit route
          </button>
          <button type="button" className="gis-map-icon-btn" onClick={toggleFullscreen} title="Toggle fullscreen" style={{ width: 36, padding: 0, justifyContent: 'center' }}>
            {isFullscreen ? <LucideMinimize2 size={16} /> : <LucideMaximize2 size={16} />}
          </button>
        </div>

        {/* Interactive Measurement Ruler Floating HUD */}
        {!isBharatNetMap && isMeasuring && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 500,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid #38bdf8',
              boxShadow: '0 10px 30px rgba(0,0,0,0.7), 0 0 16px rgba(56, 189, 248, 0.35)',
              borderRadius: 12,
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              color: '#ffffff',
              fontSize: '0.82rem',
              pointerEvents: 'auto',
              whiteSpace: 'nowrap',
              maxWidth: 'calc(100% - 32px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#38bdf8' }}>
              <LucideRuler size={16} />
              <span>Measurement Ruler</span>
            </div>

            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.2)' }} />

            {measurePoints.length === 0 ? (
              <span style={{ color: '#cbd5e1' }}>Click anywhere on the map to start measuring</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: '#94a3b8' }}>
                  Points: <strong style={{ color: '#f8fafc' }}>{measurePoints.length}</strong>
                </span>
                <span style={{ color: '#94a3b8' }}>
                  Total Distance:{' '}
                  <strong style={{ color: '#4ade80', fontSize: '0.92rem' }}>
                    {measureTotalDist >= 1000 ? `${(measureTotalDist / 1000).toFixed(2)} km` : `${measureTotalDist.toFixed(1)} m`}
                  </strong>
                </span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {measurePoints.length > 0 && (
                <button
                  type="button"
                  onClick={clearMeasurement}
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#fca5a5',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={toggleMeasurementRuler}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#ffffff',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Exit
              </button>
            </div>
          </div>
        )}

        {viewMode === '3d' ? (
          <Map3dBoundary>
            <Suspense fallback={<div className="gis-map3d-loading">Loading 3D view…</div>}>
              <GisExecutionMap3D
                executionData={executionData}
                mapType={mapType}
                fitNonce={fitNonce}
                onOpenLightbox={openLightbox}
              />
            </Suspense>
          </Map3dBoundary>
        ) : (
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
        )}

        {/* DT Planner Multi-Plan Layer Management Panel */}
        <PlanLayerManagementPanel
          activePlansList={activePlansList}
          onToggleVisibility={togglePlanVisibility}
          onRemovePlan={removePlanFromMap}
          onFitBounds={() => {
            const visiblePlans = activePlansList.filter((p) => p.visible);
            const bounds = calculateMultiPlanBounds(visiblePlans);
            if (bounds && mapInstanceRef.current) {
              mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 18, animate: true });
            }
          }}
        />

        {/* Empty State Banner if no valid GPS data exists for selected date */}
        {!hasGpsData && (
          <div className="gis-empty-overlay">
            <EmptyState
              title={!hddStarted ? "HDD Shot / Trenching Not Started" : "No execution on this date"}
              subtitle={!hddStarted
                ? "HDD shot / trenching has not started yet. Pits will be displayed on the map once execution begins."
                : (isBlockMode
                  ? `No pits, trenches, or depth points found for block ${executionData?.block || ''} on ${selectedDate || 'the selected day'}.`
                  : `No pits, trenches, or depth points found for ${executionData?.user || 'this user'} on ${selectedDate || 'the selected day'}.`
                )
              }
            />
          </div>
        )}

        {/* Live Machines Bar (ONLY for assigned machines belonging to this user / block, NEVER on BharatNet map) */}
        {!isBharatNetMap && showLiveMachines && userFilteredMachines.length > 0 && (
          <div
            className="gis-map-machines-bar"
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              zIndex: 400,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: 'max-content',
              maxWidth: 'calc(100% - 24px)',
              overflowX: 'auto',
              padding: '6px 12px',
              background: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(10px)',
              borderRadius: 10,
              border: '1px solid rgba(255, 255, 255, 0.18)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6, borderRight: '1px solid rgba(255,255,255,0.15)' }}>
              <span>
                {userFilteredMachines.length === 1 ? 'ASSIGNED MACHINE' : `LIVE MACHINES (${userFilteredMachines.length})`}
              </span>
            </div>
            {userFilteredMachines.map((m) => {
              const course = m.course_deg ?? m.heading ?? 0;
              const isRunning = (m.status || '').toUpperCase() === 'RUNNING';

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedLiveMachine(m);
                    if (mapInstanceRef.current && m.latitude != null && m.longitude != null) {
                      mapInstanceRef.current.flyTo([m.latitude, m.longitude], 16, { animate: true, duration: 1 });
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: selectedLiveMachine?.id === m.id ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: selectedLiveMachine?.id === m.id
                      ? 'rgba(2, 132, 199, 0.45)'
                      : 'rgba(56, 189, 248, 0.25)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                  title={`${m.name || 'Machine'} · ${isRunning ? 'RUNNING' : 'IDLE'} · ${Number(course).toFixed(0)}°`}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: isRunning ? '#059669' : '#d97706',
                      border: '1.5px solid #fff',
                      boxShadow: '0 0 0 1px rgba(15,23,42,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      style={{ transform: `rotate(${Number(course) || 0}deg)` }}
                    >
                      <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#fff" />
                    </svg>
                  </span>
                  <span>{m.name || m.model_name || `HDD ${m.id}`}</span>
                  <span style={{ opacity: 0.75, fontWeight: 600, fontSize: '0.7rem' }}>
                    {Number(course).toFixed(0)}°
                  </span>
                  <span style={{ fontSize: '0.625rem', background: '#0284c7', color: '#fff', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                    ASSIGNED
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
