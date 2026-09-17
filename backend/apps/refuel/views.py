from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q

from .models import RefuelEntry
from .serializers import RefuelEntrySerializer
from apps.common.permissions import IsVendorAuthorized
from apps.common.responses import success_response, error_response
from apps.common.vendor_scope import filter_queryset_by_vendor
from apps.integrations.fiberforce.client import FiberForceClient
from apps.machines.models import Machine


def _safe_float(val, default=0.0):
    try:
        if val is None or val == '':
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def _normalize_refuel_row(item, chassis_map=None):
    """Map FiberForce sensor fill → UI-friendly row."""
    if not isinstance(item, dict):
        return None
    chassis_map = chassis_map or {}
    chassis = str(
        item.get('machine_chassis_no')
        or item.get('chassis_no')
        or item.get('machineNo')
        or item.get('machine_no')
        or ''
    ).strip()
    local = chassis_map.get(chassis) or {}
    litres = _safe_float(
        item.get('litres')
        if item.get('litres') is not None
        else item.get('liters')
        if item.get('liters') is not None
        else item.get('acknowledged_litres'),
        0.0,
    )
    ack_litres = _safe_float(item.get('acknowledged_litres'), litres)
    amount = _safe_float(item.get('amount_paid'), 0.0)
    fill_status = str(item.get('status') or '').upper() or 'PENDING'
    occurred_at = item.get('occurred_at') or item.get('timestamp') or item.get('date')
    return {
        'id': item.get('id'),
        'source': 'fiberforce_sensor',
        'machine_chassis_no': chassis,
        'machine_id': local.get('id'),
        'machine_code': local.get('code') or chassis,
        'machine_name': local.get('name') or chassis or 'Unknown machine',
        'machine_model': local.get('model_name') or local.get('model_code') or '',
        'occurred_at': occurred_at,
        'ended_at': item.get('ended_at'),
        'date': item.get('date'),
        'litres': litres,
        'acknowledged_litres': ack_litres,
        'amount_paid': amount,
        'level_before_l': _safe_float(item.get('level_before_l'), None) if item.get('level_before_l') is not None else None,
        'level_after_l': _safe_float(item.get('level_after_l'), None) if item.get('level_after_l') is not None else None,
        'status': fill_status,
        'verify_source': item.get('verify_source') or '',
        'variance_pct': item.get('variance_pct'),
        'variance_ok': item.get('variance_ok'),
        'variance_disposition': item.get('variance_disposition'),
        'needs_variance_ack': bool(item.get('needs_variance_ack')),
        'is_abnormality': bool(item.get('is_abnormality')),
        'deny_reason': item.get('deny_reason') or '',
        'confirm_batch_id': item.get('confirm_batch_id'),
        'slip_image_url': item.get('slip_image_url'),
        # aliases for shared table rendering with manual Refuel Log
        'quantity_liters': litres,
        'total_cost': amount,
        'refuel_date': occurred_at,
        'notes': item.get('deny_reason') or item.get('verify_source') or '',
        'performed_by_name': item.get('verify_source') or 'Sensor',
    }


