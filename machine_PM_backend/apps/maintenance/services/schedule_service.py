import calendar
from datetime import date, timedelta
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from apps.maintenance.models import ChecklistFrequencySchedule, MaintenanceSubmission

WEEKDAY_NAMES = (
    ('MONDAY', 'Monday', 0),
    ('TUESDAY', 'Tuesday', 1),
    ('WEDNESDAY', 'Wednesday', 2),
    ('THURSDAY', 'Thursday', 3),
    ('FRIDAY', 'Friday', 4),
    ('SATURDAY', 'Saturday', 5),
    ('SUNDAY', 'Sunday', 6),
)
WEEKDAY_BY_KEY = {code: idx for code, _label, idx in WEEKDAY_NAMES}
WEEKDAY_LABEL_BY_KEY = {code: label for code, label, _idx in WEEKDAY_NAMES}
WEEKDAY_ALIAS_BY_UPPER = {}
for _code, _label, _idx in WEEKDAY_NAMES:
    WEEKDAY_ALIAS_BY_UPPER[_code] = _code
    WEEKDAY_ALIAS_BY_UPPER[_code[:3]] = _code
    WEEKDAY_ALIAS_BY_UPPER[str(_idx)] = _code

MONTH_NAMES = {
    1: 'January',
    2: 'February',
    3: 'March',
    4: 'April',
    5: 'May',
    6: 'June',
    7: 'July',
    8: 'August',
    9: 'September',
    10: 'October',
    11: 'November',
    12: 'December',
}
MAX_DAYS_IN_MONTH = {
    1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
    7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
}


def _ordinal(n: int | str) -> str:
    if str(n).upper() == 'LAST':
        return 'Last day'
    num = int(n)
    if 11 <= (num % 100) <= 13:
        return f"{num}th"
    return f"{num}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(num % 10, 'th') }"


def _parse_optional_date(raw_val, field_label: str) -> date | None:
    if raw_val in (None, ''):
        return None
    if isinstance(raw_val, date):
        return raw_val
    parsed = parse_date(str(raw_val).strip())
    if not parsed:
        raise ValidationError({"frequency_schedules": f"{field_label} must be a valid calendar date (YYYY-MM-DD)."})
    return parsed


def _parse_day_token(raw_val, owner_label: str, allow_last: bool = True):
    if allow_last and str(raw_val).strip().upper() in ('LAST', 'LAST_DAY', '-1'):
        return 'LAST'
    try:
        day_int = int(raw_val)
    except (TypeError, ValueError):
        raise ValidationError({"frequency_schedules": f"{owner_label}: Invalid day value '{raw_val}'."})
    if day_int < 1 or day_int > 31:
        raise ValidationError({"frequency_schedules": f"{owner_label}: Calendar date {day_int} must be between 1 and 31."})
    return day_int


def _normalize_day_list(raw_list, owner_label: str, allow_last: bool = True) -> list:
    if not isinstance(raw_list, list):
        raise ValidationError({"frequency_schedules": f"{owner_label}: Selected dates must be a list."})
    seen = set()
    numeric = []
    has_last = False
    for entry in raw_list:
        token = _parse_day_token(entry, owner_label, allow_last=allow_last)
        if token in seen:
            raise ValidationError({"frequency_schedules": f"{owner_label}: Duplicate schedule date '{entry}' is not allowed."})
        seen.add(token)
        if token == 'LAST':
            has_last = True
        else:
            numeric.append(token)
    numeric.sort()
    if has_last:
        numeric.append('LAST')
    return numeric


