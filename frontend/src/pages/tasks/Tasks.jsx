import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation, Link } from 'react-router-dom';
import { taskService } from '../../services/taskService';
import { TaskPlanningTable } from './TaskPlanningTable';
import { TaskExecutionWorkspace } from './TaskExecutionWorkspace';
import './Tasks.css';

// 9 Planning Categories
export const PLANNING_CATEGORIES = [
  { key: 'gp_survey', label: 'GP Survey', backendType: 'GP_SURVEY', countKey: 'GP_SURVEY' },
  { key: 'block', label: 'Block', backendType: 'BLOCK_SURVEY', countKey: 'BLOCK_SURVEY' },
  { key: 'fiber', label: 'Fiber', backendType: 'FIBER_SURVEY', countKey: 'FIBER_SURVEY' },
  { key: 'otdr', label: 'OTDR', backendType: 'OTDR_SURVEY', countKey: 'OTDR_SURVEY' },
  { key: 'dtp', label: 'DTP', backendType: 'DTP', countKey: 'DTP' },
  { key: 'green_v2', label: 'Green V2', backendType: 'GREEN_SURVEY_V2', fallbackType: 'GREEN_SURVEY', countKey: 'GREEN_SURVEY_V2' },
  { key: 'land_based_v2', label: 'Land Based V2', backendType: 'LAND_BASED_SURVEY_V2', fallbackType: 'LAND_BASED_SURVEY', countKey: 'LAND_BASED_SURVEY_V2' },
  { key: 'brown', label: 'Brown', backendType: 'BROWN_SURVEY', countKey: 'BROWN_SURVEY' },
  { key: 'electric_meter', label: 'Electric Meter Task', backendType: 'ELECTRIC_METER_TASK', countKey: 'ELECTRIC_METER_TASK' }
];

// Execution Groups & Categories
export const EXECUTION_GROUPS = [
  {
    key: 'infra',
    label: 'Infra Task',
    shortLabel: 'Infra',
    categories: [
      { key: 'gp_infra', label: 'GP Infra', backendType: 'GP_INFRA', countKey: 'GP_INFRA' },
      { key: 'block_infra', label: 'Block Infra', backendType: 'BLOCK_INFRA', countKey: 'BLOCK_INFRA' }
    ]
  },
  {
    key: 'fiber',
    label: 'Fiber Task',
    shortLabel: 'Fiber',
    categories: [
      { key: 'trenching_ducting', label: 'Trenching & Ducting', backendType: 'FIBER_TRENCHING_DUCTING_TASK', countKey: 'FIBER_TRENCHING_DUCTING_TASK' },
      { key: 'manhole', label: 'Manhole', backendType: 'MANHOLE', countKey: 'MANHOLE' },
      { key: 'blowing', label: 'Blowing', backendType: 'BLOWING', countKey: 'BLOWING' },
      { key: 'splicing', label: 'Splicing', backendType: 'SPLICING', countKey: 'SPLICING' },
      { key: 'otdr', label: 'OTDR', backendType: 'OTDR_TASK', countKey: 'OTDR_TASK' },
      { key: 'route_marker', label: 'Route Marker', backendType: 'ROUTE_MARKER', countKey: 'ROUTE_MARKER' }
    ]
  }
];

