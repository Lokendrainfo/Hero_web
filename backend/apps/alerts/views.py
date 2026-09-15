from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from .models import Alert
from .serializers import AlertSerializer
from apps.common.permissions import IsVendorAuthorized
from apps.common.responses import success_response

class AlertViewSet(viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    serializer_class = AlertSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        q_params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        requested_vendor = q_params.get('vendor_id') or q_params.get('vendor')

        if (user.is_superuser or 'ADMIN' in [str(r).upper() for r in user.get_role_list()]) and (not requested_vendor or str(requested_vendor).strip().lower() in ['all', 'undefined', 'null', 'none', '']):
            return Alert.objects.all().order_by('-created_at', '-id')

        from apps.common.vendor_scope import filter_queryset_by_vendor
        qs = filter_queryset_by_vendor(Alert.objects.all(), user, 'vendor_id', request=self.request)
        if hasattr(Alert, 'machine') and not user.is_superuser and 'ADMIN' not in [str(r).upper() for r in user.get_role_list()] and not qs.exists():
            qs = filter_queryset_by_vendor(Alert.objects.all(), user, 'machine__vendor_id', request=self.request)
        return qs.order_by('-created_at', '-id')

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        alert = self.get_object()
        alert.is_read = True
        alert.save()
        return success_response(data=AlertSerializer(alert).data, message="Alert marked as read")
