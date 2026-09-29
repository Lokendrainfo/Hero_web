from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
from django.db.models import Q
from datetime import datetime
from .models import AttendanceRecord, ATTENDANCE_STATUS_CHOICES
from .serializers import AttendanceRecordSerializer, build_secure_media_url
from apps.authentication.models import User
from apps.common.permissions import IsVendorAuthorized
from apps.common.responses import success_response, error_response
from apps.common.vendor_scope import get_user_vendor_ids, get_user_vendor, check_vendor_access, filter_queryset_by_vendor
from django.conf import settings
from apps.notifications.models import Notification
from .services import auto_checkout_overnight_records, auto_store_unmarked_records
from apps.common.reporting_scope import get_reporting_scope

import base64
from django.db import transaction
from django.core.files.base import ContentFile
from django.core.cache import cache
from apps.integrations.ilync_client import IlyncClient

def get_live_ilync_vendors(use_cache=True, ttl=10, force_refresh=False):
    """
    Fetches the comprehensive list of all active vendors, machines, and users
    from iLync GET /api/vendor/list in a single fast call.
    Returns tuple: (vendors_list, is_fallback)
    """
    cache_key = "ilync_live_vendor_list"
    last_good_key = "ilync_live_vendor_list_last_good"

    if use_cache and not force_refresh:
        cached = cache.get(cache_key)
        if cached is not None and isinstance(cached, list):
            return (cached, False)

    client = IlyncClient()
    try:
        res = client.get("api/vendor/list")
        if res and isinstance(res, dict) and res.get('success'):
            data = res.get('data')
            if isinstance(data, list) and data:
                cache.set(cache_key, data, timeout=ttl)
                cache.set(last_good_key, data, timeout=86400)
                return (data, False)
    except Exception as err:
        print(f"[AttendanceRosterSync] Failed to fetch live vendor list from iLync: {err}")

    # Fallback to last known good vendor list across transient errors
    last_good = cache.get(last_good_key)
    if last_good is not None and isinstance(last_good, list):
        return (last_good, True)

    return ([], True)


def get_vendor_ilync_detail(vendor_obj_or_ext_id, use_cache=True, ttl=10, force_refresh=False, return_status=False):
    """
    Fetches vendor detail from iLync GET /api/vendor/{external_vendor_id}.
    Returns data dictionary (or None if unavailable/error).
    - Caches with short TTL (default 10s) to ensure data is always fresh.
    - Preserves last known good cache across outages to prevent catastrophic user deletion during temporary API failures.
    - If return_status is True, returns tuple: (v_data, is_fallback).
    """
    if not vendor_obj_or_ext_id:
        return (None, False) if return_status else None

    if hasattr(vendor_obj_or_ext_id, 'external_vendor_id'):
        ext_v_id = getattr(vendor_obj_or_ext_id, 'external_vendor_id', None)
    else:
        ext_v_id = str(vendor_obj_or_ext_id).strip()

    if not ext_v_id:
        return (None, False) if return_status else None

    cache_key = f"ilync_vendor_detail_{ext_v_id}"
    last_good_key = f"ilync_vendor_detail_last_good_{ext_v_id}"

    if use_cache and not force_refresh:
        cached = cache.get(cache_key)
        if cached is not None and isinstance(cached, dict):
            return (cached, False) if return_status else cached

    client = IlyncClient()
    try:
        res = client.get_vendor_by_id(ext_v_id)
        if res and isinstance(res, dict) and res.get('success'):
            v_data = res.get('data') if 'data' in res and isinstance(res.get('data'), dict) else res
            if isinstance(v_data, dict):
                v_data.pop('_is_fallback', None)
                cache.set(cache_key, v_data, timeout=ttl)
                cache.set(last_good_key, v_data, timeout=86400)
                return (v_data, False) if return_status else v_data
        elif isinstance(res, dict) and not res.get('success'):
            print(f"[AttendanceRosterSync] Vendor {ext_v_id} lookup failed from iLync: {res.get('message')}. Preserving last known roster.")
    except Exception as err:
        print(f"[AttendanceRosterSync] Exception fetching vendor {ext_v_id} from iLync: {err}. Preserving last known roster.")

    # Fallback to last known good cache if iLync fails (timeout, 500, network error)
    last_good = cache.get(last_good_key)
    if last_good is not None and isinstance(last_good, dict):
        last_good = dict(last_good)
        last_good['_is_fallback'] = True
        return (last_good, True) if return_status else last_good

    return (None, False) if return_status else None

def process_attendance_photo(request_or_data, photo_type='checkin', user_id=None):
    """
    Decodes & processes check-in or check-out photo file or Base64 string from request payload or data dict.
    Supports:
    - Multipart files: check_in_photo, check_out_photo, photo, check_in_photo_base64, check_out_photo_base64
    - Base64 data strings (with or without 'data:image/...;base64,' header)
    Returns a ContentFile image object or File object, or None.
    """
    prefix = 'check_out' if photo_type in ('checkout', 'check_out') else 'check_in'

    # Extract FILES and DATA from request or dict object
    req_files = getattr(request_or_data, 'FILES', {}) if hasattr(request_or_data, 'FILES') else {}
    req_data = getattr(request_or_data, 'data', request_or_data) if hasattr(request_or_data, 'data') else request_or_data
    if not isinstance(req_data, dict):
        req_data = getattr(request_or_data, 'data', {})

    if not user_id and isinstance(req_data, dict):
        user_id = req_data.get('user_id') or req_data.get('marked_for_user_id') or req_data.get('user')

    # 1. Check FILES multipart first
    photo_file = (
        req_files.get(f'{prefix}_photo') or
        req_files.get('photo') or
        req_files.get(f'{prefix}_photo_base64') or
        req_files.get('check_in_photo') or
        req_files.get('check_out_photo')
    )
    if photo_file:
        return photo_file

    # 2. Check DATA payload strings (Base64 / URL)
    photo_raw = None
    if isinstance(req_data, dict):
        photo_raw = (
            req_data.get(f'{prefix}_photo') or
            req_data.get(f'{prefix}_photo_base64') or
            req_data.get('photo') or
            req_data.get('photo_base64') or
            req_data.get('check_in_photo') or
            req_data.get('check_in_photo_base64') or
            req_data.get('check_out_photo') or
            req_data.get('check_out_photo_base64')
        )

    if not photo_raw:
        return None

    if isinstance(photo_raw, str):
        photo_str = photo_raw.strip()
        if not photo_str or photo_str.upper() in ('NO_PHOTO_ATTACHED', 'NULL', 'UNDEFINED'):
            return None

        # Handle data URL base64 format (e.g. data:image/jpeg;base64,...)
        if 'data:image' in photo_str and ';base64,' in photo_str:
            try:
                fmt, imgstr = photo_str.split(';base64,')
                ext = fmt.split('/')[-1].split('+')[0].lower()
                if ext == 'jpeg':
                    ext = 'jpg'
                elif ext not in ['jpg', 'png', 'webp', 'gif']:
                    ext = 'jpg'
                data = base64.b64decode(imgstr)
                ts = int(timezone.now().timestamp())
                uid = user_id or 'user'
                return ContentFile(data, name=f"attendance_{uid}_{ts}.{ext}")
            except Exception as e:
                print(f"[PhotoProcessing] Error decoding data:image base64: {e}")
                return None

        # Handle pure base64 string without data:image header
        if len(photo_str) > 50 and not photo_str.startswith('http'):
            try:
                data = base64.b64decode(photo_str)
                ts = int(timezone.now().timestamp())
                uid = user_id or 'user'
                return ContentFile(data, name=f"attendance_{uid}_{ts}.jpg")
            except Exception as e:
                print(f"[PhotoProcessing] Error decoding raw base64 string: {e}")
                return None

    return photo_raw


def notify_user(target_user, title, body):
    if target_user and getattr(target_user, 'is_active', True):
        try:
            Notification.objects.create(user=target_user, title=title, body=body)
        except Exception as e:
            print(f"[Notification] Error creating notification: {e}")

def async_notify_user(target_user, title, body):
    """
    Fire-and-forget notification executed in a background daemon thread
    to guarantee zero latency impact on interactive HTTP endpoints.
    """
    import threading
    def _run():
        try:
            notify_user(target_user, title, body)
        except Exception as err:
            print(f"[AsyncNotification] Error: {err}")
    threading.Thread(target=_run, daemon=True).start()

def resolve_reporting_manager(target_user, marked_by_user=None, vendor=None):
    """
    Resolves the appropriate reporting manager for attendance submission & approvals.
    Priority:
    1. Direct target_user.reporting_manager (if set and active).
    2. If marked_by_user is provided and is different from target_user and has a Manager/Supervisor/Vendor role, use marked_by_user.
    3. If target_user has a vendor (or vendor parameter is passed), find the Vendor's primary Admin/Manager/Supervisor user.
    4. Fallback to System Admin (user_id=1 or first superuser).
    """
    if not target_user:
        return marked_by_user

    if target_user.reporting_manager and target_user.reporting_manager.is_active:
        return target_user.reporting_manager

    # 2. Check marked_by_user
    if marked_by_user and marked_by_user.id != target_user.id:
        roles_upper = [r.upper() for r in marked_by_user.get_role_list()]
        if any(r in ['VENDOR', 'VENDOR_ADMIN', 'SUPERVISOR', 'MANAGER', 'PROJECT_MANAGER', 'ADMIN'] for r in roles_upper):
            if not target_user.reporting_manager_id:
                try:
                    target_user.reporting_manager = marked_by_user
                    target_user.save(update_fields=['reporting_manager'])
                except Exception as e:
                    print(f"[ReportingManager] Exception updating user reporting_manager: {e}")
            return marked_by_user

    # 3. Check vendor primary admin/manager user
    target_vendor = vendor or getattr(target_user, 'vendor', None) or get_user_vendor(target_user, resolve_fallback=False, allow_network=False)
    if target_vendor:
        vendor_mgr = User.objects.filter(
            Q(vendor=target_vendor) | Q(hero_vendor_assignments__vendor=target_vendor)
        ).filter(
            Q(role__icontains='VENDOR') | Q(roles__name__icontains='VENDOR') |
            Q(role__icontains='MANAGER') | Q(roles__name__icontains='MANAGER') |
            Q(role__icontains='SUPERVISOR') | Q(roles__name__icontains='SUPERVISOR')
        ).filter(is_active=True).exclude(id=target_user.id).order_by('id').first()

        if vendor_mgr:
            if not target_user.reporting_manager_id:
                try:
                    target_user.reporting_manager = vendor_mgr
                    target_user.save(update_fields=['reporting_manager'])
                except Exception as e:
                    print(f"[ReportingManager] Exception updating user reporting_manager from vendor: {e}")
            return vendor_mgr

    # 4. System Admin fallback
    admin_user = User.objects.filter(is_superuser=True, is_active=True).order_by('id').first()
    return admin_user or marked_by_user

def validate_approval_permission(request_user, attendance_record):
    # 1. Self-approval guard (403 Forbidden)
    if attendance_record.user_id == request_user.id:
        return Response(
            {"detail": "You cannot approve or reject your own attendance record."},
            status=status.HTTP_403_FORBIDDEN
        )

    # 2. Hierarchy & Vendor authorization guard (403 Forbidden)
    is_admin = request_user.is_superuser or 'ADMIN' in request_user.get_role_list()
    if not is_admin:
        subordinate_ids = get_reporting_scope(request_user)
        subordinate_ids = [uid for uid in subordinate_ids if uid != request_user.id]

        is_direct_mgr = (
            attendance_record.reporting_manager_id == request_user.id or
            (attendance_record.user and attendance_record.user.reporting_manager_id == request_user.id)
        )
        is_marked_by = (attendance_record.marked_by_id == request_user.id)

        user_vendor_ids = get_user_vendor_ids(request_user)
        is_same_vendor = False
        if user_vendor_ids and attendance_record.vendor_id in user_vendor_ids:
            is_same_vendor = True

        if not (is_direct_mgr or is_marked_by or (attendance_record.user_id in subordinate_ids) or is_same_vendor):
            return Response(
                {"detail": "You are not authorized to approve or reject attendance for this employee."},
                status=status.HTTP_403_FORBIDDEN
            )

    return None

def extract_geo(data_dict, keys):
    if not isinstance(data_dict, dict):
        return ''
    for k in keys:
        val = data_dict.get(k)
        if not val:
            continue
        if isinstance(val, list) and len(val) > 0:
            res_items = []
            for item in val:
                if isinstance(item, dict):
                    s = str(item.get('name') or item.get('code') or item.get('blockName') or '').strip()
                elif isinstance(item, (str, int, float)):
                    s = str(item).strip()
                else:
                    s = ''
                if s and s.upper() not in ('NONE', 'NULL', 'UNDEFINED'):
                    res_items.append(s)
            if res_items:
                return ', '.join(res_items)
        elif isinstance(val, dict):
            s = str(val.get('name') or val.get('code') or val.get('blockName') or '').strip()
            if s and s.upper() not in ('NONE', 'NULL', 'UNDEFINED'):
                return s
        elif isinstance(val, (str, int, float)) and str(val).strip():
            s = str(val).strip()
            if s and s.upper() not in ('NONE', 'NULL', 'UNDEFINED'):
                return s
    return ''


def resolve_target_user(user_id_param, request_user=None, external_user_id=None, sync_live=False):
    """
    Resolves target Hero User for attendance operations.
    PRIMARY IDENTITY RULE:
    external_user_id is the primary identity.
    If external_user_id exists:
      1. Resolve the Hero User using external_user_id.
      2. Do not fall back to another user based on phone/name/employee ID.
    """
    if not user_id_param and not external_user_id:
        return None
    if isinstance(user_id_param, User):
        return user_id_param

    # 1. Primary: Search by explicit external_user_id
    ext_id = str(external_user_id).strip() if external_user_id else None
    if ext_id and ext_id.lower() in ('none', 'null', 'undefined', ''):
        ext_id = None

    param_str = str(user_id_param).strip() if user_id_param else ''
    if param_str and param_str.lower() in ('none', 'null', 'undefined', ''):
        param_str = ''

    # If param_str looks like a 24-char ObjectId token and ext_id was not provided, treat param_str as ext_id
    if not ext_id and len(param_str) == 24 and not param_str.isdigit():
        ext_id = param_str

    if ext_id:
        u = User.objects.filter(external_user_id=ext_id).first()
        if u:
            return u

    # 1b. Search if param_str itself matches an external_user_id
    if param_str:
        u = User.objects.filter(external_user_id=param_str).first()
        if u:
            return u

    # 1c. Search if param_str is digit matching local User ID primary key
    if param_str and param_str.isdigit():
        u = User.objects.filter(id=int(param_str)).first()
        if u:
            return u

    target_vendor = None
    if request_user:
        target_vendor = getattr(request_user, 'vendor', None) or get_user_vendor(request_user, allow_network=False)

    # 2. Check authorizing vendor's iLync team roster for this member
    if target_vendor and (ext_id or param_str):
        v_data = get_vendor_ilync_detail(target_vendor)
        if v_data and isinstance(v_data, dict):
            raw_users = v_data.get('users') or []
            lookup_token = ext_id or param_str
            for u_info in raw_users:
                if not isinstance(u_info, dict):
                    continue
                m_uid = str(u_info.get('userId') or u_info.get('id') or '').strip()
                m_emp = str(u_info.get('empId') or '').strip()
                m_phone = str(u_info.get('mobile') or u_info.get('phone') or '').strip()
                m_name = str(u_info.get('name') or u_info.get('contactName') or '').strip()
                if (lookup_token and (lookup_token in (m_uid, m_emp, m_phone) or lookup_token.lower() == m_name.lower())):
                    if m_uid:
                        u = User.objects.filter(external_user_id=m_uid).first()
                        if u:
                            return u
                        # If user exists by phone or empId in DB, enrich with m_uid
                        if m_phone:
                            u = User.objects.filter(Q(phone_number=m_phone) | Q(username=m_phone)).first()
                            if u:
                                if not u.external_user_id:
                                    u.external_user_id = m_uid
                                    u.save(update_fields=['external_user_id'])
                                return u
                        # Create shell user for this iLync team member
                        clean_u = clean_username(m_name.replace(' ', '_') if m_name else m_uid)
                        if User.objects.filter(username=clean_u).exists():
                            clean_u = f"{clean_u}_{int(timezone.now().timestamp())}"
                        u, _ = User.objects.get_or_create(
                            username=clean_u,
                            defaults={
                                'external_user_id': m_uid,
                                'first_name': m_name.split()[0] if m_name else '',
                                'last_name': ' '.join(m_name.split()[1:]) if len(m_name.split()) > 1 else '',
                                'vendor': target_vendor,
                                'phone_number': m_phone or None,
                                'employee_id': m_emp or None,
                                'role': normalize_attendance_role(u_info.get('designation') or u_info.get('role')),
                                'is_active': True
                            }
                        )
                        return u

    # 3. Search by employee_id, username, phone_number, email (search globally across Hero DB)
    if param_str:
        u = User.objects.filter(
            Q(employee_id=param_str) |
            Q(username=param_str) |
            Q(phone_number=param_str) |
            Q(email__iexact=param_str)
        ).first()
        if u:
            return u

        # 3b. Search with common vendor/employee prefixes stripped (e.g. VND-9000000010, EMP-9000000010)
        for prefix in ('VND-', 'EMP-', 'VND_', 'EMP_'):
            if param_str.upper().startswith(prefix):
                clean_token = param_str[len(prefix):].split('-')[0].strip()
                if clean_token:
                    u = User.objects.filter(
                        Q(username=clean_token) |
                        Q(phone_number=clean_token) |
                        Q(employee_id__icontains=clean_token)
                    ).first()
                    if u:
                        return u

    # 4. If still not found and request_user has a vendor with external_vendor_id, sync live vendor users to resolve (only if sync_live=True)
    if sync_live and target_vendor and getattr(target_vendor, 'external_vendor_id', None) and param_str:
        try:
            from apps.vendors.services import sync_vendor_detail_links
            sync_vendor_detail_links(target_vendor, target_vendor.external_vendor_id)
            u = User.objects.filter(external_user_id=param_str).first()
            if u:
                return u
            u = User.objects.filter(
                Q(employee_id=param_str) |
                Q(username=param_str) |
                Q(phone_number=param_str)
            ).first()
            if u:
                return u
        except Exception:
            pass

    # 5. If still not found and param looks like an external id token (not pure numeric), create lightweight shell user
    if param_str and len(param_str) > 10 and not param_str.isdigit():
        base_name = param_str.split('@')[0] if '@' in param_str else param_str
        clean_u = clean_username(base_name)
        if User.objects.filter(username=clean_u).exists():
            clean_u = f"{clean_u}_{int(timezone.now().timestamp())}"

        u, _ = User.objects.get_or_create(
            username=clean_u,
            defaults={
                'external_user_id': param_str,
                'first_name': base_name,
                'vendor': target_vendor,
                'is_active': True
            }
        )
        return u

    return None

