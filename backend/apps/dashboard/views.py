from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from django.db.models import Avg, Q, Sum
from django.utils import timezone
from rest_framework import permissions
from rest_framework.views import APIView

from apps.alerts.models import Alert
from apps.common.responses import success_response
from apps.common.vendor_scope import filter_queryset_by_vendor, get_user_vendor_ids
from apps.machines.models import Machine


def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


MACHINE_ATTENDANCE_PRESENT = {
    'PRESENT', 'CHECKED_IN', 'CHECKED_OUT', 'OPERATING', 'WORKING',
}


def _unique_chassis(values):
    seen = []
    for raw in values or []:
        code = str(raw or '').strip()
        if code and code not in seen:
            seen.append(code)
    return seen


def _row_started_shift(row):
    if not isinstance(row, dict):
        return False
    if row.get('actual_work_start_at') or row.get('actual_work_start_time'):
        return True
    key = str(row.get('attendance_key') or '').strip().lower()
    if key in ('present', 'late_punch_in'):
        return True
    return str(row.get('status') or '').strip().lower() == 'present'


def _extract_chassis_from_payload(payload):
    assigned = []
    macs = (payload or {}).get('machines') or (payload or {}).get('assigned_machines') or []
    if not isinstance(macs, list):
        return assigned
    for item in macs:
        if isinstance(item, dict):
            code = str(
                item.get('machineNo')
                or item.get('machine_no')
                or item.get('machine_chassis_no')
                or item.get('serial_number')
                or item.get('chassis_no')
                or item.get('name')
                or item.get('code')
                or item.get('id')
                or ''
            ).strip()
        elif isinstance(item, str):
            code = item.strip()
        else:
            code = ''
        if code and code not in assigned:
            assigned.append(code)
    return assigned


