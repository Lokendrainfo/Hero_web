from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import LiveTrackingView, TelemetryViewSet

router = DefaultRouter()
router.register(r'history', TelemetryViewSet, basename='telemetry_history')

urlpatterns = [
    path('machines/', LiveTrackingView.as_view(), name='live_tracking_machines'),
    path('locations/', LiveTrackingView.as_view(), name='live_tracking_locations'),
] + router.urls
