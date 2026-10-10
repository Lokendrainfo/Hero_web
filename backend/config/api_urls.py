from django.urls import path, include
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from apps.common.responses import success_response
from apps.roles.views import PermissionViewSet
from apps.authentication.views import MeView
from apps.integrations.bharatnet_views import BharatNetTDMonitoringView, BharatNetLiveViewAPIView
from apps.machines.views import MachineChassisHddShotSummaryView


from rest_framework.renderers import JSONRenderer


class ApiRootView(APIView):
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        user = getattr(request, 'user', None)
        is_bharatnet = (
            getattr(user, 'role', '') == 'BHARATNET_SERVICE'
            or getattr(user, 'username', '') == 'bharatnet_service'
        )
        is_internal_staff = user and user.is_authenticated and (getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False))

        # If accessed by BharatNet or external API clients, only expose T&D monitoring endpoints
        if is_bharatnet or not is_internal_staff:
            return success_response(
                data={
                    "version": "v1",
                    "name": "Hero Web T&D Monitoring API",
                    "endpoints": {
                        "td-monitoring": "/api/v1/td-monitoring/",
                        "bharatnet": "/api/v1/bharatnet/td-monitoring/",
                    }
                },
                message="Hero Web T&D Monitoring API v1 Root"
            )

        return success_response(
            data={
                "version": "v1",
                "name": "Hero Web REST API",
                "endpoints": {
                    "me": "/api/v1/me/",
                    "auth": "/api/v1/auth/",
                    "users": "/api/v1/users/",
                    "roles": "/api/v1/roles/",
                    "permissions": "/api/v1/permissions/",
                    "vendors": "/api/v1/vendors/",
                    "dashboard": "/api/v1/dashboard/",
                    "machines": "/api/v1/machines/",
                    "attendance": "/api/v1/attendance/",
                    "expenses": "/api/v1/expenses/",
                    "fuel": "/api/v1/fuel/",
                    "refuel": "/api/v1/refuel/",
                    "maintenance": "/api/v1/maintenance/",
                    "breakdowns": "/api/v1/breakdowns/",
                    "stock": "/api/v1/stock/",
                    "tasks": "/api/v1/tasks/",
                    "team": "/api/v1/team/",
                    "tracking": "/api/v1/tracking/",
                    "alerts": "/api/v1/alerts/",
                    "notifications": "/api/v1/notifications/",
                    "reports": "/api/v1/reports/",
                    "integrations": "/api/v1/integrations/",
                    "machine-shift": "/api/v1/machine-shift/",
                    "planner": "/api/v1/planner/",
                    "td-monitoring": "/api/v1/td-monitoring/",
                    "bharatnet": "/api/v1/bharatnet/td-monitoring/",
                    "chassis-hdd-shots": "/api/v1/chassis-hdd-shots/"
                }
            },
            message="Hero Web REST API v1 Root"
        )

urlpatterns = [
    path('', ApiRootView.as_view(), name='api_root_v1'),
    path('me/', MeView.as_view(), name='api_me'),
    path('auth/', include('apps.authentication.urls')),
    path('users/', include('apps.users.urls')),
    path('roles/', include('apps.roles.urls')),
    path('permissions/', PermissionViewSet.as_view({'get': 'list'}), name='api_permissions'),
    path('permissions/<int:pk>/', PermissionViewSet.as_view({'get': 'retrieve'}), name='api_permissions_detail'),
    path('vendors/', include('apps.vendors.urls')),
    path('dashboard/', include('apps.dashboard.urls')),
    path('machines/', include('apps.machines.urls')),
    path('attendance/', include('apps.attendance.urls')),
    path('expenses/', include('apps.expenses.urls')),
    path('fuel/', include('apps.fuel.urls')),
    path('refuel/', include('apps.refuel.urls')),
    path('maintenance/', include('apps.maintenance.urls')),
    path('breakdown/', include('apps.breakdown.urls')),
    path('breakdowns/', include('apps.breakdown.urls')),
    path('stock/', include('apps.stock.urls')),
    path('tasks/', include('apps.tasks.urls')),
    path('team/', include('apps.team.urls')),
    path('tracking/', include('apps.tracking.urls')),
    path('alerts/', include('apps.alerts.urls')),
    path('notifications/', include('apps.notifications.urls')),
    path('reports/', include('apps.reports.urls')),
    path('integrations/', include('apps.integrations.urls')),
    path('common/', include('apps.common.urls')),
    path('geography/', include('apps.common.urls')),
    path('machine-shift/', include('apps.machine_shift.urls')),
    path('planner/', include('apps.planner.urls')),
    # Generic T&D Monitoring Endpoint & Live View
    path('td-monitoring/', BharatNetTDMonitoringView.as_view(), name='td_monitoring'),
    path('live-view/<str:token>/', BharatNetLiveViewAPIView.as_view(), name='live_view_api'),
    # Machine Chassis Number-Wise HDD Shot Count and Shot Meters API
    path('chassis-hdd-shots/', MachineChassisHddShotSummaryView.as_view(), name='api_chassis_hdd_shots'),
    path('chassis-hdd-shots/<str:chassis_number>/', MachineChassisHddShotSummaryView.as_view(), name='api_chassis_hdd_shots_detail'),
    path('hdd-machine-shots/', MachineChassisHddShotSummaryView.as_view(), name='api_hdd_machine_shots'),
    path('hdd-machine-shots/<str:chassis_number>/', MachineChassisHddShotSummaryView.as_view(), name='api_hdd_machine_shots_detail'),
    # Backward compatibility alias
    path('bharatnet/', include('apps.integrations.bharatnet_urls')),
]
