import csv
import json
from io import StringIO

from django.db import connection
from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView

from apps.common.pagination import StandardPageNumberPagination
from apps.common.responses import success_response
from apps.hero_integration.permissions import (
    IsPMAdmin,
    IsPMReviewer,
    get_primary_pm_role,
    is_pm_admin,
    user_can_access_frequency,
)
from apps.hero_integration.services import (
    get_authorized_machine_or_403,
    get_authorized_machines_queryset,
    get_user_vendor_ids,
    serialize_machine_info,
)
from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    MaintenanceAuditLog,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceFrequencyMaster,
    MaintenancePhotoAttachment,
    MaintenanceSubmission,
    RoleFrequencyMapping,
)
from apps.maintenance.serializers import (
    ChecklistFrequencyMappingSerializer,
    MaintenanceApprovalReviewSerializer,
    MaintenanceAuditLogSerializer,
    MaintenanceCategoryMasterSerializer,
    MaintenanceChecklistMasterSerializer,
    MaintenanceFrequencyMasterSerializer,
    MaintenancePhotoAttachmentSerializer,
    MaintenanceSubmissionDetailSerializer,
    MaintenanceSubmissionListSerializer,
    RoleFrequencyMappingSerializer,
)
from apps.maintenance.services.approval_service import review_submission
from apps.maintenance.services.audit_service import record_audit_log
from apps.maintenance.services.checklist_service import (
    get_checklist_for_frequency,
    get_frequencies_for_user,
    get_safety_guidelines,
)
from apps.maintenance.services.dashboard_service import (
    get_dashboard_data,
    get_machines_by_cycle_status,
    get_maintenance_report,
)
from apps.maintenance.services.photo_service import (
    get_authorized_photo_or_403,
    validate_and_store_photo,
)
from apps.maintenance.services.submission_service import create_maintenance_submission


class HealthCheckView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return success_response(
            data={"status": "healthy", "service": "machine_PM_backend"},
            message="Machine Preventive Maintenance backend is running",
        )


class DashboardView(APIView):
    def get(self, request):
        data = get_dashboard_data(request.user, request.query_params)
        return success_response(data=data, message="Maintenance dashboard retrieved successfully")


class FrequencyListView(APIView):
    def get(self, request):
        data = get_frequencies_for_user(request.user)
        return success_response(data=data, message="Maintenance frequencies retrieved successfully")


class ChecklistRetrieveView(APIView):
    def get(self, request):
        freq_code = request.query_params.get('frequency')
        if not freq_code:
            raise ValidationError({"frequency": "Query parameter 'frequency' is required (e.g., DAILY, 50_HOURS)."})
        data = get_checklist_for_frequency(request.user, freq_code)
        return success_response(data=data, message="Maintenance checklist retrieved successfully")


class SafetyGuidelinesView(APIView):
    def get(self, request):
        items = get_safety_guidelines()
        return success_response(data=items, message="Safety guidelines retrieved successfully")


class MachineListView(APIView):
    def get(self, request):
        qs = get_authorized_machines_queryset(
            request.user,
            vendor_id=request.query_params.get('vendor_id') or request.query_params.get('vendor'),
            search=request.query_params.get('search'),
        )
        data = [serialize_machine_info(m, include_assignment=True) for m in qs]
        return success_response(data=data, message="Authorized HERO machines retrieved successfully")


class MachineValidateView(APIView):
    def get(self, request, machine_id):
        machine = get_authorized_machine_or_403(request.user, machine_id)
        data = serialize_machine_info(machine, include_assignment=True)
        latest_sub = (
            MaintenanceSubmission.objects.select_related('frequency')
            .filter(machine_id=machine.id)
            .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
            .order_by('-submitted_at', '-id')
            .first()
        )
        data["latest_pm_submission"] = (
            {
                "id": latest_sub.id,
                "submission_number": latest_sub.submission_number,
                "frequency": latest_sub.frequency.code,
                "hour_meter_reading": float(latest_sub.hour_meter_reading),
                "submitted_at": latest_sub.submitted_at.isoformat(),
                "status": latest_sub.status,
            }
            if latest_sub
            else None
        )
        return success_response(data=data, message="Machine validated successfully")


