import api from './api';

const summaryInflight = new Map();
const summaryCache = new Map();
const SUMMARY_CACHE_MS = 5000;

const summaryCacheKey = (params = {}) => {
  const entries = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

export const dashboardService = {
  getSummary: (params) => {
    const key = summaryCacheKey(params);
    const now = Date.now();
    const cached = summaryCache.get(key);
    if (cached && (now - cached.at) < SUMMARY_CACHE_MS) {
      return Promise.resolve(cached.value);
    }
    if (summaryInflight.has(key)) {
      return summaryInflight.get(key);
    }

    const request = api.get('/dashboard/summary/', { params })
      .then((res) => {
        summaryCache.set(key, { value: res, at: Date.now() });
        return res;
      })
      .catch((err) => {
        summaryCache.delete(key);
        throw err;
      })
      .finally(() => {
        summaryInflight.delete(key);
      });

    summaryInflight.set(key, request);
    return request;
  },
};
