from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import FuelCard, FuelLog
from .serializers import FuelCardSerializer, FuelLogSerializer
from apps.common.permissions import IsVendorAuthorized


class FuelLogViewSet(viewsets.ModelViewSet):
    """Proxy-only: FuelLog DB writes disabled. Use /refuel/sensor-logs for FiberForce fills."""
    queryset = FuelLog.objects.none()
    serializer_class = FuelLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        return FuelLog.objects.none()

    def list(self, request, *args, **kwargs):
        return Response({"success": True, "count": 0, "next": None, "previous": None, "results": []})

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Fuel logs are live via FiberForce refuel sensor-logs (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class FuelCardViewSet(viewsets.ModelViewSet):
    queryset = FuelCard.objects.none()
    serializer_class = FuelCardSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        return FuelCard.objects.none()

    def list(self, request, *args, **kwargs):
        return Response({"success": True, "count": 0, "next": None, "previous": None, "results": []})

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Fuel cards are not persisted in HERO DB (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
