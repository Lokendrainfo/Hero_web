from django.urls import path
from .views import CircleListView, DistrictListView, BlockListView

urlpatterns = [
    path('geography/circles/', CircleListView.as_view(), name='geography-circles'),
    path('geography/districts/', DistrictListView.as_view(), name='geography-districts'),
    path('geography/blocks/', BlockListView.as_view(), name='geography-blocks'),
    path('circles/', CircleListView.as_view(), name='circles'),
    path('districts/', DistrictListView.as_view(), name='districts'),
    path('blocks/', BlockListView.as_view(), name='blocks'),
]
