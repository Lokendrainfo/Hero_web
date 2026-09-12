from rest_framework import viewsets, permissions
from .models import FuelCard, FuelLog
from .serializers import FuelCardSerializer, FuelLogSerializer
from apps.common.permissions import IsVendorAuthorized

from apps.common.vendor_scope import filter_queryset_by_vendor

class FuelLogViewSet(viewsets.ModelViewSet):
    queryset = FuelLog.objects.all()
    serializer_class = FuelLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        qs = filter_queryset_by_vendor(FuelLog.objects.all(), user, 'machine__vendor_id', request=self.request)
        machine_id = self.request.query_params.get('machine_id') or self.request.query_params.get('machine')
        if machine_id and str(machine_id).strip() and str(machine_id).lower() != 'all':
            from django.db.models import Q
            if str(machine_id).isdigit():
                qs = qs.filter(machine_id=int(machine_id))
            else:
                qs = qs.filter(
                    Q(machine__machine_no__icontains=machine_id) |
                    Q(machine__external_machine_id=machine_id)
                )
        return qs

class FuelCardViewSet(viewsets.ModelViewSet):
    queryset = FuelCard.objects.all()
    serializer_class = FuelCardSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        return filter_queryset_by_vendor(FuelCard.objects.all(), user, 'vendor_id', request=self.request)
