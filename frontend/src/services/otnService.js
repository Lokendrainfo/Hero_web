import api from './api';

export const otnService = {
  getAll: (params = {}) => api.get('/tasks/otn/', { params }),
  getById: (id) => api.get(`/tasks/otn/${id}/`),
  create: (data) => api.post('/tasks/otn/', data),
  update: (id, data) => api.patch(`/tasks/otn/${id}/`, data),
  delete: (id) => api.delete(`/tasks/otn/${id}/`),
  submit: (id, data = {}) => api.post(`/tasks/otn/${id}/submit/`, data),
  approve: (id, data = {}) => api.post(`/tasks/otn/${id}/approve/`, data),
  reject: (id, data = {}) => api.post(`/tasks/otn/${id}/reject/`, data),
  uploadMedia: (formData) => api.post('/tasks/otn/upload-media/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMasters: () => api.get('/tasks/otn/masters/'),
  syncExternal: () => api.post('/tasks/otn/sync/'),
  exportCsvUrl: () => `${api.defaults.baseURL || '/api/v1'}/tasks/otn/export/`,
};

export default otnService;
