from rest_framework import viewsets, permissions
from .models import BreakdownReport
from .serializers import BreakdownReportSerializer
from apps.common.permissions import IsVendorAuthorized

from apps.common.vendor_scope import filter_queryset_by_vendor

class BreakdownViewSet(viewsets.ModelViewSet):
    queryset = BreakdownReport.objects.all()
    serializer_class = BreakdownReportSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        q_params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        requested_vendor = q_params.get('vendor_id') or q_params.get('vendor')
        
        # If Admin or superuser, and no specific vendor filter is requested
        if (user.is_superuser or 'ADMIN' in [str(r).upper() for r in user.get_role_list()]) and (not requested_vendor or str(requested_vendor).strip().lower() in ['all', 'undefined', 'null', 'none', '']):
            return BreakdownReport.objects.all().order_by('-id')

        qs = filter_queryset_by_vendor(BreakdownReport.objects.all(), user, 'machine__vendor_id', request=self.request)
        if hasattr(BreakdownReport, 'vendor_id') and not user.is_superuser and 'ADMIN' not in [str(r).upper() for r in user.get_role_list()] and not qs.exists():
            qs = filter_queryset_by_vendor(BreakdownReport.objects.all(), user, 'vendor_id', request=self.request)
        return qs.order_by('-id')

