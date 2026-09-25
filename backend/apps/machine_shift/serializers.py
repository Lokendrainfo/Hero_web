import os
from decimal import Decimal
from rest_framework import serializers
from django.utils import timezone
from apps.vendors.models import Vendor
from apps.machines.models import Machine
from apps.authentication.models import User
from apps.common.vendor_scope import get_user_vendor_ids
from .models import MachineShiftReason, MachineShiftRequest, MachineShiftRequestAudit


def validate_uploaded_file(file_obj, allowed_extensions, max_size_mb, field_name):
    if not file_obj:
        return
    ext = os.path.splitext(file_obj.name)[1].lower().lstrip('.')
    if ext not in allowed_extensions:
        raise serializers.ValidationError({
            field_name: f"Invalid file format '.{ext}'. Allowed formats: {', '.join(allowed_extensions).upper()}."
        })
    max_size_bytes = max_size_mb * 1024 * 1024
    if file_obj.size > max_size_bytes:
        raise serializers.ValidationError({
            field_name: f"File size exceeds the {max_size_mb}MB limit (actual: {file_obj.size / (1024*1024):.1f}MB)."
        })


class MachineShiftReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = MachineShiftReason
        fields = ['id', 'name', 'code', 'description', 'is_active', 'created_at']


class MachineShiftRequestAuditSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MachineShiftRequestAudit
        fields = [
            'id', 'action', 'performed_by', 'performed_by_name',
            'previous_status', 'new_status', 'remarks', 'created_at'
        ]

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return obj.performed_by.get_full_name() or obj.performed_by.username
        return 'System'


class VendorRelatedField(serializers.PrimaryKeyRelatedField):
    def to_internal_value(self, data):
        from django.db.models import Q
        val_str = str(data).strip()
        try:
            if val_str.isdigit():
                return Vendor.objects.get(id=int(val_str))
            return Vendor.objects.get(
                Q(external_vendor_id=val_str) |
                Q(code__iexact=val_str) |
                Q(name__iexact=val_str)
            )
        except Vendor.DoesNotExist:
            self.fail('does_not_exist', pk_value=data)


class MachineRelatedField(serializers.PrimaryKeyRelatedField):
    def to_internal_value(self, data):
        from django.db.models import Q
        val_str = str(data).strip()
        try:
            if val_str.isdigit():
                return Machine.objects.get(id=int(val_str))
            return Machine.objects.get(
                Q(machine_chassis_no__iexact=val_str) |
                Q(serial_number__iexact=val_str) |
                Q(code__iexact=val_str)
            )
        except Machine.DoesNotExist:
            self.fail('does_not_exist', pk_value=data)


