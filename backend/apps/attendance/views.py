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
from .services import auto_checkout_overnight_records
from apps.common.reporting_scope import get_reporting_scope

import base64
from django.core.files.base import ContentFile

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
    target_vendor = vendor or getattr(target_user, 'vendor', None) or get_user_vendor(target_user, resolve_fallback=False)
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

def resolve_target_user(user_id_param, request_user=None):
    if not user_id_param:
        return None
    if isinstance(user_id_param, User):
        return user_id_param

    param_str = str(user_id_param).strip()
    if not param_str or param_str.lower() in ('none', 'null', 'undefined'):
        return None

    # 1. Search FIRST by external_user_id (exact match for iLync ID)
    u = User.objects.filter(external_user_id=param_str).first()
    if u:
        return u

    # 2. Search by employee_id, username, phone_number, email
    u = User.objects.filter(
        Q(employee_id=param_str) |
        Q(username=param_str) |
        Q(phone_number=param_str) |
        Q(email__iexact=param_str)
    ).first()
    if u:
        return u

    # 3. If not found by external ID / username / email / phone, check if param_str is digit matching local User ID primary key
    if param_str.isdigit():
        u = User.objects.filter(id=int(param_str)).first()
        if u:
            return u

    # 4. If still not found, create lightweight shell user with external_user_id = param_str
    base_name = param_str.split('@')[0] if '@' in param_str else param_str
    clean_u = clean_username(base_name)
    if User.objects.filter(username=clean_u).exists():
        clean_u = f"{clean_u}_{int(timezone.now().timestamp())}"

    target_vendor = None
    if request_user:
        target_vendor = getattr(request_user, 'vendor', None) or get_user_vendor(request_user)

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

def clean_username(val):
    clean = "".join(c for c in val if c.isalnum() or c in ('_', '-'))
    return clean if clean else f"user_{int(timezone.now().timestamp())}"

