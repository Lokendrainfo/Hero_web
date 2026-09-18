from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.common.responses import success_response, error_response


class CircleListView(APIView):
    """Geography is string IDs on User — no Circle table. Empty-stable for clients."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response([])


class DistrictListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response([])


class BlockListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response([])


class SyncGeographyView(APIView):
    """DISABLED — geography not persisted in HERO DB."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        return success_response(
            data={"synced": False, "persisted": False, "circles": 0, "districts": 0, "blocks": 0},
            message="Geography is not stored in HERO DB (proxy-only). Use string IDs on internal users.",
        )
