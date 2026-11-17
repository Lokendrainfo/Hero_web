import os
import csv
import uuid
from datetime import datetime
from django.http import HttpResponse
from django.utils import timezone
from django.conf import settings
from django.core.files.storage import default_storage
from django.db.models import Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Task, Hindrance, Otn, Ccn
from .serializers import (
    TaskSerializer, HindranceSerializer, OtnSerializer, CcnSerializer,
    HINDRANCE_TYPES, SUB_HINDRANCE_TYPES, OTN_TYPES, SUB_OTN_TYPES,
    CCN_SUBTYPE_1, CCN_SUBTYPE_2,
    normalize_survey_photo
)
from .hindrance_service import sync_ilync_hindrances
from .otn_service import sync_ilync_otn
from .ccn_service import sync_ilync_ccn
from apps.common.permissions import IsVendorAuthorized
from apps.common.responses import success_response
from apps.common.vendor_scope import filter_queryset_by_vendor


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        qs = filter_queryset_by_vendor(Task.objects.all(), user, 'vendor_id', request=self.request)
        
        # Advance User Geography Filter
        if user and user.is_authenticated and getattr(user, 'user_type', None) == 'ADVANCE':
            if hasattr(Task, 'circle_name'):
                if user.advance_scope_type == 'CIRCLE' and user.selected_circle:
                    qs = qs.filter(circle_name__iexact=user.selected_circle.name)
                elif user.advance_scope_type == 'DISTRICT' and user.selected_district:
                    qs = qs.filter(district_name__iexact=user.selected_district.name)
                elif user.advance_scope_type == 'BLOCK' and user.selected_block:
                    qs = qs.filter(block_name__iexact=user.selected_block.name)
            else:
                if user.advance_scope_type == 'CIRCLE' and user.selected_circle:
                    qs = qs.filter(Q(title__icontains=user.selected_circle.name) | Q(description__icontains=user.selected_circle.name))
                elif user.advance_scope_type == 'DISTRICT' and user.selected_district:
                    qs = qs.filter(Q(title__icontains=user.selected_district.name) | Q(description__icontains=user.selected_district.name))
                elif user.advance_scope_type == 'BLOCK' and user.selected_block:
                    qs = qs.filter(Q(title__icontains=user.selected_block.name) | Q(description__icontains=user.selected_block.name))
        else:
            from apps.common.vendor_scope import get_user_vendor_ids
            allowed_v_ids = get_user_vendor_ids(user) if user and user.is_authenticated else None
            # Reporting Manager Scope Filter for Normal users not assigned to specific vendor scoping
            if user and user.is_authenticated and not user.is_superuser and 'ADMIN' not in user.get_role_list() and allowed_v_ids is None:
                from apps.common.reporting_scope import get_reporting_scope
                reporting_scope_ids = get_reporting_scope(user)
                if reporting_scope_ids:
                    qs = qs.filter(assigned_to_id__in=reporting_scope_ids)

        q_params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        machine_id = q_params.get('machine_id') or q_params.get('machine')
        if machine_id and str(machine_id).strip() and str(machine_id).lower() != 'all':
            if str(machine_id).isdigit():
                qs = qs.filter(machine_id=int(machine_id))
            else:
                qs = qs.filter(
                    Q(machine__machine_no__icontains=machine_id) |
                    Q(machine__external_machine_id=machine_id)
                )

        task_type = q_params.get('task_type') or q_params.get('taskType')
        if task_type and str(task_type).strip() and str(task_type).upper() != 'ALL':
            qs = qs.filter(task_type__iexact=task_type)

        status_param = q_params.get('status')
        if status_param and str(status_param).strip() and str(status_param).upper() != 'ALL':
            qs = qs.filter(status__iexact=status_param)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        from rest_framework.exceptions import PermissionDenied
        from apps.common.vendor_scope import get_user_vendor_ids, validate_machine_vendor_access

        vendor_id = serializer.validated_data.get('vendor_id') or serializer.validated_data.get('vendor')
        machine = serializer.validated_data.get('machine')
        machine_identifier = serializer.validated_data.get('machine_id') or (machine.id if machine else None) or (machine.machine_chassis_no if machine else None)

        if not user.is_superuser and 'ADMIN' not in user.get_role_list():
            allowed_ids = get_user_vendor_ids(user)
            if not allowed_ids:
                raise PermissionDenied("You do not have permission to assign tasks.")
            if vendor_id and vendor_id.id not in allowed_ids:
                raise PermissionDenied("You cannot assign tasks to another vendor.")

        if machine_identifier:
            validate_machine_vendor_access(user, machine_identifier)

        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        from rest_framework.exceptions import PermissionDenied
        from apps.common.vendor_scope import get_user_vendor_ids, validate_machine_vendor_access

        vendor_id = serializer.validated_data.get('vendor_id') or serializer.validated_data.get('vendor')
        machine = serializer.validated_data.get('machine')
        machine_identifier = serializer.validated_data.get('machine_id') or (machine.id if machine else None) or (machine.machine_chassis_no if machine else None)

        if not user.is_superuser and 'ADMIN' not in user.get_role_list():
            allowed_ids = get_user_vendor_ids(user)
            if not allowed_ids:
                raise PermissionDenied("You do not have permission to modify tasks.")
            if vendor_id and vendor_id.id not in allowed_ids:
                raise PermissionDenied("You cannot assign tasks to another vendor.")

        if machine_identifier:
            validate_machine_vendor_access(user, machine_identifier)

        serializer.save()

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        task.status = 'COMPLETED'
        task.progress_percent = 100
        task.save()
        return success_response(data=TaskSerializer(task).data, message="Task completed")