def _fetch_ilync_vendor_payloads(vendors):
    from apps.integrations.ilync_client import IlyncClient

    vendors = list(vendors or [])
    if not vendors:
        return []

    def _one(v_obj):
        ext_v_id = getattr(v_obj, 'external_vendor_id', None) or getattr(v_obj, 'id', None)
        payload = {}
        if not ext_v_id:
            return v_obj, payload
        try:
            live_res = IlyncClient(timeout=(2.5, 6.0)).get_vendor_by_id(ext_v_id)
        except Exception:
            live_res = None
        payload = (
            live_res.get('data')
            if (isinstance(live_res, dict) and live_res.get('success'))
            else (live_res if isinstance(live_res, dict) else {})
        )
        if not isinstance(payload, dict):
            payload = {}
        return v_obj, payload

    workers = min(8, max(1, len(vendors)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(_one, vendors))


def _ff_row_is_running(item):
    if not isinstance(item, dict):
        return False
    try:
        rpm = int(item.get('rpm') or 0)
    except (TypeError, ValueError):
        rpm = 0
    state = str(item.get('state') or item.get('state_label') or item.get('status') or '').upper()
    engine_on = bool(item.get('engine_on')) or rpm > 0
    return engine_on or state in (
        'RUNNING', 'WORKING', 'WORKING_RPM_LIMIT', 'DRILLING', 'MOVING',
    )


def _ff_list_has_live_signals(ff_machines):
    for item in ff_machines or []:
        if not isinstance(item, dict):
            continue
        if item.get('rpm') is not None or item.get('engine_on') is not None:
            return True
        if item.get('state') or item.get('state_label'):
            return True
    return False


def _commissioned_machine_kpis(att_date, assigned_chassis, ff_machines=None, att_res=None):
    """
    Total = Machines "Commissioned" tab: FiberForce machines that are vendor-assigned on iLync.
    Not raw iLync machine list length (that can include IDs not present on FiberForce).
    Pass att_res to avoid a second FiberForce fleet-attendance round-trip.
    """
    assigned_set = set(_unique_chassis(assigned_chassis))
    chassis_list = []
    commissioned_rows = []
    for m in (ff_machines or []):
        if not isinstance(m, dict):
            continue
        chassis = str(m.get('machine_chassis_no') or '').strip()
        if not chassis or chassis not in assigned_set:
            continue
        if chassis in chassis_list:
            continue
        chassis_list.append(chassis)
        commissioned_rows.append(m)

    if not chassis_list:
        chassis_list = _unique_chassis(assigned_chassis)

    commissioned = len(chassis_list)
    running = 0
    actual_shift = 0
    actual_shift_total = commissioned
    machine_attendance_present = 0
    machine_attendance_total = commissioned

    if commissioned_rows and _ff_list_has_live_signals(ff_machines):
        running = sum(1 for m in commissioned_rows if _ff_row_is_running(m))
    elif chassis_list:
        running = Machine.objects.filter(
            Q(machine_chassis_no__in=chassis_list) | Q(serial_number__in=chassis_list),
            status='RUNNING',
        ).count()

    if chassis_list:
        try:
            if att_res is None:
                from apps.integrations.fiberforce.client import FiberForceClient
                att_res = FiberForceClient().get_fleet_attendance_today(chassis_list)
            att_data = att_res.get('data') if isinstance(att_res, dict) else {}
            if not isinstance(att_data, dict):
                att_data = {}
            rows = att_data.get('machines') if isinstance(att_data.get('machines'), list) else []
            counts = att_data.get('counts') if isinstance(att_data.get('counts'), dict) else {}
            if rows:
                actual_shift = sum(1 for row in rows if _row_started_shift(row))
            else:
                actual_shift = int(counts.get('present') or 0) + int(counts.get('late_punch_in') or 0)
        except Exception as exc:
            print("[Dashboard] FiberForce fleet attendance error:", exc)

        try:
            from apps.attendance.models import AttendanceRecord
            present_keys = set()
            recs = AttendanceRecord.objects.filter(
                date=att_date,
                attendance_type='MACHINE',
            ).filter(
                Q(machine_chassis_no__in=chassis_list) | Q(machine_id__in=chassis_list)
            )
            for rec in recs:
                st = str(rec.status or '').upper().replace(' ', '_')
                if st not in MACHINE_ATTENDANCE_PRESENT:
                    continue
                key = str(rec.machine_chassis_no or rec.machine_id or '').strip()
                if key:
                    present_keys.add(key)
            machine_attendance_present = len(present_keys)
        except Exception as exc:
            print("[Dashboard] Machine attendance KPI error:", exc)

    return {
        'commissioned': commissioned,
        'running': running,
        'actual_shift': actual_shift,
        'actual_shift_total': actual_shift_total,
        'machine_attendance_present': machine_attendance_present,
        'machine_attendance_total': machine_attendance_total,
        'chassis_list': chassis_list,
    }


def _quick_commissioned_chassis(assigned_chassis, ff_machines=None):
    assigned_set = set(_unique_chassis(assigned_chassis))
    chassis_list = []
    for m in (ff_machines or []):
        if not isinstance(m, dict):
            continue
        chassis = str(m.get('machine_chassis_no') or '').strip()
        if chassis and chassis in assigned_set and chassis not in chassis_list:
            chassis_list.append(chassis)
    return chassis_list or _unique_chassis(assigned_chassis)


class DashboardSummaryView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from apps.common.ttl_cache import ttl_get, ttl_set
        from apps.common.responses import error_response

        try:
            return self._build_summary(request, ttl_get, ttl_set)
        except Exception as exc:
            print(f"[Dashboard] summary failed: {exc}")
            return error_response(
                message="Unable to load dashboard summary right now. Please retry.",
                errors={"detail": str(exc)},
                status_code=503,
            )

    def _build_summary(self, request, ttl_get, ttl_set):
        user = request.user
        user_name = (
            (user.get_full_name() or user.username)
            if getattr(user, 'is_authenticated', False)
            else "Operations Manager"
        )
        q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))

        req_v = q_params.get('vendor_id') or q_params.get('vendor')
        date_param = q_params.get('date') or ''
        cache_key = (
            f"dashboard:summary:"
            f"{getattr(user, 'id', 'anon')}:"
            f"{req_v or 'all'}:"
            f"{date_param or 'today'}"
        )
        cached = ttl_get(cache_key)
        if cached is not None:
            return success_response(data=cached, message="Dashboard screen data fetched successfully (cached)")

        if (not req_v or str(req_v).lower() in ['all', 'none']) and user and getattr(user, 'is_authenticated', False):
            role_str = str(getattr(user, 'role', '') or getattr(user, 'role_key', '')).upper()
            is_user_vendor = 'VENDOR' in role_str
            if not getattr(user, 'is_superuser', False) and is_user_vendor:
                u_vid = getattr(user, 'vendor_id', None)
                try:
                    vendor_obj = user.vendor if u_vid else None
                    if vendor_obj and getattr(vendor_obj, 'external_vendor_id', None):
                        u_vid = vendor_obj.external_vendor_id
                except Exception:
                    pass
                if u_vid and hasattr(request, 'GET'):
                    try:
                        request.GET = request.GET.copy()
                        request.GET['vendor_id'] = str(u_vid)
                    except Exception:
                        pass

        from apps.vendors.models import Vendor
        vendor_ids = get_user_vendor_ids(user)
        v_qs = Vendor.objects.filter(is_active=True)
        if vendor_ids is not None:
            v_qs = v_qs.filter(id__in=vendor_ids)
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            v_filter = Q(external_vendor_id=req_v) | Q(name__iexact=req_v)
            if str(req_v).isdigit():
                v_filter |= Q(id=int(req_v))
            v_qs = v_qs.filter(v_filter)
        target_vendors = list(v_qs)

        def _ff_machines():
            cached_ff = ttl_get('dashboard:ff_machines')
            if cached_ff is not None:
                return cached_ff
            try:
                from apps.integrations.fiberforce.client import FiberForceClient
                payload = FiberForceClient().get_machines()
                data = payload.get('data') if isinstance(payload, dict) else []
                rows = data if isinstance(data, list) else []
                ttl_set('dashboard:ff_machines', rows, ttl_seconds=30)
                return rows
            except Exception as exc:
                print("[Dashboard] FiberForce machines list error:", exc)
                return []

        def _ff_open_issues():
            cached_issues = ttl_get('dashboard:open_issues')
            if cached_issues is not None:
                return cached_issues
            try:
                from apps.attendance.views import _index_open_machine_issues
                oem, ops = _index_open_machine_issues()
                pair = (oem or {}, ops or {})
                ttl_set('dashboard:open_issues', pair, ttl_seconds=30)
                return pair
            except Exception as exc:
                print("[Dashboard] Open machine issues fetch error:", exc)
                return {}, {}

        with ThreadPoolExecutor(max_workers=3) as pool:
            ff_future = pool.submit(_ff_machines)
            issues_future = pool.submit(_ff_open_issues)
            vendor_pairs = _fetch_ilync_vendor_payloads(target_vendors)
            ff_machines = ff_future.result()
            oem_by_chassis, ops_by_chassis = issues_future.result()

        assigned_chassis = []
        for _v_obj, payload in vendor_pairs:
            for code in _extract_chassis_from_payload(payload):
                if code not in assigned_chassis:
                    assigned_chassis.append(code)

        # Start fleet attendance early while we build local fuel widgets
        chassis_preview = _quick_commissioned_chassis(assigned_chassis, ff_machines)

        def _ff_attendance():
            if not chassis_preview:
                return {}
            try:
                from apps.integrations.fiberforce.client import FiberForceClient
                return FiberForceClient().get_fleet_attendance_today(chassis_preview)
            except Exception as exc:
                print("[Dashboard] FiberForce fleet attendance error:", exc)
                return {}

        att_executor = ThreadPoolExecutor(max_workers=1)
        att_future = att_executor.submit(_ff_attendance)

        machines_qs = filter_queryset_by_vendor(Machine.objects.all().order_by('id'), user, 'vendor_id', request=request)
        if assigned_chassis:
            machines_qs = machines_qs.filter(
                Q(machine_chassis_no__in=assigned_chassis)
                | Q(serial_number__in=assigned_chassis)
                | Q(name__in=assigned_chassis)
                | Q(code__in=assigned_chassis)
            ).distinct()
        else:
            machines_qs = machines_qs.none()

        first_machine = machines_qs.filter(site_name__isnull=False).exclude(site_name='').first() or machines_qs.first()

        site_name = None
        if vendor_ids:
            assigned_v = Vendor.objects.filter(id__in=vendor_ids).first()
            if assigned_v:
                site_name = assigned_v.address or f"{assigned_v.name} Site"
        if not site_name:
            site_name = first_machine.site_name if (first_machine and first_machine.site_name) else "Sujangarh-SITE"
        project_name = site_name if "Project" in site_name else f"{site_name} Project"

        if date_param:
            try:
                today = datetime.strptime(date_param, '%Y-%m-%d')
            except ValueError:
                today = timezone.now()
        else:
            today = timezone.now()

        current_date_str = today.strftime('%d %b %Y')
        att_date = today.date() if hasattr(today, 'date') else today
        today_date_str = att_date.strftime('%Y-%m-%d') if hasattr(att_date, 'strftime') else str(att_date)

        total_machines = machines_qs.count()
        active_alerts = Alert.objects.filter(is_read=False).count() if total_machines > 0 else 0

        active_m = (
            machines_qs.filter(status='RUNNING').first() or
            machines_qs.filter(is_online=True).first() or
            machines_qs.filter(current_fuel_level__gt=0).first() or
            machines_qs.first()
        )

        fuel_litres = safe_float(active_m.current_fuel_level if active_m else 0)
        state_label = active_m.status if active_m else 'IDLE'
        is_online = active_m.is_online if active_m else False
        today_consumption = safe_float(active_m.today_consumption if active_m else 0)
        engine_hours_today = safe_float(active_m.engine_hours_today if active_m else 0.0)
        hrs = int(engine_hours_today)
        mins = int((engine_hours_today % 1) * 60)
        runtime_display = active_m.runtime_str if (active_m and active_m.runtime_str and active_m.runtime_str != '00h 00m') else f"{hrs:02d}h {mins:02d}m"

        machine_status_widget = {
            "id": active_m.id if active_m else None,
            "name": active_m.name if active_m else "No Machine Available",
            "chassis_no": active_m.machine_chassis_no if active_m else "N/A",
            "is_online": is_online,
            "status": "RUNNING" if is_online or (active_m and active_m.status == 'RUNNING') else (active_m.status if active_m else "IDLE"),
            "state_label": state_label,
            "runtime": runtime_display,
            "current_fuel_level": f"{fuel_litres:.2f} L",
            "today_consumption": f"{today_consumption:.2f} L"
        }

        fuel_agg = machines_qs.aggregate(
            t_fuel=Sum('current_fuel_level'),
            t_cap=Sum('fuel_capacity'),
            avg_pct=Avg('fuel_percentage'),
            t_refuel=Sum('today_refueled')
        )
        total_current_fuel = safe_float(fuel_agg.get('t_fuel'), 0.0)
        total_capacity = safe_float(fuel_agg.get('t_cap'), 0.0)
        avg_pct = int(safe_float(fuel_agg.get('avg_pct'), 0.0))
        if total_capacity > 0 and avg_pct == 0:
            avg_pct = int((total_current_fuel / total_capacity) * 100)

        last_filled = active_m.last_filled_text if (active_m and active_m.last_filled_text) else "15 Sep • 45 L"
        filled_by = active_m.filled_by if (active_m and active_m.filled_by) else "Operator"

        fuel_status_widget = {
            "percentage": avg_pct if total_machines > 0 else 0,
            "current_fuel": f"{int(total_current_fuel)} L" if total_current_fuel > 0 else (f"{int(fuel_litres)} L" if active_m else "0 L"),
            "today_refueled": f"{safe_float(fuel_agg.get('t_refuel'), 0.0):.1f} L",
            "tank_capacity": f"{int(total_capacity)} L" if total_capacity > 0 else "160 L",
            "filled_quantity": last_filled,
            "filled_by": filled_by
        }

        fuel_theft_widget = {
            "theft_alerts_count": 0,
            "status": "Normal / Secured",
            "audit_status": "Secured",
            "last_audit": current_date_str,
            "acknowledged_by": user_name
        }

        try:
            att_res = att_future.result(timeout=10)
        except Exception:
            att_res = {}
        finally:
            att_executor.shutdown(wait=False)

        machine_kpis = _commissioned_machine_kpis(att_date, assigned_chassis, ff_machines, att_res=att_res)
        commissioned = machine_kpis.get('commissioned') or 0
        running_live = machine_kpis.get('running') or 0

        ff_name_by_chassis = {}
        for item in ff_machines or []:
            if not isinstance(item, dict):
                continue
            ch = str(item.get('machine_chassis_no') or '').strip()
            if not ch:
                continue
            model = str(item.get('model_code') or 'HDD').strip() or 'HDD'
            short = ch[-4:] if len(ch) >= 4 else ch
            ff_name_by_chassis[ch] = f"{model} HDD ({short})"

        health_issues = []
        chassis_set = set(machine_kpis.get('chassis_list') or [])
        # Same as attendance: prefer OEM breakdown over Ops stop when both open
        for chassis in chassis_set:
            issue = (oem_by_chassis or {}).get(chassis) or (ops_by_chassis or {}).get(chassis)
            if not issue:
                continue
            kind = str(issue.get('kind') or 'OEM').upper()
            health_issues.append({
                "chassis_no": chassis,
                "name": ff_name_by_chassis.get(chassis) or f"HDD ({chassis[-4:] if len(chassis) >= 4 else chassis})",
                "kind": kind,
                "ticket": issue.get('tt_number'),
                "reason": issue.get('reason') or ('Ops stop' if kind == 'OPS' else 'Internal breakdown'),
                "status": issue.get('status') or 'OPEN',
                "severity": issue.get('severity'),
                "started_at": str(issue.get('started_at') or '') or None,
            })
        machine_health = {
            "healthy": len(health_issues) == 0,
            "commissioned": commissioned,
            "issue_count": len(health_issues),
            "issues": health_issues[:4],
            "issues_preview_limit": 4,
            "has_more_issues": len(health_issues) > 4,
        }

        from apps.attendance.models import AttendanceRecord
        from apps.attendance.views import (
            ATTENDANCE_SCOPE_ROLES,
            bump_scope_matrix,
            normalize_attendance_role,
        )

        today_recs = list(
            AttendanceRecord.objects.filter(date=att_date)
            .exclude(attendance_type='MACHINE')
            .select_related('user')
        )
        by_external = {}
        by_username = {}
        by_email = {}
        by_phone = {}
        for r in today_recs:
            u = r.user
            if not u:
                continue
            if u.external_user_id:
                by_external[str(u.external_user_id).strip()] = r
            if u.username:
                by_username[str(u.username).strip()] = r
            if u.employee_id:
                by_username[str(u.employee_id).strip()] = r
            if u.email and not str(u.email).lower().startswith('user@'):
                by_email[str(u.email).strip().lower()] = r
            if u.phone_number:
                by_phone[str(u.phone_number).strip()] = r

        total_team_members = 0
        present_count = 0
        absent_count = 0
        half_day_count = 0
        leave_count = 0
        week_off_count = 0
        not_marked_count = 0
        scope_matrix_map = {
            scope: {'scope': scope, 'total': 0, 'present': 0, 'not_marked': 0}
            for scope in ATTENDANCE_SCOPE_ROLES
        }

        for _v_obj, v_payload in vendor_pairs:
            raw_users = v_payload.get('users') or []
            if not isinstance(raw_users, list):
                raw_users = []
            for u_info in raw_users:
                if not isinstance(u_info, dict):
                    continue
                total_team_members += 1
                ext_u_id = str(u_info.get('userId') or u_info.get('id') or '').strip()
                if ext_u_id.lower() in ('none', 'null', ''):
                    ext_u_id = None
                mobile = str(u_info.get('mobile') or u_info.get('phone') or u_info.get('phoneNumber') or '').strip()
                email = str(u_info.get('email') or '').strip()
                name = str(u_info.get('name') or u_info.get('contactName') or 'Team Member').strip()
                designation = str(u_info.get('designation') or u_info.get('role') or 'OPERATOR').strip()
                u_role = normalize_attendance_role(designation)
                synthetic_id = f"ILYNC-{name.replace(' ', '_')}_{mobile}" if (name or mobile) else None

                rec = None
                if ext_u_id:
                    rec = by_external.get(ext_u_id) or by_username.get(ext_u_id)
                if not rec and synthetic_id:
                    rec = by_external.get(synthetic_id) or by_username.get(synthetic_id)
                if not rec and email and not email.lower().startswith('user@'):
                    rec = by_email.get(email.lower())
                if not rec and mobile:
                    rec = by_phone.get(mobile) or by_username.get(mobile)

                st = (rec.status if rec else 'NOT_MARKED').upper().replace(' ', '_')
                if st in ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT']:
                    present_count += 1
                elif st == 'ABSENT':
                    absent_count += 1
                elif st in ['HALF_DAY', 'HALFDAY']:
                    half_day_count += 1
                elif st == 'LEAVE':
                    leave_count += 1
                elif st in ['WEEK_OFF', 'WEEKOFF']:
                    week_off_count += 1
                else:
                    not_marked_count += 1
                    st = 'NOT_MARKED'
                bump_scope_matrix(scope_matrix_map, u_role, st)

        quick_stats = {
            "total_machines": commissioned,
            "commissioned_machines": commissioned,
            "running_machines": running_live,
            "assigned_machines": commissioned,
            "assigned_chassis_count": commissioned,
            "machine_actual_shift": machine_kpis.get('actual_shift') or 0,
            "machine_actual_shift_total": machine_kpis.get('actual_shift_total') or commissioned,
            "machine_attendance_present": machine_kpis.get('machine_attendance_present') or 0,
            "machine_attendance_total": machine_kpis.get('machine_attendance_total') or commissioned,
            "shots_in_progress": 1 if commissioned > 0 else 0,
            "tasks_pending": 0,
            "tasks_total": 0,
            "tasks_completed": 0,
            "tasks_in_progress": 0,
            "tasks_created": 0,
            "alerts_count": active_alerts,
            "attendance_pct": 92 if commissioned > 0 else 0,
            "team_present": present_count,
            "team_total": total_team_members,
        }

        vendor_team_attendance = {
            "total_team": total_team_members,
            "present": present_count,
            "absent": absent_count,
            "half_day": half_day_count,
            "leave": leave_count,
            "week_off": week_off_count,
            "not_marked": not_marked_count,
            "date": today_date_str,
            "attendance_text": f"{present_count} / {total_team_members} Present",
            "scope_matrix": [scope_matrix_map[s] for s in ATTENDANCE_SCOPE_ROLES],
        }

        data = {
            "user_name": user_name,
            "project_name": project_name,
            "current_date": current_date_str,
            "quick_stats": quick_stats,
            "machine_status_widget": machine_status_widget,
            "machine_health": machine_health,
            "fuel_status_widget": fuel_status_widget,
            "fuel_theft_widget": fuel_theft_widget,
            "fiber_tasks": {"Fiber 1": []},
            "assigned_tasks": [],
            "performance": {
                "achievement": "0.00 km",
                "target": "0.00 km",
                "percentage": 0,
                "message": "No tasks assigned to you",
            },
            "my_shift": {
                "status": "Present",
                "check_in": "08:42 AM",
                "working_duration": "5h 28m",
                "shift_time": "08:00 AM - 06:00 PM",
            },
            "vendor_team_attendance": vendor_team_attendance,
        }
        ttl_set(cache_key, data, ttl_seconds=30)
        return success_response(data=data, message="Dashboard screen data fetched successfully")
