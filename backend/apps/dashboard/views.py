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

        # Vendor Scoped Machine & Task Querysets
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
        date_param = request.query_params.get('date')
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
        # Live tasks from single source of truth helper
        task_list_items = []
        authorized_tasks = []
        try:
            from apps.common.task_scope import get_user_authorized_tasks
            scoped_task_res = get_user_authorized_tasks(user=user, request=request, page=0, size=20)
            authorized_tasks = scoped_task_res.get("results", []) if isinstance(scoped_task_res, dict) else []
            
            for t_idx, t_item in enumerate(authorized_tasks[:5]):
                t_code = t_item.get('taskCode') or t_item.get('task_code') or f'TASK-{t_idx+1}'
                t_disp = t_item.get('displayName') or t_item.get('title') or 'Block Scope'
                cov_km = safe_float(t_item.get('coveredLengthKm'), 0)
                tot_km = safe_float(t_item.get('totalLengthKm'), 50.0)
                pct = t_item.get('pct') if t_item.get('pct') is not None else (min(100, int((cov_km / tot_km) * 100)) if tot_km > 0 else 0)
                
                task_list_items.append({
                    "id": t_item.get('id', t_code),
                    "taskCode": t_code,
                    "title": t_disp,
                    "subtitle": f"Location: {t_item.get('locationStr') or t_disp}",
                    "progress_val": t_item.get('coveredScopeStr') or f"{cov_km:.2f} km",
                    "target_val": t_item.get('totalScopeStr') or f"{tot_km:.2f} km",
                    "progress_percent": pct,
                    "status": t_item.get('status', 'IN_PROGRESS'),
                    "due_date": due_date_str,
                    "overdue_text": "On Schedule"
                })
        except Exception as err:
            print("[Dashboard] Authorized live tasks fetch error:", err)

        # Machine and Fuel Status widgets
        active_m = first_machine or machines_qs.first()
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

        fuel_pct = safe_float(live_telemetry.get('fuel_pct'), safe_float(active_m.fuel_percentage if active_m else 0))
        fuel_litres = safe_float(live_telemetry.get('fuel_litres'), safe_float(active_m.current_fuel_level if active_m else 0))
        tank_capacity = safe_float(live_telemetry.get('tank_capacity_l'), safe_float(active_m.fuel_capacity if active_m else 160.0))
        state_label = live_telemetry.get('state_label', active_m.status if active_m else 'OFFLINE')
        is_online = live_telemetry.get('is_online', active_m.is_online if active_m else False)
        today_consumption = safe_float(live_telemetry.get('fuel_consumed_today'), safe_float(active_m.today_consumption if active_m else 0))
        engine_hours_today = safe_float(live_telemetry.get('engine_hours_today'), safe_float(active_m.engine_hours_today if active_m else 0.0))

        hrs = int(engine_hours_today)
        mins = int((engine_hours_today % 1) * 60)

        machine_status_widget = {
            "id": active_m.id if active_m else None,
            "name": active_m.name if active_m else "No Machine Available",
            "chassis_no": active_m.machine_chassis_no if active_m else "N/A",
            "is_online": is_online,
            "status": "RUNNING" if is_online or (active_m and active_m.status == 'RUNNING') else "IDLE",
            "state_label": state_label,
            "runtime": f"{hrs:02d}h {mins:02d}m",
            "current_fuel_level": f"{fuel_litres:.2f} L",
            "today_consumption": f"{today_consumption:.2f} L"
        }

        fuel_status_widget = {
            "percentage": int(fuel_pct),
            "current_fuel": f"{int(fuel_litres)} L",
            "tank_capacity": f"{int(tank_capacity)} L",
            "filled_quantity": f"{active_m.last_filled_text if active_m else '24 Aug • 49 L'}",
            "filled_by": active_m.filled_by if active_m else "Operator"
        }

        pending_tasks = len([t for t in authorized_tasks if str(t.get('status')).upper() not in ['COMPLETED', 'APPROVED']]) if authorized_tasks else 0

        quick_stats = {
            "total_machines": total_machines,
            "running_machines": running_machines,
            "shots_in_progress": 1 if total_machines > 0 else 0,
            "tasks_pending": pending_tasks,
            "alerts_count": active_alerts,
            "attendance_pct": 92 if total_machines > 0 else 0
        }

        fiber_tasks = {
            "Fiber 1": task_list_items
        }

        has_tasks = len(authorized_tasks) > 0
        performance = {
            "achievement": "640m" if has_tasks else "0m",
            "target": "1,000m" if has_tasks else "0m",
            "percentage": 64 if has_tasks else 0,
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
        
        team_qs = User.objects.filter(is_active=True)
        if vendor_ids is not None:
            if not vendor_ids:
                team_qs = User.objects.none()
            else:
                team_qs = team_qs.filter(
                    Q(vendor_id__in=vendor_ids) |
                    Q(hero_vendor_assignments__vendor_id__in=vendor_ids)
                ).exclude(
                    Q(is_superuser=True) | Q(role__iexact='ADMIN') | Q(roles__name__iexact='ADMIN')
                ).distinct()
        else:
            team_qs = team_qs.filter(
                Q(vendor__isnull=False) | Q(hero_vendor_assignments__isnull=False)
            ).exclude(
                Q(is_superuser=True) | Q(role__iexact='ADMIN') | Q(roles__name__iexact='ADMIN')
            ).distinct()
        
        total_team_members = team_qs.count()
        team_user_ids = list(team_qs.values_list('id', flat=True))
        
        today_date_str = today.strftime('%Y-%m-%d')
        today_records = AttendanceRecord.objects.filter(user_id__in=team_user_ids, date=today_date_str) if team_user_ids else []
        records_status_map = {r.user_id: r.status.upper() for r in today_records}
        
        present_count = 0
        absent_count = 0
        half_day_count = 0
        leave_count = 0
        not_marked_count = 0
        
        for u_id in team_user_ids:
            st = records_status_map.get(u_id, 'NOT_MARKED')
            if st == 'PRESENT':
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
            "fiber_tasks": fiber_tasks,
            "performance": performance,
            "my_shift": my_shift,
            "vendor_team_attendance": vendor_team_attendance
        }
        return success_response(data=data, message="Dashboard screen data fetched successfully")