class HindranceViewSet(viewsets.ModelViewSet):
    """
    HERO Web Hindrance Management API.
    Faithfully adheres to Java model:
    com.netinfra.platform.task.dao.entities.survey.HindranceTaskData

    Features:
    - Complete workflow: Draft -> Submit -> Review -> Approve / Reject -> Resolve
    - Preserves dual-state: proposedHindrance (submitter) and approvedHindrance (reviewer)
    - Classification hierarchy with dynamic dependencies
    - SurveyPhoto structure for all media & SHP components
    - Safe read-only NetInfra synchronization
    - Register CSV export
    """
    queryset = Hindrance.objects.all().order_by('-created_at')
    serializer_class = HindranceSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Hindrance.objects.all().order_by('-created_at')
        params = self.request.query_params

        # 1. Search filter
        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(hindrance_id__icontains=search) |
                Q(title__icontains=search) |
                Q(district__icontains=search) |
                Q(block__icontains=search) |
                Q(location__icontains=search) |
                Q(section__icontains=search) |
                Q(contractor__icontains=search) |
                Q(department__icontains=search) |
                Q(chainage__icontains=search) |
                Q(ie_name__icontains=search)
            )

        # 2. Classification filters
        h_type = params.get('hindrance_type') or params.get('category')
        if h_type and str(h_type).upper() != 'ALL':
            qs = qs.filter(Q(hindrance_type__iexact=h_type) | Q(category__iexact=h_type))

        sub_type = params.get('sub_hindrance_type') or params.get('sub_category')
        if sub_type and str(sub_type).upper() != 'ALL':
            qs = qs.filter(Q(sub_hindrance_type__iexact=sub_type) | Q(sub_category__iexact=sub_type))

        # 3. Severity filter
        severity = params.get('severity')
        if severity and str(severity).upper() != 'ALL':
            qs = qs.filter(severity__iexact=severity)

        # 4. Status filter
        status_param = params.get('status')
        if status_param and str(status_param).upper() != 'ALL':
            if status_param.upper() == 'SUBMITTED':
                qs = qs.filter(status__in=['SUBMITTED', 'PENDING_APPROVAL'])
            elif status_param.upper() == 'PENDING_APPROVAL':
                qs = qs.filter(status__in=['PENDING_APPROVAL', 'SUBMITTED'])
            elif status_param.upper() == 'IN_PROGRESS':
                qs = qs.filter(status__in=['IN_PROGRESS', 'IN_REVIEW', 'OPEN'])
            else:
                qs = qs.filter(status__iexact=status_param)

        # 5. Source System filter (HERO vs NetInfra / iLync)
        source = params.get('source') or params.get('source_system')
        if source and str(source).upper() != 'ALL':
            if source.upper() in ['NETINFRA', 'ILYNC']:
                qs = qs.filter(source_system__in=['NetInfra', 'ILYNC'])
            elif source.upper() == 'HERO':
                qs = qs.filter(source_system='HERO')
            else:
                qs = qs.filter(source_system__iexact=source)

        # 6. Geography filters
        district = params.get('district')
        if district and str(district).upper() != 'ALL':
            qs = qs.filter(district__iexact=district)

        block = params.get('block')
        if block and str(block).upper() != 'ALL':
            qs = qs.filter(block__iexact=block)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        # High-level aggregate metrics across all records
        all_qs = Hindrance.objects.all()
        total_count = all_qs.count()
        drafts_count = all_qs.filter(status='DRAFT').count()
        submitted_count = all_qs.filter(status__in=['SUBMITTED', 'PENDING_APPROVAL']).count()
        approved_count = all_qs.filter(status='APPROVED').count()
        rejected_count = all_qs.filter(status='REJECTED').count()
        critical_count = all_qs.filter(Q(severity__iexact='CRITICAL') | Q(status__iexact='ESCALATED')).count()
        in_res_count = all_qs.filter(status__in=['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'In Progress', 'In Review', 'Open']).count()
        resolved_count = all_qs.filter(status__in=['RESOLVED', 'Resolved', 'CLEARED']).count()
        hero_count = all_qs.filter(source_system='HERO').count()
        netinfra_count = all_qs.filter(source_system__in=['NetInfra', 'ILYNC']).count()

        return Response({
            "success": True,
            "count": len(serializer.data),
            "results": serializer.data,
            "metrics": {
                "total": total_count,
                "drafts": drafts_count,
                "submitted": submitted_count,
                "pending_approval": submitted_count,
                "approved": approved_count,
                "rejected": rejected_count,
                "critical": critical_count,
                "in_resolution": in_res_count,
                "resolved": resolved_count,
                "source_hero": hero_count,
                "source_netinfra": netinfra_count,
            }
        })

    def perform_create(self, serializer):
        user = self.request.user if self.request.user and self.request.user.is_authenticated else None
        
        # Check action: save as draft or submit for approval
        action_flag = (self.request.data.get('action') or '').lower()
        status_val = self.request.data.get('status')
        
        if action_flag == 'draft' or (status_val and str(status_val).upper() == 'DRAFT'):
            assigned_status = 'DRAFT'
        else:
            assigned_status = 'PENDING_APPROVAL'

        hindrance_id = self.request.data.get('hindrance_id') or self.request.data.get('hindranceId')
        if not hindrance_id:
            count = Hindrance.objects.count() + 105
            hindrance_id = f"HND-2026-{count:03d}"
            while Hindrance.objects.filter(hindrance_id=hindrance_id).exists():
                count += 1
                hindrance_id = f"HND-2026-{count:03d}"

        serializer.save(
            hindrance_id=hindrance_id,
            status=assigned_status,
            created_by=user,
            source_system='HERO',
            sync_status='LOCAL',
            logged_date=self.request.data.get('logged_date') or timezone.now().date()
        )

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_for_approval(self, request, pk=None):
        """
        Submits an existing DRAFT Hindrance for review/approval.
        Validates IE photo if required and updates proposedHindrance.
        """
        hindrance = self.get_object()
        if hindrance.status not in ['DRAFT', 'REJECTED']:
            return Response(
                {"success": False, "message": f"Hindrance cannot be submitted from status {hindrance.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if hindrance.ie_photo_needed and not hindrance.ie_photo:
            return Response(
                {"success": False, "message": "Independent Engineer photo is required when IE Photo Needed is Yes."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user_str = request.user.username if request.user and request.user.is_authenticated else 'System'
        hindrance.status = 'PENDING_APPROVAL'
        hindrance.proposed_hindrance = hindrance.build_proposed_details()
        hindrance.field_data = hindrance.to_hindrance_task_data_json()

        history = hindrance.approval_history or []
        history.append({
            "action": "SUBMITTED_FOR_APPROVAL",
            "status": "PENDING_APPROVAL",
            "user": user_str,
            "timestamp": timezone.now().isoformat(),
            "remarks": request.data.get('remarks') or hindrance.remarks or "Submitted for reviewer approval."
        })
        hindrance.approval_history = history
        hindrance.save()

        return Response({
            "success": True,
            "message": "Hindrance submitted for approval successfully.",
            "data": HindranceSerializer(hindrance).data
        })

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """
        Approves Hindrance through HERO authorized workflow.
        Dual-state guarantee:
        - proposedHindrance is PRESERVED untouched.
        - approvedHindrance is populated with reviewer's approved version.
        - Approval history is logged with reviewer, timestamp, and remarks.
        """
        hindrance = self.get_object()
        reviewer = request.user if request.user and request.user.is_authenticated else None
        reviewer_name = reviewer.username if reviewer else 'Reviewer'
        remarks = request.data.get('remarks') or "Approved by reviewer."

        # Reviewer approved version
        approved_details = request.data.get('approvedHindrance')
        if not approved_details or not isinstance(approved_details, dict):
            approved_details = hindrance.build_proposed_details()
            approved_details['status'] = 'APPROVED'
            approved_details['remarks'] = remarks

        # Ensure proposedHindrance is preserved
        if not hindrance.proposed_hindrance:
            hindrance.proposed_hindrance = hindrance.build_proposed_details()

        hindrance.approved_hindrance = approved_details
        hindrance.status = 'APPROVED'
        hindrance.remarks = remarks

        history = hindrance.approval_history or []
        history.append({
            "action": "APPROVED",
            "status": "APPROVED",
            "user": reviewer_name,
            "timestamp": timezone.now().isoformat(),
            "remarks": remarks
        })
        hindrance.approval_history = history
        hindrance.field_data = hindrance.to_hindrance_task_data_json()
        hindrance.save()

        return Response({
            "success": True,
            "message": "Hindrance approved successfully.",
            "data": HindranceSerializer(hindrance).data
        })

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """
        Rejects Hindrance submission.
        Dual-state guarantee:
        - proposedHindrance is preserved untouched.
        - Status is set to REJECTED.
        - Rejection remarks and reviewer logged in approval history.
        """
        hindrance = self.get_object()
        reviewer = request.user if request.user and request.user.is_authenticated else None
        reviewer_name = reviewer.username if reviewer else 'Reviewer'
        remarks = request.data.get('remarks') or request.data.get('reason')

        if not remarks or not str(remarks).strip():
            return Response(
                {"success": False, "message": "Rejection remarks/reason are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not hindrance.proposed_hindrance:
            hindrance.proposed_hindrance = hindrance.build_proposed_details()

        hindrance.status = 'REJECTED'
        hindrance.remarks = remarks

        history = hindrance.approval_history or []
        history.append({
            "action": "REJECTED",
            "status": "REJECTED",
            "user": reviewer_name,
            "timestamp": timezone.now().isoformat(),
            "remarks": remarks
        })
        hindrance.approval_history = history
        hindrance.field_data = hindrance.to_hindrance_task_data_json()
        hindrance.save()

        return Response({
            "success": True,
            "message": "Hindrance rejected.",
            "data": HindranceSerializer(hindrance).data
        })

    @action(detail=False, methods=['post'], url_path='upload-media')
    def upload_media(self, request):
        """
        Media upload service returning standard SurveyPhoto JSON structure:
        {
          "key": "hindrances/20261117/...",
          "url": "/media/hindrances/20261117/...",
          "fileName": "site.jpg",
          "fileSize": 1048576,
          "mimeType": "image/jpeg",
          "captureTime": "2026-11-17T15:00:00Z",
          "latitude": 28.1234,
          "longitude": 75.1234
        }
        """
        file_obj = request.FILES.get('file') or request.FILES.get('media')
        if not file_obj:
            return Response(
                {"success": False, "message": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST
            )

        today_str = datetime.now().strftime("%Y%m%d")
        ext = os.path.splitext(file_obj.name)[1].lower()
        unique_name = f"{uuid.uuid4().hex[:12]}_{file_obj.name}"
        relative_path = os.path.join('hindrances', today_str, unique_name).replace('\\', '/')

        saved_path = default_storage.save(relative_path, file_obj)
        media_url = f"{settings.MEDIA_URL}{saved_path}".replace('//', '/')

        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        capture_time = request.data.get('capture_time') or request.data.get('captureTime') or timezone.now().isoformat()

        survey_photo = {
            "key": saved_path,
            "url": media_url,
            "fileName": file_obj.name,
            "fileSize": file_obj.size,
            "mimeType": getattr(file_obj, 'content_type', 'application/octet-stream'),
            "captureTime": capture_time,
            "latitude": float(lat) if lat is not None and lat != '' else None,
            "longitude": float(lng) if lng is not None and lng != '' else None,
        }

        return Response({
            "success": True,
            "message": "File uploaded successfully.",
            "data": survey_photo,
            "photo": survey_photo
        })

    @action(detail=False, methods=['get'], url_path='masters')
    def masters(self, request):
        """
        Returns controlled classification masters matching Java enums.
        """
        return Response({
            "success": True,
            "hindranceTypes": HINDRANCE_TYPES,
            "subHindranceTypes": SUB_HINDRANCE_TYPES
        })

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_external(self, request):
        """
        Triggers safe, authorized read-only synchronization of HINDRANCE tasks from NetInfra.
        """
        stats = sync_ilync_hindrances(user=request.user)
        return Response({
            "success": stats.get("success", False),
            "message": stats.get("message", "Sync completed"),
            "data": stats
        })

    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        """
        Exports all hindrances as a CSV register including Java model fields.
        """
        queryset = self.get_queryset()
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="hindrance_register_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Hindrance ID', 'Title', 'Hindrance Type', 'Sub-Hindrance Type', 'Severity', 'Status',
            'Point Lat', 'Point Lng', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng',
            'District', 'Block', 'Location/Section', 'Chainage',
            'IE Name', 'IE Phone', 'IE Photo Needed',
            'Contractor', 'Department', 'Logged Date', 'Target Date',
            'Source System', 'External Task ID', 'Description', 'Mitigation / Remarks'
        ])

        for h in queryset:
            writer.writerow([
                h.hindrance_id,
                h.title,
                h.hindrance_type or h.category,
                h.sub_hindrance_type or h.sub_category or '—',
                h.severity,
                h.status,
                h.latitude or '—',
                h.longitude or '—',
                h.s_latitude or '—',
                h.s_longitude or '—',
                h.e_latitude or '—',
                h.e_longitude or '—',
                h.district or '—',
                h.block or '—',
                h.location or h.section or '—',
                h.chainage or '—',
                h.ie_name or '—',
                h.ie_phone_number or '—',
                'Yes' if h.ie_photo_needed else 'No',
                h.contractor or '—',
                h.department or '—',
                h.logged_date.strftime('%d %b %Y') if h.logged_date else '—',
                h.target_date.strftime('%d %b %Y') if h.target_date else '—',
                h.source_system,
                h.external_task_id or '—',
                h.description or '—',
                h.remarks or h.mitigation or '—'
            ])

        return response



class OtnViewSet(viewsets.ModelViewSet):
    """
    HERO Web Optical Transport Network (OTN) Management API.
    Faithfully adheres to Java model:
    com.netinfra.platform.task.dao.entities.survey.OtnTaskData

    Features:
    - Complete workflow: Draft -> Submit -> Review -> Approve / Reject -> Resolve
    - Preserves dual-state: proposedOtn (submitter) and approvedOtn (reviewer)
    - Controlled classification hierarchy matching OtnType & SubOtnType
    - SurveyPhoto structure for all media & SHP components
    - Safe read-only NetInfra synchronization for OTN tasks
    - Register CSV export
    """
    queryset = Otn.objects.all().order_by('-created_at')
    serializer_class = OtnSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Otn.objects.all().order_by('-created_at')
        params = self.request.query_params

        # 1. Search filter
        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(otn_id__icontains=search) |
                Q(title__icontains=search) |
                Q(district__icontains=search) |
                Q(block__icontains=search) |
                Q(location__icontains=search) |
                Q(section__icontains=search) |
                Q(contractor__icontains=search) |
                Q(department__icontains=search) |
                Q(chainage__icontains=search) |
                Q(ie_name__icontains=search)
            )

        # 2. Classification filters
        o_type = params.get('otn_type') or params.get('type')
        if o_type and str(o_type).upper() != 'ALL':
            qs = qs.filter(otn_type__iexact=o_type)

        sub_type = params.get('sub_otn_type') or params.get('subtype')
        if sub_type and str(sub_type).upper() != 'ALL':
            qs = qs.filter(sub_otn_type__iexact=sub_type)

        # 3. Severity filter
        severity = params.get('severity')
        if severity and str(severity).upper() != 'ALL':
            qs = qs.filter(severity__iexact=severity)

        # 4. Status filter
        status_param = params.get('status')
        if status_param and str(status_param).upper() != 'ALL':
            if status_param.upper() == 'SUBMITTED':
                qs = qs.filter(status__in=['SUBMITTED', 'PENDING_APPROVAL'])
            elif status_param.upper() == 'PENDING_APPROVAL':
                qs = qs.filter(status__in=['PENDING_APPROVAL', 'SUBMITTED'])
            elif status_param.upper() == 'IN_PROGRESS':
                qs = qs.filter(status__in=['IN_PROGRESS', 'IN_REVIEW', 'OPEN'])
            else:
                qs = qs.filter(status__iexact=status_param)

        # 5. Source System filter (HERO vs NetInfra / iLync)
        source = params.get('source') or params.get('source_system')
        if source and str(source).upper() != 'ALL':
            if source.upper() in ['NETINFRA', 'ILYNC']:
                qs = qs.filter(source_system__in=['NetInfra', 'ILYNC'])
            elif source.upper() == 'HERO':
                qs = qs.filter(source_system='HERO')
            else:
                qs = qs.filter(source_system__iexact=source)

        # 6. Geography filters
        district = params.get('district')
        if district and str(district).upper() != 'ALL':
            qs = qs.filter(district__iexact=district)

        block = params.get('block')
        if block and str(block).upper() != 'ALL':
            qs = qs.filter(block__iexact=block)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        all_qs = Otn.objects.all()
        total_count = all_qs.count()
        drafts_count = all_qs.filter(status='DRAFT').count()
        submitted_count = all_qs.filter(status__in=['SUBMITTED', 'PENDING_APPROVAL']).count()
        approved_count = all_qs.filter(status='APPROVED').count()
        rejected_count = all_qs.filter(status='REJECTED').count()
        critical_count = all_qs.filter(Q(severity__iexact='CRITICAL') | Q(status__iexact='ESCALATED')).count()
        in_res_count = all_qs.filter(status__in=['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'In Progress', 'In Review', 'Open']).count()
        resolved_count = all_qs.filter(status__in=['RESOLVED', 'Resolved', 'CLEARED']).count()
        hero_count = all_qs.filter(source_system='HERO').count()
        netinfra_count = all_qs.filter(source_system__in=['NetInfra', 'ILYNC']).count()

        return Response({
            "success": True,
            "count": len(serializer.data),
            "results": serializer.data,
            "metrics": {
                "total": total_count,
                "drafts": drafts_count,
                "submitted": submitted_count,
                "pending_approval": submitted_count,
                "approved": approved_count,
                "rejected": rejected_count,
                "critical": critical_count,
                "in_resolution": in_res_count,
                "resolved": resolved_count,
                "source_hero": hero_count,
                "source_netinfra": netinfra_count,
            }
        })

    def perform_create(self, serializer):
        user = self.request.user if self.request.user and self.request.user.is_authenticated else None
        
        action_flag = (self.request.data.get('action') or '').lower()
        status_val = self.request.data.get('status')
        
        if action_flag == 'draft' or (status_val and str(status_val).upper() == 'DRAFT'):
            assigned_status = 'DRAFT'
        else:
            assigned_status = 'PENDING_APPROVAL'

        otn_id = self.request.data.get('otn_id') or self.request.data.get('otnId')
        if not otn_id:
            count = Otn.objects.count() + 101
            otn_id = f"OTN-2026-{count:03d}"
            while Otn.objects.filter(otn_id=otn_id).exists():
                count += 1
                otn_id = f"OTN-2026-{count:03d}"

        serializer.save(
            otn_id=otn_id,
            status=assigned_status,
            created_by=user,
            source_system='HERO',
            sync_status='LOCAL',
            logged_date=self.request.data.get('logged_date') or timezone.now().date()
        )

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_for_approval(self, request, pk=None):
        """
        Submits an existing DRAFT OTN for review/approval.
        Validates IE photo if required and updates proposedOtn.
        """
        otn_obj = self.get_object()
        if otn_obj.status not in ['DRAFT', 'REJECTED']:
            return Response(
                {"success": False, "message": f"OTN cannot be submitted from status {otn_obj.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if otn_obj.ie_photo_needed and not otn_obj.ie_photo:
            return Response(
                {"success": False, "message": "Independent Engineer photo is required when IE Photo Needed is Yes."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user_str = request.user.username if request.user and request.user.is_authenticated else 'System'
        otn_obj.status = 'PENDING_APPROVAL'
        otn_obj.proposed_otn = otn_obj.build_proposed_details()
        otn_obj.field_data = otn_obj.to_otn_task_data_json()

        history = otn_obj.approval_history or []
        history.append({
            "action": "SUBMITTED_FOR_APPROVAL",
            "status": "PENDING_APPROVAL",
            "user": user_str,
            "timestamp": timezone.now().isoformat(),
            "remarks": request.data.get('remarks') or otn_obj.remarks or "Submitted for reviewer approval."
        })
        otn_obj.approval_history = history
        otn_obj.save()

        return Response({
            "success": True,
            "message": "OTN submitted for approval successfully.",
            "data": OtnSerializer(otn_obj).data
        })

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """
        Approves OTN through HERO authorized workflow.
        Dual-state guarantee:
        - proposedOtn is PRESERVED untouched.
        - approvedOtn is populated with reviewer's approved version.
        - Approval history is logged with reviewer, timestamp, and remarks.
        """
        otn_obj = self.get_object()
        reviewer = request.user if request.user and request.user.is_authenticated else None
        reviewer_name = reviewer.username if reviewer else 'Reviewer'
        remarks = request.data.get('remarks') or "Approved by reviewer."

        approved_details = request.data.get('approvedOtn') or request.data.get('approvedHindrance')
        if not approved_details or not isinstance(approved_details, dict):
            approved_details = otn_obj.build_proposed_details()
            approved_details['status'] = 'APPROVED'
            approved_details['remarks'] = remarks

        if not otn_obj.proposed_otn:
            otn_obj.proposed_otn = otn_obj.build_proposed_details()

        otn_obj.approved_otn = approved_details
        otn_obj.status = 'APPROVED'
        otn_obj.remarks = remarks

        history = otn_obj.approval_history or []
        history.append({
            "action": "APPROVED",
            "status": "APPROVED",
            "user": reviewer_name,
            "timestamp": timezone.now().isoformat(),
            "remarks": remarks
        })
        otn_obj.approval_history = history
        otn_obj.field_data = otn_obj.to_otn_task_data_json()
        otn_obj.save()

        return Response({
            "success": True,
            "message": "OTN approved successfully.",
            "data": OtnSerializer(otn_obj).data
        })

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """
        Rejects OTN submission.
        Dual-state guarantee:
        - proposedOtn is preserved untouched.
        - Status is set to REJECTED.
        - Rejection remarks and reviewer logged in approval history.
        """
        otn_obj = self.get_object()
        reviewer = request.user if request.user and request.user.is_authenticated else None
        reviewer_name = reviewer.username if reviewer else 'Reviewer'
        remarks = request.data.get('remarks') or request.data.get('reason')

        if not remarks or not str(remarks).strip():
            return Response(
                {"success": False, "message": "Rejection remarks/reason are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not otn_obj.proposed_otn:
            otn_obj.proposed_otn = otn_obj.build_proposed_details()

        otn_obj.status = 'REJECTED'
        otn_obj.remarks = remarks

        history = otn_obj.approval_history or []
        history.append({
            "action": "REJECTED",
            "status": "REJECTED",
            "user": reviewer_name,
            "timestamp": timezone.now().isoformat(),
            "remarks": remarks
        })
        otn_obj.approval_history = history
        otn_obj.field_data = otn_obj.to_otn_task_data_json()
        otn_obj.save()

        return Response({
            "success": True,
            "message": "OTN rejected.",
            "data": OtnSerializer(otn_obj).data
        })

    @action(detail=False, methods=['post'], url_path='upload-media')
    def upload_media(self, request):
        """
        Media upload service returning standard SurveyPhoto JSON structure for OTN.
        """
        file_obj = request.FILES.get('file') or request.FILES.get('media')
        if not file_obj:
            return Response(
                {"success": False, "message": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST
            )

        today_str = datetime.now().strftime("%Y%m%d")
        unique_name = f"{uuid.uuid4().hex[:12]}_{file_obj.name}"
        relative_path = os.path.join('otn', today_str, unique_name).replace('\\', '/')

        saved_path = default_storage.save(relative_path, file_obj)
        media_url = f"{settings.MEDIA_URL}{saved_path}".replace('//', '/')

        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        capture_time = request.data.get('capture_time') or request.data.get('captureTime') or timezone.now().isoformat()

        survey_photo = {
            "key": saved_path,
            "url": media_url,
            "fileName": file_obj.name,
            "fileSize": file_obj.size,
            "mimeType": getattr(file_obj, 'content_type', 'application/octet-stream'),
            "captureTime": capture_time,
            "latitude": float(lat) if lat is not None and lat != '' else None,
            "longitude": float(lng) if lng is not None and lng != '' else None,
        }

        return Response({
            "success": True,
            "message": "File uploaded successfully.",
            "data": survey_photo,
            "photo": survey_photo
        })

    @action(detail=False, methods=['get'], url_path='masters')
    def masters(self, request):
        """
        Returns controlled classification masters matching Java enums for OTN.
        """
        return Response({
            "success": True,
            "otnTypes": OTN_TYPES,
            "subOtnTypes": SUB_OTN_TYPES
        })

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_external(self, request):
        """
        Triggers safe, authorized read-only synchronization of OTN tasks from NetInfra.
        """
        stats = sync_ilync_otn(user=request.user)
        return Response({
            "success": stats.get("success", False),
            "message": stats.get("message", "Sync completed"),
            "data": stats
        })

    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        """
        Exports all OTN records as a CSV register including Java model fields.
        """
        queryset = self.get_queryset()
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="otn_register_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'OTN ID', 'Title', 'OTN Type', 'Sub-OTN Type', 'Severity', 'Status',
            'Point Lat', 'Point Lng', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng',
            'District', 'Block', 'Location/Section', 'Chainage',
            'IE Name', 'IE Phone', 'IE Photo Needed',
            'Contractor', 'Department', 'Logged Date', 'Target Date',
            'Source System', 'External Task ID', 'Description', 'Mitigation / Remarks'
        ])

        for o in queryset:
            writer.writerow([
                o.otn_id,
                o.title,
                o.otn_type,
                o.sub_otn_type or '—',
                o.severity,
                o.status,
                o.latitude or '—',
                o.longitude or '—',
                o.s_latitude or '—',
                o.s_longitude or '—',
                o.e_latitude or '—',
                o.e_longitude or '—',
                o.district or '—',
                o.block or '—',
                o.location or o.section or '—',
                o.chainage or '—',
                o.ie_name or '—',
                o.ie_phone_number or '—',
                'Yes' if o.ie_photo_needed else 'No',
                o.contractor or '—',
                o.department or '—',
                o.logged_date.strftime('%d %b %Y') if o.logged_date else '—',
                o.target_date.strftime('%d %b %Y') if o.target_date else '—',
                o.source_system,
                o.external_task_id or '—',
                o.description or '—',
                o.remarks or o.mitigation or '—'
            ])

        return response


class CcnViewSet(viewsets.ModelViewSet):
    """
    HERO Web Change Control Notice (CCN) Management API.
    Faithfully adheres to Java model:
    com.netinfra.platform.task.dao.entities.survey.CcnTaskData

    Features:
    - Complete workflow: Draft -> Submit -> Review -> Approve / Reject -> Resolve
    - Preserves dual-state: proposedCcn (submitter) and approvedCcn (reviewer)
    - Controlled classification hierarchy matching CcnSubtype1 & CcnSubtype2
    - Route Evidence media fields & KML Route File support
    - Safe read-only NetInfra synchronization for CCN tasks
    - Register CSV export
    """
    queryset = Ccn.objects.all().order_by('-created_at')
    serializer_class = CcnSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Ccn.objects.all().order_by('-created_at')
        params = self.request.query_params

        # 1. Search filter
        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(ccn_id__icontains=search) |
                Q(title__icontains=search) |
                Q(district__icontains=search) |
                Q(block__icontains=search) |
                Q(location__icontains=search) |
                Q(section__icontains=search) |
                Q(contractor__icontains=search) |
                Q(department__icontains=search) |
                Q(chainage__icontains=search) |
                Q(ccn_details__icontains=search) |
                Q(kml_file_name__icontains=search)
            )

        # 2. Classification filters
        st1 = params.get('subtype1') or params.get('subtype_1') or params.get('ccn_type') or params.get('type')
        if st1 and str(st1).upper() != 'ALL':
            qs = qs.filter(subtype1__iexact=st1)

        st2 = params.get('subtype2') or params.get('subtype_2') or params.get('sub_ccn_type') or params.get('subtype')
        if st2 and str(st2).upper() != 'ALL':
            qs = qs.filter(subtype2__iexact=st2)

        # 3. Severity filter
        severity = params.get('severity')
        if severity and str(severity).upper() != 'ALL':
            qs = qs.filter(severity__iexact=severity)

        # 4. Status filter
        status_param = params.get('status')
        if status_param and str(status_param).upper() != 'ALL':
            if status_param.upper() == 'SUBMITTED':
                qs = qs.filter(status__in=['SUBMITTED', 'PENDING_APPROVAL'])
            elif status_param.upper() == 'PENDING_APPROVAL':
                qs = qs.filter(status__in=['PENDING_APPROVAL', 'SUBMITTED'])
            elif status_param.upper() == 'IN_PROGRESS':
                qs = qs.filter(status__in=['IN_PROGRESS', 'IN_REVIEW', 'OPEN'])
            else:
                qs = qs.filter(status__iexact=status_param)

        # 5. Source System filter (HERO vs NetInfra / iLync)
        source = params.get('source') or params.get('source_system')
        if source and str(source).upper() != 'ALL':
            if source.upper() in ['NETINFRA', 'ILYNC']:
                qs = qs.filter(source_system__in=['NetInfra', 'ILYNC'])
            elif source.upper() == 'HERO':
                qs = qs.filter(source_system='HERO')
            else:
                qs = qs.filter(source_system__iexact=source)

        # 6. Geography filters
        district = params.get('district')
        if district and str(district).upper() != 'ALL':
            qs = qs.filter(district__iexact=district)

        block = params.get('block')
        if block and str(block).upper() != 'ALL':
            qs = qs.filter(block__iexact=block)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        all_qs = Ccn.objects.all()
        total_count = all_qs.count()
        drafts_count = all_qs.filter(status='DRAFT').count()
        submitted_count = all_qs.filter(status__in=['SUBMITTED', 'PENDING_APPROVAL']).count()
        approved_count = all_qs.filter(status='APPROVED').count()
        rejected_count = all_qs.filter(status='REJECTED').count()
        critical_count = all_qs.filter(Q(severity__iexact='CRITICAL') | Q(status__iexact='ESCALATED')).count()
        in_res_count = all_qs.filter(status__in=['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'In Progress', 'In Review', 'Open']).count()
        resolved_count = all_qs.filter(status__in=['RESOLVED', 'Resolved', 'CLEARED']).count()
        hero_count = all_qs.filter(source_system='HERO').count()
        netinfra_count = all_qs.filter(source_system__in=['NetInfra', 'ILYNC']).count()

        return Response({
            "success": True,
            "count": len(serializer.data),
            "results": serializer.data,
            "metrics": {
                "total": total_count,
                "drafts": drafts_count,
                "submitted": submitted_count,
                "pending_approval": submitted_count,
                "approved": approved_count,
                "rejected": rejected_count,
                "critical": critical_count,
                "in_resolution": in_res_count,
                "resolved": resolved_count,
                "source_hero": hero_count,
                "source_netinfra": netinfra_count,
            }
        })

    def perform_create(self, serializer):
        user = self.request.user if self.request.user and self.request.user.is_authenticated else None
        
        action_flag = (self.request.data.get('action') or '').lower()
        status_val = self.request.data.get('status')
        
        if action_flag == 'draft' or (status_val and str(status_val).upper() == 'DRAFT'):
            assigned_status = 'DRAFT'
        else:
            assigned_status = 'PENDING_APPROVAL'

        ccn_id = self.request.data.get('ccn_id') or self.request.data.get('ccnId')
        if not ccn_id:
            count = Ccn.objects.count() + 101
            ccn_id = f"CCN-2026-{count:03d}"
            while Ccn.objects.filter(ccn_id=ccn_id).exists():
                count += 1
                ccn_id = f"CCN-2026-{count:03d}"

        serializer.save(
            ccn_id=ccn_id,
            status=assigned_status,
            created_by=user,
            source_system='HERO',
            sync_status='LOCAL',
            logged_date=self.request.data.get('logged_date') or timezone.now().date()
        )

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_for_approval(self, request, pk=None):
        """
        Submits an existing DRAFT CCN for review/approval.
        """
        ccn_obj = self.get_object()
        if ccn_obj.status not in ['DRAFT', 'REJECTED']:
            return Response(
                {"success": False, "message": f"CCN cannot be submitted from status {ccn_obj.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        user_str = request.user.username if request.user and request.user.is_authenticated else 'System'
        ccn_obj.status = 'PENDING_APPROVAL'
        ccn_obj.proposed_ccn = ccn_obj.build_proposed_details()
        ccn_obj.field_data = ccn_obj.to_ccn_task_data_json()

        history = ccn_obj.approval_history or []
        history.append({
            "action": "SUBMITTED_FOR_APPROVAL",
            "status": "PENDING_APPROVAL",
            "user": user_str,
            "timestamp": timezone.now().isoformat(),
            "remarks": request.data.get('remarks') or ccn_obj.remarks or "Submitted for reviewer approval."
        })
        ccn_obj.approval_history = history
        ccn_obj.save()

        return Response({
            "success": True,
            "message": "CCN submitted for approval successfully.",
            "data": CcnSerializer(ccn_obj).data
        })

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """
        Approves CCN through HERO authorized workflow.
        Dual-state guarantee:
        - proposedCcn is PRESERVED untouched.
        - approvedCcn is populated with reviewer's approved version.
        - Approval history is logged with reviewer, timestamp, and remarks.
        """
        ccn_obj = self.get_object()
        reviewer = request.user if request.user and request.user.is_authenticated else None
        reviewer_name = reviewer.username if reviewer else 'Reviewer'
        remarks = request.data.get('remarks') or "Approved by reviewer."

        approved_details = request.data.get('approvedCcn')
        if not approved_details or not isinstance(approved_details, dict):
            approved_details = ccn_obj.build_proposed_details()
            approved_details['status'] = 'APPROVED'
            approved_details['remarks'] = remarks

        if not ccn_obj.proposed_ccn:
            ccn_obj.proposed_ccn = ccn_obj.build_proposed_details()

        ccn_obj.approved_ccn = approved_details
        ccn_obj.status = 'APPROVED'
        ccn_obj.remarks = remarks

        history = ccn_obj.approval_history or []
        history.append({
            "action": "APPROVED",
            "status": "APPROVED",
            "user": reviewer_name,
            "timestamp": timezone.now().isoformat(),
            "remarks": remarks
        })
        ccn_obj.approval_history = history
        ccn_obj.field_data = ccn_obj.to_ccn_task_data_json()
        ccn_obj.save()

        return Response({
            "success": True,
            "message": "CCN approved successfully.",
            "data": CcnSerializer(ccn_obj).data
        })

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """
        Rejects CCN submission.
        Dual-state guarantee:
        - proposedCcn is preserved untouched.
        - Status is set to REJECTED.
        - Rejection remarks and reviewer logged in approval history.
        """
        ccn_obj = self.get_object()
        reviewer = request.user if request.user and request.user.is_authenticated else None
        reviewer_name = reviewer.username if reviewer else 'Reviewer'
        remarks = request.data.get('remarks') or request.data.get('reason')

        if not remarks or not str(remarks).strip():
            return Response(
                {"success": False, "message": "Rejection remarks/reason are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not ccn_obj.proposed_ccn:
            ccn_obj.proposed_ccn = ccn_obj.build_proposed_details()

        ccn_obj.status = 'REJECTED'
        ccn_obj.remarks = remarks

        history = ccn_obj.approval_history or []
        history.append({
            "action": "REJECTED",
            "status": "REJECTED",
            "user": reviewer_name,
            "timestamp": timezone.now().isoformat(),
            "remarks": remarks
        })
        ccn_obj.approval_history = history
        ccn_obj.field_data = ccn_obj.to_ccn_task_data_json()
        ccn_obj.save()

        return Response({
            "success": True,
            "message": "CCN rejected.",
            "data": CcnSerializer(ccn_obj).data
        })

    @action(detail=False, methods=['post'], url_path='upload-media')
    def upload_media(self, request):
        """
        Media & KML upload service returning standard SurveyPhoto JSON structure for CCN.
        Supports images, walkthrough videos, and KML route files.
        """
        file_obj = request.FILES.get('file') or request.FILES.get('media') or request.FILES.get('kmlFile')
        if not file_obj:
            return Response(
                {"success": False, "message": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST
            )

        today_str = datetime.now().strftime("%Y%m%d")
        unique_name = f"{uuid.uuid4().hex[:12]}_{file_obj.name}"
        relative_path = os.path.join('ccn', today_str, unique_name).replace('\\', '/')

        saved_path = default_storage.save(relative_path, file_obj)
        media_url = f"{settings.MEDIA_URL}{saved_path}".replace('//', '/')

        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        capture_time = request.data.get('capture_time') or request.data.get('captureTime') or timezone.now().isoformat()

        survey_photo = {
            "key": saved_path,
            "url": media_url,
            "fileName": file_obj.name,
            "fileSize": file_obj.size,
            "mimeType": getattr(file_obj, 'content_type', 'application/octet-stream'),
            "captureTime": capture_time,
            "latitude": float(lat) if lat is not None and lat != '' else None,
            "longitude": float(lng) if lng is not None and lng != '' else None,
        }

        # If it's a KML file, attempt to read first few KB for preview
        kml_content = ""
        if file_obj.name.lower().endswith('.kml'):
            try:
                file_obj.seek(0)
                raw_bytes = file_obj.read(50000)
                kml_content = raw_bytes.decode('utf-8', errors='ignore')
            except Exception:
                pass

        return Response({
            "success": True,
            "message": "File uploaded successfully.",
            "data": survey_photo,
            "photo": survey_photo,
            "kmlContent": kml_content
        })

    @action(detail=False, methods=['get'], url_path='masters')
    def masters(self, request):
        """
        Returns controlled classification masters matching Java enums for CCN.
        """
        return Response({
            "success": True,
            "subtype1": CCN_SUBTYPE_1,
            "subtype2": CCN_SUBTYPE_2,
            "ccnSubtype1": CCN_SUBTYPE_1,
            "ccnSubtype2": CCN_SUBTYPE_2
        })

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_external(self, request):
        """
        Triggers safe, authorized read-only synchronization of CCN tasks from NetInfra.
        """
        stats = sync_ilync_ccn(user=request.user)
        return Response({
            "success": stats.get("success", False),
            "message": stats.get("message", "Sync completed"),
            "data": stats
        })

    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        """
        Exports all CCN records as a CSV register including Java model fields.
        """
        queryset = self.get_queryset()
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="ccn_register_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'CCN ID', 'Title', 'Subtype 1', 'Subtype 2', 'Severity', 'Status',
            'Point Lat', 'Point Lng', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng',
            'District', 'Block', 'Location/Section', 'Chainage',
            'KML Type', 'KML File Name',
            'Contractor', 'Department', 'Logged Date', 'Target Date',
            'Source System', 'External Task ID', 'CCN Details', 'Description', 'Remarks'
        ])

        for c in queryset:
            writer.writerow([
                c.ccn_id,
                c.title,
                c.subtype1,
                c.subtype2 or '—',
                c.severity,
                c.status,
                c.latitude or '—',
                c.longitude or '—',
                c.s_latitude or '—',
                c.s_longitude or '—',
                c.e_latitude or '—',
                c.e_longitude or '—',
                c.district or '—',
                c.block or '—',
                c.location or c.section or '—',
                c.chainage or '—',
                c.kml_type or '—',
                c.kml_file_name or '—',
                c.contractor or '—',
                c.department or '—',
                c.logged_date.strftime('%d %b %Y') if c.logged_date else '—',
                c.target_date.strftime('%d %b %Y') if c.target_date else '—',
                c.source_system,
                c.external_task_id or '—',
                c.ccn_details or '—',
                c.description or '—',
                c.remarks or c.mitigation or '—'
            ])

        return response

