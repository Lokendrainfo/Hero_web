from rest_framework.views import APIView
from rest_framework import permissions
from apps.common.responses import success_response

from apps.common.vendor_scope import filter_queryset_by_vendor
from apps.machines.models import Machine
from apps.machines.serializers import MachineSerializer
from apps.fuel.models import FuelLog
from apps.fuel.serializers import FuelLogSerializer

class MachineReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = filter_queryset_by_vendor(Machine.objects.all(), request.user, 'vendor_id', request=request)
        data = MachineSerializer(qs, many=True).data
        return success_response(data=data, message="Machine report generated")

class FuelReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = filter_queryset_by_vendor(FuelLog.objects.all(), request.user, 'machine__vendor_id', request=request)
        data = FuelLogSerializer(qs, many=True).data
        return success_response(data=data, message="Fuel report generated")

class ExpenseReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return success_response(data=[], message="Expense report generated")
