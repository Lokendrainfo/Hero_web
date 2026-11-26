from django.urls import path

from apps.maintenance.mobile_views import (
    MobileMaintenanceCheckView,
    MobileMaintenanceDataPostView,
    MobileMaintenanceListView,
    MobilePhotoRetrieveView,
    MobileVideoRetrieveView,
)

urlpatterns = [
    path('check', MobileMaintenanceCheckView.as_view(), name='mobile-pm-check-noslash'),
    path('check/', MobileMaintenanceCheckView.as_view(), name='mobile-pm-check'),
    path('data', MobileMaintenanceDataPostView.as_view(), name='mobile-pm-data-noslash'),
    path('data/', MobileMaintenanceDataPostView.as_view(), name='mobile-pm-data'),
    path('list', MobileMaintenanceListView.as_view(), name='mobile-pm-list-noslash'),
    path('list/', MobileMaintenanceListView.as_view(), name='mobile-pm-list'),
    path('photos/<int:photo_id>', MobilePhotoRetrieveView.as_view(), name='mobile-pm-photo-noslash'),
    path('photos/<int:photo_id>/', MobilePhotoRetrieveView.as_view(), name='mobile-pm-photo'),
    path('videos/<int:video_id>', MobileVideoRetrieveView.as_view(), name='mobile-pm-video-noslash'),
    path('videos/<int:video_id>/', MobileVideoRetrieveView.as_view(), name='mobile-pm-video'),
]

