from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import MachineViewSet, MachineChassisHddShotSummaryView

router = DefaultRouter()
router.register(r'', MachineViewSet, basename='machine')

urlpatterns = [
    # Machine Chassis Number-Wise HDD Shot Count and Shot Meters API
    path('chassis-hdd-shots/', MachineChassisHddShotSummaryView.as_view(), name='machine_chassis_hdd_shots'),
    path('chassis-hdd-shots/<str:chassis_number>/', MachineChassisHddShotSummaryView.as_view(), name='machine_chassis_hdd_shots_detail'),
    path('hdd-shots/', MachineChassisHddShotSummaryView.as_view(), name='machine_hdd_shots'),
    path('hdd-shots/<str:chassis_number>/', MachineChassisHddShotSummaryView.as_view(), name='machine_hdd_shots_detail'),
] + router.urls
