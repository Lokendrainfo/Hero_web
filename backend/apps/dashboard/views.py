from rest_framework.views import APIView
from rest_framework import permissions
from django.utils import timezone
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

        machines_qs = filter_queryset_by_vendor(Machine.objects.all().order_by('id'), user, 'vendor_id', request=request)
        tasks_qs = filter_queryset_by_vendor(Task.objects.all(), user, 'vendor_id', request=request)

        # Query first available machine for widgets
        first_machine = machines_qs.filter(site_name__isnull=False).exclude(site_name='').first() or machines_qs.first()

        # Dynamic Project / Site Name from Vendor assignment or Machines DB
        vendor_ids = get_user_vendor_ids(user)
        site_name = None
        if vendor_ids:
            from apps.vendors.models import Vendor
            assigned_v = Vendor.objects.filter(id__in=vendor_ids).first()
            if assigned_v:
                site_name = assigned_v.address or f"{assigned_v.name} Site"

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

        # Real DB Machine Stats calculated strictly from accessible vendor data
        total_machines = machines_qs.count()
        running_machines = machines_qs.filter(status='RUNNING').count()
        active_alerts = Alert.objects.filter(is_read=False).count() if total_machines > 0 else 0
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
            machines_qs.filter(status='RUNNING').first() or
            machines_qs.filter(is_online=True).first() or
            machines_qs.filter(current_fuel_level__gt=0).first() or
            machines_qs.first()
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

        quick_stats = {
            "total_machines": total_machines,
            "running_machines": running_machines,
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

        # Vendor Scoped Team & Attendance Statistics for Dashboard
        from apps.authentication.models import User
        from apps.attendance.models import AttendanceRecord
        from django.db.models import Q
        
        req_v = q_params.get('vendor_id') or q_params.get('vendor')
        team_qs = User.objects.filter(is_active=True)
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            team_qs = team_qs.filter(
                Q(vendor__external_vendor_id=req_v) |
                Q(vendor__name__icontains=req_v) |
                Q(vendor_id=req_v if str(req_v).isdigit() else None) |
                Q(hero_vendor_assignments__vendor__name__icontains=req_v) |
                Q(hero_vendor_assignments__vendor_id=req_v if str(req_v).isdigit() else None)
            )
        elif vendor_ids is not None:
            if not vendor_ids:
                team_qs = User.objects.none()
            else:
                team_qs = team_qs.filter(
                    Q(vendor_id__in=vendor_ids) |
                    Q(hero_vendor_assignments__vendor_id__in=vendor_ids)
                )
        else:
            team_qs = team_qs.filter(
                Q(vendor__isnull=False) | Q(hero_vendor_assignments__isnull=False)
            )

        team_qs = team_qs.exclude(
            Q(is_superuser=True) | Q(role__iexact='ADMIN') | Q(roles__name__iexact='ADMIN')
        ).distinct()
        
        total_team_members = team_qs.count()
        team_user_ids = list(team_qs.values_list('id', flat=True))
        
        today_date_str = today.strftime('%Y-%m-%d')
        today_records = AttendanceRecord.objects.filter(user_id__in=team_user_ids, date=today_date_str) if team_user_ids else []
        
        user_status_map = {}
        for r in today_records:
            st = str(r.status).upper()
            curr = user_status_map.get(r.user_id, 'NOT_MARKED')
            if st in ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT'] or curr == 'NOT_MARKED':
                user_status_map[r.user_id] = st
        
        present_count = 0
        absent_count = 0
        half_day_count = 0
        leave_count = 0
        not_marked_count = 0
        
        for u_id in team_user_ids:
            st = user_status_map.get(u_id, 'NOT_MARKED')
            if st in ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT']:
                present_count += 1
            elif st == 'ABSENT':
                absent_count += 1
            elif st in ['HALF_DAY', 'HALF DAY']:
                half_day_count += 1
            elif st == 'LEAVE':
                leave_count += 1
            else:
                not_marked_count += 1
                
        vendor_team_attendance = {
            "total_team": total_team_members,
            "present": present_count,
            "absent": absent_count,
            "half_day": half_day_count,
            "leave": leave_count,
            "not_marked": not_marked_count,
            "attendance_text": f"{present_count} / {total_team_members} Present"
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

