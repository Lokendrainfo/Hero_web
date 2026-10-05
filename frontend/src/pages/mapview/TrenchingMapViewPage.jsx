import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LucideRefreshCw,
  LucideChevronDown,
  LucideChevronRight,
  LucideArrowLeft,
  LucideGlobe
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { mapHddExecutionResponse, parseAnyDate, parseDateToYMD } from '../../utils/mapHddExecutionResponse';
import { getAvailableStates, getAvailableDistricts } from '../../utils/geographyMaster';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchableSelect } from '../../components/common/Select';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DateField } from '../../components/common/DateField';

export const compactWhen = (value, executionId = null, fieldName = 'updatedAt') => {
  if (!value || value === 'N/A' || value === '—') return '—';
  const parsed = parseAnyDate(value) || new Date(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return value;

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(parsed);

  const day = parts.find(p => p.type === 'day')?.value || '';
  let month = parts.find(p => p.type === 'month')?.value || '';
  if (month === 'Sep') month = 'Sept';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value || '').toLowerCase();

  const formatted = `${day} ${month}, ${hour}:${minute} ${dayPeriod}`;

  if (executionId) {
    console.log('[TrenchingMapView Timestamp Debug]', {
      execution_id: executionId,
      raw_timestamp_from_api: value,
      timestamp_field_name: fieldName,
      parsed_timestamp: parsed.toISOString(),
      final_display_timestamp: formatted,
      timezone: 'Asia/Kolkata (IST, UTC+05:30)'
    });
  }

  return formatted;
};

