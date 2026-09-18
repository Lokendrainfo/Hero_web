from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import MaintenanceSchedule
from .serializers import MaintenanceScheduleSerializer
from apps.common.permissions import IsVendorAuthorized


class MaintenanceViewSet(viewsets.ModelViewSet):
    """Proxy-only: no local maintenance persistence."""
    queryset = MaintenanceSchedule.objects.none()
    serializer_class = MaintenanceScheduleSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        return MaintenanceSchedule.objects.none()

    def list(self, request, *args, **kwargs):
        return Response({"success": True, "count": 0, "next": None, "previous": None, "results": []})

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Maintenance is not persisted in HERO DB (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
