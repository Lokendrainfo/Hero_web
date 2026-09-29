import api from './api';

export const machineShiftService = {
  getRequests: (params = {}) => api.get('/machine-shift/machine-shift-requests/', { params }),
  getRequestById: (id) => api.get(`/machine-shift/machine-shift-requests/${id}/`),
  createRequest: (data) => api.post('/machine-shift/machine-shift-requests/', data),
  updateRequest: (id, data) => api.patch(`/machine-shift/machine-shift-requests/${id}/`, data),
  cancelRequest: (id, remarks = '') => api.post(`/machine-shift/machine-shift-requests/${id}/cancel/`, { remarks }),
  
  // SCM Actions
  scmApprove: (id, formData) => api.post(`/machine-shift/machine-shift-requests/${id}/scm-approve/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  scmReject: (id, rejection_reason, remarks = '') => api.post(`/machine-shift/machine-shift-requests/${id}/scm-reject/`, { rejection_reason, remarks }),
  attachInvoice: (id, formData) => api.post(`/machine-shift/machine-shift-requests/${id}/attach-invoice/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  confirmShifting: (id, remarks = '') => api.post(`/machine-shift/machine-shift-requests/${id}/confirm/`, { remarks }),

  // Shifter Actions
  startShifting: (id) => api.post(`/machine-shift/machine-shift-requests/${id}/start-shifting/`),
  shifterUpdate: (id, formData) => api.post(`/machine-shift/machine-shift-requests/${id}/shifter-update/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  markShifted: (id, formData) => api.post(`/machine-shift/machine-shift-requests/${id}/mark-shifted/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  // Masters
  getReasons: (params = {}) => api.get('/machine-shift/machine-shift-reasons/', { params }),

  // Export
  exportCsvUrl: () => `${api.defaults.baseURL || '/api/v1'}/machine-shift/machine-shift-requests/export/`,
};
