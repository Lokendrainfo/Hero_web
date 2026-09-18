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

        from apps.common.vendor_scope import get_user_authorized_machines, get_user_vendor_ids
        from apps.machines.services import collect_ilync_assigned_chassis, machine_matches_assigned
        from apps.vendors.models import Vendor
        from django.db.models import Q

        allowed_vendor_ids = get_user_vendor_ids(user) if user else None
        v_qs = Vendor.objects.filter(is_active=True)
        if allowed_vendor_ids is not None:
            v_qs = v_qs.filter(id__in=allowed_vendor_ids)
        req_v = q.get('vendor_id') or q.get('vendor')
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            v_filter = Q(external_vendor_id=req_v) | Q(name__iexact=req_v)
            if str(req_v).isdigit():
                v_filter |= Q(id=int(req_v))
            v_qs = v_qs.filter(v_filter)

        vendors_list = list(v_qs)
        assigned_cache_key = (
            f"tracking:assigned:"
            f"{getattr(user, 'id', 'anon')}:"
            f"{req_v or 'all'}:"
            f"{','.join(str(v.id) for v in vendors_list)}"
        )
        assigned_chassis = ttl_get(assigned_cache_key)
        if assigned_chassis is None:
            assigned_chassis = collect_ilync_assigned_chassis(vendors_list)
            ttl_set(assigned_cache_key, assigned_chassis, ttl_seconds=45)

        machines = list(get_user_authorized_machines(user, request=request))
        if commissioned_only and assigned_chassis:
            machines = [m for m in machines if machine_matches_assigned(m, assigned_chassis)]

        live_targets = [m for m in machines if m.machine_chassis_no]
        if light and assigned_chassis:
            live_targets = [m for m in live_targets if machine_matches_assigned(m, assigned_chassis)]

        # Light/map path skips DB telemetry scan — FiberForce + machine coords are enough
        tele_by_machine = {} if light else _latest_telemetry_by_machine([m.id for m in machines])
        ff_client = FiberForceClient()
        live_params = MAP_TRACKING_PARAMS if light else LIVE_TRACKING_PARAMS
        ff_timeout = 1.2 if light else 2.5

        def fetch_ff(chassis):
            try:
                return chassis, ff_client.get_live_telemetry(chassis, params=live_params, timeout=ff_timeout)
            except Exception:
                return chassis, {}

        ff_map = {}
        if live_targets:
            workers = min(16, max(4, len(live_targets)))
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [
                    executor.submit(fetch_ff, m.machine_chassis_no)
                    for m in live_targets
                ]
                for future in as_completed(futures):
                    try:
                        chassis, resp = future.result()
                        ff_data = resp.get('data', {}) if isinstance(resp, dict) else {}
                        ff_map[chassis] = ff_data if isinstance(ff_data, dict) else {}
                    except Exception as e:
                        print(f"[LiveTrackingView] Telemetry worker error: {e}")

        data = []
        for m in machines:
            last_telemetry = tele_by_machine.get(m.id)
            status_upper = str(m.status or 'RUNNING').upper()
            ff_data = ff_map.get(m.machine_chassis_no or '', {}) if m.machine_chassis_no else {}

            live_lat = _safe_float(ff_data.get('latitude'))
            live_lng = _safe_float(ff_data.get('longitude'))
            live_speed = _safe_float(ff_data.get('speed_kmph'), None)
            live_course = _safe_float(ff_data.get('course_deg'), None)
            live_online = m.is_online
            if ff_data.get('is_online') is not None:
                live_online = bool(ff_data.get('is_online'))
            elif ff_data.get('telemetry_online') is not None:
                live_online = bool(ff_data.get('telemetry_online'))

            live_fuel = _safe_float(ff_data.get('fuel_litres'), float(m.current_fuel_level or 0))
            live_fuel_pct = m.fuel_percentage
            if ff_data.get('fuel_pct') is not None:
                live_fuel_pct = int(_safe_float(ff_data.get('fuel_pct'), live_fuel_pct or 0) or 0)

            live_state = str(ff_data.get('state') or status_upper).upper()
            live_state_label = str(ff_data.get('state_label') or getattr(m, 'state_label', None) or '')
            live_engine_on = bool(ff_data.get('engine_on')) if 'engine_on' in ff_data else bool(getattr(m, 'engine_on', False))
            live_rpm = _safe_float(ff_data.get('rpm'), getattr(m, 'rpm', None))
            live_coolant = _safe_float(ff_data.get('coolant_temp'), getattr(m, 'coolant_temp', None))
            live_oil = _safe_float(ff_data.get('oil_pressure'), getattr(m, 'oil_pressure', None))
            live_voltage = _safe_float(ff_data.get('supply_voltage'), getattr(m, 'supply_voltage', None))
            live_battery = _safe_float(ff_data.get('internal_battery_v'), getattr(m, 'internal_battery_v', None))
            gnss_valid = bool(ff_data['gnss_valid']) if ff_data.get('gnss_valid') is not None else None
            last_packet_at = ff_data.get('last_packet_at')
            location_updated_at = ff_data.get('location_updated_at')
            engine_hours_total = _safe_float(ff_data.get('engine_hours_total'), getattr(m, 'engine_hours', None))
            engine_hours_today = _safe_float(ff_data.get('engine_hours_today'), getattr(m, 'engine_hours_today', None))

            state_blob = f"{live_state} {live_state_label}".upper()
            if live_engine_on or any(w in state_blob for w in ['DRILL', 'WORK', 'RUN', 'MOVING', 'TRAVEL']):
                mapped_status = 'RUNNING'
            elif not live_online:
                mapped_status = 'OFFLINE'
            elif 'MAINT' in state_blob or status_upper == 'MAINTENANCE':
                mapped_status = 'MAINTENANCE'
            elif 'IDLE' in state_blob or 'PARK' in state_blob or 'BATTERY' in state_blob:
                mapped_status = 'IDLE'
            else:
                mapped_status = 'IDLE' if not live_engine_on else 'RUNNING'

            lat = live_lat if live_lat is not None else (
                last_telemetry.latitude if last_telemetry else (m.current_latitude or None)
            )
            lng = live_lng if live_lng is not None else (
                last_telemetry.longitude if last_telemetry else (m.current_longitude or None)
            )
            speed = live_speed if live_speed is not None else (
                last_telemetry.speed if last_telemetry else 0.0
            )
            course = live_course
            if course is None and last_telemetry and getattr(last_telemetry, 'heading', None) is not None:
                course = _safe_float(last_telemetry.heading, 0.0)
            if course is None:
                course = 0.0

            op_name = "—"
            if m.operator:
                if isinstance(m.operator, dict):
                    op_name = m.operator.get('name') or m.operator.get('username') or "—"
                elif isinstance(m.operator, str) and m.operator.strip():
                    op_name = m.operator.strip()
            elif m.filled_by:
                op_name = m.filled_by

            is_assigned = machine_matches_assigned(m, assigned_chassis)

            data.append({
                'id': m.id,
                'machine_id': m.id,
                'name': m.name,
                'serial_number': m.serial_number,
                'chassis_no': m.machine_chassis_no or m.serial_number,
                'machine_chassis_no': m.machine_chassis_no,
                'model_code': m.model_code,
                'model_name': m.model_name,
                'status': mapped_status,
                'state': live_state,
                'state_label': live_state_label,
                'engine_on': live_engine_on,
                'is_online': live_online,
                'is_commissioned': bool(m.is_commissioned),
                'is_vendor_assigned': is_assigned,
                'is_commissioned_tab': is_assigned,
                'site_name': m.site_name or m.location_name,
                'operator_name': op_name,
                'latitude': float(lat) if lat is not None else None,
                'longitude': float(lng) if lng is not None else None,
                'speed': float(speed or 0),
                'course_deg': float(course),
                'heading': float(course),
                'heading_label': _heading_label(course),
                'tilt': float(course),
                'fuel_level': live_fuel,
                'fuel_percentage': live_fuel_pct,
                'rpm': live_rpm,
                'coolant_temp': live_coolant,
                'oil_pressure': live_oil,
                'supply_voltage': live_voltage,
                'internal_battery_v': live_battery,
                'gnss_valid': gnss_valid,
                'last_packet_at': last_packet_at,
                'location_updated_at': location_updated_at,
                'engine_hours_total': engine_hours_total,
                'engine_hours_today': engine_hours_today,
                'runtime_str': m.runtime_str,
                'last_ping': last_packet_at or getattr(m, 'last_ping', None) or (
                    last_telemetry.timestamp if last_telemetry else m.updated_at
                ),
            })

        data.sort(key=lambda x: x['id'])
        commissioned_count = sum(1 for row in data if row.get('is_vendor_assigned'))
        meta = {
            'counts': {
                'ALL': len(data),
                'COMMISSIONED': commissioned_count,
                'WORKING': sum(1 for row in data if row.get('status') == 'RUNNING'),
                'IDLE': sum(1 for row in data if row.get('status') == 'IDLE'),
            }
        }
        # Light/map responses stay warm across dashboard remounts + Machines 60s poll
        ttl_set(cache_key, {'data': data, 'meta': meta}, ttl_seconds=45 if light else 25)
        return success_response(
            data=data,
            message="Live tracking telemetry fetched",
            meta=meta,
        )


class TelemetryViewSet(viewsets.ModelViewSet):
    queryset = TelemetryData.objects.all()
    serializer_class = TelemetryDataSerializer
    permission_classes = [permissions.AllowAny]
