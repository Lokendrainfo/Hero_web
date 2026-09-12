import api from './api';

export const trackingService = {
  getLiveLocations: () => api.get('/tracking/machines/'),
  getHistory: (params) => api.get('/tracking/history/', { params }),
};