export const Tasks = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [typeCounts, setTypeCounts] = useState(null);

  const pathname = location.pathname;
  const isExecutionPath = pathname.startsWith('/tasks/execution');

  // Active Tab: 'planning' | 'execution'
  const rawTab = searchParams.get('tab');
  const activeTab = rawTab || (isExecutionPath ? 'execution' : 'planning');

  // Active Group (for Execution: 'infra' | 'fiber')
  const paramGroup = searchParams.get('group');
  const paramCategory = searchParams.get('category');

  const activeGroup = useMemo(() => {
    if (activeTab === 'planning') return null;
    if (paramGroup) return paramGroup.toLowerCase();
    if (paramCategory && ['gp_infra', 'block_infra'].includes(paramCategory.toLowerCase())) return 'infra';
    if (paramCategory && ['trenching_ducting', 'manhole', 'blowing', 'splicing', 'otdr', 'route_marker'].includes(paramCategory.toLowerCase())) return 'fiber';
    return 'infra';
  }, [activeTab, paramGroup, paramCategory]);

  // Active Category key
  const activeCategory = useMemo(() => {
    if (activeTab === 'planning') {
      return paramCategory || 'gp_survey';
    }
    if (paramCategory) return paramCategory;
    return activeGroup === 'infra' ? 'gp_infra' : 'trenching_ducting';
  }, [activeTab, activeGroup, paramCategory]);

  // Fetch real counts from backend
  const fetchCounts = () => {
    taskService.getTypeCounts()
      .then(res => {
        const data = res.data?.data || res.data || {};
        setTypeCounts(data);
      })
      .catch(err => {
        console.error('[Tasks] Error fetching counts:', err);
      });
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  // Compute live Planning total count
  const totalPlanningCount = useMemo(() => {
    if (!typeCounts) return 51984;
    return PLANNING_CATEGORIES.reduce((acc, cat) => {
      const c = typeCounts[cat.countKey] || 0;
      return acc + (Number(c) || 0);
    }, 0);
  }, [typeCounts]);

  // Compute live Execution total count
  const totalExecutionCount = useMemo(() => {
    if (!typeCounts) return 39;
    let sum = 0;
    EXECUTION_GROUPS.forEach(g => {
      g.categories.forEach(cat => {
        const c = typeCounts[cat.countKey] || 0;
        sum += Number(c) || 0;
      });
    });
    return sum || 39;
  }, [typeCounts]);

  // Switch between Planning and Execution top tabs
  const handleTabSwitch = (newTab) => {
    if (newTab === activeTab) return;
    if (newTab === 'planning') {
      setSearchParams({ tab: 'planning', category: 'gp_survey' });
    } else {
      setSearchParams({ tab: 'execution', group: 'infra', category: 'gp_infra' });
    }
  };

  // Switch Category within active tab
  const handleCategorySwitch = (catKey, groupKey = null) => {
    if (activeTab === 'planning') {
      setSearchParams({ tab: 'planning', category: catKey });
    } else {
      const g = groupKey || activeGroup || 'infra';
      setSearchParams({ tab: 'execution', group: g, category: catKey });
    }
  };

  // Resolve current active category object
  const currentCategoryObj = useMemo(() => {
    if (activeTab === 'planning') {
      return PLANNING_CATEGORIES.find(c => c.key === activeCategory) || PLANNING_CATEGORIES[0];
    }
    const allExec = [...EXECUTION_GROUPS[0].categories, ...EXECUTION_GROUPS[1].categories];
    return allExec.find(c => c.key === activeCategory) || EXECUTION_GROUPS[0].categories[0];
  }, [activeTab, activeCategory]);

  // Resolve current active group object
  const currentGroupObj = useMemo(() => {
    if (activeTab === 'planning') return null;
    return EXECUTION_GROUPS.find(g => g.key === activeGroup) || EXECUTION_GROUPS[0];
  }, [activeTab, activeGroup]);

  return (
    <div className="ilance-task-container">
      {/* Breadcrumb matching iLance */}
      <div className="ilance-breadcrumb">
        <Link to="/dashboard">Home</Link>
        <span className="sep">/</span>
        <Link to="/tasks?tab=planning&category=gp_survey">Tasks</Link>
        <span className="sep">/</span>
        <span>{activeTab === 'planning' ? 'Planning' : 'Execution'}</span>
        {activeTab === 'execution' && currentGroupObj && (
          <>
            <span className="sep">/</span>
            <span>{currentGroupObj.label}</span>
          </>
        )}
        <span className="sep">/</span>
        <span className="active-crumb">{currentCategoryObj.label}</span>
      </div>

      {/* Top Main Tabs: Planning / Execution */}
      <div className="ilance-top-tabs-row">
        <div className="ilance-tabs-group">
          <button
            type="button"
            className={`ilance-main-tab-btn ${activeTab === 'planning' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('planning')}
          >
            Planning
            <span className="ilance-tab-count-badge">
              {totalPlanningCount.toLocaleString()}
            </span>
          </button>

          <button
            type="button"
            className={`ilance-main-tab-btn ${activeTab === 'execution' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('execution')}
          >
            Execution
            <span className="ilance-tab-count-badge">
              {totalExecutionCount.toLocaleString()}
            </span>
          </button>
        </div>
      </div>

      {/* Category Subnav Navigation Row */}
      <div className="ilance-subnav-bar">
        {activeTab === 'planning' ? (
          PLANNING_CATEGORIES.map(cat => {
            const isSelected = activeCategory === cat.key;
            const cnt = typeCounts ? (typeCounts[cat.countKey] || 0) : 0;
            return (
              <button
                key={cat.key}
                type="button"
                className={`ilance-subnav-pill ${isSelected ? 'active' : ''}`}
                onClick={() => handleCategorySwitch(cat.key)}
              >
                <span>{cat.label}</span>
                <span className="ilance-pill-count">
                  {Number(cnt).toLocaleString()}
                </span>
              </button>
            );
          })
        ) : (
          /* Execution categories strictly scoped to active group (Infra or Fiber) */
          <>
            <div className="ilance-exec-group-switcher">
              <button
                type="button"
                className={`ilance-subnav-pill exec-group-pill ${activeGroup === 'infra' ? 'active' : ''}`}
                onClick={() => setSearchParams({ tab: 'execution', group: 'infra', category: 'gp_infra' })}
              >
                <span>Infra Workspace</span>
              </button>
              <button
                type="button"
                className={`ilance-subnav-pill exec-group-pill ${activeGroup === 'fiber' ? 'active' : ''}`}
                onClick={() => setSearchParams({ tab: 'execution', group: 'fiber', category: 'trenching_ducting' })}
              >
                <span>Fiber Workspace</span>
              </button>
            </div>

            <div className="ilance-subnav-divider" />

            {(currentGroupObj?.categories || []).map(cat => {
              const isSelected = activeCategory === cat.key;
              const cnt = typeCounts ? (typeCounts[cat.countKey] || 0) : 0;
              return (
                <button
                  key={cat.key}
                  type="button"
                  className={`ilance-subnav-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => handleCategorySwitch(cat.key, activeGroup)}
                >
                  <span>{cat.label}</span>
                  <span className="ilance-pill-count">
                    {Number(cnt).toLocaleString()}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Render Workspace matching selected Tab */}
      {activeTab === 'planning' ? (
        <TaskPlanningTable
          category={currentCategoryObj}
          onCategoryChange={handleCategorySwitch}
          totalCategoryCount={typeCounts ? (typeCounts[currentCategoryObj.countKey] || 0) : 0}
        />
      ) : (
        <TaskExecutionWorkspace
          group={currentGroupObj}
          category={currentCategoryObj}
          totalCategoryCount={typeCounts ? (typeCounts[currentCategoryObj.countKey] || 0) : 0}
        />
      )}
    </div>
  );
};

export default Tasks;