def validate_and_normalize_schedule(freq_code: str, raw_schedule: dict | None) -> dict:
    """
    Validates and normalizes frequency schedule payload into DB-ready fields & human summary.
    If raw_schedule is None (legacy API callers sending only `frequencies: ['WEEKLY']`),
    returns an active DEFAULT schedule to preserve backward compatibility.
    """
    code = str(freq_code or '').strip().upper()
    if raw_schedule is None:
        return {
            "frequency_type": code,
            "schedule_type": ChecklistFrequencySchedule.SCHED_DEFAULT,
            "start_date": None,
            "end_date": None,
            "selected_weekdays": [],
            "selected_dates": [],
            "repeat_interval": {"DAILY": 1, "WEEKLY": 7, "EVERY_15_DAYS": 15, "MONTHLY": 30, "QUARTERLY": 90, "YEARLY": 365}.get(code, 1),
            "use_last_day_fallback": True,
            "quarter_start_month": None,
            "quarter_dates": [],
            "yearly_month": None,
            "yearly_day": None,
            "yearly_schedules": [],
            "buffer_days": 0,
            "allow_duplicate_in_same_slot": False,
            "schedule_summary": "Default interval",
            "is_active": True,
        }

    if not isinstance(raw_schedule, dict):
        raise ValidationError({"frequency_schedules": f"{code}: Invalid schedule configuration."})

    raw_buffer = raw_schedule.get("buffer_days", 0)
    if code == "DAILY":
        if raw_buffer not in (None, "", 0, "0"):
            raise ValidationError({"frequency_schedules": "Daily maintenance cannot have Buffer Days configured."})
        buffer_days = 0
    else:
        if raw_buffer in (None, ""):
            buffer_days = 0
        else:
            try:
                if isinstance(raw_buffer, bool):
                    raise ValueError()
                buffer_days = int(raw_buffer)
            except (TypeError, ValueError):
                raise ValidationError({"frequency_schedules": f"{code}: Buffer Days must be a whole number between 0 and 365."})
            if buffer_days < 0 or buffer_days > 365:
                raise ValidationError({"frequency_schedules": f"{code}: Buffer Days must be between 0 and 365."})

    sched_type = str(raw_schedule.get("schedule_type") or "").strip().upper()
    start_date = (
        _parse_optional_date(raw_schedule.get("start_date"), f"{code} Start Date")
        if code == "EVERY_15_DAYS"
        else None
    )

    use_last_day_fallback = bool(raw_schedule.get("use_last_day_fallback", True))
    allow_dup = bool(raw_schedule.get("allow_duplicate_in_same_slot", False))
    is_active = bool(raw_schedule.get("is_active", True))

    base = {
        "frequency_type": code,
        "schedule_type": ChecklistFrequencySchedule.SCHED_DEFAULT,
        "start_date": None,
        "end_date": None,
        "selected_weekdays": [],
        "selected_dates": [],
        "repeat_interval": None,
        "use_last_day_fallback": use_last_day_fallback,
        "quarter_start_month": None,
        "quarter_dates": [],
        "yearly_month": None,
        "yearly_day": None,
        "yearly_schedules": [],
        "buffer_days": buffer_days,
        "allow_duplicate_in_same_slot": allow_dup,
        "schedule_summary": "",
        "is_active": is_active,
    }

    if sched_type == ChecklistFrequencySchedule.SCHED_DEFAULT:
        base["schedule_summary"] = (
            f"Default interval · Buffer: +{buffer_days}d" if (code != "DAILY" and buffer_days > 0) else "Default interval"
        )
        return base

    if code == "DAILY":
        return {
            "frequency_type": "DAILY",
            "schedule_type": ChecklistFrequencySchedule.SCHED_DAILY_EVERY_DAY,
            "start_date": None,
            "end_date": None,
            "selected_weekdays": [],
            "selected_dates": [],
            "repeat_interval": 1,
            "use_last_day_fallback": True,
            "quarter_start_month": None,
            "quarter_dates": [],
            "yearly_month": None,
            "yearly_day": None,
            "yearly_schedules": [],
            "buffer_days": 0,
            "allow_duplicate_in_same_slot": allow_dup,
            "schedule_summary": "Maintenance is required every calendar day.",
            "is_active": is_active,
        }

    if code == "WEEKLY":
        raw_days = raw_schedule.get("selected_weekdays") or raw_schedule.get("weekdays") or []
        if not isinstance(raw_days, list) or len(raw_days) == 0:
            raise ValidationError({"frequency_schedules": "Weekly: Select exactly one weekday before saving."})
        if len(raw_days) > 1:
            raise ValidationError({"frequency_schedules": "Weekly: Only one weekday can be selected."})
        canon = WEEKDAY_ALIAS_BY_UPPER.get(str(raw_days[0]).strip().upper())
        if not canon:
            raise ValidationError({"frequency_schedules": f"Weekly: Invalid weekday '{raw_days[0]}'."})
        base["schedule_type"] = ChecklistFrequencySchedule.SCHED_WEEKLY_DAYS
        base["selected_weekdays"] = [canon]
        base["repeat_interval"] = 7
        base["schedule_summary"] = _with_buffer_summary(WEEKDAY_LABEL_BY_KEY[canon], buffer_days)
        return base

    if code == "EVERY_15_DAYS":
        if not sched_type:
            sched_type = (
                ChecklistFrequencySchedule.SCHED_TWICE_MONTHLY_DATES
                if (raw_schedule.get("selected_dates") or raw_schedule.get("first_date") is not None)
                else ChecklistFrequencySchedule.SCHED_INTERVAL_15_DAYS
            )
        if sched_type == ChecklistFrequencySchedule.SCHED_INTERVAL_15_DAYS:
            if not start_date:
                raise ValidationError({"frequency_schedules": "Every 15 Days: Start Date is required for interval schedule."})
            raw_int = raw_schedule.get("repeat_interval", 15)
            try:
                interval_days = int(raw_int)
            except (TypeError, ValueError):
                raise ValidationError({"frequency_schedules": "Every 15 Days: Repeat Interval must be a valid integer."})
            if interval_days < 1 or interval_days > 365:
                raise ValidationError({"frequency_schedules": "Every 15 Days: Repeat Interval must be between 1 and 365 days."})
            base["schedule_type"] = ChecklistFrequencySchedule.SCHED_INTERVAL_15_DAYS
            base["start_date"] = start_date
            base["repeat_interval"] = interval_days
            base["schedule_summary"] = _with_buffer_summary(f"Every {interval_days} days from {start_date.isoformat()}", buffer_days)
            return base

        if sched_type == ChecklistFrequencySchedule.SCHED_TWICE_MONTHLY_DATES:
            dates_input = raw_schedule.get("selected_dates")
            if not dates_input:
                d1 = raw_schedule.get("first_date")
                d2 = raw_schedule.get("second_date")
                if d1 in (None, '') or d2 in (None, ''):
                    raise ValidationError({"frequency_schedules": "Every 15 Days: First Date and Second Date are required."})
                dates_input = [d1, d2]
            norm_dates = _normalize_day_list(dates_input, "Every 15 Days", allow_last=True)
            if len(norm_dates) != 2:
                raise ValidationError({"frequency_schedules": "Every 15 Days (Twice Monthly): Select exactly 2 distinct dates (e.g., 1st and 16th)."})
            base["schedule_type"] = ChecklistFrequencySchedule.SCHED_TWICE_MONTHLY_DATES
            base["selected_dates"] = norm_dates
            base["repeat_interval"] = 15
            base["schedule_summary"] = _with_buffer_summary(f"{_ordinal(norm_dates[0])} & {_ordinal(norm_dates[1])} of every month", buffer_days)
            return base

        raise ValidationError({"frequency_schedules": f"Every 15 Days: Unsupported schedule_type '{sched_type}'."})

    if code == "MONTHLY":
        raw_dates = raw_schedule.get("selected_dates") or []
        norm_dates = _normalize_day_list(raw_dates, "Monthly", allow_last=True)
        if len(norm_dates) == 0:
            raise ValidationError({"frequency_schedules": "Monthly: Select at least one maintenance date (1-31 or Last day of month)."})
        base["schedule_type"] = ChecklistFrequencySchedule.SCHED_MONTHLY_DATES
        base["selected_dates"] = norm_dates
        base["repeat_interval"] = 1
        base["schedule_summary"] = _with_buffer_summary(", ".join(_ordinal(d) for d in norm_dates) + " of every month", buffer_days)
        return base

    if code == "QUARTERLY":
        raw_start_month = raw_schedule.get("quarter_start_month", 1)
        try:
            q_start = int(raw_start_month)
        except (TypeError, ValueError):
            raise ValidationError({"frequency_schedules": "Quarterly: Select a valid quarter start month (1-12)."})
        if q_start < 1 or q_start > 12:
            raise ValidationError({"frequency_schedules": "Quarterly: Quarter start month must be between 1 and 12."})

        raw_q_interval = raw_schedule.get("repeat_interval", 3)
        try:
            q_interval = int(raw_q_interval)
        except (TypeError, ValueError):
            raise ValidationError({"frequency_schedules": "Quarterly: Repeat interval must be a valid number of months."})
        if q_interval < 1 or q_interval > 12:
            raise ValidationError({"frequency_schedules": "Quarterly: Repeat interval must be between 1 and 12 months."})

        raw_q_dates = raw_schedule.get("quarter_dates") or raw_schedule.get("selected_dates") or []
        if not raw_q_dates and raw_schedule.get("maintenance_date") not in (None, ''):
            raw_q_dates = [raw_schedule.get("maintenance_date")]
        norm_q_dates = _normalize_day_list(raw_q_dates, "Quarterly", allow_last=True)
        if len(norm_q_dates) == 0:
            raise ValidationError({"frequency_schedules": "Quarterly: Select at least one maintenance date."})

        quarter_months = sorted({((q_start - 1 + k * q_interval) % 12) + 1 for k in range(12)})
        if not use_last_day_fallback:
            for d in norm_q_dates:
                if d != 'LAST' and not any(d <= MAX_DAYS_IN_MONTH[m] for m in quarter_months):
                    raise ValidationError({"frequency_schedules": f"Quarterly: Day {d} does not exist in selected quarter months."})

        m_labels = [MONTH_NAMES[((q_start - 1 + k * q_interval) % 12) + 1][:3] for k in range(4)]
        d_labels = ", ".join(_ordinal(d) for d in norm_q_dates)
        base["schedule_type"] = ChecklistFrequencySchedule.SCHED_QUARTERLY_DATES
        base["quarter_start_month"] = q_start
        base["quarter_dates"] = norm_q_dates
        base["selected_dates"] = norm_q_dates
        base["repeat_interval"] = q_interval
        base["schedule_summary"] = _with_buffer_summary(f"{d_labels} ({', '.join(dict.fromkeys(m_labels))})", buffer_days)
        return base

    if code == "YEARLY":
        raw_ys = raw_schedule.get("yearly_schedules") or []
        if not raw_ys and raw_schedule.get("yearly_month") and raw_schedule.get("yearly_day"):
            raw_ys = [{"month": raw_schedule.get("yearly_month"), "day": raw_schedule.get("yearly_day")}]
        if not isinstance(raw_ys, list) or len(raw_ys) == 0:
            raise ValidationError({"frequency_schedules": "Yearly: Add at least one month and date schedule."})

        clean_ys = []
        seen_pairs = set()
        for idx, entry in enumerate(raw_ys, start=1):
            if not isinstance(entry, dict):
                raise ValidationError({"frequency_schedules": f"Yearly schedule #{idx}: Invalid entry."})
            try:
                m_int = int(entry.get("month"))
            except (TypeError, ValueError):
                raise ValidationError({"frequency_schedules": f"Yearly schedule #{idx}: Select a valid month (1-12)."})
            if m_int < 1 or m_int > 12:
                raise ValidationError({"frequency_schedules": f"Yearly schedule #{idx}: Month must be between 1 and 12."})

            day_tok = _parse_day_token(entry.get("day"), f"Yearly schedule #{idx}", allow_last=True)
            if day_tok != 'LAST':
                max_d = MAX_DAYS_IN_MONTH[m_int]
                if day_tok > max_d:
                    raise ValidationError(
                        {
                            "frequency_schedules": (
                                f"Yearly schedule #{idx}: {MONTH_NAMES[m_int]} cannot have day {day_tok} (maximum {max_d} days)."
                            )
                        }
                    )
            pair = (m_int, day_tok)
            if pair in seen_pairs:
                raise ValidationError(
                    {
                        "frequency_schedules": (
                            f"Yearly: Duplicate schedule '{MONTH_NAMES[m_int]} {_ordinal(day_tok)}' is not allowed."
                        )
                    }
                )
            seen_pairs.add(pair)
            clean_ys.append({"month": m_int, "day": day_tok})

        clean_ys.sort(key=lambda r: (r["month"], 99 if r["day"] == 'LAST' else int(r["day"])))
        base["schedule_type"] = ChecklistFrequencySchedule.SCHED_YEARLY_DATES
        base["yearly_schedules"] = clean_ys
        base["yearly_month"] = clean_ys[0]["month"]
        base["yearly_day"] = None if clean_ys[0]["day"] == 'LAST' else int(clean_ys[0]["day"])
        base["repeat_interval"] = 1
        base["schedule_summary"] = _with_buffer_summary(", ".join(f"{_ordinal(r['day'])} {MONTH_NAMES[r['month']]}" for r in clean_ys), buffer_days)
        return base

    raise ValidationError({"frequency_schedules": f"Unsupported frequency type '{freq_code}'."})


