from django.urls import path
from .views import CircleListView, DistrictListView, BlockListView

urlpatterns = [
    path('geography/circles/', CircleListView.as_view(), name='geography-circles'),
    path('geography/districts/', DistrictListView.as_view(), name='geography-districts'),
    path('geography/blocks/', BlockListView.as_view(), name='geography-blocks'),
]
