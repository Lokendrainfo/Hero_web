from rest_framework import viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import TelemetryData
from .serializers import TelemetryDataSerializer
from apps.machines.models import Machine
from apps.common.responses import success_response
from apps.integrations.fiberforce.client import FiberForceClient

from django.db.models import Q

from apps.common.vendor_scope import filter_queryset_by_vendor

from concurrent.futures import ThreadPoolExecutor, as_completed


LIVE_TRACKING_PARAMS = [
    'latitude', 'longitude', 'speed_kmph', 'course_deg',
    'is_online', 'telemetry_online', 'fuel_litres', 'fuel_pct',
    'state', 'state_label', 'engine_on', 'rpm',
    'coolant_temp', 'oil_pressure', 'supply_voltage', 'internal_battery_v',
    'gnss_valid', 'last_packet_at', 'location_updated_at',
    'engine_hours_total', 'engine_hours_today',
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


class LiveTrackingView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.vendor_scope import get_user_authorized_machines
        from apps.machines.services import collect_ilync_assigned_chassis, machine_matches_assigned
        from apps.vendors.models import Vendor
        from apps.common.vendor_scope import get_user_vendor_ids

        machines = list(get_user_authorized_machines(user, request=request))

        # Commissioned = vendor-assigned on iLync (same as Machines tab)
        allowed_vendor_ids = get_user_vendor_ids(user) if user else None
        v_qs = Vendor.objects.filter(is_active=True)
        if allowed_vendor_ids is not None:
            v_qs = v_qs.filter(id__in=allowed_vendor_ids)
        req_v = request.query_params.get('vendor_id') or request.query_params.get('vendor')
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            v_filter = Q(external_vendor_id=req_v) | Q(name__iexact=req_v)
            if str(req_v).isdigit():
                v_filter |= Q(id=int(req_v))
            v_qs = v_qs.filter(v_filter)
        assigned_chassis = collect_ilync_assigned_chassis(list(v_qs))

        ff_client = FiberForceClient()

        def fetch_machine_telemetry(machine_item):
            m, i = machine_item
            last_telemetry = TelemetryData.objects.filter(machine=m).order_by('-timestamp').first()
            status_upper = str(m.status or 'RUNNING').upper()

            live_lat = None
            live_lng = None
            live_speed = None
            live_course = None
            live_online = m.is_online
            live_fuel = float(m.current_fuel_level or 0)
            live_fuel_pct = m.fuel_percentage
            live_state = status_upper
            live_state_label = getattr(m, 'state_label', None) or ''
            live_engine_on = bool(getattr(m, 'engine_on', False))
            live_rpm = getattr(m, 'rpm', None)
            live_coolant = getattr(m, 'coolant_temp', None)
            live_oil = getattr(m, 'oil_pressure', None)
            live_voltage = getattr(m, 'supply_voltage', None)
            live_battery = getattr(m, 'internal_battery_v', None)
            gnss_valid = None
            last_packet_at = None
            location_updated_at = None
            engine_hours_total = getattr(m, 'engine_hours', None)
            engine_hours_today = getattr(m, 'engine_hours_today', None)

            if m.machine_chassis_no:
                try:
                    ff_resp = ff_client.get_live_telemetry(
                        m.machine_chassis_no,
                        params=LIVE_TRACKING_PARAMS,
                        timeout=2.5,
                    )
                    ff_data = ff_resp.get('data', {}) if isinstance(ff_resp, dict) else {}
                    if not isinstance(ff_data, dict):
                        ff_data = {}

                    if ff_data.get('latitude') is not None and ff_data.get('longitude') is not None:
                        live_lat = _safe_float(ff_data.get('latitude'))
                        live_lng = _safe_float(ff_data.get('longitude'))
                    if ff_data.get('speed_kmph') is not None:
                        live_speed = _safe_float(ff_data.get('speed_kmph'), 0.0)
                    if ff_data.get('course_deg') is not None:
                        live_course = _safe_float(ff_data.get('course_deg'), 0.0)
                    if ff_data.get('is_online') is not None:
                        live_online = bool(ff_data.get('is_online'))
                    elif ff_data.get('telemetry_online') is not None:
                        live_online = bool(ff_data.get('telemetry_online'))
                    if ff_data.get('fuel_litres') is not None:
                        live_fuel = _safe_float(ff_data.get('fuel_litres'), live_fuel)
                    if ff_data.get('fuel_pct') is not None:
                        live_fuel_pct = int(_safe_float(ff_data.get('fuel_pct'), live_fuel_pct or 0) or 0)
                    if ff_data.get('state'):
                        live_state = str(ff_data.get('state')).upper()
                    if ff_data.get('state_label'):
                        live_state_label = str(ff_data.get('state_label'))
                    if ff_data.get('engine_on') is not None:
                        live_engine_on = bool(ff_data.get('engine_on'))
                    if ff_data.get('rpm') is not None:
                        live_rpm = _safe_float(ff_data.get('rpm'))
                    if ff_data.get('coolant_temp') is not None:
                        live_coolant = _safe_float(ff_data.get('coolant_temp'))
                    if ff_data.get('oil_pressure') is not None:
                        live_oil = _safe_float(ff_data.get('oil_pressure'))
                    if ff_data.get('supply_voltage') is not None:
                        live_voltage = _safe_float(ff_data.get('supply_voltage'))
                    if ff_data.get('internal_battery_v') is not None:
                        live_battery = _safe_float(ff_data.get('internal_battery_v'))
                    if ff_data.get('gnss_valid') is not None:
                        gnss_valid = bool(ff_data.get('gnss_valid'))
                    last_packet_at = ff_data.get('last_packet_at')
                    location_updated_at = ff_data.get('location_updated_at')
                    if ff_data.get('engine_hours_total') is not None:
                        engine_hours_total = _safe_float(ff_data.get('engine_hours_total'))
                    if ff_data.get('engine_hours_today') is not None:
                        engine_hours_today = _safe_float(ff_data.get('engine_hours_today'))
                except Exception:
                    pass

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
                try:
                    course = float(last_telemetry.heading)
                except (TypeError, ValueError):
                    course = 0.0
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

            return {
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
                'tilt': float(course),  # map arrow tilt = course degrees
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
            }

        data = []
        if machines:
            with ThreadPoolExecutor(max_workers=min(len(machines), 15)) as executor:
                futures = [executor.submit(fetch_machine_telemetry, (m, i)) for i, m in enumerate(machines)]
                for future in as_completed(futures):
                    try:
                        data.append(future.result())
                    except Exception as e:
                        print(f"[LiveTrackingView] Telemetry worker error: {e}")

        data.sort(key=lambda x: x['id'])
        commissioned_count = sum(1 for row in data if row.get('is_vendor_assigned'))
        return success_response(
            data=data,
            message="Live tracking telemetry fetched",
            meta={
                'counts': {
                    'ALL': len(data),
                    'COMMISSIONED': commissioned_count,
                    'WORKING': sum(1 for row in data if row.get('status') == 'RUNNING'),
                    'IDLE': sum(1 for row in data if row.get('status') == 'IDLE'),
                }
            },
        )


class TelemetryViewSet(viewsets.ModelViewSet):
    queryset = TelemetryData.objects.all()
    serializer_class = TelemetryDataSerializer
    permission_classes = [permissions.AllowAny]