def _with_buffer_summary(summary: str, buffer_days: int) -> str:
    return f"{summary} · Buffer: +{buffer_days}d" if buffer_days > 0 else summary


def serialize_schedule(s: ChecklistFrequencySchedule | None) -> dict | None:
    if not s:
        return None
    eff_buffer = 0 if s.frequency_type == 'DAILY' else int(getattr(s, 'buffer_days', 0) or 0)
    return {
        "id": s.id,
        "frequency_code": s.frequency_type,
        "frequency_type": s.frequency_type,
        "schedule_type": s.schedule_type,
        "start_date": s.start_date.isoformat() if s.start_date else None,
        "end_date": s.end_date.isoformat() if s.end_date else None,
        "selected_weekdays": s.selected_weekdays or [],
        "selected_dates": s.selected_dates or [],
        "repeat_interval": s.repeat_interval,
        "use_last_day_fallback": s.use_last_day_fallback,
        "quarter_start_month": s.quarter_start_month,
        "quarter_dates": s.quarter_dates or [],
        "yearly_month": s.yearly_month,
        "yearly_day": s.yearly_day,
        "yearly_schedules": s.yearly_schedules or [],
        "buffer_days": eff_buffer,
        "allow_duplicate_in_same_slot": s.allow_duplicate_in_same_slot,
        "schedule_summary": s.schedule_summary or "",
        "is_active": s.is_active,
    }


