import api from './api';

export const machineService = {
  getAll: (params) => api.get('/machines/', { params: { page_size: 100, ...params } }),
  getById: (id) => api.get(`/machines/${id}/`),
  create: (data) => api.post('/machines/', data),
  update: (id, data) => api.put(`/machines/${id}/`, data),
  delete: (id) => api.delete(`/machines/${id}/`),
  getStatus: (id) => api.get(`/machines/${id}/status/`),
  syncFiberforce: () => api.post('/machines/sync-fiberforce/'),
};
