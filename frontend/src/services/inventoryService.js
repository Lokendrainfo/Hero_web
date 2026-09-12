import api from './api';

export const inventoryService = {
  getStockIssues: (params) => api.get('/integrations/inventory/stock-issues/', { params }),
  searchStockIssues: (payload) => api.post('/integrations/inventory/stock-issues/', payload),
  getStockBalance: (params) => api.get('/integrations/inventory/stock-balance/', { params }),
  searchStockBalance: (payload) => api.post('/integrations/inventory/stock-balance/', payload),
  getStockItems: (params) => api.get('/integrations/inventory/items/', { params }),
  searchStockItems: (payload) => api.post('/integrations/inventory/items/', payload),
};
