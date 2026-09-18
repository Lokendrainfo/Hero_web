from rest_framework.views import APIView
from rest_framework import permissions
from django.utils import timezone
from django.db.models import Q
from datetime import timedelta
from apps.machines.models import Machine
from apps.tasks.models import Task
from apps.alerts.models import Alert
from apps.common.responses import success_response

from apps.common.vendor_scope import filter_queryset_by_vendor, get_user_vendor_ids

def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _ilync_assigned_chassis_for_vendors(vendors):
    """Delegate to shared concurrent collector."""
    from apps.machines.services import collect_ilync_assigned_chassis
    return collect_ilync_assigned_chassis(vendors)


def _filter_machines_to_assigned(machines_qs, chassis_set):
    if not chassis_set:
        return machines_qs.none()
    return machines_qs.filter(
        Q(machine_chassis_no__in=chassis_set)
        | Q(serial_number__in=chassis_set)
        | Q(name__in=chassis_set)
        | Q(code__in=chassis_set)
    ).distinct()


class DashboardSummaryView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        user = request.user
        
        user_name = user.get_full_name() or user.username if user.is_authenticated else "Operations Manager"

        q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))

        # Vendor Scoped Machine & Task Querysets
        req_v = q_params.get('vendor_id') or q_params.get('vendor')
        if (not req_v or str(req_v).lower() in ['all', 'none']) and user and getattr(user, 'is_authenticated', False):
            role_str = str(getattr(user, 'role', '') or getattr(user, 'role_key', '')).upper()
            is_user_vendor = 'VENDOR' in role_str
            if not getattr(user, 'is_superuser', False) and is_user_vendor:
                u_vid = getattr(user, 'vendor_id', None) or (user.vendor.external_vendor_id if getattr(user, 'vendor', None) else None)
                if u_vid and hasattr(request, 'GET'):
                    try:
                        request.GET = request.GET.copy()
                        request.GET['vendor_id'] = str(u_vid)
                    except Exception:
                        pass

        machines_qs = None  # unused — live path below
        tasks_qs = None

        # Restrict machine KPIs to iLync-assigned chassis via shared live machines path
        from apps.machines.services import fetch_live_fiberforce_machines
        from types import SimpleNamespace
        live_mac_res = fetch_live_fiberforce_machines(user, q_params)
        live_results = (live_mac_res or {}).get('results') or (live_mac_res or {}).get('all_items') or []
        if not isinstance(live_results, list):
            live_results = []
        assigned_chassis = set((live_mac_res or {}).get('assigned_chassis') or [])
        chassis_upper = {str(c).strip().upper() for c in assigned_chassis}
        if chassis_upper:
            live_results = [
                m for m in live_results
                if str(m.get('machine_chassis_no') or m.get('serial_number') or m.get('chassis_no') or '').strip().upper() in chassis_upper
            ]

        # Lightweight vendor name for project title (first assigned id only)
        live_vendor_proxies = []
        req_v = q_params.get('vendor_id') or q_params.get('vendor')
        vendor_ids = get_user_vendor_ids(user)
        first_vid = None
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            first_vid = str(req_v).strip()
        elif vendor_ids:
            first_vid = str(vendor_ids[0])
        if first_vid:
            from apps.common.vendor_scope import _hydrate_vendor
            try:
                live_vendor_proxies = [_hydrate_vendor(first_vid)]
            except Exception:
                live_vendor_proxies = []

        def _as_mac(m):
            return SimpleNamespace(
                id=m.get('id') or m.get('machine_chassis_no'),
                name=m.get('name') or m.get('machine_chassis_no') or 'Machine',
                machine_chassis_no=m.get('machine_chassis_no') or m.get('serial_number'),
                status=m.get('status') or 'IDLE',
                is_online=bool(m.get('is_online')),
                current_fuel_level=safe_float(m.get('current_fuel_level') or m.get('fuel_litres')),
                fuel_capacity=safe_float(m.get('fuel_capacity') or m.get('tank_capacity_l') or 160),
                fuel_percentage=safe_float(m.get('fuel_percentage') or m.get('fuel_pct')),
                today_consumption=safe_float(m.get('today_consumption') or m.get('fuel_consumed_today')),
                today_refueled=safe_float(m.get('today_refueled')),
                engine_hours_today=safe_float(m.get('engine_hours_today')),
                runtime_str=m.get('runtime_str') or '00h 00m',
                site_name=m.get('site_name') or '',
                last_filled_text=m.get('last_filled_text'),
                filled_by=m.get('filled_by') or (m.get('operator') or {}).get('name') if isinstance(m.get('operator'), dict) else m.get('filled_by'),
            )

        machines_list = [_as_mac(m) for m in live_results if isinstance(m, dict)]

        # Query first available machine for widgets
        first_machine = next((m for m in machines_list if m.site_name), None) or (machines_list[0] if machines_list else None)

        # Dynamic Project / Site Name
        site_name = None
        if live_vendor_proxies:
            site_name = f"{live_vendor_proxies[0].name} Site"

        if not site_name:
            site_name = first_machine.site_name if (first_machine and first_machine.site_name) else "Sujangarh-SITE"

        project_name = site_name if "Project" in site_name else f"{site_name} Project"

        # Current Dynamic Date filter from query params
        date_param = q_params.get('date')
        if date_param:
            try:
                from datetime import datetime
                today = datetime.strptime(date_param, '%Y-%m-%d')
            except ValueError:
                today = timezone.now()
        else:
            today = timezone.now()

        current_date_str = today.strftime('%d %b %Y')
        due_date_str = (today + timedelta(days=2)).strftime('%d %b %Y')

        # Live machine stats
        total_machines = len(machines_list)
        running_machines = sum(1 for m in machines_list if str(m.status).upper() == 'RUNNING')
        active_alerts = 0
        # Live tasks and authoritative task statistics from single source of truth helper
        task_list_items = []
        authorized_tasks = []
        pending_tasks = 0
        task_stats = {"total": 0, "pending": 0, "completed": 0, "in_progress": 0, "created": 0}

        try:
            from apps.common.progress import get_task_statistics
            page_sz = int(q_params.get('size') or q_params.get('page_size') or 10)
            task_stats = get_task_statistics(user=user, request=request, task_type='FIBER_TRENCHING_DUCTING_TASK', page_size=page_sz)
            authorized_tasks = task_stats.get("authorized_tasks", [])
            pending_tasks = task_stats.get("pending", 0)

            for t_idx, t_item in enumerate(authorized_tasks[:10]):
                t_code = t_item.get('taskCode') or t_item.get('task_code') or f'TASK-{t_idx+1}'
                t_disp = t_item.get('displayName') or t_item.get('title') or 'Block Scope'
                cov_km = safe_float(t_item.get('covered_distance') if t_item.get('covered_distance') is not None else t_item.get('coveredLengthKm'), 0.0)
                tot_km = safe_float(t_item.get('planned_distance') if t_item.get('planned_distance') is not None else t_item.get('totalLengthKm'), 0.0)
                pct = safe_float(t_item.get('progress_percent') if t_item.get('progress_percent') is not None else t_item.get('pct'), 0.0)
                location_str = t_item.get('locationStr') or (t_item.get('location', {}).get('blockName') if isinstance(t_item.get('location'), dict) else None) or t_disp

                task_list_items.append({
                    "id": t_item.get('id', t_code),
                    "taskCode": t_code,
                    "title": t_disp,
                    "displayName": t_disp,
                    "locationStr": location_str,
                    "subtitle": f"Location: {location_str}",
                    "coveredLengthKm": cov_km,
                    "covered_distance": cov_km,
                    "plannedLengthKm": tot_km,
                    "planned_distance": tot_km,
                    "coveredScopeStr": f"{cov_km:.2f} km",
                    "totalScopeStr": f"{tot_km:.2f} km",
                    "progress_percent": pct,
                    "pct": pct,
                    "status": t_item.get('status', 'IN_PROGRESS'),
                    "vendorName": t_item.get('vendorName') or '',
                    "due_date": due_date_str,
                    "overdue_text": "On Schedule"
                })
        except Exception as err:
            print("[Dashboard] Authorized live tasks fetch error:", err)

        # Machine and Fuel Status widgets: prefer active/running machine with fuel
        active_m = (
            next((m for m in machines_list if str(m.status).upper() == 'RUNNING'), None) or
            next((m for m in machines_list if m.is_online), None) or
            next((m for m in machines_list if m.current_fuel_level > 0), None) or
            (machines_list[0] if machines_list else None)
        )

        live_telemetry = {}
        if active_m and active_m.machine_chassis_no:
            try:
                from apps.integrations.fiberforce.client import FiberForceClient
                ff_client = FiberForceClient()
                ff_res = ff_client.get_live_telemetry(active_m.machine_chassis_no)
                if isinstance(ff_res, dict) and ff_res.get('success') and isinstance(ff_res.get('data'), dict):
                    live_telemetry = ff_res['data']
            except Exception as e:
                print("[Dashboard] FiberForce live telemetry error:", e)

        fuel_litres = safe_float(live_telemetry.get('fuel_litres'), safe_float(active_m.current_fuel_level if active_m else 0))
        state_label = live_telemetry.get('state_label', active_m.status if active_m else 'IDLE')
        is_online = live_telemetry.get('is_online', active_m.is_online if active_m else False)
        today_consumption = safe_float(live_telemetry.get('fuel_consumed_today'), safe_float(active_m.today_consumption if active_m else 0))
        engine_hours_today = safe_float(live_telemetry.get('engine_hours_today'), safe_float(active_m.engine_hours_today if active_m else 0.0))

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

        from django.db.models import Sum, Avg
        total_current_fuel = sum(safe_float(m.current_fuel_level) for m in machines_list)
        total_capacity = sum(safe_float(m.fuel_capacity) for m in machines_list) or 0.0
        pct_vals = [safe_float(m.fuel_percentage) for m in machines_list if safe_float(m.fuel_percentage) > 0]
        avg_pct = int(sum(pct_vals) / len(pct_vals)) if pct_vals else 0
        if total_capacity > 0 and avg_pct == 0:
            avg_pct = int((total_current_fuel / total_capacity) * 100)
        t_refuel = sum(safe_float(m.today_refueled) for m in machines_list)


        last_filled = active_m.last_filled_text if (active_m and active_m.last_filled_text) else "15 Sep • 45 L"
        filled_by = active_m.filled_by if (active_m and active_m.filled_by) else "Operator"

        fuel_status_widget = {
            "percentage": avg_pct if total_machines > 0 else 0,
            "current_fuel": f"{int(total_current_fuel)} L" if total_current_fuel > 0 else (f"{int(fuel_litres)} L" if active_m else "0 L"),
            "today_refueled": f"{t_refuel:.1f} L",
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

        quick_stats = {
            "total_machines": total_machines,
            "running_machines": running_machines,
            "assigned_machines": total_machines,
            "assigned_chassis_count": len(assigned_chassis),
            "shots_in_progress": 1 if total_machines > 0 else 0,
            "tasks_pending": pending_tasks,
            "tasks_total": task_stats.get("total", 0),
            "tasks_completed": task_stats.get("completed", 0),
            "tasks_in_progress": task_stats.get("in_progress", 0),
            "tasks_created": task_stats.get("created", 0),
            "alerts_count": active_alerts,
            "attendance_pct": 92 if total_machines > 0 else 0
        }

        tot_cov_sum = sum(safe_float(t.get('covered_distance') or t.get('coveredLengthKm')) for t in authorized_tasks)
        tot_plan_sum = sum(safe_float(t.get('planned_distance') or t.get('totalLengthKm')) for t in authorized_tasks)
        perf_pct = int((tot_cov_sum / tot_plan_sum) * 100) if tot_plan_sum > 0 else 0

        fiber_tasks = {
            "Fiber 1": task_list_items
        }

        has_tasks = len(authorized_tasks) > 0
        performance = {
            "achievement": f"{tot_cov_sum:.2f} km" if has_tasks else "0.00 km",
            "target": f"{tot_plan_sum:.2f} km" if has_tasks else "0.00 km",
            "percentage": perf_pct,
            "message": "You're on track! Keep it up." if has_tasks else "No tasks assigned to you"
        }

        my_shift = {
            "status": "Present",
            "check_in": "08:42 AM",
            "working_duration": "5h 28m",
            "shift_time": "08:00 AM - 06:00 PM"
        }

        # Vendor Scoped Team & Attendance Statistics for Dashboard (LIVE from iLync)
        from apps.attendance.models import AttendanceRecord
        from apps.attendance.views import (
            ATTENDANCE_SCOPE_ROLES,
            bump_scope_matrix,
            normalize_attendance_role,
        )
        from apps.integrations.ilync_client import IlyncClient

        client = IlyncClient()
        req_v = q_params.get('vendor_id') or q_params.get('vendor')

        target_vendors = live_vendor_proxies
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            target_vendors = [_hydrate_vendor(str(req_v).strip())]
        # Normalize selected date to a Date (not datetime) for AttendanceRecord.date
        att_date = today.date() if hasattr(today, 'date') else today
        today_date_str = att_date.strftime('%Y-%m-%d') if hasattr(att_date, 'strftime') else str(att_date)
        today_recs = list(
            AttendanceRecord.objects.filter(date=att_date)
            .exclude(attendance_type='MACHINE')
            .select_related('user')
        )

        # Index records for O(1) lookup across iLync roster users
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

        for v_obj in target_vendors:
            ext_v_id = v_obj.external_vendor_id or v_obj.id
            live_res = None
            try:
                live_res = client.get_vendor_by_id(ext_v_id)
            except Exception:
                pass

            v_payload = live_res.get('data') if (isinstance(live_res, dict) and live_res.get('success')) else (live_res if isinstance(live_res, dict) else {})
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

        quick_stats["team_present"] = present_count
        quick_stats["team_total"] = total_team_members

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
            "fuel_status_widget": fuel_status_widget,
            "fuel_theft_widget": fuel_theft_widget,
            "fiber_tasks": fiber_tasks,
            "assigned_tasks": task_list_items,
            "performance": performance,
            "my_shift": my_shift,
            "vendor_team_attendance": vendor_team_attendance
        }
        return success_response(data=data, message="Dashboard screen data fetched successfully")

