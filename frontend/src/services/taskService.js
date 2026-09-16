import api from './api';

// In-memory cache & inflight request tracking to prevent duplicate network calls
const childrenCache = new Map(); // taskId -> { timestamp, promise }
const photoUrlCache = new Map(); // photoKey -> url
const inflightRequests = new Map(); // key -> promise

const CACHE_TTL_MS = 60000; // 1 minute cache for child tasks

export const taskService = {
  getAll: (params) => api.get('/tasks/', { params }),
  complete: (id) => api.post(`/tasks/${id}/complete/`),
  
  getMyTasks: (params) => {
    const key = `getMyTasks_${JSON.stringify(params || {})}`;
    if (inflightRequests.has(key)) {
      return inflightRequests.get(key);
    }
    const promise = api.get('/integrations/tasks/my-tasks/', { params })
      .finally(() => {
        setTimeout(() => inflightRequests.delete(key), 1000);
      });
    inflightRequests.set(key, promise);
    return promise;
  },

  getTypeCounts: () => api.get('/integrations/tasks/my-tasks/type-counts/'),
  getTaskDetail: (id) => api.get(`/integrations/tasks/${id}/`),
  getTaskExecution: (id) => api.get(`/integrations/tasks/${id}/execution/`),
  getTaskHddExecution: (id) => api.get(`/integrations/tasks/${id}/execution/`),
  getTasks: (params) => taskService.getMyTasks(params),
  
  getTaskChildren: (id) => {
    const cached = childrenCache.get(id);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      return cached.promise;
    }
    const promise = api.get(`/integrations/tasks/${id}/children/`);
    childrenCache.set(id, { timestamp: now, promise });
    return promise;
  },

  getSurveyPhotoUrls: async (photoKeys) => {
    if (!Array.isArray(photoKeys) || photoKeys.length === 0) {
      return { data: { data: {} } };
    }

    const missingKeys = [];
    const cachedResult = {};

    photoKeys.forEach(k => {
      if (photoUrlCache.has(k)) {
        cachedResult[k] = photoUrlCache.get(k);
      } else {
        missingKeys.push(k);
      }
    });

    if (missingKeys.length === 0) {
      return { data: { data: cachedResult } };
    }

    const CHUNK = 40;
    const chunks = [];
    for (let i = 0; i < missingKeys.length; i += CHUNK) {
      chunks.push(missingKeys.slice(i, i + CHUNK));
    }

    try {
      const responses = await Promise.all(chunks.map((chunk) => (
        api.post('/integrations/survey/photo-urls/', { photoKeys: chunk }).catch(() => null)
      )));

      responses.forEach((res) => {
        const fetchedMap = res?.data?.data || res?.data || {};
        if (!fetchedMap || typeof fetchedMap !== 'object') return;
        Object.entries(fetchedMap).forEach(([k, url]) => {
          if (url) {
            photoUrlCache.set(k, url);
            cachedResult[k] = url;
          }
        });
      });

      return { data: { data: cachedResult } };
    } catch (err) {
      if (Object.keys(cachedResult).length > 0) {
        return { data: { data: cachedResult } };
      }
      throw err;
    }
  },

  // Helper to clear cache on manual refresh if needed
  clearCache: () => {
    childrenCache.clear();
    photoUrlCache.clear();
    inflightRequests.clear();
  }
};

