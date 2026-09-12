import api from './api';

export const fuelService = {
  getAllLogs: (params) => api.get('/fuel/logs/', { params }),
  getCards: (params) => api.get('/fuel/cards/', { params }),
};
