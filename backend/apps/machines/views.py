from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Machine
from .serializers import MachineSerializer
from apps.common.responses import success_response
from apps.common.vendor_scope import get_user_vendor_ids
from .services import fetch_live_fiberforce_machines, get_live_machine_detail


class MachineViewSet(viewsets.ModelViewSet):
    queryset = Machine.objects.none()
    serializer_class = MachineSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return Machine.objects.none()

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Machines are live from FiberForce (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Machines are live from FiberForce (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Machines are live from FiberForce (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def list(self, request, *args, **kwargs):
        """
        Live Machines List:
        Sources live machine data from FiberForce/HDD API directly.
        Does NOT persist or synchronize machine master records into Hero DB.
        """
        res = fetch_live_fiberforce_machines(request.user, request.query_params)
        if not res.get("success") and res.get("status_code") == 503:
            return Response(res, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(res, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None, *args, **kwargs):
        """
        Live Machine Detail:
        Sources live machine details directly from FiberForce API.
        """
        res = get_live_machine_detail(request.user, pk)
        if not res.get("success"):
            status_code = res.get("status_code", 404)
            if status_code == 503:
                return Response(res, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            return Response(res, status=status.HTTP_404_NOT_FOUND)
        return success_response(data=res["data"])

    @action(detail=False, methods=['post', 'get'], url_path='sync-fiberforce')
    def sync_fiberforce(self, request):
        """
        Proxy-only: machine master must not be persisted into HERO DB.
        Returns live fetch summary instead of writing rows.
        """
        from .services import fetch_live_fiberforce_machines
        res = fetch_live_fiberforce_machines(request.user, request.query_params)
        count = 0
        if isinstance(res, dict):
            data = res.get('data') or {}
            if isinstance(data, dict):
                count = data.get('count') or len(data.get('results') or [])
            elif isinstance(data, list):
                count = len(data)
        return Response({
            "success": True,
            "persisted": False,
            "synced_count": 0,
            "live_count": count,
            "message": "FiberForce machines are live-proxied only; nothing written to HERO DB.",
        })

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """
        Live Machine Status:
        Returns real-time telemetry from FiberForce API.
        """
        res = get_live_machine_detail(request.user, pk)
        if not res.get("success"):
            status_code = res.get("status_code", 404)
            return Response(res, status=status.HTTP_404_NOT_FOUND if status_code == 404 else status.HTTP_503_SERVICE_UNAVAILABLE)
        m = res["data"]
        return success_response(data={
            'id': m.get('id'),
            'name': m.get('name'),
            'status': m.get('status'),
            'fuel_level': float(m.get('current_fuel_level') or 0.0),
            'hours_operated': float(m.get('engine_hours') or 0.0),
            'last_ping': m.get('last_ping'),
            'chassis_no': m.get('machine_chassis_no'),
            'model_name': m.get('model_name')
        })

    @action(detail=False, methods=['get'], url_path='assigned')
    def assigned_machines(self, request):
        """
        Live Assigned Machines:
        Returns vendor-assigned machines from live FiberForce API without DB writes.
        """
        res = fetch_live_fiberforce_machines(request.user, request.query_params)
        if not res.get("success") and res.get("status_code") == 503:
            return Response(res, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        all_results = res.get('results', [])
        allowed_v_ids = get_user_vendor_ids(request.user)
        if allowed_v_ids is not None:
            results = all_results
        else:
            results = [m for m in all_results if m.get('is_vendor_assigned')]
        return Response({
            "success": True,
            "data": results,
            "results": results,
            "total": len(results),
            "count": len(results)
        }, status=status.HTTP_200_OK)

