from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
from django.db.models import Q
from datetime import datetime
from .models import AttendanceRecord, ATTENDANCE_STATUS_CHOICES
from .serializers import AttendanceRecordSerializer
from apps.authentication.models import User
from apps.common.permissions import IsVendorAuthorized
from apps.common.responses import success_response, error_response
from apps.common.vendor_scope import get_user_vendor_ids, get_user_vendor, check_vendor_access, filter_queryset_by_vendor

def resolve_target_user(user_id_param):
    if not user_id_param:
        return None
    if isinstance(user_id_param, User):
        return user_id_param
    if str(user_id_param).isdigit():
        u = User.objects.filter(id=int(user_id_param)).first()
        if u:
            return u
    u = User.objects.filter(
        Q(external_user_id=str(user_id_param)) |
        Q(employee_id=str(user_id_param)) |
        Q(username=str(user_id_param))
    ).first()
    return u

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

    if not target_vendor_ids:
        v_obj = get_user_vendor(target_user, resolve_fallback=False)
        if v_obj and v_obj.id:
            target_vendor_ids.append(v_obj.id)

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
            qs = AttendanceRecord.objects.all().select_related('user', 'vendor', 'marked_by', 'updated_by', 'approved_by', 'marked_for_user')
        elif not allowed_vendor_ids:
            return AttendanceRecord.objects.none()
        else:
            qs = AttendanceRecord.objects.filter(
                Q(vendor_id__in=allowed_vendor_ids) |
                Q(user__vendor_id__in=allowed_vendor_ids) |
                Q(user__hero_vendor_assignments__vendor_id__in=allowed_vendor_ids)
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

        rec_date = request.data.get('date') or timezone.now().date()
        status_val = (request.data.get('status') or 'PRESENT').upper()
        notes_val = request.data.get('notes') or request.data.get('remarks') or ''
        check_in_val = request.data.get('check_in')
        check_out_val = request.data.get('check_out')

        target_vendor = target_user.vendor or get_user_vendor(target_user) or get_user_vendor(request.user)

        record, created = AttendanceRecord.objects.get_or_create(
            user=target_user,
            date=rec_date,
            defaults={
                'vendor': target_vendor,
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
        today = timezone.now().date()
        user = request.user
        record = AttendanceRecord.objects.filter(user=user, date=today).order_by('-created_at').first()
        if not record:
            return Response(None, status=status.HTTP_200_OK)
        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    # 4.2 Employee Self Check-In
    @action(detail=False, methods=['post'], url_path='check-in')
    def check_in(self, request):
        user = request.user
        today = timezone.now().date()

        # Double Check-In Protection (409 Conflict)
        existing = AttendanceRecord.objects.filter(user=user, date=today, status='CHECKED_IN').first()
        if existing:
            return Response(
                {"detail": "Attendance already marked for today", "message": "User has already checked in for today."},
                status=status.HTTP_409_CONFLICT
            )

        lat = request.data.get('latitude') or request.data.get('check_in_latitude')
        lng = request.data.get('longitude') or request.data.get('check_in_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_in_accuracy')
        photo = request.FILES.get('photo') or request.data.get('photo') or request.FILES.get('check_in_photo')
        loc_source = request.data.get('location_source') or 'GPS'
        att_type = request.data.get('attendance_type') or 'TEAM'

        target_vendor = user.vendor or get_user_vendor(user)

        record = AttendanceRecord.objects.create(
            user=user,
            vendor=target_vendor,
            date=today,
            check_in=timezone.now(),
            status='CHECKED_IN',
            approval_status='PENDING',
            attendance_type=att_type,
            check_in_latitude=lat if lat else None,
            check_in_longitude=lng if lng else None,
            check_in_accuracy=float(acc) if acc else None,
            check_in_photo=photo if photo else None,
            location_source=loc_source,
            marked_by=user,
            updated_by=user
        )

        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # 4.3 Employee Self Check-Out
    @action(detail=False, methods=['post'], url_path='check-out')
    def check_out(self, request):
        user = request.user
        today = timezone.now().date()
        att_id = request.data.get('attendance_id') or request.data.get('id')

        if att_id:
            record = AttendanceRecord.objects.filter(id=att_id).first()
        else:
            record = AttendanceRecord.objects.filter(user=user, date=today, status='CHECKED_IN').order_by('-created_at').first()

        if not record:
            record = AttendanceRecord.objects.filter(user=user, date=today).order_by('-created_at').first()

        if not record:
            return error_response(message="No active check-in record found for today.", status_code=status.HTTP_400_BAD_REQUEST)

        lat = request.data.get('latitude') or request.data.get('check_out_latitude')
        lng = request.data.get('longitude') or request.data.get('check_out_longitude')
        acc = request.data.get('accuracy') or request.data.get('check_out_accuracy')
        photo = request.FILES.get('photo') or request.data.get('photo') or request.FILES.get('check_out_photo')

        check_out_time = timezone.now()
        record.check_out = check_out_time
        record.status = 'CHECKED_OUT'
        if lat: record.check_out_latitude = lat
        if lng: record.check_out_longitude = lng
        if acc: record.check_out_accuracy = float(acc)
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
        return Response(serializer.data, status=status.HTTP_200_OK)

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
        today = timezone.now().date()
        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        acc = request.data.get('accuracy')
        photo = request.FILES.get('photo') or request.data.get('photo')

        target_vendor = target_user.vendor or get_user_vendor(target_user) or get_user_vendor(request.user)

        record = AttendanceRecord.objects.create(
            user=target_user,
            vendor=target_vendor,
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

        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # 4.5 Machine / Heavy Equipment Attendance Check-In
    @action(detail=False, methods=['post'], url_path='machine-check-in')
    def machine_check_in(self, request):
        chassis_no = request.data.get('machine_chassis_no') or request.data.get('chassis_no')
        assignment_id = request.data.get('assignment_id') or request.data.get('machine_assignment_id')
        machine_id = request.data.get('machine_id')

        today = timezone.now().date()
        user = request.user
        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        acc = request.data.get('accuracy')
        photo = request.FILES.get('photo') or request.data.get('photo')

        target_vendor = user.vendor or get_user_vendor(user)

        record = AttendanceRecord.objects.create(
            user=user,
            vendor=target_vendor,
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
            check_in_latitude=lat if lat else None,
            check_in_longitude=lng if lng else None,
            check_in_accuracy=float(acc) if acc else None,
            check_in_photo=photo if photo else None
        )

        serializer = AttendanceRecordSerializer(record, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

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
            team_qs = User.objects.filter(is_active=True).order_by('id')
        elif not allowed_vendor_ids:
            team_qs = User.objects.none()
        else:
            team_qs = User.objects.filter(
                Q(vendor_id__in=allowed_vendor_ids) |
                Q(hero_vendor_assignments__vendor_id__in=allowed_vendor_ids)
            ).filter(is_active=True).distinct().order_by('id')

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
        size = int(request.query_params.get('size', 20))
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
        page = int(request.query_params.get('page', 0))
        size = int(request.query_params.get('size', 20))

        qs = self.get_queryset().filter(approval_status='PENDING')
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

        # Self-Approval Prohibition Guard (403 Forbidden)
        if record.user == request.user:
            return Response(
                {"detail": "You cannot approve your own attendance record."},
                status=status.HTTP_403_FORBIDDEN
            )

        validate_employee_attendance_access(request.user, record.user)

        record.approval_status = 'APPROVED'
        record.approved_by = request.user
        record.approved_at = timezone.now()
        record.save()

        return Response({
            "success": True,
            "message": f"Attendance record {record.id} approved successfully.",
            "approval_status": "APPROVED"
        }, status=status.HTTP_200_OK)

    # 4.11 Manager Rejects Attendance Record
    @action(detail=True, methods=['post'], url_path='reject')
    def reject_attendance(self, request, pk=None):
        record = self.get_object()

        # Self-Approval Prohibition Guard (403 Forbidden)
        if record.user == request.user:
            return Response(
                {"detail": "You cannot reject your own attendance record."},
                status=status.HTTP_403_FORBIDDEN
            )

        validate_employee_attendance_access(request.user, record.user)

        reason = request.data.get('reason') or "Attendance rejected by manager."
        record.approval_status = 'REJECTED'
        record.rejection_reason = reason
        record.approved_by = request.user
        record.approved_at = timezone.now()
        record.save()

        return Response({
            "success": True,
            "message": f"Attendance record {record.id} rejected.",
            "approval_status": "REJECTED",
            "rejection_reason": reason
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='team-attendance')
    def get_team_attendance(self, request):
        """
        Returns full team member roster for logged-in user's vendor, merged with attendance status for date.
        """
        user = request.user
        req_date = request.query_params.get('date') or str(timezone.now().date())
        role_filter = request.query_params.get('role')
        search_filter = request.query_params.get('search')
        status_filter = request.query_params.get('status')

        allowed_vendor_ids = get_user_vendor_ids(user)
        if allowed_vendor_ids is None:
            team_qs = User.objects.filter(is_active=True).order_by('id')
            req_v = request.query_params.get('vendor_id') or request.query_params.get('vendor')
            if req_v and str(req_v).strip() and req_v != 'all':
                check_vendor_access(user, req_v)
                team_qs = team_qs.filter(
                    Q(vendor__external_vendor_id=req_v) |
                    Q(vendor__name__icontains=req_v) |
                    Q(vendor_id=req_v if str(req_v).isdigit() else None)
                )
        elif not allowed_vendor_ids:
            team_qs = User.objects.none()
        else:
            team_qs = User.objects.filter(
                Q(vendor_id__in=allowed_vendor_ids) |
                Q(hero_vendor_assignments__vendor_id__in=allowed_vendor_ids)
            ).filter(is_active=True).distinct().order_by('id')

        if role_filter and role_filter.upper() != 'ALL':
            team_qs = team_qs.filter(
                Q(role__iexact=role_filter) |
                Q(roles__name__iexact=role_filter)
            )

        if search_filter:
            sp = search_filter.strip()
            team_qs = team_qs.filter(
                Q(first_name__icontains=sp) |
                Q(last_name__icontains=sp) |
                Q(username__icontains=sp) |
                Q(employee_id__icontains=sp)
            )

        team_users = list(team_qs)
        team_user_ids = [u.id for u in team_users]

        records = AttendanceRecord.objects.filter(user_id__in=team_user_ids, date=req_date).select_related('marked_by', 'updated_by', 'approved_by')
        records_map = {r.user_id: r for r in records}

        result_list = []
        counts = {
            'total': len(team_users),
            'present': 0,
            'absent': 0,
            'half_day': 0,
            'leave': 0,
            'week_off': 0,
            'not_marked': 0
        }

        for u in team_users:
            rec = records_map.get(u.id)
            st = (rec.status if rec else 'NOT_MARKED').upper()

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

            user_role = u.get_role_list()[0] if u.get_role_list() else (u.role or 'OPERATOR')
            user_vendor_name = u.vendor.name if u.vendor else ''

            check_in_photo_url = None
            if rec and rec.check_in_photo:
                check_in_photo_url = request.build_absolute_uri(rec.check_in_photo.url)

            check_out_photo_url = None
            if rec and rec.check_out_photo:
                check_out_photo_url = request.build_absolute_uri(rec.check_out_photo.url)

            result_list.append({
                'user_id': u.id,
                'employee_id': u.employee_id or u.external_user_id or f"EMP-{u.id}",
                'user_name': u.get_full_name() or u.username,
                'phone_number': u.phone_number or '',
                'role': user_role,
                'vendor_name': user_vendor_name,
                'reporting_manager_name': u.reporting_manager.get_full_name() if u.reporting_manager else '',
                'attendance_id': rec.id if rec else None,
                'date': req_date,
                'status': st,
                'approval_status': rec.approval_status if rec else 'PENDING',
                'rejection_reason': rec.rejection_reason if rec else None,
                'attendance_type': rec.attendance_type if rec else 'TEAM',
                'machine_chassis_no': rec.machine_chassis_no if rec else None,
                'check_in': rec.check_in.strftime('%H:%M') if (rec and rec.check_in) else None,
                'check_out': rec.check_out.strftime('%H:%M') if (rec and rec.check_out) else None,
                'check_in_time': rec.check_in.isoformat() if (rec and rec.check_in) else None,
                'check_out_time': rec.check_out.isoformat() if (rec and rec.check_out) else None,
                'check_in_latitude': float(rec.check_in_latitude) if (rec and rec.check_in_latitude) else None,
                'check_in_longitude': float(rec.check_in_longitude) if (rec and rec.check_in_longitude) else None,
                'check_in_accuracy': rec.check_in_accuracy if (rec and rec.check_in_accuracy) else None,
                'check_in_photo': check_in_photo_url,
                'check_out_photo': check_out_photo_url,
                'total_working_hours': rec.total_working_hours if rec else None,
                'notes': rec.notes if rec else '',
                'marked_by_name': rec.marked_by.get_full_name() if (rec and rec.marked_by) else ''
            })

        return success_response(
            data={
                'date': req_date,
                'summary': counts,
                'team_members': result_list
            },
            message=f"Fetched vendor team attendance for {req_date}"
        )

    @action(detail=False, methods=['post'], url_path='bulk-mark')
    def bulk_mark(self, request):
        records_data = request.data.get('records') or []
        req_date = request.data.get('date') or str(timezone.now().date())

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
            target_vendor = target_user.vendor or get_user_vendor(target_user) or get_user_vendor(request.user)

            record, created = AttendanceRecord.objects.get_or_create(
                user=target_user,
                date=req_date,
                defaults={
                    'vendor': target_vendor,
                    'status': st_val,
                    'notes': notes_val,
                    'check_in': check_in_val,
                    'check_out': check_out_val,
                    'marked_by': request.user,
                    'updated_by': request.user
                }
            )

            if not created:
                record.status = st_val
                record.notes = notes_val
                if check_in_val is not None:
                    record.check_in = check_in_val
                if check_out_val is not None:
                    record.check_out = check_out_val
                record.updated_by = request.user
                if target_vendor and not record.vendor:
                    record.vendor = target_vendor
                record.save()

            saved_records.append(record)

        return success_response(
            data=AttendanceRecordSerializer(saved_records, many=True, context={'request': request}).data,
            message=f"Successfully updated attendance for {len(saved_records)} team members."
        )
