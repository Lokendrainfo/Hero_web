from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from .models import Task
from .serializers import TaskSerializer
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
