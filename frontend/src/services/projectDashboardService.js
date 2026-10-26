import api from './api';

export const projectDashboardService = {
  /**
   * Fetches the Project Dashboard summary for all 8 cards
   * @param {Object} params - { mode, state, district, block, duration }
   */
  getProjectSummary: async (params = {}) => {
    const res = await api.get('/dashboard/project-summary/', { params });
    return res.data?.data || res.data || res;
  },

  /**
   * Fetches itemized drill-down records for a clicked metric
   * @param {Object} params - { card, section, metric, state, district, block, search, page, page_size }
   */
  getProjectDrilldown: async (params = {}) => {
    const res = await api.get('/dashboard/project-drilldown/', { params });
    return res.data?.data || res.data || res;
  },

  /**
   * Fetches available geography master data (circles/states, districts, blocks)
   */
  getAvailableCircles: async () => {
    try {
      const res = await api.get('/common/circles/');
      return res.data?.data || res.data || [];
    } catch {
      return [{ id: 1, name: 'Rajasthan', code: 'RJ' }];
    }
  },

  getAvailableDistricts: async (circleId = null) => {
    try {
      const params = circleId ? { circle_id: circleId } : {};
      const res = await api.get('/common/districts/', { params });
      return res.data?.data || res.data || [];
    } catch {
      return [];
    }
  },

  getAvailableBlocks: async (districtId = null) => {
    try {
      const params = districtId ? { district_id: districtId } : {};
      const res = await api.get('/common/blocks/', { params });
      return res.data?.data || res.data || [];
    } catch {
      return [];
    }
  }
};

export default projectDashboardService;
