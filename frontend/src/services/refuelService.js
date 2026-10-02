import api from './api';

export const refuelService = {
  getAll: (params) => api.get('/refuel/', { params }),
  getMachineRefuel: (machineId) => api.get(`/refuel/?machine=${machineId}`),
  getById: (id) => api.get(`/refuel/${id}/`),
  create: (data) => api.post('/refuel/', data),
  getSensorLogs: (params) => api.get('/refuel/sensor-logs/', { params }),
  confirmSensor: (data) => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    return api.post('/refuel/confirm/', data, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
  },
  denySensor: (data) => api.post('/refuel/deny/', data),
  postManualSlip: (data) => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    return api.post('/refuel/manual-slip/', data, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
  },
  getFuelAccounting: (params) => api.get('/refuel/accounting/', { params }),
  squareOff: (data) => api.post('/refuel/square-off/', data),
};

