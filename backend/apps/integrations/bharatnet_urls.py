from django.urls import path
from .bharatnet_views import BharatNetTDMonitoringView, BharatNetLiveViewAPIView

urlpatterns = [
    path('td-monitoring/', BharatNetTDMonitoringView.as_view(), name='bharatnet_td_monitoring'),
    path('live-view/<str:token>/', BharatNetLiveViewAPIView.as_view(), name='bharatnet_live_view_api'),
]
