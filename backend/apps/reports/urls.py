from django.urls import path, re_path
from .views import MachineReportView, FuelReportView, ExpenseReportView, HddShotReportView

urlpatterns = [
    path('machines/', MachineReportView.as_view(), name='report_machines'),
    path('fuel/', FuelReportView.as_view(), name='report_fuel'),
    path('expenses/', ExpenseReportView.as_view(), name='report_expenses'),
    re_path(r'^hdd-shots/?$', HddShotReportView.as_view(), name='report_hdd_shots'),
    re_path(r'^hdd-shots/export/?$', HddShotReportView.as_view(), name='report_hdd_shots_export'),
]