def _resolve_day_in_month(year: int, month: int, day_spec, use_last_day_fallback: bool) -> date | None:
    days_in_month = calendar.monthrange(year, month)[1]
    if str(day_spec).upper() == 'LAST':
        return date(year, month, days_in_month)
    day_int = int(day_spec)
    if day_int <= days_in_month:
        return date(year, month, day_int)
    if use_last_day_fallback:
        return date(year, month, days_in_month)
    return None


def _iter_months(d_start: date, d_end: date):
    y, m = d_start.year, d_start.month
    while (y, m) <= (d_end.year, d_end.month):
        yield y, m
        if m == 12:
            y += 1
            m = 1
        else:
            m += 1


def get_schedule_dates_in_range(
    sched: ChecklistFrequencySchedule,
    range_start: date,
    range_end: date,
) -> list[date]:
    if not sched.is_active or sched.schedule_type == ChecklistFrequencySchedule.SCHED_DEFAULT:
        return []

    st = sched.schedule_type
    results: set[date] = set()

    if st == ChecklistFrequencySchedule.SCHED_DAILY_EVERY_DAY:
        cur = range_start
        while cur <= range_end:
            results.add(cur)
            cur += timedelta(days=1)
        return sorted(results)

    created_local = timezone.localtime(sched.created_at).date() if sched.created_at else range_start
    anchor_start = sched.start_date if (st == ChecklistFrequencySchedule.SCHED_INTERVAL_15_DAYS and sched.start_date) else (sched.start_date or created_local)
    eff_start = max(range_start, anchor_start)
    eff_end = range_end
    if eff_end < eff_start:
        return []

    elif st == ChecklistFrequencySchedule.SCHED_WEEKLY_DAYS:
        target_wd = {WEEKDAY_BY_KEY[k] for k in (sched.selected_weekdays or []) if k in WEEKDAY_BY_KEY}
        if target_wd:
            cur = eff_start
            while cur <= eff_end:
                if cur.weekday() in target_wd:
                    results.add(cur)
                cur += timedelta(days=1)

    elif st == ChecklistFrequencySchedule.SCHED_INTERVAL_15_DAYS:
        anchor = sched.start_date or eff_start
        step = max(1, int(sched.repeat_interval or 15))
        if anchor <= eff_end:
            if anchor < eff_start:
                offset = ((eff_start - anchor).days + step - 1) // step
                cur = anchor + timedelta(days=offset * step)
            else:
                cur = anchor
            while cur <= eff_end:
                results.add(cur)
                cur += timedelta(days=step)

    elif st in (ChecklistFrequencySchedule.SCHED_TWICE_MONTHLY_DATES, ChecklistFrequencySchedule.SCHED_MONTHLY_DATES):
        tokens = sched.selected_dates or []
        for y, m in _iter_months(eff_start, eff_end):
            for tok in tokens:
                dt = _resolve_day_in_month(y, m, tok, sched.use_last_day_fallback)
                if dt and eff_start <= dt <= eff_end:
                    results.add(dt)

    elif st == ChecklistFrequencySchedule.SCHED_QUARTERLY_DATES:
        q_start = int(sched.quarter_start_month or 1)
        q_interval = max(1, int(sched.repeat_interval or 3))
        tokens = sched.quarter_dates or sched.selected_dates or []
        anchor_year = eff_start.year
        anchor_months_idx = (anchor_year * 12) + (q_start - 1)
        for y, m in _iter_months(eff_start, eff_end):
            m_idx = (y * 12) + (m - 1)
            if (m_idx - anchor_months_idx) % q_interval != 0:
                continue
            for tok in tokens:
                dt = _resolve_day_in_month(y, m, tok, sched.use_last_day_fallback)
                if dt and eff_start <= dt <= eff_end:
                    results.add(dt)

    elif st == ChecklistFrequencySchedule.SCHED_YEARLY_DATES:
        entries = sched.yearly_schedules or []
        if not entries and sched.yearly_month and sched.yearly_day:
            entries = [{"month": sched.yearly_month, "day": sched.yearly_day}]
        for y in range(eff_start.year, eff_end.year + 1):
            for entry in entries:
                m_int = int(entry.get("month"))
                dt = _resolve_day_in_month(y, m_int, entry.get("day"), sched.use_last_day_fallback)
                if dt and eff_start <= dt <= eff_end:
                    results.add(dt)

    return sorted(results)


