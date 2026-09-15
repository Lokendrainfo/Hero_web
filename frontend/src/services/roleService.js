import api from './api';

export const roleService = {
  getRoles: () => api.get('/roles/'),
  getById: (id) => api.get(`/roles/${id}/`),
  createRole: (data) => api.post('/roles/', data),
  updateRole: (id, data) => api.patch(`/roles/${id}/`, data),
  deleteRole: (id) => api.delete(`/roles/${id}/`),
  duplicateRole: (id, data) => api.post(`/roles/${id}/duplicate/`, data || {}),
  toggleRoleActive: (id) => api.post(`/roles/${id}/toggle-active/`),
  assignRoleUsers: (id, userIds) => api.post(`/roles/${id}/assign-users/`, { user_ids: userIds }),
  getMePermissions: () => api.get('/roles/me-permissions/'),
  getPermissions: () => api.get('/permissions/'),
  getIlyncRoles: () => api.get('/roles/ilync-roles/'),
};
