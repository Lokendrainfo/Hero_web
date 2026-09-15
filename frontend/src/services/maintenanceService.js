import api from './api';

export const maintenanceService = {
  getAll: (params) => api.get('/maintenance/', { params }),
  getById: (id) => api.get(`/maintenance/${id}/`),
  create: (data) => api.post('/maintenance/', data),
  update: (id, data) => api.put(`/maintenance/${id}/`, data),
  delete: (id) => api.delete(`/maintenance/${id}/`),
};
