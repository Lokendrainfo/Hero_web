from django.urls import path
from .views import PlannerDetailView, PlannerMapLayersView, PlannerListView, PlannerMultiMapLayersView

urlpatterns = [
    path('plans/', PlannerListView.as_view(), name='planner_list'),
    path('plans', PlannerListView.as_view(), name='planner_list_alias'),
    path('multi-map-layers/', PlannerMultiMapLayersView.as_view(), name='planner_multi_map_layers'),
    path('multi-map-layers', PlannerMultiMapLayersView.as_view(), name='planner_multi_map_layers_alias'),
    path('<str:plan_id>/map-layers/', PlannerMapLayersView.as_view(), name='planner_map_layers'),
    path('<str:plan_id>/map-layers', PlannerMapLayersView.as_view(), name='planner_map_layers_alias'),
    path('<str:plan_id>/', PlannerDetailView.as_view(), name='planner_detail'),
    path('<str:plan_id>', PlannerDetailView.as_view(), name='planner_detail_alias'),
]
