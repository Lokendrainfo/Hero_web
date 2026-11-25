from django.db import models
from django.utils import timezone


class MaintenanceFrequencyMaster(models.Model):
    """
    Master table of Preventive Maintenance frequencies (Daily, 50 Hours, 100 Hours, 250 Hours, 500 Hours, 1000 Hours).
    Stored in `machine_pm_db`.
    """

    code = models.CharField(max_length=30, unique=True, db_index=True)
    name = models.CharField(max_length=100)
    interval_hours = models.PositiveIntegerField(null=True, blank=True, help_text="Hour-meter interval (e.g., 50, 100, 250, 500, 1000)")
    interval_days = models.PositiveIntegerField(null=True, blank=True, help_text="Calendar interval in days (e.g., 1 for Daily)")
    due_threshold_pct = models.FloatField(default=0.90, help_text="Threshold fraction (0.90 = 90%) after which maintenance becomes DUE")
    description = models.TextField(blank=True, default='')
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_frequency_master'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f"{self.name} ({self.code})"


class MaintenanceCategoryMaster(models.Model):
    """
    Master table of Maintenance Categories:
    1. Machine
    2. Engine
    3. General Safety Guidelines
    Stored in `machine_pm_db`.
    """

    code = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True, default='')
    is_checkable = models.BooleanField(default=True, help_text="Whether items in this category appear as interactive checklist activities")
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_category_master'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.name


class MaintenanceChecklistMaster(models.Model):
    """
    Master catalog of all maintenance activities & safety guidelines imported from Apollo HDD A600V2 SOP.
    References `created_by_id` from HERO User Master (`hero_hdd_db`) via application-level validation.
    """

    item_code = models.CharField(max_length=50, unique=True, db_index=True)
    category = models.ForeignKey(
        MaintenanceCategoryMaster,
        on_delete=models.PROTECT,
        related_name='checklist_items',
    )
    description = models.CharField(max_length=500)
    remarks = models.TextField(blank=True, default='')
    special_instructions = models.TextField(blank=True, default='')
    service_interval = models.CharField(max_length=150, blank=True, default='')
    section_key = models.CharField(max_length=60, blank=True, default='', db_index=True)
    requires_photo = models.BooleanField(default=True)
    requires_remarks_if_not_completed = models.BooleanField(default=True)
    is_as_required = models.BooleanField(default=False, help_text="True for items performed as per requirement / condition-based")
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_checklist_master'
        ordering = ['category__sort_order', 'sort_order', 'id']
        indexes = [
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['section_key']),
        ]

    def __str__(self):
        return f"[{self.item_code}] {self.category.name}: {self.description[:60]}"


class ChecklistFrequencyMapping(models.Model):
    """
    Maps checklist master activities to applicable maintenance frequencies inside `machine_pm_db`.
    """

    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.CASCADE,
        related_name='frequency_mappings',
    )
    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.CASCADE,
        related_name='checklist_mappings',
    )
    is_mandatory = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_checklist_frequency_mapping'
        unique_together = ('checklist_item', 'frequency')
        ordering = ['frequency__sort_order', 'sort_order', 'id']
        indexes = [
            models.Index(fields=['frequency', 'is_active']),
        ]

    def __str__(self):
        return f"{self.frequency.code} -> {self.checklist_item.item_code}"


class RoleFrequencyMapping(models.Model):
    """
    Maps HERO user role codes to permitted preventive maintenance frequencies inside `machine_pm_db`.
    """

    role_code = models.CharField(max_length=60, db_index=True)
    role_name = models.CharField(max_length=120)
    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.CASCADE,
        related_name='role_mappings',
    )
    can_view = models.BooleanField(default=True)
    can_submit = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_role_frequency_mapping'
        unique_together = ('role_code', 'frequency')
        ordering = ['role_code', 'frequency__sort_order']
        indexes = [
            models.Index(fields=['role_code', 'is_active']),
        ]

    def __str__(self):
        return f"{self.role_code} -> {self.frequency.code}"


