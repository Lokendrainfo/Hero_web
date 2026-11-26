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
  getFrequencies: (machineId = null) =>
    pmApi.get('/pm/frequencies/', machineId ? { params: { machine_id: machineId } } : undefined),
  getChecklist: (frequency, machineId = null) =>
    pmApi.get('/pm/checklist/', {
      params: {
        frequency,
        ...(machineId ? { machine_id: machineId } : {}),
      },
    }),
  getSafetyGuidelines: () => pmApi.get('/pm/safety-guidelines/'),

  // Machine Master & Validation
  getMachines: (params) => pmApi.get('/pm/machines/', { params }),
  validateMachine: (machineId) => pmApi.get(`/pm/machines/${machineId}/validate/`),
  getMachineHourMeter: (machineId) => pmApi.get(`/pm/machines/${machineId}/hour-meter/`),

  // Mandatory Individual Photo Upload & Viewing
  uploadPhoto: (formData) => pmApi.post('/pm/photos/upload/', formData),
  getPhotos: (params) => pmApi.get('/pm/photos/', { params }),

  // Maintenance Submission & History
  postMaintenanceData: (formData) => pmApi.post('/machine-maintenance/data', formData),
  submitChecklist: (payload) => pmApi.post('/pm/submissions/', payload),
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

  // Dynamic Custom Fields Configuration
  getAdminCustomFields: (params) => pmApi.get('/pm/admin/custom-fields/', { params }),
  createAdminCustomField: (data) => pmApi.post('/pm/admin/custom-fields/', data),
  updateAdminCustomField: (id, data) => pmApi.patch(`/pm/admin/custom-fields/${id}/`, data),
  deleteAdminCustomField: (id) => pmApi.delete(`/pm/admin/custom-fields/${id}/`),

  // Named Photo & Video Evidence Requirements Configuration
  getAdminPhotoRequirements: (params) => pmApi.get('/pm/admin/photo-requirements/', { params }),
  createAdminPhotoRequirement: (data) => pmApi.post('/pm/admin/photo-requirements/', data),
  updateAdminPhotoRequirement: (id, data) => pmApi.patch(`/pm/admin/photo-requirements/${id}/`, data),
  deleteAdminPhotoRequirement: (id) => pmApi.delete(`/pm/admin/photo-requirements/${id}/`),

  getAdminVideoRequirements: (params) => pmApi.get('/pm/admin/video-requirements/', { params }),
  createAdminVideoRequirement: (data) => pmApi.post('/pm/admin/video-requirements/', data),
  updateAdminVideoRequirement: (id, data) => pmApi.patch(`/pm/admin/video-requirements/${id}/`, data),
  deleteAdminVideoRequirement: (id) => pmApi.delete(`/pm/admin/video-requirements/${id}/`),

  // Unified Single-Form Activity Configuration
  getAdminActivityConfigurations: () => pmApi.get('/pm/admin/activity-configurations/'),
  saveAdminActivityConfiguration: (data) => pmApi.post('/pm/admin/activity-configurations/', data),
  updateAdminActivityConfiguration: (id, data) => pmApi.put(`/pm/admin/activity-configurations/${id}/`, data),
  deactivateAdminActivityConfiguration: (id) => pmApi.delete(`/pm/admin/activity-configurations/${id}/`),
};