class MachineHourMeterView(APIView):
    def get(self, request, machine_id):
        machine = get_authorized_machine_or_403(request.user, machine_id)
        latest_sub = (
            MaintenanceSubmission.objects.select_related('frequency')
            .filter(machine_id=machine.id)
            .exclude(approval_status=MaintenanceSubmission.APPROVAL_REJECTED)
            .order_by('-submitted_at', '-id')
            .first()
        )
        return success_response(
            data={
                "machine_id": machine.id,
                "machine_number": machine.machine_chassis_no or machine.code or machine.serial_number,
                "hero_engine_hours": machine.engine_hours or 0,
                "last_pm_hour_meter": float(latest_sub.hour_meter_reading) if latest_sub else None,
                "last_pm_frequency": latest_sub.frequency.code if latest_sub else None,
                "last_pm_submitted_at": latest_sub.submitted_at.isoformat() if latest_sub else None,
            },
            message="Machine hour-meter reading retrieved successfully",
        )


class PhotoUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get('file') or request.FILES.get('photo')
        machine_id = request.data.get('machine_id') or request.data.get('machine')
        checklist_item_id = request.data.get('checklist_item_id') or request.data.get('item_id')
        freq_code = str(request.data.get('frequency') or '').strip().upper()

        if not machine_id:
            raise ValidationError({"machine_id": "machine_id is required."})
        if not checklist_item_id:
            raise ValidationError({"checklist_item_id": "checklist_item_id is required."})
        if not freq_code:
            raise ValidationError({"frequency": "frequency is required."})

        freq = MaintenanceFrequencyMaster.objects.filter(code=freq_code, is_active=True).first()
        if not freq:
            raise NotFound(f"Maintenance frequency '{freq_code}' not found.")

        if not user_can_access_frequency(request.user, freq.code, for_submit=True):
            raise PermissionDenied(
                f"Your role ({get_primary_pm_role(request.user)}) cannot upload evidence for {freq.name}."
            )

        machine = get_authorized_machine_or_403(request.user, machine_id)

        try:
            ci_id = int(checklist_item_id)
        except (TypeError, ValueError):
            raise ValidationError({"checklist_item_id": "Invalid checklist_item_id."})

        checklist_item = MaintenanceChecklistMaster.objects.filter(id=ci_id, is_active=True).first()
        if not checklist_item:
            raise NotFound(f"Checklist item '{checklist_item_id}' not found.")

        is_mapped = ChecklistFrequencyMapping.objects.filter(
            checklist_item=checklist_item,
            frequency=freq,
            is_active=True,
        ).exists()
        if not is_mapped:
            raise ValidationError(
                {"checklist_item_id": f"Checklist item '{checklist_item.description}' is not mapped to {freq.name}."}
            )

        lat = request.data.get('latitude')
        lon = request.data.get('longitude')
        try:
            lat_val = float(lat) if lat not in (None, '') else None
            lon_val = float(lon) if lon not in (None, '') else None
        except (TypeError, ValueError):
            lat_val, lon_val = None, None

        photo = validate_and_store_photo(
            file_obj=file_obj,
            machine=machine,
            checklist_item=checklist_item,
            frequency_code=freq.code,
            user=request.user,
            captured_at=request.data.get('captured_at'),
            latitude=lat_val,
            longitude=lon_val,
            request=request,
        )
        return success_response(
            data=MaintenancePhotoAttachmentSerializer(photo).data,
            message="Checklist activity photo uploaded and verified",
            status_code=status.HTTP_201_CREATED,
        )