class MaintenanceSubmission(models.Model):
    """
    Immutable preventive maintenance submission record stored in `machine_pm_db`.
    Stores validated HERO `machine_id` and `submitted_by_id` (plus point-in-time snapshots)
    without cross-database foreign keys or duplicating HERO master tables.
    """

    STATUS_COMPLETED = 'COMPLETED'
    STATUS_PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED'
    STATUS_CHOICES = (
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_PARTIALLY_COMPLETED, 'Partially Completed'),
    )

    APPROVAL_PENDING = 'PENDING_REVIEW'
    APPROVAL_APPROVED = 'APPROVED'
    APPROVAL_REJECTED = 'REJECTED'
    APPROVAL_CHANGES_REQUESTED = 'CHANGES_REQUESTED'
    APPROVAL_CHOICES = (
        (APPROVAL_PENDING, 'Pending Review'),
        (APPROVAL_APPROVED, 'Approved'),
        (APPROVAL_REJECTED, 'Rejected'),
        (APPROVAL_CHANGES_REQUESTED, 'Changes Requested'),
    )

    submission_number = models.CharField(max_length=40, unique=True, db_index=True)
    # Validated HERO Machine Master ID (stored in `hero_hdd_db`)
    machine_id = models.BigIntegerField(db_index=True)
    # Historical snapshots at submission time
    machine_number = models.CharField(max_length=100, db_index=True)
    machine_name = models.CharField(max_length=255)
    machine_model = models.CharField(max_length=120, blank=True, default='')
    machine_type = models.CharField(max_length=100, blank=True, default='')
    vendor_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    vendor_name = models.CharField(max_length=255, blank=True, default='')
    assigned_operator = models.CharField(max_length=255, blank=True, default='')
    machine_assignment_snapshot = models.JSONField(default=dict, blank=True)

    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.PROTECT,
        related_name='submissions',
    )
    hour_meter_reading = models.DecimalField(max_digits=12, decimal_places=2)

    # Validated HERO User Master ID (stored in `hero_hdd_db`)
    submitted_by_id = models.BigIntegerField(db_index=True)
    submitted_by_name = models.CharField(max_length=255)
    submitted_by_role = models.CharField(max_length=60, db_index=True)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_COMPLETED, db_index=True)
    approval_status = models.CharField(max_length=30, choices=APPROVAL_CHOICES, default=APPROVAL_PENDING, db_index=True)

    total_items = models.PositiveIntegerField(default=0)
    completed_items_count = models.PositiveIntegerField(default=0)
    not_completed_items_count = models.PositiveIntegerField(default=0)
    general_remarks = models.TextField(blank=True, default='')

    submission_date = models.DateField(default=timezone.localdate, db_index=True)
    submitted_at = models.DateTimeField(default=timezone.now, db_index=True)
    client_request_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    is_locked = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_submission'
        ordering = ['-submitted_at', '-id']
        indexes = [
            models.Index(fields=['machine_id', 'frequency', 'submission_date']),
            models.Index(fields=['submitted_by_id', 'submitted_at']),
            models.Index(fields=['vendor_id', 'submitted_at']),
            models.Index(fields=['status', 'approval_status']),
        ]

    def __str__(self):
        return f"{self.submission_number} | {self.machine_number} | {self.frequency.code}"

    @classmethod
    def generate_submission_number(cls):
        date_str = timezone.localdate().strftime('%Y%m%d')
        prefix = f"PM-{date_str}-"
        latest = cls.objects.filter(submission_number__startswith=prefix).order_by('-submission_number').first()
        seq = 1
        if latest and latest.submission_number:
            try:
                seq = int(latest.submission_number.split('-')[-1]) + 1
            except (ValueError, IndexError):
                seq = 1
        candidate = f"{prefix}{seq:04d}"
        while cls.objects.filter(submission_number=candidate).exists():
            seq += 1
            candidate = f"{prefix}{seq:04d}"
        return candidate