def clean_username(val):
    clean = "".join(c for c in val if c.isalnum() or c in ('_', '-'))
    return clean if clean else f"user_{int(timezone.now().timestamp())}"


ATTENDANCE_SCOPE_ROLES = ('HERO', 'VENDOR', 'OPERATOR', 'TRACKER', 'HELPER')


def normalize_attendance_role(designation_or_role):
    """
    Map iLync designation / local role into dashboard attendance scopes:
    HERO | VENDOR | OPERATOR | TRACKER | HELPER
    """
    raw = str(designation_or_role or '').strip().upper()
    if not raw:
        return 'OPERATOR'
    compact = raw.replace('-', '_').replace(' ', '_')
    # Prefer specific scopes before generic OPERATOR fallback
    if compact in ATTENDANCE_SCOPE_ROLES:
        return compact
    if 'HELPER' in compact or compact in ('HELP', 'HELPERS', 'MAZDOOR', 'LABOUR', 'LABOR'):
        return 'HELPER'
    if 'TRACK' in compact:
        return 'TRACKER'
    if compact == 'VENDOR' or compact.startswith('VENDOR') or 'VENDOR_ADMIN' in compact:
        return 'VENDOR'
    # designation "HERO" / "HERO STAFF" — avoid matching random vendor names here
    if compact == 'HERO' or compact.startswith('HERO_') or compact.endswith('_HERO'):
        return 'HERO'
    if any(token in compact for token in ('OPERAT', 'DRIVER', 'FIELD', 'SURVEY', 'TECHNICIAN')):
        return 'OPERATOR'
    return 'OPERATOR'


def empty_scope_matrix():
    return [
        {'scope': scope, 'total': 0, 'present': 0, 'not_marked': 0}
        for scope in ATTENDANCE_SCOPE_ROLES
    ]


def bump_scope_matrix(matrix_by_scope, role, status):
    scope = normalize_attendance_role(role)
    if scope not in matrix_by_scope:
        scope = 'OPERATOR'
    row = matrix_by_scope[scope]
    row['total'] += 1
    st = str(status or 'NOT_MARKED').upper().replace(' ', '_')
    if st in ('PRESENT', 'CHECKED_IN', 'CHECKED_OUT'):
        row['present'] += 1
    elif st in ('NOT_MARKED', 'NOT_CHECKED_IN', ''):
        row['not_marked'] += 1


def _issue_reason_text(row):
    """Build a human-readable reason from OEM breakdown / Ops stop payload."""
    if not isinstance(row, dict):
        return ''
    keys = row.get('reason_keys') or []
    labels = []
    if isinstance(keys, list):
        for key in keys:
            if isinstance(key, dict):
                label = str(key.get('label') or key.get('code') or '').strip()
                if label:
                    labels.append(label)
            elif key:
                labels.append(str(key).strip())
    text = str(row.get('reason') or row.get('note') or '').strip()
    if labels and text:
        return f"{', '.join(labels)} — {text}"
    if labels:
        return ', '.join(labels)
    return text


def _is_open_issue(row):
    """Only treat explicitly open (and not closed/resolved) tickets as active issues."""
    if not isinstance(row, dict):
        return False
    st = str(row.get('status') or '').strip().upper().replace(' ', '_')
    if st in ('CLOSED', 'RESOLVED', 'DONE', 'COMPLETED', 'CANCELLED', 'CANCELED'):
        return False
    # Must be an open-like status — never infer open from blank/unknown
    if st not in ('OPEN', 'SEEN', 'ACCEPTED', 'IN_PROGRESS', 'PENDING', 'ACTIVE'):
        return False
    # Hard stop if close/resolve timestamps exist
    if row.get('closed_at') or row.get('resolved_at') or row.get('closed_by'):
        return False
    return True


def _issue_sort_key(row):
    return str(
        row.get('started_at')
        or row.get('occurred_at')
        or row.get('created_at')
        or row.get('id')
        or ''
    )


def _index_open_machine_issues():
    """
    Fetch open OEM breakdowns + Ops stops once and index by chassis.
    Used to show Not Working reason next to machine attendance.
    Only OPEN (non-closed) FiberForce tickets are included.
    """
    oem_by_chassis = {}
    ops_by_chassis = {}
    try:
        from apps.integrations.fiberforce.client import FiberForceClient
        client = FiberForceClient()

        def ingest(payload, bucket, kind):
            data = payload.get('data') if isinstance(payload, dict) else payload
            rows = data if isinstance(data, list) else (
                data.get('results') if isinstance(data, dict) else []
            )
            if not isinstance(rows, list):
                return
            open_rows = [row for row in rows if isinstance(row, dict) and _is_open_issue(row)]
            # Newest first so setdefault keeps the latest open ticket
            open_rows.sort(key=_issue_sort_key, reverse=True)
            for row in open_rows:
                chassis = str(
                    row.get('machine_chassis_no')
                    or row.get('chassis_no')
                    or row.get('machine_no')
                    or ''
                ).strip()
                if not chassis:
                    continue
                entry = {
                    'kind': kind,
                    'id': row.get('id'),
                    'tt_number': row.get('tt_number') or (
                        f"{'BD' if kind == 'OEM' else 'OS'}-{row.get('id')}" if row.get('id') is not None else None
                    ),
                    'status': str(row.get('status') or 'OPEN').upper(),
                    'reason': _issue_reason_text(row),
                    'severity': row.get('severity'),
                    'started_at': row.get('occurred_at') or row.get('started_at'),
                }
                bucket.setdefault(chassis, entry)

        ingest(client.fleet_breakdowns(status='open', limit=500), oem_by_chassis, 'OEM')
        ingest(client.fleet_ops_stops(status='open', limit=500), ops_by_chassis, 'OPS')
    except Exception as e:
        print(f"[AttendanceRoster] Failed loading open machine issues: {e}")

    return oem_by_chassis, ops_by_chassis


def _machine_working_payload(m_status, chassis_val, oem_by_chassis, ops_by_chassis):
    chassis = str(chassis_val or '').strip()
    oem = oem_by_chassis.get(chassis)
    ops = ops_by_chassis.get(chassis)
    # Prefer OEM breakdown over Ops stop when both open
    issue = oem or ops

    working_attendance = m_status in ('CHECKED_IN', 'PRESENT', 'OPERATING', 'CHECKED_OUT', 'WORKING')

    if issue:
        working_state = 'NOT_WORKING'
    elif working_attendance:
        working_state = 'WORKING'
    else:
        working_state = 'NOT_MARKED'

    return {
        'working_state': working_state,
        'is_working': working_state == 'WORKING',
        'issue_kind': issue.get('kind') if issue else None,
        'issue_id': issue.get('id') if issue else None,
        'issue_ticket': issue.get('tt_number') if issue else None,
        'issue_status': issue.get('status') if issue else None,
        'issue_reason': issue.get('reason') if issue else None,
        'issue_severity': issue.get('severity') if issue else None,
        'issue_started_at': issue.get('started_at') if issue else None,
        'open_oem': bool(oem),
        'open_ops': bool(ops),
    }


def validate_employee_attendance_access(request_user, target_user, vendor_obj=None):
    """
    Validates if request_user is authorized to manage/view attendance for target_user.
    PRIMARY SOURCE OF TRUTH:
      iLync vendor API data.users[] list.
      A vendor can mark attendance for ANY ACTIVE USER returned in that vendor's
      iLync vendor API users[] list:
          iLync users[].userId == target_user.external_user_id
    Returns HTTP 403 PermissionDenied if unauthorized.
    """
    if not request_user or not request_user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    if request_user.is_superuser or 'ADMIN' in request_user.get_role_list():
        return True

    allowed_vendor_ids = get_user_vendor_ids(request_user)
    if allowed_vendor_ids is None:
        return True

    if not allowed_vendor_ids:
        raise PermissionDenied("You do not have permission to manage attendance for this employee.")

    from apps.vendors.models import Vendor

    # 1. Determine the authorizing vendor from allowed vendors of request_user
    authorizing_vendor = None
    if vendor_obj and vendor_obj.id in allowed_vendor_ids:
        authorizing_vendor = vendor_obj

    # If vendor_obj was not provided or was not in request_user's allowed vendors
    # (e.g. client passed target_user.vendor_id), resolve from request_user's authorized vendors:
    if not authorizing_vendor:
        user_ven = getattr(request_user, 'vendor', None) or get_user_vendor(request_user, allow_network=False)
        if user_ven and user_ven.id in allowed_vendor_ids:
            authorizing_vendor = user_ven

    if not authorizing_vendor and allowed_vendor_ids:
        target_ext_uid = getattr(target_user, 'external_user_id', None)
        cand_vendors = list(Vendor.objects.filter(id__in=allowed_vendor_ids))
        if target_ext_uid and len(cand_vendors) > 1:
            for cv in cand_vendors:
                cv_data = get_vendor_ilync_detail(cv)
                if cv_data and isinstance(cv_data, dict):
                    cv_users = cv_data.get('users') or []
                    cv_uids = {
                        str(u.get('userId') or u.get('id')).strip()
                        for u in cv_users
                        if isinstance(u, dict) and u.get('active') is True and (u.get('userId') or u.get('id'))
                    }
                    if target_ext_uid in cv_uids:
                        authorizing_vendor = cv
                        break
        if not authorizing_vendor and cand_vendors:
            authorizing_vendor = cand_vendors[0]

    if not authorizing_vendor:
        raise PermissionDenied("You do not have permission to manage attendance for this employee.")

    # 2. Check if authorizing_vendor has an iLync external_vendor_id
    ext_v_id = getattr(authorizing_vendor, 'external_vendor_id', None)
    target_ext_uid = getattr(target_user, 'external_user_id', None)
    is_self_checkin = (request_user.id == target_user.id)

    if ext_v_id:
        v_data = get_vendor_ilync_detail(authorizing_vendor)
        if not v_data or not isinstance(v_data, dict):
            # If this is personal self-check-in for a local employee without external_user_id (e.g. test fixtures), fall back to local check
            if is_self_checkin and not target_ext_uid:
                pass
            else:
                print(f"[AttendanceAuth] Failed to retrieve live iLync roster for vendor={authorizing_vendor.id} (ext={ext_v_id}) | target_user_id={getattr(target_user, 'id', None)}")
                raise PermissionDenied(f"Unable to verify live team roster from iLync for vendor '{authorizing_vendor.name}'.")
        else:
            raw_users = v_data.get('users') or []
            active_ilync_user_ids = {
                str(u.get('userId') or u.get('id')).strip()
                for u in raw_users
                if isinstance(u, dict) and u.get('active') is True and (u.get('userId') or u.get('id'))
            }

            # If target_user has no external_user_id, attempt to match by phone or empId from vendor roster
            if not target_ext_uid:
                tgt_phone = getattr(target_user, 'phone_number', None) or target_user.username
                tgt_emp = getattr(target_user, 'employee_id', None)
                for u_item in raw_users:
                    if isinstance(u_item, dict) and u_item.get('active') is True:
                        m_phone = str(u_item.get('mobile') or u_item.get('phone') or '').strip()
                        m_emp = str(u_item.get('empId') or '').strip()
                        if (tgt_phone and m_phone == tgt_phone) or (tgt_emp and m_emp == tgt_emp):
                            target_ext_uid = str(u_item.get('userId') or u_item.get('id')).strip()
                            target_user.external_user_id = target_ext_uid
                            try:
                                target_user.save(update_fields=['external_user_id'])
                            except Exception:
                                pass
                            break

            if not target_ext_uid:
                from rest_framework.exceptions import ValidationError
                raise ValidationError("Target employee has no associated external user ID.")

            if target_ext_uid not in active_ilync_user_ids:
                print(f"[AttendanceAuth] DENIED: target_ext_uid={target_ext_uid} not in vendor {authorizing_vendor.id} ({authorizing_vendor.name}) active iLync users: {active_ilync_user_ids}")
                raise PermissionDenied(f"Employee is not an active team member under vendor '{authorizing_vendor.name}' in iLync.")

            print(f"[AttendanceAuth] ALLOWED: target_ext_uid={target_ext_uid} verified in vendor {authorizing_vendor.id} ({authorizing_vendor.name}) active iLync users")
            return True

    # Fallback for vendors without external_vendor_id (e.g. local test fixtures):
    target_vendor_ids = []
    if target_user.vendor_id:
        target_vendor_ids.append(target_user.vendor_id)
    target_assignments = list(target_user.hero_vendor_assignments.filter(is_active=True).values_list('vendor_id', flat=True))
    target_vendor_ids.extend(target_assignments)

    if target_vendor_ids:
        if not any(v_id in allowed_vendor_ids for v_id in target_vendor_ids):
            raise PermissionDenied("You do not have permission to manage attendance for this employee.")
    return True

