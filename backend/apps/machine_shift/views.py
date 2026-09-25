import csv
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from apps.common.responses import success_response, error_response
from apps.common.vendor_scope import get_user_vendor_ids
from .models import MachineShiftReason, MachineShiftRequest, MachineShiftRequestAudit
from .serializers import (
    MachineShiftReasonSerializer,
    MachineShiftRequestSerializer,
    SCMApprovalSerializer,
    SCMRejectionSerializer,
    ShifterUpdateSerializer,
    MarkShiftedSerializer,
    AttachInvoiceSerializer,
    ConfirmShiftingSerializer,
)
from .permissions import (
    IsMachineShiftAuthorized,
    is_scm_user,
    is_shifter_user,
    user_has_machine_shift_perm
)


class MachineShiftReasonViewSet(viewsets.ModelViewSet):
    queryset = MachineShiftReason.objects.filter(is_active=True)
    serializer_class = MachineShiftReasonSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        show_all = self.request.query_params.get('all', 'false').lower() == 'true'
        if show_all and (self.request.user.is_superuser or 'ADMIN' in [r.upper() for r in self.request.user.get_role_list()]):
            return MachineShiftReason.objects.all()
        return MachineShiftReason.objects.filter(is_active=True)

    def perform_create(self, serializer):
        user = self.request.user
        if not user.is_superuser and 'ADMIN' not in [r.upper() for r in user.get_role_list()]:
            raise PermissionDenied("Only administrators can manage shift reasons.")
        serializer.save()


