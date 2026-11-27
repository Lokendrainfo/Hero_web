from datetime import timedelta
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.hero_integration.services import (
    extract_assigned_operator,
    get_authorized_machines_queryset,
)
from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    ChecklistFrequencySchedule,
    MaintenanceFrequencyMaster,
    MaintenanceSubmission,
)
from .checklist_service import get_role_context
from .schedule_service import evaluate_scheduled_cycle


def _is_submission_complete_for_freq(sub: MaintenanceSubmission | None, active_item_ids: set[int]) -> bool:
    """
    Ensures a frequency cycle is only treated as COMPLETED when every active configured
    activity in that frequency has a COMPLETED response (no incomplete or newly added uncompleted activities).
    """
    if not sub or not active_item_ids:
        return False
    completed_ids = {
        r.checklist_item_id
        for r in sub.responses.all()
        if r.status == 'COMPLETED'
    }
    return active_item_ids.issubset(completed_ids)


def _compute_cycle_status(
    machine,
    freq: MaintenanceFrequencyMaster,
    latest_completed_sub: MaintenanceSubmission | None,
    today,
    latest_any_sub: MaintenanceSubmission | None = None,
):
    """
    Computes maintenance status (COMPLETED, DUE, OVERDUE, PENDING, SCHEDULED) dynamically
    for calendar intervals (Daily, Weekly, Monthly, Quarterly, Yearly) or hour-based intervals.
    """
    current_hours = float(machine.engine_hours or 0)
    threshold_pct = float(freq.due_threshold_pct or 0.90)

    # Calendar-based schedules (Daily, Weekly, Monthly, Quarterly, Yearly)
    if freq.interval_days and not freq.interval_hours:
        interval_days = max(1, int(freq.interval_days))

        if latest_completed_sub:
            days_since = (today - latest_completed_sub.submission_date).days
            next_due_date = latest_completed_sub.submission_date + timedelta(days=interval_days)
            days_left = (next_due_date - today).days

            if interval_days == 1:
                if days_since <= 0:
                    return 'COMPLETED', 'Up to date (Completed Today)'
                if days_since == 1:
                    return 'DUE', f'{freq.name} Check Due Today'
                return 'OVERDUE', f'{freq.name} Overdue ({days_since - 1}d)'

            due_window = max(1, interval_days - int(round(interval_days * threshold_pct)))
            if days_since > interval_days:
                return 'OVERDUE', f'{freq.name} Overdue by {days_since - interval_days}d (Due {next_due_date})'
            if days_left <= due_window:
                due_txt = 'Due Today' if days_left <= 0 else f'Due {next_due_date} ({days_left}d left)'
                return 'DUE', f'{freq.name} {due_txt}'
            return 'COMPLETED', f'Next {freq.name} on {next_due_date} ({days_left}d left)'

        # Never fully completed for all currently configured activities
        if latest_any_sub and latest_any_sub.submission_date == today:
            return 'PENDING', f'{freq.name} Partially Completed Today'
        if current_hours > 0 or machine.is_commissioned:
            return 'DUE', f'{freq.name} Check Due'
        return 'SCHEDULED', f'{freq.name} Scheduled'

    # Hour-meter interval schedules (only when explicitly configured with interval_hours)
    interval = float(freq.interval_hours or 50)
    last_hours = float(latest_completed_sub.hour_meter_reading) if latest_completed_sub else 0.0
    hours_since = max(0.0, current_hours - last_hours)
    next_due_at = last_hours + interval

    if latest_completed_sub and hours_since < interval * threshold_pct:
        remaining = max(0, round(next_due_at - current_hours, 1))
        return 'COMPLETED', f'Next at {int(next_due_at)} hrs ({remaining} hrs left)'
    if hours_since >= interval:
        overdue_by = round(hours_since - interval, 1)
        return 'OVERDUE', f'{freq.name} Overdue by {overdue_by} hrs'
    if hours_since >= interval * threshold_pct:
        return 'DUE', f'{freq.name} Due at {int(next_due_at)} hrs'
    if not latest_completed_sub and not machine.is_commissioned and current_hours == 0:
        return 'SCHEDULED', f'Next at {int(next_due_at)} hrs'
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

    # Map active checkable checklist item IDs per frequency directly from Admin configuration
    active_items_by_freq_id: dict[int, set[int]] = {}
    for m_row in ChecklistFrequencyMapping.objects.filter(
        is_active=True,
        checklist_item__is_active=True,
        checklist_item__is_archived=False,
        checklist_item__category__is_active=True,
        checklist_item__category__is_checkable=True,
    ).values('frequency_id', 'checklist_item_id'):
        active_items_by_freq_id.setdefault(m_row['frequency_id'], set()).add(m_row['checklist_item_id'])

    schedules_by_freq_id: dict[int, list[ChecklistFrequencySchedule]] = {}
    for s_obj in ChecklistFrequencySchedule.objects.filter(
        is_active=True,
        checklist_item__is_active=True,
        checklist_item__is_archived=False,
        checklist_item__category__is_active=True,
        checklist_item__category__is_checkable=True,
    ).order_by('id'):
        schedules_by_freq_id.setdefault(s_obj.frequency_id, []).append(s_obj)

    allowed_freqs = [
        f for f in MaintenanceFrequencyMaster.objects.filter(
            code__in=role_ctx['allowed_frequencies'],
            id__in=set(active_items_by_freq_id.keys()),
            is_active=True,
        ).order_by('sort_order', 'id')
    ]

    target_freqs = (
        [f for f in allowed_freqs if f.code == freq_filter]
        if freq_filter not in ('ALL', '', 'NONE')
        else allowed_freqs
    )

    subs_qs = (
        MaintenanceSubmission.objects.select_related('frequency')
        .prefetch_related('responses')
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

    latest_any_by_mf = {}
    latest_complete_by_mf = {}
    latest_by_machine = {}
    subs_count_by_freq = {f.code: 0 for f in allowed_freqs}

    for s in subs_qs:
        f_code = s.frequency.code
        if f_code in subs_count_by_freq:
            subs_count_by_freq[f_code] += 1
        key = (s.machine_id, f_code)
        if key not in latest_any_by_mf:
            latest_any_by_mf[key] = s
        if key not in latest_complete_by_mf:
            req_items = active_items_by_freq_id.get(s.frequency_id, set())
            if _is_submission_complete_for_freq(s, req_items):
                latest_complete_by_mf[key] = s
        if s.machine_id not in latest_by_machine:
            latest_by_machine[s.machine_id] = s

    today = timezone.localdate()
    priority_rank = {'OVERDUE': 5, 'DUE': 4, 'PENDING': 3, 'SCHEDULED': 2, 'COMPLETED': 1, 'NOT_SCHEDULED': 0}

    freq_buckets = {
        f.code: {
            "frequency_code": f.code,
            "frequency_name": f.name,
            "completed": 0,
            "due": 0,
            "pending": 0,
            "scheduled": 0,
            "overdue": 0,
            "submissions_in_range": subs_count_by_freq.get(f.code, 0),
        }
        for f in target_freqs
    }

    machine_rows = []
    upcoming_schedules = []
    kpi_due = 0
    kpi_completed = 0
    kpi_pending = 0
    kpi_overdue = 0
    kpi_upcoming = 0

    for m in machines:
        per_freq_statuses = []
        machine_next_dates = []
        machine_upcoming_dates = []
        machine_sched_summaries = []

        if not target_freqs:
            worst_status = 'NOT_SCHEDULED'
            worst_due_label = 'No Maintenance Activities Configured'
        else:
            worst_status = 'PENDING'
            worst_rank = -1
            worst_due_label = 'Scheduled in Cycle'

            for f in target_freqs:
                latest_any = latest_any_by_mf.get((m.id, f.code))
                latest_complete = latest_complete_by_mf.get((m.id, f.code))
                f_scheds = schedules_by_freq_id.get(f.id, [])
                sched_eval = evaluate_scheduled_cycle(
                    freq=f,
                    schedules=f_scheds,
                    latest_completed_sub=latest_complete,
                    today=today,
                    latest_any_sub=latest_any,
                )

                if sched_eval is not None:
                    st = sched_eval['status']
                    due_label = sched_eval['due_label']
                    next_due_date = sched_eval['next_scheduled_date']
                    last_completed_date = sched_eval['last_completed_date']
                    up_dates = sched_eval['upcoming_dates']
                    sched_summaries = sched_eval['schedule_summaries']
                else:
                    st, due_label = _compute_cycle_status(
                        m,
                        f,
                        latest_complete,
                        today,
                        latest_any_sub=latest_any,
                    )
                    next_due_date = None
                    if f.interval_days and not f.interval_hours:
                        if latest_complete:
                            next_due_date = (latest_complete.submission_date + timedelta(days=max(1, int(f.interval_days)))).isoformat()
                        elif st in ('DUE', 'OVERDUE'):
                            next_due_date = today.isoformat()
                    last_completed_date = latest_complete.submission_date.isoformat() if latest_complete else None
                    up_dates = [next_due_date] if (next_due_date and next_due_date > today.isoformat()) else []
                    sched_summaries = [s.schedule_summary for s in f_scheds if s.schedule_summary]

                if next_due_date:
                    machine_next_dates.append(next_due_date)
                for ud in up_dates:
                    machine_upcoming_dates.append(ud)
                for ss in sched_summaries:
                    if ss not in machine_sched_summaries:
                        machine_sched_summaries.append(ss)

                if up_dates:
                    upcoming_schedules.append(
                        {
                            "machine_id": m.id,
                            "machine_number": m.machine_chassis_no or m.code or m.serial_number,
                            "machine_name": m.name,
                            "frequency_code": f.code,
                            "frequency_name": f.name,
                            "next_due_date": up_dates[0],
                            "upcoming_dates": up_dates,
                            "schedule_summary": ", ".join(sched_summaries) if sched_summaries else f.name,
                            "status": st,
                        }
                    )

                per_freq_statuses.append(
                    {
                        "frequency_code": f.code,
                        "frequency_name": f.name,
                        "status": st,
                        "due_label": due_label,
                        "next_due_date": next_due_date,
                        "last_completed_date": last_completed_date,
                        "upcoming_dates": up_dates,
                        "schedule_summaries": sched_summaries,
                        "last_submitted_at": latest_any.submitted_at.isoformat() if latest_any else None,
                        "last_hour_meter": float(latest_any.hour_meter_reading) if latest_any else None,
                    }
                )
                bucket = freq_buckets[f.code]
                bucket_key = st.lower()
                if bucket_key in bucket:
                    bucket[bucket_key] += 1

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
        elif worst_status in ('PENDING', 'SCHEDULED'):
            kpi_pending += 1

        sorted_next_dates = sorted(set(machine_next_dates))
        sorted_upcoming_dates = sorted(set(machine_upcoming_dates))
        if sorted_upcoming_dates:
            kpi_upcoming += 1

        last_any = latest_by_machine.get(m.id)
        if freq_filter not in ('ALL', '', 'NONE'):
            last_any = latest_any_by_mf.get((m.id, freq_filter)) or last_any

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
                "next_scheduled_date": sorted_next_dates[0] if sorted_next_dates else None,
                "last_maintenance_date": last_any.submission_date.isoformat() if last_any else None,
                "upcoming_dates": sorted_upcoming_dates[:3],
                "schedule_summary": "; ".join(machine_sched_summaries),
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
    for _fc, b in freq_buckets.items():
        completion_pct = round((b["completed"] / total_m) * 100, 1) if total_m else 0.0
        frequency_completion.append(
            {
                **b,
                "pending": b["pending"] + b["scheduled"],
                "total_machines": total_m,
                "completion_rate": completion_pct,
            }
        )

    upcoming_schedules.sort(key=lambda item: (item["next_due_date"], item["machine_number"]))

    return {
        "role_info": role_ctx,
        "kpis": {
            "total_machines": len(machine_rows) if status_filter not in ('ALL', '', 'NONE') else len(machines),
            "maintenance_due": kpi_due,
            "maintenance_completed": kpi_completed,
            "pending_maintenance": kpi_pending,
            "upcoming_maintenance": kpi_upcoming,
            "overdue_maintenance": kpi_overdue,
            "total_submissions": total_submissions_count,
        },
        "frequency_completion": frequency_completion,
        "upcoming_schedules": upcoming_schedules[:25],
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
        MaintenanceSubmission.objects.select_related('frequency')
        .prefetch_related('responses__question_responses')
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
    section_question_map = {}
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

        for resp in s.responses.all():
            qr_rows = list(resp.question_responses.all())
            if qr_rows:
                for qr in qr_rows:
                    sec_label = qr.section_name_snapshot or 'General Inspection'
                    q_label = qr.question_name_snapshot
                    sq_key = (sec_label, q_label)
                    bucket = section_question_map.setdefault(
                        sq_key,
                        {
                            "section_name": sec_label,
                            "question_name": q_label,
                            "responses_count": 0,
                        },
                    )
                    bucket["responses_count"] += 1
            else:
                for qs in (resp.questions_snapshot or []):
                    sec_label = qs.get("section_name") or 'General Inspection'
                    q_label = qs.get("question_name") or ''
                    if not q_label:
                        continue
                    sq_key = (sec_label, q_label)
                    bucket = section_question_map.setdefault(
                        sq_key,
                        {
                            "section_name": sec_label,
                            "question_name": q_label,
                            "responses_count": 0,
                        },
                    )
                    bucket["responses_count"] += 1

    return {
        "kpis": dash["kpis"],
        "frequency_completion": dash["frequency_completion"],
        "approval_summary": approval_counts,
        "activity_compliance_pct": (
            round((total_items_completed / total_items_checked) * 100, 1) if total_items_checked else 0.0
        ),
        "by_vendor": list(by_vendor.values()),
        "by_user": list(by_user.values()),
        "section_question_summary": list(section_question_map.values()),
        "vendor_filter": vendor_id or "ALL",
    }
