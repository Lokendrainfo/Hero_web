export const isNavPathActive = (arg1, arg2) => {
  if (!arg1 || !arg2) return false;
  // Identify which is the target link path and which is the browser's current location pathname
  // If one of them has exact match with known roots like '/map-view', don't overmatch on subroutes
  const path = arg1.length <= arg2.length ? arg1 : arg2;
  const current = arg1.length > arg2.length ? arg1 : arg2;

  if (arg1 === arg2) return true;
  if (path === '/dashboard') return current === '/dashboard' || current === '/';
  if (path === '/map-view') return current === '/map-view';
  if (path === '/tasks') {
    if (current === '/tasks' || current === '/tasks/execution') return true;
    if (current.startsWith('/tasks/hindrance') || current.startsWith('/tasks/otn') || current.startsWith('/tasks/ccn')) return false;
    return current.startsWith('/tasks/');
  }
  return current === path || current.startsWith(`${path}/`);
};
