// Helper for dynamic date formatting without hardcoded year/month strings

export const getLocalDateString = (d = new Date()) => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) {
    const fallback = new Date();
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
  }
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTodayDateString = () => getLocalDateString(new Date());

export const getFormattedToday = () => {
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const getRelativeDate = (daysOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const getFormattedDateTime = (date = new Date()) => {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return `${dateStr}, ${timeStr}`;
};

export const formatISTTime = (isoString) => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

export const formatDisplayDate = (dateVal) => {
  if (!dateVal) return '—';
  const d = typeof dateVal === 'string' && dateVal.length === 10 ? new Date(`${dateVal}T00:00:00`) : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

