from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import TelemetryData
from .serializers import TelemetryDataSerializer
from apps.common.responses import success_response


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
    """
    Live FiberForce tracking — reuses telemetry already loaded by
    fetch_live_fiberforce_machines (no second per-machine fan-out).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.machines.services import fetch_live_fiberforce_machines, machine_matches_assigned

        live = fetch_live_fiberforce_machines(user, request.query_params)
        machines = live.get('results') or live.get('all_items') or []
        if not isinstance(machines, list):
            machines = []
        assigned_chassis = set(live.get('assigned_chassis') or [])

        data = []
        for m in machines:
            if not isinstance(m, dict):
                continue
            chassis = str(m.get('machine_chassis_no') or m.get('serial_number') or '').strip()
            status_upper = str(m.get('status') or 'RUNNING').upper()

            live_lat = _safe_float(m.get('latitude') or m.get('current_latitude'))
            live_lng = _safe_float(m.get('longitude') or m.get('current_longitude'))
            live_online = bool(m.get('is_online', True))
            live_fuel = float(m.get('current_fuel_level') or 0)
            live_fuel_pct = m.get('fuel_percentage')
            live_state = status_upper
            live_state_label = m.get('state_label') or ''
            live_engine_on = bool(m.get('engine_on', False))
            live_rpm = m.get('rpm')
            live_coolant = m.get('coolant_temp')
            live_oil = m.get('oil_pressure')
            live_voltage = m.get('supply_voltage')
            live_battery = m.get('internal_battery_v')
            last_packet_at = m.get('last_ping')
            engine_hours_total = m.get('engine_hours')
            engine_hours_today = m.get('engine_hours_today')

            state_blob = f"{live_state} {live_state_label}".upper()
            if live_engine_on or any(w in state_blob for w in ['DRILL', 'WORK', 'RUN', 'MOVING', 'TRAVEL']):
                mapped_status = 'RUNNING'
            elif not live_online:
                mapped_status = 'OFFLINE'
            elif 'MAINT' in state_blob or status_upper == 'MAINTENANCE':
                mapped_status = 'MAINTENANCE'
            else:
                mapped_status = 'IDLE'

            op = m.get('operator')
            op_name = m.get('operator_name') or '—'
            if isinstance(op, dict):
                op_name = op.get('name') or op.get('username') or op_name

            mid = m.get('id') or chassis
            data.append({
                'id': mid,
                'machine_id': mid,
                'name': m.get('name'),
                'serial_number': m.get('serial_number') or chassis,
                'chassis_no': chassis,
                'machine_chassis_no': chassis,
                'model_code': m.get('model_code'),
                'model_name': m.get('model_name'),
                'status': mapped_status,
                'state': live_state,
                'state_label': live_state_label,
                'engine_on': live_engine_on,
                'is_online': live_online,
                'is_commissioned': bool(m.get('is_commissioned')),
                'is_vendor_assigned': machine_matches_assigned(m, assigned_chassis),
                'is_commissioned_tab': machine_matches_assigned(m, assigned_chassis),
                'site_name': m.get('site_name') or m.get('location_name'),
                'operator_name': op_name,
                'latitude': float(live_lat) if live_lat is not None else None,
                'longitude': float(live_lng) if live_lng is not None else None,
                'speed': 0.0,
                'course_deg': 0.0,
                'heading': 0.0,
                'heading_label': '—',
                'tilt': 0.0,
                'fuel_level': live_fuel,
                'fuel_percentage': live_fuel_pct,
                'rpm': live_rpm,
                'coolant_temp': live_coolant,
                'oil_pressure': live_oil,
                'supply_voltage': live_voltage,
                'internal_battery_v': live_battery,
                'gnss_valid': None,
                'last_packet_at': last_packet_at,
                'location_updated_at': None,
                'engine_hours_total': engine_hours_total,
                'engine_hours_today': engine_hours_today,
                'runtime_str': m.get('runtime_str'),
                'last_ping': last_packet_at or m.get('last_ping'),
            })

        data.sort(key=lambda x: str(x.get('id') or ''))
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
    """Proxy-only: no local telemetry persistence."""
    queryset = TelemetryData.objects.none()
    serializer_class = TelemetryDataSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return TelemetryData.objects.none()

    def list(self, request, *args, **kwargs):
        return Response({"success": True, "count": 0, "results": []})

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Telemetry is live from FiberForce (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
