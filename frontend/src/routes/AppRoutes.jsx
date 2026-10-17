import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicRoute } from './PublicRoute';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { MapViewerLayout } from '../layouts/MapViewerLayout';
import { Login } from '../pages/authentication/Login';

// Helper for dynamic loading of named exports
const lazyComponent = (importFn, exportName) =>
  React.lazy(() =>
    importFn().then(module => ({
      default: exportName ? module[exportName] : (module.default || Object.values(module)[0])
    }))
  );

// Lazy Loaded Pages
const Dashboard = lazyComponent(() => import('../pages/dashboard/Dashboard'), 'Dashboard');
const Machines = lazyComponent(() => import('../pages/machines/Machines'), 'Machines');
const MachineDetails = lazyComponent(() => import('../pages/machines/MachineDetails'), 'MachineDetails');
const LiveTracking = lazyComponent(() => import('../pages/tracking/LiveTracking'), 'LiveTracking');
const MachineTracking = lazyComponent(() => import('../pages/tracking/MachineTracking'), 'MachineTracking');
const RefuelStatus = lazyComponent(() => import('../pages/refuel/RefuelStatus'), 'RefuelStatus');
const RefuelHistory = lazyComponent(() => import('../pages/refuel/RefuelHistory'), 'RefuelHistory');
const RefuelDetails = lazyComponent(() => import('../pages/refuel/RefuelDetails'), 'RefuelDetails');
const Tasks = lazyComponent(() => import('../pages/tasks/Tasks'), 'Tasks');
const TaskDetailPage = lazyComponent(() => import('../pages/tasks/TaskDetailPage'), 'TaskDetailPage');
const MapViewPage = lazyComponent(() => import('../pages/mapview/MapViewPage'), 'MapViewPage');
const TrenchingMapViewPage = lazyComponent(() => import('../pages/mapview/TrenchingMapViewPage'), 'TrenchingMapViewPage');
const HddExecutionMapPage = lazyComponent(() => import('../pages/mapview/HddExecutionMapPage'), 'HddExecutionMapPage');
const BharatNetLiveViewPage = lazyComponent(() => import('../pages/mapview/BharatNetLiveViewPage'), 'BharatNetLiveViewPage');
const BharatNetMapPage = lazyComponent(() => import('../pages/mapview/BharatNetMapPage'), 'BharatNetMapPage');
const GreenSurveyMapViewPage = lazyComponent(() => import('../pages/mapview/GreenSurveyMapViewPage'), 'GreenSurveyMapViewPage');
const ChartViewPage = lazyComponent(() => import('../pages/mapview/ChartViewPage'), 'ChartViewPage');
const Team = lazyComponent(() => import('../pages/team/Team'), 'Team');
const Attendance = lazyComponent(() => import('../pages/attendance/Attendance'), 'Attendance');
const Expenses = lazyComponent(() => import('../pages/expenses/Expenses'), 'Expenses');
const ExpenseCategoryMaster = lazyComponent(() => import('../pages/expenses/ExpenseCategoryMaster'), 'ExpenseCategoryMaster');
const ExpenseSubcategoryMaster = lazyComponent(() => import('../pages/expenses/ExpenseSubcategoryMaster'), 'ExpenseSubcategoryMaster');
const FuelDashboard = lazyComponent(() => import('../pages/fuel/FuelDashboard'), 'FuelDashboard');
const Refuel = lazyComponent(() => import('../pages/refuel/Refuel'), 'Refuel');
const Reports = lazyComponent(() => import('../pages/reports/Reports'), 'Reports');
const Maintenance = lazyComponent(() => import('../pages/maintenance/Maintenance'), 'Maintenance');
const Breakdowns = lazyComponent(() => import('../pages/breakdown/Breakdowns'), 'Breakdowns');
const Alerts = lazyComponent(() => import('../pages/alerts/Alerts'), 'Alerts');
const Stock = lazyComponent(() => import('../pages/stock/Stock'), 'Stock');
const Vendors = lazyComponent(() => import('../pages/vendors/Vendors'), 'Vendors');
const Users = lazyComponent(() => import('../pages/users/Users'), 'Users');
const UserDetails = lazyComponent(() => import('../pages/users/UserDetails'), 'UserDetails');
const Roles = lazyComponent(() => import('../pages/roles/Roles'), 'Roles');
const MachineShiftList = lazyComponent(() => import('../pages/machine_shift/MachineShiftList'), 'MachineShiftList');
const MachineShiftCreate = lazyComponent(() => import('../pages/machine_shift/MachineShiftCreate'), 'MachineShiftCreate');
const Notifications = lazyComponent(() => import('../pages/notifications/Notifications'), 'Notifications');
const Profile = lazyComponent(() => import('../pages/settings/Profile'), 'Profile');
const ApiDocs = lazyComponent(() => import('../pages/setup/ApiDocs'), 'ApiDocs');

