import api from './api';

export const alertService = {
  getAll: (params) => api.get('/alerts/', { params }),
  markRead: (id) => api.post(`/alerts/${id}/mark-read/`),
  create: (data) => api.post('/alerts/', data),
};
