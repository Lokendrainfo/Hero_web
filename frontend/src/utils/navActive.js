export const isNavPathActive = (arg1, arg2) => {
  if (!arg1 || !arg2) return false;
  // Identify which is the target link path and which is the browser's current location pathname
  // If one of them has exact match with known roots like '/map-view', don't overmatch on subroutes
  const path = arg1.length <= arg2.length ? arg1 : arg2;
  const current = arg1.length > arg2.length ? arg1 : arg2;

  if (arg1 === arg2) return true;
  if (path === '/dashboard') return current === '/dashboard' || current === '/';
  if (path === '/map-view') return current === '/map-view';
  return current === path || current.startsWith(`${path}/`);
};