class PhotoEvidenceListView(APIView):
    def get(self, request):
        allowed_machines = list(get_authorized_machines_queryset(request.user).values_list('id', flat=True))
        qs = (
            MaintenancePhotoAttachment.objects.select_related('checklist_item', 'submission')
            .filter(machine_id__in=allowed_machines, is_bound=True)
            .order_by('-captured_at', '-id')
        )
        machine_id = request.query_params.get('machine_id')
        if machine_id and str(machine_id).isdigit():
            qs = qs.filter(machine_id=int(machine_id))
        freq = request.query_params.get('frequency')
        if freq and freq.upper() != 'ALL':
            qs = qs.filter(frequency_code=freq.upper())
        submission_id = request.query_params.get('submission_id')
        if submission_id and str(submission_id).isdigit():
            qs = qs.filter(submission_id=int(submission_id))
        user_id = request.query_params.get('user_id')
        if user_id and str(user_id).isdigit():
            qs = qs.filter(uploaded_by_id=int(user_id))

        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = MaintenancePhotoAttachmentSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PhotoProtectedView(APIView):
    def get(self, request, photo_id):
        photo = get_authorized_photo_or_403(request.user, photo_id)
        if not photo.file or not photo.file.storage.exists(photo.file.name):
            raise NotFound("Stored photo file could not be located.")

        file_handle = photo.file.open('rb')
        response = FileResponse(file_handle, content_type=photo.content_type or 'image/jpeg')
        response['Content-Disposition'] = f'inline; filename="{photo.original_filename}"'
        response['Cache-Control'] = 'private, max-age=3600'
        return response


def _filter_submissions_queryset(request):
    allowed_machine_ids = list(
        get_authorized_machines_queryset(
            request.user,
            vendor_id=request.query_params.get('vendor_id') or request.query_params.get('vendor'),
        ).values_list('id', flat=True)
    )

    qs = (
        MaintenanceSubmission.objects.select_related('frequency')
        .prefetch_related('responses__photo_attachment', 'photos', 'reviews')
        .filter(machine_id__in=allowed_machine_ids)
        .order_by('-submitted_at', '-id')
    )

    q = request.query_params
    if q.get('machine_id') and str(q.get('machine_id')).isdigit():
        qs = qs.filter(machine_id=int(q.get('machine_id')))
    if q.get('user_id') and str(q.get('user_id')).isdigit():
        qs = qs.filter(submitted_by_id=int(q.get('user_id')))
    if q.get('frequency') and str(q.get('frequency')).upper() not in ('ALL', ''):
        qs = qs.filter(frequency__code=str(q.get('frequency')).strip().upper())
    if q.get('status') and str(q.get('status')).upper() not in ('ALL', ''):
        qs = qs.filter(status=str(q.get('status')).strip().upper())
    if q.get('approval_status') and str(q.get('approval_status')).upper() not in ('ALL', ''):
        qs = qs.filter(approval_status=str(q.get('approval_status')).strip().upper())
    date_from = parse_date(str(q.get('date_from') or ''))
    if date_from:
        qs = qs.filter(submission_date__gte=date_from)
    date_to = parse_date(str(q.get('date_to') or ''))
    if date_to:
        qs = qs.filter(submission_date__lte=date_to)
    if q.get('search') and str(q.get('search')).strip():
        s = str(q.get('search')).strip()
        qs = qs.filter(
            Q(submission_number__icontains=s)
            | Q(machine_number__icontains=s)
            | Q(machine_name__icontains=s)
            | Q(submitted_by_name__icontains=s)
            | Q(vendor_name__icontains=s)
        )
    return qs


class SubmissionListCreateView(APIView):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        qs = _filter_submissions_queryset(request)
        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = MaintenanceSubmissionListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        payload = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        # Parse JSON-encoded responses when submitted via multipart/form-data
        if isinstance(payload.get('responses'), str):
            try:
                payload['responses'] = json.loads(payload['responses'])
            except json.JSONDecodeError:
                raise ValidationError({"responses": "Invalid JSON format in responses field."})

        submission = create_maintenance_submission(
            user=request.user,
            payload=payload,
            files_map=request.FILES,
            request=request,
        )
        detail = MaintenanceSubmissionDetailSerializer(submission).data
        return success_response(
            data=detail,
            message=f"Maintenance submission {submission.submission_number} recorded successfully",
            status_code=status.HTTP_201_CREATED,
        )


class SubmissionDetailView(APIView):
    def get(self, request, submission_id):
        submission = (
            MaintenanceSubmission.objects.select_related('frequency')
            .prefetch_related('responses__photo_attachment', 'responses__checklist_item__category', 'reviews', 'photos')
            .filter(id=submission_id)
            .first()
        )
        if not submission:
            raise NotFound("Maintenance submission not found.")

        get_authorized_machine_or_403(request.user, submission.machine_id)
        return success_response(
            data=MaintenanceSubmissionDetailSerializer(submission).data,
            message="Maintenance submission detail retrieved successfully",
        )


class SubmissionReviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPMReviewer]

    def post(self, request, submission_id):
        submission = MaintenanceSubmission.objects.select_related('frequency').filter(id=submission_id).first()
        if not submission:
            raise NotFound("Maintenance submission not found.")

        review = review_submission(
            user=request.user,
            submission=submission,
            action=request.data.get('action'),
            remarks=request.data.get('remarks', ''),
            request=request,
        )
        return success_response(
            data={
                "review": MaintenanceApprovalReviewSerializer(review).data,
                "submission": MaintenanceSubmissionDetailSerializer(submission).data,
            },
            message=f"Submission {submission.submission_number} marked as {review.new_status}",
        )


class MachineHistoryView(APIView):
    def get(self, request, machine_id):
        machine = get_authorized_machine_or_403(request.user, machine_id)
        qs = (
            MaintenanceSubmission.objects.select_related('frequency')
            .prefetch_related('photos')
            .filter(machine_id=machine.id)
            .order_by('-submitted_at', '-id')
        )
        freq = request.query_params.get('frequency')
        if freq and freq.upper() not in ('ALL', ''):
            qs = qs.filter(frequency__code=freq.strip().upper())

        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(MaintenanceSubmissionListSerializer(page, many=True).data)


class UserHistoryView(APIView):
    def get(self, request, user_id=None):
        target_user_id = user_id or request.user.id
        try:
            target_uid_int = int(target_user_id)
        except (TypeError, ValueError):
            raise ValidationError({"user_id": "Invalid user_id."})

        if target_uid_int != request.user.id and not is_pm_admin(request.user):
            # Non-admins can view their own history or same-vendor operators
            allowed_vendors = get_user_vendor_ids(request.user)
            if allowed_vendors == []:
                raise PermissionDenied("Not authorized to view other users' history.")

        allowed_machine_ids = list(get_authorized_machines_queryset(request.user).values_list('id', flat=True))
        qs = (
            MaintenanceSubmission.objects.select_related('frequency')
            .prefetch_related('photos')
            .filter(submitted_by_id=target_uid_int, machine_id__in=allowed_machine_ids)
            .order_by('-submitted_at', '-id')
        )
        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(MaintenanceSubmissionListSerializer(page, many=True).data)


class PendingMaintenanceView(APIView):
    def get(self, request):
        due_items = get_machines_by_cycle_status(request.user, 'DUE', request.query_params)
        pending_items = get_machines_by_cycle_status(request.user, 'PENDING', request.query_params)
        combined = due_items + [p for p in pending_items if p["machine_id"] not in {d["machine_id"] for d in due_items}]
        return success_response(data=combined, message="Pending maintenance retrieved successfully")


class OverdueMaintenanceView(APIView):
    def get(self, request):
        items = get_machines_by_cycle_status(request.user, 'OVERDUE', request.query_params)
        return success_response(data=items, message="Overdue maintenance retrieved successfully")


class MaintenanceReportView(APIView):
    def get(self, request):
        export_fmt = str(request.query_params.get('export') or '').lower()
        if export_fmt == 'csv':
            qs = _filter_submissions_queryset(request)
            buf = StringIO()
            writer = csv.writer(buf)
            writer.writerow([
                'Submission Number', 'Machine Number', 'Machine Name', 'Model',
                'Vendor', 'Frequency', 'Hour Meter', 'Performed By', 'Role',
                'Status', 'Approval Status', 'Completed Items', 'Total Items', 'Submitted At',
            ])
            for s in qs:
                writer.writerow([
                    s.submission_number, s.machine_number, s.machine_name, s.machine_model,
                    s.vendor_name, s.frequency.name, s.hour_meter_reading, s.submitted_by_name,
                    s.submitted_by_role, s.status, s.approval_status, s.completed_items_count,
                    s.total_items, s.submitted_at.isoformat(),
                ])
            resp = HttpResponse(buf.getvalue(), content_type='text/csv')
            resp['Content-Disposition'] = 'attachment; filename="pm_maintenance_report.csv"'
            return resp

        report = get_maintenance_report(request.user, request.query_params)
        return success_response(data=report, message="Maintenance report generated successfully")


