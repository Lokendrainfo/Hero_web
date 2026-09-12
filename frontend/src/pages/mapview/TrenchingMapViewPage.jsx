import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LucideGlobe,
  LucideRefreshCw,
  LucideMapPin,
  LucideBuilding2,
  LucideUser,
  LucideChevronDown,
  LucideChevronRight,
  LucideExternalLink,
  LucideClock,
  LucideDownload,
  LucideLayers,
  LucideAlertCircle,
  LucideArrowLeft
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { mapHddExecutionResponse } from '../../utils/mapHddExecutionResponse';

export const TrenchingMapViewPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedVendorId, roles, vendors, isAdmin, hasPermission } = useAuth();

  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('mapview.view');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [normalizedExecutions, setNormalizedExecutions] = useState([]);

  // Filters State
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(dateParam || (() => new Date().toISOString().split('T')[0]));

  // Expansion State - Default ALL COLLAPSED as requested
  const [expandedDistricts, setExpandedDistricts] = useState({});
  const [expandedBlocks, setExpandedBlocks] = useState({});

  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);

  const processAndSetExecutions = useCallback((tasksList) => {
    const normalized = tasksList.map(t => mapHddExecutionResponse(t)).filter(Boolean);

    // Deduplicate by District + Block + User
    const userExecMap = new Map();
    normalized.forEach(ex => {
      if (!ex.user || !ex.district) return;
      const key = `${(ex.district || '').toUpperCase()}_${(ex.block || '').toUpperCase()}_${(ex.user || '').trim().toUpperCase()}`;
      if (!userExecMap.has(key)) {
        userExecMap.set(key, ex);
      } else {
        const existing = userExecMap.get(key);
        const existingDataScore = (existing.shots?.length || 0) + (existing.pits?.length || 0) + (existing.depthPoints?.length || 0);
        const currentDataScore = (ex.shots?.length || 0) + (ex.pits?.length || 0) + (ex.depthPoints?.length || 0);
        if (currentDataScore > existingDataScore) {
          userExecMap.set(key, {
            ...ex,
            id: existing.id || ex.id,
            user: existing.user || ex.user
          });
        }
      }
    });

    setNormalizedExecutions(Array.from(userExecMap.values()));
  }, []);

  const fetchHddData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        task_type: 'FIBER_TRENCHING_DUCTING_TASK',
        page: 0,
        size: 50
      };
      if (selectedVendorId && selectedVendorId !== 'all') {
        params.vendor_id = selectedVendorId;
      }

      // Step 1: Immediately fetch root tasks
      const res = await taskService.getMyTasks(params);
      const resData = res?.data || res;
      const rawTasks = resData?.results || resData?.content || (Array.isArray(resData) ? resData : []);

      // Step 2: Instantly process and display root tasks (Instant UI Render!)
      processAndSetExecutions(rawTasks);
      setLoading(false); // Screen is rendered immediately!

      // Step 3: Fetch child tasks progressively in background
      setIsBackgroundLoading(true);
      const accumulatedTasks = [...rawTasks];

      const fetchChildrenInBackground = async () => {
        for (const rootTask of rawTasks) {
          if (!rootTask.id) continue;
          try {
            const childRes = await taskService.getTaskChildren(rootTask.id);
            const childData = childRes?.data || childRes;
            const children = Array.isArray(childData) ? childData : (childData?.results || childData?.content || []);
            if (children.length > 0) {
              accumulatedTasks.push(...children);
              processAndSetExecutions(accumulatedTasks); // Update UI progressively as data arrives
            }
          } catch (e) {
            // Ignore individual child fetch errors
          }
        }
        setIsBackgroundLoading(false);
      };

      fetchChildrenInBackground();

    } catch (err) {
      console.error('[TrenchingMapViewPage] Error fetching HDD execution data:', err);
      setError(err?.message || 'Failed to load HDD execution data from server.');
      setLoading(false);
      setIsBackgroundLoading(false);
    }
  }, [selectedVendorId, processAndSetExecutions]);

  useEffect(() => {
    fetchHddData();
  }, [fetchHddData]);

  if (isVendorAccount) {
    return (
      <div style={{ padding: '60px 20px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <LucideAlertCircle size={44} color="#dc2626" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#991b1b', margin: 0 }}>Access Denied</h3>
          <p style={{ fontSize: '0.88rem', color: '#7f1d1d', marginTop: '8px' }}>
            Map View is restricted and not accessible for Vendor accounts.
          </p>
          <button onClick={() => navigate('/tasks')} className="btn-primary" style={{ marginTop: '16px', padding: '8px 18px', fontSize: '0.84rem' }}>
            ← Go to My Tasks
          </button>
        </div>
      </div>
    );
  }

  // Memoized available districts
  const availableDistricts = useMemo(() => {
    return Array.from(
      new Set(
        normalizedExecutions
          .filter(ex => selectedState === 'ALL' || (ex.state || '').toUpperCase() === selectedState.toUpperCase())
          .map(ex => ex.district)
          .filter(Boolean)
      )
    ).sort();
  }, [normalizedExecutions, selectedState]);

  // Memoized filtered executions by selectedState & selectedDistrict
  const filteredExecutions = useMemo(() => {
    return normalizedExecutions.filter(ex => {
      if (selectedState !== 'ALL' && (ex.state || '').toUpperCase() !== selectedState.toUpperCase()) {
        return false;
      }
      if (selectedDistrict !== 'ALL' && (ex.district || '').toUpperCase() !== selectedDistrict.toUpperCase()) {
        return false;
      }
      return true;
    });
  }, [normalizedExecutions, selectedState, selectedDistrict]);

  // Memoized summary counts and grouping by District -> Block
  const { districtsSet, blocksSet, usersSet, groupedByDistrict } = useMemo(() => {
    const dSet = new Set();
    const bSet = new Set();
    const uSet = new Set();
    const grouped = {};

    filteredExecutions.forEach(ex => {
      if (ex.district) dSet.add(ex.district);
      if (ex.district && ex.block) bSet.add(`${ex.district}_${ex.block}`);
      if (ex.user) uSet.add(ex.user);

      const dName = ex.district || 'OTHER';
      const bName = ex.block || 'OTHER';
      if (!grouped[dName]) {
        grouped[dName] = {};
      }
      if (!grouped[dName][bName]) {
        grouped[dName][bName] = [];
      }
      grouped[dName][bName].push(ex);
    });

    return {
      districtsSet: dSet,
      blocksSet: bSet,
      usersSet: uSet,
      groupedByDistrict: grouped
    };
  }, [filteredExecutions]);

  const toggleDistrict = (dName) => {
    setExpandedDistricts(prev => ({ ...prev, [dName]: !prev[dName] }));
  };

  const toggleBlock = (bKey) => {
    setExpandedBlocks(prev => ({ ...prev, [bKey]: !prev[bKey] }));
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>

      {/* 1. Header Banner & Top Controls */}
      <div className="app-card" style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #0a2d23 0%, #114b3a 100%)', color: '#ffffff', borderRadius: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>

          {/* Left: Back Button & Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/map-view')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
              title="Back to Module Selection"
            >
              <LucideArrowLeft size={16} /> Back
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideGlobe size={20} color="#34d399" />
                <h1 style={{ fontSize: '1.3rem', fontFamily: 'Outfit, sans-serif', fontWeight: '800', margin: 0, color: '#ffffff' }}>
                  ilync-Live
                </h1>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#a7f3d0', marginTop: '2px', fontWeight: '600' }}>
                HDD / Trenching Execution Progress
              </div>
            </div>
          </div>

          {/* Right Top Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

            {/* State Select */}
            <select
              value={selectedState}
              onChange={e => {
                setSelectedState(e.target.value);
                setSelectedDistrict('ALL');
              }}
              style={{
                padding: '7px 12px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: '700',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL" style={{ color: '#000' }}>State: All States</option>
              <option value="RAJASTHAN" style={{ color: '#000' }}>State: RAJASTHAN</option>
              <option value="HARYANA" style={{ color: '#000' }}>State: HARYANA</option>
              <option value="ASSAM" style={{ color: '#000' }}>State: ASSAM</option>
            </select>

            {/* District Select */}
            <select
              value={selectedDistrict}
              onChange={e => setSelectedDistrict(e.target.value)}
              style={{
                padding: '7px 12px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: '700',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL" style={{ color: '#000' }}>District: All Districts</option>
              {availableDistricts.map(dist => (
                <option key={dist} value={dist} style={{ color: '#000' }}>
                  District: {dist}
                </option>
              ))}
            </select>

            {/* Date Select */}
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: '700',
                outline: 'none',
                cursor: 'pointer'
              }}
            />

            <button
              onClick={fetchHddData}
              disabled={loading || isBackgroundLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '800',
                cursor: 'pointer'
              }}
            >
              <LucideRefreshCw size={13} className={(loading || isBackgroundLoading) ? 'animate-spin' : ''} />
              <span>{isBackgroundLoading ? 'Syncing...' : 'Fetch Data'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Hierarchy Sub-Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
          <LucideLayers size={18} color="#059669" />
          <span>Execution Progress Data</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: '#06b6d4',
            color: '#ffffff',
            padding: '5px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: '800'
          }}>
            {districtsSet.size} Districts, {blocksSet.size} Blocks, {usersSet.size} Users
          </span>

          <button
            onClick={() => alert('Exporting HDD Execution data to Excel...')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <LucideDownload size={13} />
            <span>Export to Excel</span>
          </button>
        </div>
      </div>

      {/* 3. District Cards Grid (Collapsible District -> Block -> User) */}
      {loading ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <style>{`
            @keyframes gis-ring-spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes gis-dot-pulse {
              0%, 100% { transform: scale(0.8); opacity: 0.5; }
              50% { transform: scale(1.2); opacity: 1; }
            }
          `}</style>
          <div style={{ position: 'relative', width: '48px', height: '48px', marginBottom: '14px' }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '3px solid #e2e8f0',
              borderTopColor: '#059669',
              borderRightColor: '#34d399',
              animation: 'gis-ring-spin 0.9s linear infinite'
            }} />
            <div style={{
              position: 'absolute',
              inset: '7px',
              borderRadius: '50%',
              border: '2px solid transparent',
              borderBottomColor: '#0284c7',
              borderLeftColor: '#38bdf8',
              animation: 'gis-ring-spin 0.6s linear infinite reverse'
            }} />
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginTop: '-5px',
              marginLeft: '-5px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#059669',
              boxShadow: '0 0 6px #059669',
              animation: 'gis-dot-pulse 1.2s ease-in-out infinite'
            }} />
          </div>
          <div style={{ fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>Loading...</div>
        </div>
      ) : error ? (
        <div style={{ padding: '20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '0.85rem' }}>
          {error}
        </div>
      ) : Object.keys(groupedByDistrict).length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          No execution data available for selected state/date filter.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '12px',
          alignItems: 'start'
        }}>
          {Object.keys(groupedByDistrict).map((dName) => {
            const blocksDict = groupedByDistrict[dName];
            const isDistrictExpanded = Boolean(expandedDistricts[dName]);
            const blockNames = Object.keys(blocksDict);
            const districtUsersCount = new Set(
              blockNames.flatMap(b => blocksDict[b].map(ex => ex.user))
            ).size;

            return (
              <div
                key={dName}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                {/* District Card Header Bar */}
                <div
                  onClick={() => toggleDistrict(dName)}
                  style={{
                    padding: '12px 14px',
                    background: isDistrictExpanded ? '#f0fdf4' : '#ffffff',
                    borderBottom: isDistrictExpanded ? '1px solid #cbd5e1' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isDistrictExpanded ? (
                      <LucideChevronDown size={18} color="#059669" />
                    ) : (
                      <LucideChevronRight size={18} color="#64748b" />
                    )}
                    <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <LucideMapPin size={16} color="#0284c7" />
                      {dName}
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      background: '#06b6d4',
                      color: '#ffffff',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontWeight: '800'
                    }}>
                      {blockNames.length} blocks, {districtUsersCount} users
                    </span>
                  </div>

                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500' }}>
                    {isDistrictExpanded ? 'Collapse' : 'Expand'}
                  </span>
                </div>

                {/* Expanded District Blocks */}
                {isDistrictExpanded && (
                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fafafa' }}>
                    {blockNames.map((bName) => {
                      const bKey = `${dName}_${bName}`;
                      const isBlockExpanded = Boolean(expandedBlocks[bKey]);
                      const execList = blocksDict[bName];
                      const blockUsersCount = new Set(execList.map(ex => ex.user)).size;

                      return (
                        <div
                          key={bName}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          {/* Block Header */}
                          <div
                            onClick={() => toggleBlock(bKey)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              userSelect: 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isBlockExpanded ? (
                                <LucideChevronDown size={16} color="#059669" />
                              ) : (
                                <LucideChevronRight size={16} color="#64748b" />
                              )}
                              <LucideBuilding2 size={16} color="#059669" />
                              <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0f172a' }}>
                                {bName}
                              </span>
                              <span style={{
                                fontSize: '0.7rem',
                                background: '#10b981',
                                color: '#ffffff',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontWeight: '800'
                              }}>
                                {blockUsersCount} users
                              </span>
                            </div>
                            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                              {isBlockExpanded ? 'Hide' : 'Show'}
                            </span>
                          </div>

                          {/* Inside Block: Field User Item List */}
                          {isBlockExpanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                              {execList.map((ex) => (
                                <div
                                  key={ex.id}
                                  style={{
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    fontSize: '0.78rem'
                                  }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <LucideUser size={14} color="#334155" />
                                      <strong style={{ color: '#0f172a' }}>{ex.user}</strong>
                                      <span style={{
                                        fontSize: '0.65rem',
                                        background: '#0284c7',
                                        color: '#ffffff',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: '800'
                                      }}>
                                        {ex.workExecutionMode || 'HDD'}
                                      </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '0.7rem' }}>
                                      <LucideClock size={12} />
                                      <span>Last Modified: {ex.lastModified}</span>
                                    </div>
                                  </div>

                                  {/* Open GIS Map Popout Button */}
                                  <button
                                    onClick={() => navigate(`/map-view/${ex.id}${selectedDate ? `?date=${selectedDate}` : ''}`)}
                                    title="Open GIS Map View"
                                    style={{
                                      background: '#ffffff',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '6px',
                                      padding: '5px 8px',
                                      color: '#059669',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                    }}
                                  >
                                    <LucideExternalLink size={16} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
