import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  LucideImage,
  LucideRuler,
  LucideCheckCircle2,
  LucideTruck,
  LucideFilter,
  LucideX
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { vendorService } from '../../services/vendorService';
import { TaskRouteMap } from '../../components/tasks/TaskRouteMap';
import { PhotoLightbox, formatImageUrl } from '../../components/common/PhotoLightbox';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { mapHddExecutionResponse, filterHddExecutionByDate, parseDateToYMD } from '../../utils/mapHddExecutionResponse';
import { SearchableSelect } from '../../components/common/Select';
import { PageHeader } from '../../components/common/PageHeader';
import { formatKm } from '../../utils/formatters';

const display = (value, fallback = '—') => {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
};

const statusBadgeClass = (value) => {
  const s = String(value || '').toUpperCase();
  if (['COMPLETED', 'APPROVED', 'HEALTHY', 'ASSIGNED'].includes(s)) return 'badge-running';
  if (['IN_PROGRESS', 'RUNNING'].includes(s)) return 'badge-idle';
  if (['REJECTED', 'FAILED', 'CANCELLED'].includes(s)) return 'badge-breakdown';
  return 'badge-neutral';
};

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

const DepthPointsTable = ({ points, onOpenPhoto }) => (
  <div className="table-container">
    <table className="data-table">
      <thead>
        <tr>
          <th>Point</th>
          <th>Depth</th>
          <th>Temp</th>
          <th>Offset</th>
          <th>GPS</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {points.map((dp, dIdx) => (
          <tr key={dIdx}>
            <td>Point {dp.pointNo || dIdx + 1}</td>
            <td>{dp.depth != null ? `${Number(dp.depth).toFixed(2)} m` : '—'}</td>
            <td>{dp.temp ? `${dp.temp}°C` : '—'}</td>
            <td>{dp.offset ? `${dp.offset} m` : '—'}</td>
            <td>{dp.lat && dp.lng ? `${dp.lat}, ${dp.lng}` : '—'}</td>
            <td>
              {dp.photos && dp.photos.length > 0 ? (
                <button type="button" className="btn-secondary" onClick={() => onOpenPhoto(dp.photos, 0)}>
                  Photo
                </button>
              ) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DetailModal = ({ open, title, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card task-detail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="page-header" style={{ padding: '16px 20px 8px' }}>
          <h2 className="page-title" style={{ fontSize: '1rem' }}>{title}</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            <LucideX size={14} /> Close
          </button>
        </div>
        <div className="task-detail-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
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
  const [depthModal, setDepthModal] = useState(null);

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
        <div className="app-card" style={{ padding: 24, textAlign: 'center' }}>
          <LucideAlertCircle size={28} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
          <h3 className="page-title" style={{ fontSize: '1rem' }}>Could not load task</h3>
          <p className="page-subtitle" style={{ marginTop: 6 }}>{error || 'Unable to display requested task.'}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => navigate('/tasks')} className="btn-secondary">Back to tasks</button>
            <button type="button" onClick={fetchTaskDetails} className="btn-primary">Retry</button>
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
    <div className="screen-container">

      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxPhotos(null)}
        />
      )}
      <DetailModal
        open={Boolean(depthModal)}
        title={depthModal?.title || 'Depth captures'}
        onClose={() => setDepthModal(null)}
      >
        <DepthPointsTable points={depthModal?.points || []} onOpenPhoto={openLightbox} />
      </DetailModal>

      <PageHeader
        title={name}
        subtitle={`${display(locBlock)}, ${display(locDistrict)} · ${display(locCode)}`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => navigate('/tasks')}>
              <LucideArrowLeft size={14} /> Back
            </button>
            <a className="btn-primary" href={`/map-view/${taskId}`} target="_blank" rel="noopener noreferrer">
              <LucideExternalLink size={14} /> Open map
            </a>
            <button type="button" className="btn-secondary" onClick={fetchTaskDetails}>
              <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </>
        }
      />

      <div className="app-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge-pill badge-neutral">{code}</span>
            <span className="badge-pill badge-neutral">{typeStr}</span>
            {routeSnapshot.level ? <span className="badge-pill badge-neutral">{routeSnapshot.level}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`badge-pill ${statusBadgeClass(statusStr)}`}>{statusStr}</span>
            <span className={`badge-pill ${statusBadgeClass(approvalStr)}`}>Approval {approvalStr}</span>
            <span className="badge-pill badge-neutral">Stage {stageStr}</span>
          </div>
        </div>

        <dl className="vendor-dl" style={{ marginTop: 16 }}>
          <div>
            <dt>Vendor</dt>
            <dd>{display(vendorName)}</dd>
          </div>
          <div>
            <dt>Assignee</dt>
            <dd>
              {display(assigneeName)}{assigneeMobile ? ` · ${assigneeMobile}` : ''}
              {assigneeRole ? <div className="page-subtitle" style={{ marginTop: 2 }}>{assigneeRole}</div> : null}
            </dd>
          </div>
          <div>
            <dt>Approver</dt>
            <dd>
              {display(approverName)}{approverRole ? ` · ${approverRole}` : ''}
              <div className="page-subtitle" style={{ marginTop: 2 }}>
                Created by {display(createdBy)}{task.createdAt ? ` · ${new Date(task.createdAt).toLocaleDateString()}` : ''}
              </div>
            </dd>
          </div>
        </dl>
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Planned</div>
          <div className="kpi-value">{formatKm(plannedScopeKm)}</div>
          <div className="kpi-sub">Covered {formatKm(coveredKm)} ({pct}%)</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Remaining</div>
          <div className="kpi-value">{formatKm(remainingKm)}</div>
          <div className="kpi-sub">Target {task.dailyTaskTarget != null ? formatKm(task.dailyTaskTarget) : '—'} / day</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Routes</div>
          <div className="kpi-value">{childRoutes.length > 0 ? childRoutes.length : (segmentSnapshots.length || 0)}</div>
          <div className="kpi-sub">Completed {task.completedSegments || 0}</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Pits</div>
          <div className="kpi-value">{executionData?.statistics?.totalPits ?? activePits.length}</div>
          <div className="kpi-sub">{display(executionData?.workExecutionMode || fieldData?.workExecutionMode || (trenching ? 'HDD' : null))}</div>
        </div>
      </div>

      {/* 3. Block Planned Route Hierarchy Panel */}
      {(isBlockLevel || childRoutes.length > 0 || childrenTasks.length > 0) && (
        <div className="app-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="vendor-section-title" style={{ marginBottom: 0 }}>Route hierarchy</div>
              <div className="page-subtitle">{childRoutes.length || childrenTasks.length} child routes</div>
            </div>
            <span className="badge-pill badge-neutral">{routeSnapshot.level || 'BLOCK'}</span>
          </div>

          <div className="vendor-section">
            <dl className="vendor-dl">
              <div>
                <dt>Parent block</dt>
                <dd>{name} · {code}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{display(locCode)} · {display(locDistrict)}</dd>
              </div>
              <div>
                <dt>OLT</dt>
                <dd>{display(locOltIp)}</dd>
              </div>
              <div>
                <dt>Planned</dt>
                <dd>{formatKm(plannedScopeKm)} · covered {formatKm(coveredKm)} ({pct}%)</dd>
              </div>
            </dl>
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
                    className={`task-route-card${isSelected ? ' is-selected' : ''}`}
                    onClick={() => setSelectedRouteIndex(isSelected ? null : rIdx)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 650 }}>{route.routeName} · {display(route.routeCode)}</div>
                        <div className="page-subtitle" style={{ marginTop: 2 }}>
                          {display(route.topologyType)} · {display(route.level)}
                          {matchedChildTask ? ` · ${matchedChildTask.taskCode}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 650 }}>{formatKm(route.lengthKm)}</div>
                          <div className="page-subtitle">
                            {matchedChildTask ? `${matchedChildTask.totalSegments || 0} segments` : 'Planned'}
                          </div>
                        </div>
                        {matchedChildTask && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/tasks/${matchedChildTask.id}`);
                            }}
                          >
                            Inspect
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                      {route.currentNode && (
                        <div className="task-node">
                          <div className="vendor-section-title">Start</div>
                          <div style={{ fontWeight: 650 }}>{route.currentNode.name} · {display(route.currentNode.code)}</div>
                          <div className="page-subtitle" style={{ marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                            {route.currentNode.lat}, {route.currentNode.lng}
                          </div>
                        </div>
                      )}
                      {route.nextNode && (
                        <div className="task-node">
                          <div className="vendor-section-title">End</div>
                          <div style={{ fontWeight: 650 }}>{route.nextNode.name} · {display(route.nextNode.code)}</div>
                          <div className="page-subtitle" style={{ marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                            {route.nextNode.lat}, {route.nextNode.lng}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : childrenTasks.length > 0 ? (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Route</th>
                    <th>Assignee</th>
                    <th>Start → End</th>
                    <th>Length</th>
                    <th>Segments</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {childrenTasks.map((ct, idx) => (
                    <tr key={idx}>
                      <td>{display(ct.taskCode)}</td>
                      <td>{display(ct.displayName)}</td>
                      <td>{display(ct.assigneeSnapshot?.name || ct.assigneeName)}</td>
                      <td>{display(ct.routeSnapshot?.currentNode?.name)} → {display(ct.routeSnapshot?.nextNode?.name)}</td>
                      <td>{ct.routeSnapshot?.lengthKm != null ? formatKm(ct.routeSnapshot.lengthKm) : '—'}</td>
                      <td>{ct.totalSegments || 0}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn-ghost" onClick={() => navigate(`/tasks/${ct.id}`)}>Inspect</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      <TaskRouteMap
        routeNodes={routeNodes}
        currentNode={currentNode}
        nextNode={nextNode}
        segmentSnapshots={segmentSnapshots}
        childRoutes={childRoutes}
        selectedRouteIndex={selectedRouteIndex}
        pits={activePits.length > 0 ? activePits : (trenching?.pitDetails || [])}
        depthCaptures={activeDepthPoints.length > 0 ? activeDepthPoints : (trenching?.hddShot?.[0]?.depthCapture || [])}
        height="560px"
        title="Route map"
        onOpenPhotos={openLightbox}
      />

      <div className="app-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="vendor-section-title" style={{ marginBottom: 0 }}>Route specs</div>

          {selectedRouteIndex !== null && childRoutes[selectedRouteIndex] ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="task-node">
                <div className="vendor-section-title">Selected route</div>
                <div style={{ fontWeight: 650 }}>
                  {childRoutes[selectedRouteIndex].routeName} · {display(childRoutes[selectedRouteIndex].routeCode)}
                </div>
                <div className="page-subtitle" style={{ marginTop: 2 }}>
                  {display(childRoutes[selectedRouteIndex].topologyType)} · {formatKm(childRoutes[selectedRouteIndex].lengthKm)}
                </div>
              </div>
              {childRoutes[selectedRouteIndex].currentNode && (
                <div className="task-node">
                  <div className="vendor-section-title">Start</div>
                  <div style={{ fontWeight: 650 }}>
                    {childRoutes[selectedRouteIndex].currentNode.name} · {display(childRoutes[selectedRouteIndex].currentNode.code)}
                  </div>
                  <div className="page-subtitle" style={{ marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {childRoutes[selectedRouteIndex].currentNode.lat}, {childRoutes[selectedRouteIndex].currentNode.lng}
                  </div>
                </div>
              )}
              {childRoutes[selectedRouteIndex].nextNode && (
                <div className="task-node">
                  <div className="vendor-section-title">End</div>
                  <div style={{ fontWeight: 650 }}>
                    {childRoutes[selectedRouteIndex].nextNode.name} · {display(childRoutes[selectedRouteIndex].nextNode.code)}
                  </div>
                  <div className="page-subtitle" style={{ marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {childRoutes[selectedRouteIndex].nextNode.lat}, {childRoutes[selectedRouteIndex].nextNode.lng}
                  </div>
                </div>
              )}
            </div>
          ) : routeSnapshot && (routeSnapshot.routeName || currentNode || nextNode) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="task-node">
                <div className="vendor-section-title">Route</div>
                <div style={{ fontWeight: 650 }}>{routeSnapshot.routeName || name} · {routeSnapshot.routeCode || code}</div>
                <div className="page-subtitle" style={{ marginTop: 2 }}>
                  {display(routeSnapshot.level)} · {childRoutes.length} routes
                </div>
              </div>
              {currentNode && (
                <div className="task-node">
                  <div className="vendor-section-title">Start</div>
                  <div style={{ fontWeight: 650 }}>{currentNode.name} · {display(currentNode.code)}</div>
                  <div className="page-subtitle" style={{ marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {currentNode.lat}, {currentNode.lng}
                  </div>
                </div>
              )}
              {nextNode && (
                <div className="task-node">
                  <div className="vendor-section-title">End</div>
                  <div style={{ fontWeight: 650 }}>{nextNode.name} · {display(nextNode.code)}</div>
                  <div className="page-subtitle" style={{ marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {nextNode.lat}, {nextNode.lng}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="task-empty">Select a child route to see node specs.</div>
          )}
      </div>

      {/* 5. Location & Network Attributes */}
      <div className="app-card" style={{ padding: 16 }}>
        <div className="vendor-section-title">Location</div>
        <dl className="vendor-dl">
          <div>
            <dt>Company</dt>
            <dd>{display(locCompany)}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{display(locPhase)}</dd>
          </div>
          <div>
            <dt>District</dt>
            <dd>{display(locDistrict)}</dd>
          </div>
          <div>
            <dt>Circle</dt>
            <dd>{display(locCircle)}</dd>
          </div>
          <div>
            <dt>Block</dt>
            <dd>{display(locBlock)}{locName ? ` · ${locName}` : ''}</dd>
          </div>
          <div>
            <dt>Code</dt>
            <dd>{display(locCode)}</dd>
          </div>
          <div>
            <dt>OLT</dt>
            <dd>{display(locOltIp)}</dd>
          </div>
          <div>
            <dt>BA</dt>
            <dd>{display(locBaCmp)}</dd>
          </div>
          <div>
            <dt>GPS</dt>
            <dd style={{ fontFamily: 'var(--font-mono)' }}>{display(locLat)}, {display(locLng)}</dd>
          </div>
        </dl>
      </div>

      {/* 6. Segment Information Table */}
      {segmentSnapshots.length > 0 && (
        <div className="app-card" style={{ padding: 16 }}>
          <div className="vendor-section-title">Segments ({segmentSnapshots.length})</div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Start → End</th>
                  <th>Length</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {segmentSnapshots.map((seg, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{display(seg.segmentCode)}</td>
                    <td>{display(seg.name || seg.segmentName)}</td>
                    <td>{display(seg.startNodeName)} → {display(seg.endNodeName)}</td>
                    <td>{seg.lengthKm != null ? formatKm(seg.lengthKm) : '—'}</td>
                    <td>
                      <span className={`badge-pill ${statusBadgeClass(seg.status)}`}>{display(seg.status)}</span>
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
      <div className="app-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="vendor-section-title" style={{ marginBottom: 0 }}>Execution</div>
            <div className="page-subtitle">Pits, trenches, depth, and field media</div>
          </div>
          <div style={{ minWidth: 220 }}>
            <SearchableSelect value={selectedDate} onChange={(e) => handleDateChange(e.target.value)}>
              <option value="ALL">All dates ({availableDates.length})</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </SearchableSelect>
          </div>
        </div>

        <div className="kpi-strip kpi-strip-6">
          <div className="kpi-cell kpi-cell-static">
            <div className="kpi-label">Trenches</div>
            <div className="kpi-value">{executionData?.statistics?.totalShots ?? activeShots.length}</div>
            <div className="kpi-sub">{executionData?.statistics?.formattedDistance || '0 m'}</div>
          </div>
          <div className="kpi-cell kpi-cell-static">
            <div className="kpi-label">Pits</div>
            <div className="kpi-value">{executionData?.statistics?.totalPits ?? activePits.length}</div>
            <div className="kpi-sub">{activePits.length > 0 ? 'Recorded' : 'None'}</div>
          </div>
          <div className="kpi-cell kpi-cell-static">
            <div className="kpi-label">Depth points</div>
            <div className="kpi-value">{executionData?.statistics?.totalDepthReadings ?? activeDepthPoints.length}</div>
            <div className="kpi-sub">{display(executionData?.statistics?.depthRange)}</div>
          </div>
          <div className="kpi-cell kpi-cell-static">
            <div className="kpi-label">Ducting</div>
            <div className="kpi-value">{activeShots.length}</div>
            <div className="kpi-sub">{activeShots.length > 0 ? 'Shots' : 'None'}</div>
          </div>
          <div className="kpi-cell kpi-cell-static">
            <div className="kpi-label">Photos</div>
            <div className="kpi-value">{totalPhotos}</div>
            <div className="kpi-sub">Field captures</div>
          </div>
          <div className="kpi-cell kpi-cell-static">
            <div className="kpi-label">Videos</div>
            <div className="kpi-value">{totalVideos}</div>
            <div className="kpi-sub">Pit to pit</div>
          </div>
        </div>

        <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
          {[
            ['trenches', `Trenches (${activeShots.length})`],
            ['pits', `Pits (${activePits.length})`],
            ['depth', `Depth (${activeDepthPoints.length})`],
            ['telemetry', 'Telemetry'],
            ['media', `Media (${allMediaList.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`tab-item${activeExecutionTab === key ? ' active' : ''}`}
              onClick={() => setActiveExecutionTab(key)}
            >
              {label}
            </button>
          ))}
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
                  <div key={sIdx} className="vendor-section" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 650 }}>Trench {sIdx + 1} · {startPitName} → {endPitName}</div>
                        <div className="page-subtitle" style={{ marginTop: 2 }}>
                          {display(trench.serialNo)} · {display(trench.cableType)} · {display(trench.strataType)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 650 }}>{trench.formattedLength || (trench.lengthMeters != null ? `${trench.lengthMeters} m` : '—')}</div>
                        <div className="page-subtitle">{trench.depth != null ? `Avg ${trench.depth} m` : '—'} · {dps.length} pts</div>
                      </div>
                    </div>

                    {videoMedia && (
                      <button
                        type="button"
                        className="task-video-tile"
                        onClick={() => openLightbox([videoMedia], 0)}
                      >
                        <LucidePlay size={28} />
                        <strong>Play trench video</strong>
                        <span>{startPitName} → {endPitName}</span>
                      </button>
                    )}

                    {photoMedia.length > 0 && (
                      <div>
                        <div className="page-subtitle" style={{ marginBottom: 6 }}>Photos ({photoMedia.length})</div>
                        <div className="task-media-thumbs">
                          {photoMedia.slice(0, 4).map((ph, pIdx) => (
                            <img
                              key={pIdx}
                              src={formatImageUrl(ph.photoUrl || ph.url)}
                              alt={ph.label || `Trench ${sIdx + 1} Photo`}
                              onClick={() => openLightbox(photoMedia, pIdx)}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ))}
                          {photoMedia.length > 4 && (
                            <button type="button" className="task-media-more" onClick={() => openLightbox(photoMedia, 4)}>
                              +{photoMedia.length - 4}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {dps.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div className="page-subtitle">{dps.length} depth points</div>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setDepthModal({ title: `Trench ${sIdx + 1} depth captures`, points: dps })}
                          >
                            View all
                          </button>
                        </div>
                        <DepthPointsTable points={dps.slice(0, 3)} onOpenPhoto={openLightbox} />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="task-empty">No trenches for this date.</div>
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
                    <div key={pIdx} className="vendor-section" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 650 }}>{display(pit.id)}{pit.name ? ` · ${pit.name}` : ''}</div>
                        <span className="badge-pill badge-neutral">{roleLabel}</span>
                      </div>
                      <dl className="vendor-dl">
                        <div>
                          <dt>GPS</dt>
                          <dd style={{ fontFamily: 'var(--font-mono)' }}>{display(pit.lat)}, {display(pit.lng)}</dd>
                        </div>
                        <div>
                          <dt>Depth / width</dt>
                          <dd>{pit.depth != null ? `${pit.depth} m` : '—'} · {pit.width != null ? `${pit.width} m` : '—'}</dd>
                        </div>
                        <div>
                          <dt>Type</dt>
                          <dd>{display(pit.type)}{pit.side ? ` · ${pit.side}` : ''}</dd>
                        </div>
                        <div>
                          <dt>Digging</dt>
                          <dd>{display(pit.diggingTime)}</dd>
                        </div>
                      </dl>

                      {pitPhotos.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                          <div className="page-subtitle" style={{ marginBottom: 4 }}>Photos ({pitPhotos.length})</div>
                          <div className="task-media-thumbs">
                            {pitPhotos.slice(0, 4).map((ph, phIdx) => (
                              <img
                                key={phIdx}
                                src={formatImageUrl(ph.photoUrl || ph.url)}
                                alt={ph.label || `Pit Photo ${phIdx + 1}`}
                                onClick={() => openLightbox(pitPhotos, phIdx)}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ))}
                            {pitPhotos.length > 4 && (
                              <button type="button" className="task-media-more" onClick={() => openLightbox(pitPhotos, 4)}>
                                +{pitPhotos.length - 4}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="task-empty">No pits for this date.</div>
            )}
          </div>
        )}

        {/* TAB 3: COMPLETE DEPTH CAPTURES LOG */}
        {activeExecutionTab === 'depth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="vendor-section">
              <dl className="vendor-dl">
                <div>
                  <dt>Points</dt>
                  <dd>{activeDepthPoints.length}</dd>
                </div>
                <div>
                  <dt>Range</dt>
                  <dd>{display(executionData?.statistics?.depthRange)}</dd>
                </div>
              </dl>
            </div>

            {activeDepthPoints.length > 0 ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setDepthModal({ title: 'All depth captures', points: activeDepthPoints })}
                  >
                    View all {activeDepthPoints.length} points
                  </button>
                </div>
                <DepthPointsTable points={activeDepthPoints.slice(0, 8)} onOpenPhoto={openLightbox} />
              </div>
            ) : (
              <div className="task-empty">No depth points for this date.</div>
            )}
          </div>
        )}

        {/* TAB 4: TELEMETRY & MACHINE SPECS */}
        {activeExecutionTab === 'telemetry' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {(machineDetails || operatorDetails || locatorDetails) ? (
              <div className="vendor-section">
                <dl className="vendor-dl">
                  {machineDetails && (
                    <>
                      <div>
                        <dt>Machine</dt>
                        <dd>{display(machineDetails.machineId)}</dd>
                      </div>
                      <div>
                        <dt>Vendor</dt>
                        <dd>{display(machineDetails.vendorName || vendorName)}</dd>
                      </div>
                      <div>
                        <dt>Cable</dt>
                        <dd>{display(machineDetails.cableType)}</dd>
                      </div>
                      <div>
                        <dt>RoW</dt>
                        <dd>{display(machineDetails.rowArea)}</dd>
                      </div>
                      {machineDetails.machineImage?.photoUrl && (
                        <div>
                          <dt>Photo</dt>
                          <dd>
                            <button type="button" className="btn-ghost" onClick={() => openLightbox([machineDetails.machineImage], 0)}>
                              View machine
                            </button>
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                  {operatorDetails && (
                    <>
                      <div>
                        <dt>Operator</dt>
                        <dd>{display(operatorDetails.name)}</dd>
                      </div>
                      <div>
                        <dt>Operator mobile</dt>
                        <dd>{display(operatorDetails.mobileNumber)}</dd>
                      </div>
                      {operatorDetails.operatorPhoto?.photoUrl && (
                        <div>
                          <dt>Photo</dt>
                          <dd>
                            <button type="button" className="btn-ghost" onClick={() => openLightbox([operatorDetails.operatorPhoto], 0)}>
                              View operator
                            </button>
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                  {locatorDetails && (
                    <>
                      <div>
                        <dt>Locator</dt>
                        <dd>{display(locatorDetails.name)}</dd>
                      </div>
                      <div>
                        <dt>Locator mobile</dt>
                        <dd>{display(locatorDetails.mobileNumber)}</dd>
                      </div>
                      {locatorDetails.photo?.photoUrl && (
                        <div>
                          <dt>Photo</dt>
                          <dd>
                            <button type="button" className="btn-ghost" onClick={() => openLightbox([locatorDetails.photo], 0)}>
                              View locator
                            </button>
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              </div>
            ) : null}

            {/* OTDR / Fiber Core Survey Trace Table */}
            {fiberHealthTable.length > 0 && (
              <div>
                <div className="vendor-section-title">OTDR cores ({fiberHealthTable.length})</div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Core</th>
                        <th>Start → End</th>
                        <th>Status</th>
                        <th>Length</th>
                        <th>Loss</th>
                        <th>Events</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiberHealthTable.map((fh, fIdx) => (
                        <tr key={fIdx}>
                          <td>Core {fh.fiberCoreNo || fIdx + 1}</td>
                          <td>{display(fh.startGpName)} → {display(fh.endBlockAndGpName)}</td>
                          <td><span className={`badge-pill ${statusBadgeClass(fh.status)}`}>{display(fh.status)}</span></td>
                          <td>{fh.otdrLengthMtr != null ? `${fh.otdrLengthMtr} m` : '—'}</td>
                          <td>{fh.avgLossDb != null ? `${fh.avgLossDb} dB` : '—'}</td>
                          <td>{display(fh.noOfEvents)}</td>
                          <td>
                            {fh.otdrScreenPhoto?.photoUrl && (
                              <button type="button" className="btn-ghost" onClick={() => openLightbox([fh.otdrScreenPhoto], 0)}>
                                Trace
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
              <div className="task-empty">No photos or videos recorded.</div>
            )}
          </div>
        )}

      </div>

      {/* 8. Approval Chain & Audit Log */}
      <div className="app-card" style={{ padding: 16 }}>
        <div className="vendor-section-title">Audit</div>
        <dl className="vendor-dl">
          <div>
            <dt>Created</dt>
            <dd>{task.createdAt ? new Date(task.createdAt).toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{task.updatedAt ? new Date(task.updatedAt).toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{task.submittedAt ? new Date(task.submittedAt).toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{task.completedAt ? new Date(task.completedAt).toLocaleString() : '—'}</dd>
          </div>
        </dl>
        {task.rejectionReason && (
          <p className="page-subtitle" style={{ marginTop: 12 }}>Rejection: {task.rejectionReason}</p>
        )}
      </div>

    </div>
  );
};
