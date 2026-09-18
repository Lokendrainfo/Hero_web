import api from './api';
import { createDedupeGet } from '../utils/dedupeRequest';

const dedupeGet = createDedupeGet(5000);

export const machineService = {
  getAll: (params = {}) => {
    const query = { page_size: 100, ...params };
    return dedupeGet(
      () => api.get('/machines/', { params: query }),
      '/machines/',
      query,
      // Force refresh when resync=true
      query.resync ? 0 : 5000,
    );
  },
  getById: (id) => api.get(`/machines/${id}/`),
  create: (data) => api.post('/machines/', data),
  update: (id, data) => api.put(`/machines/${id}/`, data),
  delete: (id) => api.delete(`/machines/${id}/`),
  getStatus: (id) => api.get(`/machines/${id}/status/`),
  syncFiberforce: () => api.post('/machines/sync-fiberforce/'),
};
