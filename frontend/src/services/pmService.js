import pmApi from './pmApi';

export const pmService = {
  // Dashboard & Fleet Status
  getDashboard: (params) => pmApi.get('/pm/dashboard/', { params }),
  getPending: (params) => pmApi.get('/pm/pending/', { params }),
  getOverdue: (params) => pmApi.get('/pm/overdue/', { params }),
  getReport: (params) => pmApi.get('/pm/reports/', { params }),
  downloadReportCsv: (params) => pmApi.get('/pm/reports/', { params: { ...params, export: 'csv' }, responseType: 'blob' }),
  getAuditLogs: (params) => pmApi.get('/pm/audit-logs/', { params }),

  // Frequencies, Checklists, Safety Guidelines
  getFrequencies: () => pmApi.get('/pm/frequencies/'),
  getChecklist: (frequency) => pmApi.get('/pm/checklist/', { params: { frequency } }),
  getSafetyGuidelines: () => pmApi.get('/pm/safety-guidelines/'),

  // Machine Master & Validation
  getMachines: (params) => pmApi.get('/pm/machines/', { params }),
  validateMachine: (machineId) => pmApi.get(`/pm/machines/${machineId}/validate/`),
  getMachineHourMeter: (machineId) => pmApi.get(`/pm/machines/${machineId}/hour-meter/`),

  // Mandatory Individual Photo Upload & Viewing
  uploadPhoto: (formData) =>
    pmApi.post('/pm/photos/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getPhotos: (params) => pmApi.get('/pm/photos/', { params }),

  // Maintenance Submission & History
  submitChecklist: (payload, isMultipart = false) =>
    pmApi.post(
      '/pm/submissions/',
      payload,
      isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
    ),
  getSubmissions: (params) => pmApi.get('/pm/submissions/', { params }),
  getSubmissionDetail: (id) => pmApi.get(`/pm/submissions/${id}/`),
  reviewSubmission: (id, data) => pmApi.post(`/pm/submissions/${id}/review/`, data),
  getMachineHistory: (machineId, params) => pmApi.get(`/pm/history/machine/${machineId}/`, { params }),
  getUserHistory: (userId, params) =>
    userId ? pmApi.get(`/pm/history/user/${userId}/`, { params }) : pmApi.get('/pm/history/user/', { params }),

  // Admin Configuration
  getAdminCategories: (params) => pmApi.get('/pm/admin/categories/', { params }),
  createAdminCategory: (data) => pmApi.post('/pm/admin/categories/', data),
  updateAdminCategory: (id, data) => pmApi.patch(`/pm/admin/categories/${id}/`, data),

  getAdminFrequencies: (params) => pmApi.get('/pm/admin/frequencies/', { params }),
  updateAdminFrequency: (id, data) => pmApi.patch(`/pm/admin/frequencies/${id}/`, data),

  getAdminChecklistItems: (params) => pmApi.get('/pm/admin/checklist-items/', { params }),
  createAdminChecklistItem: (data) => pmApi.post('/pm/admin/checklist-items/', data),
  updateAdminChecklistItem: (id, data) => pmApi.patch(`/pm/admin/checklist-items/${id}/`, data),
  deleteAdminChecklistItem: (id) => pmApi.delete(`/pm/admin/checklist-items/${id}/`),

  getAdminFrequencyMappings: (params) => pmApi.get('/pm/admin/frequency-mappings/', { params }),
  createAdminFrequencyMapping: (data) => pmApi.post('/pm/admin/frequency-mappings/', data),
  updateAdminFrequencyMapping: (id, data) => pmApi.patch(`/pm/admin/frequency-mappings/${id}/`, data),
  deleteAdminFrequencyMapping: (id) => pmApi.delete(`/pm/admin/frequency-mappings/${id}/`),

  getAdminRoleMappings: (params) => pmApi.get('/pm/admin/role-mappings/', { params }),
  createAdminRoleMapping: (data) => pmApi.post('/pm/admin/role-mappings/', data),
  updateAdminRoleMapping: (id, data) => pmApi.patch(`/pm/admin/role-mappings/${id}/`, data),
  deleteAdminRoleMapping: (id) => pmApi.delete(`/pm/admin/role-mappings/${id}/`),
};

