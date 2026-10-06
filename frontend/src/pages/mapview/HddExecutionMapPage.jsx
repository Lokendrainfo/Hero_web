import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideMaximize2,
  LucideMinimize2,
  LucideGlobe,
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
    searchParams.get('isBharatNetMap') === 'true' ||
    searchParams.get('isBharatNetMap') === '1' ||
    searchParams.get('bharatnet') === 'true' ||
    searchParams.get('bharatnet') === '1' ||
    searchParams.get('source') === 'bharatnet' ||
    searchParams.get('source') === 'td-monitoring' ||
    searchParams.get('source') === 'td_monitoring' ||
    (typeof window !== 'undefined' && window.location.pathname.includes('/bharatnet')) ||
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
  const depthLayerRef = useRef(null);
  const plannerLayerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const wrapperRef = useRef(null);

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
      if (depthLayerRef.current) {
        depthLayerRef.current.bringToFront();
      }

      // Check if there is an active execution route on the map
      const execGroups = [layerGroupRef.current, depthLayerRef.current].filter(Boolean);
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
              if (depthLayerRef.current) depthLayerRef.current.bringToFront();
            } else {
              mapInstanceRef.current.removeLayer(fg);
            }
          }
          return { ...p, visible: newVis };
        }
        return p;
      });

      const execGroups = [layerGroupRef.current, depthLayerRef.current].filter(Boolean);
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

      const execGroups = [layerGroupRef.current, depthLayerRef.current].filter(Boolean);
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

  // Batch resolve S3 Presigned URLs via POST /api/survey/photo-urls
  const resolvePhotoUrlsForExecution = async (normalized) => {
    if (!normalized) return normalized;

    const keysSet = new Set();

    (normalized.pits || []).forEach(pit => {
      (pit.photos || []).forEach(ph => {
        if (ph.key) keysSet.add(ph.key);
      });
    });

    (normalized.shots || []).forEach(trench => {
      (trench.photos || []).forEach(ph => {
        if (ph.key) keysSet.add(ph.key);
      });
    });

    (normalized.depthPoints || []).forEach(dp => {
      (dp.photos || []).forEach(ph => {
        if (ph.key) keysSet.add(ph.key);
      });
    });

    const keysArray = Array.from(keysSet);
    if (keysArray.length === 0) return normalized;

    try {
      const res = await taskService.getSurveyPhotoUrls(keysArray);
      const urlMap = res?.data?.data || res?.data || res || {};

      const applyPresignedUrl = (mediaObj) => {
        if (!mediaObj || !mediaObj.key) return;
        const cleanK = String(mediaObj.key).replace(/^\/+/, '');
        const resolved = urlMap[mediaObj.key] || urlMap[cleanK] || urlMap[`/${cleanK}`];
        if (resolved) {
          mediaObj.photoUrl = resolved;
          mediaObj.url = resolved;
          mediaObj.src = resolved;
        } else if (mediaObj.photoUrl) {
          mediaObj.photoUrl = formatImageUrl(mediaObj.photoUrl);
        }
      };

      (normalized.pits || []).forEach(pit => (pit.photos || []).forEach(applyPresignedUrl));
      (normalized.shots || []).forEach(trench => (trench.photos || []).forEach(applyPresignedUrl));
      (normalized.depthPoints || []).forEach(dp => (dp.photos || []).forEach(applyPresignedUrl));
    } catch (err) {
      console.error('[HddExecutionMapPage] Error batch resolving photo URLs:', err);
    }

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
        depthLayerRef.current = null;
        tileLayerRef.current = null;
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
      depthLayerRef.current = L.featureGroup().addTo(map);
      plannerLayerRef.current = L.featureGroup().addTo(map);
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
              depth: shot.depth
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
          color: '#5b21b6',
          weight: 3,
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

    // 2. Pits — only show if HDD shot / trenching has started
    const pits = getVisiblePitsForMap(executionData);
    const depthPoints = executionData.depthPoints || [];

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

    pits.forEach((pit) => {
      const pt = [pit.lat, pit.lng];
      allBounds.push(pt);
      frameBounds.push(pt);

      const isLivePit = livePitIds.has(String(pit.id)) || livePitIds.has(String(pit.serialNo)) || livePitIds.has(String(pit.name));

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

      const tooltipText = [
        pit.user ? `User: ${pit.user}` : '',
        depthStr,
        pitName
      ].filter(Boolean).join(' · ');

      const m = L.marker(pt, {
        icon: pitIcon({ role: 'mid', name: pitName, depth: pit.depth, showLabel: isLivePit, isLive: isLivePit }),
        zIndexOffset: isLivePit ? 550 : 450
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
          eyebrow: isLivePit ? (pit.user ? `Live Pit · ${pit.user}` : 'Live Pit') : 'Pit',
          title: pitName,
          rows: [
            ['User', pit.user || '—'],
            ['Depth', pit.depth != null ? formatDepthM(pit.depth) : '—'],
            ['Width', pit.width != null ? `${Number(pit.width).toFixed(2)}m` : '—'],
            ['Side', pit.side],
            ['Type', pit.type],
            ['Time', pit.diggingTime],
          ],
        }), { maxWidth: 260, className: 'gis-popup' });
      }

      layerGroup.addLayer(m);
    });

    // 3. Depth captures — sample + scale with zoom so pins do not stack
    depthPoints.forEach((dp) => {
      if (dp.lat != null && dp.lng != null) allBounds.push([dp.lat, dp.lng]);
    });

    const paintDepths = () => {
      const depthLayer = depthLayerRef.current;
      if (!depthLayer || !mapInstanceRef.current) return;
      depthLayer.clearLayers();
      const map = mapInstanceRef.current;
      const z = map.getZoom();
      const lastIdx = depthPoints.length - 1;
      const step = depthSampleStep(z, depthPoints.length);

      // Determine latest capture index FOR EACH USER!
      // In Full Block Map (or multi-user map), each active user working in the block gets their own live green bulb.
      const liveIndicesSet = new Set();
      const userLatestMap = new Map(); // userKey -> { idx, time }

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

      // Always include lastIdx as fallback
      if (lastIdx >= 0) {
        liveIndicesSet.add(lastIdx);
      }

      // Pixel-based collision detection to ensure depth badges never overlap on screen
      const MIN_BADGE_DIST_PX = 75;
      const labeledIndices = new Set();
      const placedPositions = [];

      const canPlaceBadge = (pt) => {
        for (const pos of placedPositions) {
          const dx = pt.x - pos.x;
          const dy = pt.y - pos.y;
          if (Math.hypot(dx, dy) < MIN_BADGE_DIST_PX) {
            return false;
          }
        }
        return true;
      };

      // 1. Always prioritize live/last point depth badges for all users
      liveIndicesSet.forEach((liveIdx) => {
        const dpLive = depthPoints[liveIdx];
        if (dpLive && dpLive.lat != null && dpLive.lng != null) {
          try {
            const pt = map.latLngToContainerPoint([dpLive.lat, dpLive.lng]);
            labeledIndices.add(liveIdx);
            placedPositions.push(pt);
          } catch (e) { }
        }
      });

      // 2. Prioritize start point depth badge
      if (depthPoints.length > 1) {
        const dpFirst = depthPoints[0];
        if (dpFirst && dpFirst.lat != null && dpFirst.lng != null) {
          try {
            const pt = map.latLngToContainerPoint([dpFirst.lat, dpFirst.lng]);
            if (canPlaceBadge(pt)) {
              labeledIndices.add(0);
              placedPositions.push(pt);
            }
          } catch (e) { }
        }
      }

      // 3. Sample intermediate depth points with screen pixel collision check
      depthPoints.forEach((dp, idx) => {
        if (idx === 0 || liveIndicesSet.has(idx)) return;
        if (dp.lat == null || dp.lng == null) return;
        if (idx % step !== 0) return;

        try {
          const pt = map.latLngToContainerPoint([dp.lat, dp.lng]);
          if (canPlaceBadge(pt)) {
            labeledIndices.add(idx);
            placedPositions.push(pt);
          }
        } catch (e) { }
      });

      // Render markers
      depthPoints.forEach((dp, idx) => {
        const isLast = liveIndicesSet.has(idx);
        const isKey = idx === 0 || isLast;
        if (!isKey && idx % step !== 0) return;

        // Last depth capture for EACH user always shows static green depth badge
        const showLabel = isLast || labeledIndices.has(idx);

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

        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
        let isStale = false;
        if (isLast) {
          const capTime = parseAnyDate(dp.capturedAt || dp.createdAt);
          if (capTime && !isNaN(capTime.getTime())) {
            isStale = (Date.now() - capTime.getTime()) > SIX_HOURS_MS;
          } else {
            const execTime = parseAnyDate(executionData?.lastModified || executionData?.updatedAt);
            if (execTime && !isNaN(execTime.getTime())) {
              isStale = (Date.now() - execTime.getTime()) > SIX_HOURS_MS;
            }
          }
        }

        const size = depthDotSize(z);
        const m = L.marker([dp.lat, dp.lng], {
          icon: depthPointIcon({
            depth: dp.depth,
            size,
            showLabel,
            isKey,
            isLive: isLast,
            isStale,
            side: idx % 2 === 0 ? 'right' : 'left',
          }),
          zIndexOffset: isLast ? 600 : 200,
        });

        const parsedDepth = parseFloat(String(dp.depth ?? ''));
        const isBelowThreshold = !isNaN(parsedDepth) && parsedDepth < 1.65;

        const tooltipText = [
          dp.user ? `User: ${dp.user}` : '',
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

        depthLayer.addLayer(m);
      });

      applyGisZoomLabels(mapInstanceRef.current);
    };

    if (map.__gisPaintDepths) {
      map.off('zoomend', map.__gisPaintDepths);
    }
    map.__gisPaintDepths = paintDepths;
    map.on('zoomend', paintDepths);
    paintDepths();
    if (layerGroupRef.current) layerGroupRef.current.bringToFront();
    if (depthLayerRef.current) depthLayerRef.current.bringToFront();

    // Frame the trench on first load — overview, then zoom in for depths
    if (!isInitialFitDoneRef.current) {
      const fit = frameBounds.length ? frameBounds : allBounds;
      if (fit.length > 1) {
        map.fitBounds(fit, { padding: [80, 96], maxZoom: 16, animate: false });
      } else if (fit.length === 1) {
        map.setView(fit[0], 16);
      }
      isInitialFitDoneRef.current = true;
      paintDepths();
    }

    setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.invalidateSize();
        } catch (e) { }
      }
    }, 150);
  }, [executionData, mapType, selectedDate, viewMode]);

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
    const groups = [layerGroupRef.current, depthLayerRef.current].filter(Boolean);
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
                  <strong>User: {executionData.user || 'Supervisor'}</strong> · Block: {executionData.block || '—'} · {executionData.district || executionData.state || '—'}
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
          <AlignPlanMapButton
            currentPlanId={executionData?.planId || executionData?.plan_id || ''}
            onAlignMultiPlans={handleAlignMultiPlans}
            onAlignPlan={handleAlignPlan}
          />
          <button type="button" className="gis-map-icon-btn" onClick={fitRouteBounds} title="Fit to trench">
            <LucideGlobe size={15} /> Fit route
          </button>
          <button type="button" className="gis-map-icon-btn" onClick={toggleFullscreen} title="Toggle fullscreen" style={{ width: 36, padding: 0, justifyContent: 'center' }}>
            {isFullscreen ? <LucideMinimize2 size={16} /> : <LucideMaximize2 size={16} />}
          </button>
        </div>

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
      </div>

    </div>
  );
};
