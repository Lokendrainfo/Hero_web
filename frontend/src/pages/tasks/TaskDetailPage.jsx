import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideCheckSquare,
  LucideBuilding2,
  LucideUser,
  LucideMapPin,
  LucideGlobe,
  LucideGitCommit,
  LucideLayers,
  LucideCalendar,
  LucideAlertCircle,
  LucideInfo,
  LucideClock,
  LucideShieldCheck,
  LucideFileText,
  LucideCamera,
  LucideNavigation,
  LucideExternalLink,
  LucideActivity,
  LucideWrench,
  LucidePlay,
  LucideVideo,
  LucideImage,
  LucideRuler,
  LucideCheckCircle2,
  LucideTruck,
  LucideFilter
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { vendorService } from '../../services/vendorService';
import { TaskRouteMap } from '../../components/tasks/TaskRouteMap';
import { PhotoLightbox, formatImageUrl } from '../../components/common/PhotoLightbox';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { mapHddExecutionResponse, filterHddExecutionByDate, parseDateToYMD } from '../../utils/mapHddExecutionResponse';

const KNOWN_VENDOR_MAP = {
  '6a852f2600cd99ac6337f4a9': 'HARPAL INFRA DEVELOPMENT',
  '6a7c2b4f8e16e804697f18b0': 'Gurukripa Enterprises',
  '6a8bdb93b8fd1ac215ebfeed': 'KHALSA TELECOM',
  '6a7e941d4312cab2fd6d36cc': 'Hero Infrastructure',
  '6a8a77d5b8fd1ac215ebfeeb': 'Naveen Telecom',
  '6a8badb1b8fd1ac215ebfeec': 'Naveen Telecom Network',
  '6a97b260544bdedf53d4ec0c': 'Naveen Telecom Network 1',
  '6a9d22c43fe4e1b061d189a9': 'Naveen Telecom Network 2',
  '6a82e6f24312cab2fd6d36cd': 'Pranjal Enterprises',
  '6a8fc284544bdedf53d4ec09': 'Raj Enterprises'
};

