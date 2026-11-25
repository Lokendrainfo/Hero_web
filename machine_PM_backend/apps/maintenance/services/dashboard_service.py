from datetime import timedelta
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.hero_integration.services import (
    extract_assigned_operator,
    get_authorized_machines_queryset,
)
from apps.maintenance.models import MaintenanceFrequencyMaster, MaintenanceSubmission
from .checklist_service import get_role_context


def _compute_cycle_status(machine, freq: MaintenanceFrequencyMaster, latest_sub: MaintenanceSubmission | None, today):
    """
    Computes maintenance status (COMPLETED, DUE, OVERDUE, PENDING) for a given machine & frequency.
    """
    current_hours = float(machine.engine_hours or 0)
    threshold_pct = float(freq.due_threshold_pct or 0.90)

    if freq.code == 'DAILY' or (freq.interval_days and not freq.interval_hours):
        if latest_sub and latest_sub.submission_date == today:
            return 'COMPLETED', 'Up to date (Completed Today)'
        if latest_sub and latest_sub.submission_date == (today - timedelta(days=1)):
            return 'DUE', 'Daily Check Due Today'
        if latest_sub:
            days_ago = (today - latest_sub.submission_date).days
            return 'OVERDUE', f'Daily Overdue ({days_ago}d ago)'
        if current_hours > 0 or machine.is_commissioned:
            return 'DUE', 'Daily Check Due'
        return 'PENDING', 'Daily Inspection Pending'

    interval = float(freq.interval_hours or 50)
    last_hours = float(latest_sub.hour_meter_reading) if latest_sub else 0.0
    hours_since = max(0.0, current_hours - last_hours)
    next_due_at = last_hours + interval

    if latest_sub and hours_since < interval * threshold_pct:
        remaining = max(0, round(next_due_at - current_hours, 1))
        return 'COMPLETED', f'Next at {int(next_due_at)} hrs ({remaining} hrs left)'
    if hours_since >= interval:
        overdue_by = round(hours_since - interval, 1)
        return 'OVERDUE', f'{freq.name} Overdue by {overdue_by} hrs'
    if hours_since >= interval * threshold_pct:
        return 'DUE', f'{freq.name} Due at {int(next_due_at)} hrs'
    return 'PENDING', f'Next at {int(next_due_at)} hrs'


