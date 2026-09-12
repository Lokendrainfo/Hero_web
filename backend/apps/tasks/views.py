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
        
        machine_id = self.request.query_params.get('machine_id') or self.request.query_params.get('machine')
        if machine_id and str(machine_id).strip() and str(machine_id).lower() != 'all':
            from django.db.models import Q
            if str(machine_id).isdigit():
                qs = qs.filter(machine_id=int(machine_id))
            else:
                qs = qs.filter(
                    Q(machine__machine_no__icontains=machine_id) |
                    Q(machine__external_machine_id=machine_id)
                )

        task_type = self.request.query_params.get('task_type') or self.request.query_params.get('taskType')
        if task_type and str(task_type).strip() and str(task_type).upper() != 'ALL':
            qs = qs.filter(task_type__iexact=task_type)

        status_param = self.request.query_params.get('status')
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
