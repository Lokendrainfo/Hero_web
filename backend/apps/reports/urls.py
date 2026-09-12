from django.urls import path
from .views import MachineReportView, FuelReportView, ExpenseReportView

urlpatterns = [
    path('machines/', MachineReportView.as_view(), name='report_machines'),
    path('fuel/', FuelReportView.as_view(), name='report_fuel'),
    path('expenses/', ExpenseReportView.as_view(), name='report_expenses'),
]
