import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LucideRefreshCw,
  LucideChevronDown,
  LucideChevronRight,
  LucideArrowLeft
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { mapHddExecutionResponse } from '../../utils/mapHddExecutionResponse';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchableSelect } from '../../components/common/Select';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DateField } from '../../components/common/DateField';

const compactWhen = (value) => {
  if (!value || value === 'N/A') return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const TrenchingMapViewPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedVendorId, roles, isAdmin, hasPermission } = useAuth();

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
      <div className="screen-container">
        <EmptyState
          title="Map view is not available"
          subtitle="This module is not available on vendor accounts."
        >
          <button type="button" className="btn-primary" onClick={() => navigate('/tasks')}>
            Back to tasks
          </button>
        </EmptyState>
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
  const { districtsSet, blocksSet, usersSet, groupedByDistrict, executionCount } = useMemo(() => {
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
      groupedByDistrict: grouped,
      executionCount: filteredExecutions.length,
    };
  }, [filteredExecutions]);

  const toggleDistrict = (dName) => {
    setExpandedDistricts(prev => ({ ...prev, [dName]: !prev[dName] }));
  };

  const toggleBlock = (bKey) => {
    setExpandedBlocks(prev => ({ ...prev, [bKey]: !prev[bKey] }));
  };


  return (
    <div className="screen-container">
      <PageHeader
        title="Trenching map"
        subtitle="District → block → field user. Maps open in a new full-screen window."
        actions={
          <button type="button" className="btn-secondary" onClick={() => navigate('/map-view')}>
            <LucideArrowLeft size={16} /> Modules
          </button>
        }
      />

      <div className="panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SearchableSelect
              value={selectedState}
              onChange={e => {
                setSelectedState(e.target.value);
                setSelectedDistrict('ALL');
              }}
              className="vendor-switcher"
              style={{ height: 36, minWidth: 140 }}
            >
              <option value="ALL">All states</option>
              <option value="RAJASTHAN">Rajasthan</option>
              <option value="HARYANA">Haryana</option>
              <option value="ASSAM">Assam</option>
            </SearchableSelect>

            <SearchableSelect
              value={selectedDistrict}
              onChange={e => setSelectedDistrict(e.target.value)}
              className="vendor-switcher"
              style={{ height: 36, minWidth: 160 }}
            >
              <option value="ALL">All districts</option>
              {availableDistricts.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </SearchableSelect>

            <DateField
              required
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Execution date"
            />
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={fetchHddData}
            disabled={loading || isBackgroundLoading}
          >
            <LucideRefreshCw size={13} className={(loading || isBackgroundLoading) ? 'animate-spin' : ''} />
            <span>{isBackgroundLoading ? 'Syncing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Districts</div>
          <div className="kpi-value">{districtsSet.size}</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Blocks</div>
          <div className="kpi-value">{blocksSet.size}</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Users</div>
          <div className="kpi-value">{usersSet.size}</div>
        </div>
        <div className="kpi-cell kpi-cell-static">
          <div className="kpi-label">Crews</div>
          <div className="kpi-value">{executionCount}</div>
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-header" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="panel-title">Execution progress</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              District → block → field user
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner title="Loading…" subtitle="Fetching execution crews" />
        ) : error ? (
          <EmptyState title="Could not load execution data" subtitle={error} />
        ) : Object.keys(groupedByDistrict).length === 0 ? (
          <EmptyState
            title="No execution data"
            subtitle="Nothing matches the selected state or district."
          />
        ) : (
          <div className="exec-tree" style={{ border: 'none', borderRadius: 0 }}>
            {Object.keys(groupedByDistrict).sort().map((dName) => {
              const blocksDict = groupedByDistrict[dName];
              const isDistrictExpanded = Boolean(expandedDistricts[dName]);
              const blockNames = Object.keys(blocksDict).sort();
              const districtUsersCount = new Set(
                blockNames.flatMap((b) => blocksDict[b].map((ex) => ex.user))
              ).size;

              return (
                <div key={dName} className="exec-tree-district">
                  <button
                    type="button"
                    className={`exec-tree-toggle${isDistrictExpanded ? ' is-open' : ''}`}
                    onClick={() => toggleDistrict(dName)}
                    aria-expanded={isDistrictExpanded}
                  >
                    {isDistrictExpanded ? <LucideChevronDown size={16} /> : <LucideChevronRight size={16} />}
                    <span className="exec-tree-name">{dName}</span>
                    <span className="exec-tree-meta">
                      {blockNames.length} {blockNames.length === 1 ? 'block' : 'blocks'}
                      {' · '}
                      {districtUsersCount} {districtUsersCount === 1 ? 'user' : 'users'}
                    </span>
                  </button>

                  {isDistrictExpanded && (
                    <div className="exec-tree-body">
                      {blockNames.map((bName) => {
                        const bKey = `${dName}_${bName}`;
                        const execList = blocksDict[bName];
                        const isBlockExpanded = blockNames.length === 1 || Boolean(expandedBlocks[bKey]);

                        return (
                          <div key={bName} className="exec-tree-block">
                            {blockNames.length > 1 && (
                              <button
                                type="button"
                                className={`exec-tree-toggle exec-tree-toggle--block${isBlockExpanded ? ' is-open' : ''}`}
                                onClick={() => toggleBlock(bKey)}
                                aria-expanded={isBlockExpanded}
                              >
                                {isBlockExpanded ? <LucideChevronDown size={15} /> : <LucideChevronRight size={15} />}
                                <span className="exec-tree-name">{bName}</span>
                                <span className="exec-tree-meta">
                                  {execList.length} {execList.length === 1 ? 'user' : 'users'}
                                </span>
                              </button>
                            )}

                            {isBlockExpanded && (
                              <div className="exec-tree-users">
                                {blockNames.length === 1 && bName && bName !== 'OTHER' && (
                                  <div className="exec-tree-meta" style={{ padding: '8px 12px 0' }}>{bName}</div>
                                )}
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>User</th>
                                      <th>Mode</th>
                                      <th>Last modified</th>
                                      <th />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {execList.map((ex) => (
                                      <tr key={ex.id}>
                                        <td><strong>{ex.user || '—'}</strong></td>
                                        <td>
                                          {ex.workExecutionMode && ex.workExecutionMode !== 'N/A' ? (
                                            <span className="badge-pill badge-neutral">{ex.workExecutionMode}</span>
                                          ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                          )}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                          {compactWhen(ex.updatedAt || ex.lastModified)}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <a
                                            className="exec-tree-map"
                                            href={`/map-view/${ex.id}${selectedDate ? `?date=${selectedDate}` : ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            Open map
                                          </a>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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

    </div>
  );
};
