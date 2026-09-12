export const isNavPathActive = (path, pathname) => {
  if (!path || !pathname) return false;
  if (path === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
};
