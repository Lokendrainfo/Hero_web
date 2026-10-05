import re
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.renderers import JSONRenderer
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.common.task_scope import get_user_authorized_tasks
from .bharatnet_auth import BharatNetBasicAuthentication
from .bharatnet_token import generate_bharatnet_live_token, verify_bharatnet_live_token
from .ilync_client import IlyncClient

logger = logging.getLogger(__name__)

# Indian Standard Time (UTC+05:30)
IST = timezone(timedelta(hours=5, minutes=30))


def parse_capture_timestamp_to_ist(c_at):
    """
    Authoritative timestamp parsing for depth capture.
    Parses hardware depthometer capture epoch timestamp (ms) or formatted string to an IST datetime object.
    Never uses ingestion or server processing time.
    """
    if not c_at:
        return None
    try:
        # Numeric epoch timestamp in milliseconds or seconds
        if isinstance(c_at, (int, float)):
            sec = float(c_at / 1000.0 if c_at > 1e11 else c_at)
            return datetime.fromtimestamp(sec, tz=IST)

        val_str = str(c_at).strip()
        if not val_str or val_str in ['N/A', '—']:
            return None

        if val_str.isdigit():
            sec = float(float(val_str) / 1000.0 if float(val_str) > 1e11 else float(val_str))
            return datetime.fromtimestamp(sec, tz=IST)

        # DD-MM-YYYY HH:MM:SS format
        m = re.match(r'^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?', val_str)
        if m:
            dd, mm, yyyy, h, mnt, sec = m.groups()
            return datetime(int(yyyy), int(mm), int(dd), int(h or 0), int(mnt or 0), int(sec or 0), tzinfo=IST)

        # Standard ISO 8601 string
        clean_iso = val_str.replace('Z', '+00:00')
        dt = datetime.fromisoformat(clean_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=IST)
        else:
            dt = dt.astimezone(IST)
        return dt
    except Exception:
        return None