class MachineShiftRequestViewSet(viewsets.ModelViewSet):
    queryset = MachineShiftRequest.objects.filter(is_deleted=False)
    serializer_class = MachineShiftRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsMachineShiftAuthorized]

    def get_queryset(self):
        user = self.request.user
        qs = MachineShiftRequest.objects.filter(is_deleted=False).select_related(
            'vendor', 'machine', 'reason', 'created_by', 'assigned_shifter',
            'scm_approved_by', 'rejected_by', 'confirmed_by'
        ).prefetch_related('audit_logs', 'audit_logs__performed_by')

        # Vendor isolation scoping
        if not user.is_superuser and 'ADMIN' not in [r.upper() for r in user.get_role_list()]:
            # SCM and Shifter roles might see broader requests, but if user is scoped to specific vendors, filter by vendor
            allowed_v_ids = get_user_vendor_ids(user)
            if allowed_v_ids is not None:
                # If user is also a dedicated SCM or Shifter without vendor restrictions, let them see their assignments
                if is_scm_user(user) and not ('VENDOR' in [r.upper() for r in user.get_role_list()]):
                    pass
                elif is_shifter_user(user) and not ('VENDOR' in [r.upper() for r in user.get_role_list()]):
                    qs = qs.filter(Q(vendor_id__in=allowed_v_ids) | Q(assigned_shifter_id=user.id))
                else:
                    qs = qs.filter(vendor_id__in=allowed_v_ids)

        params = self.request.query_params

        # Search filter
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(request_id__icontains=search) |
                Q(machine__name__icontains=search) |
                Q(machine__machine_chassis_no__icontains=search) |
                Q(machine__serial_number__icontains=search) |
                Q(vendor__name__icontains=search) |
                Q(a_point_name__icontains=search) |
                Q(b_point_name__icontains=search) |
                Q(reason_text__icontains=search) |
                Q(reason__name__icontains=search)
            )

        # Vendor filter
        vendor_id = params.get('vendor_id') or params.get('vendor')
        if vendor_id and str(vendor_id).upper() != 'ALL':
            qs = qs.filter(vendor_id=vendor_id)

        # Machine filter
        machine_id = params.get('machine_id') or params.get('machine')
        if machine_id and str(machine_id).upper() != 'ALL':
            if str(machine_id).isdigit():
                qs = qs.filter(machine_id=machine_id)
            else:
                qs = qs.filter(
                    Q(machine__machine_chassis_no__icontains=machine_id) |
                    Q(machine__name__icontains=machine_id)
                )

        # Status filter
        status_val = params.get('status')
        if status_val and str(status_val).upper() != 'ALL':
            qs = qs.filter(status__iexact=status_val)

        # Mode of shifting filter
        mode = params.get('mode_of_shifting') or params.get('mode')
        if mode and str(mode).upper() != 'ALL':
            qs = qs.filter(mode_of_shifting__iexact=mode)

        # Date range filters
        date_from = params.get('date_from')
        date_to = params.get('date_to')
        if date_from:
            qs = qs.filter(required_date__gte=date_from)
        if date_to:
            qs = qs.filter(required_date__lte=date_to)

        shifting_date_from = params.get('shifting_date_from')
        shifting_date_to = params.get('shifting_date_to')
        if shifting_date_from:
            qs = qs.filter(shifting_date__gte=shifting_date_from)
        if shifting_date_to:
            qs = qs.filter(shifting_date__lte=shifting_date_to)

        # Created by filter
        created_by_id = params.get('created_by')
        if created_by_id and str(created_by_id).upper() != 'ALL':
            qs = qs.filter(created_by_id=created_by_id)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        with transaction.atomic():
            # Concurrency & Unique Request ID generation
            new_request_id = MachineShiftRequest.generate_unique_request_id()

            # Ensure default reason if not provided
            reason = serializer.validated_data.get('reason')
            if not reason:
                default_reason, _ = MachineShiftReason.objects.get_or_create(
                    name="New Task",
                    defaults={"code": "NEW_TASK", "description": "Shift required for new task execution"}
                )
                reason = default_reason

            instance = serializer.save(
                request_id=new_request_id,
                created_by=user,
                status=MachineShiftRequest.STATUS_PENDING,
                reason=reason
            )

            # Audit record
            MachineShiftRequestAudit.objects.create(
                request=instance,
                action='REQUEST_CREATED',
                performed_by=user,
                previous_status='',
                new_status=instance.status,
                remarks=f"Created shift request {instance.request_id} for machine {instance.machine.name}"
            )

    def perform_update(self, serializer):
        user = self.request.user
        instance = self.get_object()

        if instance.status == MachineShiftRequest.STATUS_CONFIRMED:
            raise ValidationError("This request is CONFIRMED and locked from further edits.")

        # Requesters can only edit when PENDING_SHIFTING
        is_admin = user.is_superuser or 'ADMIN' in [r.upper() for r in user.get_role_list()]
        if not is_admin and instance.status != MachineShiftRequest.STATUS_PENDING:
            raise PermissionDenied("You can only modify requests while they are in PENDING_SHIFTING status.")

        prev_status = instance.status
        with transaction.atomic():
            updated_instance = serializer.save()
            MachineShiftRequestAudit.objects.create(
                request=updated_instance,
                action='REQUEST_UPDATED',
                performed_by=user,
                previous_status=prev_status,
                new_status=updated_instance.status,
                remarks="Request details updated by user."
            )

    def destroy(self, request, *args, **kwargs):
        # Strict business rule: Do NOT physically delete Machine Shift Request records
        raise ValidationError("Machine Shift Request records cannot be deleted. You can cancel the request instead.")

    # ----------------------------------------------------
    # SCM WORKFLOW ACTIONS
    # ----------------------------------------------------

    @action(detail=True, methods=['post'], url_path='scm-approve')
    def scm_approve(self, request, pk=None):
        user = request.user
        if not is_scm_user(user):
            raise PermissionDenied("You do not have SCM approval permissions.")

        serializer = SCMApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        remarks = serializer.validated_data.get('remarks', '')

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            if obj.status == MachineShiftRequest.STATUS_CONFIRMED:
                raise ValidationError("Request is already confirmed and cannot be altered.")
            if obj.status in [MachineShiftRequest.STATUS_CANCELLED, MachineShiftRequest.STATUS_REJECTED]:
                raise ValidationError(f"Cannot approve a request with status {obj.status}.")
            if obj.status not in [MachineShiftRequest.STATUS_PENDING]:
                raise ValidationError(f"Request is already in {obj.status} status.")

            prev_status = obj.status
            obj.status = MachineShiftRequest.STATUS_APPROVED_SCM
            obj.scm_approved_by = user
            obj.scm_approved_at = timezone.now()
            obj.rejected_by = None
            obj.rejected_at = None
            obj.rejection_reason = ''
            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='SCM_APPROVED',
                performed_by=user,
                previous_status=prev_status,
                new_status=obj.status,
                remarks=remarks or "Approved by SCM."
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Machine Shift Request approved by SCM."
        )

    @action(detail=True, methods=['post'], url_path='scm-reject')
    def scm_reject(self, request, pk=None):
        user = request.user
        if not is_scm_user(user):
            raise PermissionDenied("You do not have SCM rejection permissions.")

        serializer = SCMRejectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rejection_reason = serializer.validated_data['rejection_reason']
        remarks = serializer.validated_data.get('remarks', '')

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            if obj.status in [MachineShiftRequest.STATUS_CONFIRMED, MachineShiftRequest.STATUS_SHIFTED]:
                raise ValidationError(f"Cannot reject a request that is already {obj.status}.")
            if obj.status == MachineShiftRequest.STATUS_CANCELLED:
                raise ValidationError("Cannot reject a cancelled request.")

            prev_status = obj.status
            obj.status = MachineShiftRequest.STATUS_REJECTED
            obj.rejected_by = user
            obj.rejected_at = timezone.now()
            obj.rejection_reason = rejection_reason
            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='SCM_REJECTED',
                performed_by=user,
                previous_status=prev_status,
                new_status=obj.status,
                remarks=f"Rejected: {rejection_reason}. {remarks}".strip()
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Machine Shift Request rejected."
        )

    @action(detail=True, methods=['post'], url_path='attach-invoice')
    def attach_invoice(self, request, pk=None):
        user = request.user
        if not is_scm_user(user):
            raise PermissionDenied("You do not have permission to attach invoices.")

        serializer = AttachInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            if obj.status == MachineShiftRequest.STATUS_CONFIRMED:
                raise ValidationError("Cannot attach or modify invoice on a CONFIRMED request.")
            if obj.status in [MachineShiftRequest.STATUS_CANCELLED, MachineShiftRequest.STATUS_REJECTED]:
                raise ValidationError(f"Cannot attach invoice on a {obj.status} request.")

            obj.invoice_file = serializer.validated_data['invoice_file']
            obj.invoice_number = serializer.validated_data['invoice_number']
            obj.invoice_date = serializer.validated_data['invoice_date']
            obj.invoice_amount = serializer.validated_data['invoice_amount']
            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='INVOICE_ATTACHED',
                performed_by=user,
                previous_status=obj.status,
                new_status=obj.status,
                remarks=f"Attached Invoice {obj.invoice_number} (Amount: ₹{obj.invoice_amount}). {serializer.validated_data.get('remarks', '')}".strip()
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Invoice attached successfully."
        )

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        user = request.user
        if not is_scm_user(user):
            raise PermissionDenied("You do not have permission to confirm shifting.")

        serializer = ConfirmShiftingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        remarks = serializer.validated_data.get('remarks', '')

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            # Strict validations before confirmation:
            # 1. SCM approval completed
            if not obj.scm_approved_at:
                raise ValidationError("Cannot confirm shifting: Request has not been approved by SCM.")

            # 2. Shifting status is SHIFTED
            if obj.status != MachineShiftRequest.STATUS_SHIFTED:
                raise ValidationError(f"Cannot confirm shifting: Current status is '{obj.status}', must be 'SHIFTED'.")

            # 3. Shifting execution requirements
            if not obj.shifting_date:
                raise ValidationError("Cannot confirm shifting: Shifting Date is missing.")
            if not obj.shifting_mode:
                raise ValidationError("Cannot confirm shifting: Shifting Mode is missing.")
            if not obj.shifting_contact_person:
                raise ValidationError("Cannot confirm shifting: Shifting Contact Person is missing.")
            if not obj.machine_picture:
                raise ValidationError("Cannot confirm shifting: Machine Picture upload is missing.")
            if obj.shifting_expense_amount is None or obj.shifting_expense_amount < Decimal('0.00'):
                raise ValidationError("Cannot confirm shifting: Valid Shifting Expense Amount is required.")

            prev_status = obj.status
            obj.status = MachineShiftRequest.STATUS_CONFIRMED
            obj.confirmed_by = user
            obj.confirmed_at = timezone.now()
            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='SHIFTING_CONFIRMED',
                performed_by=user,
                previous_status=prev_status,
                new_status=obj.status,
                remarks=remarks or "Final shifting confirmation completed by SCM."
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Machine shifting confirmed and locked."
        )

    # ----------------------------------------------------
    # SHIFTER WORKFLOW ACTIONS
    # ----------------------------------------------------

    @action(detail=True, methods=['post'], url_path='start-shifting')
    def start_shifting(self, request, pk=None):
        user = request.user

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            if not is_shifter_user(user, obj):
                raise PermissionDenied("You do not have shifter permissions for this request.")

            if obj.status != MachineShiftRequest.STATUS_APPROVED_SCM:
                raise ValidationError(f"Cannot start shifting: Request must be in 'APPROVED_BY_SCM' status (current: {obj.status}).")

            prev_status = obj.status
            obj.status = MachineShiftRequest.STATUS_IN_PROGRESS
            obj.shifting_status = MachineShiftRequest.SHIFTER_STATUS_IN_PROGRESS
            if not obj.assigned_shifter:
                obj.assigned_shifter = user
            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='SHIFTING_STARTED',
                performed_by=user,
                previous_status=prev_status,
                new_status=obj.status,
                remarks=f"Shifting started by {user.get_full_name() or user.username}."
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Shifting marked as In Progress."
        )

    @action(detail=True, methods=['post', 'patch'], url_path='shifter-update')
    def shifter_update(self, request, pk=None):
        user = request.user

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            if not is_shifter_user(user, obj):
                raise PermissionDenied("You do not have shifter permissions for this request.")

            if obj.status == MachineShiftRequest.STATUS_CONFIRMED:
                raise ValidationError("Request is CONFIRMED and cannot be updated.")
            if obj.status in [MachineShiftRequest.STATUS_CANCELLED, MachineShiftRequest.STATUS_REJECTED]:
                raise ValidationError(f"Cannot update a {obj.status} request.")

            serializer = ShifterUpdateSerializer(data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data

            if 'shifting_date' in data:
                obj.shifting_date = data['shifting_date']
            if 'shifting_mode' in data:
                obj.shifting_mode = data['shifting_mode']
            if 'shifting_contact_person' in data:
                obj.shifting_contact_person = data['shifting_contact_person']
            if 'shifting_status' in data:
                obj.shifting_status = data['shifting_status']
            if 'shifting_expense_amount' in data:
                obj.shifting_expense_amount = data['shifting_expense_amount']
            if 'machine_picture' in data and data['machine_picture']:
                obj.machine_picture = data['machine_picture']

            if not obj.assigned_shifter:
                obj.assigned_shifter = user

            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='SHIFTING_UPDATED',
                performed_by=user,
                previous_status=obj.status,
                new_status=obj.status,
                remarks=data.get('remarks') or "Shifting details updated."
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Shifting details updated."
        )

    @action(detail=True, methods=['post'], url_path='mark-shifted')
    def mark_shifted(self, request, pk=None):
        user = request.user

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            if not is_shifter_user(user, obj):
                raise PermissionDenied("You do not have shifter permissions for this request.")

            if obj.status not in [MachineShiftRequest.STATUS_APPROVED_SCM, MachineShiftRequest.STATUS_IN_PROGRESS]:
                raise ValidationError(f"Cannot mark shifted from status '{obj.status}'. Request must be APPROVED_BY_SCM or IN_PROGRESS.")

            serializer = MarkShiftedSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data

            # Picture verification: Must be present either in upload or existing instance
            uploaded_pic = data.get('machine_picture')
            if uploaded_pic:
                obj.machine_picture = uploaded_pic
            elif not obj.machine_picture:
                raise ValidationError({
                    "machine_picture": "Machine Picture is mandatory before marking the request as SHIFTED."
                })

            obj.shifting_date = data['shifting_date']
            obj.shifting_mode = data['shifting_mode']
            obj.shifting_contact_person = data['shifting_contact_person']
            obj.shifting_expense_amount = data['shifting_expense_amount']
            obj.shifting_status = MachineShiftRequest.SHIFTER_STATUS_SHIFTED

            prev_status = obj.status
            obj.status = MachineShiftRequest.STATUS_SHIFTED
            if not obj.assigned_shifter:
                obj.assigned_shifter = user
            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='MARKED_SHIFTED',
                performed_by=user,
                previous_status=prev_status,
                new_status=obj.status,
                remarks=data.get('remarks') or f"Marked as SHIFTED with expense ₹{obj.shifting_expense_amount}."
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Request marked as SHIFTED successfully."
        )

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        user = request.user
        remarks = request.data.get('remarks', '')

        with transaction.atomic():
            obj = MachineShiftRequest.objects.select_for_update().get(pk=pk, is_deleted=False)

            is_admin = user.is_superuser or 'ADMIN' in [r.upper() for r in user.get_role_list()]
            if not is_admin and obj.created_by_id != user.id:
                raise PermissionDenied("You can only cancel requests you created.")

            if obj.status in [MachineShiftRequest.STATUS_CONFIRMED, MachineShiftRequest.STATUS_SHIFTED]:
                raise ValidationError(f"Cannot cancel a request that is already {obj.status}.")

            prev_status = obj.status
            obj.status = MachineShiftRequest.STATUS_CANCELLED
            obj.save()

            MachineShiftRequestAudit.objects.create(
                request=obj,
                action='CANCELLED',
                performed_by=user,
                previous_status=prev_status,
                new_status=obj.status,
                remarks=remarks or "Shift request cancelled."
            )

        return success_response(
            data=MachineShiftRequestSerializer(obj, context={'request': request}).data,
            message="Request cancelled successfully."
        )

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.get_queryset()

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="machine_shift_requests_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Request ID', 'Status', 'Vendor', 'Machine', 'Chassis No',
            'Reason', 'Required Date', 'Mode', 'A Point Name', 'A Lat', 'A Long',
            'B Point Name', 'B Lat', 'B Long', 'Created By', 'Created At',
            'Shifting Date', 'Shifting Mode', 'Contact Person', 'Expense Amount',
            'SCM Approved By', 'SCM Approved At', 'Invoice Number', 'Invoice Amount',
            'Confirmed By', 'Confirmed At'
        ])

        for req in qs:
            writer.writerow([
                req.request_id,
                req.status,
                req.vendor.name if req.vendor else '',
                req.machine.name if req.machine else '',
                req.machine.machine_chassis_no if req.machine else '',
                req.reason.name if req.reason else req.reason_text,
                req.required_date,
                req.mode_of_shifting,
                req.a_point_name,
                req.a_point_latitude or '',
                req.a_point_longitude or '',
                req.b_point_name,
                req.b_point_latitude or '',
                req.b_point_longitude or '',
                req.created_by.get_full_name() or req.created_by.username if req.created_by else '',
                req.created_at.strftime('%Y-%m-%d %H:%M:%S') if req.created_at else '',
                req.shifting_date or '',
                req.shifting_mode or '',
                req.shifting_contact_person or '',
                req.shifting_expense_amount or 0,
                req.scm_approved_by.username if req.scm_approved_by else '',
                req.scm_approved_at.strftime('%Y-%m-%d %H:%M:%S') if req.scm_approved_at else '',
                req.invoice_number or '',
                req.invoice_amount or '',
                req.confirmed_by.username if req.confirmed_by else '',
                req.confirmed_at.strftime('%Y-%m-%d %H:%M:%S') if req.confirmed_at else ''
            ])

        return response
