import api from './api';

export const hindranceService = {
  getAll: (params = {}) => api.get('/tasks/hindrances/', { params }),
  getById: (id) => api.get(`/tasks/hindrances/${id}/`),
  create: (data) => api.post('/tasks/hindrances/', data),
  update: (id, data) => api.patch(`/tasks/hindrances/${id}/`, data),
  delete: (id) => api.delete(`/tasks/hindrances/${id}/`),
  syncExternal: () => api.post('/tasks/hindrances/sync/'),
  exportCsvUrl: () => `${api.defaults.baseURL || '/api/v1'}/tasks/hindrances/export/`,
};

export default hindranceService;