import { LoadingSpinner } from '../components/common/LoadingSpinner';

const LoadingFallback = () => (
  <LoadingSpinner title="Loading HERO Platform..." subtitle="Initializing enterprise modules and permissions" />
);

import { useAuth } from '../hooks/useAuth';
import { getDefaultRoute } from '../utils/permissions';

const DefaultRedirect = () => {
  const { permissions, isAdmin } = useAuth();
  const defaultRoute = getDefaultRoute(permissions, isAdmin);
  return <Navigate to={defaultRoute} replace />;
};

const PermissionRoute = ({ perm, children }) => {
  const { hasPermission, isAdmin } = useAuth();
  if (isAdmin || (perm && (Array.isArray(perm) ? perm.some(p => hasPermission(p)) : hasPermission(perm)))) {
    return children;
  }
  return <Navigate to="/dashboard" replace />;
};

export const AppRoutes = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public standalone map view for BharatNet Pragati Patal & external links */}
        <Route element={<MapViewerLayout />}>
          <Route path="/map-view/:executionId" element={<HddExecutionMapPage />} />
          <Route path="/map-view/bharatnet/:executionId" element={<HddExecutionMapPage isBharatNetMap={true} />} />
          <Route path="/live-view/:token" element={<BharatNetLiveViewPage />} />
        </Route>

        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/machines" element={<Machines />} />
            <Route path="/machines/:id" element={<MachineDetails />} />
            <Route path="/tracking" element={<LiveTracking />} />
            <Route path="/tracking/:machineId" element={<MachineTracking />} />
            <Route path="/machines/:machineId/tracking" element={<MachineTracking />} />
            <Route path="/machines/:machineId/refuel" element={<RefuelStatus />} />
            <Route path="/machines/:machineId/refuel/history" element={<RefuelHistory />} />
            <Route path="/refuel/:id" element={<RefuelDetails />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="/tasks/detail/:taskId" element={<TaskDetailPage />} />
            <Route path="/machine-shift" element={<MachineShiftList />} />
            <Route path="/machine-shift/create" element={<MachineShiftCreate />} />
            <Route path="/map-view" element={<MapViewPage />} />
            <Route path="/map-view/trenching" element={<TrenchingMapViewPage />} />
            <Route path="/map-view/green" element={<PermissionRoute perm={['mapview.green_field', 'green_field.view', 'mapview.green_survey']}><GreenSurveyMapViewPage /></PermissionRoute>} />
            <Route path="/map-view/green/:taskId" element={<PermissionRoute perm={['mapview.green_field', 'green_field.view', 'mapview.green_survey']}><GreenSurveyMapViewPage /></PermissionRoute>} />
            <Route path="/map-view/bharatnet" element={<BharatNetMapPage />} />
            <Route path="/chart-view" element={<ChartViewPage />} />
            <Route path="/chart-view/:executionId" element={<ChartViewPage />} />
            <Route path="/team" element={<Team />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expense-categories" element={<ExpenseCategoryMaster />} />
            <Route path="/expense-subcategories" element={<ExpenseSubcategoryMaster />} />
            <Route path="/fuel" element={<FuelDashboard />} />
            <Route path="/refuel" element={<Refuel />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/breakdown" element={<Breakdowns />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/users" element={<Users />} />
            <Route path="/users/:id" element={<UserDetails />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Profile />} />
            <Route path="/setup/api" element={<PermissionRoute perm="api_docs.view"><ApiDocs /></PermissionRoute>} />
            <Route path="/api-docs" element={<Navigate to="/setup/api" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </Suspense>
  );
};
