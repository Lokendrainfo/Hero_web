import api from './api';

export const refuelService = {
  getAll: (params) => api.get('/refuel/', { params }),
  getMachineRefuel: (machineId) => api.get(`/refuel/?machine=${machineId}`),
  getById: (id) => api.get(`/refuel/${id}/`),
  create: (data) => api.post('/refuel/', data),
};
