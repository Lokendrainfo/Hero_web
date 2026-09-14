from django.urls import path
from .views import CircleListView, DistrictListView, BlockListView, SyncGeographyView

urlpatterns = [
    path('geography/circles/', CircleListView.as_view(), name='geography-circles'),
    path('geography/districts/', DistrictListView.as_view(), name='geography-districts'),
    path('geography/blocks/', BlockListView.as_view(), name='geography-blocks'),
    path('geography/sync/', SyncGeographyView.as_view(), name='geography-sync'),
    path('circles/', CircleListView.as_view(), name='circles'),
    path('districts/', DistrictListView.as_view(), name='districts'),
    path('blocks/', BlockListView.as_view(), name='blocks'),
    path('sync/', SyncGeographyView.as_view(), name='sync-geography'),
]
