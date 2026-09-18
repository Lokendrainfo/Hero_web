from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Task
from .serializers import TaskSerializer
from apps.common.permissions import IsVendorAuthorized
from apps.common.responses import success_response


class TaskViewSet(viewsets.ModelViewSet):
    """
    Proxy-only: local Task CRUD disabled.
    Live tasks are served via /api/v1/integrations/tasks/...
    Keep empty-stable list responses for legacy clients.
    """
    queryset = Task.objects.none()
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        return Task.objects.none()

    def list(self, request, *args, **kwargs):
        return Response({"success": True, "count": 0, "next": None, "previous": None, "results": []})

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Tasks are live-proxied via integrations; local create disabled."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Tasks are live-proxied via integrations; local update disabled."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Tasks are live-proxied via integrations; local delete disabled."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        return Response(
            {"success": False, "message": "Use iLync task execution endpoints."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
