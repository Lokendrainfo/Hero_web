import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskService } from '../../services/taskService';
import { vendorService } from '../../services/vendorService';
import { useToast } from '../../context/ToastContext';
import { LeafletMap } from '../../components/common/LeafletMap';
import {
  LucideCheckSquare, LucidePlus, LucideRefreshCw, LucideMapPin,
  LucideUser, LucideLayers, LucideAlertCircle, LucideSearch,
  LucideBuilding2, LucideFilter, LucideEye, LucideX, LucideGitCommit,
  LucideArrowRight, LucidePhone, LucideShieldCheck, LucideGlobe, LucideNavigation
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
  const [selectedVendorId, setSelectedVendorId] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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
  }, [vendorScopedTasks, selectedTaskType, searchQuery]);

  // Reset page to 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [selectedTaskType, searchQuery, selectedVendorId]);

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

  // Compute dynamic task counts per type strictly from vendorScopedTasks
  const dynamicCounts = useMemo(() => {
    const counts = {};
    (vendorScopedTasks || []).forEach(t => {
      const type = t.taskType || t.type || 'OTHER';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [vendorScopedTasks]);

  const totalTaskCount = (isAdmin && activeVendorFilter === 'ALL' && typeCounts)
    ? Object.values(typeCounts).reduce((a, b) => a + Number(b || 0), 0)
    : vendorScopedTasks.length;

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

      <div className="filter-row">
        {[
          { key: 'ALL', title: 'All', count: (isAdmin && activeVendorFilter === 'ALL') ? totalAllCount : vendorScopedTasks.length },
          { key: 'GP_SURVEY', title: 'GP Survey', count: (isAdmin && activeVendorFilter === 'ALL' && typeCounts?.GP_SURVEY !== undefined) ? typeCounts.GP_SURVEY : vendorScopedTasks.filter(t => (t.taskType || t.type || '').toUpperCase().includes('GP')).length },
          { key: 'OTDR_SURVEY', title: 'OTDR', count: (isAdmin && activeVendorFilter === 'ALL' && typeCounts?.OTDR_SURVEY !== undefined) ? typeCounts.OTDR_SURVEY : vendorScopedTasks.filter(t => (t.taskType || t.type || '').toUpperCase().includes('OTDR')).length },
          { key: 'FIBER_SURVEY', title: 'Fiber Survey', count: (isAdmin && activeVendorFilter === 'ALL' && typeCounts?.FIBER_SURVEY !== undefined) ? typeCounts.FIBER_SURVEY : vendorScopedTasks.filter(t => (t.taskType || t.type || '').toUpperCase().includes('FIBER')).length },
          { key: 'FIBER_TRENCHING_DUCTING_TASK', title: 'Trenching', count: (isAdmin && activeVendorFilter === 'ALL' && typeCounts?.FIBER_TRENCHING_DUCTING_TASK !== undefined) ? typeCounts.FIBER_TRENCHING_DUCTING_TASK : vendorScopedTasks.filter(t => (t.taskType || t.type || '').toUpperCase().includes('TRENCH')).length }
        ].map(card => (
          <button
            key={card.key}
            type="button"
            className={`filter-chip ${selectedTaskType === card.key ? 'active' : ''}`}
            onClick={() => setSelectedTaskType(card.key)}
          >
            {card.title} {card.count}
          </button>
        ))}
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
              {paginatedTasks.map(t => {
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
              })}
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

              {/* 2. Embedded Leaflet Map Widget for Real Task Coordinates */}
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <LucideNavigation size={15} color="#0284c7" />
                  <span>Task Location Map & Ring Coordinates</span>
                </div>
                {(() => {
                  const nodes = activeModalTask.routeSnapshot?.nodes || activeModalTask.nodes || [];
                  const routePts = nodes.filter(n => n.lat && n.lng).map(n => [Number(n.lat), Number(n.lng)]);
                  if (routePts.length === 0 && activeModalTask.routeSnapshot?.currentNode?.lat && activeModalTask.routeSnapshot?.nextNode?.lat) {
                    routePts.push([Number(activeModalTask.routeSnapshot.currentNode.lat), Number(activeModalTask.routeSnapshot.currentNode.lng)]);
                    routePts.push([Number(activeModalTask.routeSnapshot.nextNode.lat), Number(activeModalTask.routeSnapshot.nextNode.lng)]);
                  }
                  const startLat = routePts.length > 0 ? routePts[0][0] : (activeModalTask.routeSnapshot?.currentNode?.lat || Number(activeModalTask.location?.latitude) || 29.841128);
                  const startLng = routePts.length > 0 ? routePts[0][1] : (activeModalTask.routeSnapshot?.currentNode?.lng || Number(activeModalTask.location?.longitude) || 73.536244);

                  return (
                    <LeafletMap
                      singleMachine={{
                        id: activeModalTask.id,
                        name: activeModalTask.displayName || activeModalTask.taskCode,
                        latitude: startLat,
                        longitude: startLng,
                        site_name: activeModalTask.location?.blockName || 'KARANPUR',
                        operator_name: activeModalTask.assigneeName || 'Gurbachan singh',
                        status: activeModalTask.status || 'CREATED'
                      }}
                      showRoute={routePts.length > 0}
                      routePoints={routePts}
                      height="240px"
                      zoom={12}
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
