from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BreakdownViewSet,
    OemBreakdownOptionsView,
    OemBreakdownListCreateView,
    OemBreakdownCloseView,
    OpsStopOptionsView,
    OpsStopListCreateView,
    OpsStopCloseView,
)

router = DefaultRouter()
router.register(r'', BreakdownViewSet, basename='breakdown')

urlpatterns = [
    path('oem/options/', OemBreakdownOptionsView.as_view(), name='breakdown-oem-options'),
    path('oem/close/', OemBreakdownCloseView.as_view(), name='breakdown-oem-close'),
    path('oem/', OemBreakdownListCreateView.as_view(), name='breakdown-oem'),
    path('ops/options/', OpsStopOptionsView.as_view(), name='breakdown-ops-options'),
    path('ops/close/', OpsStopCloseView.as_view(), name='breakdown-ops-close'),
    path('ops/', OpsStopListCreateView.as_view(), name='breakdown-ops'),
] + router.urls
