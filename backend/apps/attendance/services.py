from datetime import datetime, timedelta, time
from django.utils import timezone
from .models import AttendanceRecord

def auto_checkout_overnight_records():
    """
    Automatically checks out any active 'CHECKED_IN' attendance record whose check-in 
    session has crossed 05:00 AM IST of the next morning.
    Sets check_out time to 05:00 AM IST of next day, calculates total working hours,
    and updates status to 'CHECKED_OUT'.
    """
    now = timezone.now()
    active_recs = AttendanceRecord.objects.filter(status='CHECKED_IN', check_out__isnull=True)
    updated_count = 0

    for rec in active_recs:
        check_in_dt = rec.check_in or rec.created_at
        if not check_in_dt:
            continue

        local_check_in = timezone.localtime(check_in_dt)
        # Target cutoff: 05:00 AM IST on the morning after check_in date
        cutoff_date = local_check_in.date() + timedelta(days=1)
        cutoff_dt = timezone.make_aware(
            datetime.combine(cutoff_date, time(5, 0, 0)),
            timezone=timezone.get_current_timezone()
        )

        if now >= cutoff_dt:
            rec.check_out = cutoff_dt
            rec.status = 'CHECKED_OUT'

            delta = cutoff_dt - check_in_dt
            total_seconds = max(0, int(delta.total_seconds()))
            rec.total_working_seconds = total_seconds
            hrs = total_seconds // 3600
            mins = (total_seconds % 3600) // 60
            rec.total_working_hours = f"{hrs:02d}h {mins:02d}m"

            note_msg = "Auto checked-out at 05:00 AM IST (System)"
            if rec.notes:
                if note_msg not in rec.notes:
                    rec.notes = f"{rec.notes} | {note_msg}"
            else:
                rec.notes = note_msg

            rec.save()
            updated_count += 1
            print(f"[AutoCheckout] Record #{rec.id} (User: {rec.user.username}) auto checked-out at {cutoff_dt}")

    return updated_count
