from datetime import datetime, timedelta, time
from django.utils import timezone
from django.db.models import Q
from .models import AttendanceRecord

def auto_checkout_overnight_records():
    """
    Automatically checks out any active 'CHECKED_IN' attendance record whose check-in 
    session has crossed 12:00 AM (midnight) IST of the next day.
    Sets check_out time to 12:00 AM IST of next day, calculates total working hours,
    and updates status to 'CHECKED_OUT'.
    Also automatically stores 'NOT_MARKED' records for active vendor team members and machines.
    """
    now = timezone.now()
    active_recs = AttendanceRecord.objects.filter(status='CHECKED_IN', check_out__isnull=True)
    updated_count = 0

    for rec in active_recs:
        check_in_dt = rec.check_in or rec.created_at
        if not check_in_dt:
            continue

        local_check_in = timezone.localtime(check_in_dt)
        # Target cutoff: 12:00 AM (midnight) IST of the next day
        cutoff_date = local_check_in.date() + timedelta(days=1)
        cutoff_dt = timezone.make_aware(
            datetime.combine(cutoff_date, time(0, 0, 0)),
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

            note_msg = "Auto checked-out at 12:00 AM IST (System)"
            if rec.notes:
                if note_msg not in rec.notes:
                    rec.notes = f"{rec.notes} | {note_msg}"
            else:
                rec.notes = note_msg

            rec.save(update_fields=['check_out', 'status', 'total_working_seconds', 'total_working_hours', 'notes', 'updated_at'])
            updated_count += 1
            user_display = getattr(rec.user, 'username', rec.user_id) if rec.user else rec.user_id
            print(f"[AutoCheckout] Record #{rec.id} (User: {user_display}) auto checked-out at {cutoff_dt}")

    # Auto store NOT_MARKED records for yesterday
    unmarked_count = auto_store_unmarked_records()

    return updated_count


def auto_store_unmarked_records(target_date=None):
    """
    Automatically stores 'NOT_MARKED' AttendanceRecord entries in the database for 
    all active vendor team members and assigned machines who did not mark attendance 
    for target_date (which must be strictly before today).
    Defaults to yesterday's date if target_date is not specified.
    """
    today = timezone.localdate()
    if target_date is None:
        target_date = today - timedelta(days=1)
    elif isinstance(target_date, str):
        try:
            target_date = datetime.strptime(target_date, '%Y-%m-%d').date()
        except ValueError:
            return 0

    # Only persist NOT_MARKED for past closed dates (today is still live/ongoing)
    if target_date >= today:
        return 0

    from apps.vendors.models import Vendor
    from apps.users.models import User
    from apps.integrations.ilync_client import IlyncClient

    active_vendors = list(Vendor.objects.filter(is_active=True))
    client = IlyncClient(timeout=(3.0, 8.0))
    created_count = 0

    fallback_admin = User.objects.filter(is_superuser=True).first() or User.objects.filter(role='ADMIN').first()

    for v_obj in active_vendors:
        ext_v_id = str(v_obj.external_vendor_id or v_obj.id).strip()
        v_payload = {}
        try:
            live_res = client.get_vendor_by_id(ext_v_id)
            v_payload = live_res.get('data') if (isinstance(live_res, dict) and live_res.get('success')) else (live_res if isinstance(live_res, dict) else {})
        except Exception as e:
            continue

        if not isinstance(v_payload, dict):
            continue

        # 1. Team Members
        raw_users = v_payload.get('users') or []
        for u_info in raw_users:
            if not isinstance(u_info, dict):
                continue
            ext_u_id = str(u_info.get('userId') or u_info.get('id') or '').strip()
            if ext_u_id.lower() in ('none', 'null', ''):
                ext_u_id = None
            emp_id = str(u_info.get('empId') or '').strip() or None
            mobile = str(u_info.get('mobile') or u_info.get('phone') or '').strip()
            name = str(u_info.get('name') or u_info.get('contactName') or 'Team Member').strip()
            designation = str(u_info.get('designation') or u_info.get('role') or 'OPERATOR').strip()

            # Find matching user in Hero DB
            matched_user = None
            if ext_u_id:
                matched_user = User.objects.filter(external_user_id=ext_u_id).first()
            if not matched_user and mobile:
                matched_user = User.objects.filter(vendor=v_obj, phone_number=mobile).first() or User.objects.filter(vendor=v_obj, username=mobile).first()
            if not matched_user and emp_id:
                matched_user = User.objects.filter(vendor=v_obj, employee_id=emp_id).first()

            if not matched_user:
                try:
                    username_candidate = mobile or emp_id or (ext_u_id[:15] if ext_u_id else f"u_{name[:8]}")
                    matched_user = User.objects.create(
                        username=username_candidate,
                        external_user_id=ext_u_id,
                        employee_id=emp_id,
                        phone_number=mobile,
                        role='OPERATOR',
                        designation=designation,
                        vendor=v_obj,
                        is_active=True
                    )
                except Exception:
                    matched_user = User.objects.filter(username=username_candidate).first()

            if not matched_user:
                continue

            # Check if record already exists for target_date
            exists = AttendanceRecord.objects.filter(
                user=matched_user,
                date=target_date
            ).exclude(attendance_type='MACHINE').exists()

            if not exists:
                emp_display = emp_id or matched_user.employee_id or f"EMP-{matched_user.id}"
                AttendanceRecord.objects.create(
                    user=matched_user,
                    vendor=v_obj,
                    date=target_date,
                    status='NOT_MARKED',
                    approval_status='NOT_APPLICABLE',
                    attendance_type='TEAM',
                    external_user_id_snapshot=ext_u_id,
                    employee_id_snapshot=emp_display,
                    user_name_snapshot=name,
                    phone_number_snapshot=mobile,
                    role_snapshot=designation,
                    vendor_external_id_snapshot=getattr(v_obj, 'external_vendor_id', None),
                    vendor_name_snapshot=v_obj.name,
                    notes="Auto-stored NOT_MARKED at 12:00 AM next day (System)"
                )
                created_count += 1

        # 2. Machines
        raw_machines = v_payload.get('machines') or v_payload.get('assigned_machines') or []
        for m_info in raw_machines:
            if not isinstance(m_info, dict):
                continue
            mac_id = str(m_info.get('id') or '').strip()
            chassis_val = str(m_info.get('machineNo') or m_info.get('machine_no') or m_info.get('code') or '').strip()
            if not mac_id and not chassis_val:
                continue

            # Check if machine record exists for target_date
            mac_exists = AttendanceRecord.objects.filter(
                date=target_date,
                attendance_type='MACHINE'
            ).filter(
                Q(machine_id=mac_id) | Q(machine_chassis_no=chassis_val)
            ).exists()

            if not mac_exists:
                v_user = User.objects.filter(vendor=v_obj).first() or fallback_admin
                if not v_user:
                    continue
                AttendanceRecord.objects.create(
                    user=v_user,
                    vendor=v_obj,
                    date=target_date,
                    status='NOT_MARKED',
                    approval_status='NOT_APPLICABLE',
                    attendance_type='MACHINE',
                    machine_id=mac_id,
                    machine_chassis_no=chassis_val,
                    vendor_external_id_snapshot=getattr(v_obj, 'external_vendor_id', None),
                    vendor_name_snapshot=v_obj.name,
                    notes="Auto-stored NOT_MARKED machine record at 12:00 AM next day (System)"
                )
                created_count += 1

    if created_count > 0:
        print(f"[AutoStoreNotMarked] Created {created_count} NOT_MARKED record(s) for date {target_date}")
    return created_count
