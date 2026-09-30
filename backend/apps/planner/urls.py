from django.urls import path
from .views import PlannerDetailView, PlannerMapLayersView

urlpatterns = [
    path('<str:plan_id>/map-layers/', PlannerMapLayersView.as_view(), name='planner_map_layers'),
    path('<str:plan_id>/map-layers', PlannerMapLayersView.as_view(), name='planner_map_layers_alias'),
    path('<str:plan_id>/', PlannerDetailView.as_view(), name='planner_detail'),
    path('<str:plan_id>', PlannerDetailView.as_view(), name='planner_detail_alias'),
]
