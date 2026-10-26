from django.urls import path
from .views import (
    DashboardSummaryView,
    ProjectDashboardSummaryView,
    ProjectDashboardDrilldownView
)

urlpatterns = [
    path('summary/', DashboardSummaryView.as_view(), name='dashboard_summary'),
    path('project-summary/', ProjectDashboardSummaryView.as_view(), name='project_dashboard_summary'),
    path('project-drilldown/', ProjectDashboardDrilldownView.as_view(), name='project_dashboard_drilldown'),
]

