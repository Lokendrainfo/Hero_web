import api from './api';
import { createDedupeGet } from '../utils/dedupeRequest';

const dedupeGet = createDedupeGet(5000);

export const attendanceService = {
  getAll: (params) => api.get('/attendance/', { params }),
  getTeamAttendance: (params = {}) => dedupeGet(
    () => api.get('/attendance/team-attendance/', { params }),
    '/attendance/team-attendance/',
    params,
  ),
  bulkMark: (data) => api.post('/attendance/bulk-mark/', data),
  saveRecord: (data) => api.post('/attendance/', data),
  updateRecord: (id, data) => api.patch(`/attendance/${id}/`, data),
  deleteRecord: (id) => api.delete(`/attendance/${id}/`),

  getTodayAttendance: () => api.get('/attendance/today/'),
  checkIn: (data) => api.post('/attendance/check-in/', data),
  checkOut: (data) => api.post('/attendance/check-out/', data),
  teamCheckIn: (data) => api.post('/attendance/team-check-in/', data),
  machineCheckIn: (data) => api.post('/attendance/machine-check-in/', data),
  machineCheckOut: (data) => api.post('/attendance/machine-check-out/', data),
  getMyAssignedMachines: () => api.get('/attendance/my-assigned-machines/'),
  getTeamMembers: () => api.get('/attendance/team-members/'),
  getHistory: (params) => api.get('/attendance/history/', { params }),
  getPendingApprovals: (params) => api.get('/attendance/pending-approvals/', { params }),
  approveAttendance: (id) => api.post(`/attendance/${id}/approve/`),
  rejectAttendance: (id, data) => api.post(`/attendance/${id}/reject/`, data),
  exportReport: (params) => api.get('/attendance/export-report/', { params, responseType: 'blob' }),
};