export const TaskDetailPage = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [vendorCompany, setVendorCompany] = useState(null);
  const [execution, setExecution] = useState(null);
  const [childrenTasks, setChildrenTasks] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Execution Data State
  const [rawExecutionData, setRawExecutionData] = useState(null);
  const [executionData, setExecutionData] = useState(null);
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [activeExecutionTab, setActiveExecutionTab] = useState('trenches');

  // Lightbox State
  const [lightboxPhotos, setLightboxPhotos] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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
      console.error('[TaskDetailPage] Error batch resolving photo URLs:', err);
    }

    return normalized;
  };

  // Helper to fetch execution for a single task ID
  const fetchExecutionForSingleTask = async (tId) => {
    try {
      const tRes = await taskService.getTaskDetail(tId);
      const tData = tRes?.data?.data || tRes?.data || null;
      if (!tData) return null;

      let eData = null;
      try {
        const eRes = await taskService.getTaskExecution(tId);
        eData = eRes?.data?.data || eRes?.data || null;
      } catch (eErr) {
        // Fallback to embedded taskExecution inside tData
      }
      return mapHddExecutionResponse(tData, eData);
    } catch (err) {
      return null;
    }
  };

  // Recursively resolve execution data for parent or child tasks
  const resolveExecutionData = async (targetId, maxDepth = 3) => {
    if (!targetId || maxDepth <= 0) return null;

    const directNorm = await fetchExecutionForSingleTask(targetId);
    if (directNorm && ((directNorm.shots && directNorm.shots.length > 0) || (directNorm.pits && directNorm.pits.length > 0))) {
      return directNorm;
    }

    // Attempt to check child tasks recursively
    try {
      const cRes = await taskService.getTaskChildren(targetId);
      const children = cRes?.data?.data || cRes?.data || [];
      if (Array.isArray(children) && children.length > 0) {
        let combinedShots = [];
        let combinedPits = [];
        let combinedDepthPoints = [];
        let datesSet = new Set();
        let pitIdsSet = new Set();

        for (const child of children) {
          const cId = child.id || child._id || child.taskId;
          if (cId) {
            const childNorm = await resolveExecutionData(cId, maxDepth - 1);
            if (childNorm) {
              (childNorm.shots || []).forEach(s => combinedShots.push(s));
              (childNorm.pits || []).forEach(p => {
                if (!pitIdsSet.has(p.id)) {
                  pitIdsSet.add(p.id);
                  combinedPits.push(p);
                }
              });
              (childNorm.depthPoints || []).forEach(dp => combinedDepthPoints.push(dp));
              (childNorm.availableDates || []).forEach(d => datesSet.add(d));
            }
          }
        }

        if (combinedShots.length > 0 || combinedPits.length > 0) {
          let totalTrenchMeters = combinedShots.reduce((sum, s) => sum + (s.lengthMeters || 0), 0);
          const formattedTrenchDistance = totalTrenchMeters >= 1000 ? `${(totalTrenchMeters / 1000).toFixed(2)} km` : `${totalTrenchMeters.toFixed(2)} m`;

          let minD = Infinity, maxD = -Infinity;
          combinedDepthPoints.forEach(dp => {
            if (dp.depth > 0) {
              if (dp.depth < minD) minD = dp.depth;
              if (dp.depth > maxD) maxD = dp.depth;
            }
          });
          const depthRangeStr = (minD !== Infinity && maxD !== -Infinity) ? `${minD.toFixed(2)}m – ${maxD.toFixed(2)}m` : 'N/A';

          return {
            ...(directNorm || {}),
            id: String(targetId),
            shots: combinedShots,
            pits: combinedPits,
            depthPoints: combinedDepthPoints,
            availableDates: Array.from(datesSet).sort(),
            trench: {
              lengthMeters: totalTrenchMeters,
              formattedDistance: formattedTrenchDistance,
              numShots: combinedShots.length
            },
            statistics: {
              totalShots: combinedShots.length,
              totalPits: combinedPits.length,
              totalDepthReadings: combinedDepthPoints.length,
              formattedDistance: formattedTrenchDistance,
              depthRange: depthRangeStr
            }
          };
        }
      }
    } catch (cErr) {
      console.warn('[TaskDetailPage] Error resolving child execution data:', cErr);
    }

    return directNorm;
  };

  const fetchTaskDetails = async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    setTask(null);
    setVendorCompany(null);
    setExecution(null);
    setChildrenTasks([]);
    setSelectedRouteIndex(null);
    setRawExecutionData(null);
    setExecutionData(null);

    const cleanId = String(taskId).replace('_route_', '').split('_')[0];

    try {
      // 1. Fetch Task Detail
      const taskRes = await taskService.getTaskDetail(cleanId);
      console.log('[TaskDetailPage] TASK DETAIL RESPONSE:', taskRes);
      const taskData = taskRes?.data?.data || taskRes?.data || null;

      if (!taskData) {
        setError(`Task "${taskId}" not found or unauthorized.`);
        setLoading(false);
        return;
      }

      setTask(taskData);

      if (taskData.taskExecution) {
        setExecution(taskData.taskExecution);
      }

      // 2. Fetch Vendor Company Details
      if (taskData.vendorId) {
        const vIdClean = String(taskData.vendorId).toLowerCase().trim();
        if (KNOWN_VENDOR_MAP[vIdClean]) {
          setVendorCompany(KNOWN_VENDOR_MAP[vIdClean]);
        }
        try {
          const vRes = await vendorService.getIntegrationsVendors({ vendor_id: taskData.vendorId });
          const vData = vRes?.data?.data || vRes?.data || null;
          if (vData) {
            if (Array.isArray(vData.results) && vData.results.length > 0) {
              const match = vData.results.find(v => String(v.id).toLowerCase() === vIdClean) || vData.results[0];
              setVendorCompany(match.partnerName || match.name || KNOWN_VENDOR_MAP[vIdClean]);
            } else if (vData.partnerName || vData.name) {
              setVendorCompany(vData.partnerName || vData.name);
            }
          }
        } catch (vErr) {
          console.warn('[TaskDetailPage] Error resolving vendor company:', vErr);
        }
      }

      // 3. Fetch Children / Sub-Tasks
      try {
        const childRes = await taskService.getTaskChildren(cleanId);
        const childData = childRes?.data?.data || childRes?.data || [];
        if (Array.isArray(childData) && childData.length > 0) {
          setChildrenTasks(childData);
        }
      } catch (childErr) {
        console.log('[TaskDetailPage] Children unavailable for task:', taskId);
      }

      // 4. Resolve Execution Data (Direct + Children Recursive)
      let resolvedNorm = await resolveExecutionData(cleanId);
      if (resolvedNorm) {
        // Resolve Presigned S3 URLs
        resolvedNorm = await resolvePhotoUrlsForExecution(resolvedNorm);
        setRawExecutionData(resolvedNorm);
        setExecutionData(filterHddExecutionByDate(resolvedNorm, selectedDate));
      }
    } catch (err) {
      console.error('[TaskDetailPage] Error loading task:', err);
      setError(err?.response?.data?.message || 'Failed to load task details from API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaskDetails();
  }, [taskId]);

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    if (rawExecutionData) {
      setExecutionData(filterHddExecutionByDate(rawExecutionData, newDate));
    }
  };

  const openLightbox = (photos, index = 0) => {
    if (!photos || photos.length === 0) return;
    setLightboxPhotos(photos);
    setLightboxIndex(index);
  };

  if (loading) {
    return (
      <LoadingSpinner
        title="Loading Task Details & Execution Logs..."
        subtitle="Fetching task route hierarchy, location, vendor, and resolving live field execution records"
      />
    );
  }

  if (error || !task) {
    return (
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
          <LucideAlertCircle size={36} color="#dc2626" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#991b1b', margin: 0 }}>Task Load Error</h3>
          <p style={{ fontSize: '0.85rem', color: '#7f1d1d', marginTop: '6px' }}>{error || 'Unable to display requested task.'}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
            <button onClick={() => navigate('/tasks')} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }}>
              ← Back to My Tasks
            </button>
            <button onClick={fetchTaskDetails} style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Safe extraction of task properties
  const code = task.taskCode || task.title || taskId;
  const name = task.displayName || task.locationSnapshot?.locationName || task.location?.locationName || 'Fiber Execution Task';
  const typeStr = task.taskType || 'FIBER_TRENCHING_DUCTING_TASK';
  const statusStr = task.status || 'CREATED';
  const approvalStr = task.approvalStatus || 'PENDING';
  const stageStr = task.taskStage || 'PLANNING';

  // Vendor resolution
  const vIdClean = String(task.vendorId || '').toLowerCase().trim();
  const vendorName = vendorCompany ||
    KNOWN_VENDOR_MAP[vIdClean] ||
    task.vendorSnapshot?.partnerName ||
    task.vendorSnapshot?.name ||
    (task.vendorId ? `Vendor (${task.vendorId.substring(0, 8)})` : 'Unassigned Vendor');

  // Assignment details
  const assigneeName = task.assigneeSnapshot?.name || task.assigneeName || 'VASU';
  const assigneeRole = task.assigneeSnapshot?.designation || task.assigneeSnapshot?.role || 'Project Manager';
  const assigneeMobile = task.assigneeSnapshot?.mobile || '';

  const approverObj = (Array.isArray(task.approverSnapshots) && task.approverSnapshots.length > 0) ? task.approverSnapshots[0] : null;
  const approverName = approverObj?.name || 'Badre Alam';
  const approverRole = approverObj?.designation || 'Project Director';

  const creatorObj = task.createdBySnapshot || null;
  const createdBy = creatorObj?.name || 'Badre Alam';

  // Location Snapshot details
  const loc = task.locationSnapshot || task.location || {};
  const locCompany = loc.company || 'Telecrats';
  const locCircle = loc.circle || 'RAJASTHAN';
  const locDistrict = loc.district || 'GANGANAGAR';
  const locBlock = loc.blockName || loc.block || 'KARANPUR';
  const locName = loc.locationName || '10 O';
  const locCode = loc.locationCode || task.locationCode || 'RJ-GNG-KAR-037777';
  const locOltIp = loc.oltIp || '10.0.186.218';
  const locLat = loc.latitude || '29.841128';
  const locLng = loc.longitude || '73.536244';
  const locPhase = loc.projectPhase || 'PHASE_1';
  const locBaCmp = loc.baCmp || 'Bikaner';

  // Route Snapshot & Child Routes Processing
  const routeSnapshot = task.routeSnapshot || {};
  const childRoutes = Array.isArray(routeSnapshot.routes) ? routeSnapshot.routes : [];
  const isBlockLevel = routeSnapshot.level === 'BLOCK' || childRoutes.length > 0;

  // Calculate Planned Scope and Covered Length
  let plannedScopeKm = 0;
  if (childRoutes.length > 0) {
    plannedScopeKm = childRoutes.reduce((acc, r) => acc + (Number(r.lengthKm) || 0), 0);
  } else if (routeSnapshot.lengthKm) {
    plannedScopeKm = Number(routeSnapshot.lengthKm);
  } else if (task.totalLengthKm) {
    plannedScopeKm = Number(task.totalLengthKm);
  } else if (task.coveredLengthKm !== undefined && task.coveredLengthKm !== null) {
    plannedScopeKm = Number(task.coveredLengthKm);
  }

  const coveredKm = task.coveredLengthKm !== undefined && task.coveredLengthKm !== null ? Number(task.coveredLengthKm) : 0;
  const remainingKm = Math.max(0, plannedScopeKm - coveredKm);
  const pct = plannedScopeKm > 0 ? Math.min(100, Math.round((coveredKm / plannedScopeKm) * 100)) : 0;

  const routeNodes = routeSnapshot.nodes || task.nodes || [];
  const currentNode = routeSnapshot.currentNode || (routeNodes.length > 0 ? routeNodes[0] : null);
  const nextNode = routeSnapshot.nextNode || (routeNodes.length > 1 ? routeNodes[routeNodes.length - 1] : null);
  const segmentSnapshots = task.segmentSnapshots || [];

  // Parse Field Data & Execution Telemetry
  const activeExec = task.taskExecution || execution;
  const fieldData = activeExec?.fieldData || (activeExec && !activeExec.id ? activeExec : null);
  const surveyKind = fieldData?.surveyKind || typeStr;

  const trenching = fieldData?.trenching || null;
  const machineDetails = trenching?.trenchingMachineDetails || fieldData?.trenchingMachineDetails || null;
  const operatorDetails = trenching?.operatorDetails || fieldData?.operatorDetails || null;
  const locatorDetails = trenching?.locatorPilotDetails || fieldData?.locatorPilotDetails || null;

  // OTDR / Fiber Survey
  const fiberCableDetails = fieldData?.fiberCableDetails || [];
  const fiberHealthTable = fiberCableDetails[0]?.fiberHealthTable || [];

  // Execution records from normalized executionData
  const activePits = executionData?.pits || [];
  const activeShots = executionData?.shots || [];
  const activeDepthPoints = executionData?.depthPoints || [];
  const availableDates = rawExecutionData?.availableDates || [];
  const hasRealExecution = activeShots.length > 0 || activePits.length > 0 || activeDepthPoints.length > 0;

  // Calculate Media Totals
  let totalPhotos = 0;
  let totalVideos = 0;
  const allMediaList = [];

  activePits.forEach(p => {
    (p.photos || []).forEach(ph => {
      allMediaList.push({ ...ph, parentType: 'PIT', parentId: p.id });
      if (ph.isVideo) totalVideos++;
      else totalPhotos++;
    });
  });

  activeShots.forEach(s => {
    (s.photos || []).forEach(ph => {
      allMediaList.push({ ...ph, parentType: 'TRENCH', parentId: s.id });
      if (ph.isVideo) totalVideos++;
      else totalPhotos++;
    });
  });

  activeDepthPoints.forEach(dp => {
    (dp.photos || []).forEach(ph => {
      allMediaList.push({ ...ph, parentType: 'DEPTH', parentId: `Point ${dp.pointNo}` });
      if (ph.isVideo) totalVideos++;
      else totalPhotos++;
    });
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>

      {/* Lightbox Modal */}
      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxPhotos(null)}
        />
      )}

      {/* Top Breadcrumb & Refresh Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => navigate('/tasks')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: '600',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            <LucideArrowLeft size={16} /> Back to My Tasks
          </button>

          <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>/</span>
          <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '500' }}>Task Detail</span>
          <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>/</span>
          <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: '700' }}>{code}</span>
        </div>

        <button
          onClick={fetchTaskDetails}
          className="app-card"
          style={{ padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Data
        </button>
      </div>

      {/* 1. Header Banner & Task Title Card */}
      <div className="app-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #0a2d23 0%, #114b3a 100%)', color: '#ffffff', borderRadius: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', background: '#059669', color: '#ffffff', padding: '3px 10px', borderRadius: '6px', fontWeight: '800', letterSpacing: '0.5px' }}>
                {code}
              </span>
              <span style={{ fontSize: '0.72rem', background: 'rgba(255, 255, 255, 0.15)', color: '#6ee7b7', padding: '3px 10px', borderRadius: '12px', fontWeight: '700' }}>
                {typeStr}
              </span>
              {routeSnapshot.level && (
                <span style={{ fontSize: '0.72rem', background: '#7c3aed', color: '#ffffff', padding: '3px 10px', borderRadius: '12px', fontWeight: '800' }}>
                  LEVEL: {routeSnapshot.level}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: '1.45rem', fontFamily: 'Outfit, sans-serif', fontWeight: '800', margin: 0, color: '#ffffff' }}>
              {name}
            </h1>
            <div style={{ fontSize: '0.82rem', color: '#a7f3d0', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LucideMapPin size={14} color="#34d399" />
              <span>{locBlock}, {locDistrict}, {locCircle}</span>
              <span style={{ opacity: 0.5 }}>•</span>
              <span>Location Code: <strong>{locCode}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', background: statusStr === 'COMPLETED' ? '#059669' : '#0284c7', color: '#ffffff', padding: '4px 12px', borderRadius: '8px', fontWeight: '700' }}>
              ● {statusStr}
            </span>
            <span style={{ fontSize: '0.78rem', background: 'rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '4px 12px', borderRadius: '8px', fontWeight: '700' }}>
              Approval: {approvalStr}
            </span>
            <span style={{ fontSize: '0.78rem', background: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0', padding: '4px 12px', borderRadius: '8px', fontWeight: '600' }}>
              Stage: {stageStr}
            </span>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.15)', margin: '16px 0' }} />

        {/* Vendor Company & Stakeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', fontSize: '0.82rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#93c5fd', fontWeight: '600', textTransform: 'uppercase' }}>Vendor Firm / Partner</div>
            <div style={{ fontWeight: '800', fontSize: '0.98rem', color: '#ffffff', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LucideBuilding2 size={16} color="#60a5fa" />
              <span>{vendorName}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#a7f3d0', fontWeight: '600', textTransform: 'uppercase' }}>Assignee (Project Manager)</div>
            <div style={{ fontWeight: '800', fontSize: '0.98rem', color: '#ffffff', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LucideUser size={16} color="#34d399" />
              <span>{assigneeName} {assigneeMobile ? `(${assigneeMobile})` : ''}</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#a7f3d0', marginTop: '1px' }}>{assigneeRole}</div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#fef08a', fontWeight: '600', textTransform: 'uppercase' }}>Approver & Creator</div>
            <div style={{ fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
              Approver: {approverName} ({approverRole})
            </div>
            <div style={{ fontSize: '0.7rem', color: '#cbd5e1', marginTop: '1px' }}>
              Created By: {createdBy} • {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Summary Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <div className="app-card" style={{ padding: '14px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '700', textTransform: 'uppercase' }}>Total Planned Scope</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0284c7', marginTop: '4px' }}>
            {plannedScopeKm.toFixed(2)} km
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: '2px', fontWeight: '600' }}>
            Covered: {coveredKm.toFixed(2)} km ({pct}%)
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
          <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '700', textTransform: 'uppercase' }}>Remaining Scope</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#059669', marginTop: '4px' }}>
            {remainingKm.toFixed(2)} km
          </div>
          <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '2px', fontWeight: '600' }}>
            Target per Day: {task.dailyTaskTarget || 'N/A'} km
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px', background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
          <div style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: '700', textTransform: 'uppercase' }}>Routes / Segments</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#7c3aed', marginTop: '4px' }}>
            {childRoutes.length > 0 ? `${childRoutes.length} Routes` : `${segmentSnapshots.length || 1} Segments`}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6d28d9', marginTop: '2px', fontWeight: '600' }}>
            Completed: {task.completedSegments || 0}
          </div>
        </div>

        <div className="app-card" style={{ padding: '14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: '700', textTransform: 'uppercase' }}>Pits & Telemetry Summary</div>
          <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>
            {executionData?.statistics?.totalPits ?? activePits.length} Pits
          </div>
          <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '2px', fontWeight: '600' }}>
            Mode: {executionData?.workExecutionMode || fieldData?.workExecutionMode || (trenching ? 'HDD / TRENCHING' : 'HDD')}
          </div>
        </div>
      </div>

      {/* 3. Block Planned Route Hierarchy Panel */}
      {(isBlockLevel || childRoutes.length > 0 || childrenTasks.length > 0) && (
        <div className="app-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideLayers size={20} color="#7c3aed" />
              <span>Block Route Hierarchy & Planned Topology ({childRoutes.length || childrenTasks.length} Child Routes)</span>
            </div>
            <span style={{ fontSize: '0.75rem', background: '#f3e8ff', color: '#7c3aed', padding: '3px 10px', borderRadius: '12px', fontWeight: '800' }}>
              LEVEL: {routeSnapshot.level || 'BLOCK'}
            </span>
          </div>

          <div style={{ background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)', padding: '14px 18px', borderRadius: '12px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Parent Block Scope</div>
              <div style={{ fontWeight: '800', fontSize: '1.1rem', color: '#0f172a', marginTop: '2px' }}>
                📂 {name} ({code})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                Location Code: <strong>{locCode}</strong> | OLT IP: <strong>{locOltIp}</strong> | District: <strong>{locDistrict}</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Total Planned Scope</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#7c3aed' }}>
                {plannedScopeKm.toFixed(2)} km
              </div>
              <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '700' }}>
                Covered: {coveredKm.toFixed(2)} km ({pct}%)
              </div>
            </div>
          </div>

          {/* Child Routes List */}
          {childRoutes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {childRoutes.map((route, rIdx) => {
                const isSelected = selectedRouteIndex === rIdx;
                const matchedChildTask = childrenTasks.find(ct =>
                  ct.displayName === route.routeName ||
                  ct.routeSnapshot?.routeName === route.routeName ||
                  ct.routeSnapshot?.routeCode === route.routeCode
                ) || childrenTasks[rIdx];

                return (
                  <div
                    key={rIdx}
                    onClick={() => setSelectedRouteIndex(isSelected ? null : rIdx)}
                    style={{
                      background: isSelected ? '#faf5ff' : '#ffffff',
                      border: isSelected ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(124, 58, 237, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            background: route.color || '#7c3aed',
                            color: '#ffffff',
                            padding: '4px 12px',
                            borderRadius: '8px',
                            fontWeight: '800',
                            fontSize: '0.82rem'
                          }}
                        >
                          {route.routeName}
                        </span>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.92rem', color: '#1e293b' }}>
                            {route.routeName} ({route.routeCode})
                          </div>
                          <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '2px' }}>
                            Topology: <strong>{route.topologyType || 'RING'}</strong> | Level: <strong>{route.level || 'RING'}</strong>
                            {matchedChildTask && (
                              <span style={{ marginLeft: '8px', color: '#2563eb', fontWeight: '700' }}>
                                • Task Code: {matchedChildTask.taskCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#0284c7' }}>
                            {Number(route.lengthKm || 0).toFixed(2)} km
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {matchedChildTask ? `Segments: ${matchedChildTask.totalSegments || 'N/A'}` : 'Planned Scope'}
                          </div>
                        </div>

                        {matchedChildTask && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/tasks/${matchedChildTask.id}`);
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#059669',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            Inspect Task <LucideExternalLink size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', fontSize: '0.78rem' }}>
                      {route.currentNode && (
                        <div style={{ background: '#ecfdf5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                          <div style={{ fontSize: '0.68rem', color: '#047857', fontWeight: '800', textTransform: 'uppercase' }}>🟢 Start Node (Current GP)</div>
                          <div style={{ fontWeight: '700', color: '#065f46', marginTop: '2px' }}>
                            {route.currentNode.name} ({route.currentNode.code})
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#047857', marginTop: '2px', fontFamily: 'monospace' }}>
                            📍 Lat: {route.currentNode.lat}, Lng: {route.currentNode.lng}
                          </div>
                        </div>
                      )}

                      {route.nextNode && (
                        <div style={{ background: '#fef2f2', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                          <div style={{ fontSize: '0.68rem', color: '#b91c1c', fontWeight: '800', textTransform: 'uppercase' }}>🔴 Target Node (Next GP)</div>
                          <div style={{ fontWeight: '700', color: '#991b1b', marginTop: '2px' }}>
                            {route.nextNode.name} ({route.nextNode.code})
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: '2px', fontFamily: 'monospace' }}>
                            📍 Lat: {route.nextNode.lat}, Lng: {route.nextNode.lng}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : childrenTasks.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px' }}>Task Code</th>
                    <th style={{ padding: '8px 12px' }}>Route Name</th>
                    <th style={{ padding: '8px 12px' }}>Assignee</th>
                    <th style={{ padding: '8px 12px' }}>Start → End Node</th>
                    <th style={{ padding: '8px 12px' }}>Length (km)</th>
                    <th style={{ padding: '8px 12px' }}>Total Segments</th>
                    <th style={{ padding: '8px 12px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {childrenTasks.map((ct, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: '700', color: '#2563eb' }}>{ct.taskCode}</td>
                      <td style={{ padding: '8px 12px', fontWeight: '700', color: '#1e293b' }}>{ct.displayName}</td>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>{ct.assigneeSnapshot?.name || ct.assigneeName || 'VASU'}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#475569' }}>
                        {ct.routeSnapshot?.currentNode?.name || 'Start'} → {ct.routeSnapshot?.nextNode?.name || 'End'}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0284c7' }}>
                        {ct.routeSnapshot?.lengthKm ? Number(ct.routeSnapshot.lengthKm).toFixed(2) : 'N/A'} km
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: '600' }}>{ct.totalSegments || 0}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <button
                          onClick={() => navigate(`/tasks/${ct.id}`)}
                          style={{ padding: '4px 10px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* 4. Interactive Route Map & Route Specs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <TaskRouteMap
            routeNodes={routeNodes}
            currentNode={currentNode}
            nextNode={nextNode}
            segmentSnapshots={segmentSnapshots}
            childRoutes={childRoutes}
            selectedRouteIndex={selectedRouteIndex}
            pits={activePits.length > 0 ? activePits : (trenching?.pitDetails || [])}
            depthCaptures={activeDepthPoints.length > 0 ? activeDepthPoints : (trenching?.hddShot?.[0]?.depthCapture || [])}
            height="460px"
            title="Interactive Block Route Topology & Execution Map"
            onOpenPhotos={openLightbox}
          />
        </div>

        <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideGitCommit size={18} color="#7c3aed" />
            <span>Route Topology & Node Specs</span>
          </div>

          {selectedRouteIndex !== null && childRoutes[selectedRouteIndex] ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
              <div style={{ background: '#faf5ff', padding: '10px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                <div style={{ fontSize: '0.7rem', color: '#7c3aed', textTransform: 'uppercase', fontWeight: '800' }}>Selected Child Route</div>
                <div style={{ fontWeight: '800', fontSize: '1rem', color: '#581c87', marginTop: '2px' }}>
                  {childRoutes[selectedRouteIndex].routeName} ({childRoutes[selectedRouteIndex].routeCode})
                </div>
                <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: '2px', fontWeight: '600' }}>
                  Topology: {childRoutes[selectedRouteIndex].topologyType || 'RING'} • Length: {Number(childRoutes[selectedRouteIndex].lengthKm || 0).toFixed(2)} km
                </div>
              </div>

              {childRoutes[selectedRouteIndex].currentNode && (
                <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#047857', textTransform: 'uppercase', fontWeight: '700' }}>Start Node (Current GP)</div>
                  <div style={{ fontWeight: '700', color: '#065f46', fontSize: '0.9rem', marginTop: '2px' }}>
                    {childRoutes[selectedRouteIndex].currentNode.name} ({childRoutes[selectedRouteIndex].currentNode.code})
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#047857', marginTop: '2px', fontFamily: 'monospace' }}>
                    📍 Lat: {childRoutes[selectedRouteIndex].currentNode.lat}, Lng: {childRoutes[selectedRouteIndex].currentNode.lng}
                  </div>
                </div>
              )}

              {childRoutes[selectedRouteIndex].nextNode && (
                <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.7rem', color: '#b91c1c', textTransform: 'uppercase', fontWeight: '700' }}>End Node (Next Target GP)</div>
                  <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '0.9rem', marginTop: '2px' }}>
                    {childRoutes[selectedRouteIndex].nextNode.name} ({childRoutes[selectedRouteIndex].nextNode.code})
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: '2px', fontFamily: 'monospace' }}>
                    📍 Lat: {childRoutes[selectedRouteIndex].nextNode.lat}, Lng: {childRoutes[selectedRouteIndex].nextNode.lng}
                  </div>
                </div>
              )}
            </div>
          ) : routeSnapshot && (routeSnapshot.routeName || currentNode || nextNode) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Route Code & Name</div>
                <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#1e293b', marginTop: '2px' }}>
                  {routeSnapshot.routeName || name} ({routeSnapshot.routeCode || code})
                </div>
                <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: '2px', fontWeight: '600' }}>
                  Level: {routeSnapshot.level || 'BLOCK'} • Routes Count: {childRoutes.length}
                </div>
              </div>

              {currentNode && (
                <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#047857', textTransform: 'uppercase', fontWeight: '700' }}>Start Node (Current GP)</div>
                  <div style={{ fontWeight: '700', color: '#065f46', fontSize: '0.9rem', marginTop: '2px' }}>
                    {currentNode.name} ({currentNode.code})
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#047857', marginTop: '2px', fontFamily: 'monospace' }}>
                    📍 Lat: {currentNode.lat}, Lng: {currentNode.lng}
                  </div>
                </div>
              )}

              {nextNode && (
                <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.7rem', color: '#b91c1c', textTransform: 'uppercase', fontWeight: '700' }}>End Node (Next Target GP)</div>
                  <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '0.9rem', marginTop: '2px' }}>
                    {nextNode.name} ({nextNode.code})
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: '2px', fontFamily: 'monospace' }}>
                    📍 Lat: {nextNode.lat}, Lng: {nextNode.lng}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '20px', color: '#64748b', textAlign: 'center', fontSize: '0.82rem' }}>
              Select a child route from the hierarchy panel to view detailed node specifications.
            </div>
          )}
        </div>
      </div>

      {/* 5. Location & Network Attributes */}
      <div className="app-card" style={{ padding: '16px' }}>
        <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LucideGlobe size={18} color="#0284c7" />
          <span>Location & Network Attributes</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '0.82rem' }}>
          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Company & Phase</div>
            <div style={{ fontWeight: '700', color: '#1e293b', marginTop: '2px' }}>
              {locCompany}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '2px', fontWeight: '600' }}>
              Phase: {locPhase}
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>District & Circle</div>
            <div style={{ fontWeight: '700', color: '#1e293b', marginTop: '2px' }}>
              {locDistrict}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
              Circle: {locCircle}
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Block & Location Code</div>
            <div style={{ fontWeight: '700', color: '#1e293b', marginTop: '2px' }}>
              {locBlock} ({locName})
            </div>
            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
              Code: {locCode}
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>OLT IP & BA/CMP</div>
            <div style={{ fontWeight: '700', color: '#0284c7', marginTop: '2px' }}>
              OLT: {locOltIp}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
              BA: {locBaCmp}
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Base GPS Coordinates</div>
            <div style={{ fontWeight: '700', color: '#0f172a', marginTop: '2px', fontFamily: 'monospace' }}>
              📍 {locLat}, {locLng}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Segment Information Table */}
      {segmentSnapshots.length > 0 && (
        <div className="app-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideLayers size={18} color="#059669" />
            <span>Assigned Ring Segments ({segmentSnapshots.length})</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 12px' }}># Order</th>
                  <th style={{ padding: '8px 12px' }}>Segment Code</th>
                  <th style={{ padding: '8px 12px' }}>Segment Name</th>
                  <th style={{ padding: '8px 12px' }}>Start Node → End Node</th>
                  <th style={{ padding: '8px 12px' }}>Length (km)</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {segmentSnapshots.map((seg, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: '700' }}>#{idx + 1}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: '700', color: '#7c3aed' }}>
                      {seg.segmentCode || `SEG-${idx + 1}`}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: '600', color: '#1e293b' }}>
                      {seg.name || seg.segmentName || 'Joint Segment'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>
                      {seg.startNodeName || 'JC0092'} → {seg.endNodeName || 'JC0111'}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0284c7' }}>
                      {seg.lengthKm ? Number(seg.lengthKm).toFixed(3) : '1.800'} km
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: '700' }}>
                        {seg.status || 'ASSIGNED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 7. EXECUTION DETAILS SECTION (REAL BACKEND DATA)   */}
      {/* ================================================== */}
      <div className="app-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Section Header & Date Filter Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideActivity size={22} color="#059669" />
              <span>Execution Details & Live Field Logs</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
              Real execution status, pits, trenches, depth captures, photos, and videos from backend field records
            </div>
          </div>

          {/* Date Selector Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem' }}>
              <LucideCalendar size={15} color="#0284c7" />
              <span style={{ fontWeight: '600', color: '#475569' }}>Execution Date:</span>
              <select
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                style={{ background: 'transparent', border: 'none', fontWeight: '700', color: '#0f172a', cursor: 'pointer', outline: 'none', fontSize: '0.8rem' }}
              >
                <option value="ALL">All Dates ({availableDates.length} recorded)</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* EXECUTION STATUS CARDS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>

          {/* Trenching Card */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: '800', textTransform: 'uppercase' }}>Trenching</span>
              <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px' }}>
                {activeShots.length > 0 ? 'COMPLETED' : 'PENDING'}
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#15803d', marginTop: '6px' }}>
              {executionData?.statistics?.totalShots ?? activeShots.length} Trenches
            </div>
            <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: '2px', fontWeight: '600' }}>
              Length: {executionData?.statistics?.formattedDistance || '0 m'}
            </div>
          </div>

          {/* Pits Card */}
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: '800', textTransform: 'uppercase' }}>Pits</span>
              <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px' }}>
                {activePits.length > 0 ? 'COMPLETED' : 'PENDING'}
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#b45309', marginTop: '6px' }}>
              {executionData?.statistics?.totalPits ?? activePits.length} Pits
            </div>
            <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: '2px', fontWeight: '600' }}>
              Start & End Coupling Pits
            </div>
          </div>

          {/* Depth Captures Card */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#075985', fontWeight: '800', textTransform: 'uppercase' }}>Depth Measurements</span>
              <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px' }}>
                {activeDepthPoints.length > 0 ? 'COMPLETED' : 'PENDING'}
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0284c7', marginTop: '6px' }}>
              {executionData?.statistics?.totalDepthReadings ?? activeDepthPoints.length} Points
            </div>
            <div style={{ fontSize: '0.72rem', color: '#075985', marginTop: '2px', fontWeight: '600' }}>
              Range: {executionData?.statistics?.depthRange || 'N/A'}
            </div>
          </div>

          {/* Ducting Card */}
          <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', padding: '14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#6b21a8', fontWeight: '800', textTransform: 'uppercase' }}>Ducting</span>
              <span style={{ background: '#f3e8ff', color: '#7c3aed', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px' }}>
                RUNNING
              </span>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#7c3aed', marginTop: '6px' }}>
              {activeShots.length > 0 ? `${activeShots.length} Shots Ducting` : '1 Shot Awaiting Ducting'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#6b21a8', marginTop: '2px', fontWeight: '600' }}>
              HDPE Duct Laying
            </div>
          </div>

          {/* Photos Card */}
          <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#9d174d', fontWeight: '800', textTransform: 'uppercase' }}>Photos</span>
              <span style={{ background: '#fce7f3', color: '#be185d', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px' }}>
                Available
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#be185d', marginTop: '6px' }}>
              {totalPhotos} Photos
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9d174d', marginTop: '2px', fontWeight: '600' }}>
              Trench, Pit & Depth Captures
            </div>
          </div>

          {/* Video Card */}
          <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', padding: '14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#9a3412', fontWeight: '800', textTransform: 'uppercase' }}>Video</span>
              <span style={{ background: '#ffedd5', color: '#c2410c', fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px' }}>
                {totalVideos > 0 ? 'Available' : 'N/A'}
              </span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#c2410c', marginTop: '6px' }}>
              {totalVideos} Videos
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9a3412', marginTop: '2px', fontWeight: '600' }}>
              Pit-to-Pit Video Recording
            </div>
          </div>

        </div>

        {/* EXECUTION TAB NAVIGATION */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '2px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveExecutionTab('trenches')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeExecutionTab === 'trenches' ? '3px solid #059669' : '3px solid transparent',
              color: activeExecutionTab === 'trenches' ? '#059669' : '#64748b',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideWrench size={16} /> Trenches ({activeShots.length})
          </button>

          <button
            onClick={() => setActiveExecutionTab('pits')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeExecutionTab === 'pits' ? '3px solid #059669' : '3px solid transparent',
              color: activeExecutionTab === 'pits' ? '#059669' : '#64748b',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideMapPin size={16} /> Pits ({activePits.length})
          </button>

          <button
            onClick={() => setActiveExecutionTab('depth')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeExecutionTab === 'depth' ? '3px solid #059669' : '3px solid transparent',
              color: activeExecutionTab === 'depth' ? '#059669' : '#64748b',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideRuler size={16} /> Depth Captures ({activeDepthPoints.length})
          </button>

          <button
            onClick={() => setActiveExecutionTab('telemetry')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeExecutionTab === 'telemetry' ? '3px solid #059669' : '3px solid transparent',
              color: activeExecutionTab === 'telemetry' ? '#059669' : '#64748b',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideTruck size={16} /> Telemetry & Machine Specs
          </button>

          <button
            onClick={() => setActiveExecutionTab('media')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeExecutionTab === 'media' ? '3px solid #059669' : '3px solid transparent',
              color: activeExecutionTab === 'media' ? '#059669' : '#64748b',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LucideCamera size={16} /> All Media Gallery ({allMediaList.length})
          </button>
        </div>

        {/* TAB CONTENTS */}

        {/* TAB 1: TRENCHES LIST */}
        {activeExecutionTab === 'trenches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {activeShots.length > 0 ? (
              activeShots.map((trench, sIdx) => {
                const startPitName = trench.startPit?.name || trench.startPit?.serialNo || 'Start Pit';
                const endPitName = trench.endPit?.name || trench.endPit?.serialNo || 'End Pit';
                const videoMedia = (trench.photos || []).find(p => p.isVideo);
                const photoMedia = (trench.photos || []).filter(p => !p.isVideo);
                const dps = trench.depthReadings || [];

                return (
                  <div
                    key={sIdx}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '16px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    {/* Trench Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ background: '#059669', color: '#ffffff', padding: '4px 10px', borderRadius: '6px', fontWeight: '800', fontSize: '0.82rem' }}>
                          Trench {sIdx + 1}
                        </span>
                        <div>
                          <div style={{ fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>
                            {startPitName} → {endPitName}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '1px' }}>
                            Serial No: <strong>{trench.serialNo}</strong> | Cable: <strong>{trench.cableType}</strong> | Strata: <strong>{trench.strataType}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '800', fontSize: '1.15rem', color: '#0284c7' }}>
                            {trench.formattedLength || `${trench.lengthMeters} m`}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700' }}>
                            Avg Depth: {trench.depth} m ({dps.length} pts)
                          </div>
                        </div>

                        <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700' }}>
                          Completed
                        </span>
                      </div>
                    </div>

                    {/* Pit to Pit Video (if available) */}
                    {videoMedia && (
                      <div style={{ background: '#090d16', padding: '12px', borderRadius: '10px', marginTop: '4px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <LucideVideo size={16} color="#38bdf8" />
                          <span>Pit-to-Pit Video Recording ({startPitName} → {endPitName})</span>
                        </div>
                        <video
                          controls
                          src={formatImageUrl(videoMedia.photoUrl || videoMedia.url)}
                          style={{ width: '100%', maxHeight: '320px', borderRadius: '8px', objectFit: 'contain', background: '#000000' }}
                        >
                          Your browser does not support HTML5 video player.
                        </video>
                      </div>
                    )}

                    {/* Trench Start Photo */}
                    {photoMedia.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', marginBottom: '6px' }}>
                          📷 Trench Execution Photos ({photoMedia.length})
                        </div>
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                          {photoMedia.map((ph, pIdx) => (
                            <div key={pIdx} style={{ position: 'relative' }}>
                              <img
                                src={formatImageUrl(ph.photoUrl || ph.url)}
                                alt={ph.label || `Trench ${sIdx + 1} Photo`}
                                onClick={() => openLightbox(photoMedia, pIdx)}
                                style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trench Depth Captures Table */}
                    {dps.length > 0 && (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <LucideRuler size={14} color="#059669" />
                          <span>Depth Captures in Trench {sIdx + 1} ({dps.length} Points Recorded)</span>
                        </div>
                        <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                          <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.73rem' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5 }}>
                                <th style={{ padding: '5px 8px' }}># Point</th>
                                <th style={{ padding: '5px 8px' }}>Depth (m)</th>
                                <th style={{ padding: '5px 8px' }}>Temp (°C)</th>
                                <th style={{ padding: '5px 8px' }}>Road Offset</th>
                                <th style={{ padding: '5px 8px' }}>Latitude, Longitude</th>
                                <th style={{ padding: '5px 8px' }}>Photo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dps.map((dp, dIdx) => (
                                <tr key={dIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '4px 8px', fontWeight: '700' }}>Point {dp.pointNo || dIdx + 1}</td>
                                  <td style={{ padding: '4px 8px', fontWeight: '700', color: '#059669' }}>{dp.depth} m</td>
                                  <td style={{ padding: '4px 8px' }}>{dp.temp ? `${dp.temp}°C` : 'N/A'}</td>
                                  <td style={{ padding: '4px 8px' }}>{dp.offset ? `${dp.offset} m` : 'N/A'}</td>
                                  <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: '0.7rem' }}>📍 {dp.lat}, {dp.lng}</td>
                                  <td style={{ padding: '4px 8px' }}>
                                    {dp.photos && dp.photos.length > 0 && (
                                      <button
                                        onClick={() => openLightbox(dp.photos, 0)}
                                        style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 6px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: '600' }}
                                      >
                                        📷 View Photo
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#64748b' }}>
                No trenching records available for the selected filter date.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PITS CARDS */}
        {activeExecutionTab === 'pits' && (
          <div>
            {activePits.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {activePits.map((pit, pIdx) => {
                  const roleLabel = pIdx === 0 ? 'START PIT' : (pIdx === activePits.length - 1 ? 'END PIT' : 'COUPLING PIT');
                  const pitPhotos = pit.photos || [];

                  return (
                    <div
                      key={pIdx}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '14px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#b45309' }}>
                          🚜 {pit.id} ({pit.name})
                        </div>
                        <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '800' }}>
                          {roleLabel}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.5 }}>
                        Latitude: <strong style={{ fontFamily: 'monospace' }}>{pit.lat}</strong><br />
                        Longitude: <strong style={{ fontFamily: 'monospace' }}>{pit.lng}</strong><br />
                        Depth: <strong style={{ color: '#059669' }}>{pit.depth ? `${pit.depth} m` : 'N/A'}</strong> | Width: <strong>{pit.width ? `${pit.width} m` : 'N/A'}</strong><br />
                        Side: <strong>{pit.side || 'LHS'}</strong> | Type: <strong>{pit.type}</strong><br />
                        Digging Time: <strong>{pit.diggingTime || 'N/A'}</strong>
                      </div>

                      {pitPhotos.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', marginBottom: '4px' }}>
                            📷 Pit Photos ({pitPhotos.length})
                          </div>
                          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                            {pitPhotos.map((ph, phIdx) => (
                              <img
                                key={phIdx}
                                src={formatImageUrl(ph.photoUrl || ph.url)}
                                alt={ph.label || `Pit Photo ${phIdx + 1}`}
                                onClick={() => openLightbox(pitPhotos, phIdx)}
                                style={{ width: '56px', height: '56px', borderRadius: '6px', objectFit: 'cover', border: '1px solid #cbd5e1', cursor: 'pointer', flexShrink: 0 }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#64748b' }}>
                No pit records available for the selected date.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COMPLETE DEPTH CAPTURES LOG */}
        {activeExecutionTab === 'depth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#f0f9ff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: '800', textTransform: 'uppercase' }}>Depth Capture Summary</div>
                <div style={{ fontWeight: '800', fontSize: '1.1rem', color: '#0284c7', marginTop: '2px' }}>
                  {activeDepthPoints.length} Recorded Depth Points
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: '800', textTransform: 'uppercase' }}>Minimum – Maximum Range</div>
                <div style={{ fontWeight: '800', fontSize: '1.1rem', color: '#059669', marginTop: '2px' }}>
                  {executionData?.statistics?.depthRange || 'N/A'}
                </div>
              </div>
            </div>

            {activeDepthPoints.length > 0 ? (
              <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '10px' }}>
                <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5 }}>
                      <th style={{ padding: '8px 12px' }}># Point</th>
                      <th style={{ padding: '8px 12px' }}>Depth (m)</th>
                      <th style={{ padding: '8px 12px' }}>Temp (°C)</th>
                      <th style={{ padding: '8px 12px' }}>Road Offset (m)</th>
                      <th style={{ padding: '8px 12px' }}>Exact GPS Coordinates</th>
                      <th style={{ padding: '8px 12px' }}>Capture Date/Time</th>
                      <th style={{ padding: '8px 12px' }}>Photo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDepthPoints.map((dp, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '7px 12px', fontWeight: '700' }}>Point {dp.pointNo || idx + 1}</td>
                        <td style={{ padding: '7px 12px', fontWeight: '800', color: '#059669' }}>{dp.depth} m</td>
                        <td style={{ padding: '7px 12px' }}>{dp.temp ? `${dp.temp}°C` : 'N/A'}</td>
                        <td style={{ padding: '7px 12px' }}>{dp.offset ? `${dp.offset} m` : 'N/A'}</td>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#0284c7' }}>📍 {dp.lat}, {dp.lng}</td>
                        <td style={{ padding: '7px 12px', color: '#64748b' }}>{dp.capturedAt || 'N/A'}</td>
                        <td style={{ padding: '7px 12px' }}>
                          {dp.photos && dp.photos.length > 0 && (
                            <button
                              onClick={() => openLightbox(dp.photos, 0)}
                              style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: '600' }}
                            >
                              📷 View Photo
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#64748b' }}>
                No depth capture points recorded for the selected date.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TELEMETRY & MACHINE SPECS */}
        {activeExecutionTab === 'telemetry' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {(machineDetails || operatorDetails || locatorDetails) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                {machineDetails && (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Machine & Rig Details</div>
                    <div style={{ fontWeight: '800', color: '#0f172a', marginTop: '3px', fontSize: '0.95rem' }}>
                      Machine ID: {machineDetails.machineId}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                      Vendor: <strong>{machineDetails.vendorName || vendorName}</strong><br />
                      Cable: <strong>{machineDetails.cableType || '24F OFC'}</strong><br />
                      RoW: <strong>{machineDetails.rowArea || 'Village Road'}</strong>
                    </div>
                    {machineDetails.machineImage?.photoUrl && (
                      <button
                        onClick={() => openLightbox([machineDetails.machineImage], 0)}
                        style={{ marginTop: '8px', fontSize: '0.75rem', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: '700' }}
                      >
                        📷 View Machine Photo
                      </button>
                    )}
                  </div>
                )}

                {operatorDetails && (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>HDD Operator</div>
                    <div style={{ fontWeight: '800', color: '#0f172a', marginTop: '3px', fontSize: '0.95rem' }}>
                      {operatorDetails.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                      Mobile: <strong>{operatorDetails.mobileNumber}</strong>
                    </div>
                    {operatorDetails.operatorPhoto?.photoUrl && (
                      <button
                        onClick={() => openLightbox([operatorDetails.operatorPhoto], 0)}
                        style={{ marginTop: '8px', fontSize: '0.75rem', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: '700' }}
                      >
                        📷 View Operator Selfie
                      </button>
                    )}
                  </div>
                )}

                {locatorDetails && (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Locator Pilot</div>
                    <div style={{ fontWeight: '800', color: '#0f172a', marginTop: '3px', fontSize: '0.95rem' }}>
                      {locatorDetails.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                      Mobile: <strong>{locatorDetails.mobileNumber}</strong>
                    </div>
                    {locatorDetails.photo?.photoUrl && (
                      <button
                        onClick={() => openLightbox([locatorDetails.photo], 0)}
                        style={{ marginTop: '8px', fontSize: '0.75rem', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: '700' }}
                      >
                        📷 View Locator Selfie
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* OTDR / Fiber Core Survey Trace Table */}
            {fiberHealthTable.length > 0 && (
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                  📊 OTDR Core Health & Fiber Loss Table ({fiberHealthTable.length} Cores)
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                  <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '6px 10px' }}>Core #</th>
                        <th style={{ padding: '6px 10px' }}>Start GP → End Target</th>
                        <th style={{ padding: '6px 10px' }}>Status</th>
                        <th style={{ padding: '6px 10px' }}>OTDR Length (m)</th>
                        <th style={{ padding: '6px 10px' }}>Avg Loss (dB)</th>
                        <th style={{ padding: '6px 10px' }}>Events</th>
                        <th style={{ padding: '6px 10px' }}>OTDR Trace Photo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiberHealthTable.map((fh, fIdx) => (
                        <tr key={fIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px', fontWeight: '800', color: '#7c3aed' }}>Core {fh.fiberCoreNo || fIdx + 1}</td>
                          <td style={{ padding: '6px 10px' }}>{fh.startGpName} → {fh.endBlockAndGpName}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ background: fh.status === 'HEALTHY' ? '#ecfdf5' : '#fef2f2', color: fh.status === 'HEALTHY' ? '#059669' : '#dc2626', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                              {fh.status}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: '700', color: '#0284c7' }}>{fh.otdrLengthMtr} m</td>
                          <td style={{ padding: '6px 10px' }}>{fh.avgLossDb} dB</td>
                          <td style={{ padding: '6px 10px' }}>{fh.noOfEvents}</td>
                          <td style={{ padding: '6px 10px' }}>
                            {fh.otdrScreenPhoto?.photoUrl && (
                              <button
                                onClick={() => openLightbox([fh.otdrScreenPhoto], 0)}
                                style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: '600' }}
                              >
                                📷 View Trace Photo
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ALL MEDIA GALLERY */}
        {activeExecutionTab === 'media' && (
          <div>
            {allMediaList.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' }}>
                {allMediaList.map((media, mIdx) => (
                  <div
                    key={mIdx}
                    onClick={() => openLightbox(allMediaList, mIdx)}
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid #cbd5e1',
                      height: '110px',
                      cursor: 'pointer',
                      background: '#090d16'
                    }}
                  >
                    {media.isVideo ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: '#38bdf8' }}>
                        <LucidePlay size={28} />
                        <span style={{ fontSize: '0.65rem', marginTop: '4px', fontWeight: '700' }}>VIDEO</span>
                      </div>
                    ) : (
                      <img
                        src={formatImageUrl(media.photoUrl || media.url)}
                        alt={media.label || `Execution Media ${mIdx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.65)', color: '#ffffff', fontSize: '0.6rem', padding: '3px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {media.parentType}: {media.parentId}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#64748b' }}>
                No execution photos or videos recorded.
              </div>
            )}
          </div>
        )}

      </div>

      {/* 8. Approval Chain & Audit Log */}
      <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LucideShieldCheck size={18} color="#059669" />
          <span>Approval Chain & Audit Log</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.78rem', color: '#475569' }}>
          <div>Created At: <strong>{task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A'}</strong></div>
          <div>Updated At: <strong>{task.updatedAt ? new Date(task.updatedAt).toLocaleString() : 'N/A'}</strong></div>
          <div>Submitted At: <strong>{task.submittedAt ? new Date(task.submittedAt).toLocaleString() : 'N/A'}</strong></div>
          <div>Completed At: <strong>{task.completedAt ? new Date(task.completedAt).toLocaleString() : 'N/A'}</strong></div>
        </div>

        {task.rejectionReason && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px', borderRadius: '8px', fontSize: '0.8rem' }}>
            Rejection Reason: {task.rejectionReason}
          </div>
        )}
      </div>

    </div>
  );
};
