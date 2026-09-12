import api from './api';

export const reportService = {
  getMachineReport: (params) => api.get('/reports/machines/', { params }),
  getFuelReport: (params) => api.get('/reports/fuel/', { params }),
  getExpenseReport: (params) => api.get('/reports/expenses/', { params })
};
