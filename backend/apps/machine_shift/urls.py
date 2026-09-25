from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MachineShiftRequestViewSet, MachineShiftReasonViewSet

router = DefaultRouter()
router.register(r'machine-shift-reasons', MachineShiftReasonViewSet, basename='machine-shift-reasons')
router.register(r'machine-shift-requests', MachineShiftRequestViewSet, basename='machine-shift-requests')

urlpatterns = [
    path('', include(router.urls)),
]
