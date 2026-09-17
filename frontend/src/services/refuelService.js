import api from './api';

export const refuelService = {
  getAll: (params) => api.get('/refuel/', { params }),
  getMachineRefuel: (machineId) => api.get(`/refuel/?machine=${machineId}`),
  getById: (id) => api.get(`/refuel/${id}/`),
  create: (data) => api.post('/refuel/', data),
  getSensorLogs: (params) => api.get('/refuel/sensor-logs/', { params }),
  confirmSensor: (data) => api.post('/refuel/confirm/', data),
  denySensor: (data) => api.post('/refuel/deny/', data),
};
