import api from './api';

export const hindranceService = {
  getAll: (params = {}) => api.get('/tasks/hindrances/', { params }),
  getById: (id) => api.get(`/tasks/hindrances/${id}/`),
  create: (data) => api.post('/tasks/hindrances/', data),
  update: (id, data) => api.patch(`/tasks/hindrances/${id}/`, data),
  delete: (id) => api.delete(`/tasks/hindrances/${id}/`),
  submit: (id, data = {}) => api.post(`/tasks/hindrances/${id}/submit/`, data),
  approve: (id, data = {}) => api.post(`/tasks/hindrances/${id}/approve/`, data),
  reject: (id, data = {}) => api.post(`/tasks/hindrances/${id}/reject/`, data),
  uploadMedia: (formData) => api.post('/tasks/hindrances/upload-media/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMasters: () => api.get('/tasks/hindrances/masters/'),
  syncExternal: () => api.post('/tasks/hindrances/sync/'),
  exportCsvUrl: () => `${api.defaults.baseURL || '/api/v1'}/tasks/hindrances/export/`,
};

export default hindranceService;
