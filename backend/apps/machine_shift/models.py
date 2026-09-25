import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from apps.vendors.models import Vendor
from apps.machines.models import Machine
from apps.authentication.models import User


class MachineShiftReason(models.Model):
    name = models.CharField(max_length=150, unique=True)
    code = models.CharField(max_length=50, unique=True, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Machine Shift Reason'
        verbose_name_plural = 'Machine Shift Reasons'
        ordering = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.code and self.name:
            self.code = self.name.strip().upper().replace(' ', '_')
        super().save(*args, **kwargs)


class MachineShiftRequest(models.Model):
    STATUS_PENDING = 'PENDING_SHIFTING'
    STATUS_APPROVED_SCM = 'APPROVED_BY_SCM'
    STATUS_IN_PROGRESS = 'IN_PROGRESS'
    STATUS_SHIFTED = 'SHIFTED'
    STATUS_CONFIRMED = 'CONFIRMED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CANCELLED = 'CANCELLED'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Shifting'),
        (STATUS_APPROVED_SCM, 'Approved by SCM'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_SHIFTED, 'Shifted'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    MODE_OWN_HDD = 'OWN_HDD'
    MODE_BY_TRUCK = 'BY_TRUCK'
    MODE_CHOICES = [
        (MODE_OWN_HDD, 'Own-HDD'),
        (MODE_BY_TRUCK, 'By Truck'),
    ]

    SHIFTER_STATUS_PENDING = 'PENDING'
    SHIFTER_STATUS_IN_PROGRESS = 'IN_PROGRESS'
    SHIFTER_STATUS_SHIFTED = 'SHIFTED'
    SHIFTER_STATUS_CHOICES = [
        (SHIFTER_STATUS_PENDING, 'Pending'),
        (SHIFTER_STATUS_IN_PROGRESS, 'In Progress'),
        (SHIFTER_STATUS_SHIFTED, 'Shifted'),
    ]

    # Core Identifiers & Relationships
    request_id = models.CharField(max_length=64, unique=True, db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name='machine_shift_requests', db_index=True)
    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name='machine_shift_requests', db_index=True)
    reason = models.ForeignKey(MachineShiftReason, on_delete=models.SET_NULL, null=True, blank=True, related_name='shift_requests')
    reason_text = models.CharField(max_length=255, blank=True, default='')

    # Origin (A Point)
    a_point_name = models.CharField(max_length=255)
    a_point_latitude = models.DecimalField(max_digits=12, decimal_places=8, null=True, blank=True)
    a_point_longitude = models.DecimalField(max_digits=12, decimal_places=8, null=True, blank=True)

    # Destination (B Point)
    b_point_name = models.CharField(max_length=255)
    b_point_latitude = models.DecimalField(max_digits=12, decimal_places=8, null=True, blank=True)
    b_point_longitude = models.DecimalField(max_digits=12, decimal_places=8, null=True, blank=True)

    # Requirements & Scheduling
    required_date = models.DateField(db_index=True)
    mode_of_shifting = models.CharField(max_length=50, choices=MODE_CHOICES, default=MODE_OWN_HDD)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)

    # Metadata & Assignment
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='created_machine_shift_requests')
    assigned_shifter = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_machine_shift_requests')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Shifter Role Execution Fields
    shifting_date = models.DateField(null=True, blank=True, db_index=True)
    shifting_mode = models.CharField(max_length=100, blank=True, default='')
    shifting_contact_person = models.CharField(max_length=255, blank=True, default='')
    shifting_status = models.CharField(max_length=50, choices=SHIFTER_STATUS_CHOICES, default=SHIFTER_STATUS_PENDING)
    machine_picture = models.FileField(upload_to='machine_shift/pictures/', null=True, blank=True)
    shifting_expense_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # SCM & Finance Fields
    scm_approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='scm_approved_shift_requests')
    scm_approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rejected_shift_requests')
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default='')
    invoice_file = models.FileField(upload_to='machine_shift/invoices/', null=True, blank=True)
    invoice_number = models.CharField(max_length=100, blank=True, default='')
    invoice_date = models.DateField(null=True, blank=True)
    invoice_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    confirmed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='confirmed_shift_requests')
    confirmed_at = models.DateTimeField(null=True, blank=True)

    # Soft Delete flag (Never physically delete)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Machine Shift Request'
        verbose_name_plural = 'Machine Shift Requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['request_id']),
            models.Index(fields=['vendor', 'status']),
            models.Index(fields=['machine', 'status']),
            models.Index(fields=['required_date']),
            models.Index(fields=['shifting_date']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.request_id} ({self.machine.name} - {self.status})"

    @classmethod
    def generate_unique_request_id(cls):
        date_str = timezone.now().strftime('%Y%m%d')
        prefix = f"MSR-{date_str}-"
        # Find highest sequential number for today
        latest = cls.objects.filter(request_id__startswith=prefix).order_by('-request_id').first()
        if latest and latest.request_id:
            try:
                seq = int(latest.request_id.split('-')[-1]) + 1
            except (ValueError, IndexError):
                seq = 1
        else:
            seq = 1
        new_id = f"{prefix}{seq:04d}"
        # Ensure absolute uniqueness
        while cls.objects.filter(request_id=new_id).exists():
            seq += 1
            new_id = f"{prefix}{seq:04d}"
        return new_id


class MachineShiftRequestAudit(models.Model):
    request = models.ForeignKey(MachineShiftRequest, on_delete=models.CASCADE, related_name='audit_logs')
    action = models.CharField(max_length=100)
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    previous_status = models.CharField(max_length=50, blank=True, default='')
    new_status = models.CharField(max_length=50, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = 'Machine Shift Request Audit'
        verbose_name_plural = 'Machine Shift Request Audits'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.created_at.strftime('%Y-%m-%d %H:%M')}] {self.request.request_id} - {self.action} by {self.performed_by}"
