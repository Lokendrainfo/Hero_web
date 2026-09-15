import api from './api';

const unwrapList = (res) => {
  const payload = res?.data !== undefined ? res.data : res;
  if (Array.isArray(payload)) return { results: payload, machines: [] };
  if (Array.isArray(payload?.results)) {
    return { results: payload.results, machines: Array.isArray(payload.machines) ? payload.machines : [] };
  }
  if (Array.isArray(payload?.data)) return { results: payload.data, machines: [] };
  return { results: [], machines: Array.isArray(payload?.machines) ? payload.machines : [] };
};

const unwrapData = (res) => (res?.data !== undefined ? res.data : res);

export const breakdownService = {
  getAll: (params) => api.get('/breakdowns/', { params }),
  getById: (id) => api.get(`/breakdowns/${id}/`),
  create: (data) => api.post('/breakdowns/', data),
  update: (id, data) => api.put(`/breakdowns/${id}/`, data),

  listOem: (params) => api.get('/breakdowns/oem/', { params }).then(unwrapList),
  oemOptions: () => api.get('/breakdowns/oem/options/').then(unwrapData),
  createOem: (data) => api.post('/breakdowns/oem/', data).then(unwrapData),
  closeOem: (data) => api.post('/breakdowns/oem/close/', data).then(unwrapData),

  listOps: (params) => api.get('/breakdowns/ops/', { params }).then(unwrapList),
  opsOptions: () => api.get('/breakdowns/ops/options/').then(unwrapData),
  createOps: (data) => api.post('/breakdowns/ops/', data).then(unwrapData),
  closeOps: (data) => api.post('/breakdowns/ops/close/', data).then(unwrapData),
};
