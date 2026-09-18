from rest_framework.views import APIView
from rest_framework import permissions
from apps.common.responses import success_response
from apps.machines.services import fetch_live_fiberforce_machines


class MachineReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        live = fetch_live_fiberforce_machines(request.user, request.query_params)
        data = live.get('results') or []
        return success_response(data=data, message="Machine report generated (live FiberForce)")


class FuelReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Fuel logs are FiberForce sensor-logs — empty here; use /refuel/sensor-logs/
        return success_response(data=[], message="Use /api/v1/refuel/sensor-logs/ for live fuel logs")


class ExpenseReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.expenses.models import Expense
        from apps.expenses.serializers import ExpenseSerializer
        from apps.common.reporting_scope import filter_queryset_by_reporting_and_vendor
        qs = filter_queryset_by_reporting_and_vendor(
            Expense.objects.all(),
            request.user,
            user_field='created_by_id',
            vendor_field='external_vendor_id',
            request=request,
        )
        data = ExpenseSerializer(qs, many=True, context={'request': request}).data
        return success_response(data=data, message="Expense report generated")