class MaintenanceChecklistResponse(models.Model):
    """
    Individual checklist activity response within a maintenance submission (`machine_pm_db`).
    """

    STATUS_COMPLETED = 'COMPLETED'
    STATUS_NOT_COMPLETED = 'NOT_COMPLETED'
    STATUS_CHOICES = (
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_NOT_COMPLETED, 'Not Completed'),
    )

    submission = models.ForeignKey(
        MaintenanceSubmission,
        on_delete=models.CASCADE,
        related_name='responses',
    )
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.PROTECT,
        related_name='responses',
    )
    item_code = models.CharField(max_length=50, db_index=True)
    category_name = models.CharField(max_length=120)
    description_snapshot = models.CharField(max_length=500)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, db_index=True)
    remarks = models.TextField(blank=True, default='')
    responded_by_id = models.BigIntegerField(db_index=True)
    responded_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_checklist_response'
        unique_together = ('submission', 'checklist_item')
        ordering = ['id']

    def __str__(self):
        return f"{self.submission.submission_number} | {self.item_code} -> {self.status}"


class MaintenancePhotoAttachment(models.Model):
    """
    Mandatory individual photo evidence for each checklist activity (`machine_pm_db`).
    Stores validated HERO `machine_id`, `uploaded_by_id`, local `checklist_item_id`,
    maintenance frequency, timestamp, SHA256 hash, and file reference.
    """

    submission = models.ForeignKey(
        MaintenanceSubmission,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='photos',
    )
    response = models.OneToOneField(
        MaintenanceChecklistResponse,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='photo_attachment',
    )
    machine_id = models.BigIntegerField(db_index=True)
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.PROTECT,
        related_name='photos',
    )
    uploaded_by_id = models.BigIntegerField(db_index=True)
    frequency_code = models.CharField(max_length=30, db_index=True)
    file = models.FileField(upload_to='pm_photos/%Y/%m/%d/')
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    file_size = models.PositiveIntegerField()
    sha256_hash = models.CharField(max_length=64, db_index=True)
    capture_source = models.CharField(max_length=30, default='CAMERA', db_index=True)
    is_bound = models.BooleanField(default=False, db_index=True)
    captured_at = models.DateTimeField(default=timezone.now, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_photo_attachment'
        ordering = ['-captured_at', '-id']
        indexes = [
            models.Index(fields=['machine_id', 'frequency_code', 'captured_at']),
            models.Index(fields=['sha256_hash', 'is_bound']),
        ]

    def __str__(self):
        return f"Photo #{self.id} | Machine {self.machine_id} | Item {self.checklist_item_id} | {self.frequency_code}"


class MaintenanceApprovalReview(models.Model):
    """
    Approval / Review trail for Maintenance Submissions (`machine_pm_db`).
    """

    ACTION_APPROVED = 'APPROVED'
    ACTION_REJECTED = 'REJECTED'
    ACTION_CHANGES_REQUESTED = 'CHANGES_REQUESTED'
    ACTION_CHOICES = (
        (ACTION_APPROVED, 'Approved'),
        (ACTION_REJECTED, 'Rejected'),
        (ACTION_CHANGES_REQUESTED, 'Changes Requested'),
    )

    submission = models.ForeignKey(
        MaintenanceSubmission,
        on_delete=models.CASCADE,
        related_name='reviews',
    )
    reviewer_id = models.BigIntegerField(db_index=True)
    reviewer_name = models.CharField(max_length=255)
    reviewer_role = models.CharField(max_length=60)
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    previous_status = models.CharField(max_length=30)
    new_status = models.CharField(max_length=30)
    remarks = models.TextField(blank=True, default='')
    reviewed_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'pm_approval_review'
        ordering = ['-reviewed_at', '-id']

    def __str__(self):
        return f"{self.submission.submission_number} -> {self.action} by {self.reviewer_name}"


class MaintenanceAuditLog(models.Model):
    """
    Immutable audit log for all PM actions stored exclusively in `machine_pm_db`.
    """

    entity_type = models.CharField(max_length=60, db_index=True)
    entity_id = models.CharField(max_length=64, db_index=True)
    action = models.CharField(max_length=60, db_index=True)
    actor_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    actor_username = models.CharField(max_length=150, blank=True, default='')
    actor_role = models.CharField(max_length=60, blank=True, default='')
    machine_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    frequency_code = models.CharField(max_length=30, blank=True, default='', db_index=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'pm_audit_log'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['machine_id', 'created_at']),
        ]

    def __str__(self):
        return f"[{self.created_at}] {self.entity_type}:{self.entity_id} {self.action}"
