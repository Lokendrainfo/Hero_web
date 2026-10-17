import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LucideCompass,
  LucideLoader2,
  LucideCheck,
  LucideAlertCircle,
  LucideX,
  LucideLayers,
  LucideSearch,
  LucidePlus,
  LucideCheckCircle2,
  LucideCircle,
  LucideMapPin
} from 'lucide-react';
import { plannerService } from '../../services/plannerService';
import { calculateMultiPlanBounds, getPlanColor, calculateGeoJsonCollectionLengthKm } from '../../utils/plannerMapUtils';
import { useToast } from '../../context/ToastContext';

export const AlignPlanMapButton = ({
  currentPlanId = '',
  onAlignMultiPlans = null,
  onAlignPlan = null, // Backward compatibility
  className = '',
  style = {}
}) => {
  const [searchParams] = useSearchParams();
  const isBharatNet = Boolean(
    ['true', '1'].includes((searchParams.get('isBharatNetMap') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('isBharatNet') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('is_bharatnet') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('is_bharat_net') || '').toLowerCase()) ||
    ['true', '1'].includes((searchParams.get('bharatnet') || '').toLowerCase()) ||
    ['bharatnet', 'td-monitoring', 'td_monitoring'].includes((searchParams.get('source') || '').toLowerCase()) ||
    (typeof window !== 'undefined' && window.location.pathname.toLowerCase().includes('/bharatnet')) ||
    (searchParams.get('mode') === 'user' && searchParams.get('source') !== 'trenching')
  );

  if (isBharatNet) {
    return null;
  }

  const toast = useToast();
  const showToast = toast?.showToast || ((msg) => console.log('[Toast]', msg));

  const [isOpen, setIsOpen] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingLayers, setLoadingLayers] = useState(false);
  const [discoveredPlans, setDiscoveredPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId || '43710240-7dd9-4f05-bb87-fc36b85238e5');
  const [customPlanInput, setCustomPlanInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [loadedPlansSummary, setLoadedPlansSummary] = useState(null);

  // Initialize selected plan ID from prop or default example
  useEffect(() => {
    if (currentPlanId) {
      setSelectedPlanId(currentPlanId);
    }
  }, [currentPlanId]);

  // Fetch available plans list when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchDiscoveredPlans = async () => {
      try {
        setLoadingPlans(true);
        setErrorMsg(null);
        const res = await plannerService.getAllPlans({ size: 100 });
        const list = res?.plans || res?.content || res?.results || [];
        setDiscoveredPlans(list);

        // If no plan was selected yet, default to the first plan in list
        if (!selectedPlanId && list.length > 0) {
          setSelectedPlanId(list[0].id);
        }
      } catch (err) {
        console.error('[AlignPlanMapButton] Error discovering plans:', err);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchDiscoveredPlans();
  }, [isOpen]);

  // Filter discovered plans by search query
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return discoveredPlans;
    const q = searchQuery.toLowerCase().trim();
    return discoveredPlans.filter((p) => {
      const pName = (p.planName || '').toLowerCase();
      const pId = (p.id || p.planId || '').toLowerCase();
      const dist = (p.district || '').toLowerCase();
      const blk = (p.blockName || p.block || '').toLowerCase();
      return pName.includes(q) || pId.includes(q) || dist.includes(q) || blk.includes(q);
    });
  }, [discoveredPlans, searchQuery]);

  // Find currently selected plan object
  const selectedPlanObj = useMemo(() => {
    if (!selectedPlanId) return null;
    return discoveredPlans.find((p) => p.id === selectedPlanId) || null;
  }, [discoveredPlans, selectedPlanId]);

  const handleSelectPlan = (id) => {
    setSelectedPlanId(id);
    setErrorMsg(null);
  };

  const handleAddCustomPlanId = () => {
    const trimmed = customPlanInput.trim();
    if (!trimmed) return;
    setSelectedPlanId(trimmed);
    setCustomPlanInput('');
    setErrorMsg(null);
    if (showToast) showToast(`Selected Plan ID: ${trimmed}`, 'info');
  };

  // Process Single Plan Alignment
  const handleAlignPlanSubmit = async () => {
    if (!selectedPlanId) {
      setErrorMsg('Please select a plan to align on the map.');
      return;
    }

    if (loadingLayers) return;

    setLoadingLayers(true);
    setErrorMsg(null);

    try {
      const [detailsRes, layersRes] = await Promise.all([
        plannerService.getPlanDetails(selectedPlanId).catch(() => null),
        plannerService.getPlanMapLayers(selectedPlanId)
      ]);

      const paths = layersRes?.paths || { type: 'FeatureCollection', features: [] };
      const nodes = layersRes?.nodes || { type: 'FeatureCollection', features: [] };
      const pathFeatures = paths.features || [];
      const nodeFeatures = nodes.features || [];

      const colorObj = getPlanColor(0);
      const planName = detailsRes?.planName || layersRes?.summary?.planName || selectedPlanObj?.planName || `Plan ${selectedPlanId.slice(0, 8)}`;
      
      const computedLenKm = Number(layersRes?.lengthKm || detailsRes?.lengthKm || selectedPlanObj?.lengthKm || 0) || calculateGeoJsonCollectionLengthKm(paths);
      const routeCount = layersRes?.routeCount || pathFeatures.length;
      const nodeCount = layersRes?.nodeCount || nodeFeatures.length;

      const loadedPlan = {
        planId: selectedPlanId,
        planName,
        circle: detailsRes?.circle || selectedPlanObj?.circle || '',
        district: detailsRes?.district || selectedPlanObj?.district || '',
        blockName: detailsRes?.blockName || selectedPlanObj?.blockName || '',
        lengthKm: computedLenKm,
        routeCount,
        nodeCount,
        paths,
        nodes,
        color: colorObj,
        visible: true,
        summary: {
          planName,
          totalRoutes: layersRes?.summary?.totalRoutes || routeCount,
          totalNodes: layersRes?.summary?.totalNodes || nodeCount,
          totalLengthKm: computedLenKm,
          formattedLength: `${computedLenKm.toFixed(2)} km`
        }
      };

      const combinedBounds = calculateMultiPlanBounds([loadedPlan]);

      setLoadedPlansSummary({
        totalPlans: 1,
        totalRoutes: loadedPlan.routeCount,
        totalNodes: loadedPlan.nodeCount,
        totalLengthKm: round2(loadedPlan.lengthKm),
        planName: loadedPlan.planName
      });

      // Call callbacks
      if (typeof onAlignMultiPlans === 'function') {
        onAlignMultiPlans([loadedPlan], combinedBounds, loadedPlansSummary);
      }
      if (typeof onAlignPlan === 'function') {
        onAlignPlan(loadedPlan);
      }

      if (showToast) {
        showToast(`Aligned plan: ${loadedPlan.planName} (${loadedPlan.routeCount} routes, ${loadedPlan.nodeCount} nodes)`, 'success');
      }

      // Close modal after successful alignment
      setTimeout(() => {
        setIsOpen(false);
      }, 350);

    } catch (err) {
      console.error('[AlignPlanMapButton] Alignment failed:', err);
      setErrorMsg(err.message || 'Failed to fetch map layers for the selected plan.');
    } finally {
      setLoadingLayers(false);
    }
  };

  return (
    <>
      {/* Trigger Button on Toolbar */}
      <button
        type="button"
        className={`gis-map-icon-btn ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#0284c7',
          color: '#ffffff',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          transition: 'all 0.15s ease',
          ...style
        }}
        onClick={() => setIsOpen(true)}
        title="Align Map with iLync DT Planner"
      >
        <LucideCompass size={15} />
        <span>Align Map</span>
      </button>

      {/* Align Plan Modal Dialog */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: 640,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease-out'
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
                backgroundColor: '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <LucideLayers size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    Align Map – DT Planner
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                    Select a plan to align and render its route on the map
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
                <LucideX size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {/* Search & Filter Controls (Full Width) */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <LucideSearch
                  size={16}
                  style={{ position: 'absolute', left: 12, color: '#94a3b8' }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search plans by name, district, or block..."
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 36px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2
                    }}
                    title="Clear search"
                  >
                    <LucideX size={16} />
                  </button>
                )}
              </div>

              {/* Custom Plan ID Input */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  type="text"
                  value={customPlanInput}
                  onChange={(e) => setCustomPlanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomPlanId();
                    }
                  }}
                  placeholder="Paste custom Plan GUID..."
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.8125rem'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomPlanId}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#e0f2fe',
                    color: '#0284c7',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <LucidePlus size={14} /> Set ID
                </button>
              </div>

              {/* Plans List Container (Single Select Radio Mode) */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  maxHeight: 280,
                  overflowY: 'auto',
                  background: '#ffffff'
                }}
              >
                {loadingPlans ? (
                  <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    <LucideLoader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                    <div style={{ fontSize: '0.8125rem' }}>Discovering iLync DT Planner plans...</div>
                  </div>
                ) : filteredPlans.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                    No plans found matching search query.
                  </div>
                ) : (
                  filteredPlans.map((p) => {
                    const isSelected = selectedPlanId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPlan(p.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 14px',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          background: isSelected ? '#f0f9ff' : 'transparent',
                          transition: 'background 0.1s ease'
                        }}
                      >
                        <div style={{ color: isSelected ? '#0284c7' : '#cbd5e1', display: 'flex', flexShrink: 0 }}>
                          {isSelected ? (
                            <LucideCheckCircle2 size={19} style={{ color: '#0284c7' }} />
                          ) : (
                            <LucideCircle size={19} style={{ color: '#94a3b8' }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: isSelected ? 700 : 600,
                              color: isSelected ? '#0369a1' : '#1e293b',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {p.planName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                            {p.district && <span>District: <b>{p.district}</b></span>}
                            {p.blockName && <span>Block: <b>{p.blockName}</b></span>}
                            {p.lengthKm > 0 && <span>Length: <b>{p.lengthKm} km</b></span>}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontFamily: 'monospace',
                            color: isSelected ? '#0369a1' : '#94a3b8',
                            background: isSelected ? '#e0f2fe' : '#f1f5f9',
                            padding: '2px 6px',
                            borderRadius: 4,
                            flexShrink: 0
                          }}
                        >
                          {p.id.slice(0, 8)}...
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Status & Alerts */}
              {errorMsg && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.8125rem',
                    marginTop: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <LucideAlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {loadedPlansSummary && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    fontSize: '0.8125rem',
                    marginTop: 12
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Active Map Alignment: {loadedPlansSummary.planName}</div>
                  <div style={{ fontSize: '0.75rem', marginTop: 2 }}>
                    Routes: {loadedPlansSummary.totalRoutes} | Nodes: {loadedPlansSummary.totalNodes} | Length: {loadedPlansSummary.totalLengthKm} km
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderTop: '1px solid #f1f5f9',
                background: '#f8fafc'
              }}
            >
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', minWidth: 0, flex: 1, marginRight: 12 }}>
                Selected:{' '}
                <span
                  style={{
                    color: '#0284c7',
                    display: 'inline-block',
                    maxWidth: 240,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'bottom'
                  }}
                  title={selectedPlanObj?.planName || selectedPlanId || 'None'}
                >
                  {selectedPlanObj?.planName || (selectedPlanId ? selectedPlanId.slice(0, 16) + '...' : 'None')}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
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
                  disabled={loadingLayers || !selectedPlanId}
                  onClick={handleAlignPlanSubmit}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: loadingLayers || !selectedPlanId ? 'not-allowed' : 'pointer',
                    opacity: loadingLayers || !selectedPlanId ? 0.7 : 1,
                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)'
                  }}
                >
                  {loadingLayers ? (
                    <>
                      <LucideLoader2 size={16} className="animate-spin" />
                      Loading Layers...
                    </>
                  ) : (
                    <>
                      <LucideCompass size={16} />
                      Align Selected Plan
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

const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100;
