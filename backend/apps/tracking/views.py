from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework import permissions, viewsets
from rest_framework.views import APIView

from apps.common.responses import success_response
from apps.common.ttl_cache import ttl_get, ttl_set
from apps.integrations.fiberforce.client import FiberForceClient
from .models import TelemetryData
from .serializers import TelemetryDataSerializer


LIVE_TRACKING_PARAMS = [
    'latitude', 'longitude', 'speed_kmph', 'course_deg',
    'is_online', 'telemetry_online', 'fuel_litres', 'fuel_pct',
    'state', 'state_label', 'engine_on', 'rpm',
    'coolant_temp', 'oil_pressure', 'supply_voltage', 'internal_battery_v',
    'gnss_valid', 'last_packet_at', 'location_updated_at',
    'engine_hours_total', 'engine_hours_today',
]

# Lightweight params for dashboard map — fewer fields, faster FiberForce payloads
MAP_TRACKING_PARAMS = [
    'latitude', 'longitude', 'speed_kmph', 'course_deg',
    'is_online', 'engine_on', 'rpm', 'state', 'state_label',
    'fuel_litres', 'fuel_pct',
]


def _safe_float(val, default=None):
    try:
        if val is None or val == '':
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def _heading_label(course_deg):
    if course_deg is None:
        return '—'
    dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    idx = int(((float(course_deg) % 360) + 22.5) // 45) % 8
    return dirs[idx]


def _latest_telemetry_by_machine(machine_ids):
    """One ordered scan for latest telemetry row per machine (avoids N+1)."""
    if not machine_ids:
        return {}
    latest = {}
    qs = (
        TelemetryData.objects.filter(machine_id__in=machine_ids)
        .order_by('machine_id', '-timestamp')
        .only('id', 'machine_id', 'latitude', 'longitude', 'speed', 'heading', 'timestamp')
    )
    for row in qs:
        mid = row.machine_id
        if mid not in latest:
            latest[mid] = row
    return latest


class LiveTrackingView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            return self._handle_get(request)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            raise

    def _handle_get(self, request):
        user = request.user if request.user and request.user.is_authenticated else None
        q = request.query_params
        commissioned_only = str(q.get('commissioned_only') or q.get('commissioned') or '').lower() in (
            '1', 'true', 'yes',
        )
        light = str(q.get('light') or q.get('map') or '').lower() in ('1', 'true', 'yes') or commissioned_only

        cache_key = (
            f"tracking:live:"
            f"{getattr(user, 'id', 'anon')}:"
            f"{q.get('vendor_id') or q.get('vendor') or 'all'}:"
            f"{'comm' if commissioned_only else 'all'}:"
            f"{'light' if light else 'full'}"
        )
        cached = ttl_get(cache_key)
        if cached is not None:
            return success_response(
                data=cached['data'],
                message="Live tracking telemetry fetched (cached)",
                meta=cached.get('meta') or {},
            )

        from apps.machines.models import Machine
        if Machine.objects.count() == 0:
            from concurrent.futures import ThreadPoolExecutor
            from apps.machines.services import sync_fiberforce_machines
            try:
                ThreadPoolExecutor(max_workers=1).submit(sync_fiberforce_machines)
            except Exception:
                pass

        from apps.machines.services import fetch_live_fiberforce_machines
        ff_res = fetch_live_fiberforce_machines(user, q)
        live_machines = ff_res.get('data') or ff_res.get('results') or []

        data = []
        for m in live_machines:
            if not isinstance(m, dict):
                continue
            is_assigned = bool(m.get('is_vendor_assigned') or m.get('is_commissioned_tab'))
            if commissioned_only and not is_assigned:
                continue

            lat = _safe_float(m.get('latitude') or m.get('current_latitude'))
            lng = _safe_float(m.get('longitude') or m.get('current_longitude'))
            speed = _safe_float(m.get('speed') or m.get('speed_kmph'), 0.0)
            course = _safe_float(m.get('course_deg') or m.get('heading'), 0.0)

            data.append({
                'id': m.get('id'),
                'machine_id': m.get('id'),
                'name': m.get('name'),
                'serial_number': m.get('serial_number') or m.get('machine_chassis_no'),
                'chassis_no': m.get('machine_chassis_no') or m.get('serial_number'),
                'machine_chassis_no': m.get('machine_chassis_no'),
                'model_code': m.get('model_code'),
                'model_name': m.get('model_name'),
                'status': (m.get('status') or 'RUNNING').upper(),
                'state': m.get('state') or m.get('status') or 'RUNNING',
                'state_label': m.get('state_label') or '',
                'engine_on': bool(m.get('engine_on')),
                'is_online': bool(m.get('is_online', True)),
                'is_commissioned': bool(m.get('is_commissioned')),
                'is_vendor_assigned': is_assigned,
                'is_commissioned_tab': is_assigned,
                'site_name': m.get('site_name') or m.get('location_name') or '',
                'operator_name': m.get('operator_name') or '—',
                'latitude': float(lat) if lat is not None else None,
                'longitude': float(lng) if lng is not None else None,
                'speed': float(speed or 0),
                'course_deg': float(course or 0),
                'heading': float(course or 0),
                'heading_label': _heading_label(course),
                'tilt': float(course or 0),
                'fuel_level': _safe_float(m.get('current_fuel_level'), 0.0),
                'fuel_percentage': int(m.get('fuel_percentage') or 0),
                'rpm': m.get('rpm', 0),
                'coolant_temp': m.get('coolant_temp', 0.0),
                'oil_pressure': m.get('oil_pressure', 0.0),
                'supply_voltage': m.get('supply_voltage', 0.0),
                'internal_battery_v': m.get('internal_battery_v', 0.0),
                'gnss_valid': m.get('gnss_valid', True),
                'last_packet_at': m.get('last_ping'),
                'location_updated_at': m.get('last_ping'),
                'engine_hours_total': _safe_float(m.get('engine_hours'), 0.0),
                'engine_hours_today': _safe_float(m.get('engine_hours_today'), 0.0),
                'runtime_str': m.get('runtime_str', '00h 00m'),
                'last_ping': m.get('last_ping', ''),
            })

        data.sort(key=lambda x: str(x.get('id') or ''))
        commissioned_count = sum(1 for row in data if row.get('is_vendor_assigned'))
        meta = {
            'counts': {
                'ALL': len(data),
                'COMMISSIONED': commissioned_count,
                'WORKING': sum(1 for row in data if str(row.get('status') or '').upper() == 'RUNNING'),
                'IDLE': sum(1 for row in data if str(row.get('status') or '').upper() == 'IDLE'),
            }
        }
        ttl_set(cache_key, {'data': data, 'meta': meta}, ttl_seconds=10 if light else 8)
        return success_response(
            data=data,
            message="Live tracking telemetry fetched",
            meta=meta,
        )


class TelemetryViewSet(viewsets.ModelViewSet):
    queryset = TelemetryData.objects.all()
    serializer_class = TelemetryDataSerializer
    permission_classes = [permissions.AllowAny]
