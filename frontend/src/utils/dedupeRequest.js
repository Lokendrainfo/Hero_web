/**
 * Deduplicate identical GETs across React StrictMode double-mounts
 * and rapid remounts. Shares one in-flight promise + a short warm cache.
 */
export function createDedupeGet(defaultCacheMs = 5000) {
  const inflightByKey = new Map();
  const cacheByKey = new Map();

  const cacheKey = (url, params = {}) => {
    const entries = Object.entries(params || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
      .sort(([a], [b]) => a.localeCompare(b));
    return `${url}?${JSON.stringify(entries)}`;
  };

  return (requestFn, url, params = {}, cacheMs = defaultCacheMs) => {
    const key = cacheKey(url, params);
    const now = Date.now();
    const cached = cacheByKey.get(key);
    if (cached && (now - cached.at) < cacheMs) {
      return Promise.resolve(cached.value);
    }
    if (inflightByKey.has(key)) {
      return inflightByKey.get(key);
    }

    const request = Promise.resolve()
      .then(() => requestFn())
      .then((res) => {
        cacheByKey.set(key, { value: res, at: Date.now() });
        return res;
      })
      .catch((err) => {
        // Never cache failures — next caller should retry
        cacheByKey.delete(key);
        throw err;
      })
      .finally(() => {
        inflightByKey.delete(key);
      });

    inflightByKey.set(key, request);
    return request;
  };
}
