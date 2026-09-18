import api from './api';
import { createDedupeGet } from '../utils/dedupeRequest';

const dedupeGet = createDedupeGet(8000);

export const vendorService = {
  getVendors: (params = {}) => dedupeGet(
    () => api.get('/vendors/', { params }),
    '/vendors/',
    params,
  ),
  getIntegrationsVendors: (params = {}) => dedupeGet(
    () => api.get('/integrations/vendors/', { params }),
    '/integrations/vendors/',
    params,
  ),
  getVendorById: (vendorId) => api.get(`/vendors/${vendorId}/`),
  getIntegrationsVendorById: (vendorId) => api.get(`/integrations/vendors/${vendorId}/`),
  getAll: (params = {}) => dedupeGet(
    () => api.get('/vendors/', { params }),
    '/vendors/',
    params,
  ),
  getById: (vendorId) => api.get(`/vendors/${vendorId}/`),
  create: (data) => api.post('/vendors/', data),
  update: (id, data) => api.put(`/vendors/${id}/`, data),
  delete: (id) => api.delete(`/vendors/${id}/`),
  sync: () => api.post('/vendors/sync/'),
};
