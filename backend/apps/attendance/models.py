from django.db import models
from apps.authentication.models import User
from apps.vendors.models import Vendor

ATTENDANCE_STATUS_CHOICES = (
    ('NOT_CHECKED_IN', 'Not Checked In'),
    ('NOT_MARKED', 'Not Marked'),
    ('CHECKED_IN', 'Checked In'),
    ('CHECKED_OUT', 'Checked Out'),
    ('PRESENT', 'Present'),
    ('PENDING', 'Pending'),
    ('REJECTED', 'Rejected'),
    ('ABSENT', 'Absent'),
    ('HALF_DAY', 'Half Day'),
    ('LEAVE', 'Leave'),
    ('WEEK_OFF', 'Week Off'),
)

APPROVAL_STATUS_CHOICES = (
    ('PENDING', 'Pending'),
    ('APPROVED', 'Approved'),
    ('REJECTED', 'Rejected'),
)

ATTENDANCE_TYPE_CHOICES = (
    ('TEAM', 'Team'),
    ('MACHINE', 'Machine'),
    ('SELF', 'Self'),
)

LOCATION_SOURCE_CHOICES = (
    ('GPS', 'GPS'),
    ('TEST_LOCATION', 'Test Location'),
)

class AttendanceRecord(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='attendance_records')
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, null=True, blank=True, related_name='attendance_records')
    date = models.DateField()

    # Timing
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)

    # Attendance Type & Equipment Details
    attendance_type = models.CharField(max_length=50, choices=ATTENDANCE_TYPE_CHOICES, default='TEAM')
    machine_id = models.CharField(max_length=100, null=True, blank=True)
    machine_chassis_no = models.CharField(max_length=100, null=True, blank=True)
    machine_assignment_id = models.CharField(max_length=100, null=True, blank=True)
    site_id = models.CharField(max_length=100, null=True, blank=True)

    # User Assignments & Marking
    marked_for_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='attendances_marked_for')
    marked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='marked_attendances')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_attendances')

    # Status & Manager Approval Workflow
    reporting_manager = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='attendances_to_approve')
    status = models.CharField(max_length=50, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')
    approval_status = models.CharField(max_length=50, choices=APPROVAL_STATUS_CHOICES, default='PENDING')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_attendances')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, null=True)

    # Geo Telemetry & Photos
    check_in_latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    check_in_longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    check_in_accuracy = models.FloatField(null=True, blank=True)
    check_in_photo = models.FileField(upload_to='attendance/photos/', null=True, blank=True)
    location_source = models.CharField(max_length=50, choices=LOCATION_SOURCE_CHOICES, default='GPS')

    check_out_latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    check_out_longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    check_out_accuracy = models.FloatField(null=True, blank=True)
    check_out_photo = models.FileField(upload_to='attendance/photos/', null=True, blank=True)

    # Analytics / Working Hours
    total_working_seconds = models.IntegerField(null=True, blank=True)
    total_working_hours = models.CharField(max_length=50, null=True, blank=True)

    shift = models.CharField(max_length=50, default='DAY')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    # Historical Identity Snapshots (Immature Historical Business Data)
    external_user_id_snapshot = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    employee_id_snapshot = models.CharField(max_length=100, null=True, blank=True)
    user_name_snapshot = models.CharField(max_length=255, null=True, blank=True)
    phone_number_snapshot = models.CharField(max_length=50, null=True, blank=True)
    role_snapshot = models.CharField(max_length=100, null=True, blank=True)
    vendor_external_id_snapshot = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    vendor_name_snapshot = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        ordering = ['-date', '-created_at', 'user_id']

    def populate_identity_snapshot(self, force=False):
        """
        Populate historical snapshot fields from associated user and vendor
        if not already set. Preserves existing snapshot values once written.
        """
        if self.user:
            if force or not self.external_user_id_snapshot:
                self.external_user_id_snapshot = self.user.external_user_id or None
            if force or not self.employee_id_snapshot:
                self.employee_id_snapshot = self.user.employee_id or self.user.external_user_id or f"EMP-{self.user.id}"
            if force or not self.user_name_snapshot:
                self.user_name_snapshot = self.user.get_full_name() or self.user.username
            if force or not self.phone_number_snapshot:
                self.phone_number_snapshot = self.user.phone_number or None
            if force or not self.role_snapshot:
                roles = self.user.get_role_list() if hasattr(self.user, 'get_role_list') else []
                self.role_snapshot = roles[0] if roles else (self.user.role or getattr(self.user, 'designation', None) or 'OPERATOR')
        if force or not self.vendor_name_snapshot:
            if self.vendor:
                self.vendor_name_snapshot = self.vendor.name
            elif self.user and self.user.vendor:
                self.vendor_name_snapshot = self.user.vendor.name
        if force or not self.vendor_external_id_snapshot:
            if self.vendor and self.vendor.external_vendor_id:
                self.vendor_external_id_snapshot = self.vendor.external_vendor_id
            elif self.user and self.user.vendor and self.user.vendor.external_vendor_id:
                self.vendor_external_id_snapshot = self.user.vendor.external_vendor_id

    def save(self, *args, **kwargs):
        if not self.pk:
            self.populate_identity_snapshot()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} - {self.date} ({self.status} / {self.approval_status})"
