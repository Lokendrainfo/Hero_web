import api from './api';

export const stockService = {
  getAll: (params) => api.get('/integrations/inventory/items/', { params }),
  searchItems: (payload = {}, params = {}) => api.post('/integrations/inventory/items/', typeof payload === 'string' ? { query: payload } : payload, { params }),
  searchBalance: (payload = {}, params = {}) => api.post('/integrations/inventory/stock-balance/', typeof payload === 'string' ? { query: payload } : payload, { params }),
  searchIssues: (payload = {}, params = {}) => api.post('/integrations/inventory/stock-issues/', typeof payload === 'string' ? { query: payload } : payload, { params }),
  searchIssueItems: (payload = {}, params = {}) => api.post('/integrations/inventory/stock-issue-items/search/', typeof payload === 'string' ? { query: payload } : payload, { params }),
  exportCompleteStockExcel: (params = {}) => api.get('/integrations/inventory/export-excel/', {
    params,
    responseType: 'blob'
  }),
  create: (data) => api.post('/stock/', data),
};