class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = AttendanceRecord.objects.all()
    serializer_class = AttendanceRecordSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        allowed_vendor_ids = get_user_vendor_ids(user)

        if allowed_vendor_ids is None:
            qs = AttendanceRecord.objects.all().exclude(
                Q(user__is_superuser=True) | Q(user__role__iexact='ADMIN') | Q(user__roles__name__iexact='ADMIN')
            ).distinct().select_related('user', 'vendor', 'marked_by', 'updated_by', 'approved_by', 'marked_for_user')
        elif not allowed_vendor_ids:
            return AttendanceRecord.objects.none()
        else:
            qs = AttendanceRecord.objects.filter(
                Q(vendor_id__in=allowed_vendor_ids) |
                Q(user__vendor_id__in=allowed_vendor_ids) |
                Q(user__hero_vendor_assignments__vendor_id__in=allowed_vendor_ids)
            ).exclude(
                Q(user__is_superuser=True) | Q(user__role__iexact='ADMIN') | Q(user__roles__name__iexact='ADMIN')
            ).distinct().select_related('user', 'vendor', 'marked_by', 'updated_by', 'approved_by', 'marked_for_user')

        req_vendor = self.request.query_params.get('vendor_id') or self.request.query_params.get('vendor')
        if req_vendor and str(req_vendor).strip() and req_vendor != 'all':
            check_vendor_access(user, req_vendor)
            qs = qs.filter(
                Q(vendor__external_vendor_id=req_vendor) |
                Q(vendor__name__icontains=req_vendor) |
                Q(vendor_id=req_vendor if str(req_vendor).isdigit() else None)
            )

        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(date=date_param)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)

        user_id_param = self.request.query_params.get('user_id') or self.request.query_params.get('user')
        if user_id_param:
            if str(user_id_param).isdigit():
                qs = qs.filter(user_id=int(user_id_param))
            else:
                qs = qs.filter(
                    Q(user__external_user_id=user_id_param) |
                    Q(user__employee_id=user_id_param) |
                    Q(user__username=user_id_param)
                )

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            qs = qs.filter(status__iexact=status_param)

        approval_status_param = self.request.query_params.get('approval_status')
        if approval_status_param and approval_status_param.upper() != 'ALL':
            qs = qs.filter(approval_status__iexact=approval_status_param)

        role_param = self.request.query_params.get('role')
        if role_param and role_param.upper() != 'ALL':
            qs = qs.filter(
                Q(user__role__iexact=role_param) |
                Q(user__roles__name__iexact=role_param)
            )

        search_param = self.request.query_params.get('search')
        if search_param:
            sp = search_param.strip()
            qs = qs.filter(
                Q(user__first_name__icontains=sp) |
                Q(user__last_name__icontains=sp) |
                Q(user__username__icontains=sp) |
                Q(user__employee_id__icontains=sp) |
                Q(user__external_user_id__icontains=sp)
            )

        return qs.order_by('-date', '-created_at', 'user_id')

    def create(self, request, *args, **kwargs):
        user_id_val = request.data.get('user') or request.data.get('user_id') or request.data.get('employee_id')
        if not user_id_val:
            return error_response(message="Target employee (user or user_id) is required.", status_code=status.HTTP_400_BAD_REQUEST)

        target_user = resolve_target_user(user_id_val)
        if not target_user:
            return error_response(message="Target employee not found.", status_code=status.HTTP_404_NOT_FOUND)

        validate_employee_attendance_access(request.user, target_user)

        rec_date = request.data.get('date') or timezone.localdate()
        status_val = (request.data.get('status') or 'PRESENT').upper()
        notes_val = request.data.get('notes') or request.data.get('remarks') or ''
        check_in_val = request.data.get('check_in')
        check_out_val = request.data.get('check_out')

        target_vendor = target_user.vendor or get_user_vendor(target_user) or get_user_vendor(request.user)
        reporting_mgr = target_user.reporting_manager

        record, created = AttendanceRecord.objects.get_or_create(
            user=target_user,
            date=rec_date,
            defaults={
                'vendor': target_vendor,
                'reporting_manager': reporting_mgr,
                'status': status_val,
                'approval_status': request.data.get('approval_status') or 'PENDING',
                'notes': notes_val,
                'check_in': check_in_val,
                'check_out': check_out_val,
                'marked_by': request.user,
                'updated_by': request.user
            }
        )

        if not created:
            record.status = status_val
            if not record.reporting_manager and reporting_mgr:
                record.reporting_manager = reporting_mgr
            if notes_val:
                record.notes = notes_val
            if check_in_val:
                record.check_in = check_in_val
            if check_out_val:
                record.check_out = check_out_val
            record.updated_by = request.user
            if target_vendor and not record.vendor:
                record.vendor = target_vendor
            record.save()

        if created and reporting_mgr:
            notify_user(
                reporting_mgr,
                "Pending Attendance Approval",
                f"Attendance for {target_user.get_full_name() or target_user.username} submitted for {rec_date} requires your approval."
            )

        return success_response(
            data=AttendanceRecordSerializer(record, context={'request': request}).data,
            message=f"Attendance for {target_user.get_full_name() or target_user.username} saved successfully.",
            status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        record = self.get_object()
        validate_employee_attendance_access(request.user, record.user)
        request.data['updated_by'] = request.user.id
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        record = self.get_object()
        validate_employee_attendance_access(request.user, record.user)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        record = self.get_object()
        validate_employee_attendance_access(request.user, record.user)
        return super().destroy(request, *args, **kwargs)

    # 4.1 Fetch Today's Attendance Status
    @action(detail=False, methods=['get'], url_path='today')
    def today_attendance(self, request):
        auto_checkout_overnight_records()
        today = timezone.localdate()
        user = request.user
        record = AttendanceRecord.objects.filter(user=user, date=today).exclude(attendance_type='MACHINE').order_by('-created_at').first()
        if not record:
            return Response(None, status=status.HTTP_200_OK)
        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    # 4.2 Employee Check-In (Self or Marked for Team Member)
    @action(detail=False, methods=['post'], url_path='check-in')
    def check_in(self, request):
        import time
        t_global_start = time.perf_counter()
        print(f"[AttendanceCheckInTiming] START | request_user_id={getattr(request.user, 'id', None)}")

        ext_user_id = (
            request.data.get('external_user_id') or
            request.data.get('externalUserId') or
            request.data.get('ext_user_id') or
            request.data.get('externalId')
        )
        target_user_id = (
            request.data.get('user_id') or
            request.data.get('marked_for_user_id') or
            request.data.get('user') or
            request.data.get('userId') or
            request.data.get('id') or
            request.data.get('employee_id') or
            request.data.get('employeeId') or
            request.data.get('empId')
        )
        req_vendor_id = request.data.get('vendor_id') or request.data.get('vendor') or request.data.get('vendorId')

        if target_user_id and not ext_user_id and len(str(target_user_id).strip()) == 24 and not str(target_user_id).strip().isdigit():
            ext_user_id = str(target_user_id).strip()

        user = request.user
        target_requested = bool(ext_user_id or target_user_id)

        # 1. USER_RESOLUTION
        t_user_start = time.perf_counter()
        if target_requested:
            target_user = resolve_target_user(target_user_id, request_user=request.user, external_user_id=ext_user_id, sync_live=False)
            if not target_user:
                t_user_elapsed = (time.perf_counter() - t_user_start) * 1000
                print(f"[AttendanceCheckInTiming] USER_RESOLUTION | elapsed_ms={t_user_elapsed:.2f}ms | target_not_found=True")
                return error_response(
                    message=f"Target employee not found for identifier '{ext_user_id or target_user_id}'.",
                    status_code=status.HTTP_404_NOT_FOUND
                )
            user = target_user
        t_user_elapsed = (time.perf_counter() - t_user_start) * 1000
        print(f"[AttendanceCheckInTiming] USER_RESOLUTION | elapsed_ms={t_user_elapsed:.2f}ms | user_id={getattr(user, 'id', None)} | external_user_id={getattr(user, 'external_user_id', None)}")

        # 2. AUTHORIZATION & VENDOR RESOLUTION
        t_auth_start = time.perf_counter()
        allowed_v_ids = get_user_vendor_ids(request.user)

        authorizing_vendor = None
        if req_vendor_id:
            from apps.vendors.models import Vendor
            req_v_str = str(req_vendor_id).strip()
            cand_v = None
            if req_v_str.isdigit():
                cand_v = Vendor.objects.filter(id=int(req_v_str)).first()
            if not cand_v:
                cand_v = Vendor.objects.filter(external_vendor_id=req_v_str).first()
            if not cand_v:
                cand_v = Vendor.objects.filter(name__iexact=req_v_str).first()
            if cand_v and (allowed_v_ids is None or cand_v.id in allowed_v_ids):
                authorizing_vendor = cand_v

        if not authorizing_vendor:
            user_ven = getattr(request.user, 'vendor', None) or get_user_vendor(request.user, allow_network=False)
            if user_ven and (allowed_v_ids is None or user_ven.id in allowed_v_ids):
                authorizing_vendor = user_ven

        if not authorizing_vendor and allowed_v_ids:
            from apps.vendors.models import Vendor
            authorizing_vendor = Vendor.objects.filter(id__in=allowed_v_ids).first()

        # Validate logged-in user's authorization for that vendor and target team member via iLync roster
        validate_employee_attendance_access(request.user, user, vendor_obj=authorizing_vendor)

        t_auth_elapsed = (time.perf_counter() - t_auth_start) * 1000
        print(f"[AttendanceCheckInTiming] AUTHORIZATION | elapsed_ms={t_auth_elapsed:.2f}ms | auth_result=AUTHORIZED")

        # 3. VENDOR_RESOLUTION (The vendor whose iLync roster authorized the check-in)
        t_vend_start = time.perf_counter()
        target_vendor = authorizing_vendor or user.vendor or get_user_vendor(user, allow_network=False)
        reporting_mgr = resolve_reporting_manager(user, marked_by_user=request.user, vendor=target_vendor)
        t_vend_elapsed = (time.perf_counter() - t_vend_start) * 1000
        print(f"[AttendanceCheckInTiming] VENDOR_RESOLUTION | elapsed_ms={t_vend_elapsed:.2f}ms | vendor_id={getattr(target_vendor, 'id', None)} | vendor_name={getattr(target_vendor, 'name', None)}")

        # 4. PHOTO_PROCESSING
        t_photo_start = time.perf_counter()
        processed_photo = process_attendance_photo(request, 'checkin', user.id)
        t_photo_elapsed = (time.perf_counter() - t_photo_start) * 1000
        print(f"[AttendanceCheckInTiming] PHOTO_PROCESSING | elapsed_ms={t_photo_elapsed:.2f}ms | has_photo={bool(processed_photo)}")

        today = timezone.localdate()
        lat = request.data.get('latitude') or request.data.get('check_in_latitude')
        lng = request.data.get('longitude') or request.data.get('check_in_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_in_accuracy')
        loc_source = request.data.get('location_source') or 'GPS'
        att_type = request.data.get('attendance_type') or 'TEAM'
        if att_type == 'MACHINE':
            att_type = 'TEAM'

        # Snapshot data
        ext_uid_snap = getattr(user, 'external_user_id', None) or (str(ext_user_id).strip() if ext_user_id else None)
        emp_id_snap = getattr(user, 'employee_id', None) or (request.data.get('employee_id') if request.data.get('employee_id') else None) or f"EMP-{user.id}"
        u_name_snap = user.get_full_name() or user.username
        phone_snap = getattr(user, 'phone_number', None) or user.username
        role_snap = getattr(user, 'designation', None) or (user.get_role_list()[0] if hasattr(user, 'get_role_list') and user.get_role_list() else getattr(user, 'role', 'OPERATOR'))
        v_ext_id_snap = getattr(target_vendor, 'external_vendor_id', None) if target_vendor else None
        v_name_snap = getattr(target_vendor, 'name', '') if target_vendor else ''

        # 5. ATTENDANCE_CREATE
        t_create_start = time.perf_counter()
        existing = AttendanceRecord.objects.filter(user=user, date=today).exclude(attendance_type='MACHINE').first()
        if existing:
            existing.status = 'CHECKED_IN'
            if not existing.check_in:
                existing.check_in = timezone.now()
            if processed_photo:
                existing.check_in_photo = processed_photo
            if lat is not None and str(lat).strip() != '': existing.check_in_latitude = float(lat)
            if lng is not None and str(lng).strip() != '': existing.check_in_longitude = float(lng)
            if acc is not None and str(acc).strip() != '': existing.check_in_accuracy = float(acc)
            if loc_source: existing.location_source = loc_source
            existing.updated_by = request.user
            if target_vendor and (not existing.vendor_id or existing.vendor_id != target_vendor.id):
                existing.vendor = target_vendor
                existing.vendor_name_snapshot = v_name_snap
                existing.vendor_external_id_snapshot = v_ext_id_snap

            # Populate snapshot fields
            if not existing.external_user_id_snapshot: existing.external_user_id_snapshot = ext_uid_snap
            if not existing.employee_id_snapshot: existing.employee_id_snapshot = emp_id_snap
            if not existing.user_name_snapshot: existing.user_name_snapshot = u_name_snap
            if not existing.phone_number_snapshot: existing.phone_number_snapshot = phone_snap
            if not existing.role_snapshot: existing.role_snapshot = role_snap
            if not existing.vendor_name_snapshot: existing.vendor_name_snapshot = v_name_snap
            if not existing.vendor_external_id_snapshot: existing.vendor_external_id_snapshot = v_ext_id_snap
            existing.save()
            target_record = existing
            is_created = False
        else:
            record = AttendanceRecord.objects.create(
                user=user,
                vendor=target_vendor,
                reporting_manager=reporting_mgr,
                date=today,
                check_in=timezone.now(),
                status='CHECKED_IN',
                approval_status='PENDING',
                attendance_type=att_type,
                check_in_latitude=float(lat) if (lat is not None and str(lat).strip() != '') else None,
                check_in_longitude=float(lng) if (lng is not None and str(lng).strip() != '') else None,
                check_in_accuracy=float(acc) if (acc is not None and str(acc).strip() != '') else None,
                check_in_photo=processed_photo,
                location_source=loc_source,
                marked_by=request.user,
                updated_by=request.user,
                external_user_id_snapshot=ext_uid_snap,
                employee_id_snapshot=emp_id_snap,
                user_name_snapshot=u_name_snap,
                phone_number_snapshot=phone_snap,
                role_snapshot=role_snap,
                vendor_external_id_snapshot=v_ext_id_snap,
                vendor_name_snapshot=v_name_snap
            )
            target_record = record
            is_created = True

        t_create_elapsed = (time.perf_counter() - t_create_start) * 1000
        result_tag = "SUCCESS_CREATED" if is_created else "SUCCESS_UPDATED"
        print(f"[AttendanceCheckInTiming] ATTENDANCE_CREATE | elapsed_ms={t_create_elapsed:.2f}ms | record_id={target_record.id} | is_new={is_created} | status={target_record.status}")
        print(
            f"[AttendanceCheckIn] Hero_user_id={user.id} | external_user_id={ext_uid_snap} | "
            f"resolved_Hero_vendor={getattr(target_vendor, 'id', None)} ({v_name_snap}) | "
            f"resolved_iLync_vendor={v_ext_id_snap} | auth_result=AUTHORIZED | "
            f"attendance_record_id={target_record.id} | date={today} | status={target_record.status} | creation_result={result_tag}"
        )
        print(f"[AttendanceCheckIn] STEP=AFTER_CREATE | attendance_record_id={target_record.id}")

        # 6. NOTIFICATION (Safe execution - notification failures never break check-in)
        t_notif_start = time.perf_counter()
        print(f"[AttendanceCheckIn] STEP=NOTIFY_START")
        if reporting_mgr:
            try:
                notify_user(
                    reporting_mgr,
                    "Pending Attendance Approval",
                    f"Attendance check-in submitted by {user.get_full_name() or user.username} for {today} requires your approval."
                )
                print(f"[AttendanceCheckIn] STEP=NOTIFY_SUCCESS")
            except Exception as notif_err:
                import traceback
                print(f"[AttendanceCheckIn] Notification exception: {type(notif_err).__name__}: {notif_err}")
                traceback.print_exc()
        else:
            print(f"[AttendanceCheckIn] STEP=NOTIFY_SUCCESS | no_reporting_mgr=True")
        t_notif_elapsed = (time.perf_counter() - t_notif_start) * 1000
        print(f"[AttendanceCheckInTiming] NOTIFICATION | elapsed_ms={t_notif_elapsed:.2f}ms | reporting_mgr_id={getattr(reporting_mgr, 'id', None)}")

        # 7. SERIALIZATION
        t_ser_start = time.perf_counter()
        print(f"[AttendanceCheckIn] STEP=RESPONSE_SERIALIZER_START")
        try:
            serializer = AttendanceRecordSerializer(target_record, context={'request': request})
            data = serializer.data
            print(f"[AttendanceCheckIn] STEP=RESPONSE_SERIALIZER_SUCCESS")
        except Exception as ser_err:
            import traceback
            print(f"[AttendanceCheckIn] Serializer exception: {type(ser_err).__name__}: {ser_err}")
            traceback.print_exc()
            data = {
                "id": target_record.id,
                "user_id": user.id,
                "user_name": u_name_snap,
                "employee_id": emp_id_snap,
                "external_user_id": ext_uid_snap,
                "vendor_name": v_name_snap,
                "vendor_external_id": v_ext_id_snap,
                "status": target_record.status,
                "approval_status": target_record.approval_status,
                "date": str(today),
                "check_in": target_record.check_in.isoformat() if target_record.check_in else None
            }
            print(f"[AttendanceCheckIn] STEP=RESPONSE_SERIALIZER_SUCCESS (fallback data used)")

        t_ser_elapsed = (time.perf_counter() - t_ser_start) * 1000
        print(f"[AttendanceCheckInTiming] SERIALIZATION | elapsed_ms={t_ser_elapsed:.2f}ms | fields_count={len(data)}")

        # 8. RESPONSE
        t_total_elapsed = (time.perf_counter() - t_global_start) * 1000
        resp_status = status.HTTP_201_CREATED if is_created else status.HTTP_200_OK
        print(f"[AttendanceCheckInTiming] RESPONSE | total_elapsed_ms={t_total_elapsed:.2f}ms | status_code={resp_status}")
        print(f"[AttendanceCheckIn] STEP=CHECKIN_SUCCESS | total_elapsed_ms={t_total_elapsed:.2f}ms")

        return Response({
            "success": True,
            "message": "Check-in successful",
            "data": data
        }, status=resp_status)

    # 4.3 Employee Self Check-Out
    @action(detail=False, methods=['post'], url_path='check-out')
    def check_out(self, request):
        ext_user_id = (
            request.data.get('external_user_id') or
            request.data.get('externalUserId') or
            request.data.get('ext_user_id') or
            request.data.get('externalId')
        )
        target_user_id = (
            request.data.get('user_id') or
            request.data.get('marked_for_user_id') or
            request.data.get('user') or
            request.data.get('userId') or
            request.data.get('id') or
            request.data.get('employee_id') or
            request.data.get('employeeId') or
            request.data.get('empId')
        )
        if target_user_id and not ext_user_id and len(str(target_user_id).strip()) == 24 and not str(target_user_id).strip().isdigit():
            ext_user_id = str(target_user_id).strip()

        user = request.user
        target_requested = bool(ext_user_id or target_user_id)

        if target_requested:
            target_user = resolve_target_user(target_user_id, request_user=request.user, external_user_id=ext_user_id)
            if not target_user:
                return error_response(
                    message=f"Target employee not found for identifier '{ext_user_id or target_user_id}'.",
                    status_code=status.HTTP_404_NOT_FOUND
                )
            req_v = request.data.get('vendor_id') or request.data.get('vendor') or request.data.get('vendorId')
            allowed_v_ids = get_user_vendor_ids(request.user)
            authorizing_vendor = None
            if req_v:
                from apps.vendors.models import Vendor
                req_v_str = str(req_v).strip()
                cand_v = None
                if req_v_str.isdigit():
                    cand_v = Vendor.objects.filter(id=int(req_v_str)).first()
                if not cand_v:
                    cand_v = Vendor.objects.filter(external_vendor_id=req_v_str).first()
                if not cand_v:
                    cand_v = Vendor.objects.filter(name__iexact=req_v_str).first()
                if cand_v and (allowed_v_ids is None or cand_v.id in allowed_v_ids):
                    authorizing_vendor = cand_v

            if not authorizing_vendor:
                user_ven = getattr(request.user, 'vendor', None) or get_user_vendor(request.user, allow_network=False)
                if user_ven and (allowed_v_ids is None or user_ven.id in allowed_v_ids):
                    authorizing_vendor = user_ven

            if not authorizing_vendor and allowed_v_ids:
                from apps.vendors.models import Vendor
                authorizing_vendor = Vendor.objects.filter(id__in=allowed_v_ids).first()

            validate_employee_attendance_access(request.user, target_user, vendor_obj=authorizing_vendor)
            user = target_user

        today = timezone.localdate()
        att_id = request.data.get('attendance_id') or request.data.get('id')

        if att_id:
            record = AttendanceRecord.objects.filter(id=att_id).exclude(attendance_type='MACHINE').first()
        else:
            record = AttendanceRecord.objects.filter(user=user, date=today).exclude(attendance_type='MACHINE').order_by('-created_at').first()

        if not record or not (record.check_in or record.status in ['CHECKED_IN', 'PRESENT', 'HALF_DAY']):
            return error_response(message="Cannot check out without a valid check-in record for today.", status_code=status.HTTP_400_BAD_REQUEST)

        lat = request.data.get('latitude') or request.data.get('check_out_latitude')
        lng = request.data.get('longitude') or request.data.get('check_out_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_out_accuracy')
        loc_source = request.data.get('location_source')
        processed_photo = process_attendance_photo(request, 'checkout', user.id)

        check_out_time = timezone.now()
        record.check_out = check_out_time
        record.status = 'CHECKED_OUT'
        if lat is not None and str(lat).strip() != '': record.check_out_latitude = float(lat)
        if lng is not None and str(lng).strip() != '': record.check_out_longitude = float(lng)
        if acc is not None and str(acc).strip() != '': record.check_out_accuracy = float(acc)
        if loc_source: record.location_source = loc_source
        if processed_photo: record.check_out_photo = processed_photo
        record.updated_by = request.user

        if record.check_in:
            delta = check_out_time - record.check_in
            total_seconds = max(0, int(delta.total_seconds()))
            record.total_working_seconds = total_seconds
            hrs = total_seconds // 3600
            mins = (total_seconds % 3600) // 60
            record.total_working_hours = f"{hrs:02d}h {mins:02d}m"

        record.save()
        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response({
            "success": True,
            "message": "Check-out successful",
            "data": serializer.data
        }, status=status.HTTP_200_OK)

    # 4.4 Team Member Check-In (Supervisor Marking Team)
    @action(detail=False, methods=['post'], url_path='team-check-in')
    def team_check_in(self, request):
        ext_user_id = (
            request.data.get('external_user_id') or
            request.data.get('externalUserId') or
            request.data.get('ext_user_id') or
            request.data.get('externalId')
        )
        target_user_id = (
            request.data.get('marked_for_user_id') or
            request.data.get('user_id') or
            request.data.get('user') or
            request.data.get('userId') or
            request.data.get('id') or
            request.data.get('employee_id') or
            request.data.get('employeeId') or
            request.data.get('empId')
        )
        if target_user_id and not ext_user_id and len(str(target_user_id).strip()) == 24 and not str(target_user_id).strip().isdigit():
            ext_user_id = str(target_user_id).strip()

        if not target_user_id and not ext_user_id:
            return error_response(message="marked_for_user_id or external_user_id is required.", status_code=status.HTTP_400_BAD_REQUEST)

        target_user = resolve_target_user(target_user_id, request_user=request.user, external_user_id=ext_user_id)
        if not target_user:
            return error_response(message="Target team member not found.", status_code=status.HTTP_404_NOT_FOUND)

        req_v = request.data.get('vendor_id') or request.data.get('vendor') or request.data.get('vendorId')
        allowed_v_ids = get_user_vendor_ids(request.user)
        authorizing_vendor = None
        if req_v:
            from apps.vendors.models import Vendor
            req_v_str = str(req_v).strip()
            cand_v = None
            if req_v_str.isdigit():
                cand_v = Vendor.objects.filter(id=int(req_v_str)).first()
            if not cand_v:
                cand_v = Vendor.objects.filter(external_vendor_id=req_v_str).first()
            if not cand_v:
                cand_v = Vendor.objects.filter(name__iexact=req_v_str).first()
            if cand_v and (allowed_v_ids is None or cand_v.id in allowed_v_ids):
                authorizing_vendor = cand_v

        if not authorizing_vendor:
            user_ven = getattr(request.user, 'vendor', None) or get_user_vendor(request.user, allow_network=False)
            if user_ven and (allowed_v_ids is None or user_ven.id in allowed_v_ids):
                authorizing_vendor = user_ven

        if not authorizing_vendor and allowed_v_ids:
            from apps.vendors.models import Vendor
            authorizing_vendor = Vendor.objects.filter(id__in=allowed_v_ids).first()

        validate_employee_attendance_access(request.user, target_user, vendor_obj=authorizing_vendor)
        today = timezone.localdate()
        lat = request.data.get('latitude') or request.data.get('check_in_latitude')
        lng = request.data.get('longitude') or request.data.get('check_in_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_in_accuracy')
        photo = process_attendance_photo(request, 'checkin', target_user.id)

        target_vendor = authorizing_vendor or target_user.vendor or get_user_vendor(target_user, allow_network=False)
        reporting_mgr = resolve_reporting_manager(target_user, marked_by_user=request.user, vendor=target_vendor)

        # Snapshot data
        ext_uid_snap = getattr(target_user, 'external_user_id', None) or (str(ext_user_id).strip() if ext_user_id else None)
        emp_id_snap = getattr(target_user, 'employee_id', None) or f"EMP-{target_user.id}"
        u_name_snap = target_user.get_full_name() or target_user.username
        phone_snap = getattr(target_user, 'phone_number', None) or target_user.username
        role_snap = getattr(target_user, 'designation', None) or (target_user.get_role_list()[0] if hasattr(target_user, 'get_role_list') and target_user.get_role_list() else getattr(target_user, 'role', 'OPERATOR'))
        v_ext_id_snap = getattr(target_vendor, 'external_vendor_id', None) if target_vendor else None
        v_name_snap = getattr(target_vendor, 'name', '') if target_vendor else ''

        existing = AttendanceRecord.objects.filter(user=target_user, date=today).exclude(attendance_type='MACHINE').first()
        if existing:
            existing.status = 'CHECKED_IN'
            if not existing.check_in:
                existing.check_in = timezone.now()
            if photo: existing.check_in_photo = photo
            if lat is not None and str(lat).strip() != '': existing.check_in_latitude = float(lat)
            if lng is not None and str(lng).strip() != '': existing.check_in_longitude = float(lng)
            if acc is not None and str(acc).strip() != '': existing.check_in_accuracy = float(acc)
            existing.updated_by = request.user
            if target_vendor and (not existing.vendor_id or existing.vendor_id != target_vendor.id):
                existing.vendor = target_vendor
                existing.vendor_name_snapshot = v_name_snap
                existing.vendor_external_id_snapshot = v_ext_id_snap

            # Populate snapshot fields
            if not existing.external_user_id_snapshot: existing.external_user_id_snapshot = ext_uid_snap
            if not existing.employee_id_snapshot: existing.employee_id_snapshot = emp_id_snap
            if not existing.user_name_snapshot: existing.user_name_snapshot = u_name_snap
            if not existing.phone_number_snapshot: existing.phone_number_snapshot = phone_snap
            if not existing.role_snapshot: existing.role_snapshot = role_snap
            if not existing.vendor_name_snapshot: existing.vendor_name_snapshot = v_name_snap
            if not existing.vendor_external_id_snapshot: existing.vendor_external_id_snapshot = v_ext_id_snap
            existing.save()

            serializer = AttendanceRecordSerializer(existing, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        record = AttendanceRecord.objects.create(
            user=target_user,
            vendor=target_vendor,
            reporting_manager=reporting_mgr,
            date=today,
            check_in=timezone.now(),
            status='CHECKED_IN',
            approval_status='PENDING',
            attendance_type='TEAM',
            marked_for_user=target_user,
            marked_by=request.user,
            updated_by=request.user,
            check_in_latitude=lat if lat else None,
            check_in_longitude=lng if lng else None,
            check_in_accuracy=float(acc) if acc else None,
            check_in_photo=photo if photo else None,
            external_user_id_snapshot=ext_uid_snap,
            employee_id_snapshot=emp_id_snap,
            user_name_snapshot=u_name_snap,
            phone_number_snapshot=phone_snap,
            role_snapshot=role_snap,
            vendor_external_id_snapshot=v_ext_id_snap,
            vendor_name_snapshot=v_name_snap
        )

        if reporting_mgr:
            try:
                notify_user(
                    reporting_mgr,
                    "Pending Attendance Approval",
                    f"Team attendance check-in for {target_user.get_full_name() or target_user.username} submitted by {request.user.get_full_name() or request.user.username} requires your approval."
                )
            except Exception as notif_err:
                print(f"[TeamCheckIn] Non-fatal notification error: {notif_err}")

        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # 4.5 Machine / Heavy Equipment Attendance Check-In
    @action(detail=False, methods=['post'], url_path='machine-check-in')
    def machine_check_in(self, request):
        chassis_no = request.data.get('machine_chassis_no') or request.data.get('chassis_no')
        assignment_id = request.data.get('assignment_id') or request.data.get('machine_assignment_id')
        machine_id = request.data.get('machine_id')

        today = timezone.localdate()
        user = request.user
        lat = request.data.get('latitude') or request.data.get('check_in_latitude')
        lng = request.data.get('longitude') or request.data.get('check_in_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_in_accuracy')
        photo = process_attendance_photo(request, 'checkin', user.id)

        target_vendor = user.vendor or get_user_vendor(user)
        reporting_mgr = resolve_reporting_manager(user, marked_by_user=request.user, vendor=target_vendor)

        # Existing Machine Record Duplicate Protection
        existing = None
        if machine_id or chassis_no:
            q_mac = Q()
            if machine_id: q_mac |= Q(machine_id=str(machine_id))
            if chassis_no: q_mac |= Q(machine_chassis_no=chassis_no)
            existing = AttendanceRecord.objects.filter(attendance_type='MACHINE', date=today).filter(q_mac).first()

        if existing:
            existing.status = 'CHECKED_IN'
            if not existing.check_in:
                existing.check_in = timezone.now()
            if photo: existing.check_in_photo = photo
            if lat is not None and str(lat).strip() != '': existing.check_in_latitude = float(lat)
            if lng is not None and str(lng).strip() != '': existing.check_in_longitude = float(lng)
            if acc is not None and str(acc).strip() != '': existing.check_in_accuracy = float(acc)
            existing.updated_by = user
            existing.save()
            serializer = AttendanceRecordSerializer(existing, context={'request': request})
            return Response({
                "success": True,
                "message": "Machine check-in successful",
                "data": serializer.data
            }, status=status.HTTP_200_OK)

        record = AttendanceRecord.objects.create(
            user=user,
            vendor=target_vendor,
            reporting_manager=reporting_mgr,
            date=today,
            check_in=timezone.now(),
            status='CHECKED_IN',
            approval_status='PENDING',
            attendance_type='MACHINE',
            machine_id=machine_id,
            machine_chassis_no=chassis_no,
            machine_assignment_id=assignment_id,
            marked_by=user,
            updated_by=user,
            check_in_latitude=float(lat) if (lat is not None and str(lat).strip() != '') else None,
            check_in_longitude=float(lng) if (lng is not None and str(lng).strip() != '') else None,
            check_in_accuracy=float(acc) if (acc is not None and str(acc).strip() != '') else None,
            check_in_photo=photo if photo else None
        )

        if reporting_mgr:
            notify_user(
                reporting_mgr,
                "Pending Attendance Approval",
                f"Machine attendance check-in submitted for {chassis_no or machine_id} requires your approval."
            )

        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response({
            "success": True,
            "message": "Machine check-in successful",
            "data": serializer.data
        }, status=status.HTTP_201_CREATED)

    # 4.5.1 Machine Check-Out
    @action(detail=False, methods=['post'], url_path='machine-check-out')
    def machine_check_out(self, request):
        chassis_no = request.data.get('machine_chassis_no') or request.data.get('chassis_no')
        machine_id = request.data.get('machine_id')
        today = timezone.localdate()
        user = request.user

        q_mac = Q()
        if machine_id: q_mac |= Q(machine_id=str(machine_id))
        if chassis_no: q_mac |= Q(machine_chassis_no=chassis_no)

        record = AttendanceRecord.objects.filter(attendance_type='MACHINE', date=today).filter(q_mac).order_by('-created_at').first()
        if not record or not (record.check_in or record.status in ['CHECKED_IN', 'PRESENT', 'OPERATING']):
            return error_response(message="Cannot check out machine without a valid active check-in record for today.", status_code=status.HTTP_400_BAD_REQUEST)

        lat = request.data.get('latitude') or request.data.get('check_out_latitude')
        lng = request.data.get('longitude') or request.data.get('check_out_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_out_accuracy')
        photo = process_attendance_photo(request, 'checkout', user.id)

        check_out_time = timezone.now()
        record.check_out = check_out_time
        record.status = 'CHECKED_OUT'
        if lat is not None and str(lat).strip() != '': record.check_out_latitude = float(lat)
        if lng is not None and str(lng).strip() != '': record.check_out_longitude = float(lng)
        if acc is not None and str(acc).strip() != '': record.check_out_accuracy = float(acc)
        if photo: record.check_out_photo = photo
        record.updated_by = user

        if record.check_in:
            delta = check_out_time - record.check_in
            total_seconds = max(0, int(delta.total_seconds()))
            record.total_working_seconds = total_seconds
            hrs = total_seconds // 3600
            mins = (total_seconds % 3600) // 60
            record.total_working_hours = f"{hrs:02d}h {mins:02d}m"

        record.save()
        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response({
            "success": True,
            "message": "Machine check-out successful",
            "data": serializer.data
        }, status=status.HTTP_200_OK)

    # 4.6 Fetch Assigned Machines for Logged-In User
    @action(detail=False, methods=['get'], url_path='my-assigned-machines')
    def my_assigned_machines(self, request):
        from apps.machines.models import Machine
        user = request.user
        allowed_vendor_ids = get_user_vendor_ids(user)

        if allowed_vendor_ids is None:
            machines = Machine.objects.all()[:50]
        elif not allowed_vendor_ids:
            machines = Machine.objects.none()
        else:
            machines = Machine.objects.filter(vendor_id__in=allowed_vendor_ids)

        results = []
        for m in machines:
            results.append({
                "id": m.id,
                "machine_chassis_no": getattr(m, 'chassis_number', getattr(m, 'serial_number', f"CH-{m.id}")),
                "model_code": getattr(m, 'model', getattr(m, 'name', 'JCB-3DX')),
                "model_name": getattr(m, 'name', 'JCB 3DX EcoXcellence'),
                "site_name": getattr(m, 'site_name', getattr(m, 'location', 'Main Project Site')),
                "status": getattr(m, 'status', 'Online')
            })
        return Response({"results": results}, status=status.HTTP_200_OK)

    # 4.7 Fetch Authorized Team Members for Supervisor
    @action(detail=False, methods=['get'], url_path='team-members')
    def team_members(self, request):
        user = request.user
        allowed_vendor_ids = get_user_vendor_ids(user)

        if allowed_vendor_ids is not None and len(allowed_vendor_ids) == 0:
            return Response({"results": []}, status=status.HTTP_200_OK)

        # Source vendor's CURRENT team from iLync vendor API data.users[]
        results = []
        seen_user_ids = set()
        from apps.vendors.models import Vendor
        if allowed_vendor_ids is not None:
            vendors = Vendor.objects.filter(id__in=allowed_vendor_ids, is_active=True)
        else:
            vendors = Vendor.objects.filter(is_active=True)
        for v_obj in vendors:
            v_data = get_vendor_ilync_detail(v_obj)
            if v_data and isinstance(v_data, dict):
                ilync_users = v_data.get('users') or []
                for u_info in ilync_users:
                    if not isinstance(u_info, dict) or u_info.get('active') is False:
                        continue
                    ext_uid = str(u_info.get('userId') or u_info.get('id') or '').strip()
                    name = str(u_info.get('name') or u_info.get('contactName') or 'Team Member').strip()
                    role = str(u_info.get('designation') or u_info.get('role') or 'OPERATOR').strip()
                    emp_id = str(u_info.get('empId') or '').strip()

                    hero_u = User.objects.filter(external_user_id=ext_uid).first() if ext_uid else None
                    u_key = hero_u.id if hero_u else ext_uid
                    if u_key and u_key not in seen_user_ids:
                        seen_user_ids.add(u_key)
                        results.append({
                            "id": hero_u.id if hero_u else ext_uid,
                            "external_user_id": ext_uid,
                            "name": (hero_u.get_full_name() if hero_u else None) or name,
                            "employee_id": (hero_u.employee_id if hero_u else None) or emp_id or (f"EMP-{hero_u.id}" if hero_u else f"EMP-{ext_uid}"),
                            "role": role,
                            "avatar_url": getattr(hero_u, 'avatar_url', None) if hero_u else None
                        })

        if not results:
            team_qs = User.objects.filter(
                Q(vendor_id__in=allowed_vendor_ids) |
                Q(hero_vendor_assignments__vendor_id__in=allowed_vendor_ids)
            ).filter(is_active=True).exclude(
                Q(is_superuser=True) | Q(role__iexact='ADMIN') | Q(roles__name__iexact='ADMIN')
            ).distinct().order_by('id')
            for u in team_qs:
                results.append({
                    "id": u.id,
                    "name": u.get_full_name() or u.username,
                    "employee_id": u.employee_id or u.external_user_id or f"EMP-{u.id}",
                    "role": u.get_role_list()[0] if u.get_role_list() else (u.role or 'Field Surveyor'),
                    "avatar_url": u.avatar_url if hasattr(u, 'avatar_url') else None
                })

        return Response({"results": results}, status=status.HTTP_200_OK)

    # 4.8 Fetch User Attendance History Timeline
    @action(detail=False, methods=['get'], url_path='history')
    def attendance_history(self, request):
        page = int(request.query_params.get('page', 0))
        size = int(request.query_params.get('size') or request.query_params.get('page_size') or 200)
        status_param = request.query_params.get('status')

        qs = self.get_queryset()
        if status_param and status_param.upper() != 'ALL':
            qs = qs.filter(status__iexact=status_param)

        total = qs.count()
        start = page * size
        end = start + size
        paginated_records = qs[start:end]

        serializer = AttendanceRecordSerializer(paginated_records, many=True, context={'request': request})
        return Response({
            "results": serializer.data,
            "total": total,
            "page": page,
            "size": size
        }, status=status.HTTP_200_OK)

    # 4.9 Fetch Pending Attendance Approvals (For Managers)
    @action(detail=False, methods=['get'], url_path='pending-approvals')
    def pending_approvals(self, request):
        user = request.user
        page = int(request.query_params.get('page', 0))
        size = int(request.query_params.get('size', 20))

        is_admin = user.is_superuser or 'ADMIN' in user.get_role_list()
        allowed_vendor_ids = get_user_vendor_ids(user)

        subordinate_ids = get_reporting_scope(user)
        subordinate_ids = [uid for uid in subordinate_ids if uid != user.id]

        base_pending_filter = Q(approval_status='PENDING') & ~Q(status__in=['NOT_MARKED', 'NOT_CHECKED_IN']) & (Q(check_in__isnull=False) | Q(status='CHECKED_IN'))

        if is_admin:
            qs = AttendanceRecord.objects.filter(base_pending_filter).exclude(user=user)
        else:
            mgr_filter = Q(reporting_manager=user) | Q(user__reporting_manager=user) | Q(marked_by=user)
            if subordinate_ids:
                mgr_filter |= Q(user_id__in=subordinate_ids)

            user_roles = [r.upper() for r in user.get_role_list()]
            if allowed_vendor_ids and any(r in user_roles for r in ['MANAGER', 'SUPERVISOR', 'VENDOR', 'ADMIN', 'HERO']):
                mgr_filter |= Q(vendor_id__in=allowed_vendor_ids) | Q(user__vendor_id__in=allowed_vendor_ids)

            qs = AttendanceRecord.objects.filter(
                base_pending_filter & mgr_filter
            ).exclude(user=user)

        req_vendor = request.query_params.get('vendor_id') or request.query_params.get('vendor')
        if req_vendor and str(req_vendor).strip() and str(req_vendor).lower() != 'all':
            clean_v = str(req_vendor).strip()
            qs = qs.filter(
                Q(vendor__external_vendor_id=clean_v) |
                Q(vendor__name__iexact=clean_v) |
                Q(vendor__name__iexact=str(req_vendor)) |
                Q(vendor__name__icontains=clean_v) |
                Q(vendor_id=clean_v if clean_v.isdigit() else None)
            )

        qs = qs.select_related('user', 'vendor', 'reporting_manager', 'marked_by', 'approved_by').distinct().order_by('-created_at', '-id')

        total = qs.count()
        start = page * size
        end = start + size
        paginated_records = qs[start:end]

        serializer = AttendanceRecordSerializer(paginated_records, many=True, context={'request': request})
        return Response({
            "results": serializer.data,
            "total": total,
            "page": page,
            "size": size
        }, status=status.HTTP_200_OK)

    # 4.10 Manager Approves Attendance Record
    @action(detail=True, methods=['post'], url_path='approve')
    def approve_attendance(self, request, pk=None):
        record = self.get_object()

        err_response = validate_approval_permission(request.user, record)
        if err_response:
            return err_response

        record.approval_status = 'APPROVED'
        record.approved_by = request.user
        record.approved_at = timezone.now()
        record.save()

        notify_user(
            record.user,
            "Attendance Approved",
            f"Your attendance record for {record.date} has been approved."
        )

        return Response({
            "success": True,
            "message": "Attendance record approved successfully.",
            "approval_status": "APPROVED"
        }, status=status.HTTP_200_OK)

    # 4.11 Manager Rejects Attendance Record
    @action(detail=True, methods=['post'], url_path='reject')
    def reject_attendance(self, request, pk=None):
        record = self.get_object()

        err_response = validate_approval_permission(request.user, record)
        if err_response:
            return err_response

        reason = request.data.get('reason') or "GPS location is outside site perimeter bounds."
        record.approval_status = 'REJECTED'
        record.rejection_reason = reason
        record.approved_by = request.user
        record.approved_at = timezone.now()
        record.save()

        notify_user(
            record.user,
            "Attendance Rejected",
            f"Your attendance record for {record.date} was rejected. Reason: {reason}"
        )

        return Response({
            "success": True,
            "message": "Attendance record rejected.",
            "approval_status": "REJECTED",
            "rejection_reason": reason
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='roster')
    def roster(self, request):
        return self.get_team_attendance(request)

    @action(detail=False, methods=['get'], url_path='mobile-roster')
    def mobile_roster(self, request):
        return self.get_team_attendance(request)

    @action(detail=False, methods=['get'], url_path='team-attendance')
    def get_team_attendance(self, request):
        try:
            return self._get_team_attendance_impl(request)
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise

    def _get_team_attendance_impl(self, request):
        """
        Returns dynamic team member roster:
        - TODAY (or future): directly from LIVE iLync Vendor API, merged with today's saved records.
        - PAST DATES: directly from historical AttendanceRecord snapshots in Hero DB (never rewritten by live iLync).
        """
        auto_checkout_overnight_records()
        user = request.user
        today_date_str = str(timezone.localdate())
        req_date = request.query_params.get('date') or today_date_str
        is_today = (req_date >= today_date_str)
        role_filter = request.query_params.get('role')
        search_filter = request.query_params.get('search')
        status_filter = request.query_params.get('status')
        req_v = request.query_params.get('vendor_id') or request.query_params.get('vendor')
        force_refresh = request.query_params.get('refresh') in ('true', '1', True) or request.query_params.get('force') in ('true', '1', True)

        allowed_vendor_ids = get_user_vendor_ids(user)
        from apps.vendors.models import Vendor
        from apps.integrations.ilync_client import IlyncClient

        client = IlyncClient()

        # Determine target vendors
        v_qs = Vendor.objects.filter(is_active=True)
        if allowed_vendor_ids is not None:
            v_qs = v_qs.filter(id__in=allowed_vendor_ids)
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            clean_v = str(req_v).strip()
            if allowed_vendor_ids is None:
                check_vendor_access(user, clean_v)
            v_qs = v_qs.filter(
                Q(external_vendor_id=clean_v) |
                Q(name__iexact=clean_v) |
                Q(name__iexact=str(req_v)) |
                Q(name__icontains=clean_v) |
                Q(id=clean_v if clean_v.isdigit() else None)
            )

        target_vendors = list(v_qs)
        target_vendor_ids = [v.id for v in target_vendors]

        # When today's roster is requested across all vendors, automatically fetch live vendor & user roster from iLync
        ilync_payload_by_ext_id = {}
        if is_today and (not req_v or str(req_v).strip().lower() == 'all'):
            ilync_vendors_raw, is_list_fallback = get_live_ilync_vendors(
                use_cache=(not force_refresh),
                ttl=10,
                force_refresh=force_refresh
            )
            if isinstance(ilync_vendors_raw, list):
                for v_item in ilync_vendors_raw:
                    if not isinstance(v_item, dict):
                        continue
                    ext_id = str(v_item.get('id') or '').strip()
                    if ext_id:
                        ilync_payload_by_ext_id[ext_id] = v_item

                    p_name = str(v_item.get('partnerName') or v_item.get('name') or '').strip()
                    p_contact = str(v_item.get('contactName') or '').strip()
                    p_phone = str(v_item.get('phoneNumber') or '').strip()
                    p_email = str(v_item.get('email') or '').strip()
                    p_type = str(v_item.get('legalEntityType') or 'COMPANY').strip()

                    if ext_id and p_name:
                        v_db = Vendor.objects.filter(external_vendor_id=ext_id).first()
                        if not v_db:
                            v_db = Vendor.objects.filter(name__iexact=p_name, external_vendor_id__in=['', None]).first()
                        if not v_db:
                            try:
                                name_val = p_name
                                if Vendor.objects.filter(name__iexact=name_val).exists():
                                    name_val = f"{p_name} ({ext_id[-4:]})"
                                with transaction.atomic():
                                    v_db = Vendor.objects.create(
                                        external_vendor_id=ext_id,
                                        name=name_val,
                                        contact_person=p_contact,
                                        phone=p_phone,
                                        email=p_email,
                                        vendor_type=p_type,
                                        is_active=True
                                    )
                                if v_db and (allowed_vendor_ids is None or v_db.id in allowed_vendor_ids):
                                    if v_db not in target_vendors:
                                        target_vendors.append(v_db)
                                        target_vendor_ids.append(v_db.id)
                            except Exception:
                                pass
                        else:
                            up_fields = []
                            if v_db.external_vendor_id != ext_id:
                                v_db.external_vendor_id = ext_id
                                up_fields.append('external_vendor_id')
                            if p_name and v_db.name != p_name and not Vendor.objects.filter(name__iexact=p_name).exclude(id=v_db.id).exists():
                                v_db.name = p_name
                                up_fields.append('name')
                            if p_contact and v_db.contact_person != p_contact:
                                v_db.contact_person = p_contact
                                up_fields.append('contact_person')
                            if p_phone and v_db.phone != p_phone:
                                v_db.phone = p_phone
                                up_fields.append('phone')
                            if p_email and v_db.email != p_email:
                                v_db.email = p_email
                                up_fields.append('email')
                            if not v_db.is_active:
                                v_db.is_active = True
                                up_fields.append('is_active')
                            if up_fields:
                                try:
                                    with transaction.atomic():
                                        v_db.save(update_fields=up_fields)
                                except Exception:
                                    pass

        result_list = []
        assigned_machines_list = []
        counts = {
            'total': 0,
            'present': 0,
            'absent': 0,
            'half_day': 0,
            'leave': 0,
            'week_off': 0,
            'not_marked': 0
        }
        scope_matrix_map = {
            scope: {'scope': scope, 'total': 0, 'present': 0, 'not_marked': 0}
            for scope in ATTENDANCE_SCOPE_ROLES
        }

        oem_by_chassis, ops_by_chassis = _index_open_machine_issues()

        # Build canonical machine registry from Hero DB
        from apps.machines.models import Machine
        db_machines = Machine.objects.select_related('vendor').all()
        db_machine_by_chassis = {}
        for m in db_machines:
            if m.machine_chassis_no:
                db_machine_by_chassis[m.machine_chassis_no.strip()] = m
            if m.serial_number:
                db_machine_by_chassis[m.serial_number.strip()] = m

        if not is_today:
            # Auto-ensure NOT_MARKED records exist for this past date if missing
            if not AttendanceRecord.objects.filter(date=req_date).exists():
                try:
                    auto_store_unmarked_records(target_date=req_date)
                except Exception as ex:
                    print(f"[AttendanceRoster] Auto-store past unmarked records warning for {req_date}: {ex}")

            # ------------------------------------------------------------------
            # HISTORICAL ROSTER (PAST DATES)
            # Source of truth: AttendanceRecord snapshot stored in Hero DB.
            # Do NOT depend on the live iLync roster to identify employees on past dates.
            # ------------------------------------------------------------------
            past_records_qs = AttendanceRecord.objects.filter(date=req_date).select_related(
                'user', 'vendor', 'reporting_manager', 'marked_by',
                'user__selected_circle', 'user__selected_district', 'user__selected_block'
            )
            if allowed_vendor_ids is not None:
                past_records_qs = past_records_qs.filter(
                    Q(vendor_id__in=target_vendor_ids) | Q(user__vendor_id__in=target_vendor_ids)
                )
            elif req_v and str(req_v).strip() and str(req_v).lower() != 'all':
                past_records_qs = past_records_qs.filter(
                    Q(vendor_id__in=target_vendor_ids) | Q(user__vendor_id__in=target_vendor_ids)
                )

            team_records = list(past_records_qs.exclude(attendance_type='MACHINE').order_by('id'))
            machine_records = list(past_records_qs.filter(attendance_type='MACHINE').order_by('id'))

            for rec in team_records:
                u = rec.user
                ext_u_id = rec.external_user_id_snapshot or (u.external_user_id if u else None)
                emp_display = rec.employee_id_snapshot or (u.employee_id if u else None) or (f"EMP-{u.id}" if u else f"EMP-{rec.id}")
                name = rec.user_name_snapshot or (u.get_full_name() or u.username if u else 'Team Member')
                mobile = rec.phone_number_snapshot or (u.phone_number if u else '')
                email = (u.email if u and u.email and not str(u.email).lower().startswith('user@') else '')

                designation = rec.role_snapshot or (u.designation or u.role if u else 'OPERATOR')
                u_role = normalize_attendance_role(designation)

                v_name = rec.vendor_name_snapshot or (rec.vendor.name if rec.vendor else (u.vendor.name if u and u.vendor else ''))
                v_id = rec.vendor_id or (u.vendor_id if u else None)
                v_ext_id = rec.vendor_external_id_snapshot or (rec.vendor.external_vendor_id if rec.vendor and rec.vendor.external_vendor_id else (u.vendor.external_vendor_id if u and u.vendor else ''))

                st = (rec.status or 'NOT_MARKED').upper()
                counts['total'] += 1
                if st in ('PRESENT', 'CHECKED_IN', 'CHECKED_OUT'):
                    counts['present'] += 1
                elif st == 'ABSENT':
                    counts['absent'] += 1
                elif st in ['HALF_DAY', 'HALF DAY']:
                    counts['half_day'] += 1
                    st = 'HALF_DAY'
                elif st == 'LEAVE':
                    counts['leave'] += 1
                elif st in ['WEEK_OFF', 'WEEK OFF']:
                    counts['week_off'] += 1
                    st = 'WEEK_OFF'
                else:
                    counts['not_marked'] += 1
                    st = 'NOT_MARKED'

                bump_scope_matrix(scope_matrix_map, u_role, st)

                if role_filter and role_filter.upper() != 'ALL' and role_filter.upper() != u_role.upper():
                    continue

                if search_filter:
                    sp = search_filter.strip().lower()
                    if sp not in name.lower() and sp not in mobile and sp not in email.lower() and sp not in emp_display.lower():
                        continue

                if status_filter and status_filter.upper() != 'ALL':
                    sf = status_filter.upper().replace(' ', '_')
                    if sf != st:
                        continue

                check_in_photo_url = build_secure_media_url(request, rec.check_in_photo)
                check_out_photo_url = build_secure_media_url(request, rec.check_out_photo)

                check_in_dt = (rec.check_in or rec.created_at) if rec.status in ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT', 'HALF_DAY'] else None
                check_out_dt = rec.check_out if rec.check_out else None

                final_circle = u.selected_circle.name if (u and getattr(u, 'selected_circle', None)) else ''
                final_district = u.selected_district.name if (u and getattr(u, 'selected_district', None)) else ''
                final_block = u.selected_block.name if (u and getattr(u, 'selected_block', None)) else ''
                final_machine = rec.machine_chassis_no or rec.machine_id or ''

                effective_user_id = ext_u_id or (str(u.id) if u else f"HIST-{rec.id}")

                result_list.append({
                    'user_id': effective_user_id,
                    'external_user_id': ext_u_id,
                    'employee_id': emp_display,
                    'user_name': name,
                    'phone_number': mobile,
                    'email': email,
                    'role': u_role,
                    'designation': designation,
                    'circle': final_circle,
                    'district': final_district,
                    'block': final_block,
                    'machine': final_machine,
                    'vendor_name': v_name,
                    'vendor_id': v_id,
                    'vendor_external_id': v_ext_id,
                    'is_active': True,
                    'reporting_manager_name': rec.reporting_manager.get_full_name() if rec.reporting_manager else '',
                    'attendance_id': rec.id,
                    'date': req_date,
                    'status': st,
                    'approval_status': rec.approval_status,
                    'rejection_reason': rec.rejection_reason,
                    'attendance_type': rec.attendance_type,
                    'machine_chassis_no': rec.machine_chassis_no or None,
                    'check_in': timezone.localtime(check_in_dt).strftime('%H:%M') if check_in_dt else None,
                    'check_out': timezone.localtime(check_out_dt).strftime('%H:%M') if check_out_dt else None,
                    'check_in_time': timezone.localtime(check_in_dt).isoformat() if check_in_dt else None,
                    'check_out_time': timezone.localtime(check_out_dt).isoformat() if check_out_dt else None,
                    'check_in_latitude': float(rec.check_in_latitude) if rec.check_in_latitude else None,
                    'check_in_longitude': float(rec.check_in_longitude) if rec.check_in_longitude else None,
                    'check_in_accuracy': rec.check_in_accuracy if rec.check_in_accuracy else None,
                    'check_in_photo': check_in_photo_url,
                    'check_out_photo': check_out_photo_url,
                    'total_working_hours': rec.total_working_hours,
                    'notes': rec.notes or '',
                    'marked_by_name': rec.marked_by.get_full_name() if rec.marked_by else ''
                })

            seen_hist_chassis = set()
            for m_rec in machine_records:
                chassis_val = m_rec.machine_chassis_no or m_rec.machine_id or ''
                if not chassis_val:
                    continue

                # Enforce single-vendor canonical assignment
                db_m = db_machine_by_chassis.get(chassis_val)
                if db_m and db_m.vendor_id and m_rec.vendor_id and db_m.vendor_id != m_rec.vendor_id:
                    continue

                if chassis_val in seen_hist_chassis:
                    continue
                seen_hist_chassis.add(chassis_val)

                m_status = (m_rec.status or 'NOT_MARKED').upper()
                working_meta = _machine_working_payload(
                    m_status, chassis_val, oem_by_chassis, ops_by_chassis
                )
                display_status = m_status
                if working_meta['working_state'] == 'NOT_WORKING':
                    display_status = 'NOT_WORKING'
                elif working_meta['working_state'] == 'WORKING' and m_status == 'NOT_MARKED':
                    display_status = 'WORKING'

                v_name = m_rec.vendor_name_snapshot or (m_rec.vendor.name if m_rec.vendor else '')
                assigned_machines_list.append({
                    'machine_id': m_rec.machine_id or m_rec.id,
                    'name': f"Machine {chassis_val}",
                    'code': chassis_val,
                    'machine_no': chassis_val,
                    'chassis_no': chassis_val,
                    'vendor_name': v_name,
                    'vendor_id': m_rec.vendor_id,
                    'operator_name': m_rec.user.get_full_name() if m_rec.user else '',
                    'status': display_status,
                    'attendance_status': m_status,
                    'attendance_type': 'MACHINE',
                    'check_in': timezone.localtime(m_rec.check_in).strftime('%H:%M') if m_rec.check_in else None,
                    'check_out': timezone.localtime(m_rec.check_out).strftime('%H:%M') if m_rec.check_out else None,
                    'check_in_photo': build_secure_media_url(request, m_rec.check_in_photo),
                    'check_out_photo': build_secure_media_url(request, m_rec.check_out_photo),
                    'notes': m_rec.notes or '',
                    'check_in_latitude': float(m_rec.check_in_latitude) if m_rec.check_in_latitude else None,
                    'check_in_longitude': float(m_rec.check_in_longitude) if m_rec.check_in_longitude else None,
                    'check_in_accuracy': m_rec.check_in_accuracy if m_rec.check_in_accuracy else None,
                    'total_working_hours': m_rec.total_working_hours,
                    'attendance_id': m_rec.id,
                    'approval_status': m_rec.approval_status,
                    **working_meta,
                })

            return success_response(
                data={
                    'date': req_date,
                    'summary': counts,
                    'scope_matrix': [scope_matrix_map[s] for s in ATTENDANCE_SCOPE_ROLES],
                    'team_members': result_list,
                    'assigned_machines': assigned_machines_list
                },
                message=f"Fetched historical vendor team and machine attendance for {req_date}"
            )

        # ------------------------------------------------------------------
        # TODAY'S ROSTER
        # Source of truth: LIVE iLync Vendor API + today's Hero attendance records.
        # ------------------------------------------------------------------
        seen_record_ids = set()
        seen_live_chassis = set()

        for v_obj in target_vendors:
            v_ext = getattr(v_obj, 'external_vendor_id', None)
            if v_ext and v_ext in ilync_payload_by_ext_id:
                v_payload = ilync_payload_by_ext_id[v_ext]
                is_fallback = False
            else:
                v_payload, is_fallback = get_vendor_ilync_detail(
                    v_obj,
                    use_cache=(not force_refresh),
                    ttl=10,
                    force_refresh=force_refresh,
                    return_status=True
                )

            if not v_payload or not isinstance(v_payload, dict):
                v_payload = {}
                is_fallback = True

            live_vname = str(v_payload.get('partnerName') or v_payload.get('name') or '').strip()
            if live_vname and v_obj.name != live_vname:
                if not Vendor.objects.filter(name__iexact=live_vname).exclude(id=v_obj.id).exists():
                    try:
                        with transaction.atomic():
                            v_obj.name = live_vname
                            v_obj.save(update_fields=['name'])
                    except Exception:
                        pass
            current_vname = live_vname or v_obj.name

            v_circle = extract_geo(v_payload, ['circles', 'circle', 'circleName', 'state'])
            v_district = extract_geo(v_payload, ['districts', 'district', 'districtName', 'city'])
            v_block = extract_geo(v_payload, ['blocks', 'blockIds', 'block', 'blockName', 'tehsil'])

            v_macs = v_payload.get('machines') or v_payload.get('assigned_machines') or []
            v_mac_list = []
            if isinstance(v_macs, list):
                for m_item in v_macs:
                    if isinstance(m_item, dict):
                        m_code = str(m_item.get('machineNo') or m_item.get('name') or m_item.get('code') or '').strip()
                    elif isinstance(m_item, str) and m_item.strip():
                        m_code = m_item.strip()
                    else:
                        m_code = ''
                    if m_code:
                        db_m = db_machine_by_chassis.get(m_code)
                        if db_m and db_m.vendor_id and db_m.vendor_id != v_obj.id:
                            continue
                        if m_code not in v_mac_list:
                            v_mac_list.append(m_code)
            v_vendor_machine = ', '.join(v_mac_list)

            raw_users = v_payload.get('users') or []
            if not isinstance(raw_users, list):
                raw_users = []

            # If iLync failed/fallback and no cached users exist, preserve existing active DB users for this vendor
            if is_fallback and not raw_users:
                db_users = User.objects.filter(
                    Q(vendor=v_obj) | Q(hero_vendor_assignments__vendor=v_obj, hero_vendor_assignments__is_active=True),
                    is_active=True
                ).distinct()
                for db_u in db_users:
                    raw_users.append({
                        'userId': db_u.external_user_id or str(db_u.id),
                        'id': db_u.external_user_id or str(db_u.id),
                        'empId': db_u.employee_id,
                        'name': db_u.get_full_name() or db_u.username,
                        'mobile': db_u.phone_number,
                        'email': db_u.email,
                        'designation': getattr(db_u, 'designation', None) or getattr(db_u, 'role', 'OPERATOR'),
                        'role': getattr(db_u, 'role', 'OPERATOR'),
                        'active': True
                    })

            new_count = 0
            updated_count = 0
            removed_count = 0
            active_users_for_roster = []
            synced_active_uids = set()

            for u_info in raw_users:
                if not isinstance(u_info, dict):
                    continue

                ext_u_id = str(u_info.get('userId') or u_info.get('id') or '').strip()
                if ext_u_id.lower() in ('none', 'null', ''):
                    ext_u_id = None

                emp_id = u_info.get('empId')
                emp_id_str = str(emp_id).strip() if emp_id and str(emp_id).lower() not in ('none', 'null') else ''
                mobile = str(u_info.get('mobile') or u_info.get('phone') or u_info.get('phoneNumber') or '').strip()
                email = str(u_info.get('email') or '').strip()
                name = str(u_info.get('name') or u_info.get('contactName') or 'Team Member').strip()
                designation = str(u_info.get('designation') or u_info.get('role') or 'OPERATOR').strip()
                norm_role = normalize_attendance_role(designation)
                is_vendor_role = (norm_role == 'VENDOR' or 'VENDOR' in designation.upper())

                # Respect active status: If active is False, exclude from current Attendance Roster
                # BUT never exclude the VENDOR user (team head) even if marked active=False in iLync
                u_active = u_info.get('active')
                if u_active is False and not is_vendor_role:
                    continue

                if ext_u_id:
                    synced_active_uids.add(ext_u_id)

                # Match user primarily by external_user_id
                matched_user = None
                if ext_u_id:
                    matched_user = User.objects.filter(external_user_id=ext_u_id).first()

                # Secondary fallback if no external_user_id exists yet (only within this vendor, and only if user has no external_user_id)
                if not matched_user and v_obj:
                    cand_qs = User.objects.filter(vendor=v_obj, external_user_id__isnull=True)
                    if emp_id_str:
                        matched_user = cand_qs.filter(Q(employee_id=emp_id_str) | Q(username=emp_id_str)).first()
                    if not matched_user and mobile:
                        matched_user = cand_qs.filter(Q(phone_number=mobile) | Q(username=mobile)).first()
                    if not matched_user and email and not email.lower().startswith('user@'):
                        matched_user = cand_qs.filter(email__iexact=email).first()

                if matched_user:
                    # EXISTING / UPDATED iLYNC USER
                    # Update current profile fields from iLync
                    # DO NOT create duplicate Hero users for profile changes!
                    up_fields = []

                    if ext_u_id and matched_user.external_user_id != ext_u_id:
                        matched_user.external_user_id = ext_u_id
                        up_fields.append('external_user_id')

                    if name:
                        parts = name.split(None, 1)
                        first = parts[0]
                        last = parts[1] if len(parts) > 1 else ''
                        if matched_user.first_name != first:
                            matched_user.first_name = first
                            up_fields.append('first_name')
                        if matched_user.last_name != last:
                            matched_user.last_name = last
                            up_fields.append('last_name')

                    if emp_id_str and matched_user.employee_id != emp_id_str:
                        matched_user.employee_id = emp_id_str
                        up_fields.append('employee_id')

                    if mobile and matched_user.phone_number != mobile:
                        matched_user.phone_number = mobile
                        up_fields.append('phone_number')

                    if email and not email.lower().startswith('user@') and matched_user.email != email:
                        matched_user.email = email
                        up_fields.append('email')

                    if hasattr(User, 'designation') and designation and getattr(matched_user, 'designation', None) != designation:
                        matched_user.designation = designation
                        up_fields.append('designation')

                    if norm_role and matched_user.role != norm_role:
                        matched_user.role = norm_role
                        up_fields.append('role')

                    if not matched_user.is_active:
                        matched_user.is_active = True
                        up_fields.append('is_active')

                    if v_obj and matched_user.vendor_id != v_obj.id:
                        matched_user.vendor = v_obj
                        up_fields.append('vendor')

                    if up_fields:
                        try:
                            matched_user.save(update_fields=list(set(up_fields)))
                            updated_count += 1
                        except Exception as e:
                            print(f"[AttendanceRosterSync] Error updating user {matched_user.id}: {e}")

                    from apps.vendors.models import HeroVendorAssignment
                    assignment, _ = HeroVendorAssignment.objects.get_or_create(
                        user=matched_user,
                        vendor=v_obj,
                        defaults={'is_active': True}
                    )
                    if not assignment.is_active:
                        assignment.is_active = True
                        assignment.save(update_fields=['is_active'])

                else:
                    # NEW iLYNC USER
                    # Create local Hero mapping
                    base_usr = emp_id_str or mobile or (f"u_{ext_u_id[-8:]}" if ext_u_id else f"u_{v_obj.id}_{name.replace(' ', '')[:6]}")
                    username_val = base_usr
                    idx = 1
                    while User.objects.filter(username=username_val).exists():
                        username_val = f"{base_usr}_{idx}"
                        idx += 1

                    parts = name.split(None, 1) if name else [username_val, '']
                    first = parts[0]
                    last = parts[1] if len(parts) > 1 else ''

                    user_create_kwargs = {
                        'username': username_val,
                        'external_user_id': ext_u_id or None,
                        'employee_id': emp_id_str or None,
                        'phone_number': mobile or '',
                        'email': email or f"{username_val}@ilync.tech",
                        'first_name': first,
                        'last_name': last,
                        'role': norm_role,
                        'vendor': v_obj,
                        'is_active': True
                    }
                    if hasattr(User, 'designation'):
                        user_create_kwargs['designation'] = designation

                    try:
                        matched_user = User.objects.create(**user_create_kwargs)
                        from apps.vendors.models import HeroVendorAssignment
                        HeroVendorAssignment.objects.get_or_create(
                            user=matched_user,
                            vendor=v_obj,
                            defaults={'is_active': True}
                        )
                        new_count += 1
                    except Exception as e:
                        print(f"[AttendanceRosterSync] Error creating user for iLync userId {ext_u_id}: {e}")

                active_users_for_roster.append({
                    'u_info': u_info,
                    'matched_user': matched_user,
                    'ext_u_id': ext_u_id,
                    'emp_id_str': emp_id_str,
                    'mobile': mobile,
                    'email': email,
                    'name': name,
                    'designation': designation,
                    'norm_role': norm_role
                })

            # Ensure every active vendor has a VENDOR user in the roster
            has_vendor_user = any(item.get('norm_role') == 'VENDOR' for item in active_users_for_roster)
            if not has_vendor_user:
                v_contact = str(v_obj.contact_person or v_payload.get('contactName') or '').strip()
                v_phone = str(v_obj.phone or v_payload.get('phoneNumber') or '').strip()
                v_email = str(v_obj.email or v_payload.get('email') or '').strip()
                v_ext_user_id = None
                for raw_u in raw_users:
                    if isinstance(raw_u, dict) and ('VENDOR' in str(raw_u.get('designation') or '').upper() or 'VENDOR' in str(raw_u.get('role') or '').upper()):
                        v_contact = v_contact or str(raw_u.get('name') or raw_u.get('contactName') or '').strip()
                        v_phone = v_phone or str(raw_u.get('mobile') or raw_u.get('phone') or '').strip()
                        v_email = v_email or str(raw_u.get('email') or '').strip()
                        v_ext_user_id = str(raw_u.get('userId') or raw_u.get('id') or '').strip() or None
                        break

                if v_contact or v_phone:
                    display_name = v_contact or f"{v_obj.name} Vendor"
                    emp_code = f"VND-{v_phone}" if v_phone else f"VND-{v_obj.id}"
                    matched_vendor_user = None
                    if v_ext_user_id:
                        matched_vendor_user = User.objects.filter(external_user_id=v_ext_user_id).first()
                    if not matched_vendor_user and v_phone:
                        matched_vendor_user = User.objects.filter(phone_number=v_phone).first()
                    if not matched_vendor_user:
                        matched_vendor_user = User.objects.filter(vendor=v_obj, role='VENDOR').first()
                    if not matched_vendor_user:
                        base_u = emp_code or f"vnd_{v_obj.id}"
                        u_name = base_u
                        idx = 1
                        while User.objects.filter(username=u_name).exists():
                            u_name = f"{base_u}_{idx}"
                            idx += 1
                        try:
                            parts = display_name.split(None, 1)
                            first = parts[0]
                            last = parts[1] if len(parts) > 1 else ''
                            user_kwargs = {
                                'username': u_name,
                                'external_user_id': v_ext_user_id,
                                'employee_id': emp_code,
                                'phone_number': v_phone,
                                'email': v_email or f"{u_name}@ilync.tech",
                                'first_name': first,
                                'last_name': last,
                                'role': 'VENDOR',
                                'vendor': v_obj,
                                'is_active': True
                            }
                            if hasattr(User, 'designation'):
                                user_kwargs['designation'] = 'VENDOR'
                            matched_vendor_user = User.objects.create(**user_kwargs)
                        except Exception as e:
                            print(f"[AttendanceRosterSync] Could not create fallback vendor user for {v_obj.name}: {e}")

                    active_users_for_roster.insert(0, {
                        'u_info': {'userId': v_ext_user_id, 'name': display_name, 'mobile': v_phone, 'email': v_email, 'role': 'VENDOR', 'designation': 'VENDOR'},
                        'matched_user': matched_vendor_user,
                        'ext_u_id': v_ext_user_id,
                        'emp_id_str': emp_code,
                        'mobile': v_phone,
                        'email': v_email,
                        'name': display_name,
                        'designation': 'VENDOR',
                        'norm_role': 'VENDOR'
                    })

            # Sort active roster so VENDOR always appears first in the card
            active_users_for_roster.sort(key=lambda x: 0 if x.get('norm_role') == 'VENDOR' else 1)

            # Audit Log
            print(f"[AttendanceRosterSync] vendor={getattr(v_obj, 'external_vendor_id', v_obj.id)} ({v_obj.name}) iLync_users={len(raw_users)} active={len(active_users_for_roster)} new={new_count} updated={updated_count} removed={removed_count}")

            # Build rows for the current roster
            for item in active_users_for_roster:
                u_info = item['u_info']
                matched_user = item['matched_user']
                ext_u_id = item['ext_u_id']
                emp_id_str = item['emp_id_str']
                mobile = item['mobile']
                email = item['email']
                name = item['name']
                designation = item['designation']
                u_role = item['norm_role']

                # Role filter check
                if role_filter and role_filter.upper() != 'ALL':
                    if role_filter.upper() != u_role.upper():
                        continue

                # Search filter check
                if search_filter:
                    sp = search_filter.strip().lower()
                    if sp not in name.lower() and sp not in mobile and sp not in email.lower() and sp not in emp_id_str.lower():
                        continue

                # Find today's AttendanceRecord from Hero DB for this user
                rec_qs = AttendanceRecord.objects.filter(date=req_date).exclude(attendance_type='MACHINE')
                rec = None
                if matched_user:
                    rec = rec_qs.filter(user=matched_user).first()
                if rec:
                    seen_record_ids.add(rec.id)

                st = (rec.status if rec else 'NOT_MARKED').upper()
                counts['total'] += 1

                if st in ('PRESENT', 'CHECKED_IN', 'CHECKED_OUT'):
                    counts['present'] += 1
                elif st == 'ABSENT':
                    counts['absent'] += 1
                elif st in ['HALF_DAY', 'HALF DAY']:
                    counts['half_day'] += 1
                    st = 'HALF_DAY'
                elif st == 'LEAVE':
                    counts['leave'] += 1
                elif st in ['WEEK_OFF', 'WEEK OFF']:
                    counts['week_off'] += 1
                    st = 'WEEK_OFF'
                else:
                    counts['not_marked'] += 1
                    st = 'NOT_MARKED'

                bump_scope_matrix(scope_matrix_map, u_role, st)

                if status_filter and status_filter.upper() != 'ALL':
                    sf = status_filter.upper().replace(' ', '_')
                    if sf != st:
                        continue

                check_in_photo_url = build_secure_media_url(request, rec.check_in_photo) if rec else None
                check_out_photo_url = build_secure_media_url(request, rec.check_out_photo) if rec else None

                u_circle = extract_geo(u_info, ['circle', 'circleName', 'circles', 'circle_name', 'state'])
                u_district = extract_geo(u_info, ['district', 'districtName', 'districts', 'district_name', 'city'])
                u_block = extract_geo(u_info, ['block', 'blockName', 'blocks', 'block_name', 'tehsil'])

                u_mac = (
                    u_info.get('machine') or u_info.get('machineNo') or u_info.get('machine_no') or
                    u_info.get('assigned_machine') or u_info.get('machineName') or u_info.get('machine_name') or
                    u_info.get('machine_chassis_no') or u_info.get('chassis_no') or ''
                )
                if isinstance(u_mac, dict):
                    u_mac = u_mac.get('name') or u_mac.get('machineNo') or u_mac.get('code') or ''
                elif isinstance(u_mac, list) and len(u_mac) > 0:
                    first_m = u_mac[0]
                    if isinstance(first_m, dict):
                        u_mac = first_m.get('name') or first_m.get('machineNo') or first_m.get('code') or ''
                    else:
                        u_mac = str(first_m)
                u_mac_str = str(u_mac or (rec.machine_chassis_no or rec.machine_id if rec else '') or '').strip()

                final_circle = u_circle or (matched_user.selected_circle.name if (matched_user and getattr(matched_user, 'selected_circle', None)) else '') or v_circle
                final_district = u_district or (matched_user.selected_district.name if (matched_user and getattr(matched_user, 'selected_district', None)) else '') or v_district
                final_block = u_block or (matched_user.selected_block.name if (matched_user and getattr(matched_user, 'selected_block', None)) else '') or v_block
                final_machine = u_mac_str or v_vendor_machine

                effective_user_id = ext_u_id or (str(matched_user.id) if matched_user else f"ILYNC-{name.replace(' ', '_')}_{mobile}")
                emp_display = emp_id_str or (matched_user.employee_id if (matched_user and matched_user.employee_id) else None) or (f"EMP-{matched_user.id}" if matched_user else f"EMP-{effective_user_id}")

                check_in_dt = (rec.check_in or rec.created_at) if (rec and rec.status in ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT', 'HALF_DAY']) else None
                check_out_dt = rec.check_out if (rec and rec.check_out) else None

                result_list.append({
                    'user_id': matched_user.id if matched_user else effective_user_id,
                    'external_user_id': ext_u_id,
                    'employee_id': emp_display,
                    'user_name': name,
                    'phone_number': mobile,
                    'email': email,
                    'role': u_role,
                    'designation': designation,
                    'circle': final_circle,
                    'district': final_district,
                    'block': final_block,
                    'machine': final_machine,
                    'vendor_name': current_vname,
                    'vendor_id': v_obj.id,
                    'vendor_external_id': getattr(v_obj, 'external_vendor_id', None),
                    'is_active': True,
                    'reporting_manager_name': rec.reporting_manager.get_full_name() if (rec and rec.reporting_manager) else '',
                    'attendance_id': rec.id if rec else None,
                    'date': req_date,
                    'status': st,
                    'approval_status': rec.approval_status if rec else 'PENDING',
                    'rejection_reason': rec.rejection_reason if rec else None,
                    'attendance_type': rec.attendance_type if rec else 'TEAM',
                    'machine_chassis_no': (rec.machine_chassis_no if rec else u_mac_str) or None,
                    'check_in': timezone.localtime(check_in_dt).strftime('%H:%M') if check_in_dt else None,
                    'check_out': timezone.localtime(check_out_dt).strftime('%H:%M') if check_out_dt else None,
                    'check_in_time': timezone.localtime(check_in_dt).isoformat() if check_in_dt else None,
                    'check_out_time': timezone.localtime(check_out_dt).isoformat() if check_out_dt else None,
                    'check_in_latitude': float(rec.check_in_latitude) if (rec and rec.check_in_latitude) else None,
                    'check_in_longitude': float(rec.check_in_longitude) if (rec and rec.check_in_longitude) else None,
                    'check_in_accuracy': rec.check_in_accuracy if (rec and rec.check_in_accuracy) else None,
                    'check_in_photo': check_in_photo_url,
                    'check_out_photo': check_out_photo_url,
                    'total_working_hours': rec.total_working_hours if rec else None,
                    'notes': rec.notes if rec else '',
                    'marked_by_name': rec.marked_by.get_full_name() if (rec and rec.marked_by) else ''
                })

            # 2. LIVE MACHINES directly from iLync response (v_payload.get('machines'))
            raw_machines = v_payload.get('machines') or v_payload.get('assigned_machines') or []
            if not isinstance(raw_machines, list):
                raw_machines = []

            for m_info in raw_machines:
                if not isinstance(m_info, dict):
                    continue
                mac_id = m_info.get('id')
                mac_name = m_info.get('model_name') or m_info.get('name') or m_info.get('model') or 'Machine'
                mac_code = m_info.get('code') or m_info.get('model_code') or f"MAC-{mac_id or 1}"
                chassis_val = str(m_info.get('machineNo') or m_info.get('machine_no') or m_info.get('serial_number') or m_info.get('machine_chassis_no') or '').strip()
                if not chassis_val:
                    continue

                # 1. Canonical DB Vendor Protection:
                # If this machine is canonically assigned to a vendor in Hero DB, ensure it ONLY ever appears under that vendor.
                # Never let an erroneous upstream API duplicate it under another vendor.
                db_m = db_machine_by_chassis.get(chassis_val)
                if db_m and db_m.vendor_id and db_m.vendor_id != v_obj.id:
                    continue

                # 2. Deduplication Protection:
                # A machine cannot be assigned to more than one vendor simultaneously.
                if chassis_val in seen_live_chassis:
                    continue
                seen_live_chassis.add(chassis_val)

                op_name = m_info.get('operator_name') or (m_info.get('operator', {}).get('name') if isinstance(m_info.get('operator'), dict) else '')

                m_rec = AttendanceRecord.objects.filter(date=req_date, attendance_type='MACHINE').filter(
                    Q(machine_id=str(mac_id)) | Q(machine_chassis_no=chassis_val)
                ).first()

                m_status = (m_rec.status if m_rec else 'NOT_MARKED').upper()
                working_meta = _machine_working_payload(
                    m_status, chassis_val, oem_by_chassis, ops_by_chassis
                )
                display_status = m_status
                if working_meta['working_state'] == 'NOT_WORKING':
                    display_status = 'NOT_WORKING'
                elif working_meta['working_state'] == 'WORKING' and m_status == 'NOT_MARKED':
                    display_status = 'WORKING'

                assigned_machines_list.append({
                    'machine_id': mac_id,
                    'name': mac_name,
                    'code': mac_code,
                    'machine_no': chassis_val,
                    'chassis_no': chassis_val,
                    'vendor_name': current_vname,
                    'vendor_id': v_obj.id,
                    'operator_name': op_name,
                    'status': display_status,
                    'attendance_status': m_status,
                    'attendance_type': 'MACHINE',
                    'check_in': timezone.localtime(m_rec.check_in).strftime('%H:%M') if (m_rec and m_rec.check_in) else None,
                    'check_out': timezone.localtime(m_rec.check_out).strftime('%H:%M') if (m_rec and m_rec.check_out) else None,
                    'check_in_photo': build_secure_media_url(request, m_rec.check_in_photo) if m_rec else None,
                    'check_out_photo': build_secure_media_url(request, m_rec.check_out_photo) if m_rec else None,
                    'notes': m_rec.notes if m_rec else '',
                    'check_in_latitude': float(m_rec.check_in_latitude) if (m_rec and m_rec.check_in_latitude) else None,
                    'check_in_longitude': float(m_rec.check_in_longitude) if (m_rec and m_rec.check_in_longitude) else None,
                    'check_in_accuracy': m_rec.check_in_accuracy if (m_rec and m_rec.check_in_accuracy) else None,
                    'total_working_hours': m_rec.total_working_hours if m_rec else None,
                    'attendance_id': m_rec.id if m_rec else None,
                    'approval_status': m_rec.approval_status if m_rec else 'PENDING',
                    **working_meta,
                })

        return success_response(
            data={
                'date': req_date,
                'summary': counts,
                'scope_matrix': [scope_matrix_map[s] for s in ATTENDANCE_SCOPE_ROLES],
                'team_members': result_list,
                'assigned_machines': assigned_machines_list
            },
            message=f"Fetched live vendor team and machine attendance for {req_date}"
        )

    @action(detail=False, methods=['post'], url_path='bulk-mark')
    def bulk_mark(self, request):
        """
        Bulk save/update team attendance for a date.
        Body: { date: 'YYYY-MM-DD', records: [{ user_id, status, notes, check_in, check_out, ... }] }
        """
        auto_checkout_overnight_records()
        records_data = request.data.get('records') or []
        req_date = request.data.get('date') or str(timezone.localdate())

        if not isinstance(records_data, list):
            return error_response(
                message="`records` must be an array of attendance items.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        def safe_float(v):
            if v is not None and str(v).strip() not in ('', 'null', 'undefined', 'None'):
                try:
                    return float(v)
                except Exception:
                    return None
            return None

        # Determine default authorizing vendor for bulk marking
        allowed_v_ids = get_user_vendor_ids(request.user)
        req_v = request.data.get('vendor_id') or request.data.get('vendor') or request.data.get('vendorId')
        default_authorizing_vendor = None
        if req_v:
            from apps.vendors.models import Vendor
            req_v_str = str(req_v).strip()
            cand_v = None
            if req_v_str.isdigit():
                cand_v = Vendor.objects.filter(id=int(req_v_str)).first()
            if not cand_v:
                cand_v = Vendor.objects.filter(external_vendor_id=req_v_str).first()
            if not cand_v:
                cand_v = Vendor.objects.filter(name__iexact=req_v_str).first()
            if cand_v and (allowed_v_ids is None or cand_v.id in allowed_v_ids):
                default_authorizing_vendor = cand_v

        if not default_authorizing_vendor:
            user_ven = getattr(request.user, 'vendor', None) or get_user_vendor(request.user, allow_network=False)
            if user_ven and (allowed_v_ids is None or user_ven.id in allowed_v_ids):
                default_authorizing_vendor = user_ven

        if not default_authorizing_vendor and allowed_v_ids:
            from apps.vendors.models import Vendor
            default_authorizing_vendor = Vendor.objects.filter(id__in=allowed_v_ids).first()

        saved_records = []
        skipped = 0
        for item in records_data:
            if not isinstance(item, dict):
                skipped += 1
                continue

            u_id = item.get('user_id') or item.get('user') or item.get('userId') or item.get('id') or item.get('employee_id') or item.get('employeeId')
            ext_u_id = item.get('external_user_id') or item.get('externalUserId')
            if u_id and not ext_u_id and len(str(u_id).strip()) == 24 and not str(u_id).strip().isdigit():
                ext_u_id = str(u_id).strip()

            if not u_id and not ext_u_id:
                skipped += 1
                continue

            target_user = resolve_target_user(u_id, request_user=request.user, external_user_id=ext_u_id)
            if not target_user:
                skipped += 1
                continue

            # Determine item authorizing vendor
            item_vendor_id = item.get('vendor_id') or item.get('vendor') or item.get('vendorId')
            item_authorizing_vendor = default_authorizing_vendor
            if item_vendor_id:
                from apps.vendors.models import Vendor
                iv_str = str(item_vendor_id).strip()
                cand_v = None
                if iv_str.isdigit():
                    cand_v = Vendor.objects.filter(id=int(iv_str)).first()
                if not cand_v:
                    cand_v = Vendor.objects.filter(external_vendor_id=iv_str).first()
                if not cand_v:
                    cand_v = Vendor.objects.filter(name__iexact=iv_str).first()
                if cand_v and (allowed_v_ids is None or cand_v.id in allowed_v_ids):
                    item_authorizing_vendor = cand_v

            try:
                validate_employee_attendance_access(request.user, target_user, vendor_obj=item_authorizing_vendor)
            except PermissionDenied:
                skipped += 1
                continue

            # Enrich shell / iLync-linked users with roster metadata when provided
            updates = []
            phone = str(item.get('phone_number') or item.get('phone') or '').strip()
            email = str(item.get('email') or '').strip()
            name = str(item.get('user_name') or item.get('name') or '').strip()
            if phone and not target_user.phone_number:
                target_user.phone_number = phone
                updates.append('phone_number')
            if email and (not target_user.email or str(target_user.email).lower().startswith('user@')):
                target_user.email = email
                updates.append('email')
            if name and (not target_user.first_name or target_user.first_name == str(u_id)):
                parts = name.split(None, 1)
                target_user.first_name = parts[0]
                if len(parts) > 1:
                    target_user.last_name = parts[1]
                    updates.append('last_name')
                updates.append('first_name')
            vendor_id = item.get('vendor_id')
            if vendor_id and not target_user.vendor_id:
                try:
                    from apps.vendors.models import Vendor
                    v_obj = Vendor.objects.filter(
                        Q(id=vendor_id if str(vendor_id).isdigit() else None) |
                        Q(external_vendor_id=str(vendor_id))
                    ).first()
                    if v_obj:
                        target_user.vendor = v_obj
                        updates.append('vendor')
                except Exception:
                    pass
            if updates:
                try:
                    target_user.save(update_fields=list(dict.fromkeys(updates)))
                except Exception as e:
                    print(f"[BulkMark] Failed enriching user {u_id}: {e}")

            st_val = (item.get('status') or 'PRESENT').upper().replace(' ', '_')
            if st_val in ('NOT_MARKED', 'NOT_CHECKED_IN', ''):
                # Leave unmarked rows out of DB unless explicitly requested
                skipped += 1
                continue

            notes_val = item.get('notes') or item.get('remarks') or ''
            check_in_val = item.get('check_in')
            check_out_val = item.get('check_out')
            lat_val = item.get('check_in_latitude') or item.get('latitude')
            lng_val = item.get('check_in_longitude') or item.get('longitude')
            acc_val = item.get('check_in_accuracy') or item.get('accuracy')
            loc_source = item.get('location_source') or 'GPS'

            target_vendor = item_authorizing_vendor or target_user.vendor or get_user_vendor(target_user) or get_user_vendor(request.user)
            reporting_mgr = resolve_reporting_manager(
                target_user, marked_by_user=request.user, vendor=target_vendor
            )

            f_lat = safe_float(lat_val)
            f_lng = safe_float(lng_val)
            f_acc = safe_float(acc_val)

            if st_val in ['PRESENT', 'CHECKED_IN', 'HALF_DAY'] and not check_in_val:
                check_in_val = timezone.now()

            ext_u_id_val = str(item.get('external_user_id') or item.get('userId') or getattr(target_user, 'external_user_id', '') or '').strip() or None
            emp_id_val = str(item.get('employee_id') or item.get('empId') or getattr(target_user, 'employee_id', '') or '').strip() or (f"EMP-{target_user.id}" if target_user else None)
            name_val = str(item.get('user_name') or item.get('name') or (target_user.get_full_name() if target_user else '') or target_user.username).strip()
            phone_val = str(item.get('phone_number') or item.get('mobile') or getattr(target_user, 'phone_number', '') or '').strip() or None
            role_val = str(item.get('role') or item.get('designation') or (target_user.get_role_list()[0] if (target_user and target_user.get_role_list()) else 'OPERATOR')).strip()
            v_name_val = str(item.get('vendor_name') or (target_vendor.name if target_vendor else (target_user.vendor.name if target_user and target_user.vendor else ''))).strip() or None
            v_ext_id_val = str(item.get('vendor_external_id') or getattr(target_vendor, 'external_vendor_id', '') or getattr(getattr(target_user, 'vendor', None), 'external_vendor_id', '') or '').strip() or None

            record = (
                AttendanceRecord.objects.filter(user=target_user, date=req_date)
                .exclude(attendance_type='MACHINE')
                .first()
            )
            created = False
            if not record:
                record = AttendanceRecord.objects.create(
                    user=target_user,
                    date=req_date,
                    attendance_type='TEAM',
                    vendor=target_vendor,
                    reporting_manager=reporting_mgr,
                    status=st_val,
                    notes=notes_val,
                    check_in=check_in_val,
                    check_out=check_out_val,
                    check_in_latitude=f_lat,
                    check_in_longitude=f_lng,
                    check_in_accuracy=f_acc,
                    location_source=loc_source,
                    marked_by=request.user,
                    updated_by=request.user,
                    marked_for_user=target_user,
                    external_user_id_snapshot=ext_u_id_val,
                    employee_id_snapshot=emp_id_val,
                    user_name_snapshot=name_val,
                    phone_number_snapshot=phone_val,
                    role_snapshot=role_val,
                    vendor_name_snapshot=v_name_val,
                    vendor_external_id_snapshot=v_ext_id_val,
                )
                created = True
            else:
                record.status = st_val
                record.notes = notes_val
                if check_in_val is not None:
                    record.check_in = check_in_val
                elif not record.check_in and st_val in ['PRESENT', 'CHECKED_IN', 'HALF_DAY']:
                    record.check_in = timezone.now()
                if check_out_val is not None:
                    record.check_out = check_out_val
                if f_lat is not None:
                    record.check_in_latitude = f_lat
                if f_lng is not None:
                    record.check_in_longitude = f_lng
                if f_acc is not None:
                    record.check_in_accuracy = f_acc
                record.updated_by = request.user
                if target_vendor and (not record.vendor_id or record.vendor_id != target_vendor.id):
                    record.vendor = target_vendor
                    record.vendor_name_snapshot = v_name_val
                    record.vendor_external_id_snapshot = v_ext_id_val
                if reporting_mgr and not record.reporting_manager:
                    record.reporting_manager = reporting_mgr
                # Only enrich empty snapshot fields (never overwrite existing historical identity)
                if not record.user_name_snapshot and name_val:
                    record.user_name_snapshot = name_val
                if not record.external_user_id_snapshot and ext_u_id_val:
                    record.external_user_id_snapshot = ext_u_id_val
                if not record.employee_id_snapshot and emp_id_val:
                    record.employee_id_snapshot = emp_id_val
                if not record.phone_number_snapshot and phone_val:
                    record.phone_number_snapshot = phone_val
                if not record.role_snapshot and role_val:
                    record.role_snapshot = role_val
                if not record.vendor_name_snapshot and v_name_val:
                    record.vendor_name_snapshot = v_name_val
                record.save()

            if created and reporting_mgr:
                notify_user(
                    reporting_mgr,
                    "Pending Attendance Approval",
                    f"Attendance for {target_user.get_full_name() or target_user.username} submitted for {req_date} requires your approval.",
                )

            saved_records.append(record)

        return success_response(
            data={
                'saved': AttendanceRecordSerializer(
                    saved_records, many=True, context={'request': request}
                ).data,
                'saved_count': len(saved_records),
                'skipped_count': skipped,
                'date': req_date,
            },
            message=f"Successfully updated attendance for {len(saved_records)} team members.",
        )

    @action(detail=False, methods=['get'], url_path='export-report')
    def export_report(self, request):
        import openpyxl
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        from openpyxl.utils import get_column_letter
        from django.http import HttpResponse

        req_date = request.query_params.get('date') or str(timezone.localdate())
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        req_v = request.query_params.get('vendor_id') or request.query_params.get('vendor')
        role_filter = request.query_params.get('role')
        status_filter = request.query_params.get('status')
        search_filter = request.query_params.get('search')

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Attendance Report"

        headers = [
            'SR No', 'Employee ID', 'Machine', 'Name', 'Role', 'Contact No',
            'Date', 'Circle', 'District', 'Block', 'Check In',
            'Check Out', 'Latitute', 'Longitute', 'RM', 'Remarks / Notes'
        ]

        ws.append(headers)

        # Style header row
        header_font = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
        header_fill = PatternFill(start_color='1F4E78', end_color='1F4E78', fill_type='solid')
        header_align = Alignment(horizontal='center', vertical='center', wrap_text=True)

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align

        ws.row_dimensions[1].height = 28

        def clean_val(val):
            if val is None:
                return ''
            s = str(val).strip()
            if s.upper() in ('NONE', 'NULL', 'UNDEFINED', 'NAN'):
                return ''
            return s

        def format_date_str(d_val):
            if not d_val:
                return ''
            if isinstance(d_val, datetime):
                return d_val.strftime('%d/%m/%Y')
            d_str = str(d_val).strip()
            try:
                dt_obj = datetime.strptime(d_str[:10], '%Y-%m-%d')
                return dt_obj.strftime('%d/%m/%Y')
            except Exception:
                return d_str

        def format_time_str(t_val):
            if not t_val:
                return ''
            if isinstance(t_val, datetime):
                return timezone.localtime(t_val).strftime('%I:%M %p')
            t_str = str(t_val).strip()
            if not t_str or t_str.upper() in ('NONE', 'NULL', 'UNDEFINED', '--:--', 'NAN'):
                return ''
            try:
                if len(t_str) == 5:
                    dt_obj = datetime.strptime(t_str, '%H:%M')
                    return dt_obj.strftime('%I:%M %p')
                elif len(t_str) == 8:
                    dt_obj = datetime.strptime(t_str, '%H:%M:%S')
                    return dt_obj.strftime('%I:%M %p')
            except Exception:
                pass
            return t_str

        rows_to_export = []
        sr_counter = 1

        if date_from or date_to:
            qs = self.get_queryset().exclude(attendance_type='MACHINE')
            if date_from:
                qs = qs.filter(date__gte=date_from)
            if date_to:
                qs = qs.filter(date__lte=date_to)
            if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
                clean_v = str(req_v).strip()
                qs = qs.filter(
                    Q(vendor__external_vendor_id=clean_v) |
                    Q(vendor__name__iexact=clean_v) |
                    Q(vendor__name__iexact=str(req_v)) |
                    Q(vendor__name__icontains=clean_v) |
                    Q(vendor_id=clean_v if clean_v.isdigit() else None)
                )
            if status_filter and status_filter.upper() != 'ALL':
                qs = qs.filter(status__iexact=status_filter)
            if role_filter and role_filter.upper() != 'ALL':
                qs = qs.filter(
                    Q(user__role__icontains=role_filter) |
                    Q(user__roles__name__icontains=role_filter)
                )
            if search_filter:
                sp = search_filter.strip()
                qs = qs.filter(
                    Q(user__first_name__icontains=sp) |
                    Q(user__last_name__icontains=sp) |
                    Q(user__username__icontains=sp) |
                    Q(user__phone_number__icontains=sp)
                )

            records = list(qs.select_related(
                'user', 'vendor', 'reporting_manager',
                'user__selected_circle', 'user__selected_district', 'user__selected_block',
                'user__reporting_manager'
            ).order_by('date', 'id'))

            vendor_payload_cache = {}
            from apps.integrations.ilync_client import IlyncClient
            client = IlyncClient()

            for rec in records:
                u = rec.user
                if not u:
                    continue
                emp_id = clean_val(rec.employee_id_snapshot or (u.employee_id if u else None) or (u.external_user_id if u else None) or (f"EMP-{u.id}" if u else f"EMP-{rec.id}"))
                if not emp_id or emp_id.lower() in ('none', 'null', 'undefined'):
                    emp_id = (u.username if u else None) or f"EMP-{rec.id}"

                v_obj = rec.vendor or getattr(u, 'vendor', None) or get_user_vendor(u, resolve_fallback=False)
                v_circle, v_district, v_block, v_vendor_machine = '', '', '', ''
                if v_obj:
                    ext_v_id = str(v_obj.external_vendor_id or v_obj.id).strip()
                    if ext_v_id not in vendor_payload_cache:
                        try:
                            live_res = client.get_vendor_by_id(ext_v_id)
                            v_payload = live_res.get('data') if (isinstance(live_res, dict) and live_res.get('success')) else (live_res if isinstance(live_res, dict) else {})
                            v_c = extract_geo(v_payload, ['circles', 'circle', 'circleName', 'state'])
                            v_d = extract_geo(v_payload, ['districts', 'district', 'districtName', 'city'])
                            v_b = extract_geo(v_payload, ['blocks', 'blockIds', 'block', 'blockName', 'tehsil'])
                            v_macs = v_payload.get('machines') or v_payload.get('assigned_machines') or []
                            v_mac_list = []
                            if isinstance(v_macs, list):
                                for m_item in v_macs:
                                    if isinstance(m_item, dict):
                                        m_code = str(m_item.get('machineNo') or m_item.get('name') or m_item.get('code') or '').strip()
                                        if m_code and m_code not in v_mac_list:
                                            v_mac_list.append(m_code)
                                    elif isinstance(m_item, str) and m_item.strip():
                                        v_mac_list.append(m_item.strip())
                            v_m = ', '.join(v_mac_list)
                            vendor_payload_cache[ext_v_id] = (v_c, v_d, v_b, v_m)
                        except Exception:
                            vendor_payload_cache[ext_v_id] = ('', '', '', '')
                    v_circle, v_district, v_block, v_vendor_machine = vendor_payload_cache[ext_v_id]

                mac_val = clean_val(rec.machine_chassis_no or rec.machine_id or v_vendor_machine)
                name = clean_val(rec.user_name_snapshot or (u.get_full_name() or u.username if u else ''))
                role = clean_val(rec.role_snapshot or (u.get_role_list()[0] if (u and u.get_role_list()) else (u.role if u else 'OPERATOR')))
                contact = clean_val(rec.phone_number_snapshot or (u.phone_number if u else ''))
                date_val = format_date_str(rec.date)

                circle = clean_val((u.selected_circle.name if (u and getattr(u, 'selected_circle', None)) else '') or v_circle)
                district = clean_val((u.selected_district.name if (u and getattr(u, 'selected_district', None)) else '') or v_district)
                block = clean_val((u.selected_block.name if (u and getattr(u, 'selected_block', None)) else '') or v_block)


                check_in = format_time_str(rec.check_in) if rec.check_in else ''
                check_out = format_time_str(rec.check_out) if rec.check_out else ''
                lat = clean_val(rec.check_in_latitude)
                lng = clean_val(rec.check_in_longitude)

                rm = ''
                if rec.reporting_manager:
                    rm = clean_val(rec.reporting_manager.get_full_name() or rec.reporting_manager.username)
                elif u and u.reporting_manager:
                    rm = clean_val(u.reporting_manager.get_full_name() or u.reporting_manager.username)

                notes = clean_val(rec.notes)

                rows_to_export.append([
                    sr_counter, emp_id, mac_val, name, role, contact,
                    date_val, circle, district, block, check_in,
                    check_out, lat, lng, rm, notes
                ])
                sr_counter += 1
        else:
            res = self.get_team_attendance(request)
            data_dict = res.data.get('data', {}) if isinstance(res.data, dict) else {}
            team_members = data_dict.get('team_members', []) or []

            if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
                req_v_str = str(req_v).strip().lower()
                filtered_members = []
                for m in team_members:
                    v_name = str(m.get('vendor_name') or '').strip().lower()
                    v_id = str(m.get('vendor_id') or '').strip().lower()
                    if req_v_str == v_name or req_v_str == v_id or req_v_str in v_name or v_name in req_v_str:
                        filtered_members.append(m)
                team_members = filtered_members

            for m in team_members:
                u_id = str(m.get('user_id') or m.get('employee_id') or '').strip()
                matched_u = resolve_target_user(u_id, request_user=request.user) if u_id else None

                emp_id = clean_val(m.get('employee_id') or m.get('user_id') or '')
                if not emp_id or emp_id.lower() in ('none', 'null', 'undefined'):
                    emp_id = clean_val((matched_u.employee_id or matched_u.external_user_id or matched_u.username) if matched_u else u_id)

                mac_val = clean_val(m.get('machine') or m.get('machine_chassis_no') or m.get('machine_no') or m.get('machine_id'))
                name = clean_val(m.get('user_name') or (matched_u.get_full_name() if matched_u else ''))
                role = clean_val(m.get('role') or (matched_u.get_role_list()[0] if (matched_u and matched_u.get_role_list()) else 'OPERATOR'))
                contact = clean_val(m.get('phone_number') or (matched_u.phone_number if matched_u else ''))
                date_val = format_date_str(m.get('date') or req_date)

                circle = clean_val(m.get('circle') or (matched_u.selected_circle.name if (matched_u and getattr(matched_u, 'selected_circle', None)) else ''))
                district = clean_val(m.get('district') or (matched_u.selected_district.name if (matched_u and getattr(matched_u, 'selected_district', None)) else ''))
                block = clean_val(m.get('block') or (matched_u.selected_block.name if (matched_u and getattr(matched_u, 'selected_block', None)) else ''))

                check_in = format_time_str(m.get('check_in'))
                check_out = format_time_str(m.get('check_out'))
                lat = clean_val(m.get('check_in_latitude'))
                lng = clean_val(m.get('check_in_longitude'))

                rm = clean_val(m.get('reporting_manager_name') or (matched_u.reporting_manager.get_full_name() if (matched_u and matched_u.reporting_manager) else ''))
                notes = clean_val(m.get('notes'))

                rows_to_export.append([
                    sr_counter, emp_id, mac_val, name, role, contact,
                    date_val, circle, district, block, check_in,
                    check_out, lat, lng, rm, notes
                ])
                sr_counter += 1

        for row_data in rows_to_export:
            ws.append(row_data)

        thin_border = Border(
            left=Side(style='thin', color='D9D9D9'),
            right=Side(style='thin', color='D9D9D9'),
            top=Side(style='thin', color='D9D9D9'),
            bottom=Side(style='thin', color='D9D9D9')
        )
        data_font = Font(name='Calibri', size=10)

        for row_idx in range(2, ws.max_row + 1):
            ws.row_dimensions[row_idx].height = 20
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.font = data_font
                cell.border = thin_border
                if col_idx in (1, 7, 11, 12):
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                elif col_idx in (13, 14):
                    cell.alignment = Alignment(horizontal='right', vertical='center')
                else:
                    cell.alignment = Alignment(horizontal='left', vertical='center')

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or '')
                max_len = max(max_len, len(val_str))
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        filename = f"Attendance_Report_{date_from}_to_{date_to}.xlsx" if (date_from and date_to) else f"Attendance_Report_{req_date}.xlsx"
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'

        wb.save(response)
        return response
