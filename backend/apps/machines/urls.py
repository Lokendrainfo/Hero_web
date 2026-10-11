from django.urls import path, re_path
from rest_framework.routers import DefaultRouter
from .views import MachineViewSet, MachineChassisHddShotSummaryView, MachineHddMetricsDayWiseView

router = DefaultRouter()
router.register(r'', MachineViewSet, basename='machine')

urlpatterns = [
    # Machine Chassis Number-Wise Day-Wise HDD Shot Count and Shot Meters API (with or without trailing slash)
    re_path(r'^hdd-metrics/?$', MachineHddMetricsDayWiseView.as_view(), name='machine_hdd_metrics'),
    re_path(r'^hdd-metrics/(?P<chassis_number>[^/]+)/?$', MachineHddMetricsDayWiseView.as_view(), name='machine_hdd_metrics_detail'),
    re_path(r'^chassis-hdd-metrics/?$', MachineHddMetricsDayWiseView.as_view(), name='machine_chassis_hdd_metrics'),
    re_path(r'^chassis-hdd-metrics/(?P<chassis_number>[^/]+)/?$', MachineHddMetricsDayWiseView.as_view(), name='machine_chassis_hdd_metrics_detail'),


    # Machine Chassis Number-Wise HDD Shot Count and Shot Meters API (Cumulative Summary)
    path('chassis-hdd-shots/', MachineChassisHddShotSummaryView.as_view(), name='machine_chassis_hdd_shots'),
    path('chassis-hdd-shots/<str:chassis_number>/', MachineChassisHddShotSummaryView.as_view(), name='machine_chassis_hdd_shots_detail'),
    path('hdd-shots/', MachineChassisHddShotSummaryView.as_view(), name='machine_hdd_shots'),
    path('hdd-shots/<str:chassis_number>/', MachineChassisHddShotSummaryView.as_view(), name='machine_hdd_shots_detail'),
] + router.urls

