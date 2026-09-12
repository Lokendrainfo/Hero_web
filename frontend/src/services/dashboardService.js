import api from './api';

export const dashboardService = {
  getSummary: (params) => api.get('/dashboard/summary/', { params }),
};