class AuditLogListView(APIView):
    def get(self, request):
        qs = MaintenanceAuditLog.objects.all().order_by('-created_at', '-id')
        if not is_pm_admin(request.user):
            allowed_machine_ids = list(get_authorized_machines_queryset(request.user).values_list('id', flat=True))
            qs = qs.filter(Q(actor_id=request.user.id) | Q(machine_id__in=allowed_machine_ids))

        entity_type = request.query_params.get('entity_type')
        if entity_type:
            qs = qs.filter(entity_type=entity_type.upper())
        machine_id = request.query_params.get('machine_id')
        if machine_id and str(machine_id).isdigit():
            qs = qs.filter(machine_id=int(machine_id))

        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(MaintenanceAuditLogSerializer(page, many=True).data)


# --- Admin Configuration ViewSets ---

class _BaseAdminConfigViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsPMAdmin]
    audit_entity_type = 'CONFIG'

    def perform_create(self, serializer):
        obj = serializer.save()
        record_audit_log(
            entity_type=self.audit_entity_type,
            entity_id=obj.id,
            action='CONFIG_CREATED',
            actor=self.request.user,
            details={"data": serializer.data},
            request=self.request,
        )

    def perform_update(self, serializer):
        obj = serializer.save()
        record_audit_log(
            entity_type=self.audit_entity_type,
            entity_id=obj.id,
            action='CONFIG_UPDATED',
            actor=self.request.user,
            details={"data": serializer.data},
            request=self.request,
        )

    def perform_destroy(self, instance):
        obj_id = instance.id
        record_audit_log(
            entity_type=self.audit_entity_type,
            entity_id=obj_id,
            action='CONFIG_DELETED',
            actor=self.request.user,
            details={"repr": str(instance)},
            request=self.request,
        )
        instance.delete()


class AdminCategoryViewSet(_BaseAdminConfigViewSet):
    queryset = MaintenanceCategoryMaster.objects.all().order_by('sort_order', 'id')
    serializer_class = MaintenanceCategoryMasterSerializer
    audit_entity_type = 'CATEGORY_MASTER'


class AdminFrequencyViewSet(_BaseAdminConfigViewSet):
    queryset = MaintenanceFrequencyMaster.objects.all().order_by('sort_order', 'id')
    serializer_class = MaintenanceFrequencyMasterSerializer
    audit_entity_type = 'FREQUENCY_MASTER'


class AdminChecklistItemViewSet(_BaseAdminConfigViewSet):
    queryset = MaintenanceChecklistMaster.objects.select_related('category').all().order_by('category__sort_order', 'sort_order', 'id')
    serializer_class = MaintenanceChecklistMasterSerializer
    audit_entity_type = 'CHECKLIST_MASTER'
    filterset_fields = ['category', 'is_active', 'is_as_required']
    search_fields = ['item_code', 'description', 'remarks', 'service_interval']

    def perform_create(self, serializer):
        obj = serializer.save(created_by_id=self.request.user.id)
        record_audit_log(
            entity_type=self.audit_entity_type,
            entity_id=obj.id,
            action='CONFIG_CREATED',
            actor=self.request.user,
            details={"item_code": obj.item_code, "description": obj.description},
            request=self.request,
        )


class AdminChecklistFrequencyMappingViewSet(_BaseAdminConfigViewSet):
    queryset = ChecklistFrequencyMapping.objects.select_related('checklist_item', 'frequency').all().order_by('frequency__sort_order', 'sort_order', 'id')
    serializer_class = ChecklistFrequencyMappingSerializer
    audit_entity_type = 'FREQUENCY_MAPPING'
    filterset_fields = ['frequency', 'checklist_item', 'is_active']


class AdminRoleFrequencyMappingViewSet(_BaseAdminConfigViewSet):
    queryset = RoleFrequencyMapping.objects.select_related('frequency').all().order_by('role_code', 'frequency__sort_order')
    serializer_class = RoleFrequencyMappingSerializer
    audit_entity_type = 'ROLE_MAPPING'
    filterset_fields = ['role_code', 'frequency', 'is_active']