def validate_employee_attendance_access(request_user, target_user):
    """
    Validates if request_user is authorized to manage/view attendance for target_user.
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

    # Determine target user vendor
    target_vendor_ids = []
    if target_user.vendor_id:
        target_vendor_ids.append(target_user.vendor_id)
    target_assignments = list(target_user.hero_vendor_assignments.filter(is_active=True).values_list('vendor_id', flat=True))
    target_vendor_ids.extend(target_assignments)

    # If target user belongs to explicit vendors, ensure request_user has access to at least one
    if target_vendor_ids:
        if not any(v_id in allowed_vendor_ids for v_id in target_vendor_ids):
            raise PermissionDenied("You do not have permission to manage attendance for this employee.")
    else:
        # If target user is a new iLync team member shell user without assigned vendor_id, associate primary vendor
        if allowed_vendor_ids and len(allowed_vendor_ids) > 0:
            try:
                from apps.vendors.models import Vendor
                v_inst = Vendor.objects.filter(id=allowed_vendor_ids[0]).first()
                if v_inst:
                    target_user.vendor = v_inst
                    target_user.save(update_fields=['vendor'])
            except Exception as e:
                print(f"[AttendanceAccess] Error associating vendor to shell user: {e}")

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
        user = request.user
        target_user_id = request.data.get('user_id') or request.data.get('marked_for_user_id') or request.data.get('user')
        if target_user_id:
            target_user = resolve_target_user(target_user_id, request.user)
            if target_user:
                validate_employee_attendance_access(request.user, target_user)
                user = target_user

        today = timezone.localdate()
        lat = request.data.get('latitude') or request.data.get('check_in_latitude')
        lng = request.data.get('longitude') or request.data.get('check_in_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_in_accuracy')
        loc_source = request.data.get('location_source') or 'GPS'
        att_type = request.data.get('attendance_type') or 'TEAM'
        if att_type == 'MACHINE':
            att_type = 'TEAM'

        processed_photo = process_attendance_photo(request, 'checkin', user.id)

        # 1. Check if record already exists for today to prevent duplicates
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
            existing.save()
            serializer = AttendanceRecordSerializer(existing, context={'request': request})
            return Response({
                "success": True,
                "message": "Check-in successful",
                "data": serializer.data
            }, status=status.HTTP_200_OK)

        target_vendor = user.vendor or get_user_vendor(user) or get_user_vendor(request.user)
        reporting_mgr = resolve_reporting_manager(user, marked_by_user=request.user, vendor=target_vendor)

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
            updated_by=request.user
        )

        if reporting_mgr:
            notify_user(
                reporting_mgr,
                "Pending Attendance Approval",
                f"Attendance check-in submitted by {user.get_full_name() or user.username} for {today} requires your approval."
            )

        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response({
            "success": True,
            "message": "Check-in successful",
            "data": serializer.data
        }, status=status.HTTP_201_CREATED)

    # 4.3 Employee Self Check-Out
    @action(detail=False, methods=['post'], url_path='check-out')
    def check_out(self, request):
        user = request.user
        target_user_id = request.data.get('user_id') or request.data.get('marked_for_user_id') or request.data.get('user')
        if target_user_id:
            target_user = resolve_target_user(target_user_id, request.user)
            if target_user:
                validate_employee_attendance_access(request.user, target_user)
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
        target_user_id = request.data.get('marked_for_user_id') or request.data.get('user_id')
        if not target_user_id:
            return error_response(message="marked_for_user_id is required.", status_code=status.HTTP_400_BAD_REQUEST)

        target_user = resolve_target_user(target_user_id)
        if not target_user:
            return error_response(message="Target team member not found.", status_code=status.HTTP_404_NOT_FOUND)

        validate_employee_attendance_access(request.user, target_user)
        today = timezone.localdate()
        lat = request.data.get('latitude') or request.data.get('check_in_latitude')
        lng = request.data.get('longitude') or request.data.get('check_in_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_in_accuracy')
        photo = process_attendance_photo(request, 'checkin', target_user.id)

        target_vendor = target_user.vendor or get_user_vendor(target_user) or get_user_vendor(request.user)
        reporting_mgr = resolve_reporting_manager(target_user, marked_by_user=request.user, vendor=target_vendor)

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
            check_in_photo=photo if photo else None
        )

        if reporting_mgr:
            notify_user(
                reporting_mgr,
                "Pending Attendance Approval",
                f"Team attendance check-in for {target_user.get_full_name() or target_user.username} submitted by {request.user.get_full_name() or request.user.username} requires your approval."
            )

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

        if allowed_vendor_ids is None:
            team_qs = User.objects.filter(is_active=True).filter(
                Q(vendor__isnull=False) | Q(hero_vendor_assignments__isnull=False)
            ).exclude(
                Q(is_superuser=True) | Q(role__iexact='ADMIN') | Q(roles__name__iexact='ADMIN')
            ).distinct().order_by('id')
        elif not allowed_vendor_ids:
            team_qs = User.objects.none()
        else:
            team_qs = User.objects.filter(
                Q(vendor_id__in=allowed_vendor_ids) |
                Q(hero_vendor_assignments__vendor_id__in=allowed_vendor_ids)
            ).filter(is_active=True).exclude(
                Q(is_superuser=True) | Q(role__iexact='ADMIN') | Q(roles__name__iexact='ADMIN')
            ).distinct().order_by('id')

        results = []
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

        if is_admin:
            qs = AttendanceRecord.objects.filter(approval_status='PENDING').exclude(user=user)
        else:
            mgr_filter = Q(reporting_manager=user) | Q(user__reporting_manager=user) | Q(marked_by=user)
            if subordinate_ids:
                mgr_filter |= Q(user_id__in=subordinate_ids)

            user_roles = [r.upper() for r in user.get_role_list()]
            if allowed_vendor_ids and any(r in user_roles for r in ['MANAGER', 'SUPERVISOR', 'VENDOR', 'ADMIN', 'HERO']):
                mgr_filter |= Q(vendor_id__in=allowed_vendor_ids) | Q(user__vendor_id__in=allowed_vendor_ids)

            qs = AttendanceRecord.objects.filter(
                Q(approval_status='PENDING') & mgr_filter
            ).exclude(user=user)

        req_vendor = request.query_params.get('vendor_id') or request.query_params.get('vendor')
        if req_vendor and str(req_vendor).strip() and str(req_vendor).lower() != 'all':
            qs = qs.filter(
                Q(vendor__external_vendor_id=req_vendor) |
                Q(vendor__name__icontains=req_vendor) |
                Q(vendor_id=req_vendor if str(req_vendor).isdigit() else None)
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
        """
        Returns dynamic team member roster directly from LIVE iLync Vendor API (https://ilync.tech/api/vendor/{vendor_id}),
        merged with today's saved attendance records from Hero DB.
        NO database caching for vendor users/machines.
        """
        auto_checkout_overnight_records()
        user = request.user
        req_date = request.query_params.get('date') or str(timezone.localdate())
        role_filter = request.query_params.get('role')
        search_filter = request.query_params.get('search')
        status_filter = request.query_params.get('status')
        req_v = request.query_params.get('vendor_id') or request.query_params.get('vendor')

        allowed_vendor_ids = get_user_vendor_ids(user)
        from apps.vendors.models import Vendor
        from apps.integrations.ilync_client import IlyncClient

        client = IlyncClient()

        # Determine target vendors
        v_qs = Vendor.objects.filter(is_active=True)
        if allowed_vendor_ids is not None:
            v_qs = v_qs.filter(id__in=allowed_vendor_ids)
        if req_v and str(req_v).strip() and str(req_v).lower() != 'all':
            if allowed_vendor_ids is None:
                check_vendor_access(user, req_v)
            v_qs = v_qs.filter(
                Q(external_vendor_id=req_v) | Q(name__iexact=req_v) | Q(id=req_v if str(req_v).isdigit() else None)
            )

        target_vendors = list(v_qs)

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

        for v_obj in target_vendors:
            ext_v_id = str(v_obj.external_vendor_id or v_obj.id).strip()
            live_res = None
            try:
                live_res = client.get_vendor_by_id(ext_v_id)
            except Exception as e:
                print(f"[AttendanceRoster] Error fetching live iLync vendor data for {v_obj.name}: {e}")

            v_payload = live_res.get('data') if (isinstance(live_res, dict) and live_res.get('success')) else (live_res if isinstance(live_res, dict) else {})

            # 1. LIVE TEAM MEMBERS directly from iLync response (v_payload.get('users'))
            raw_users = v_payload.get('users') or []
            if not isinstance(raw_users, list):
                raw_users = []

            for u_info in raw_users:
                if not isinstance(u_info, dict):
                    continue
                ext_u_id = str(u_info.get('userId') or u_info.get('id') or '').strip()
                if ext_u_id.lower() in ('none', 'null', ''):
                    ext_u_id = None
                mobile = str(u_info.get('mobile') or u_info.get('phone') or u_info.get('phoneNumber') or '').strip()
                email = str(u_info.get('email') or '').strip()
                name = str(u_info.get('name') or u_info.get('contactName') or 'Team Member').strip()
                designation = str(u_info.get('designation') or u_info.get('role') or 'OPERATOR').strip()

                # Role filter check
                u_role = 'VENDOR' if designation.upper() == 'VENDOR' else ('TRACKER' if 'TRACK' in designation.upper() else 'OPERATOR')
                if role_filter and role_filter.upper() != 'ALL':
                    if role_filter.upper() != u_role.upper():
                        continue

                # Search filter check
                if search_filter:
                    sp = search_filter.strip().lower()
                    if sp not in name.lower() and sp not in mobile and sp not in email.lower():
                        continue

                # Find today's AttendanceRecord from Hero DB for this user
                rec_qs = AttendanceRecord.objects.filter(date=req_date).exclude(attendance_type='MACHINE')
                rec = None
                if ext_u_id:
                    rec = rec_qs.filter(
                        Q(user__external_user_id=ext_u_id) |
                        Q(user__username=ext_u_id) |
                        Q(user__employee_id=ext_u_id) |
                        (Q(user__id=int(ext_u_id)) if ext_u_id.isdigit() else Q(pk=-1))
                    ).first()
                if not rec and email and not email.lower().startswith('user@'):
                    rec = rec_qs.filter(user__email__iexact=email).first()
                if not rec and mobile:
                    rec = rec_qs.filter(Q(user__phone_number=mobile) | Q(user__username=mobile)).first()

                # Also lookup matching local User ID if available for action triggers
                matched_user = None
                if ext_u_id:
                    matched_user = User.objects.filter(external_user_id=ext_u_id).first()
                if not matched_user and name:
                    matched_user = User.objects.filter(first_name__iexact=name).first()
                if not matched_user and email and not email.lower().startswith('user@'):
                    matched_user = User.objects.filter(email__iexact=email).first()
                if not matched_user and mobile:
                    matched_user = User.objects.filter(phone_number=mobile, first_name__iexact=name).first()

                st = (rec.status if rec else 'NOT_MARKED').upper()
                counts['total'] += 1

                if st == 'PRESENT' or st == 'CHECKED_IN' or st == 'CHECKED_OUT':
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

                if status_filter and status_filter.upper() != 'ALL':
                    sf = status_filter.upper().replace(' ', '_')
                    if sf != st:
                        continue

                check_in_photo_url = build_secure_media_url(request, rec.check_in_photo) if rec else None
                check_out_photo_url = build_secure_media_url(request, rec.check_out_photo) if rec else None

                effective_user_id = ext_u_id or (matched_user.id if matched_user else f"ILYNC-{name.replace(' ', '_')}_{mobile}")

                check_in_dt = (rec.check_in or rec.created_at) if (rec and rec.status in ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT', 'HALF_DAY']) else None
                check_out_dt = rec.check_out if (rec and rec.check_out) else None

                result_list.append({
                    'user_id': effective_user_id,
                    'employee_id': ext_u_id or (matched_user.employee_id if (matched_user and matched_user.employee_id) else f"EMP-{effective_user_id}"),
                    'user_name': name,
                    'phone_number': mobile,
                    'email': email,
                    'role': u_role,
                    'vendor_name': v_obj.name,
                    'vendor_id': v_obj.id,
                    'is_active': True,
                    'reporting_manager_name': rec.reporting_manager.get_full_name() if (rec and rec.reporting_manager) else '',
                    'attendance_id': rec.id if rec else None,
                    'date': req_date,
                    'status': st,
                    'approval_status': rec.approval_status if rec else 'PENDING',
                    'rejection_reason': rec.rejection_reason if rec else None,
                    'attendance_type': rec.attendance_type if rec else 'TEAM',
                    'machine_chassis_no': rec.machine_chassis_no if rec else None,
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
                op_name = m_info.get('operator_name') or (m_info.get('operator', {}).get('name') if isinstance(m_info.get('operator'), dict) else '')

                m_rec = AttendanceRecord.objects.filter(date=req_date, attendance_type='MACHINE').filter(
                    Q(machine_id=str(mac_id)) | Q(machine_chassis_no=chassis_val)
                ).first()

                m_status = (m_rec.status if m_rec else 'NOT_MARKED').upper()
                assigned_machines_list.append({
                    'machine_id': mac_id,
                    'name': mac_name,
                    'code': mac_code,
                    'machine_no': chassis_val,
                    'chassis_no': chassis_val,
                    'vendor_name': v_obj.name,
                    'vendor_id': v_obj.id,
                    'operator_name': op_name,
                    'status': m_status,
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
                })

        return success_response(
            data={
                'date': req_date,
                'summary': counts,
                'team_members': result_list,
                'assigned_machines': assigned_machines_list
            },
            message=f"Fetched live vendor team and machine attendance for {req_date}"
        )

    @action(detail=False, methods=['post'], url_path='bulk-mark')
    def bulk_mark(self, request):
        records_data = request.data.get('records') or []
        req_date = request.data.get('date') or str(timezone.localdate())

        if not isinstance(records_data, list):
            return error_response(message="`records` must be an array of attendance items.", status_code=status.HTTP_400_BAD_REQUEST)

        saved_records = []
        for item in records_data:
            u_id = item.get('user_id') or item.get('user')
            if not u_id:
                continue

            target_user = resolve_target_user(u_id)
            if not target_user:
                continue

            validate_employee_attendance_access(request.user, target_user)

            st_val = (item.get('status') or 'PRESENT').upper().replace(' ', '_')
            notes_val = item.get('notes') or item.get('remarks') or ''
            check_in_val = item.get('check_in')
            check_out_val = item.get('check_out')
            lat_val = item.get('check_in_latitude') or item.get('latitude')
            lng_val = item.get('check_in_longitude') or item.get('longitude')
            acc_val = item.get('check_in_accuracy') or item.get('accuracy')
            loc_source = item.get('location_source') or 'GPS'

            target_vendor = target_user.vendor or get_user_vendor(target_user) or get_user_vendor(request.user)
            reporting_mgr = resolve_reporting_manager(target_user, marked_by_user=request.user, vendor=target_vendor)

            def safe_float(v):
                if v is not None and str(v).strip() not in ('', 'null', 'undefined', 'None'):
                    try:
                        return float(v)
                    except Exception:
                        return None
                return None

            f_lat = safe_float(lat_val)
            f_lng = safe_float(lng_val)
            f_acc = safe_float(acc_val)

            if st_val in ['PRESENT', 'CHECKED_IN', 'HALF_DAY'] and not check_in_val:
                check_in_val = timezone.now()

            record = AttendanceRecord.objects.filter(user=target_user, date=req_date).exclude(attendance_type='MACHINE').first()
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
                    updated_by=request.user
                )
                created = True

            if not created:
                record.status = st_val
                record.notes = notes_val
                if check_in_val is not None:
                    record.check_in = check_in_val
                elif not record.check_in and st_val in ['PRESENT', 'CHECKED_IN', 'HALF_DAY']:
                    record.check_in = timezone.now()
                if check_out_val is not None:
                    record.check_out = check_out_val
                if f_lat is not None: record.check_in_latitude = f_lat
                if f_lng is not None: record.check_in_longitude = f_lng
                if f_acc is not None: record.check_in_accuracy = f_acc
                record.updated_by = request.user
                if target_vendor and not record.vendor:
                    record.vendor = target_vendor
                record.save()

            saved_records.append(record)

        return success_response(
            data=AttendanceRecordSerializer(saved_records, many=True, context={'request': request}).data,
            message=f"Successfully updated attendance for {len(saved_records)} team members."
        )

    @action(detail=False, methods=['get'], url_path='export-report')
    def export_report(self, request):
        import csv
        from django.http import HttpResponse

        qs = self.get_queryset().exclude(attendance_type='MACHINE')
        req_date = request.query_params.get('date') or str(timezone.localdate())
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="Attendance_Report_{req_date}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Attendance ID', 'Employee ID', 'User Name', 'Phone Number', 'Role',
            'Vendor Name', 'Date', 'Status', 'Approval Status', 'Check In Time',
            'Check Out Time', 'Check In Latitude', 'Check In Longitude', 'Check In Accuracy',
            'Check In Photo Status', 'Total Working Hours', 'Notes'
        ])

        for rec in qs:
            u = rec.user
            writer.writerow([
                rec.id,
                u.employee_id or u.external_user_id or f"EMP-{u.id}",
                u.get_full_name() or u.username,
                u.phone_number or '',
                u.get_role_list()[0] if u.get_role_list() else (u.role or 'OPERATOR'),
                rec.vendor.name if rec.vendor else (u.vendor.name if u.vendor else ''),
                rec.date,
                rec.status,
                rec.approval_status,
                timezone.localtime(rec.check_in).strftime('%Y-%m-%d %H:%M:%S') if rec.check_in else '',
                timezone.localtime(rec.check_out).strftime('%Y-%m-%d %H:%M:%S') if rec.check_out else '',
                str(rec.check_in_latitude) if rec.check_in_latitude else '',
                str(rec.check_in_longitude) if rec.check_in_longitude else '',
                str(rec.check_in_accuracy) if rec.check_in_accuracy else '',
                'Available' if rec.check_in_photo else 'No Photo',
                rec.total_working_hours or '',
                rec.notes or ''
            ])

        return response