class BharatNetTDMonitoringView(APIView):
    """
    BharatNet Phase-3 T&D Monitoring API Endpoint.
    Specification: T&D Monitoring API Integration Specification, Version 1.0, dated 7 June 2026.
    Endpoint: GET /api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02
    """
    authentication_classes = [JWTAuthentication, BharatNetBasicAuthentication]
    renderer_classes = [JSONRenderer]

    def handle_exception(self, exc):
        if isinstance(exc, AuthenticationFailed):
            return Response(
                {
                    "status": "ERROR",
                    "message": "Invalid or missing Basic authentication credentials"
                },
                status=status.HTTP_401_UNAUTHORIZED,
                headers={"WWW-Authenticate": 'Basic realm="T&D Monitoring"'}
            )
        from rest_framework import exceptions
        if isinstance(exc, exceptions.MethodNotAllowed):
            return Response(
                {
                    "status": "ERROR",
                    "message": f"Method not allowed."
                },
                status=status.HTTP_405_METHOD_NOT_ALLOWED
            )
        if isinstance(exc, exceptions.APIException):
            return super().handle_exception(exc)
        logger.exception("[T&D API] Unexpected exception in td-monitoring")
        return Response(
            {
                "status": "ERROR",
                "message": "An error occurred while processing the T&D monitoring request."
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    def get(self, request):
        # 1. Circle & State filter (case-insensitive)
        circle_param = (
            request.query_params.get('circle')
            or request.query_params.get('state')
            or ''
        ).strip()

        # Optional district, block, and user filters
        district_param = (request.query_params.get('district') or '').strip().upper()
        block_param = (request.query_params.get('block') or '').strip().upper()
        user_param = (request.query_params.get('userId') or request.query_params.get('user_id') or '').strip().upper()

        # 2. Date parameter validation
        date_param = (request.query_params.get('date') or '').strip()
        date_from_param = (request.query_params.get('date_from') or '').strip()
        date_to_param = (request.query_params.get('date_to') or '').strip()

        # If date parameter is missing, default to date_from or today's date in IST
        now_ist = datetime.now(IST)
        if not date_param:
            if date_from_param:
                date_param = date_from_param
            else:
                date_param = now_ist.strftime('%Y-%m-%d')

        # Validate date format YYYY-MM-DD
        try:
            target_date_dt = datetime.strptime(date_param, '%Y-%m-%d')
        except ValueError:
            return Response(
                {
                    "status": "ERROR",
                    "message": f"Invalid date format: '{date_param}'. Expected YYYY-MM-DD format."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Do not return future timestamps if date is strictly in the future
        if target_date_dt.date() > now_ist.date():
            return Response(
                {
                    "status": "OK",
                    "message": f"0 blocks reported captures on {date_param}",
                    "results": {
                        "circles": []
                    }
                },
                status=status.HTTP_200_OK
            )

        # 3. Security: Check circle authorization for this service account
        service_user = request.user
        if hasattr(service_user, 'is_circle_allowed') and circle_param:
            if not service_user.is_circle_allowed(circle_param):
                return Response(
                    {
                        "status": "ERROR",
                        "message": f"Access denied for requested circle: '{circle_param}'."
                    },
                    status=status.HTTP_403_FORBIDDEN
                )

        # 4. Fetch live task hierarchy directly using existing architecture
        extra_params = {
            'live': 'true',
            'telemetry': 'true'
        }

        is_bharatnet_service = (
            getattr(request.user, 'role', '') == 'BHARATNET_SERVICE'
            or getattr(request.user, 'username', '') == 'bharatnet_service'
        )
        task_user_scope = None if is_bharatnet_service else request.user

        scoped_tasks = get_user_authorized_tasks(
            user=task_user_scope,
            request=request,
            task_type='FIBER_TRENCHING_DUCTING_TASK',
            page=0,
            size=500,
            extra_params=extra_params,
            expand_hierarchy=True,
            include_telemetry=True
        )

        tasks = scoped_tasks.get('results', []) if isinstance(scoped_tasks, dict) else []

        # 5. Extract depth captures for the requested date and circle
        req_circle_upper = circle_param.upper() if circle_param else None

        # Data structure: hierarchy[circle_name][district_name][block_name] -> dict of key -> latest_record
        hierarchy = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
        hero_base_url = getattr(settings, 'HERO_PUBLIC_URL', 'https://hero.pramaanu.co.in').rstrip('/')

        for t in tasks:
            loc = t.get('location') or t.get('locationSnapshot') or {}
            task_circle = str(loc.get('circle') or t.get('circle') or loc.get('state') or t.get('state') or 'RAJASTHAN').strip()
            task_district = str(loc.get('district') or t.get('district') or 'OTHER').strip()
            task_block = str(loc.get('blockName') or loc.get('block') or t.get('block') or 'OTHER').strip()

            # Circle filtering (case-insensitive)
            if req_circle_upper and task_circle.upper() != req_circle_upper:
                continue

            # District & Block filtering
            if district_param and task_district.upper() != district_param:
                continue
            if block_param and task_block.upper() != block_param:
                continue

            ex = t.get('taskExecution') if isinstance(t.get('taskExecution'), dict) else {}
            fd = ex.get('fieldData') if isinstance(ex.get('fieldData'), dict) else {}
            tr = fd.get('trenching') if isinstance(fd.get('trenching'), dict) else {}
            shots = tr.get('hddShot') if isinstance(tr.get('hddShot'), list) else []

            mach = tr.get('trenchingMachineDetails') if isinstance(tr.get('trenchingMachineDetails'), dict) else {}
            machine_id = str(mach.get('machineId') or t.get('machineId') or 'HDD-001').strip()

            op = tr.get('operatorDetails') if isinstance(tr.get('operatorDetails'), dict) else {}
            op_name = str(op.get('name') or t.get('assigneeName') or 'Operator').strip()
            op_id = str(t.get('assigneeUserId') or op.get('id') or op.get('userId') or t.get('taskCode') or 'OP-001').strip()
            task_id = str(t.get('id') or t.get('taskCode') or '')

            # User filter
            if user_param and op_id.upper() != user_param and op_name.upper() != user_param:
                continue

            # Each machine or operator key within this block
            group_key = f"{machine_id}_{op_id}"

            for s in shots:
                if not isinstance(s, dict):
                    continue
                dps = s.get('depthCapture') or []
                for dp in dps:
                    if not isinstance(dp, dict):
                        continue
                    depth_val = dp.get('depth')
                    if depth_val is None:
                        continue
                    try:
                        depth_meters = round(float(depth_val), 2)
                    except (ValueError, TypeError):
                        continue

                    # Authoritative device timestamp
                    img = dp.get('depthoMeterImage') if isinstance(dp.get('depthoMeterImage'), dict) else {}
                    c_at_raw = img.get('capturedAt') or dp.get('capturedAt') or dp.get('depthCaptureStartTime')
                    cap_dt = parse_capture_timestamp_to_ist(c_at_raw)
                    if not cap_dt:
                        continue

                    # Do not return future timestamps
                    if cap_dt > now_ist:
                        continue

                    # Check capture date matches requested date
                    cap_date_str = cap_dt.strftime('%Y-%m-%d')
                    if cap_date_str != date_param:
                        # Also check date range if date_from and date_to are provided
                        if date_from_param and date_to_param:
                            if cap_date_str < date_from_param or cap_date_str > date_to_param:
                                continue
                        else:
                            continue

                    # ISO 8601 timestamp with +05:30
                    iso_time = cap_dt.strftime('%Y-%m-%dT%H:%M:%S+05:30')

                    # Check if this is later than currently recorded capture for this operator/machine
                    existing = hierarchy[task_circle][task_district][task_block].get(group_key)
                    if not existing or cap_dt > existing['_dt']:
                        secure_token = generate_bharatnet_live_token(
                            task_id=task_id,
                            machine_id=machine_id,
                            user_id=op_id,
                            date_str=date_param
                        )
                        from urllib.parse import quote_plus
                        dynamic_map_url = (
                            f"{hero_base_url}/map-view/{task_id}?"
                            f"userId={quote_plus(str(op_id or ''))}&"
                            f"userName={quote_plus(str(op_name or ''))}&"
                            f"block={quote_plus(str(task_block or ''))}&"
                            f"district={quote_plus(str(task_district or ''))}&"
                            f"state={quote_plus(str(task_circle or ''))}&"
                            f"date={quote_plus(str(date_param or ''))}&"
                            f"mode=user"
                        )

                        dp_lat = (
                            dp.get('latitude')
                            or img.get('latitude')
                            or s.get('latitude')
                            or loc.get('latitude')
                        )
                        dp_lng = (
                            dp.get('longitude')
                            or img.get('longitude')
                            or s.get('longitude')
                            or loc.get('longitude')
                        )
                        try:
                            dp_lat = float(dp_lat) if dp_lat is not None else None
                            dp_lng = float(dp_lng) if dp_lng is not None else None
                        except (ValueError, TypeError):
                            dp_lat = None
                            dp_lng = None

                        if (dp_lat is None or dp_lat == 0) and tr.get('pitDetails'):
                            pits_list = tr.get('pitDetails')
                            if isinstance(pits_list, list) and len(pits_list) > 0 and isinstance(pits_list[0], dict):
                                try:
                                    dp_lat = float(pits_list[0].get('latitude')) if pits_list[0].get('latitude') is not None else None
                                    dp_lng = float(pits_list[0].get('longitude')) if pits_list[0].get('longitude') is not None else None
                                except (ValueError, TypeError):
                                    pass

                        hierarchy[task_circle][task_district][task_block][group_key] = {
                            '_dt': cap_dt,
                            'url': f"{hero_base_url}/live-view/{secure_token}",
                            'map_url': dynamic_map_url,
                            'lastDepthCapturedAt': iso_time,
                            'userName': op_name,
                            'userId': op_id,
                            'machineId': machine_id,
                            'depthMeters': depth_meters,
                            'latitude': dp_lat,
                            'longitude': dp_lng,
                            'state': task_circle,
                            'district': task_district,
                            'block': task_block,
                        }

        # 6. Build Schema A output
        circles_list = []
        total_blocks_count = 0

        for c_name in sorted(hierarchy.keys()):
            districts_list = []
            for d_name in sorted(hierarchy[c_name].keys()):
                blocks_list = []
                for b_name in sorted(hierarchy[c_name][d_name].keys()):
                    users_dict = hierarchy[c_name][d_name][b_name]
                    if not users_dict:
                        continue
                    total_blocks_count += 1
                    # Extract latest record per operator/machine, sorted by latest capture
                    sorted_records = sorted(
                        users_dict.values(),
                        key=lambda x: x['_dt'],
                        reverse=True
                    )
                    user_urls = []
                    for rec in sorted_records:
                        clean_rec = dict(rec)
                        clean_rec.pop('_dt', None)
                        user_urls.append(clean_rec)

                    blocks_list.append({
                        "block_name": b_name,
                        "user_urls": user_urls
                    })

                if blocks_list:
                    districts_list.append({
                        "district_name": d_name,
                        "blocks": blocks_list
                    })

            if districts_list:
                circles_list.append({
                    "circle_name": c_name,
                    "districts": districts_list
                })

        return Response(
            {
                "status": "OK",
                "message": f"{total_blocks_count} blocks reported captures on {date_param}",
                "results": {
                    "circles": circles_list
                }
            },
            status=status.HTTP_200_OK
        )


class BharatNetLiveViewAPIView(APIView):
    """
    Secure Read-Only Live View Data API for BharatNet Phase-3 integration.
    Validates token and returns sanitized GIS execution data (paths, pits, depth graph)
    without exposing operator phone numbers, PII, or internal credentials.
    """
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request, token):
        token_data = verify_bharatnet_live_token(token)
        if not token_data:
            return Response(
                {"status": "ERROR", "message": "Invalid, expired, or tampered live-view token."},
                status=status.HTTP_403_FORBIDDEN
            )

        task_id = token_data.get('tid')
        date_str = token_data.get('d')
        machine_id = token_data.get('m')
        user_id = token_data.get('u')

        client = IlyncClient(request=request)
        exec_data = None
        try:
            res = client.get_task_execution(task_id)
            if res and isinstance(res, dict) and res.get('data'):
                exec_data = res.get('data')
        except Exception as e:
            logger.warning(f"[BharatNetLiveView] Task execution lookup failed for {task_id}: {e}")

        # Task detail snapshot
        task_detail = None
        try:
            td_res = client.get_task_by_id(task_id)
            if td_res and isinstance(td_res, dict) and td_res.get('data'):
                task_detail = td_res.get('data')
        except Exception:
            pass

        loc = (task_detail or {}).get('location') or (task_detail or {}).get('locationSnapshot') or {}
        fd = (exec_data or {}).get('fieldData') or {}
        tr = fd.get('trenching') or {}

        # Sanitize depth captures and pits
        sanitized_shots = []
        shots = tr.get('hddShot') if isinstance(tr.get('hddShot'), list) else []
        for s in shots:
            if not isinstance(s, dict):
                continue
            dps = s.get('depthCapture') or []
            sanitized_dps = []
            for dp in dps:
                if not isinstance(dp, dict):
                    continue
                img = dp.get('depthoMeterImage') if isinstance(dp.get('depthoMeterImage'), dict) else {}
                c_at = img.get('capturedAt') or dp.get('capturedAt')
                cap_dt = parse_capture_timestamp_to_ist(c_at)
                iso_str = cap_dt.strftime('%Y-%m-%dT%H:%M:%S+05:30') if cap_dt else None

                sanitized_dps.append({
                    'depth': dp.get('depth'),
                    'capturedAt': iso_str,
                    'latitude': dp.get('latitude') or img.get('latitude'),
                    'longitude': dp.get('longitude') or img.get('longitude'),
                    'offset': dp.get('offsetFromCenterOfRoad'),
                })
            sanitized_shots.append({
                'shotName': s.get('hddShotName'),
                'lengthMeters': s.get('tentativeShotLength') or s.get('lengthMeters'),
                'depthCaptures': sanitized_dps
            })

        sanitized_pits = []
        pits = tr.get('pitDetails') if isinstance(tr.get('pitDetails'), list) else []
        for p in pits:
            if not isinstance(p, dict):
                continue
            sanitized_pits.append({
                'pitName': p.get('pitName') or p.get('pitSerialNo'),
                'latitude': p.get('latitude'),
                'longitude': p.get('longitude'),
                'type': p.get('pitType'),
            })

        return Response({
            "status": "OK",
            "data": {
                "taskId": task_id,
                "taskCode": (task_detail or {}).get('taskCode'),
                "circle": loc.get('circle') or 'RAJASTHAN',
                "district": loc.get('district') or 'OTHER',
                "block": loc.get('blockName') or loc.get('block') or 'OTHER',
                "machineId": machine_id,
                "userId": user_id,
                "date": date_str,
                "shots": sanitized_shots,
                "pits": sanitized_pits,
            }
        }, status=status.HTTP_200_OK)
