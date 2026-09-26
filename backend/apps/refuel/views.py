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
        """
        Proxy HDD Fiber /refuel/confirm/ — maps manual slip & litres to 1..N sensor fills.
        Accepts:
          - refuel_tracker_ids (list, int, or comma-separated string)
          - litres (float >= 0)
          - amount_paid (float, optional)
          - mobile (string, mandatory)
          - note (string, optional)
          - variance_disposition (string, optional)
          - slip or slip_photo (file, optional)
        """
        req_data = request.data
        
        # 1. Extract & validate refuel_tracker_ids
        raw_ids = req_data.get('refuel_tracker_ids') or req_data.get('ids') or req_data.get('id')
        if not raw_ids:
            return error_response(
                message='At least one pending sensor fill (refuel_tracker_ids) must be selected.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        tracker_ids = []
        if isinstance(raw_ids, (list, tuple)):
            tracker_ids = [str(x).strip() for x in raw_ids if str(x).strip()]
        elif isinstance(raw_ids, str):
            # could be JSON array string or comma-separated
            raw_ids = raw_ids.strip()
            if raw_ids.startswith('[') and raw_ids.endswith(']'):
                import json
                try:
                    parsed = json.loads(raw_ids)
                    if isinstance(parsed, list):
                        tracker_ids = [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    pass
            if not tracker_ids:
                tracker_ids = [s.strip() for s in raw_ids.split(',') if s.strip()]
        else:
            tracker_ids = [str(raw_ids).strip()]

        if not tracker_ids:
            return error_response(
                message='Invalid or empty refuel_tracker_ids provided.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Extract & validate litres
        raw_litres = req_data.get('litres') if req_data.get('litres') is not None else req_data.get('total_litres')
        if raw_litres is None:
            return error_response(
                message='Total Litres is mandatory for refuel confirmation.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        try:
            litres_val = float(raw_litres)
            if litres_val < 0:
                raise ValueError()
        except (TypeError, ValueError):
            return error_response(
                message='Total Litres must be a valid positive number.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Extract & validate mobile
        mobile = str(
            req_data.get('mobile')
            or getattr(request.user, 'phone_number', '')
            or getattr(request.user, 'mobile', '')
            or getattr(request.user, 'phone', '')
            or ''
        ).strip()
        if not mobile:
            return error_response(
                message='Mobile number is mandatory for refuel confirmation.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Optional fields
        amount_paid = req_data.get('amount_paid') or req_data.get('amount')
        note = str(req_data.get('note') or req_data.get('notes') or '').strip()
        variance_disp = str(req_data.get('variance_disposition') or '').strip()

        # Build form data list for FiberForce request
        post_data = [
            ('mobile', mobile),
            ('litres', str(litres_val)),
        ]
        if amount_paid is not None and str(amount_paid).strip() != '':
            try:
                post_data.append(('amount_paid', str(float(amount_paid))))
            except (TypeError, ValueError):
                pass
        if note:
            post_data.append(('note', note))
        if variance_disp:
            post_data.append(('variance_disposition', variance_disp))

        # Add tracker IDs
        for tid in tracker_ids:
            post_data.append(('refuel_tracker_ids', str(tid)))

        # 5. Extract optional slip photo
        files = {}
        slip_file = request.FILES.get('slip') or request.FILES.get('slip_photo') or request.FILES.get('file')
        if slip_file:
            files['slip'] = (slip_file.name, slip_file.read(), slip_file.content_type or 'image/jpeg')

        # 6. Execute request to HDD Fiber API
        client = FiberForceClient()
        ff = client.confirm_refuel(data=post_data, files=files if files else None)

        if ff.get('success') is False:
            err_msg = ff.get('error') or ff.get('message') or 'HDD Fiber refuel confirmation failed.'
            return error_response(
                message=err_msg,
                status_code=status.HTTP_400_BAD_REQUEST if '422' in str(ff.get('message', '')) or 'error' in ff else status.HTTP_502_BAD_GATEWAY,
                errors=ff,
            )

        # 7. Auto-sync to Hero local RefuelEntry for internal reporting
        confirmed_data = ff.get('data') if isinstance(ff.get('data'), dict) else {}
        chassis_no = (
            confirmed_data.get('machine_chassis_no')
            or req_data.get('machine_chassis_no')
            or req_data.get('chassis')
        )
        if chassis_no:
            try:
                machine = Machine.objects.filter(
                    Q(machine_chassis_no__iexact=str(chassis_no).strip()) |
                    Q(code__iexact=str(chassis_no).strip()) |
                    Q(serial_number__iexact=str(chassis_no).strip())
                ).first()
                if machine:
                    cost_val = float(amount_paid) if (amount_paid and float(amount_paid) > 0) else round(litres_val * 95.0, 2)
                    RefuelEntry.objects.create(
                        machine=machine,
                        performed_by=request.user if request.user and request.user.is_authenticated else None,
                        quantity_liters=litres_val,
                        price_per_liter=round(cost_val / litres_val, 2) if litres_val > 0 else 95.0,
                        total_cost=cost_val,
                        meter_reading=getattr(machine, 'current_hours', 0) or 0,
                        notes=f"HDD Fiber Confirmed fill(s) #{', '.join(tracker_ids)}. {note}".strip()
                    )
            except Exception as sync_err:
                print(f"[RefuelConfirm] Local RefuelEntry sync note: {sync_err}")

        return success_response(
            data=confirmed_data or ff,
            message=ff.get('details') or ff.get('message') or 'Refuel confirmed successfully by HDD Fiber.'
        )

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
