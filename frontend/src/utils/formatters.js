export const toFixedNum = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
};

export const formatKm = (value, digits = 2) => `${toFixedNum(value, digits).toFixed(digits)} km`;

export const formatScopeStr = (str, fallbackKm = 0) => {
  if (typeof str === 'string' && str.trim()) {
    return str.replace(/-?\d+(?:\.\d+)?/g, (n) => Number(n).toFixed(2));
  }
  return formatKm(fallbackKm);
};

export const formatPct = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return toFixedNum(Math.min(100, Math.max(0, n)), 2);
};

export const formatDepthM = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}m`;
};
