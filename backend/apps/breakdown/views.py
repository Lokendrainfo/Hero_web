from datetime import datetime, timedelta, timezone as dt_timezone

from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView

from .models import BreakdownReport
from .serializers import BreakdownReportSerializer
from apps.common.permissions import IsVendorAuthorized
from apps.common.vendor_scope import filter_queryset_by_vendor
from apps.common.responses import success_response, error_response
from apps.integrations.fiberforce.client import FiberForceClient
from apps.machines.models import Machine


class BreakdownViewSet(viewsets.ModelViewSet):
    queryset = BreakdownReport.objects.all()
    serializer_class = BreakdownReportSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        q_params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        requested_vendor = q_params.get('vendor_id') or q_params.get('vendor')

        if (user.is_superuser or 'ADMIN' in [str(r).upper() for r in user.get_role_list()]) and (not requested_vendor or str(requested_vendor).strip().lower() in ['all', 'undefined', 'null', 'none', '']):
            return BreakdownReport.objects.all().order_by('-id')

        qs = filter_queryset_by_vendor(BreakdownReport.objects.all(), user, 'machine__vendor_id', request=self.request)
        if hasattr(BreakdownReport, 'vendor_id') and not user.is_superuser and 'ADMIN' not in [str(r).upper() for r in user.get_role_list()] and not qs.exists():
            qs = filter_queryset_by_vendor(BreakdownReport.objects.all(), user, 'vendor_id', request=self.request)
        return qs.order_by('-id')


def _int_value(value, default, lo, hi):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(lo, min(hi, number))


def _int_list(value):
    if value is None or value == '':
        return []
    if isinstance(value, str):
        value = [part.strip() for part in value.split(',') if part.strip()]
    if not isinstance(value, (list, tuple)):
        value = [value]
    out = []
    for item in value:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


def _clean_text(value):
    if value is None:
        return ''
    return str(value).strip()


def _parse_dt(value):
    text = _clean_text(value)
    if not text:
        return None
    try:
        if text.endswith('Z'):
            text = text[:-1] + '+00:00'
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _within_days(row, days, *fields):
    if not days:
        return True
    cutoff = datetime.now(dt_timezone.utc) - timedelta(days=int(days))
    for field in fields:
        parsed = _parse_dt(row.get(field))
        if parsed is None:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt_timezone.utc)
        return parsed >= cutoff
    return True


def _request_data(request):
    data = {}
    query = getattr(request, 'query_params', None)
    if query is not None:
        for key in query:
            data[key] = query.get(key)
    body = getattr(request, 'data', None)
    if hasattr(body, 'items'):
        for key, value in body.items():
            data[key] = value
    return data


def _accessible_machines(user, request):
    qs = Machine.objects.exclude(machine_chassis_no__isnull=True).exclude(machine_chassis_no='')
    qs = filter_queryset_by_vendor(qs, user, 'vendor_id', request=request)
    return list(qs.select_related('vendor').order_by('model_name', 'machine_chassis_no'))


def _machine_index(machines):
    index = {}
    for machine in machines:
        chassis = _clean_text(machine.machine_chassis_no)
        if chassis:
            index[chassis] = machine
    return index


def _serialize_machine(machine):
    return {
        'id': machine.id,
        'machine_chassis_no': machine.machine_chassis_no,
        'name': machine.name,
        'code': machine.code,
        'model_name': machine.model_name,
        'model_code': machine.model_code,
        'site_name': machine.site_name,
        'vendor_id': machine.vendor_id,
        'vendor_name': machine.vendor.name if machine.vendor else '',
    }


def _require_chassis(user, request, chassis):
    chassis = _clean_text(chassis)
    if not chassis:
        return None, error_response('machine_chassis_no is required.', status_code=status.HTTP_400_BAD_REQUEST)
    machines = _accessible_machines(user, request)
    index = _machine_index(machines)
    machine = index.get(chassis)
    if not machine:
        return None, error_response('You do not have access to this machine.', status_code=status.HTTP_403_FORBIDDEN)
    return machine, None


