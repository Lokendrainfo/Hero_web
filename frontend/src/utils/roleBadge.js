export const normalizeRoleKey = (role) =>
  String(role || '').toUpperCase().replace(/[\s-]+/g, '_');

export const roleBadgeClass = (role) => {
  const key = normalizeRoleKey(role);
  if (key === 'ADMIN' || key === 'SUPERADMIN' || key === 'SUPER_ADMIN') return 'badge-role-admin';
  if (key === 'PROJECT_MANAGER' || key === 'PM' || key.includes('PROJECT_MANAGER')) return 'badge-role-pm';
  if (key === 'VENDOR') return 'badge-role-vendor';
  return 'badge-neutral';
};
