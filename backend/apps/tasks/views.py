import csv
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Task, Hindrance
from .serializers import TaskSerializer, HindranceSerializer
from .hindrance_service import sync_ilync_hindrances
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
            from django.db.models import Q
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
            from django.db.models import Q
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
        from apps.common.vendor_scope import get_user_vendor_ids, validate_machine_vendor_access, get_user_vendor

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
    Provides register management, filtering, creation, metrics, export,
    and safe authorized read-only sync from iLync/Net Infra.
    """
    queryset = Hindrance.objects.all().order_by('-created_at')
    serializer_class = HindranceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Q
        qs = Hindrance.objects.all().order_by('-created_at')
        params = self.request.query_params

        # 1. Search across key fields
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
                Q(chainage__icontains=search)
            )

        # 2. Category
        category = params.get('category')
        if category and str(category).upper() != 'ALL':
            qs = qs.filter(category__iexact=category)

        # 3. Severity
        severity = params.get('severity')
        if severity and str(severity).upper() != 'ALL':
            qs = qs.filter(severity__iexact=severity)

        # 4. Status
        status_param = params.get('status')
        if status_param and str(status_param).upper() != 'ALL':
            qs = qs.filter(status__iexact=status_param)

        # 5. Source System
        source = params.get('source') or params.get('source_system')
        if source and str(source).upper() != 'ALL':
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
        from django.db.models import Q
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        # Calculate high-level metrics across all records
        all_qs = Hindrance.objects.all()
        total_count = all_qs.count()
        critical_count = all_qs.filter(Q(severity__iexact='CRITICAL') | Q(status__iexact='ESCALATED')).count()
        in_res_count = all_qs.filter(status__in=['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'In Progress', 'In Review', 'Open']).count()
        resolved_count = all_qs.filter(status__in=['RESOLVED', 'Resolved', 'CLEARED']).count()
        hero_count = all_qs.filter(source_system='HERO').count()
        ilync_count = all_qs.filter(source_system='ILYNC').count()

        return Response({
            "success": True,
            "count": len(serializer.data),
            "results": serializer.data,
            "metrics": {
                "total": total_count,
                "critical": critical_count,
                "in_resolution": in_res_count,
                "resolved": resolved_count,
                "source_hero": hero_count,
                "source_ilync": ilync_count,
            }
        })

    def perform_create(self, serializer):
        user = self.request.user if self.request.user and self.request.user.is_authenticated else None
        hindrance_id = self.request.data.get('hindrance_id')
        if not hindrance_id:
            count = Hindrance.objects.count() + 105
            hindrance_id = f"HND-2026-{count:03d}"
            while Hindrance.objects.filter(hindrance_id=hindrance_id).exists():
                count += 1
                hindrance_id = f"HND-2026-{count:03d}"

        serializer.save(
            hindrance_id=hindrance_id,
            created_by=user,
            source_system='HERO',
            sync_status='LOCAL',
            logged_date=self.request.data.get('logged_date') or timezone.now().date()
        )

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_external(self, request):
        """
        Triggers safe, authorized synchronization of HINDRANCE tasks from iLync.
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
        Exports all hindrances as a CSV register.
        """
        queryset = self.get_queryset()
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="hindrance_register_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Hindrance ID', 'Title', 'Category', 'Severity', 'Status',
            'District', 'Block', 'Location/Section', 'Chainage',
            'Contractor', 'Department', 'Logged Date', 'Target Date',
            'Source', 'Description', 'Mitigation Plan'
        ])

        for h in queryset:
            writer.writerow([
                h.hindrance_id,
                h.title,
                h.category,
                h.severity,
                h.status,
                h.district or '—',
                h.block or '—',
                h.location or h.section or '—',
                h.chainage or '—',
                h.contractor or '—',
                h.department or '—',
                h.logged_date.strftime('%d %b %Y') if h.logged_date else '—',
                h.target_date.strftime('%d %b %Y') if h.target_date else '—',
                h.source_system,
                h.description or '—',
                h.mitigation or h.remarks or '—'
            ])

        return response
