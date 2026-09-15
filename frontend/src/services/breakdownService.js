import api from './api';

export const breakdownService = {
  getAll: (params) => api.get('/breakdowns/', { params }),
  getById: (id) => api.get(`/breakdowns/${id}/`),
  create: (data) => api.post('/breakdowns/', data),
  update: (id, data) => api.put(`/breakdowns/${id}/`, data),
};
