import React, { useState } from 'react';
import { LucideCompass, LucideLoader2, LucideCheck, LucideAlertCircle, LucideX, LucideLayers } from 'lucide-react';
import { plannerService } from '../../services/plannerService';
import { calculatePlannerBounds } from '../../utils/plannerMapUtils';
import { useToast } from '../../context/ToastContext';

export const AlignPlanMapButton = ({
  currentPlanId = '',
  onAlignPlan = null,
  mapInstance = null,
  plannerLayerGroup = null,
  className = '',
  style = {}
}) => {
  const { showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(
    currentPlanId || '43710240-7dd9-4f05-bb87-fc36b85238e5'
  );
  const [errorMsg, setErrorMsg] = useState(null);
  const [activePlanInfo, setActivePlanInfo] = useState(null);

  const handleFetchAndAlign = async (planIdToFetch = null) => {
    const targetPlanId = String(planIdToFetch || selectedPlanId).trim();
    if (!targetPlanId) {
      setErrorMsg('Please enter or select a valid Plan ID.');
      return;
    }

    if (loading) return; // Prevent simultaneous requests

    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch Plan Details & Map Layers in parallel
      const [detailsRes, layersRes] = await Promise.all([
        plannerService.getPlanDetails(targetPlanId).catch(() => null),
        plannerService.getPlanMapLayers(targetPlanId).catch((err) => {
          throw err;
        })
      ]);

      const paths = layersRes?.paths || { type: 'FeatureCollection', features: [] };
      const nodes = layersRes?.nodes || { type: 'FeatureCollection', features: [] };
      const pathFeatures = paths.features || [];
      const nodeFeatures = nodes.features || [];

      if (pathFeatures.length === 0 && nodeFeatures.length === 0) {
        if (showToast) showToast(`No map route layers or nodes found for plan ${targetPlanId}`, 'warning');
      }

      // 2. Compute geographic bounding box
      const bounds = calculatePlannerBounds(paths, nodes);

      const planSummary = {
        planId: targetPlanId,
        planName: detailsRes?.planName || `Plan ${targetPlanId.slice(0, 8)}`,
        circle: detailsRes?.circle || '',
        district: detailsRes?.district || '',
        lengthKm: detailsRes?.lengthKm || layersRes?.summary?.totalLengthKm || 0,
        pathCount: pathFeatures.length,
        nodeCount: nodeFeatures.length,
        bounds,
        paths,
        nodes,
        details: detailsRes
      };

      setActivePlanInfo(planSummary);

      // 3. Trigger map alignment callback if provided
      if (onAlignPlan) {
        onAlignPlan(planSummary);
      }

      if (showToast) {
        showToast(
          `Successfully aligned map to plan "${planSummary.planName}" (${pathFeatures.length} routes, ${nodeFeatures.length} nodes)`,
          'success'
        );
      }

      setIsOpen(false);
    } catch (err) {
      console.error('[AlignPlanMapButton] Error loading plan map layers:', err);
      const msg = err?.data?.message || err?.message || 'Failed to fetch plan layers from iLync DT Planner.';
      setErrorMsg(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Main Map Toolbar "PLAN" Button */}
      <button
        type="button"
        className={`gis-map-icon-btn ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '6px',
          background: activePlanInfo ? '#0284c7' : 'var(--bg-surface, #ffffff)',
          color: activePlanInfo ? '#ffffff' : 'var(--text-primary, #0f172a)',
          border: '1px solid var(--border, #cbd5e1)',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          transition: 'all 0.15s ease',
          ...style
        }}
        onClick={() => {
          if (currentPlanId && currentPlanId !== selectedPlanId) {
            setSelectedPlanId(currentPlanId);
          }
          setIsOpen(true);
        }}
        title="One-Click Align Map with iLync DT Planner"
        disabled={loading}
      >
        {loading ? (
          <LucideLoader2 size={15} className="animate-spin" />
        ) : (
          <LucideCompass size={15} style={{ color: activePlanInfo ? '#ffffff' : '#0284c7' }} />
        )}
        <span>PLAN</span>
      </button>

      {/* Interactive Modal to Align Map to iLync Plan */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #f1f5f9',
                background: '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <LucideLayers size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    Align Map with DT Planner
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                    iLync Route &amp; GeoJSON Layer Auto-Alignment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: 4
                }}
              >
                <LucideX size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#334155',
                  marginBottom: 6
                }}
              >
                iLync Plan ID / GUID
              </label>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  placeholder="e.g. 43710240-7dd9-4f05-bb87-fc36b85238e5"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Sample Preset Shortcut */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Preset Example:</span>
                <button
                  type="button"
                  onClick={() => setSelectedPlanId('43710240-7dd9-4f05-bb87-fc36b85238e5')}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f1f5f9',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: '0.75rem',
                    color: '#0284c7',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  43710240-7dd9... (Jaipur Plan)
                </button>
              </div>

              {errorMsg && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.8125rem',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <LucideAlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {activePlanInfo && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    fontSize: '0.8125rem',
                    marginBottom: 16
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Active Plan: {activePlanInfo.planName}</div>
                  <div style={{ fontSize: '0.75rem', marginTop: 2 }}>
                    Routes: {activePlanInfo.pathCount} | Nodes: {activePlanInfo.nodeCount} | Length: {activePlanInfo.lengthKm} km
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading || !selectedPlanId.trim()}
                  onClick={() => handleFetchAndAlign()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading || !selectedPlanId.trim() ? 0.7 : 1
                  }}
                >
                  {loading ? (
                    <>
                      <LucideLoader2 size={16} className="animate-spin" />
                      Fetching Layers...
                    </>
                  ) : (
                    <>
                      <LucideCompass size={16} />
                      Align Map
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
