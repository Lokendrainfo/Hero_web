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
        q_params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        requested_vendor = q_params.get('vendor_id') or q_params.get('vendor')

        if (user.is_superuser or 'ADMIN' in [str(r).upper() for r in user.get_role_list()]) and (not requested_vendor or str(requested_vendor).strip().lower() in ['all', 'undefined', 'null', 'none', '']):
            return MaintenanceSchedule.objects.all().order_by('-scheduled_date', '-id')

        qs = filter_queryset_by_vendor(MaintenanceSchedule.objects.all(), user, 'machine__vendor_id', request=self.request)
        return qs.order_by('-scheduled_date', '-id')
