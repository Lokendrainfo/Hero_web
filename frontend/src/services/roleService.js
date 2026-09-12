import api from './api';

export const roleService = {
  getRoles: () => api.get('/roles/'),
  getById: (id) => api.get(`/roles/${id}/`),
  createRole: (data) => api.post('/roles/', data),
  updateRole: (id, data) => api.patch(`/roles/${id}/`, data),
  deleteRole: (id) => api.delete(`/roles/${id}/`),
  getPermissions: () => api.get('/permissions/'),
  getIlyncRoles: () => api.get('/roles/ilync-roles/'),
};
