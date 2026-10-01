import api from './api';

export const plannerService = {
  /**
   * Discovers available plans from iLync DT Planner API.
   * GET /api/v1/planner/plans/
   */
  getAllPlans: async (params = {}) => {
    const res = await api.get('/planner/plans/', { params });
    return res?.data?.data || res?.data || res;
  },

  /**
   * Fetches plan details by plan ID from backend iLync DT Planner proxy endpoint.
   * GET /api/v1/planner/{planId}/
   */
  getPlanDetails: async (planId) => {
    const cleanId = String(planId).trim();
    const res = await api.get(`/planner/${cleanId}/`);
    return res?.data?.data || res?.data || res;
  },

  /**
   * Fetches map layers (GeoJSON paths & nodes) by plan ID.
   * GET /api/v1/planner/{planId}/map-layers/
   */
  getPlanMapLayers: async (planId, sources = ['DTP_IMPORT', 'PLANNER', 'LAND_BASED_SURVEY']) => {
    const cleanId = String(planId).trim();
    const params = new URLSearchParams();
    params.append('includeSummary', 'true');
    sources.forEach(src => params.append('source', src));

    const res = await api.get(`/planner/${cleanId}/map-layers/`, { params });
    return res?.data?.data || res?.data || res;
  },

  /**
   * Fetches map layers for multiple plans concurrently.
   * POST /api/v1/planner/multi-map-layers/
   */
  getMultiPlanMapLayers: async (planIds) => {
    const cleanIds = (planIds || []).map(p => String(p).trim()).filter(Boolean);
    const res = await api.post('/planner/multi-map-layers/', { plan_ids: cleanIds });
    return res?.data?.data || res?.data || res;
  }
};