def get_dashboard_data(user, query_params: dict) -> dict:
    role_ctx = get_role_context(user)
    vendor_id = query_params.get('vendor_id') or query_params.get('vendor')
    machine_id = query_params.get('machine_id') or query_params.get('machine')
    user_id = query_params.get('user_id')
    freq_filter = str(query_params.get('frequency') or 'ALL').strip().upper()
    status_filter = str(query_params.get('status') or 'ALL').strip().upper()
    search = query_params.get('search')
    date_from = parse_date(str(query_params.get('date_from') or ''))
    date_to = parse_date(str(query_params.get('date_to') or ''))

    machines_qs = get_authorized_machines_queryset(user, vendor_id=vendor_id, search=search)
    if machine_id and str(machine_id).strip().lower() not in ('all', 'none', 'null', ''):
        if str(machine_id).isdigit():
            machines_qs = machines_qs.filter(id=int(machine_id))
        else:
            machines_qs = machines_qs.filter(
                Q(code__iexact=str(machine_id)) | Q(machine_chassis_no__iexact=str(machine_id))
            )

    machines = list(machines_qs)
    machine_ids = [m.id for m in machines]

    allowed_freqs = list(
        MaintenanceFrequencyMaster.objects.filter(
            code__in=role_ctx['allowed_frequencies'],
            is_active=True,
        ).order_by('sort_order', 'id')
    )
    target_freqs = (
        [f for f in allowed_freqs if f.code == freq_filter]
        if freq_filter not in ('ALL', '', 'NONE')
        else allowed_freqs
    )

    subs_qs = (
        MaintenanceSubmission.objects.select_related('frequency', 'submitted_by')
        .filter(machine_id__in=machine_ids)
        .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
        .order_by('-submitted_at', '-id')
    )
    if user_id and str(user_id).isdigit():
        subs_qs = subs_qs.filter(submitted_by_id=int(user_id))
    if date_from:
        subs_qs = subs_qs.filter(submission_date__gte=date_from)
    if date_to:
        subs_qs = subs_qs.filter(submission_date__lte=date_to)

    # Latest submission per (machine_id, frequency_code) and overall per machine
    latest_by_mf = {}
    latest_by_machine = {}
    subs_count_by_freq = {f.code: 0 for f in allowed_freqs}

    for s in subs_qs:
        f_code = s.frequency.code
        if f_code in subs_count_by_freq:
            subs_count_by_freq[f_code] += 1
        key = (s.machine_id, f_code)
        if key not in latest_by_mf:
            latest_by_mf[key] = s
        if s.machine_id not in latest_by_machine:
            latest_by_machine[s.machine_id] = s

    today = timezone.localdate()
    priority_rank = {'OVERDUE': 4, 'DUE': 3, 'PENDING': 2, 'COMPLETED': 1}

    freq_buckets = {
        f.code: {
            "frequency_code": f.code,
            "frequency_name": f.name,
            "completed": 0,
            "due": 0,
            "pending": 0,
            "overdue": 0,
            "submissions_in_range": subs_count_by_freq.get(f.code, 0),
        }
        for f in target_freqs
    }

    machine_rows = []
    kpi_due = 0
    kpi_completed = 0
    kpi_pending = 0
    kpi_overdue = 0

    for m in machines:
        per_freq_statuses = []
        worst_status = 'PENDING'
        worst_rank = 0
        worst_due_label = 'Scheduled in Cycle'

        for f in target_freqs:
            latest_sub = latest_by_mf.get((m.id, f.code))
            st, due_label = _compute_cycle_status(m, f, latest_sub, today)
            per_freq_statuses.append(
                {
                    "frequency_code": f.code,
                    "frequency_name": f.name,
                    "status": st,
                    "due_label": due_label,
                    "last_submitted_at": latest_sub.submitted_at.isoformat() if latest_sub else None,
                    "last_hour_meter": float(latest_sub.hour_meter_reading) if latest_sub else None,
                }
            )
            bucket = freq_buckets[f.code]
            bucket[st.lower()] += 1

            r = priority_rank.get(st, 0)
            if r > worst_rank:
                worst_rank = r
                worst_status = st
                worst_due_label = due_label

        if status_filter not in ('ALL', '', 'NONE') and worst_status != status_filter:
            continue

        if worst_status == 'COMPLETED':
            kpi_completed += 1
        elif worst_status == 'DUE':
            kpi_due += 1
        elif worst_status == 'OVERDUE':
            kpi_overdue += 1
        else:
            kpi_pending += 1

        last_any = latest_by_machine.get(m.id)
        if freq_filter not in ('ALL', '', 'NONE'):
            last_any = latest_by_mf.get((m.id, freq_filter)) or last_any

        machine_rows.append(
            {
                "id": m.id,
                "machine_id": m.id,
                "code": m.code,
                "machine_number": m.machine_chassis_no or m.code or m.serial_number,
                "machine_chassis_no": m.machine_chassis_no or "",
                "name": m.name,
                "model_name": m.model_name,
                "machine_type": m.category,
                "vendor_id": m.vendor_id,
                "vendor_name": m.vendor.name if m.vendor else "HERO Direct",
                "operator_name": extract_assigned_operator(m),
                "location_name": m.site_name or m.location_name or "Operational Site",
                "engine_hours": m.engine_hours or 0,
                "status": worst_status,
                "next_due_label": worst_due_label,
                "frequency_statuses": per_freq_statuses,
                "last_maintenance": (
                    {
                        "id": last_any.id,
                        "submission_number": last_any.submission_number,
                        "frequency": last_any.frequency.code,
                        "frequency_name": last_any.frequency.name,
                        "date": timezone.localtime(last_any.submitted_at).strftime('%Y-%m-%d %H:%M'),
                        "hour_meter": float(last_any.hour_meter_reading),
                        "performed_by": last_any.submitted_by_name,
                        "performed_by_role": last_any.submitted_by_role,
                        "status": last_any.status,
                        "approval_status": last_any.approval_status,
                    }
                    if last_any
                    else None
                ),
            }
        )

    total_submissions_count = subs_qs.count()
    frequency_completion = []
    total_m = len(machines)
    for fc, b in freq_buckets.items():
        completion_pct = round((b["completed"] / total_m) * 100, 1) if total_m else 0.0
        frequency_completion.append({**b, "total_machines": total_m, "completion_rate": completion_pct})

    return {
        "role_info": role_ctx,
        "kpis": {
            "total_machines": len(machine_rows) if status_filter not in ('ALL', '', 'NONE') else len(machines),
            "maintenance_due": kpi_due,
            "maintenance_completed": kpi_completed,
            "pending_maintenance": kpi_pending,
            "overdue_maintenance": kpi_overdue,
            "total_submissions": total_submissions_count,
        },
        "frequency_completion": frequency_completion,
        "machines": machine_rows,
    }


