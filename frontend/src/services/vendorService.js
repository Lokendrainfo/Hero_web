import api from './api';

export const vendorService = {
  getVendors: (params) => api.get('/vendors/', { params }),
  getIntegrationsVendors: (params) => api.get('/integrations/vendors/', { params }),
  getVendorById: (vendorId) => api.get(`/vendors/${vendorId}/`),
  getIntegrationsVendorById: (vendorId) => api.get(`/integrations/vendors/${vendorId}/`),
  getAll: (params) => api.get('/vendors/', { params }),
  getById: (vendorId) => api.get(`/vendors/${vendorId}/`),
  create: (data) => api.post('/vendors/', data),
  update: (id, data) => api.put(`/vendors/${id}/`, data),
  delete: (id) => api.delete(`/vendors/${id}/`),
  sync: () => api.post('/vendors/sync/'),
};
