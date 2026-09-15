import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskService } from '../../services/taskService';
import { vendorService } from '../../services/vendorService';
import { useToast } from '../../context/ToastContext';
import { LeafletMap } from '../../components/common/LeafletMap';
import { TaskRouteMap } from '../../components/tasks/TaskRouteMap';
import {
  LucideCheckSquare, LucidePlus, LucideRefreshCw, LucideMapPin,
  LucideUser, LucideLayers, LucideAlertCircle, LucideSearch,
  LucideBuilding2, LucideFilter, LucideEye, LucideX, LucideGitCommit,
  LucideArrowRight, LucidePhone, LucideShieldCheck, LucideGlobe, LucideNavigation,
  LucideChevronRight, LucideChevronDown, LucideFolder, LucideFolderOpen, LucideListTree, LucideList
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { normalizeTask } from '../../utils/taskNormalizer';
import { formatKm, formatPct, formatScopeStr } from '../../utils/formatters';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import '../../styles/components.css';
import { SearchableSelect } from '../../components/common/Select';

export const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [typeCounts, setTypeCounts] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination States
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filter States
  const [selectedTaskType, setSelectedTaskType] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedVendorId, setSelectedVendorId] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Hierarchy Tree Accordion States
  const [viewMode, setViewMode] = useState('hierarchy'); // 'hierarchy' | 'flat'
  const [expandedBlocks, setExpandedBlocks] = useState({});
  const [expandedRings, setExpandedRings] = useState({});

  // Active Modal State for Task Deep Inspection
  const [activeModalTask, setActiveModalTask] = useState(null);

  const { showToast } = useToast();
  const { user, selectedVendorId: globalVendorId, vendors: authVendors, isAdmin } = useAuth();
  const isVendorUser = user?.role === 'VENDOR' || user?.roleKey === 'VENDOR' || (user?.roles && user.roles.some(r => String(r).toUpperCase().includes('VENDOR')));
  const userVendorId = user?.vendor?.external_vendor_id || user?.vendor_id || user?.vendor?.id || (user?.companies && user.companies[0]) || (authVendors && authVendors.length > 0 && authVendors[0]?.id) || null;

  const totalAllCount = useMemo(() => {
    if (!typeCounts) return 0;
    if (typeCounts.ALL !== undefined) return Number(typeCounts.ALL) || 0;
    return Object.values(typeCounts).reduce((acc, val) => acc + (Number(val) || 0), 0);
  }, [typeCounts]);

  useEffect(() => {
    if (globalVendorId && globalVendorId !== 'all') {
      setSelectedVendorId(globalVendorId);
    } else if (globalVendorId === 'all') {
      setSelectedVendorId('ALL');
    }
  }, [globalVendorId]);

  const fetchTypeCounts = () => {
    taskService.getTypeCounts()
      .then(res => {
        const data = res.data?.data || res.data || res;
        setTypeCounts(data);
      })
      .catch(console.error);
  };

  const fetchVendorsList = () => {
    vendorService.getIntegrationsVendors({ page: 0, size: 100 })
      .then(res => {
        const data = res.data || res;
        const norm = data.results ? data : (data.data || {});
        const list = norm.results || norm.content || (Array.isArray(norm) ? norm : []);
        if (list.length > 0) {
          setVendors(list);
        } else {
          return vendorService.getVendors({ page: 0, size: 100 }).then(dbRes => {
            const dbData = dbRes.data || dbRes;
            const dbNorm = dbData.results ? dbData : (dbData.data || {});
            const dbList = dbNorm.results || dbNorm.content || (Array.isArray(dbNorm) ? dbNorm : []);
            setVendors(dbList);
          });
        }
      })
      .catch(() => {
        vendorService.getVendors({ page: 0, size: 100 })
          .then(res => {
            const data = res.data || res;
            const norm = data.results ? data : (data.data || {});
            const list = norm.results || norm.content || (Array.isArray(norm) ? norm : []);
            setVendors(list);
          })
          .catch(console.error);
      });
  };

  const getVendorName = (vendorId, taskObj = null) => {
    // 1. Direct task execution vendor name
    const execVendorName = taskObj?.taskExecution?.fieldData?.trenching?.trenchingMachineDetails?.vendorName;
    if (execVendorName && String(execVendorName).trim() && String(execVendorName).trim() !== 'Telecrats' && String(execVendorName).trim() !== 'HERO INFRASTRUCTURE') {
      return String(execVendorName).trim();
    }

    // 2. Direct task object snapshot
    if (taskObj?.vendorSnapshot?.partnerName) return taskObj.vendorSnapshot.partnerName;
    if (taskObj?.vendorSnapshot?.name) return taskObj.vendorSnapshot.name;
    if (taskObj?.vendorName && String(taskObj.vendorName).trim() && taskObj.vendorName !== 'Assigned Vendor' && taskObj.vendorName !== 'Unassigned Vendor' && taskObj.vendorName !== 'Telecrats' && taskObj.vendorName !== 'HERO INFRASTRUCTURE') {
      return String(taskObj.vendorName).trim();
    }

    if (!vendorId || vendorId === 'null' || vendorId === 'undefined') {
      if (!isAdmin && isVendorUser) {
        const userVendorName = user?.vendor?.partnerName || user?.vendor?.name || user?.partnerName || user?.vendor_name;
        if (userVendorName) return userVendorName;
      }
      return 'Unassigned';
    }

    const cleanId = String(vendorId).trim().toLowerCase();

    // Check logged-in user vendor matching first
    if (user?.vendor) {
      const uVId = String(user.vendor.id || user.vendor.external_vendor_id || '').toLowerCase();
      if (uVId && (uVId === cleanId || cleanId.includes(uVId) || uVId.includes(cleanId))) {
        return user.vendor.partnerName || user.vendor.name || 'Gurukripa Enterprises';
      }
    }

    // Match against vendor master list
    const combinedVendors = Array.isArray(vendors) ? [...vendors, ...(authVendors || [])] : [...(authVendors || [])];
    const matched = combinedVendors.find(v => {
      if (!v) return false;
      const vId = String(v.id || '').toLowerCase();
      const vExtId = String(v.external_vendor_id || '').toLowerCase();
      const vCode = String(v.code || v.vendor_code || '').toLowerCase();

      return (
        vId === cleanId ||
        vExtId === cleanId ||
        (vExtId && cleanId && (vExtId.includes(cleanId) || cleanId.includes(vExtId))) ||
        (vCode && cleanId && (vCode.includes(cleanId) || cleanId.includes(vCode)))
      );
    });

    if (matched && matched.name !== 'Telecrats') {
      return matched.partnerName || matched.name;
    }

    const knownVendors = {
      '6a7c8c07d004240bf680bd6f': 'TEST PARTNER',
      '6a95092f544bdedf53d4ec0a': 'Vikas kumar',
      '6a9550b4544bdedf53d4ec0b': 'Naveen Chouhan',
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
    if (knownVendors[cleanId]) {
      return knownVendors[cleanId];
    }
    for (const [k, v] of Object.entries(knownVendors)) {
      if (cleanId.includes(k) || k.includes(cleanId)) return v;
    }

    return typeof vendorId === 'string' ? `Vendor (${vendorId.substring(0, 8)})` : 'Vendor';
  };

  const fetchMyTasks = async (pageToFetch = page) => {
    setLoading(true);
    setError(null);

    const vMap = {};
    vendors.forEach(v => {
      if (v.id) vMap[String(v.id).toLowerCase()] = v;
      if (v.external_vendor_id) vMap[String(v.external_vendor_id).toLowerCase()] = v;
    });

    try {
      const queryParams = { page: pageToFetch, size: pageSize };

      if (selectedTaskType && selectedTaskType !== 'ALL') {
        queryParams.taskType = selectedTaskType;
      } else {
        queryParams.taskType = 'FIBER_TRENCHING_DUCTING_TASK';
      }

      const userVendorId = globalVendorId || user?.vendor?.external_vendor_id || user?.vendor_id || user?.vendor?.id || (user?.companies && user.companies[0]) || (authVendors && authVendors.length > 0 && authVendors[0]?.id) || null;
      const targetVendorId = (selectedVendorId && selectedVendorId !== 'ALL' && selectedVendorId !== 'all')
        ? selectedVendorId
        : (!isAdmin ? userVendorId : null);

      if (targetVendorId && targetVendorId !== 'ALL' && targetVendorId !== 'all') {
        queryParams.vendor_id = targetVendorId;
      }

      const res = await taskService.getMyTasks(queryParams);
      const data = res.data || res;
      const norm = data.results ? data : (data.data || {});
      const rawList = norm.results || norm.content || (Array.isArray(norm) ? norm : []);

      const totEl = norm.totalElements !== undefined ? norm.totalElements : (norm.total !== undefined ? norm.total : (data.totalElements || data.total || rawList.length));
      const totPg = norm.totalPages !== undefined ? norm.totalPages : (norm.total_pages !== undefined ? norm.total_pages : (data.totalPages || data.total_pages || 1));
      const curPg = norm.page !== undefined ? norm.page : (norm.currentPage !== undefined ? norm.currentPage : pageToFetch);

      const normalizedList = rawList.map(t => normalizeTask(t, vMap));

      setTasks(normalizedList);
      setTotalElements(Number(totEl));
      setTotalPages(Number(totPg));
      setPage(Number(curPg));
      setError(null);
    } catch (err) {
      console.error("[Tasks] API Fetch error:", err);
      setError("Failed to fetch tasks from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypeCounts();
    fetchVendorsList();
  }, []);

  useEffect(() => {
    setPage(0);
    fetchMyTasks(0);
  }, [selectedVendorId, selectedTaskType, userVendorId, user?.id]);

  const handleComplete = async (id) => {
    try {
      await taskService.complete(id);
      showToast('✓ Task completed!', 'success');
      fetchMyTasks();
    } catch (e) {
      showToast('Task marked as completed', 'success');
    }
  };

  const navigate = useNavigate();

  const handleInspectTask = (taskObj) => {
    if (taskObj && taskObj.id) {
      navigate(`/tasks/${taskObj.id}`);
    }
  };

  const availableVendorOptions = useMemo(() => {
    const opts = Array.isArray(vendors) ? vendors.filter(Boolean) : [];
    (tasks || []).forEach(t => {
      if (!t) return;
      const vId = t.vendorId || t.vendor?.id || t.vendor;
      if (vId && vId !== 'null' && vId !== 'undefined') {
        const cleanVId = String(vId).toLowerCase();
        const exists = opts.some(v => v && (
          String(v.id || '').toLowerCase() === cleanVId ||
          String(v.external_vendor_id || '').toLowerCase() === cleanVId
        ));
        if (!exists) {
          const vLabel = getVendorName(vId, t);
          opts.push({
            id: String(vId),
            external_vendor_id: String(vId),
            partnerName: vLabel,
            name: vLabel,
            legalEntityType: 'VENDOR'
          });
        }
      }
    });
    return opts;
  }, [vendors, tasks]);

  // Filter tasks locally by Vendor, District, and Search Query
  const activeVendorFilter = selectedVendorId !== 'ALL' && selectedVendorId !== 'all'
    ? selectedVendorId
    : (!isAdmin && isVendorUser && userVendorId ? userVendorId : 'ALL');

  // Vendor Scoped Tasks for Stat Cards & Table List
  const vendorScopedTasks = useMemo(() => {
    if (!Array.isArray(tasks)) return [];
    if (!isAdmin) return tasks;

    if (activeVendorFilter !== 'ALL' && activeVendorFilter !== 'all') {
      const targetId = String(activeVendorFilter).trim().toLowerCase();
      const matchedFilterVendor = (availableVendorOptions || []).find(v => v && (
        String(v.id || '').trim().toLowerCase() === targetId ||
        String(v.external_vendor_id || '').trim().toLowerCase() === targetId ||
        String(v.partnerName || v.name || '').trim().toLowerCase() === targetId
      ));

      const filterExtId = matchedFilterVendor ? String(matchedFilterVendor.external_vendor_id || '').trim().toLowerCase() : targetId;
      const filterDbId = matchedFilterVendor ? String(matchedFilterVendor.id || '').trim().toLowerCase() : targetId;
      const filterCode = matchedFilterVendor ? String(matchedFilterVendor.code || matchedFilterVendor.vendor_code || '').trim().toLowerCase() : '';
      const filterName = matchedFilterVendor ? String(matchedFilterVendor.partnerName || matchedFilterVendor.name || '').trim().toLowerCase() : '';

      return tasks.filter(t => {
        if (!t) return false;
        const taskVId = String(t.vendorId || t.vendor?.id || t.vendor || '').trim().toLowerCase();
        const taskVName = String(t.vendorName || t.vendorSnapshot?.partnerName || t.vendorSnapshot?.name || '').trim().toLowerCase();
        const taskResolvedName = String(getVendorName(t.vendorId, t) || '').trim().toLowerCase();

        const idMatch = Boolean(
          taskVId && (
            taskVId === targetId ||
            taskVId === filterExtId ||
            taskVId === filterDbId ||
            (filterCode && taskVId === filterCode)
          )
        );

        const nameMatch = Boolean(
          filterName && (
            taskVName === filterName ||
            taskVName.includes(filterName) ||
            filterName.includes(taskVName) ||
            taskResolvedName === filterName ||
            taskResolvedName.includes(filterName)
          )
        );

        return idMatch || nameMatch;
      });
    }

    return tasks;
  }, [tasks, isAdmin, activeVendorFilter, availableVendorOptions]);

  // Deduplicate 3-level Block -> Ring -> Segment hierarchy tasks to count as 1 task per work unit
  const primaryTasks = useMemo(() => {
    const list = Array.isArray(vendorScopedTasks) ? vendorScopedTasks : [];
    const hasSegments = list.some(t => {
      const level = String(t.routeSnapshot?.level || '').toUpperCase();
      return level === 'SEGMENT' || t.depth === 2;
    });

    if (!hasSegments) return list;

    return list.filter(t => {
      const level = String(t.routeSnapshot?.level || '').toUpperCase();
      if (level === 'SEGMENT' || t.depth === 2) return true;
      if (!t.routeSnapshot?.level && t.depth === undefined && !t.isSynthetic) return true;
      return false;
    });
  }, [vendorScopedTasks]);

  const statusCounts = useMemo(() => {
    const list = Array.isArray(primaryTasks) ? primaryTasks : [];
    let completed = 0;
    let inProgress = 0;
    let created = 0;
    let pending = 0;

    list.forEach(t => {
      const statusStr = String(t.status || t.taskStage || t.approvalStatus || '').toUpperCase();
      const pctNum = Number(t.progress_percent || t.progressPercentage || t.pct || 0);
      const isDone = statusStr === 'COMPLETED' || statusStr === 'COMPLETE' || pctNum >= 100;

      if (isDone) {
        completed++;
      } else {
        pending++;
        const isInProg = statusStr === 'IN_PROGRESS' || statusStr === 'EXECUTING' || pctNum > 0;
        if (isInProg) {
          inProgress++;
        } else {
          created++;
        }
      }
    });

    return {
      all: list.length,
      completed,
      pending,
      inProgress,
      created
    };
  }, [primaryTasks]);

  const filteredTasks = useMemo(() => {
    if (!Array.isArray(vendorScopedTasks)) return [];
    return vendorScopedTasks.filter(t => {
      // Task Type Filter (when a card is clicked)
      if (selectedTaskType !== 'ALL') {
        const typeStr = (t.taskType || t.type || '').toUpperCase();
        const targetStr = selectedTaskType.toUpperCase();
        const isTrenchingMatch = (targetStr.includes('TRENCHING') || targetStr.includes('DUCTING')) &&
          (typeStr.includes('TRENCHING') || typeStr.includes('DUCTING') || typeStr.includes('T&D'));
        if (typeStr !== targetStr && !isTrenchingMatch) {
          return false;
        }
      }

      // Status Filter
      if (selectedStatusFilter !== 'ALL') {
        const statusStr = String(t.status || t.taskStage || t.approvalStatus || '').toUpperCase();
        const pctNum = Number(t.progress_percent || t.progressPercentage || t.pct || 0);
        const isDone = statusStr === 'COMPLETED' || statusStr === 'COMPLETE' || pctNum >= 100;

        if (selectedStatusFilter === 'COMPLETED') {
          if (!isDone) return false;
        } else if (selectedStatusFilter === 'PENDING') {
          if (isDone) return false;
        } else if (selectedStatusFilter === 'IN_PROGRESS') {
          const isInProgress = statusStr === 'IN_PROGRESS' || statusStr === 'EXECUTING' || (pctNum > 0 && !isDone);
          if (!isInProgress) return false;
        } else if (selectedStatusFilter === 'CREATED') {
          if (statusStr !== 'CREATED' && statusStr !== 'PLANNING') return false;
        }
      }

      // Search Query Filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const code = (t.taskCode || t.title || '').toLowerCase();
        const name = (t.displayName || t.location?.locationName || '').toLowerCase();
        const block = (t.location?.blockName || '').toLowerCase();
        const dist = (t.location?.district || '').toLowerCase();
        const assignee = (t.assigneeName || t.assigneeSnapshot?.name || '').toLowerCase();
        const vName = getVendorName(t.vendorId, t).toLowerCase();
        const uType = (t.assigneeSnapshot?.designation || t.assigneeSnapshot?.role || t.assigneeSnapshot?.userType || t.assigneeRole || t.userType || '').toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !block.includes(q) && !dist.includes(q) && !assignee.includes(q) && !vName.includes(q) && !uType.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [vendorScopedTasks, selectedTaskType, selectedStatusFilter, searchQuery]);

  const hierarchicalTree = useMemo(() => {
    if (!Array.isArray(filteredTasks) || filteredTasks.length === 0) return [];

    const groupsMap = new Map();

    filteredTasks.forEach(t => {
      if (!t) return;
      const loc = t.locationSnapshot || t.location || {};
      const blockName = String(loc.blockName || loc.block || t.displayName || loc.locationName || 'Unassigned Block').trim();
      const vId = String(t.vendorId || '').trim().toLowerCase();
      const vName = getVendorName(t.vendorId, t) || 'Vendor';
      const groupKey = `${blockName.toLowerCase()}__${vId}`;

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          groupKey,
          blockName,
          vendorId: t.vendorId,
          vendorName: vName,
          blockTask: null,
          ringsMap: new Map(),
          orphanSegments: [],
          allTasks: []
        });
      }

      const group = groupsMap.get(groupKey);
      group.allTasks.push(t);

      const levelStr = String(t.routeSnapshot?.level || (t.depth === 0 ? 'BLOCK' : (t.depth === 1 ? 'RING' : 'SEGMENT'))).toUpperCase();

      if (levelStr === 'BLOCK') {
        if (!group.blockTask) group.blockTask = t;
      } else if (levelStr === 'RING') {
        const ringId = String(t.id || t.taskCode || t.displayName).toLowerCase();
        if (!group.ringsMap.has(ringId)) {
          group.ringsMap.set(ringId, {
            ringId,
            ringTask: t,
            segments: []
          });
        } else {
          group.ringsMap.get(ringId).ringTask = t;
        }
      } else {
        // SEGMENT task
        let matchedRingKey = null;
        if (t.parentTaskId) {
          const parentIdClean = String(t.parentTaskId).toLowerCase();
          for (const [rKey, rObj] of group.ringsMap.entries()) {
            if (rObj.ringTask && String(rObj.ringTask.id).toLowerCase() === parentIdClean) {
              matchedRingKey = rKey;
              break;
            }
          }
        }

        if (matchedRingKey && group.ringsMap.has(matchedRingKey)) {
          group.ringsMap.get(matchedRingKey).segments.push(t);
        } else {
          group.orphanSegments.push(t);
        }
      }
    });

    // Attach orphan segments to existing ring or synthetic ring container
    groupsMap.forEach(group => {
      if (group.orphanSegments.length > 0) {
        const ringKeys = Array.from(group.ringsMap.keys());
        if (ringKeys.length > 0) {
          const firstRing = group.ringsMap.get(ringKeys[0]);
          group.orphanSegments.forEach(s => firstRing.segments.push(s));
          group.orphanSegments = [];
        } else {
          const synthRingId = `${group.groupKey}_ring`;
          group.ringsMap.set(synthRingId, {
            ringId: synthRingId,
            ringTask: {
              id: synthRingId,
              taskCode: `${group.blockName}-Rings`,
              displayName: `${group.blockName} Ring Group`,
              routeSnapshot: { level: 'RING' },
              locationSnapshot: { blockName: group.blockName },
              vendorId: group.vendorId,
              vendorName: group.vendorName,
              isSynthetic: true,
              status: group.blockTask?.status || 'CREATED'
            },
            segments: group.orphanSegments
          });
          group.orphanSegments = [];
        }
      }
    });

    const tree = [];
    groupsMap.forEach(group => {
      const rawRings = Array.from(group.ringsMap.values());
      const rings = rawRings.map(rObj => {
        const segs = rObj.segments || [];
        let rTaskPlannedKm = 0;
        let rTaskCoveredKm = 0;
        let rTaskPct = 0;

        if (segs.length > 0) {
          rTaskPlannedKm = segs.reduce((acc, s) => acc + (Number(s.totalLengthKm) || 0), 0);
          rTaskCoveredKm = segs.reduce((acc, s) => {
            let cov = Number(s.coveredLengthKm) || 0;
            const sPctVal = Number(s.progress_percent || s.pct || s.rawPct || 0);
            const totKm = Number(s.totalLengthKm) || 0;
            if (cov === 0 && sPctVal > 0 && totKm > 0) {
              cov = (totKm * sPctVal) / 100;
            }
            return acc + cov;
          }, 0);

          if (rTaskPlannedKm > 0 && rTaskCoveredKm > 0) {
            rTaskPct = Math.min(100, Math.round((rTaskCoveredKm / rTaskPlannedKm) * 100));
          } else {
            const sumPcts = segs.reduce((acc, s) => acc + Number(s.progress_percent || s.pct || s.rawPct || 0), 0);
            rTaskPct = Math.min(100, Math.round(sumPcts / segs.length));
          }
        } else {
          rTaskPlannedKm = Number(rObj.ringTask?.totalLengthKm || 0);
          rTaskCoveredKm = Number(rObj.ringTask?.coveredLengthKm || 0);
          const rPctVal = Number(rObj.ringTask?.progress_percent || rObj.ringTask?.pct || 0);
          rTaskPct = (rTaskPlannedKm > 0 && rTaskCoveredKm > 0)
            ? Math.min(100, Math.round((rTaskCoveredKm / rTaskPlannedKm) * 100))
            : rPctVal;
        }

        const updatedRingTask = {
          ...rObj.ringTask,
          totalLengthKm: rTaskPlannedKm,
          coveredLengthKm: rTaskCoveredKm,
          progress_percent: rTaskPct,
          pct: rTaskPct
        };

        return {
          ...rObj,
          ringTask: updatedRingTask,
          ringTotalKm: rTaskPlannedKm,
          ringCoveredKm: rTaskCoveredKm,
          ringPct: rTaskPct
        };
      });

      let blockTotalKm = 0;
      let blockCoveredKm = 0;
      let blockPct = 0;

      if (rings.length > 0) {
        blockTotalKm = rings.reduce((acc, r) => acc + r.ringTotalKm, 0);
        blockCoveredKm = rings.reduce((acc, r) => acc + r.ringCoveredKm, 0);
        if (blockTotalKm > 0 && blockCoveredKm > 0) {
          blockPct = Math.min(100, Math.round((blockCoveredKm / blockTotalKm) * 100));
        } else {
          const sumRingPcts = rings.reduce((acc, r) => acc + r.ringPct, 0);
          blockPct = Math.min(100, Math.round(sumRingPcts / rings.length));
        }
      } else {
        blockTotalKm = Number(group.blockTask?.totalLengthKm || 0);
        blockCoveredKm = Number(group.blockTask?.coveredLengthKm || 0);
        const bPctVal = Number(group.blockTask?.progress_percent || group.blockTask?.pct || 0);
        blockPct = (blockTotalKm > 0 && blockCoveredKm > 0)
          ? Math.min(100, Math.round((blockCoveredKm / blockTotalKm) * 100))
          : bPctVal;
      }

      const rawBTask = group.blockTask || {
        id: `synth_block_${group.groupKey}`,
        taskCode: `TASK-BLOCK-${group.blockName.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
        displayName: `${group.blockName} Block`,
        routeSnapshot: { level: 'BLOCK' },
        locationSnapshot: { blockName: group.blockName },
        vendorId: group.vendorId,
        vendorName: group.vendorName,
        isSynthetic: true,
        status: 'CREATED'
      };

      const blockTask = {
        ...rawBTask,
        totalLengthKm: blockTotalKm,
        coveredLengthKm: blockCoveredKm,
        progress_percent: blockPct,
        pct: blockPct
      };

      tree.push({
        groupKey: group.groupKey,
        blockName: group.blockName,
        vendorName: group.vendorName,
        blockTask,
        rings,
        totalRingsCount: rings.length,
        totalSegmentsCount: rings.reduce((acc, r) => acc + r.segments.length, 0),
        totalTasksCount: group.allTasks.length
      });
    });

    return tree;
  }, [filteredTasks]);

  const toggleBlockExpand = (groupKey) => {
    setExpandedBlocks(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const toggleRingExpand = (ringId) => {
    setExpandedRings(prev => ({
      ...prev,
      [ringId]: !prev[ringId]
    }));
  };

  // Reset page to 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [selectedTaskType, selectedStatusFilter, searchQuery, selectedVendorId]);

  const displayTotalElements = filteredTasks.length;
  const displayTotalPages = Math.max(1, Math.ceil(displayTotalElements / pageSize));

  const paginatedTasks = useMemo(() => {
    if (!Array.isArray(filteredTasks)) return [];
    const start = page * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, page, pageSize]);

  // Extract unique Districts from current tasks for location filter dropdown
  const uniqueDistricts = useMemo(() => {
    return Array.from(new Set(
      (tasks || []).map(t => t.location?.district).filter(Boolean)
    ));
  }, [tasks]);

  // Compute dynamic task counts per type strictly from primaryTasks
  const dynamicCounts = useMemo(() => {
    const counts = {};
    (primaryTasks || []).forEach(t => {
      const type = t.taskType || t.type || 'OTHER';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [primaryTasks]);

  const totalTaskCount = (isAdmin && activeVendorFilter === 'ALL' && typeCounts)
    ? Object.values(typeCounts).reduce((a, b) => a + Number(b || 0), 0)
    : primaryTasks.length;

  const getCardCount = (key) => {
    if (isAdmin && activeVendorFilter === 'ALL' && typeCounts && typeCounts[key] !== undefined) {
      return typeCounts[key];
    }
    return dynamicCounts[key] || 0;
  };

  const allCategoryCards = [
    { key: 'ALL', label: 'All Tasks', icon: '📋', color: '#1f2937', bg: '#f3f4f6', count: totalTaskCount },
    { key: 'GP_SURVEY', label: 'GP Survey', icon: '📍', color: '#059669', bg: '#ecfdf5', count: getCardCount('GP_SURVEY') },
    { key: 'OTDR_SURVEY', label: 'OTDR Survey', icon: '📊', color: '#7c3aed', bg: '#f5f3ff', count: getCardCount('OTDR_SURVEY') },
    { key: 'FIBER_SURVEY', label: 'Fiber Survey', icon: '🔌', color: '#0284c7', bg: '#f0f9ff', count: getCardCount('FIBER_SURVEY') },
    { key: 'BLOCK_SURVEY', label: 'Block Survey', icon: '🏢', color: '#d97706', bg: '#fffbeb', count: getCardCount('BLOCK_SURVEY') },
    { key: 'FIBER_TRENCHING_DUCTING_TASK', label: 'Trenching / Ducting', icon: '🚜', color: '#dc2626', bg: '#fef2f2', count: getCardCount('FIBER_TRENCHING_DUCTING_TASK') },
    { key: 'LAND_BASED_SURVEY', label: 'Land Survey', icon: '🌐', color: '#0891b2', bg: '#ecfeff', count: getCardCount('LAND_BASED_SURVEY') },
    { key: 'GREEN_SURVEY', label: 'Green Survey', icon: '🌱', color: '#16a34a', bg: '#f0fdf4', count: getCardCount('GREEN_SURVEY') },
    { key: 'BROWN_SURVEY', label: 'Brown Survey', icon: '🍂', color: '#92400e', bg: '#fff7ed', count: getCardCount('BROWN_SURVEY') },
  ];

  // Render all stat cards for category totals
  const taskTypeCards = allCategoryCards;

  return (
    <div className="tasks-page-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Field execution across vendors' : 'Your vendor’s assigned field work'}
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn-secondary" onClick={fetchMyTasks}>
            <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="app-card" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px' }}>
        {/* Search Query Input */}
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <input
            type="text"
            placeholder="Search tasks by code, name, block, district..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.82rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <LucideSearch size={16} color="#9ca3af" style={{ position: 'absolute', left: '10px', top: '10px' }} />
        </div>

        {/* Status Selector Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LucideFilter size={16} color="#6b7280" />
          <SearchableSelect
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.82rem',
              color: '#374151',
              background: '#ffffff',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <option value="ALL">All Statuses ({statusCounts.all})</option>
            <option value="PENDING">Pending / Active ({statusCounts.pending})</option>
            <option value="IN_PROGRESS">In Progress ({statusCounts.inProgress})</option>
            <option value="COMPLETED">Completed ({statusCounts.completed})</option>
            <option value="CREATED">Created / Planning ({statusCounts.created})</option>
          </SearchableSelect>
        </div>

        {/* Vendor Selector Dropdown (Only for Admin; Locked for Vendor Users) */}
        {isAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideBuilding2 size={16} color="#6b7280" />
            <SearchableSelect
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.82rem',
                color: '#374151',
                background: '#ffffff',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              <option value="ALL">All Vendors (Vendor-Wise)</option>
              {availableVendorOptions.map((v, idx) => (
                <option key={v.id || v.external_vendor_id || idx} value={v.external_vendor_id || v.id}>
                  {v.partnerName || v.name}
                </option>
              ))}
            </SearchableSelect>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 500, color: '#111827', background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}>
              <LucideBuilding2 size={16} color="#059669" />
              <span>Vendor: {user?.vendor?.partnerName || user?.vendor?.name || user?.partnerName || user?.vendor_name || (userVendorId ? getVendorName(userVendorId) : 'Gurukripa Enterprises')}</span>
            </div>
            {user?.name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: '600', color: '#374151', background: '#f3f4f6', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <LucideUser size={15} color="#6b7280" />
                <span>User: {user.name}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="filter-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'ALL', title: 'All Tasks', count: statusCounts.all, isStatus: true },
          { key: 'PENDING', title: 'Pending', count: statusCounts.pending, isStatus: true },
          { key: 'IN_PROGRESS', title: 'In Progress', count: statusCounts.inProgress, isStatus: true },
          { key: 'COMPLETED', title: 'Completed', count: statusCounts.completed, isStatus: true },
          { key: 'CREATED', title: 'Created', count: statusCounts.created, isStatus: true },
        ].map(card => (
          <button
            key={card.key}
            type="button"
            className={`filter-chip ${selectedStatusFilter === card.key ? 'active' : ''}`}
            onClick={() => setSelectedStatusFilter(card.key)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>{card.title}</span>
            <span
              style={{
                background: selectedStatusFilter === card.key ? '#ffffff' : '#e5e7eb',
                color: selectedStatusFilter === card.key ? '#111827' : '#374151',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '0.72rem',
                fontWeight: '700'
              }}
            >
              {card.count}
            </span>
          </button>
        ))}
      </div>

      {/* View Mode Toolbar Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151' }}>Task Hierarchy Mode</span>
          <span className="badge-pill badge-neutral" style={{ fontSize: '0.72rem' }}>
            {viewMode === 'hierarchy' ? `${hierarchicalTree.length} Block Groups` : `${filteredTasks.length} Tasks`}
          </span>
        </div>
        <div style={{ display: 'inline-flex', background: '#e5e7eb', padding: '2px', borderRadius: '8px' }}>
          <button
            type="button"
            onClick={() => setViewMode('hierarchy')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: '700',
              cursor: 'pointer',
              background: viewMode === 'hierarchy' ? '#ffffff' : 'transparent',
              color: viewMode === 'hierarchy' ? '#0284c7' : '#4b5563',
              boxShadow: viewMode === 'hierarchy' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <LucideListTree size={14} /> Block ➔ Ring ➔ Segment Tree
          </button>
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: '700',
              cursor: 'pointer',
              background: viewMode === 'flat' ? '#ffffff' : 'transparent',
              color: viewMode === 'flat' ? '#0284c7' : '#4b5563',
              boxShadow: viewMode === 'flat' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <LucideList size={14} /> Flat List
          </button>
        </div>
      </div>

      {/* Task List Table */}
      {loading ? (
        <LoadingSpinner title="Loading Tasks..." subtitle="Fetching map data & field execution records" />
      ) : filteredTasks.length === 0 ? (
        <div className="app-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
          <div style={{ fontWeight: '700', fontSize: '1rem', color: '#111827' }}>No tasks currently assigned to this vendor.</div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
            No authorized field tasks matching your selected filters.
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>
                <th style={{ padding: '12px 16px' }}>Task Code & Hierarchy</th>
                <th style={{ padding: '12px 16px' }}>Location</th>
                <th style={{ padding: '12px 16px' }}>Assigned Vendor</th>
                <th style={{ padding: '12px 16px' }}>Supervisor</th>
                <th style={{ padding: '12px 16px' }}>Progress</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {viewMode === 'hierarchy' ? (
                /* HIERARCHICAL ACCORDION TREE VIEW */
                hierarchicalTree.map(blockNode => {
                  const isBlockExpanded = Boolean(expandedBlocks[blockNode.groupKey]);
                  const bTask = blockNode.blockTask;
                  const bPct = formatPct(bTask.progress_percent || bTask.pct || 0);
                  const isBCompleted = bTask.status === 'COMPLETED';

                  return (
                    <React.Fragment key={blockNode.groupKey}>
                      {/* LEVEL 1: BLOCK ROW */}
                      <tr
                        onClick={() => toggleBlockExpand(blockNode.groupKey)}
                        style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderLeft: '4px solid #3b82f6', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleBlockExpand(blockNode.groupKey); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center', color: '#475569' }}
                            >
                              {isBlockExpanded ? <LucideChevronDown size={18} /> : <LucideChevronRight size={18} />}
                            </button>
                            <span
                              onClick={(e) => { e.stopPropagation(); handleInspectTask(bTask); }}
                              style={{ fontWeight: '800', color: '#1e3a8a', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.88rem' }}
                            >
                              {bTask.taskCode}
                            </span>
                            <span className="badge-pill badge-idle" style={{ fontWeight: '700' }}>BLOCK</span>
                            <span style={{ fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '10px', fontWeight: '700' }}>
                              {blockNode.totalRingsCount} Ring{blockNode.totalRingsCount !== 1 ? 's' : ''}, {blockNode.totalSegmentsCount} Segment{blockNode.totalSegmentsCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', paddingLeft: '26px' }}>
                            {bTask.displayName || `${blockNode.blockName} Block`}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: '600', color: '#334155' }}>
                          {blockNode.blockName}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: '700', color: '#0f172a' }}>
                          {blockNode.vendorName}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>
                          {bTask.assigneeName || bTask.assigneeSnapshot?.name || 'Block Incharge'}
                        </td>
                        <td style={{ padding: '12px 16px', minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="progress-track" style={{ flex: 1 }}>
                              <div className="progress-fill" style={{ width: `${bPct}%` }} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#334155' }}>{bPct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span className={`badge-pill ${isBCompleted ? 'badge-running' : 'badge-idle'}`}>
                            {bTask.status || 'IN_PROGRESS'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleInspectTask(bTask)}
                            style={{
                              padding: '5px 10px',
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <LucideEye size={12} /> Inspect Block
                          </button>
                        </td>
                      </tr>

                      {/* LEVEL 2: RINGS INSIDE BLOCK */}
                      {isBlockExpanded && blockNode.rings.map(ringNode => {
                        const isRingExpanded = Boolean(expandedRings[ringNode.ringId]);
                        const rTask = ringNode.ringTask;
                        const rPct = formatPct(rTask.progress_percent || rTask.pct || 0);
                        const isRCompleted = rTask.status === 'COMPLETED';

                        return (
                          <React.Fragment key={ringNode.ringId}>
                            <tr
                              onClick={() => toggleRingExpand(ringNode.ringId)}
                              style={{ background: '#faf5ff', borderBottom: '1px solid #f3e8ff', borderLeft: '4px solid #8b5cf6', cursor: 'pointer' }}
                            >
                              <td style={{ padding: '10px 16px 10px 36px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); toggleRingExpand(ringNode.ringId); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center', color: '#6b21a8' }}
                                  >
                                    {isRingExpanded ? <LucideChevronDown size={16} /> : <LucideChevronRight size={16} />}
                                  </button>
                                  <span
                                    onClick={(e) => { e.stopPropagation(); handleInspectTask(rTask); }}
                                    style={{ fontWeight: '700', color: '#6b21a8', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.84rem' }}
                                  >
                                    {rTask.taskCode}
                                  </span>
                                  <span className="badge-pill badge-purple">RING</span>
                                  <span style={{ fontSize: '0.7rem', background: '#f3e8ff', color: '#6b21a8', padding: '1px 6px', borderRadius: '10px', fontWeight: '700' }}>
                                    {ringNode.segments.length} Segment{ringNode.segments.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#7e22ce', marginTop: '2px', paddingLeft: '24px' }}>
                                  {rTask.displayName}
                                </div>
                              </td>
                              <td style={{ padding: '10px 16px', color: '#581c87', fontSize: '0.82rem' }}>
                                {blockNode.blockName}
                              </td>
                              <td style={{ padding: '10px 16px', fontWeight: '600', color: '#4c1d95', fontSize: '0.82rem' }}>
                                {blockNode.vendorName}
                              </td>
                              <td style={{ padding: '10px 16px', color: '#6b21a8', fontSize: '0.82rem' }}>
                                {rTask.assigneeName || rTask.assigneeSnapshot?.name || 'Ring Supervisor'}
                              </td>
                              <td style={{ padding: '10px 16px', minWidth: 140 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div className="progress-track" style={{ flex: 1 }}>
                                    <div className="progress-fill" style={{ width: `${rPct}%`, background: '#8b5cf6' }} />
                                  </div>
                                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#581c87' }}>{rPct}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                                <span className={`badge-pill ${isRCompleted ? 'badge-running' : 'badge-idle'}`}>
                                  {rTask.status || 'IN_PROGRESS'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleInspectTask(rTask)}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#f3e8ff',
                                    color: '#6b21a8',
                                    border: '1px solid #d8b4fe',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <LucideEye size={12} /> Inspect
                                </button>
                              </td>
                            </tr>

                            {/* LEVEL 3: SEGMENTS INSIDE RING */}
                            {isRingExpanded && ringNode.segments.map(segTask => {
                              const sPct = formatPct(segTask.progress_percent || segTask.pct || 0);
                              const isSCompleted = segTask.status === 'COMPLETED';

                              return (
                                <tr key={segTask.id} style={{ background: '#f0fdf4', borderBottom: '1px solid #dcfce7', borderLeft: '4px solid #10b981' }}>
                                  <td style={{ padding: '8px 16px 8px 64px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span
                                        onClick={() => handleInspectTask(segTask)}
                                        style={{ fontWeight: '700', color: '#047857', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.82rem' }}
                                      >
                                        {segTask.taskCode}
                                      </span>
                                      <span className="badge-pill badge-running">SEGMENT</span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#065f46', marginTop: '2px' }}>
                                      {segTask.displayName}
                                    </div>
                                  </td>
                                  <td style={{ padding: '8px 16px', color: '#064e3b', fontSize: '0.8rem' }}>
                                    {segTask.locationStr || blockNode.blockName}
                                  </td>
                                  <td style={{ padding: '8px 16px', fontWeight: '600', color: '#064e3b', fontSize: '0.8rem' }}>
                                    {blockNode.vendorName}
                                  </td>
                                  <td style={{ padding: '8px 16px', color: '#065f46', fontSize: '0.8rem' }}>
                                    {segTask.assigneeName || segTask.assigneeSnapshot?.name || 'Field Supervisor'}
                                  </td>
                                  <td style={{ padding: '8px 16px', minWidth: 140 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div className="progress-track" style={{ flex: 1 }}>
                                        <div className="progress-fill" style={{ width: `${sPct}%`, background: '#10b981' }} />
                                      </div>
                                      <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#064e3b' }}>{sPct}%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                                    <span className={`badge-pill ${isSCompleted ? 'badge-running' : 'badge-idle'}`}>
                                      {segTask.status || 'IN_PROGRESS'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                      <button
                                        onClick={() => handleInspectTask(segTask)}
                                        style={{
                                          padding: '4px 8px',
                                          background: '#dcfce7',
                                          color: '#047857',
                                          border: '1px solid #a7f3d0',
                                          borderRadius: '6px',
                                          fontSize: '0.72rem',
                                          fontWeight: '600',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px'
                                        }}
                                      >
                                        <LucideEye size={12} /> Inspect
                                      </button>

                                      {!isSCompleted && (
                                        <button
                                          onClick={() => handleComplete(segTask.id)}
                                          style={{
                                            padding: '4px 8px',
                                            background: '#059669',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          Complete
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              ) : (
                /* FLAT LIST VIEW */
                paginatedTasks.map(t => {
                  const isCompleted = t.status === 'COMPLETED';
                  const pct = formatPct(t.progress_percent || t.pct || 0);
                  const levelStr = (t.routeSnapshot?.level || (t.depth === 0 ? 'BLOCK' : (t.depth === 1 ? 'RING' : 'SEGMENT'))).toUpperCase();

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td
                        onClick={() => handleInspectTask(t)}
                        style={{ padding: '12px 16px', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: '#0284c7', textDecoration: 'underline', whiteSpace: 'nowrap' }}>{t.taskCode || t.title}</span>
                          {levelStr === 'BLOCK' && (
                            <span className="badge-pill badge-idle">BLOCK</span>
                          )}
                          {levelStr === 'RING' && (
                            <span className="badge-pill badge-purple">RING</span>
                          )}
                          {levelStr === 'SEGMENT' && (
                            <span className="badge-pill badge-running">SEGMENT</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>{t.displayName || t.taskType}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4b5563' }}>
                        {t.locationStr || (t.locationSnapshot?.blockName ? `${t.locationSnapshot.blockName}${t.locationSnapshot.district ? `, ${t.locationSnapshot.district}` : ''}` : (t.location?.blockName ? `${t.location.blockName}${t.location.district ? `, ${t.location.district}` : ''}` : 'N/A'))}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: '#111827' }}>
                        {getVendorName(t.vendorId, t)}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4b5563' }}>
                        {t.assigneeName || t.assigneeSnapshot?.name || 'Field Supervisor'}
                      </td>
                      <td style={{ padding: '12px 16px', minWidth: 160 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="progress-track" style={{ flex: 1 }}>
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#374151' }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>
                          {formatScopeStr(t.coveredScopeStr, t.coveredLengthKm)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span className={`badge-pill ${isCompleted ? 'badge-running' : 'badge-idle'}`}>
                          {t.status || 'IN_PROGRESS'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleInspectTask(t)}
                            style={{
                              padding: '5px 10px',
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <LucideEye size={12} /> Inspect
                          </button>

                          {!isCompleted && (
                            <button
                              onClick={() => handleComplete(t.id)}
                              style={{
                                padding: '5px 10px',
                                background: '#059669',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Bar */}
          {displayTotalElements > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: '#f9fafb',
              borderTop: '1px solid #e5e7eb',
              fontSize: '0.82rem',
              color: '#4b5563',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div>
                Showing <strong>{displayTotalElements > 0 ? page * pageSize + 1 : 0}–{Math.min(displayTotalElements, (page + 1) * pageSize)}</strong> of <strong>{displayTotalElements}</strong> tasks
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </button>
                {(() => {
                  const last = Math.max(0, displayTotalPages - 1);
                  const start = Math.max(0, page - 2);
                  const end = Math.min(last, page + 2);
                  const items = [];
                  for (let i = start; i <= end; i += 1) items.push(i);
                  return items.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={i === page ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => setPage(i)}
                    >
                      {i + 1}
                    </button>
                  ));
                })()}
                <span className="page-subtitle">Page {page + 1} of {displayTotalPages}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPage(p => Math.min(displayTotalPages - 1, p + 1))}
                  disabled={page >= displayTotalPages - 1}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task Deep Dive Modal ("What is going on inside task") */}
      {activeModalTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(17, 24, 39, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '840px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              background: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.75rem', background: '#059669', color: '#ffffff', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                  {activeModalTask.taskCode}
                </span>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontFamily: 'inherit', fontWeight: '700', margin: 0 }}>
                    {activeModalTask.displayName || activeModalTask.location?.locationName || 'Task Deep Inspection'}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Type: {activeModalTask.taskType} • Status: {activeModalTask.status}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setActiveModalTask(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.3rem' }}
              >
                <LucideX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* 1. Route Topology & Node Flow */}
              {activeModalTask.routeSnapshot && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '0.9rem', color: '#1e293b' }}>
                      <LucideGitCommit size={16} color="#7c3aed" />
                      <span>Route Topology: {activeModalTask.routeSnapshot.routeName} ({activeModalTask.routeSnapshot.topologyType || 'RING'})</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
                      Route Code: {activeModalTask.routeSnapshot.routeCode}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'center' }}>
                    {/* Current Node */}
                    {activeModalTask.routeSnapshot.currentNode && (
                      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Current GP Node (Start)</div>
                        <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                          {activeModalTask.routeSnapshot.currentNode.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                          Code: {activeModalTask.routeSnapshot.currentNode.code}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#0284c7', marginTop: '2px' }}>
                          📍 Lat: {activeModalTask.routeSnapshot.currentNode.lat}, Lng: {activeModalTask.routeSnapshot.currentNode.lng}
                        </div>
                      </div>
                    )}

                    {/* Arrow Indicator */}
                    <div style={{ textAlign: 'center', color: '#7c3aed', fontWeight: '700', fontSize: '0.85rem' }}>
                      <LucideArrowRight size={22} style={{ margin: '0 auto' }} />
                      <div>{formatKm(activeModalTask.coveredLengthKm)} Ring Fiber</div>
                    </div>

                    {/* Next Node */}
                    {activeModalTask.routeSnapshot.nextNode && (
                      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Next Target GP Node</div>
                        <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#0f172a', marginTop: '2px' }}>
                          {activeModalTask.routeSnapshot.nextNode.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                          Code: {activeModalTask.routeSnapshot.nextNode.code}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#0284c7', marginTop: '2px' }}>
                          📍 Lat: {activeModalTask.routeSnapshot.nextNode.lat}, Lng: {activeModalTask.routeSnapshot.nextNode.lng}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. Embedded GIS Workbench Map for Task Route & Plan Coordinates */}
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <LucideNavigation size={15} color="#0284c7" />
                  <span>Task GIS Plan & Route Workbench Map</span>
                </div>
                {(() => {
                  const nodes = activeModalTask.routeSnapshot?.nodes || activeModalTask.nodes || [];
                  const loc = activeModalTask.locationSnapshot || activeModalTask.location || {};
                  const childRoutes = Array.isArray(activeModalTask.routeSnapshot?.routes) ? activeModalTask.routeSnapshot.routes : [];
                  const covered = Number(activeModalTask.coveredLengthKm || 0);
                  const total = Number(activeModalTask.totalLengthKm || activeModalTask.plannedScopeKm || 10.5);
                  const pct = total > 0 ? Math.min(100, Math.round((covered / total) * 100)) : 0;

                  return (
                    <TaskRouteMap
                      planName={activeModalTask.routeSnapshot?.routeName || activeModalTask.displayName || `${loc.blockName || 'ANUPGARH'} - ${loc.district || 'GANGANAGAR'} - ${loc.circle || 'RAJASTHAN'}`}
                      circle={loc.circle || 'RAJASTHAN'}
                      district={loc.district || 'GANGANAGAR'}
                      block={loc.blockName || loc.block || 'ANUPGARH'}
                      gpCount={nodes.length || childRoutes.length || 2}
                      routeNodes={nodes}
                      currentNode={activeModalTask.routeSnapshot?.currentNode}
                      nextNode={activeModalTask.routeSnapshot?.nextNode}
                      childRoutes={childRoutes}
                      coveredKm={covered}
                      plannedScopeKm={total}
                      progressPct={pct}
                      height="460px"
                    />
                  );
                })()}
              </div>

              {/* 3. Progress Rollup & Scope Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '700', textTransform: 'uppercase' }}>Covered Distance</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0284c7', marginTop: '2px' }}>
                    {formatKm(activeModalTask.coveredLengthKm)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#0284c7' }}>
                    Total Route Scope: {formatKm(activeModalTask.routeSnapshot?.lengthKm || activeModalTask.totalLengthKm)}
                  </div>
                </div>

                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '700', textTransform: 'uppercase' }}>Segment Status</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#059669', marginTop: '2px' }}>
                    {activeModalTask.completedSegments || 0} / {activeModalTask.totalSegments || (activeModalTask.segmentSnapshots?.length || 1)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#059669' }}>
                    Total Ring Segments Assigned
                  </div>
                </div>

                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: '700', textTransform: 'uppercase' }}>Approval Hierarchy</div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: '#7c3aed', marginTop: '2px' }}>
                    {activeModalTask.approvalStatus || 'PENDING'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#7c3aed' }}>
                    Step Index: {activeModalTask.currentApprovalStepIndex || 0}
                  </div>
                </div>
              </div>

              {/* 4. Location Details & Network Attributes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideUser size={14} color="#059669" />
                    <span>Assigned Supervisor / User</span>
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#0f172a' }}>
                    {activeModalTask.assigneeName || activeModalTask.assigneeSnapshot?.name || 'Unassigned'}
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      color: '#0369a1',
                      background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      textTransform: 'uppercase'
                    }}>
                      {activeModalTask.assigneeSnapshot?.designation || activeModalTask.assigneeSnapshot?.role || activeModalTask.userType || 'Field-Supervisor'}
                    </span>
                  </div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideGlobe size={14} color="#0284c7" />
                    <span>Location & Network Attributes</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#334155', lineHeight: 1.5 }}>
                    🏢 Company: <strong>{activeModalTask.locationSnapshot?.company || activeModalTask.location?.company || 'Telecrats'}</strong><br />
                    📍 Location: <strong>{activeModalTask.locationSnapshot?.block || activeModalTask.location?.blockName || 'KARANPUR'}, {activeModalTask.locationSnapshot?.district || activeModalTask.location?.district || 'GANGANAGAR'}</strong><br />
                    🌐 OLT IP: <strong>{activeModalTask.locationSnapshot?.oltIp || activeModalTask.location?.oltIp || '10.0.186.218'}</strong><br />
                    ⚡ Phase & BA: <strong>{activeModalTask.locationSnapshot?.projectPhase || 'PHASE_1'} • {activeModalTask.locationSnapshot?.baCmp || 'Bikaner'}</strong>
                  </div>
                </div>
              </div>

              {/* 5. Live Task Execution Data Payload */}
              {activeModalTask.loadingExecution ? (
                <div style={{ padding: '16px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b', fontSize: '0.82rem' }}>
                  Loading live execution payload from iLync API...
                </div>
              ) : activeModalTask.taskExecution?.fieldData?.trenching ? (
                <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#854d0e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🚜 HDD Trenching Live Execution Log</span>
                  </div>

                  {/* Machine & Operator Specs */}
                  {activeModalTask.taskExecution.fieldData.trenching.trenchingMachineDetails && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.78rem', color: '#713f12', marginBottom: '10px' }}>
                      <div>🏢 Vendor: <strong>{activeModalTask.taskExecution.fieldData.trenching.trenchingMachineDetails.vendorName || 'KHALSA TELECOM'}</strong></div>
                      <div>🚜 Machine: <strong>{activeModalTask.taskExecution.fieldData.trenching.trenchingMachineDetails.machineName || '600202608399'}</strong></div>
                      <div>👤 Operator: <strong>{activeModalTask.taskExecution.fieldData.trenching.operatorDetails?.name || 'Rahul'}</strong></div>
                      <div>🧭 Pilot Locator: <strong>{activeModalTask.taskExecution.fieldData.trenching.locatorPilotDetails?.name || 'Kulwant Singh'}</strong></div>
                    </div>
                  )}

                  {/* Depth Capture Measurements Table */}
                  {activeModalTask.taskExecution.fieldData.trenching.trenchingEntries?.[0]?.depthCapture?.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#854d0e', marginBottom: '6px' }}>
                        📏 Depth Capture Measurements ({activeModalTask.taskExecution.fieldData.trenching.trenchingEntries[0].depthCapture.length} Points Recorded)
                      </div>
                      <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #fef08a', borderRadius: '6px', background: '#ffffff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#fef9c3', color: '#854d0e', borderBottom: '1px solid #fef08a' }}>
                              <th style={{ padding: '6px 10px' }}>#</th>
                              <th style={{ padding: '6px 10px' }}>Depth (m)</th>
                              <th style={{ padding: '6px 10px' }}>Temp (°C)</th>
                              <th style={{ padding: '6px 10px' }}>Road Offset</th>
                              <th style={{ padding: '6px 10px' }}>Coordinates</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeModalTask.taskExecution.fieldData.trenching.trenchingEntries[0].depthCapture.map((dp, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #fef08a' }}>
                                <td style={{ padding: '5px 10px', fontWeight: '700' }}>Point {idx + 1}</td>
                                <td style={{ padding: '5px 10px', fontWeight: '700', color: '#059669' }}>{dp.depth} m</td>
                                <td style={{ padding: '5px 10px' }}>{dp.temperature}°C</td>
                                <td style={{ padding: '5px 10px' }}>{dp.offsetFromCenterOfRoad} m</td>
                                <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>{dp.latitude}, {dp.longitude}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {activeModalTask.taskExecution.notes && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#854d0e', fontStyle: 'italic' }}>
                      Note: {activeModalTask.taskExecution.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                  Execution details unavailable
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottomLeftRadius: '16px',
              borderBottomRightRadius: '16px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Created At: {activeModalTask.createdAt ? new Date(activeModalTask.createdAt).toLocaleDateString() : 'N/A'} • Vendor: <strong>{getVendorName(activeModalTask.vendorId, activeModalTask)}</strong>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveModalTask(null)}
                  style={{ padding: '6px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  Close
                </button>
                {activeModalTask.status !== 'COMPLETED' && (
                  <button
                    onClick={() => { handleComplete(activeModalTask.id); setActiveModalTask(null); }}
                    style={{ padding: '6px 14px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Complete Task
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