def _ff_or_error(payload, fallback='FiberForce request failed.'):
    if not isinstance(payload, dict):
        return None, error_response(fallback, status_code=status.HTTP_502_BAD_GATEWAY)
    if payload.get('success') is False:
        message = payload.get('message') or fallback
        return None, error_response(str(message), status_code=status.HTTP_502_BAD_GATEWAY)
    return payload, None


def _as_rows(payload):
    data = payload.get('data') if isinstance(payload, dict) else payload
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        if isinstance(data.get('results'), list):
            return [row for row in data['results'] if isinstance(row, dict)]
        if data.get('id') is not None or data.get('tt_number') or data.get('machine_chassis_no'):
            return [data]
    return []


def _as_object(payload):
    data = payload.get('data') if isinstance(payload, dict) else payload
    if isinstance(data, dict):
        return data
    rows = _as_rows(payload)
    return rows[0] if rows else {}


def _enrich_row(row, index):
    item = dict(row)
    chassis = _clean_text(item.get('machine_chassis_no'))
    machine = index.get(chassis)
    item['machine_chassis_no'] = chassis or item.get('machine_chassis_no')
    if machine:
        item['machine_id'] = machine.id
        item['machine_name'] = machine.model_name or machine.name
        item['model_name'] = machine.model_name
        item['model_code'] = machine.model_code
        item['site_name'] = machine.site_name
        item['vendor_id'] = machine.vendor_id
        item['vendor_name'] = machine.vendor.name if machine.vendor else ''
    else:
        item.setdefault('machine_name', chassis or 'Unknown machine')
        item.setdefault('vendor_name', '')
    return item


def _filter_scope(rows, index, chassis=None, restrict_to_known=True):
    chassis = _clean_text(chassis)
    if chassis:
        return [row for row in rows if _clean_text(row.get('machine_chassis_no')) == chassis]
    if not restrict_to_known:
        return rows
    allowed = set(index.keys())
    return [row for row in rows if _clean_text(row.get('machine_chassis_no')) in allowed]


def _oem_api_status(raw, for_fleet=False):
    value = _clean_text(raw).lower() or 'all'
    if value in ('open', 'seen', 'accepted'):
        return 'open'
    if value == 'resolved':
        return 'all' if for_fleet else 'resolved'
    if value in ('closed', 'close'):
        return 'closed'
    return 'all'


def _ops_api_status(raw):
    value = _clean_text(raw).lower() or 'all'
    if value in ('open', 'closed', 'all'):
        return value
    return 'all'


class FiberForceBreakdownMixin:
    permission_classes = [permissions.IsAuthenticated]

    def machines_payload(self, request):
        machines = _accessible_machines(request.user, request)
        return machines, _machine_index(machines), [_serialize_machine(m) for m in machines]


class OemBreakdownOptionsView(FiberForceBreakdownMixin, APIView):
    def get(self, request):
        payload, err = _ff_or_error(FiberForceClient().breakdown_options(), 'Could not load breakdown options.')
        if err:
            return err
        return success_response(data=payload.get('data') or {})


