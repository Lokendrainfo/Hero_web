import api from './api';

export const breakdownService = {
  getAll: (params) => api.get('/breakdown/', { params }),
  getById: (id) => api.get(`/breakdown/${id}/`),
  create: (data) => api.post('/breakdown/', data),
  update: (id, data) => api.put(`/breakdown/${id}/`, data),
};
