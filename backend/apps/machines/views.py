from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Machine
from .serializers import MachineSerializer
from apps.common.responses import success_response
from apps.common.vendor_scope import get_user_vendor_ids
from .services import fetch_live_fiberforce_machines, get_live_machine_detail


class MachineViewSet(viewsets.ModelViewSet):
    queryset = Machine.objects.all().order_by('id')
    serializer_class = MachineSerializer
    permission_classes = [permissions.AllowAny]

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
        Manual CLI/Admin sync action if explicitly invoked.
        Never called automatically during page loading.
        """
        from .services import sync_fiberforce_machines
        result = sync_fiberforce_machines()
        return Response(result)

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


class MachineChassisHddShotSummaryView(viewsets.ViewSet, Response if False else object):
    """
    Machine Chassis Number-Wise HDD Shot Count and Shot Meters API

    Exposes machine operational statistics mapped by chassis number:
    - chassis_number: Machine Chassis Number
    - hdd_shot_count: Total HDD Shot Count
    - hdd_shot_meters: Total HDD Shot Meters
    - machine_id: Machine ID in database (if available)
    - last_updated: Latest Shot / Update ISO timestamp

    Query Parameters / Body:
    - chassis_number: Specific chassis number or comma-separated list
    - chassis_no: Alias for chassis_number
    - machine_id: Filter by integer Machine ID
    - refresh: 'true' / '1' to bypass cache and recompute from live tasks
    """
    permission_classes = [permissions.AllowAny]

    @classmethod
    def as_view(cls, **initkwargs):
        from rest_framework.views import APIView
        from rest_framework.renderers import JSONRenderer
        from .hdd_shots import get_chassis_hdd_shot_data

        class _InternalView(APIView):
            permission_classes = [permissions.AllowAny]
            renderer_classes = [JSONRenderer]

            def get(self, request, chassis_number=None):
                query_chassis = (
                    chassis_number
                    or request.query_params.get('chassis_number')
                    or request.query_params.get('chassis_no')
                    or request.query_params.get('chassis')
                )
                machine_id = request.query_params.get('machine_id') or request.query_params.get('id')
                refresh = (
                    request.query_params.get('refresh', '').lower() in ('true', '1')
                    or request.query_params.get('nocache', '').lower() in ('true', '1')
                )

                res = get_chassis_hdd_shot_data(
                    chassis_query=query_chassis,
                    machine_id=machine_id,
                    force_refresh=refresh
                )

                if not res.get("success"):
                    return Response(res, status=status.HTTP_404_NOT_FOUND)

                return Response(res, status=status.HTTP_200_OK)

            def post(self, request, chassis_number=None):
                payload = request.data if isinstance(request.data, dict) else {}
                query_chassis = (
                    chassis_number
                    or payload.get('chassis_numbers')
                    or payload.get('chassis_number')
                    or payload.get('chassis_no')
                    or request.query_params.get('chassis_number')
                )
                machine_id = payload.get('machine_id') or request.query_params.get('machine_id')
                refresh = (
                    str(payload.get('refresh', '')).lower() in ('true', '1')
                    or request.query_params.get('refresh', '').lower() in ('true', '1')
                )

                res = get_chassis_hdd_shot_data(
                    chassis_query=query_chassis,
                    machine_id=machine_id,
                    force_refresh=refresh
                )

                if not res.get("success"):
                    return Response(res, status=status.HTTP_404_NOT_FOUND)

                return Response(res, status=status.HTTP_200_OK)

        return _InternalView.as_view(**initkwargs)


class MachineHddMetricsDayWiseView(viewsets.ViewSet, Response if False else object):
    """
    Machine Chassis Number-Wise Day-Wise HDD Shot Count and Shot Meters API

    Exposes day-wise machine performance data based on machine chassis number:
    - chassis_number: Machine Chassis Number
    - date: Date of shot record (YYYY-MM-DD)
    - hdd_shot_count: HDD Shot Count for the respective day
    - hdd_shot_meters: HDD Shot Meters for the respective day
    - machine_id: Machine ID in database (if available)

    Query Parameters / Body:
    - chassis_number: Specific chassis number or comma-separated list
    - start_date: Start date for day-wise filtering (YYYY-MM-DD or DD-MM-YYYY)
    - end_date: End date for day-wise filtering (YYYY-MM-DD or DD-MM-YYYY)
    - machine_id: Filter by integer Machine ID
    - refresh: 'true' / '1' to bypass cache and recompute from live tasks
    """
    permission_classes = [permissions.AllowAny]

    @classmethod
    def as_view(cls, **initkwargs):
        from rest_framework.views import APIView
        from rest_framework.renderers import JSONRenderer
        from .hdd_shots import get_chassis_daily_hdd_metrics

        class _InternalView(APIView):
            permission_classes = [permissions.AllowAny]
            renderer_classes = [JSONRenderer]

            def get(self, request, chassis_number=None):
                query_chassis = (
                    chassis_number
                    or request.query_params.get('chassis_number')
                    or request.query_params.get('chassis_no')
                    or request.query_params.get('chassis')
                )
                start_date = (
                    request.query_params.get('start_date')
                    or request.query_params.get('startDate')
                    or request.query_params.get('from_date')
                    or request.query_params.get('from')
                )
                end_date = (
                    request.query_params.get('end_date')
                    or request.query_params.get('endDate')
                    or request.query_params.get('to_date')
                    or request.query_params.get('to')
                )
                machine_id = request.query_params.get('machine_id') or request.query_params.get('id')
                refresh = (
                    request.query_params.get('refresh', '').lower() in ('true', '1')
                    or request.query_params.get('nocache', '').lower() in ('true', '1')
                )

                res = get_chassis_daily_hdd_metrics(
                    chassis_query=query_chassis,
                    start_date=start_date,
                    end_date=end_date,
                    machine_id=machine_id,
                    force_refresh=refresh
                )

                if not res.get("success"):
                    msg = res.get("message", "").lower()
                    status_code = (
                        status.HTTP_400_BAD_REQUEST
                        if ("format" in msg or "cannot be after" in msg)
                        else status.HTTP_404_NOT_FOUND
                    )
                    return Response(res, status=status_code)

                return Response(res, status=status.HTTP_200_OK)

            def post(self, request, chassis_number=None):
                payload = request.data if isinstance(request.data, dict) else {}
                query_chassis = (
                    chassis_number
                    or payload.get('chassis_numbers')
                    or payload.get('chassis_number')
                    or payload.get('chassis_no')
                    or request.query_params.get('chassis_number')
                )
                start_date = (
                    payload.get('start_date')
                    or payload.get('startDate')
                    or request.query_params.get('start_date')
                )
                end_date = (
                    payload.get('end_date')
                    or payload.get('endDate')
                    or request.query_params.get('end_date')
                )
                machine_id = payload.get('machine_id') or request.query_params.get('machine_id')
                refresh = (
                    str(payload.get('refresh', '')).lower() in ('true', '1')
                    or request.query_params.get('refresh', '').lower() in ('true', '1')
                )

                res = get_chassis_daily_hdd_metrics(
                    chassis_query=query_chassis,
                    start_date=start_date,
                    end_date=end_date,
                    machine_id=machine_id,
                    force_refresh=refresh
                )

                if not res.get("success"):
                    msg = res.get("message", "").lower()
                    status_code = (
                        status.HTTP_400_BAD_REQUEST
                        if ("format" in msg or "cannot be after" in msg)
                        else status.HTTP_404_NOT_FOUND
                    )
                    return Response(res, status=status_code)

                return Response(res, status=status.HTTP_200_OK)

        return _InternalView.as_view(**initkwargs)



