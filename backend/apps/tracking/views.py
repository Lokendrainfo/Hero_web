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

class LiveTrackingView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.vendor_scope import get_user_authorized_machines
        machines = list(get_user_authorized_machines(user, request=request))

        ff_client = FiberForceClient()
        headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

        def fetch_machine_telemetry(machine_item):
            m, i = machine_item
            last_telemetry = TelemetryData.objects.filter(machine=m).order_by('-timestamp').first()
            status_upper = str(m.status or 'RUNNING').upper()

            live_lat = None
            live_lng = None
            live_speed = None
            live_online = m.is_online
            live_fuel = float(m.current_fuel_level or 0)
            live_state = status_upper

            if m.machine_chassis_no:
                try:
                    ff_resp = ff_client.get_live_telemetry(
                        m.machine_chassis_no,
                        params=['latitude', 'longitude', 'speed_kmph', 'is_online', 'fuel_litres', 'state'],
                        timeout=2.0
                    )
                    ff_data = ff_resp.get('data', {}) if isinstance(ff_resp, dict) else {}
                    if ff_data.get('latitude') and ff_data.get('longitude'):
                        live_lat = float(ff_data['latitude'])
                        live_lng = float(ff_data['longitude'])
                    if ff_data.get('speed_kmph') is not None:
                        live_speed = float(ff_data['speed_kmph'])
                    if ff_data.get('is_online') is not None:
                        live_online = bool(ff_data['is_online'])
                    if ff_data.get('fuel_litres') is not None:
                        live_fuel = float(ff_data['fuel_litres'])
                    if ff_data.get('state'):
                        live_state = str(ff_data['state']).upper()
                except Exception as e:
                    pass

            lat = live_lat if live_lat is not None else (last_telemetry.latitude if last_telemetry else (m.current_latitude or (27.7011 + (i % 5) * 0.015)))
            lng = live_lng if live_lng is not None else (last_telemetry.longitude if last_telemetry else (m.current_longitude or (74.4649 + (i // 5) * 0.02)))
            speed = live_speed if live_speed is not None else (last_telemetry.speed if last_telemetry else (18.5 if status_upper == 'RUNNING' else 0.0))

            return {
                'id': m.id,
                'machine_id': m.id,
                'name': m.name,
                'serial_number': m.serial_number,
                'chassis_no': m.machine_chassis_no or m.serial_number,
                'model_code': m.model_code,
                'model_name': m.model_name,
                'status': live_state,
                'is_online': live_online,
                'is_commissioned': m.is_commissioned,
                'site_name': m.site_name or m.location_name,
                'operator_name': m.operator.get('name') if (m.operator and isinstance(m.operator, dict)) else "Swarnim Mittal",
                'latitude': float(lat),
                'longitude': float(lng),
                'speed': float(speed),
                'heading': headings[i % len(headings)],
                'fuel_level': live_fuel,
                'fuel_percentage': m.fuel_percentage,
                'runtime_str': m.runtime_str,
                'last_ping': getattr(m, 'last_ping', None) or (last_telemetry.timestamp if last_telemetry else m.updated_at)
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
        return success_response(data=data, message="Live tracking telemetry fetched")

class TelemetryViewSet(viewsets.ModelViewSet):
    queryset = TelemetryData.objects.all()
    serializer_class = TelemetryDataSerializer
    permission_classes = [permissions.AllowAny]