class OemBreakdownListCreateView(FiberForceBreakdownMixin, APIView):
    def get(self, request):
        return self._list(request)

    def post(self, request):
        return self._create(request, _request_data(request))

    def _list(self, request):
        data = _request_data(request)
        machines, index, machine_rows = self.machines_payload(request)
        chassis = _clean_text(data.get('machine_chassis_no') or data.get('chassis'))
        days = _int_value(data.get('days'), 90, 1, 730)
        client = FiberForceClient()

        if chassis:
            machine, err = _require_chassis(request.user, request, chassis)
            if err:
                return err
            limit = _int_value(data.get('limit'), 100, 1, 500)
            payload, err = _ff_or_error(
                client.list_machine_breakdowns(
                    chassis,
                    status=_oem_api_status(data.get('status')),
                    days=days,
                    limit=limit,
                ),
                'Could not load machine breakdowns.',
            )
            if err:
                return err
            rows = _as_rows(payload)
            for row in rows:
                row.setdefault('machine_chassis_no', chassis)
        else:
            if not machines:
                return success_response(data={'results': [], 'machines': machine_rows})
            limit = _int_value(data.get('limit'), 200, 1, 1000)
            payload, err = _ff_or_error(
                client.fleet_breakdowns(status=_oem_api_status(data.get('status'), for_fleet=True), limit=limit),
                'Could not load fleet breakdowns.',
            )
            if err:
                return err
            rows = _filter_scope(_as_rows(payload), index, restrict_to_known=True)
            rows = [row for row in rows if _within_days(row, days, 'occurred_at', 'created_at')]

        results = [_enrich_row(row, index) for row in rows]
        return success_response(data={'results': results, 'machines': machine_rows})

    def _create(self, request, data):
        machine, err = _require_chassis(request.user, request, data.get('machine_chassis_no') or data.get('chassis'))
        if err:
            return err

        reason_key_ids = _int_list(data.get('reason_key_ids'))
        reason = _clean_text(data.get('reason'))
        if not reason_key_ids and not reason:
            return error_response('Select a reason key or enter a description.', status_code=status.HTTP_400_BAD_REQUEST)

        payload = {'machine_chassis_no': machine.machine_chassis_no}
        if reason:
            payload['reason'] = reason
        if reason_key_ids:
            payload['reason_key_ids'] = reason_key_ids
        severity = _clean_text(data.get('severity')).upper()
        if severity:
            payload['severity'] = severity
        occurred_at = _clean_text(data.get('occurred_at'))
        if occurred_at:
            payload['occurred_at'] = occurred_at
        ref_id = _clean_text(data.get('ref_id'))
        if ref_id:
            payload['ref_id'] = ref_id

        ff, err = _ff_or_error(FiberForceClient().create_breakdown(payload), 'Could not create breakdown.')
        if err:
            return err
        row = _enrich_row(_as_object(ff), {machine.machine_chassis_no: machine})
        return success_response(data=row, message=ff.get('message') or 'Breakdown created.')


class OemBreakdownCloseView(FiberForceBreakdownMixin, APIView):
    def post(self, request):
        data = _request_data(request)
        try:
            breakdown_id = int(data.get('breakdown_id') or data.get('id'))
        except (TypeError, ValueError):
            return error_response('breakdown_id is required.', status_code=status.HTTP_400_BAD_REQUEST)

        chassis = _clean_text(data.get('machine_chassis_no') or data.get('chassis'))
        if chassis:
            _, err = _require_chassis(request.user, request, chassis)
            if err:
                return err

        resolution_key_ids = _int_list(data.get('resolution_key_ids'))
        resolution_note = _clean_text(data.get('resolution_note') or data.get('note'))
        solved_by = _clean_text(data.get('solved_by')).upper()
        if not resolution_note and not resolution_key_ids:
            return error_response('Add a resolution note or resolution keys.', status_code=status.HTTP_400_BAD_REQUEST)

        payload = {'breakdown_id': breakdown_id}
        if resolution_note:
            payload['resolution_note'] = resolution_note
        if resolution_key_ids:
            payload['resolution_key_ids'] = resolution_key_ids
        if solved_by:
            payload['solved_by'] = solved_by
        resolved_at = _clean_text(data.get('resolved_at'))
        if resolved_at:
            payload['resolved_at'] = resolved_at
        if chassis:
            payload['machine_chassis_no'] = chassis

        ff, err = _ff_or_error(FiberForceClient().close_breakdown(payload), 'Could not close breakdown.')
        if err:
            return err
        machines, index, _ = self.machines_payload(request)
        row = _enrich_row(_as_object(ff), index)
        return success_response(data=row, message=ff.get('message') or 'Breakdown closed.')


class OpsStopOptionsView(FiberForceBreakdownMixin, APIView):
    def get(self, request):
        payload, err = _ff_or_error(FiberForceClient().ops_stop_options(), 'Could not load Ops Stop options.')
        if err:
            return err
        return success_response(data=payload.get('data') or {})


