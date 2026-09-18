from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Alert
from .serializers import AlertSerializer
from apps.common.permissions import IsVendorAuthorized
from apps.common.responses import success_response


class AlertViewSet(viewsets.ModelViewSet):
    """Proxy-only: no local Alert persistence. Empty-stable responses until upstream alerts exist."""
    queryset = Alert.objects.none()
    serializer_class = AlertSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        return Alert.objects.none()

    def list(self, request, *args, **kwargs):
        return Response({"success": True, "count": 0, "next": None, "previous": None, "results": []})

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Alerts are not persisted in HERO DB (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Alerts are not persisted in HERO DB (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Alerts are not persisted in HERO DB (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        return success_response(data={}, message="No local alert to mark (proxy-only).")
