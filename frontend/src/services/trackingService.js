import api from './api';

const inflightByKey = new Map();
const cacheByKey = new Map();
const LIVE_LOCATIONS_CACHE_MS = 8000;

const cacheKey = (params = {}) => {
  const entries = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

export const trackingService = {
  getLiveLocations: (params = {}) => {
    const key = cacheKey(params);
    const now = Date.now();
    const cached = cacheByKey.get(key);
    if (cached && (now - cached.at) < LIVE_LOCATIONS_CACHE_MS) {
      return Promise.resolve(cached.value);
    }
    if (inflightByKey.has(key)) {
      return inflightByKey.get(key);
    }

    const request = api.get('/tracking/machines/', { params })
      .then((res) => {
        cacheByKey.set(key, { value: res, at: Date.now() });
        return res;
      })
      .finally(() => {
        inflightByKey.delete(key);
      });

    inflightByKey.set(key, request);
    return request;
  },
  getHistory: (params) => api.get('/tracking/history/', { params }),
};