class OpsStopListCreateView(FiberForceBreakdownMixin, APIView):
    def get(self, request):
        return self._list(request)

    def post(self, request):
        return self._create(request, _request_data(request))

    def _list(self, request):
        data = _request_data(request)
        machines, index, machine_rows = self.machines_payload(request)
        chassis = _clean_text(data.get('machine_chassis_no') or data.get('chassis'))
        days = _int_value(data.get('days'), 90, 1, 730)
        client = FiberForceClient()

        if chassis:
            _, err = _require_chassis(request.user, request, chassis)
            if err:
                return err
            limit = _int_value(data.get('limit'), 100, 1, 500)
            payload, err = _ff_or_error(
                client.list_machine_ops_stops(
                    chassis,
                    status=_ops_api_status(data.get('status')),
                    days=days,
                    limit=limit,
                ),
                'Could not load machine Ops Stops.',
            )
            if err:
                return err
            rows = _as_rows(payload)
            for row in rows:
                row.setdefault('machine_chassis_no', chassis)
        else:
            if not machines:
                return success_response(data={'results': [], 'machines': machine_rows})
            limit = _int_value(data.get('limit'), 200, 1, 1000)
            payload, err = _ff_or_error(
                client.fleet_ops_stops(status=_ops_api_status(data.get('status')), limit=limit),
                'Could not load fleet Ops Stops.',
            )
            if err:
                return err
            rows = _filter_scope(_as_rows(payload), index, restrict_to_known=True)
            rows = [row for row in rows if _within_days(row, days, 'started_at', 'occurred_at', 'created_at')]

        results = [_enrich_row(row, index) for row in rows]
        return success_response(data={'results': results, 'machines': machine_rows})

    def _create(self, request, data):
        machine, err = _require_chassis(request.user, request, data.get('machine_chassis_no') or data.get('chassis'))
        if err:
            return err

        reason_key_ids = _int_list(data.get('reason_key_ids'))
        note = _clean_text(data.get('note') or data.get('reason'))
        if not reason_key_ids and not note:
            return error_response('Select a reason key or enter a note.', status_code=status.HTTP_400_BAD_REQUEST)

        payload = {'machine_chassis_no': machine.machine_chassis_no}
        if note:
            payload['note'] = note
        if reason_key_ids:
            payload['reason_key_ids'] = reason_key_ids
        started_at = _clean_text(data.get('started_at') or data.get('occurred_at'))
        if started_at:
            payload['started_at'] = started_at
        ref_id = _clean_text(data.get('ref_id'))
        if ref_id:
            payload['ref_id'] = ref_id

        ff, err = _ff_or_error(FiberForceClient().create_ops_stop(payload), 'Could not open Ops Stop.')
        if err:
            return err
        row = _enrich_row(_as_object(ff), {machine.machine_chassis_no: machine})
        return success_response(data=row, message=ff.get('message') or 'Ops Stop created.')


class OpsStopCloseView(FiberForceBreakdownMixin, APIView):
    def post(self, request):
        data = _request_data(request)
        try:
            ops_stop_id = int(data.get('ops_stop_id') or data.get('id'))
        except (TypeError, ValueError):
            return error_response('ops_stop_id is required.', status_code=status.HTTP_400_BAD_REQUEST)

        chassis = _clean_text(data.get('machine_chassis_no') or data.get('chassis'))
        if chassis:
            _, err = _require_chassis(request.user, request, chassis)
            if err:
                return err

        close_note = _clean_text(data.get('close_note') or data.get('note'))
        if not close_note:
            return error_response('close_note is required.', status_code=status.HTTP_400_BAD_REQUEST)

        payload = {'ops_stop_id': ops_stop_id, 'close_note': close_note}
        closed_at = _clean_text(data.get('closed_at') or data.get('resolved_at'))
        if closed_at:
            payload['closed_at'] = closed_at
        if chassis:
            payload['machine_chassis_no'] = chassis

        ff, err = _ff_or_error(FiberForceClient().close_ops_stop(payload), 'Could not close Ops Stop.')
        if err:
            return err
        _, index, _ = self.machines_payload(request)
        row = _enrich_row(_as_object(ff), index)
        return success_response(data=row, message=ff.get('message') or 'Ops Stop closed.')
