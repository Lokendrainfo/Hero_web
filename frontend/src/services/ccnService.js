import api from './api';

export const ccnService = {
  getAll: (params = {}) => api.get('/tasks/ccn/', { params }),
  getById: (id) => api.get(`/tasks/ccn/${id}/`),
  create: (data) => api.post('/tasks/ccn/', data),
  update: (id, data) => api.patch(`/tasks/ccn/${id}/`, data),
  delete: (id) => api.delete(`/tasks/ccn/${id}/`),
  submit: (id, data = {}) => api.post(`/tasks/ccn/${id}/submit/`, data),
  approve: (id, data = {}) => api.post(`/tasks/ccn/${id}/approve/`, data),
  reject: (id, data = {}) => api.post(`/tasks/ccn/${id}/reject/`, data),
  uploadMedia: (formData) => api.post('/tasks/ccn/upload-media/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMasters: () => api.get('/tasks/ccn/masters/'),
  syncExternal: () => api.post('/tasks/ccn/sync/'),
  exportCsvUrl: () => `${api.defaults.baseURL || '/api/v1'}/tasks/ccn/export/`,
};

export default ccnService;

