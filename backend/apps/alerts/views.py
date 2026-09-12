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
        from apps.common.vendor_scope import filter_queryset_by_vendor
        qs = filter_queryset_by_vendor(Alert.objects.all(), user, 'vendor_id', request=self.request)
        if not qs.exists() and Alert.objects.count() == 0:
            # Seed demo alerts if empty
            pass
        return qs

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        alert = self.get_object()
        alert.is_read = True
        alert.save()
        return success_response(data=AlertSerializer(alert).data, message="Alert marked as read")
