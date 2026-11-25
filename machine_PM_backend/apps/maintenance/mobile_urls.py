from django.urls import path

from apps.maintenance.mobile_views import (
    MobileMaintenanceCheckView,
    MobileMaintenanceDataPostView,
    MobileMaintenanceListView,
)

urlpatterns = [
    path('check', MobileMaintenanceCheckView.as_view(), name='mobile-pm-check-noslash'),
    path('check/', MobileMaintenanceCheckView.as_view(), name='mobile-pm-check'),
    path('data', MobileMaintenanceDataPostView.as_view(), name='mobile-pm-data-noslash'),
    path('data/', MobileMaintenanceDataPostView.as_view(), name='mobile-pm-data'),
    path('list', MobileMaintenanceListView.as_view(), name='mobile-pm-list-noslash'),
    path('list/', MobileMaintenanceListView.as_view(), name='mobile-pm-list'),
]

