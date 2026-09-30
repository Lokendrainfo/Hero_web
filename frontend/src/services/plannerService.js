import api from './api';

export const plannerService = {
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
  }
};
