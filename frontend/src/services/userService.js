import api from './api';

export const userService = {
  getAll: (params) => api.get('/users/', { params }),
  getUsers: (params) => api.get('/users/', { params }),
  getById: (id) => api.get(`/users/${id}/`),
  createUser: (userData) => api.post('/users/', userData),
  updateUser: (id, userData) => api.patch(`/users/${id}/`, userData),
  updateRole: (id, roleData) => api.patch(`/users/${id}/role/`, roleData),
  syncIlync: () => api.post('/users/sync/'),
  assignVendor: (id, vendorId) => api.post(`/users/${id}/vendors/`, { vendor_id: vendorId }),
  removeVendor: (id, vendorId) => api.delete(`/users/${id}/vendors/`, { data: { vendor_id: vendorId } }),
  getAssignedVendors: (id) => api.get(`/users/${id}/vendors/`),
};