class MachineShiftRequestSerializer(serializers.ModelSerializer):
    vendor = VendorRelatedField(queryset=Vendor.objects.all())
    machine = MachineRelatedField(queryset=Machine.objects.all())

    # Display fields
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    machine_name = serializers.CharField(source='machine.name', read_only=True)
    machine_code = serializers.CharField(source='machine.code', read_only=True)
    machine_chassis_no = serializers.CharField(source='machine.machine_chassis_no', read_only=True)
    reason_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    assigned_shifter_name = serializers.SerializerMethodField()
    scm_approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()
    machine_picture_url = serializers.SerializerMethodField()
    invoice_file_url = serializers.SerializerMethodField()
    audit_logs = MachineShiftRequestAuditSerializer(many=True, read_only=True)

    class Meta:
        model = MachineShiftRequest
        fields = [
            'id', 'request_id', 'vendor', 'vendor_name', 'vendor_code',
            'machine', 'machine_name', 'machine_code', 'machine_chassis_no',
            'reason', 'reason_name', 'reason_text',
            'a_point_name', 'a_point_latitude', 'a_point_longitude',
            'b_point_name', 'b_point_latitude', 'b_point_longitude',
            'required_date', 'mode_of_shifting', 'status',
            'created_by', 'created_by_name', 'assigned_shifter', 'assigned_shifter_name',
            'created_at', 'updated_at',
            # Shifting Details
            'shifting_date', 'shifting_mode', 'shifting_contact_person',
            'shifting_status', 'machine_picture', 'machine_picture_url',
            'shifting_expense_amount',
            # SCM Details
            'scm_approved_by', 'scm_approved_by_name', 'scm_approved_at',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'invoice_file', 'invoice_file_url', 'invoice_number', 'invoice_date',
            'invoice_amount', 'confirmed_by', 'confirmed_by_name', 'confirmed_at',
            'audit_logs'
        ]
        read_only_fields = [
            'id', 'request_id', 'status', 'created_by', 'created_at', 'updated_at',
            'scm_approved_by', 'scm_approved_at', 'rejected_by', 'rejected_at',
            'rejection_reason', 'confirmed_by', 'confirmed_at', 'audit_logs'
        ]

    def get_reason_name(self, obj):
        if obj.reason:
            return obj.reason.name
        return obj.reason_text or 'New Task'

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_assigned_shifter_name(self, obj):
        if obj.assigned_shifter:
            return obj.assigned_shifter.get_full_name() or obj.assigned_shifter.username
        return ''

    def get_scm_approved_by_name(self, obj):
        if obj.scm_approved_by:
            return obj.scm_approved_by.get_full_name() or obj.scm_approved_by.username
        return ''

    def get_rejected_by_name(self, obj):
        if obj.rejected_by:
            return obj.rejected_by.get_full_name() or obj.rejected_by.username
        return ''

    def get_confirmed_by_name(self, obj):
        if obj.confirmed_by:
            return obj.confirmed_by.get_full_name() or obj.confirmed_by.username
        return ''

    def get_machine_picture_url(self, obj):
        if obj.machine_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.machine_picture.url)
            return obj.machine_picture.url
        return None

    def get_invoice_file_url(self, obj):
        if obj.invoice_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.invoice_file.url)
            return obj.invoice_file.url
        return None

    def validate(self, attrs):
        user = self.context.get('request').user if self.context.get('request') else None
        vendor = attrs.get('vendor') or (self.instance.vendor if self.instance else None)
        machine = attrs.get('machine') or (self.instance.machine if self.instance else None)

        if not vendor:
            raise serializers.ValidationError({"vendor": "Vendor is required."})
        if not getattr(vendor, 'is_active', True):
            raise serializers.ValidationError({"vendor": "Selected vendor is inactive."})

        # Vendor scoping validation
        if user and not user.is_superuser and 'ADMIN' not in [r.upper() for r in user.get_role_list()]:
            allowed_v_ids = get_user_vendor_ids(user)
            if allowed_v_ids is not None and vendor.id not in allowed_v_ids:
                raise serializers.ValidationError({"vendor": "You are not authorized to create requests for this vendor."})

        if not machine:
            raise serializers.ValidationError({"machine": "Machine is required."})

        # STRICT VALIDATION: Machine must belong to selected vendor
        belongs = False
        if machine.vendor_id == vendor.id:
            belongs = True
        elif vendor.external_vendor_id and machine.vendor and machine.vendor.external_vendor_id == vendor.external_vendor_id:
            belongs = True
        elif machine.vendor_id is None:
            machine.vendor = vendor
            machine.save(update_fields=['vendor'])
            belongs = True

        if not belongs:
            raise serializers.ValidationError({
                "machine": f"Machine '{machine.name}' ({machine.machine_chassis_no or machine.serial_number}) does not belong to vendor '{vendor.name}'."
            })

        # Coordinate validations
        for prefix in ['a_point', 'b_point']:
            lat = attrs.get(f'{prefix}_latitude')
            lng = attrs.get(f'{prefix}_longitude')
            if lat is not None and (lat < -90 or lat > 90):
                raise serializers.ValidationError({f'{prefix}_latitude': "Latitude must be between -90 and 90."})
            if lng is not None and (lng < -180 or lng > 180):
                raise serializers.ValidationError({f'{prefix}_longitude': "Longitude must be between -180 and 180."})

        # Shifting expense amount cannot be negative
        expense = attrs.get('shifting_expense_amount')
        if expense is not None and expense < Decimal('0.00'):
            raise serializers.ValidationError({"shifting_expense_amount": "Expense amount cannot be negative."})

        # File validation
        machine_pic = attrs.get('machine_picture')
        if machine_pic:
            validate_uploaded_file(machine_pic, ['jpg', 'jpeg', 'png', 'webp'], 10, 'machine_picture')

        invoice_f = attrs.get('invoice_file')
        if invoice_f:
            validate_uploaded_file(invoice_f, ['pdf', 'jpg', 'jpeg', 'png'], 15, 'invoice_file')

        return attrs


class SCMApprovalSerializer(serializers.Serializer):
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


class SCMRejectionSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=True, min_length=3)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')


class ShifterUpdateSerializer(serializers.Serializer):
    shifting_date = serializers.DateField(required=False, allow_null=True)
    shifting_mode = serializers.CharField(required=False, allow_blank=True, max_length=100)
    shifting_contact_person = serializers.CharField(required=False, allow_blank=True, max_length=255)
    shifting_status = serializers.ChoiceField(
        choices=MachineShiftRequest.SHIFTER_STATUS_CHOICES,
        required=False
    )
    shifting_expense_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.00'), required=False)
    machine_picture = serializers.FileField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_machine_picture(self, value):
        if value:
            validate_uploaded_file(value, ['jpg', 'jpeg', 'png', 'webp'], 10, 'machine_picture')
        return value


class MarkShiftedSerializer(serializers.Serializer):
    shifting_date = serializers.DateField(required=True)
    shifting_mode = serializers.CharField(required=True, max_length=100)
    shifting_contact_person = serializers.CharField(required=True, max_length=255)
    shifting_expense_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.00'), required=True)
    machine_picture = serializers.FileField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_machine_picture(self, value):
        if value:
            validate_uploaded_file(value, ['jpg', 'jpeg', 'png', 'webp'], 10, 'machine_picture')
        return value


class AttachInvoiceSerializer(serializers.Serializer):
    invoice_file = serializers.FileField(required=True)
    invoice_number = serializers.CharField(required=True, max_length=100)
    invoice_date = serializers.DateField(required=True)
    invoice_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.00'), required=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_invoice_file(self, value):
        if value:
            validate_uploaded_file(value, ['pdf', 'jpg', 'jpeg', 'png'], 15, 'invoice_file')
        return value


class ConfirmShiftingSerializer(serializers.Serializer):
    remarks = serializers.CharField(required=False, allow_blank=True, default='')