def evaluate_scheduled_cycle(
    *,
    freq,
    schedules: list[ChecklistFrequencySchedule],
    latest_completed_sub: MaintenanceSubmission | None,
    today: date,
    latest_any_sub: MaintenanceSubmission | None = None,
) -> dict | None:
    """
    Evaluates due/overdue/completed/upcoming state when custom schedules exist.
    Returns None if only legacy DEFAULT schedules (or none) exist so callers can fall back to interval logic.
    """
    custom_scheds = [
        s for s in schedules
        if s.is_active and s.schedule_type != ChecklistFrequencySchedule.SCHED_DEFAULT
    ]
    if not custom_scheds:
        return None

    if all(s.schedule_type == ChecklistFrequencySchedule.SCHED_DAILY_EVERY_DAY for s in custom_scheds):
        created_local = min(
            (timezone.localtime(s.created_at).date() if s.created_at else today)
            for s in custom_scheds
        )
        tomorrow = today + timedelta(days=1)
        if latest_completed_sub and latest_completed_sub.submission_date >= today:
            status = 'COMPLETED'
            next_scheduled = tomorrow
            due_label = f"Next Daily on {tomorrow}"
        elif latest_any_sub and latest_any_sub.submission_date == today:
            status = 'PENDING'
            next_scheduled = today
            due_label = "Daily Partially Completed Today"
        elif latest_completed_sub and (today - latest_completed_sub.submission_date).days > 1:
            gap = (today - latest_completed_sub.submission_date).days - 1
            status = 'OVERDUE'
            next_scheduled = today
            due_label = f"Daily Overdue ({gap}d)"
        elif not latest_completed_sub and created_local < today:
            gap = (today - created_local).days
            status = 'OVERDUE'
            next_scheduled = today
            due_label = f"Daily Overdue ({gap}d)"
        else:
            status = 'DUE'
            next_scheduled = today
            due_label = f"Daily Due Today ({today})"

        summaries = ["Maintenance is required every calendar day."]
        completed_today = bool(latest_any_sub and latest_any_sub.submission_date >= today)
        allow_dup = all(bool(s.allow_duplicate_in_same_slot) for s in custom_scheds)
        return {
            "status": status,
            "due_label": due_label,
            "current_occurrence_date": today.isoformat(),
            "completion_deadline_date": today.isoformat(),
            "next_scheduled_date": next_scheduled.isoformat(),
            "upcoming_dates": [tomorrow.isoformat(), (today + timedelta(days=2)).isoformat(), (today + timedelta(days=3)).isoformat()],
            "last_completed_date": latest_completed_sub.submission_date.isoformat() if latest_completed_sub else None,
            "schedule_summaries": summaries,
            "buffer_days": 0,
            "within_buffer_period": False,
            "allow_duplicate_in_same_slot": allow_dup,
            "already_completed_for_occurrence": completed_today if not allow_dup else False,
            "existing_submission_number": (
                latest_any_sub.submission_number if (completed_today and not allow_dup and latest_any_sub) else None
            ),
        }

    min_anchor = today
    for s in custom_scheds:
        created_local = timezone.localtime(s.created_at).date() if s.created_at else today
        anchor = s.start_date or created_local
        if anchor < min_anchor:
            min_anchor = anchor

    range_start = min_anchor - timedelta(days=1)
    range_end = today + timedelta(days=400)

    all_dates: set[date] = set()
    buffer_by_date: dict[date, int] = {}
    for s in custom_scheds:
        s_buffer = 0 if getattr(freq, 'code', s.frequency_type) == 'DAILY' else int(getattr(s, 'buffer_days', 0) or 0)
        s_dates = get_schedule_dates_in_range(s, range_start, range_end)
        for d in s_dates:
            all_dates.add(d)
            if s_buffer > buffer_by_date.get(d, 0):
                buffer_by_date[d] = s_buffer

    sorted_dates = sorted(all_dates)
    past_or_today = [d for d in sorted_dates if d <= today]
    future = [d for d in sorted_dates if d > today]

    last_due = past_or_today[-1] if past_or_today else None
    next_future = future[0] if future else None
    eff_buffer = (
        0
        if getattr(freq, 'code', '') == 'DAILY'
        else (buffer_by_date.get(last_due, max(buffer_by_date.values(), default=0)) if last_due else max((int(getattr(s, 'buffer_days', 0) or 0) for s in custom_scheds), default=0))
    )
    completion_deadline = (last_due + timedelta(days=eff_buffer)) if last_due is not None else None
    within_buffer = False

    completed_this_slot = bool(
        last_due is not None
        and latest_completed_sub is not None
        and latest_completed_sub.submission_date >= last_due
    )
    any_submitted_this_slot = bool(
        last_due is not None
        and latest_any_sub is not None
        and latest_any_sub.submission_date >= last_due
    )

    if last_due is not None:
        if completed_this_slot:
            status = 'COMPLETED'
            next_scheduled = next_future
            due_label = f"Next {freq.name} on {next_future}" if next_future else f"{freq.name} Completed ({last_due})"
        elif latest_any_sub and latest_any_sub.submission_date == today:
            status = 'PENDING'
            next_scheduled = last_due
            within_buffer = bool(eff_buffer > 0 and last_due < today <= completion_deadline)
            due_label = f"{freq.name} Partially Completed Today"
        elif last_due == today:
            status = 'DUE'
            next_scheduled = today
            due_label = (
                f"{freq.name} Due Today ({today} · Deadline {completion_deadline})"
                if eff_buffer > 0
                else f"{freq.name} Due Today ({today})"
            )
        elif completion_deadline is not None and today <= completion_deadline:
            status = 'DUE'
            next_scheduled = last_due
            within_buffer = True
            days_left = (completion_deadline - today).days
            due_label = f"{freq.name} Within Buffer ({days_left}d left · Scheduled {last_due}, Deadline {completion_deadline})"
        else:
            overdue_ref = completion_deadline or last_due
            overdue_days = (today - overdue_ref).days
            status = 'OVERDUE'
            next_scheduled = last_due
            due_label = (
                f"{freq.name} Overdue by {overdue_days}d (Scheduled {last_due}, Deadline {completion_deadline})"
                if eff_buffer > 0
                else f"{freq.name} Overdue by {overdue_days}d (Due {last_due})"
            )
    else:
        status = 'SCHEDULED'
        next_scheduled = next_future
        due_label = f"Next {freq.name} on {next_future}" if next_future else f"{freq.name} No Upcoming Dates"

    summaries = list(dict.fromkeys(s.schedule_summary for s in custom_scheds if s.schedule_summary))
    allow_dup = all(bool(s.allow_duplicate_in_same_slot) for s in custom_scheds)

    return {
        "status": status,
        "due_label": due_label,
        "current_occurrence_date": last_due.isoformat() if last_due else None,
        "completion_deadline_date": completion_deadline.isoformat() if completion_deadline else None,
        "next_scheduled_date": next_scheduled.isoformat() if next_scheduled else None,
        "upcoming_dates": [d.isoformat() for d in future[:3]],
        "last_completed_date": latest_completed_sub.submission_date.isoformat() if latest_completed_sub else None,
        "schedule_summaries": summaries,
        "buffer_days": eff_buffer,
        "within_buffer_period": within_buffer,
        "allow_duplicate_in_same_slot": allow_dup,
        "already_completed_for_occurrence": any_submitted_this_slot if not allow_dup else False,
        "existing_submission_number": (
            latest_any_sub.submission_number if (any_submitted_this_slot and not allow_dup and latest_any_sub) else None
        ),
    }
