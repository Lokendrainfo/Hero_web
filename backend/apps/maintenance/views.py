from rest_framework import viewsets, permissions
from .models import MaintenanceSchedule
from .serializers import MaintenanceScheduleSerializer
from apps.common.permissions import IsVendorAuthorized

from apps.common.vendor_scope import filter_queryset_by_vendor

class MaintenanceViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceSchedule.objects.all()
    serializer_class = MaintenanceScheduleSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        return filter_queryset_by_vendor(MaintenanceSchedule.objects.all(), user, 'machine__vendor_id', request=self.request)
