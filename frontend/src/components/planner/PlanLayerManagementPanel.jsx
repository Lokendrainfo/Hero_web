import React, { useState } from 'react';
import {
  LucideLayers,
  LucideEye,
  LucideEyeOff,
  LucideTrash2,
  LucideMaximize2,
  LucideChevronDown,
  LucideChevronUp,
  LucidePlus,
  LucideInfo
} from 'lucide-react';

export const PlanLayerManagementPanel = ({
  activePlansList = [],
  onToggleVisibility = () => {},
  onRemovePlan = () => {},
  onFitBounds = () => {},
  onOpenAlignModal = () => {},
  className = '',
  style = {}
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!activePlansList || activePlansList.length === 0) return null;

  // Calculate aggregated stats
  const totalPlans = activePlansList.length;
  const visiblePlansCount = activePlansList.filter((p) => p.visible).length;

  // Deduplicated unique route codes/IDs across all active plans
  const uniqueRouteIds = new Set();
  const uniqueNodeIds = new Set();
  let totalCombinedLengthKm = 0;

  activePlansList.forEach((plan) => {
    if (!plan.visible) return;
    
    // Paths deduplication
    const features = plan.paths?.features || [];
    features.forEach((feat) => {
      const code = feat.properties?.routeCode || feat.properties?.code || feat.properties?.routeId || feat.id;
      if (code) uniqueRouteIds.add(code);
    });

    // Nodes deduplication
    const nodeFeats = plan.nodes?.features || [];
    nodeFeats.forEach((feat) => {
      const nodeId = feat.properties?.nodeId || feat.properties?.id || feat.id;
      if (nodeId) uniqueNodeIds.add(nodeId);
    });

    // Length summation
    const planLen = plan.summary?.totalLengthKm || 0;
    totalCombinedLengthKm += planLen;
  });

  const totalRoutesCount = uniqueRouteIds.size || activePlansList.reduce((acc, p) => p.visible ? acc + (p.summary?.totalRoutes || 0) : acc, 0);
  const totalNodesCount = uniqueNodeIds.size || activePlansList.reduce((acc, p) => p.visible ? acc + (p.summary?.totalNodes || 0) : acc, 0);

  return (
    <div
      className={`planner-layer-management-panel ${className}`}
      style={{
        position: 'absolute',
        bottom: 24,
        right: 16,
        zIndex: 450,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        backgroundColor: '#ffffff',
        borderRadius: 8,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
        ...style
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LucideLayers size={16} style={{ color: '#38bdf8' }} />
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            DT Planner Layers ({visiblePlansCount}/{totalPlans})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFitBounds();
            }}
            title="Fit map to all visible plans"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 2,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <LucideMaximize2 size={14} />
          </button>
          {isExpanded ? <LucideChevronDown size={16} /> : <LucideChevronUp size={16} />}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div style={{ padding: 12, maxHeight: 380, overflowY: 'auto' }}>
          {/* Aggregate Stats Box */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 10,
              marginBottom: 12
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <LucideInfo size={13} style={{ color: '#0284c7' }} /> Combined Active Scope
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'center' }}>
              <div style={{ background: '#ffffff', padding: '6px 4px', borderRadius: 4, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{totalRoutesCount}</div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Unique Routes</div>
              </div>
              <div style={{ background: '#ffffff', padding: '6px 4px', borderRadius: 4, border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{totalNodesCount}</div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Unique Nodes</div>
              </div>
              <div style={{ background: '#ffffff', padding: '6px 4px', borderRadius: 4, border: '1px solid #cbd5e1', gridColumn: 'span 2' }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0284c7' }}>
                  {totalCombinedLengthKm.toFixed(2)} km
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Combined Route Length</div>
              </div>
            </div>
          </div>

          {/* Individual Plans List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePlansList.map((plan) => (
              <div
                key={plan.planId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 8,
                  borderRadius: 6,
                  border: `1px solid ${plan.visible ? '#cbd5e1' : '#f1f5f9'}`,
                  backgroundColor: plan.visible ? '#ffffff' : '#f8fafc',
                  opacity: plan.visible ? 1 : 0.6,
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={plan.visible}
                      onChange={() => onToggleVisibility(plan.planId)}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0284c7' }}
                      title={plan.visible ? "Hide Plan" : "Show Plan"}
                    />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: plan.color?.stroke || '#0284c7',
                        display: 'inline-block',
                        flexShrink: 0
                      }}
                    />
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        color: '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={plan.planName}
                    >
                      {plan.planName || plan.planId}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => onToggleVisibility(plan.planId)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: plan.visible ? '#0284c7' : '#94a3b8',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex'
                      }}
                      title={plan.visible ? "Hide layer" : "Show layer"}
                    >
                      {plan.visible ? <LucideEye size={14} /> : <LucideEyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePlan(plan.planId)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex'
                      }}
                      title="Remove plan from map"
                    >
                      <LucideTrash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Per-Plan Sub-Details */}
                <div
                  style={{
                    fontSize: '0.71875rem',
                    color: '#64748b',
                    marginTop: 4,
                    paddingLeft: 23,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap'
                  }}
                >
                  <span><strong>{plan.summary?.totalRoutes || 0}</strong> routes</span>
                  <span>·</span>
                  <span><strong>{plan.summary?.totalNodes || 0}</strong> nodes</span>
                  <span>·</span>
                  <span><strong>{plan.summary?.formattedLength || '0 km'}</strong></span>
                </div>
              </div>
            ))}
          </div>

          {/* Add More Plans Quick Action */}
          <button
            type="button"
            onClick={onOpenAlignModal}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '6px 10px',
              backgroundColor: '#f1f5f9',
              border: '1px dashed #94a3b8',
              borderRadius: 6,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <LucidePlus size={14} /> Add / Manage Plans
          </button>
        </div>
      )}
    </div>
  );
};
