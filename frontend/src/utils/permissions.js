export const VIEWER_FALLBACK_PERMS = [
  'dashboard.view',
  'machines.view',
  'tracking.view',
  'mapview.dashboard',
  'mapview.view',
  'chartview.view',
  'tasks.view',
  'reports.view',
  'settings.view',
];

export const getDefaultRoute = (permissions = [], isAdmin = false) => {
  if (isAdmin) return '/dashboard';
  const perms = Array.isArray(permissions) ? permissions : [];

  if (perms.length === 0) return '/dashboard';
  if (perms.includes('dashboard.view')) return '/dashboard';
  if (perms.includes('mapview.dashboard')) return '/map-view';
  if (perms.includes('mapview.view')) return '/map-view/trenching';
  if (perms.includes('chartview.view')) return '/chart-view';
  if (perms.includes('machines.view')) return '/machines';
  if (perms.includes('tracking.view')) return '/tracking';
  if (perms.includes('tasks.view')) return '/tasks';
  if (perms.includes('team.view')) return '/team';
  if (perms.includes('attendance.view')) return '/attendance';
  if (perms.includes('expenses.view')) return '/expenses';
  if (perms.includes('fuel.view')) return '/fuel';
  if (perms.includes('refuel.view')) return '/refuel';
  if (perms.includes('reports.view')) return '/reports';
  if (perms.includes('maintenance.view')) return '/maintenance';
  if (perms.includes('breakdowns.view')) return '/breakdown';
  if (perms.includes('alerts.view')) return '/alerts';
  if (perms.includes('stock.view') || perms.includes('inventory.view')) return '/stock';
  if (perms.includes('vendors.view')) return '/vendors';
  if (perms.includes('users.view')) return '/users';
  if (perms.includes('roles.view')) return '/roles';
  if (perms.includes('machine_shift.view')) return '/machine-shift';
  if (perms.includes('notifications.view')) return '/notifications';
  if (perms.includes('settings.view')) return '/settings';
  
  return '/dashboard';
};