class RefuelViewSet(viewsets.ModelViewSet):
    queryset = RefuelEntry.objects.all()
    serializer_class = RefuelEntrySerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        qs = filter_queryset_by_vendor(RefuelEntry.objects.all(), user, 'machine__vendor_id', request=self.request)
        machine_id = self.request.query_params.get('machine_id') or self.request.query_params.get('machine')
        if machine_id and str(machine_id).strip() and str(machine_id).lower() != 'all':
            m_str = str(machine_id).strip()
            if m_str.isdigit():
                qs = qs.filter(Q(machine_id=int(m_str)) | Q(machine__code__iexact=m_str))
            else:
                qs = qs.filter(
                    Q(machine__code__iexact=m_str) |
                    Q(machine__name__icontains=m_str) |
                    Q(machine__serial_number__icontains=m_str) |
                    Q(machine__machine_chassis_no__icontains=m_str)
                )
        return qs.order_by('-refuel_date', '-id')

    def perform_create(self, serializer):
        if self.request.user and self.request.user.is_authenticated:
            serializer.save(performed_by=self.request.user)
        else:
            serializer.save()

    def _scoped_machines(self, request):
        qs = filter_queryset_by_vendor(
            Machine.objects.all(),
            request.user,
            'vendor_id',
            request=request,
        )
        return qs

    def _chassis_map(self, machines_qs):
        mapping = {}
        for m in machines_qs:
            chassis = str(m.machine_chassis_no or '').strip()
            if not chassis:
                continue
            mapping[chassis] = {
                'id': m.id,
                'code': m.code,
                'name': m.name,
                'model_name': m.model_name,
                'model_code': m.model_code,
                'serial_number': m.serial_number,
            }
        return mapping

    @action(detail=False, methods=['get', 'post'], url_path='sensor-logs')
    def sensor_logs(self, request):
        """
        Proxy FiberForce sensor refuel fills for the Fuel Logs tab.
        Query/body: machine_id | machine_chassis_no, days, date, status, page, page_size
        """
        data = {}
        if request.method == 'POST' and isinstance(request.data, dict):
            data.update(request.data)
        data.update({k: v for k, v in request.query_params.items()})

        machines_qs = self._scoped_machines(request)
        chassis_map = self._chassis_map(machines_qs)
        allowed_chassis = set(chassis_map.keys())

        from apps.common.vendor_scope import get_user_vendor_ids
        restricted = get_user_vendor_ids(request.user) is not None

        machine_id = data.get('machine_id') or data.get('machine')
        chassis = (data.get('machine_chassis_no') or data.get('chassis') or '').strip()

        if machine_id and str(machine_id).strip() and str(machine_id).lower() != 'all':
            m_str = str(machine_id).strip()
            m_obj = None
            if m_str.isdigit():
                m_obj = machines_qs.filter(id=int(m_str)).first()
            if not m_obj:
                m_obj = machines_qs.filter(
                    Q(machine_chassis_no__iexact=m_str) |
                    Q(code__iexact=m_str) |
                    Q(serial_number__iexact=m_str)
                ).first()
            if not m_obj or not m_obj.machine_chassis_no:
                return error_response(
                    message='Machine not found in your vendor scope or missing chassis number.',
                    status_code=status.HTTP_404_NOT_FOUND,
                )
            chassis = str(m_obj.machine_chassis_no).strip()

        if chassis and restricted and allowed_chassis and chassis not in allowed_chassis:
            return error_response(
                message='Machine chassis is outside your vendor scope.',
                status_code=status.HTTP_403_FORBIDDEN,
            )

        if restricted and not chassis and not allowed_chassis:
            return success_response(
                data={
                    'results': [],
                    'data': [],
                    'count': 0,
                    'total': 0,
                    'page': 1,
                    'page_size': 50,
                    'total_pages': 1,
                    'pending_ack_count': 0,
                    'total_litres': 0,
                    'refuel_detected': False,
                    'show_slip_upload': False,
                    'variance_threshold_pct': 3,
                    'status_filter': 'ALL',
                },
                message='No machines with chassis in scope.',
            )

        days = data.get('days', 30)
        try:
            days = min(365, max(1, int(days)))
        except (TypeError, ValueError):
            days = 30

        date = (data.get('date') or '').strip() or None
        status_filter = (data.get('status') or '').strip().upper() or None
        if status_filter in ('ALL', '*', ''):
            status_filter = None

        try:
            page = max(1, int(data.get('page') or 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(200, max(1, int(data.get('page_size') or data.get('limit') or 50)))
        except (TypeError, ValueError):
            page_size = 50

        client = FiberForceClient()
        ff = client.list_refuels(
            machine_chassis_no=chassis or None,
            days=days,
            date=date,
            status=status_filter,
            page=page,
            page_size=page_size,
        )

        if ff.get('success') is False and not (ff.get('data') or ff.get('results')):
            return error_response(
                message=ff.get('message') or 'Could not load sensor refuel logs from FiberForce.',
                status_code=status.HTTP_502_BAD_GATEWAY,
                errors=ff,
            )

        raw_list = ff.get('data')
        if isinstance(raw_list, dict):
            raw_list = raw_list.get('results') or raw_list.get('data') or raw_list.get('fills') or []
        if not isinstance(raw_list, list):
            raw_list = ff.get('results') or ff.get('fills') or []
        if not isinstance(raw_list, list):
            raw_list = []

        rows = []
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            # When querying one chassis, FiberForce may omit it on each row
            if chassis and not (
                item.get('machine_chassis_no') or item.get('chassis_no') or item.get('machineNo')
            ):
                item = {**item, 'machine_chassis_no': chassis}
            # Enrich chassis from nested machine object if needed
            if not (
                item.get('machine_chassis_no') or item.get('chassis_no') or item.get('machineNo')
            ):
                nested = item.get('machine') if isinstance(item.get('machine'), dict) else {}
                if nested:
                    item = {
                        **item,
                        'machine_chassis_no': nested.get('machine_chassis_no')
                        or nested.get('machineNo')
                        or nested.get('chassis_no')
                        or item.get('machine_chassis_no'),
                    }
            row = _normalize_refuel_row(item, chassis_map)
            if not row:
                continue
            # Vendor scope filter when listing fleet-wide
            if not chassis and restricted and allowed_chassis:
                if row['machine_chassis_no'] and row['machine_chassis_no'] not in allowed_chassis:
                    continue
            rows.append(row)

        pending_ack_count = ff.get('pending_ack_count')
        if pending_ack_count is None:
            pending_ack_count = sum(1 for r in rows if r.get('status') == 'PENDING')

        total_litres = ff.get('total_litres')
        if total_litres is None:
            total_litres = sum(_safe_float(r.get('litres')) for r in rows)

        return success_response(
            data={
                'results': rows,
                'data': rows,
                'count': len(rows),
                'total': ff.get('total', len(rows)),
                'page': ff.get('page', page),
                'page_size': ff.get('page_size', page_size),
                'total_pages': ff.get('total_pages') or 1,
                'pending_ack_count': pending_ack_count,
                'total_litres': total_litres,
                'refuel_detected': bool(ff.get('refuel_detected', pending_ack_count > 0)),
                'show_slip_upload': bool(ff.get('show_slip_upload', pending_ack_count > 0)),
                'variance_threshold_pct': ff.get('variance_threshold_pct', 3),
                'status_filter': status_filter or 'ALL',
                'days': days,
                'date': date,
                'machine_chassis_no': chassis or None,
            },
            message='Sensor refuel logs loaded.',
        )

    @action(detail=False, methods=['post'], url_path='confirm')
    def confirm_sensor_refuel(self, request):
        """Proxy FiberForce /refuel/confirm/ — map slip to 1..N fills."""
        payload = dict(request.data or {})
        ff = FiberForceClient().confirm_refuel(payload)
        if ff.get('success') is False:
            return error_response(
                message=ff.get('message') or 'Refuel confirm failed.',
                status_code=status.HTTP_502_BAD_GATEWAY,
                errors=ff,
            )
        return success_response(data=ff.get('data') or ff, message=ff.get('message') or 'Refuel confirmed.')

    @action(detail=False, methods=['post'], url_path='deny')
    def deny_sensor_refuel(self, request):
        """Proxy FiberForce /refuel/deny/ — archive false spike."""
        payload = dict(request.data or {})
        ff = FiberForceClient().deny_refuel(payload)
        if ff.get('success') is False:
            return error_response(
                message=ff.get('message') or 'Refuel deny failed.',
                status_code=status.HTTP_502_BAD_GATEWAY,
                errors=ff,
            )
        return success_response(data=ff.get('data') or ff, message=ff.get('message') or 'Refuel denied.')