export const TrenchingMapViewPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedVendorId, roles, isAdmin, hasPermission, user } = useAuth();

  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('mapview.view');

  const isAdvanceUser = user?.user_type === 'ADVANCE';
  const assignedCircle = user?.selected_circle_name ? user.selected_circle_name.toUpperCase() : null;
  const assignedDistrict = user?.selected_district_name ? user.selected_district_name.toUpperCase() : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawTasksList, setRawTasksList] = useState([]);
  const [fetchedChildrenTaskIds, setFetchedChildrenTaskIds] = useState(() => new Set());
  const [normalizedExecutions, setNormalizedExecutions] = useState([]);

  // Filters State
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');

  // Auto-lock state/district filters for Advance User scope
  useEffect(() => {
    if (isAdvanceUser && assignedCircle) {
      setSelectedState(assignedCircle);
      if (assignedDistrict) {
        setSelectedDistrict(assignedDistrict);
      }
    }
  }, [isAdvanceUser, assignedCircle, assignedDistrict]);

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

        const dExisting = parseAnyDate(existing.lastModified || existing.updatedAt);
        const dCurrent = parseAnyDate(ex.lastModified || ex.updatedAt);
        const tExisting = dExisting ? dExisting.getTime() : 0;
        const tCurrent = dCurrent ? dCurrent.getTime() : 0;

        // Check if either task specifically has execution or activity on selectedDate
        const targetDateYMD = parseDateToYMD(selectedDate) || selectedDate;
        const currentHasSelectedDate = Boolean(targetDateYMD && (
          (ex.availableDates || []).includes(targetDateYMD) ||
          parseDateToYMD(ex.lastModified || ex.updatedAt) === targetDateYMD ||
          parseDateToYMD(ex.date) === targetDateYMD
        ));
        const existingHasSelectedDate = Boolean(targetDateYMD && (
          (existing.availableDates || []).includes(targetDateYMD) ||
          parseDateToYMD(existing.lastModified || existing.updatedAt) === targetDateYMD ||
          parseDateToYMD(existing.date) === targetDateYMD
        ));

        let preferCurrent = false;
        if (currentHasSelectedDate && !existingHasSelectedDate) {
          preferCurrent = true;
        } else if (existingHasSelectedDate && !currentHasSelectedDate) {
          preferCurrent = false;
        } else if (tCurrent !== tExisting) {
          preferCurrent = tCurrent > tExisting;
        } else {
          preferCurrent = currentDataScore >= existingDataScore;
        }

        const primary = preferCurrent ? ex : existing;
        const secondary = preferCurrent ? existing : ex;

        // Merge telemetry without duplicate shots/pits
        const mergedShots = [...(existing.shots || [])];
        const seenShotKeys = new Set(mergedShots.map(s => `${s.serialNo || s.name || ''}_${s.startTime || ''}`));
        (ex.shots || []).forEach(s => {
          const k = `${s.serialNo || s.name || ''}_${s.startTime || ''}`;
          if (!seenShotKeys.has(k)) {
            seenShotKeys.add(k);
            mergedShots.push(s);
          }
        });

        const mergedPits = [...(existing.pits || [])];
        const seenPitKeys = new Set(mergedPits.map(p => `${p.serialNo || p.name || ''}_${p.diggingTime || ''}`));
        (ex.pits || []).forEach(p => {
          const k = `${p.serialNo || p.name || ''}_${p.diggingTime || ''}`;
          if (!seenPitKeys.has(k)) {
            seenPitKeys.add(k);
            mergedPits.push(p);
          }
        });

        const mergedDates = Array.from(new Set([...(existing.availableDates || []), ...(ex.availableDates || [])])).sort();

        // Determine green bulb timestamp (latest physical depth point or pit) across all merged telemetry
        let greenBulbTimestamp = null;
        let maxBulbTime = -Infinity;
        mergedShots.forEach(s => {
          (s.depthReadings || []).forEach(dp => {
            const d = parseAnyDate(dp.capturedAt || dp.createdAt);
            if (d && d.getTime() > maxBulbTime) {
              maxBulbTime = d.getTime();
              greenBulbTimestamp = d.toISOString();
            }
          });
        });
        if (!greenBulbTimestamp) {
          mergedPits.forEach(p => {
            const d = parseAnyDate(p.diggingTime || p.createdAt);
            if (d && d.getTime() > maxBulbTime) {
              maxBulbTime = d.getTime();
              greenBulbTimestamp = d.toISOString();
            }
          });
        }
        if (!greenBulbTimestamp) {
          const latestTime = Math.max(tExisting, tCurrent);
          greenBulbTimestamp = latestTime > 0 ? new Date(latestTime).toISOString() : (ex.lastModified || existing.lastModified);
        }

        // Use the ID of the primary task matching the selected date / active execution
        const targetId = (primary.shots?.length || primary.pits?.length || currentHasSelectedDate || existingHasSelectedDate)
          ? primary.id
          : ((secondary.shots?.length || secondary.pits?.length) ? secondary.id : primary.id);

        userExecMap.set(key, {
          ...primary,
          id: targetId,
          userId: primary.userId || ex.userId || existing.userId,
          user: existing.user || ex.user,
          state: primary.state || ex.state || existing.state,
          district: primary.district || ex.district || existing.district,
          block: primary.block || ex.block || existing.block,
          updatedAt: greenBulbTimestamp,
          lastModified: greenBulbTimestamp,
          shots: mergedShots,
          pits: mergedPits,
          availableDates: mergedDates,
        });
      }
    });

    setNormalizedExecutions(Array.from(userExecMap.values()));
  }, [selectedDate]);

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

      // Fetch 100% real-time live execution tasks directly from upstream iLync API in-memory
      const res = await taskService.getMapViewExecutions(params);
      const resData = res?.data?.data || res?.data || res;
      const rawTasks = resData?.results || resData?.content || (Array.isArray(resData) ? resData : []);

      setRawTasksList(rawTasks);
      processAndSetExecutions(rawTasks);
      setLoading(false);
      setIsBackgroundLoading(false);

    } catch (err) {
      console.error('[TrenchingMapViewPage] Error fetching HDD execution data:', err);
      // Fallback with live parameters if dedicated endpoint errors
      try {
        const fallbackRes = await taskService.getMyTasks({ ...params, live: true, telemetry: true });
        const fbData = fallbackRes?.data?.data || fallbackRes?.data || fallbackRes;
        const fbTasks = fbData?.results || fbData?.content || (Array.isArray(fbData) ? fbData : []);
        setRawTasksList(fbTasks);
        processAndSetExecutions(fbTasks);
      } catch (fbErr) {
        setError(err?.message || 'Failed to load live HDD execution data from server.');
      }
      setLoading(false);
      setIsBackgroundLoading(false);
    }
  }, [selectedVendorId, processAndSetExecutions]);

  useEffect(() => {
    fetchHddData();
  }, [fetchHddData]);

  useEffect(() => {
    if (rawTasksList && rawTasksList.length > 0) {
      processAndSetExecutions(rawTasksList);
    }
  }, [selectedDate, processAndSetExecutions, rawTasksList]);


  // Memoized available states dynamically
  const availableStates = useMemo(() => {
    return getAvailableStates(normalizedExecutions, isAdvanceUser && assignedCircle ? assignedCircle : null);
  }, [normalizedExecutions, isAdvanceUser, assignedCircle]);

  // Memoized available districts dynamically
  const availableDistricts = useMemo(() => {
    return getAvailableDistricts(selectedState, normalizedExecutions);
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
      if (ex.district && ex.district !== 'OTHER') dSet.add(ex.district);
      if (ex.district && ex.block && ex.district !== 'OTHER') bSet.add(`${ex.district}_${ex.block}`);
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
              disabled={isAdvanceUser && !!assignedCircle}
              onChange={e => {
                setSelectedState(e.target.value);
                setSelectedDistrict('ALL');
              }}
              className="vendor-switcher"
              style={{ height: 36, minWidth: 140 }}
            >
              {!isAdvanceUser && <option value="ALL">All states</option>}
              {availableStates.map(st => (
                <option key={st} value={st}>
                  {st.charAt(0) + st.slice(1).toLowerCase()} {isAdvanceUser && assignedCircle === st ? '🔒 (Assigned Circle Scope)' : ''}
                </option>
              ))}
            </SearchableSelect>

            <SearchableSelect
              value={selectedDistrict}
              disabled={isAdvanceUser && !!assignedDistrict}
              onChange={e => setSelectedDistrict(e.target.value)}
              className="vendor-switcher"
              style={{ height: 36, minWidth: 160 }}
            >
              {(!isAdvanceUser || !assignedDistrict) && <option value="ALL">All districts</option>}
              {availableDistricts.map(dist => (
                <option key={dist} value={dist}>
                  {dist} {isAdvanceUser && assignedDistrict === dist ? '🔒 (Assigned District)' : ''}
                </option>
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px', flexWrap: 'wrap', gap: 8 }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-secondary, #475569)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                    {bName && bName !== 'OTHER' ? bName : 'Block'}
                                  </div>
                                  <a
                                    className="btn-secondary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', textDecoration: 'none', height: 28 }}
                                    href={`/map-view/block?block=${encodeURIComponent(bName)}&district=${encodeURIComponent(dName)}&state=${encodeURIComponent(selectedState || '')}${selectedDate ? `&date=${selectedDate}` : ''}&mode=block`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <LucideGlobe size={13} /> Open Full Block Map
                                  </a>
                                </div>
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
                                          {compactWhen(ex.updatedAt || ex.lastModified, ex.id, ex.updatedAt ? 'updatedAt' : 'lastModified')}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <a
                                            className="exec-tree-map"
                                            href={`/map-view/${ex.id}?userId=${encodeURIComponent(ex.userId || ex.user)}&userName=${encodeURIComponent(ex.user)}&block=${encodeURIComponent(ex.block || bName)}&district=${encodeURIComponent(ex.district || dName)}&state=${encodeURIComponent(ex.state || selectedState || '')}${selectedDate ? `&date=${selectedDate}` : ''}&mode=user`}
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