def get_machines_by_cycle_status(user, target_status: str, query_params: dict) -> list[dict]:
    data = get_dashboard_data(user, query_params)
    items = []
    for m in data["machines"]:
        matching_freqs = [fs for fs in m["frequency_statuses"] if fs["status"] == target_status]
        if matching_freqs or m["status"] == target_status:
            items.append(
                {
                    "machine_id": m["id"],
                    "machine_number": m["machine_number"],
                    "machine_name": m["name"],
                    "model_name": m["model_name"],
                    "vendor_name": m["vendor_name"],
                    "operator_name": m["operator_name"],
                    "engine_hours": m["engine_hours"],
                    "overall_status": m["status"],
                    "matching_frequencies": matching_freqs,
                    "last_maintenance": m["last_maintenance"],
                }
            )
    return items


def get_maintenance_report(user, query_params: dict) -> dict:
    dash = get_dashboard_data(user, query_params)
    vendor_id = query_params.get('vendor_id') or query_params.get('vendor')
    machine_ids = [m["id"] for m in dash["machines"]]

    subs_qs = (
        MaintenanceSubmission.objects.select_related('frequency', 'machine', 'submitted_by')
        .filter(machine_id__in=machine_ids)
        .order_by('-submitted_at')
    )
    freq_filter = str(query_params.get('frequency') or 'ALL').strip().upper()
    if freq_filter not in ('ALL', '', 'NONE'):
        subs_qs = subs_qs.filter(frequency__code=freq_filter)
    date_from = parse_date(str(query_params.get('date_from') or ''))
    date_to = parse_date(str(query_params.get('date_to') or ''))
    if date_from:
        subs_qs = subs_qs.filter(submission_date__gte=date_from)
    if date_to:
        subs_qs = subs_qs.filter(submission_date__lte=date_to)
    user_id = query_params.get('user_id')
    if user_id and str(user_id).isdigit():
        subs_qs = subs_qs.filter(submitted_by_id=int(user_id))

    by_vendor = {}
    by_user = {}
    approval_counts = {"PENDING_REVIEW": 0, "APPROVED": 0, "REJECTED": 0, "CHANGES_REQUESTED": 0}
    total_items_checked = 0
    total_items_completed = 0

    for s in subs_qs:
        v_name = s.vendor_name or "HERO Direct"
        by_vendor.setdefault(v_name, {"vendor_name": v_name, "submissions": 0, "completed": 0, "partial": 0})
        by_vendor[v_name]["submissions"] += 1
        if s.status == MaintenanceSubmission.STATUS_COMPLETED:
            by_vendor[v_name]["completed"] += 1
        else:
            by_vendor[v_name]["partial"] += 1

        u_key = s.submitted_by_id
        by_user.setdefault(
            u_key,
            {
                "user_id": s.submitted_by_id,
                "user_name": s.submitted_by_name,
                "role": s.submitted_by_role,
                "submissions": 0,
            },
        )
        by_user[u_key]["submissions"] += 1
        approval_counts[s.approval_status] = approval_counts.get(s.approval_status, 0) + 1
        total_items_checked += s.total_items
        total_items_completed += s.completed_items_count

    return {
        "kpis": dash["kpis"],
        "frequency_completion": dash["frequency_completion"],
        "approval_summary": approval_counts,
        "activity_compliance_pct": (
            round((total_items_completed / total_items_checked) * 100, 1) if total_items_checked else 0.0
        ),
        "by_vendor": list(by_vendor.values()),
        "by_user": list(by_user.values()),
        "vendor_filter": vendor_id or "ALL",
    }

