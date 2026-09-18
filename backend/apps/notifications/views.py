from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    """Proxy-only: local notifications table not written; empty-stable list."""
    queryset = Notification.objects.none()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.none()

    def list(self, request, *args, **kwargs):
        return Response({"success": True, "count": 0, "next": None, "previous": None, "results": []})

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Notifications are not persisted in HERO DB (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
