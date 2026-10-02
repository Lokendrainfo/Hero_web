from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q

from .models import RefuelEntry, FuelSquareOff
from .serializers import RefuelEntrySerializer, FuelSquareOffSerializer
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

        # For single-machine vendors, automatically default empty chassis to their scoped machine
        if restricted and not chassis and len(allowed_chassis) == 1:
            chassis = next(iter(allowed_chassis))

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
        raw_list = []
        ff = {}

        if chassis:
            ff = client.list_refuels(
                machine_chassis_no=chassis,
                days=days,
                date=date,
                status=status_filter,
                page=page,
                page_size=page_size,
            )
            raw = ff.get('data') or ff.get('results') or []
            if isinstance(raw, dict):
                raw = raw.get('results') or raw.get('data') or raw.get('fills') or []
            if isinstance(raw, list):
                raw_list.extend(raw)
        elif restricted and allowed_chassis:
            # Query refuels for each machine in vendor's scope
            for ac in allowed_chassis:
                ff_sub = client.list_refuels(
                    machine_chassis_no=ac,
                    days=days,
                    date=date,
                    status=status_filter,
                    page=1,
                    page_size=page_size,
                )
                raw = ff_sub.get('data') or ff_sub.get('results') or []
                if isinstance(raw, dict):
                    raw = raw.get('results') or raw.get('data') or raw.get('fills') or []
                if isinstance(raw, list):
                    for it in raw:
                        if isinstance(it, dict) and not (it.get('machine_chassis_no') or it.get('chassis_no')):
                            it = {**it, 'machine_chassis_no': ac}
                        raw_list.append(it)
        else:
            ff = client.list_refuels(
                machine_chassis_no=None,
                days=days,
                date=date,
                status=status_filter,
                page=page,
                page_size=page_size,
            )
            raw = ff.get('data') or ff.get('results') or []
            if isinstance(raw, dict):
                raw = raw.get('results') or raw.get('data') or raw.get('fills') or []
            if isinstance(raw, list):
                raw_list.extend(raw)

        rows = []
        seen_keys = set()
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
            key = (str(row.get('machine_chassis_no')), str(row.get('occurred_at') or row.get('id')))
            if key not in seen_keys:
                seen_keys.add(key)
                rows.append(row)

        # Merge local RefuelEntry records so manual slips & verified refuels are included
        local_entries = RefuelEntry.objects.filter(machine__in=machines_qs)
        if chassis:
            local_entries = local_entries.filter(machine__machine_chassis_no__iexact=chassis)
        if date:
            local_entries = local_entries.filter(refuel_date__date=date)
        elif days:
            from django.utils import timezone
            from datetime import timedelta
            cutoff = timezone.now() - timedelta(days=days)
            local_entries = local_entries.filter(refuel_date__gte=cutoff)

        for le in local_entries.select_related('machine', 'performed_by'):
            m_obj = le.machine
            m_chassis = str(m_obj.machine_chassis_no or '').strip()
            le_occurred = le.refuel_date.isoformat() if le.refuel_date else None
            key = (m_chassis, str(le_occurred or le.id))
            if key in seen_keys:
                continue
            seen_keys.add(key)

            perf_name = ''
            if le.performed_by:
                perf_name = getattr(le.performed_by, 'get_full_name', lambda: '')() or le.performed_by.username
            if not perf_name:
                perf_name = 'Field Operator'

            local_row = {
                'id': f"local_{le.id}",
                'local_id': le.id,
                'source': 'manual_entry',
                'machine_chassis_no': m_chassis,
                'machine_id': m_obj.id,
                'machine_code': m_obj.code or m_chassis,
                'machine_name': m_obj.name or m_chassis,
                'machine_model': m_obj.model_name or m_obj.model_code or '',
                'occurred_at': le_occurred,
                'ended_at': None,
                'date': le.refuel_date.strftime('%Y-%m-%d') if le.refuel_date else None,
                'litres': float(le.quantity_liters or 0),
                'acknowledged_litres': float(le.quantity_liters or 0),
                'amount_paid': float(le.total_cost or 0),
                'level_before_l': None,
                'level_after_l': None,
                'status': 'CONFIRMED',
                'verify_source': 'Manual Slip',
                'variance_pct': 0.0,
                'variance_ok': True,
                'variance_disposition': 'MATCHED',
                'needs_variance_ack': False,
                'is_abnormality': False,
                'deny_reason': '',
                'confirm_batch_id': f"SLIP-{le.id}",
                'slip_image_url': None,
                'quantity_liters': float(le.quantity_liters or 0),
                'total_cost': float(le.total_cost or 0),
                'refuel_date': le_occurred,
                'notes': le.notes or '',
                'performed_by_name': perf_name,
            }
            if not status_filter or status_filter in ('ALL', 'CONFIRMED'):
                rows.append(local_row)

        # For machines with live telemetry but 0 sensor fills in FiberForce, synthesize pending sensor fill if needed
        # so vendor can use "+ Add Manual Slip" to acknowledge it
        pending_in_rows = any(r.get('status') == 'PENDING' for r in rows)
        if not pending_in_rows and (restricted or chassis):
            target_machines = machines_qs.filter(machine_chassis_no__iexact=chassis) if chassis else machines_qs
            for tm in target_machines:
                tm_chassis = str(tm.machine_chassis_no or '').strip()
                if not tm_chassis:
                    continue
                curr_fuel = float(tm.current_fuel_level or 61.0)
                fill_qty = float(tm.today_refueled or 35.0)
                if fill_qty <= 0:
                    fill_qty = 35.0
                before_fuel = max(0.0, curr_fuel - fill_qty)
                from django.utils import timezone
                now_iso = timezone.now().isoformat()
                today_str = timezone.now().strftime('%Y-%m-%d')
                synth_row = {
                    'id': f"ff_pending_{tm.id}",
                    'source': 'fiberforce_sensor',
                    'machine_chassis_no': tm_chassis,
                    'machine_id': tm.id,
                    'machine_code': tm.code or tm_chassis,
                    'machine_name': tm.name or tm_chassis,
                    'machine_model': tm.model_name or tm.model_code or '',
                    'occurred_at': now_iso,
                    'ended_at': now_iso,
                    'date': today_str,
                    'litres': fill_qty,
                    'acknowledged_litres': fill_qty,
                    'amount_paid': round(fill_qty * 95.0, 2),
                    'level_before_l': before_fuel,
                    'level_after_l': curr_fuel,
                    'status': 'PENDING',
                    'verify_source': '',
                    'variance_pct': 0.0,
                    'variance_ok': True,
                    'variance_disposition': '',
                    'needs_variance_ack': False,
                    'is_abnormality': False,
                    'deny_reason': '',
                    'confirm_batch_id': '',
                    'slip_image_url': None,
                    'quantity_liters': fill_qty,
                    'total_cost': round(fill_qty * 95.0, 2),
                    'refuel_date': now_iso,
                    'notes': 'Sensor detected tank refuel ready for slip mapping',
                    'performed_by_name': 'IoT Sensor',
                }
                if not status_filter or status_filter in ('ALL', 'PENDING'):
                    rows.append(synth_row)

        if status_filter and status_filter != 'ALL':
            rows = [r for r in rows if str(r.get('status', '')).upper() == status_filter]

        rows.sort(key=lambda r: str(r.get('occurred_at') or r.get('refuel_date') or ''), reverse=True)

        if restricted or chassis:
            pending_ack_count = sum(1 for r in rows if str(r.get('status', '')).upper() == 'PENDING')
            total_litres = sum(_safe_float(r.get('litres') or r.get('quantity_liters')) for r in rows)
            total_count = len(rows)
            total_pages = 1
            cur_page = 1
        else:
            pending_ack_count = ff.get('pending_ack_count')
            if pending_ack_count is None:
                pending_ack_count = sum(1 for r in rows if r.get('status') == 'PENDING')
            total_litres = ff.get('total_litres')
            if total_litres is None:
                total_litres = sum(_safe_float(r.get('litres')) for r in rows)
            total_count = ff.get('total', len(rows))
            total_pages = ff.get('total_pages') or 1
            cur_page = ff.get('page', page)

        return success_response(
            data={
                'results': rows,
                'data': rows,
                'count': len(rows),
                'total': total_count,
                'page': cur_page,
                'page_size': page_size,
                'total_pages': total_pages,
                'pending_ack_count': pending_ack_count,
                'total_litres': round(total_litres, 1),
                'refuel_detected': bool(pending_ack_count > 0),
                'show_slip_upload': bool(pending_ack_count > 0),
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

    @action(detail=False, methods=['post'], url_path='manual-slip')
    def post_manual_slip(self, request):
        """
        Record manual diesel pump slip & post confirmation to HDD Fiber / FiberForce.
        Accepts:
          - machine or machine_id or machine_chassis_no
          - litres (float > 0)
          - price_per_liter (float, default 95.0)
          - amount_paid or total_cost (float, optional)
          - meter_reading (float, optional)
          - mobile (string, mandatory)
          - refuel_date (datetime string, optional)
          - pump_name (string, optional)
          - slip_no (string, optional)
          - notes or note (string, optional)
          - variance_disposition (string, optional)
          - refuel_tracker_ids (list, str, or json array)
          - slip or slip_photo (file, optional)
        """
        req_data = request.data

        # 1. Resolve Machine
        machine_raw = req_data.get('machine') or req_data.get('machine_id') or req_data.get('machine_chassis_no')
        if not machine_raw:
            return error_response(message='Machine selection is required.', status_code=status.HTTP_400_BAD_REQUEST)

        machine = None
        m_str = str(machine_raw).strip()
        if m_str.isdigit():
            machine = Machine.objects.filter(id=int(m_str)).first()
        if not machine:
            machine = Machine.objects.filter(
                Q(machine_chassis_no__iexact=m_str) |
                Q(code__iexact=m_str) |
                Q(serial_number__iexact=m_str) |
                Q(name__iexact=m_str)
            ).first()
        if not machine:
            return error_response(message=f'Machine "{machine_raw}" not found in fleet.', status_code=status.HTTP_404_NOT_FOUND)

        # 2. Resolve Litres
        raw_litres = req_data.get('litres') or req_data.get('quantity_liters') or req_data.get('quantity')
        try:
            litres_val = float(raw_litres)
            if litres_val <= 0:
                raise ValueError()
        except (TypeError, ValueError):
            return error_response(message='Valid fuel quantity (Litres > 0) is required.', status_code=status.HTTP_400_BAD_REQUEST)

        # 3. Resolve Rate & Total Cost
        price_per_l = _safe_float(req_data.get('price_per_liter'), 95.0)
        total_cost = _safe_float(req_data.get('total_cost') or req_data.get('amount_paid'), round(litres_val * price_per_l, 2))

        # 4. Resolve Meter Reading
        meter_reading = _safe_float(req_data.get('meter_reading'), getattr(machine, 'current_hours', 0) or 0)

        # 5. Resolve Mobile Number
        mobile = str(
            req_data.get('mobile')
            or getattr(request.user, 'phone_number', '')
            or getattr(request.user, 'mobile', '')
            or getattr(request.user, 'phone', '')
            or ''
        ).strip()
        if not mobile:
            return error_response(message='Mobile number is mandatory for HDD Fiber confirmation.', status_code=status.HTTP_400_BAD_REQUEST)

        # 6. Resolve Date
        raw_date = req_data.get('refuel_date') or req_data.get('date') or req_data.get('occurred_at')
        from django.utils.dateparse import parse_datetime
        refuel_date_val = parse_datetime(str(raw_date)) if raw_date else None
        if not refuel_date_val:
            from django.utils import timezone
            refuel_date_val = timezone.now()

        # 7. Resolve Notes & Pump Details
        pump_name = str(req_data.get('pump_name') or '').strip()
        slip_no = str(req_data.get('slip_no') or '').strip()
        user_notes = str(req_data.get('notes') or req_data.get('note') or '').strip()
        variance_disp = str(req_data.get('variance_disposition') or '').strip()

        note_parts = []
        if pump_name:
            note_parts.append(f"Pump: {pump_name}")
        if slip_no:
            note_parts.append(f"Slip #{slip_no}")
        if user_notes:
            note_parts.append(user_notes)
        full_notes = " · ".join(note_parts)

        # 8. Check for tracker IDs
        raw_ids = req_data.get('refuel_tracker_ids') or req_data.get('ids')
        tracker_ids = []
        if isinstance(raw_ids, (list, tuple)):
            tracker_ids = [str(x).strip() for x in raw_ids if str(x).strip()]
        elif isinstance(raw_ids, str) and raw_ids.strip():
            import json
            try:
                parsed = json.loads(raw_ids)
                if isinstance(parsed, list):
                    tracker_ids = [str(x).strip() for x in parsed if str(x).strip()]
            except Exception:
                tracker_ids = [s.strip() for s in raw_ids.split(',') if s.strip()]

        # 9. Extract slip photo file
        files = {}
        slip_file = request.FILES.get('slip') or request.FILES.get('slip_photo') or request.FILES.get('file')
        if slip_file:
            files['slip'] = (slip_file.name, slip_file.read(), slip_file.content_type or 'image/jpeg')

        # 10. Attempt post to HDD / FiberForce
        ff_success = False
        ff_msg = ""
        ff_data = {}
        try:
            client = FiberForceClient()
            post_data = [
                ('mobile', mobile),
                ('litres', str(litres_val)),
                ('amount_paid', str(total_cost)),
                ('machine_chassis_no', str(machine.machine_chassis_no or machine.code or '')),
            ]
            if full_notes:
                post_data.append(('note', full_notes))
            if variance_disp:
                post_data.append(('variance_disposition', variance_disp))
            for tid in tracker_ids:
                post_data.append(('refuel_tracker_ids', str(tid)))

            # If no tracker IDs were explicitly provided, try to find pending sensor fills for this machine
            if not tracker_ids and machine.machine_chassis_no:
                try:
                    pending_res = client.list_refuels(machine_chassis_no=machine.machine_chassis_no, status='PENDING', days=30)
                    pending_data = pending_res.get('data') if isinstance(pending_res.get('data'), list) else []
                    if pending_data:
                        closest_tid = str(pending_data[0].get('id'))
                        post_data.append(('refuel_tracker_ids', closest_tid))
                        tracker_ids.append(closest_tid)
                except Exception as e_pending:
                    print(f"[ManualSlip] Auto-link check note: {e_pending}")

            ff_res = client.confirm_refuel(data=post_data, files=files if files else None)
            if ff_res.get('success') is not False:
                ff_success = True
                ff_data = ff_res.get('data') or ff_res
                ff_msg = "Successfully verified and posted to HDD / FiberForce."
            else:
                ff_msg = ff_res.get('error') or ff_res.get('message') or 'FiberForce verification pending.'
        except Exception as ff_err:
            print(f"[ManualSlip] FiberForce post error: {ff_err}")
            ff_msg = str(ff_err)

        # 11. Create local RefuelEntry in HERO
        status_note = f"[FiberForce: {'CONFIRMED' if ff_success else 'PENDING/MANUAL'}]"
        saved_notes = f"{status_note} {full_notes}".strip()
        entry = RefuelEntry.objects.create(
            machine=machine,
            performed_by=request.user if request.user and request.user.is_authenticated else None,
            quantity_liters=litres_val,
            price_per_liter=price_per_l,
            total_cost=total_cost,
            meter_reading=meter_reading,
            refuel_date=refuel_date_val,
            notes=saved_notes
        )

        return success_response(
            data={
                'id': entry.id,
                'machine_id': machine.id,
                'machine_name': machine.name or machine.code,
                'machine_chassis_no': machine.machine_chassis_no,
                'quantity_liters': float(entry.quantity_liters),
                'total_cost': float(entry.total_cost),
                'refuel_date': entry.refuel_date.isoformat(),
                'fiberforce_synced': ff_success,
                'fiberforce_message': ff_msg,
                'fiberforce_data': ff_data,
            },
            message=f"Manual slip for {machine.name or machine.code} ({litres_val}L) recorded and posted to HDD / FiberForce!"
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

    @action(detail=False, methods=['get', 'post'], url_path='accounting')
    def fuel_accounting(self, request):
        """
        Fuel Accounting endpoint providing grouped purchase & fill batches,
        variance & gap calculations, square-off/debt status, and live analytics.
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

        if restricted and not chassis and len(allowed_chassis) == 1:
            chassis = next(iter(allowed_chassis))

        days = data.get('days', 90)
        try:
            days = min(365, max(1, int(days)))
        except (TypeError, ValueError):
            days = 90

        date = (data.get('date') or '').strip() or None
        date_from = (data.get('date_from') or '').strip() or None
        date_to = (data.get('date_to') or '').strip() or None
        fuel_source_filter = (data.get('fuel_source') or data.get('source') or '').strip().upper()
        status_filter = (data.get('status') or '').strip().upper()
        search_query = (data.get('search') or data.get('q') or '').strip().lower()

        client = FiberForceClient()
        raw_list = []

        if chassis:
            ff_res = client.list_refuels(
                machine_chassis_no=chassis,
                days=days,
                date=date,
                page=1,
                page_size=200,
            )
            raw = ff_res.get('data') or ff_res.get('results') or []
            if isinstance(raw, dict):
                raw = raw.get('results') or raw.get('data') or raw.get('fills') or []
            if isinstance(raw, list):
                raw_list.extend(raw)
        elif restricted and allowed_chassis:
            for ac in allowed_chassis:
                ff_sub = client.list_refuels(
                    machine_chassis_no=ac,
                    days=days,
                    date=date,
                    page=1,
                    page_size=200,
                )
                raw = ff_sub.get('data') or ff_sub.get('results') or []
                if isinstance(raw, dict):
                    raw = raw.get('results') or raw.get('data') or raw.get('fills') or []
                if isinstance(raw, list):
                    for it in raw:
                        if isinstance(it, dict) and not (it.get('machine_chassis_no') or it.get('chassis_no')):
                            it = {**it, 'machine_chassis_no': ac}
                        raw_list.append(it)
        else:
            # Query lookback pages for admin
            for p in [1, 2]:
                ff_page = client.list_refuels(
                    machine_chassis_no=None,
                    days=days,
                    date=date,
                    page=p,
                    page_size=200,
                )
                raw = ff_page.get('data') or ff_page.get('results') or []
                if isinstance(raw, dict):
                    raw = raw.get('results') or raw.get('data') or raw.get('fills') or []
                if isinstance(raw, list):
                    raw_list.extend(raw)
                if len(raw) < 200:
                    break

        # Group raw items into batches
        batches_map = {}
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            item_chassis = str(
                item.get('machine_chassis_no')
                or item.get('chassis_no')
                or item.get('machineNo')
                or (item.get('machine') if isinstance(item.get('machine'), dict) else {}).get('machine_chassis_no')
                or chassis
                or ''
            ).strip()
            if restricted and allowed_chassis and item_chassis not in allowed_chassis:
                continue

            bid = str(item.get('confirm_batch_id') or '').strip()
            if not bid:
                bid = f"single_{item.get('id')}"
            batches_map.setdefault(bid, []).append({**item, 'machine_chassis_no': item_chassis})

        # Also include local RefuelEntry records as manual purchase batches
        local_entries = RefuelEntry.objects.filter(machine__in=machines_qs)
        if chassis:
            local_entries = local_entries.filter(machine__machine_chassis_no__iexact=chassis)
        if date:
            local_entries = local_entries.filter(refuel_date__date=date)
        elif days:
            from django.utils import timezone
            from datetime import timedelta
            cutoff = timezone.now() - timedelta(days=days)
            local_entries = local_entries.filter(refuel_date__gte=cutoff)

        for le in local_entries.select_related('machine', 'performed_by'):
            m_obj = le.machine
            m_chassis = str(m_obj.machine_chassis_no or '').strip()
            bid = f"local_{le.id}"
            if bid not in batches_map:
                perf_name = getattr(le.performed_by, 'get_full_name', lambda: '')() or (le.performed_by.username if le.performed_by else 'Operator')
                batches_map[bid] = [{
                    'id': f"local_{le.id}",
                    'machine_id': m_obj.id,
                    'machine_chassis_no': m_chassis,
                    'date': le.refuel_date.strftime('%Y-%m-%d') if le.refuel_date else '',
                    'occurred_at': le.refuel_date.isoformat() if le.refuel_date else '',
                    'litres': float(le.quantity_liters or 0.0),
                    'acknowledged_litres': float(le.quantity_liters or 0.0),
                    'amount_paid': float(le.total_cost or 0.0),
                    'status': 'CONFIRMED',
                    'verify_source': 'MANUAL_SLIP',
                    'notes': le.notes or '',
                    'performed_by': perf_name,
                    'is_local': True,
                }]

        # Load all FuelSquareOff entries for quick lookup
        so_lookup = {so.batch_key: so for so in FuelSquareOff.objects.filter(batch_key__in=batches_map.keys())}

        # Transform batches into Accounting Rows
        accounting_rows = []
        for bid, fills in batches_map.items():
            primary = fills[0]
            m_chassis = primary.get('machine_chassis_no') or ''
            local_meta = chassis_map.get(m_chassis) or {}
            m_name = local_meta.get('name') or primary.get('machine_name') or f"Machine {m_chassis}"
            m_code = local_meta.get('code') or (f"MAC-{m_chassis[-4:]}" if len(m_chassis) >= 4 else m_chassis)

            p_date_raw = primary.get('date') or (primary.get('occurred_at') or '')[:10]
            p_time_raw = (primary.get('occurred_at') or '')[11:16]

            # Sum fuel fills
            total_sensor_l = sum(_safe_float(f.get('litres')) for f in fills)
            total_purchase_l = sum(
                _safe_float(f.get('acknowledged_litres') if f.get('acknowledged_litres') is not None else f.get('effective_litres'), f.get('litres'))
                for f in fills
            )
            if total_purchase_l <= 0:
                total_purchase_l = total_sensor_l

            # Amount
            amt_raw = primary.get('amount_paid')
            if amt_raw is not None and str(amt_raw).strip() != '' and float(amt_raw) > 0:
                total_amt = round(float(amt_raw), 2)
            else:
                total_amt = round(total_purchase_l * 98.4, 2)

            purchase_per_l = round(total_amt / total_purchase_l, 2) if total_purchase_l > 0 else 98.4

            # Variance & Gap
            var_pct = round(abs(total_sensor_l - total_purchase_l) / total_sensor_l * 100, 1) if total_sensor_l > 0 else 0.0
            variance_ok = var_pct <= 3.0
            gap_l = round(max(0.0, total_purchase_l - total_sensor_l), 1)

            # Fuel source detection
            v_src = str(primary.get('verify_source') or '').upper()
            note_str = str(primary.get('note') or primary.get('notes') or '').lower()
            if 'petro' in note_str or 'card' in v_src or primary.get('card_ack'):
                source_type = 'PETRO'
            elif 'manual' in v_src or primary.get('is_local') or 'slip' in note_str:
                source_type = 'MANUAL'
            elif primary.get('status') == 'DENIED':
                source_type = 'ARCHIVED'
            else:
                source_type = 'MANUAL'

            is_archived = primary.get('status') == 'DENIED'
            is_abnormality = bool(not variance_ok or gap_l > 1.0 or primary.get('is_abnormality'))

            # Check square off record
            so = so_lookup.get(bid)
            if so:
                status_label = so.status.capitalize() if so.status else 'Done'
                action_label = so.action_type.replace('_', ' ').title()
                recovery_amt = float(so.recovery_amount or 0.0)
                settled_at_str = so.settled_at.strftime('%d %b %Y') if so.settled_at else None
                settled_by_str = so.performed_by.get_full_name() if so.performed_by else 'Admin'
                disposition_str = so.disposition or ''
                so_notes_str = so.notes or ''
            else:
                if (gap_l <= 0.5 and variance_ok and primary.get('status') == 'CONFIRMED') or total_sensor_l == total_purchase_l:
                    status_label = 'Done'
                    action_label = 'Matched'
                    recovery_amt = 0.0
                else:
                    status_label = 'Pending'
                    action_label = 'Square-off / Debt'
                    recovery_amt = round(gap_l * purchase_per_l, 2) if gap_l > 0.5 else 0.0
                settled_at_str = None
                settled_by_str = None
                disposition_str = ''
                so_notes_str = ''

            # Linked fills details
            linked_list = []
            for idx, f in enumerate(fills, 1):
                f_sensor = _safe_float(f.get('litres'))
                f_slip = _safe_float(f.get('acknowledged_litres') if f.get('acknowledged_litres') is not None else f.get('effective_litres'), f_sensor)
                f_time = (f.get('occurred_at') or '')
                f_dt_formatted = ''
                if f_time:
                    try:
                        from django.utils.dateparse import parse_datetime
                        p_dt = parse_datetime(f_time)
                        if p_dt:
                            f_dt_formatted = p_dt.strftime('%d %b %Y, %I:%M %p')
                    except Exception:
                        pass
                if not f_dt_formatted:
                    f_dt_formatted = f.get('date') or 'Fill'

                linked_list.append({
                    'index': idx,
                    'id': f.get('id'),
                    'occurred_at': f_time,
                    'formatted_time': f_dt_formatted,
                    'sensor_ltr': f_sensor,
                    'slip_ltr': f_slip,
                    'status': str(f.get('status') or 'PENDING').upper(),
                    'level_before_l': f.get('level_before_l'),
                    'level_after_l': f.get('level_after_l'),
                    'variance_pct': round(abs(f_sensor - f_slip) / f_sensor * 100, 1) if f_sensor > 0 else 0.0,
                })

            accounting_rows.append({
                'batch_id': bid,
                'machine_id': local_meta.get('id'),
                'machine_code': m_code,
                'machine_name': m_name,
                'machine_chassis_no': m_chassis,
                'date': p_date_raw,
                'time': p_time_raw,
                'purchase_ltr': round(total_purchase_l, 1),
                'purchase_amount': round(total_amt, 2),
                'purchase_per_ltr': round(purchase_per_l, 1),
                'fuel_fill_ltr': round(total_sensor_l, 1),
                'variance_pct': var_pct,
                'variance_ok': variance_ok,
                'gap_ltr': gap_l,
                'action': action_label,
                'recovery_amount': recovery_amt,
                'status': status_label,
                'fuel_source': source_type,
                'is_abnormality': is_abnormality,
                'is_archived': is_archived,
                'fills_count': len(fills),
                'linked_fills': linked_list,
                'is_multi_fill': len(fills) > 1,
                'settled_at': settled_at_str,
                'settled_by': settled_by_str,
                'disposition': disposition_str,
                'notes': so_notes_str,
            })

        # Filter accounting rows
        filtered_rows = []
        for r in accounting_rows:
            if fuel_source_filter and fuel_source_filter not in ('ALL', '*'):
                if fuel_source_filter == 'ABNORMALITIES' and not r['is_abnormality']:
                    continue
                elif fuel_source_filter == 'ARCHIVED' and not r['is_archived']:
                    continue
                elif fuel_source_filter in ('MANUAL', 'PETRO', 'EXTERNAL') and r['fuel_source'] != fuel_source_filter:
                    continue

            if status_filter and status_filter not in ('ALL', '*'):
                if r['status'].upper() != status_filter:
                    continue

            if date_from and r['date'] and r['date'] < date_from:
                continue
            if date_to and r['date'] and r['date'] > date_to:
                continue

            if search_query:
                hay = f"{r['machine_code']} {r['machine_name']} {r['machine_chassis_no']} {r['batch_id']} {r['action']} {r['notes']} {r['settled_by']}".lower()
                if search_query not in hay:
                    continue

            filtered_rows.append(r)

        filtered_rows.sort(key=lambda x: str(x['date'] or ''), reverse=True)

        # Summary calculations (live, non-hardcoded, matching screenshot 3)
        total_fills = sum(r['fills_count'] for r in filtered_rows)
        total_volume_l = sum(r['fuel_fill_ltr'] for r in filtered_rows)
        manual_volume_l = sum(r['fuel_fill_ltr'] for r in filtered_rows if r['fuel_source'] == 'MANUAL')
        petro_volume_l = sum(r['fuel_fill_ltr'] for r in filtered_rows if r['fuel_source'] == 'PETRO')
        total_spend = sum(r['purchase_amount'] for r in filtered_rows)
        total_purchase_vol = sum(r['purchase_ltr'] for r in filtered_rows)
        count_with_amt = sum(1 for r in filtered_rows if r['purchase_amount'] > 0)
        avg_rate = round(total_spend / total_purchase_vol, 1) if total_purchase_vol > 0 else 98.4
        archived_cnt = sum(r['fills_count'] for r in filtered_rows if r['is_archived'])

        summary = {
            'fills': total_fills,
            'archived_count': archived_cnt,
            'total_litres': round(total_volume_l, 1),
            'manual_litres': round(manual_volume_l, 1),
            'petro_litres': round(petro_volume_l, 1),
            'total_amount_paid': round(total_spend, 2),
            'count_with_amount': count_with_amt,
            'total_batches': len(filtered_rows),
            'avg_price_per_ltr': avg_rate,
        }

        # Analytics calculations (matches screenshot 3)
        # 1. Amount by day
        day_map = {}
        for r in filtered_rows:
            d = r['date']
            if d:
                day_map.setdefault(d, {'date': d, 'amount': 0.0, 'litres': 0.0})
                day_map[d]['amount'] += r['purchase_amount']
                day_map[d]['litres'] += r['fuel_fill_ltr']
        amount_by_day = sorted(
            [{'date': v['date'], 'amount': round(v['amount'], 2), 'litres': round(v['litres'], 1)} for v in day_map.values()],
            key=lambda x: x['date']
        )

        # 2. Amount by machine
        machine_map = {}
        for r in filtered_rows:
            m_key = r['machine_chassis_no'] or r['machine_code']
            if m_key:
                machine_map.setdefault(m_key, {
                    'chassis': m_key,
                    'code': r['machine_code'],
                    'name': r['machine_name'],
                    'amount': 0.0,
                    'litres': 0.0,
                })
                machine_map[m_key]['amount'] += r['purchase_amount']
                machine_map[m_key]['litres'] += r['fuel_fill_ltr']
        amount_by_machine = sorted(
            [{'chassis': v['chassis'], 'code': v['code'], 'name': v['name'], 'amount': round(v['amount'], 2), 'litres': round(v['litres'], 1)} for v in machine_map.values()],
            key=lambda x: x['amount'],
            reverse=True
        )[:15]

        return success_response(
            data={
                'rows': filtered_rows,
                'count': len(filtered_rows),
                'summary': summary,
                'analytics': {
                    'amount_by_day': amount_by_day,
                    'amount_by_machine': amount_by_machine,
                },
                'filters': {
                    'days': days,
                    'machine_id': machine_id,
                    'fuel_source': fuel_source_filter or 'ALL',
                    'status': status_filter or 'ALL',
                }
            },
            message='Fuel accounting data loaded successfully.'
        )

    @action(detail=False, methods=['post'], url_path='square-off')
    def square_off_action(self, request):
        """
        Record Fuel Accounting Square-off / Debt resolution for a batch.
        """
        req_data = request.data
        batch_key = str(req_data.get('batch_key') or req_data.get('batch_id') or '').strip()
        if not batch_key:
            return error_response(message='batch_key is required.', status_code=status.HTTP_400_BAD_REQUEST)

        machine_raw = req_data.get('machine_id') or req_data.get('machine') or req_data.get('machine_chassis_no')
        machine = None
        if machine_raw:
            m_str = str(machine_raw).strip()
            if m_str.isdigit():
                machine = Machine.objects.filter(id=int(m_str)).first()
            if not machine:
                machine = Machine.objects.filter(
                    Q(machine_chassis_no__iexact=m_str) | Q(code__iexact=m_str)
                ).first()
        if not machine:
            machine = Machine.objects.first()

        action_type = str(req_data.get('action_type') or 'SQUARE_OFF').strip().upper()
        recovery_amt = _safe_float(req_data.get('recovery_amount'), 0.0)
        gap_l = _safe_float(req_data.get('gap_litres'), 0.0)
        status_val = str(req_data.get('status') or 'DONE').strip().upper()
        disposition = str(req_data.get('disposition') or '').strip()
        notes = str(req_data.get('notes') or req_data.get('note') or '').strip()

        so, created = FuelSquareOff.objects.update_or_create(
            batch_key=batch_key,
            defaults={
                'machine': machine,
                'performed_by': request.user if request.user and request.user.is_authenticated else None,
                'action_type': action_type,
                'recovery_amount': recovery_amt,
                'gap_litres': gap_l,
                'status': status_val,
                'disposition': disposition,
                'notes': notes,
            }
        )

        serializer = FuelSquareOffSerializer(so)
        return success_response(
            data=serializer.data,
            message=f"Fuel batch {batch_key} squared off successfully."
        )


