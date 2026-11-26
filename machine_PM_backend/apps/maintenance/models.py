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
    is_archived = models.BooleanField(default=False, db_index=True)
    config_version = models.PositiveIntegerField(default=1)
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


class ChecklistFrequencySchedule(models.Model):
    """
    Configurable calendar schedule rule per (Checklist Activity, Frequency) inside `machine_pm_db`.
    """

    SCHED_DEFAULT = 'DEFAULT'
    SCHED_DAILY_EVERY_DAY = 'DAILY_EVERY_DAY'
    SCHED_WEEKLY_DAYS = 'WEEKLY_DAYS'
    SCHED_INTERVAL_15_DAYS = 'INTERVAL_15_DAYS'
    SCHED_TWICE_MONTHLY_DATES = 'TWICE_MONTHLY_DATES'
    SCHED_MONTHLY_DATES = 'MONTHLY_DATES'
    SCHED_QUARTERLY_DATES = 'QUARTERLY_DATES'
    SCHED_YEARLY_DATES = 'YEARLY_DATES'

    SCHEDULE_TYPE_CHOICES = (
        (SCHED_DEFAULT, 'Default Cycle'),
        (SCHED_DAILY_EVERY_DAY, 'Daily (Every Day)'),
        (SCHED_WEEKLY_DAYS, 'Weekly (Selected Days of Week)'),
        (SCHED_INTERVAL_15_DAYS, 'Every N Days From Start Date'),
        (SCHED_TWICE_MONTHLY_DATES, 'Twice Per Month (Selected Calendar Dates)'),
        (SCHED_MONTHLY_DATES, 'Monthly (Selected Dates / Last Day)'),
        (SCHED_QUARTERLY_DATES, 'Quarterly (Start Month & Dates)'),
        (SCHED_YEARLY_DATES, 'Yearly (Month & Date Schedules)'),
    )

    mapping = models.OneToOneField(
        ChecklistFrequencyMapping,
        on_delete=models.CASCADE,
        related_name='schedule',
    )
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.CASCADE,
        related_name='frequency_schedules',
    )
    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.CASCADE,
        related_name='activity_schedules',
    )
    frequency_type = models.CharField(max_length=30, db_index=True)
    schedule_type = models.CharField(max_length=40, choices=SCHEDULE_TYPE_CHOICES, default=SCHED_DEFAULT)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    selected_weekdays = models.JSONField(default=list, blank=True)
    selected_dates = models.JSONField(default=list, blank=True)
    repeat_interval = models.PositiveIntegerField(null=True, blank=True)
    use_last_day_fallback = models.BooleanField(default=True)
    quarter_start_month = models.PositiveSmallIntegerField(null=True, blank=True)
    quarter_dates = models.JSONField(default=list, blank=True)
    yearly_month = models.PositiveSmallIntegerField(null=True, blank=True)
    yearly_day = models.PositiveSmallIntegerField(null=True, blank=True)
    yearly_schedules = models.JSONField(default=list, blank=True)
    allow_duplicate_in_same_slot = models.BooleanField(default=False)
    schedule_summary = models.CharField(max_length=300, blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_frequency_schedule'
        ordering = ['frequency__sort_order', 'id']
        indexes = [
            models.Index(fields=['frequency_type', 'is_active']),
            models.Index(fields=['checklist_item', 'frequency']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['checklist_item'],
                condition=models.Q(is_active=True),
                name='uniq_active_schedule_per_checklist_item',
            ),
        ]

    def __str__(self):
        return f"{self.checklist_item.item_code} | {self.frequency_type}: {self.schedule_summary or self.schedule_type}"


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
    scheduled_due_date = models.DateField(null=True, blank=True, db_index=True)
    schedule_snapshot = models.JSONField(default=dict, blank=True)
    submission_metadata = models.JSONField(default=dict, blank=True)
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
    custom_field_values = models.JSONField(default=list, blank=True)
    config_version_snapshot = models.PositiveIntegerField(default=1)
    questions_snapshot = models.JSONField(default=list, blank=True)
    photo_requirements_snapshot = models.JSONField(default=list, blank=True)
    video_requirements_snapshot = models.JSONField(default=list, blank=True)
    location_requirements_snapshot = models.JSONField(default=list, blank=True)
    responded_by_id = models.BigIntegerField(db_index=True)
    responded_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_checklist_response'
        unique_together = ('submission', 'checklist_item')
        ordering = ['id']

    def __str__(self):
        return f"{self.submission.submission_number} | {self.item_code} -> {self.status}"


CONDITION_MODE_ALWAYS = 'ALWAYS'
CONDITION_MODE_CONDITIONAL = 'CONDITIONAL'
CONDITION_MODE_CHOICES = (
    (CONDITION_MODE_ALWAYS, 'No Condition – Always Display'),
    (CONDITION_MODE_CONDITIONAL, 'Conditional Display – Based on Question Answers'),
)

CONDITION_LOGIC_AND = 'AND'
CONDITION_LOGIC_OR = 'OR'
CONDITION_LOGIC_CHOICES = (
    (CONDITION_LOGIC_AND, 'AND'),
    (CONDITION_LOGIC_OR, 'OR'),
)


class ChecklistCustomFieldConfig(models.Model):
    """
    Admin-configured dynamic maintenance question / field (`machine_pm_db`).
    """

    TYPE_TEXT = 'TEXT'
    TYPE_TEXTAREA = 'TEXTAREA'
    TYPE_NUMBER = 'NUMBER'
    TYPE_DROPDOWN = 'DROPDOWN'
    TYPE_RADIO = 'RADIO'
    TYPE_CHECKBOX = 'CHECKBOX'
    TYPE_MULTI_SELECT = 'MULTI_SELECT'
    TYPE_DATE = 'DATE'
    TYPE_TIME = 'TIME'
    TYPE_YES_NO = 'YES_NO'
    FIELD_TYPE_CHOICES = (
        (TYPE_YES_NO, 'Yes / No'),
        (TYPE_DROPDOWN, 'Dropdown'),
        (TYPE_RADIO, 'Radio Button'),
        (TYPE_CHECKBOX, 'Checkbox'),
        (TYPE_MULTI_SELECT, 'Multiple Selection'),
        (TYPE_NUMBER, 'Number'),
        (TYPE_TEXT, 'Text'),
        (TYPE_TEXTAREA, 'Textarea'),
        (TYPE_DATE, 'Date'),
        (TYPE_TIME, 'Time'),
    )

    category = models.ForeignKey(
        MaintenanceCategoryMaster,
        on_delete=models.PROTECT,
        related_name='custom_fields',
        null=True,
        blank=True,
    )
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.CASCADE,
        related_name='custom_fields',
    )
    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='custom_fields',
        help_text="Leave null to apply across all frequencies for this checklist item",
    )
    field_name = models.CharField(max_length=80, db_index=True)
    field_label = models.CharField(max_length=150)
    field_description = models.TextField(blank=True, default='')
    field_type = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES, default=TYPE_TEXT)
    options = models.JSONField(default=list, blank=True, help_text="Option values for Dropdown / Radio / Multiple Selection")
    is_mandatory = models.BooleanField(default=False)
    condition_mode = models.CharField(max_length=20, choices=CONDITION_MODE_CHOICES, default=CONDITION_MODE_ALWAYS)
    condition_logic = models.CharField(max_length=10, choices=CONDITION_LOGIC_CHOICES, default=CONDITION_LOGIC_AND)
    condition_rules = models.JSONField(default=list, blank=True)
    display_order = models.PositiveIntegerField(default=10, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_custom_field_config'
        ordering = ['display_order', 'id']
        indexes = [
            models.Index(fields=['checklist_item', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        if self.checklist_item_id and not self.category_id:
            self.category_id = self.checklist_item.category_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.checklist_item.item_code} | {self.field_label} ({self.field_type})"


class ChecklistQuestionOption(models.Model):
    """
    Normalized answer options for a dynamic maintenance question (`machine_pm_db`).
    """

    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.CASCADE,
        related_name='option_rows',
    )
    option_label = models.CharField(max_length=150)
    option_value = models.CharField(max_length=150)
    display_order = models.PositiveIntegerField(default=1, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_question_option'
        ordering = ['display_order', 'id']

    def __str__(self):
        return f"Option: {self.option_label} (Q#{self.question_id})"


class ChecklistPhotoRequirement(models.Model):
    """
    Admin-configured named photograph requirement for a checklist activity (`machine_pm_db`).
    """

    category = models.ForeignKey(
        MaintenanceCategoryMaster,
        on_delete=models.PROTECT,
        related_name='photo_requirements',
        null=True,
        blank=True,
    )
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.CASCADE,
        related_name='photo_requirements',
    )
    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='photo_requirements',
    )
    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='photo_requirements',
    )
    photo_name = models.CharField(max_length=120)
    photo_description = models.TextField(blank=True, default='')
    is_required = models.BooleanField(default=True)
    is_mandatory = models.BooleanField(default=False)
    condition_mode = models.CharField(max_length=20, choices=CONDITION_MODE_CHOICES, default=CONDITION_MODE_ALWAYS)
    condition_logic = models.CharField(max_length=10, choices=CONDITION_LOGIC_CHOICES, default=CONDITION_LOGIC_AND)
    condition_rules = models.JSONField(default=list, blank=True)
    display_order = models.PositiveIntegerField(default=10, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_photo_requirement'
        ordering = ['display_order', 'id']
        indexes = [
            models.Index(fields=['checklist_item', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        if self.checklist_item_id and not self.category_id:
            self.category_id = self.checklist_item.category_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.checklist_item.item_code} | Photo: {self.photo_name}"


class ChecklistVideoRequirement(models.Model):
    """
    Admin-configured named video requirement for a checklist activity (`machine_pm_db`).
    """

    category = models.ForeignKey(
        MaintenanceCategoryMaster,
        on_delete=models.PROTECT,
        related_name='video_requirements',
        null=True,
        blank=True,
    )
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.CASCADE,
        related_name='video_requirements',
    )
    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='video_requirements',
    )
    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='video_requirements',
    )
    video_name = models.CharField(max_length=120)
    video_description = models.TextField(blank=True, default='')
    is_required = models.BooleanField(default=True)
    is_mandatory = models.BooleanField(default=False)
    min_videos = models.PositiveIntegerField(default=0)
    max_videos = models.PositiveIntegerField(default=1)
    max_duration_seconds = models.PositiveIntegerField(default=30)
    condition_mode = models.CharField(max_length=20, choices=CONDITION_MODE_CHOICES, default=CONDITION_MODE_ALWAYS)
    condition_logic = models.CharField(max_length=10, choices=CONDITION_LOGIC_CHOICES, default=CONDITION_LOGIC_AND)
    condition_rules = models.JSONField(default=list, blank=True)
    display_order = models.PositiveIntegerField(default=10, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_video_requirement'
        ordering = ['display_order', 'id']
        indexes = [
            models.Index(fields=['checklist_item', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        if self.checklist_item_id and not self.category_id:
            self.category_id = self.checklist_item.category_id
        if self.max_videos < self.min_videos:
            self.max_videos = self.min_videos
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.checklist_item.item_code} | Video: {self.video_name}"


class ChecklistLocationRequirement(models.Model):
    """
    Admin-configured GPS / Latitude & Longitude requirement for a question/activity (`machine_pm_db`).
    """

    RULE_LIVE_GPS = 'LIVE_GPS'
    RULE_HIGH_ACCURACY = 'HIGH_ACCURACY'
    CAPTURE_RULE_CHOICES = (
        (RULE_LIVE_GPS, 'Live Device GPS'),
        (RULE_HIGH_ACCURACY, 'High Accuracy GPS'),
    )

    category = models.ForeignKey(
        MaintenanceCategoryMaster,
        on_delete=models.PROTECT,
        related_name='location_requirements',
        null=True,
        blank=True,
    )
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.CASCADE,
        related_name='location_requirements',
    )
    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='location_requirements',
    )
    frequency = models.ForeignKey(
        MaintenanceFrequencyMaster,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='location_requirements',
    )
    location_name = models.CharField(max_length=120, default='GPS Location')
    location_description = models.TextField(blank=True, default='')
    is_required = models.BooleanField(default=True)
    capture_latitude = models.BooleanField(default=True)
    capture_longitude = models.BooleanField(default=True)
    accuracy_threshold_meters = models.FloatField(null=True, blank=True)
    capture_timestamp = models.BooleanField(default=True)
    capture_rule = models.CharField(max_length=30, choices=CAPTURE_RULE_CHOICES, default=RULE_LIVE_GPS)
    is_mandatory = models.BooleanField(default=False)
    condition_mode = models.CharField(max_length=20, choices=CONDITION_MODE_CHOICES, default=CONDITION_MODE_ALWAYS)
    condition_logic = models.CharField(max_length=10, choices=CONDITION_LOGIC_CHOICES, default=CONDITION_LOGIC_AND)
    condition_rules = models.JSONField(default=list, blank=True)
    display_order = models.PositiveIntegerField(default=10, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pm_location_requirement'
        ordering = ['display_order', 'id']
        indexes = [
            models.Index(fields=['checklist_item', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        if self.checklist_item_id and not self.category_id:
            self.category_id = self.checklist_item.category_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.checklist_item.item_code} | GPS: {self.location_name}"


class ChecklistConditionRule(models.Model):
    """
    Relational conditional display rules linking Question answers to Questions, Photos, Videos, or Locations (`machine_pm_db`).
    """

    TARGET_QUESTION = 'QUESTION'
    TARGET_PHOTO = 'PHOTO'
    TARGET_VIDEO = 'VIDEO'
    TARGET_LOCATION = 'LOCATION'
    TARGET_CHOICES = (
        (TARGET_QUESTION, 'Question'),
        (TARGET_PHOTO, 'Photo Requirement'),
        (TARGET_VIDEO, 'Video Requirement'),
        (TARGET_LOCATION, 'Location Requirement'),
    )

    OP_EQUALS = 'EQUALS'
    OP_NOT_EQUALS = 'NOT_EQUALS'
    OP_GREATER_THAN = 'GREATER_THAN'
    OP_LESS_THAN = 'LESS_THAN'
    OP_CONTAINS = 'CONTAINS'
    OPERATOR_CHOICES = (
        (OP_EQUALS, 'Equals'),
        (OP_NOT_EQUALS, 'Does Not Equal'),
        (OP_GREATER_THAN, 'Greater Than'),
        (OP_LESS_THAN, 'Less Than'),
        (OP_CONTAINS, 'Contains'),
    )

    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.CASCADE,
        related_name='condition_rule_rows',
    )
    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES, db_index=True)
    target_question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='incoming_condition_rules',
    )
    target_photo = models.ForeignKey(
        ChecklistPhotoRequirement,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='condition_rule_rows',
    )
    target_video = models.ForeignKey(
        ChecklistVideoRequirement,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='condition_rule_rows',
    )
    target_location = models.ForeignKey(
        ChecklistLocationRequirement,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='condition_rule_rows',
    )
    source_question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.CASCADE,
        related_name='triggered_condition_rules',
    )
    logic_operator = models.CharField(max_length=10, choices=CONDITION_LOGIC_CHOICES, default=CONDITION_LOGIC_AND)
    operator = models.CharField(max_length=20, choices=OPERATOR_CHOICES, default=OP_EQUALS)
    expected_value = models.CharField(max_length=255)
    rule_order = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_condition_rule'
        ordering = ['rule_order', 'id']
        indexes = [
            models.Index(fields=['checklist_item', 'target_type', 'is_active']),
        ]


class MaintenanceQuestionResponse(models.Model):
    """
    Immutable operator answer snapshot for each configured maintenance question (`machine_pm_db`).
    """

    submission = models.ForeignKey(
        MaintenanceSubmission,
        on_delete=models.CASCADE,
        related_name='question_responses',
    )
    response = models.ForeignKey(
        MaintenanceChecklistResponse,
        on_delete=models.CASCADE,
        related_name='question_responses',
    )
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.PROTECT,
        related_name='question_responses',
    )
    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submission_answers',
    )
    question_name_snapshot = models.CharField(max_length=150)
    question_description_snapshot = models.TextField(blank=True, default='')
    answer_type_snapshot = models.CharField(max_length=20)
    is_mandatory_snapshot = models.BooleanField(default=False)
    answer_value = models.JSONField(null=True, blank=True)
    evidence_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_question_response'
        ordering = ['id']
        indexes = [
            models.Index(fields=['submission', 'checklist_item']),
        ]


class MaintenancePhotoAttachment(models.Model):
    """
    Mandatory/configured individual photo evidence for each checklist activity (`machine_pm_db`).
    Stores actual image binary directly in PostgreSQL `photo_data` (`BYTEA`),
    supporting multiple named photo requirements per checklist response.
    """

    submission = models.ForeignKey(
        MaintenanceSubmission,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='photos',
    )
    response = models.ForeignKey(
        MaintenanceChecklistResponse,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='photo_attachments',
        db_column='checklist_response_id',
    )
    photo_requirement = models.ForeignKey(
        ChecklistPhotoRequirement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attachments',
    )
    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='photo_attachments',
    )
    requirement_name = models.CharField(max_length=120, blank=True, default='')
    requirement_description = models.TextField(blank=True, default='')
    is_mandatory_snapshot = models.BooleanField(default=False)
    machine_id = models.BigIntegerField(db_index=True)
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.PROTECT,
        related_name='photos',
    )
    uploaded_by_id = models.BigIntegerField(db_column='user_id', db_index=True)
    frequency_code = models.CharField(max_length=30, db_index=True)
    photo_data = models.BinaryField(default=b'')
    file = models.FileField(upload_to='pm_photos/%Y/%m/%d/', null=True, blank=True, default=None)
    original_filename = models.CharField(max_length=255, db_column='photo_filename')
    content_type = models.CharField(max_length=100, db_column='mime_type')
    file_size = models.PositiveIntegerField()
    sha256_hash = models.CharField(max_length=64, db_column='image_hash', db_index=True)
    capture_source = models.CharField(max_length=30, default='CAMERA', db_index=True)
    is_bound = models.BooleanField(default=False, db_index=True)
    captured_at = models.DateTimeField(default=timezone.now, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    accuracy_meters = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_photo_attachment'
        ordering = ['-captured_at', '-id']
        indexes = [
            models.Index(fields=['machine_id', 'frequency_code', 'captured_at']),
            models.Index(fields=['sha256_hash', 'is_bound']),
        ]

    @property
    def checklist_response_id(self):
        return self.response_id

    @property
    def user_id(self):
        return self.uploaded_by_id

    @property
    def photo_filename(self):
        return self.original_filename

    @property
    def mime_type(self):
        return self.content_type

    @property
    def image_hash(self):
        return self.sha256_hash

    def __str__(self):
        return f"Photo #{self.id} | Machine {self.machine_id} | Item {self.checklist_item_id} | {self.frequency_code}"


class MaintenanceVideoAttachment(models.Model):
    """
    Named video evidence for each checklist activity stored in PostgreSQL `BYTEA` (`machine_pm_db`).
    """

    submission = models.ForeignKey(
        MaintenanceSubmission,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='videos',
    )
    response = models.ForeignKey(
        MaintenanceChecklistResponse,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='video_attachments',
        db_column='checklist_response_id',
    )
    video_requirement = models.ForeignKey(
        ChecklistVideoRequirement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attachments',
    )
    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='video_attachments',
    )
    requirement_name = models.CharField(max_length=120, blank=True, default='')
    requirement_description = models.TextField(blank=True, default='')
    is_mandatory_snapshot = models.BooleanField(default=False)
    machine_id = models.BigIntegerField(db_index=True)
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.PROTECT,
        related_name='videos',
    )
    uploaded_by_id = models.BigIntegerField(db_column='user_id', db_index=True)
    frequency_code = models.CharField(max_length=30, db_index=True)
    video_data = models.BinaryField(default=b'')
    original_filename = models.CharField(max_length=255, db_column='video_filename')
    content_type = models.CharField(max_length=100, db_column='mime_type')
    file_size = models.PositiveIntegerField()
    duration_seconds = models.FloatField(null=True, blank=True)
    sha256_hash = models.CharField(max_length=64, db_column='video_hash', db_index=True)
    capture_source = models.CharField(max_length=30, default='CAMERA', db_index=True)
    is_bound = models.BooleanField(default=False, db_index=True)
    captured_at = models.DateTimeField(default=timezone.now, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    accuracy_meters = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_video_attachment'
        ordering = ['-captured_at', '-id']
        indexes = [
            models.Index(fields=['machine_id', 'frequency_code', 'captured_at']),
            models.Index(fields=['sha256_hash', 'is_bound']),
        ]

    @property
    def checklist_response_id(self):
        return self.response_id

    @property
    def user_id(self):
        return self.uploaded_by_id

    def __str__(self):
        return f"Video #{self.id} | Machine {self.machine_id} | Item {self.checklist_item_id} | {self.requirement_name or self.frequency_code}"


class MaintenanceLocationAttachment(models.Model):
    """
    GPS / Latitude & Longitude coordinates captured for a configured location requirement (`machine_pm_db`).
    """

    submission = models.ForeignKey(
        MaintenanceSubmission,
        on_delete=models.CASCADE,
        related_name='locations',
    )
    response = models.ForeignKey(
        MaintenanceChecklistResponse,
        on_delete=models.CASCADE,
        related_name='location_attachments',
        db_column='checklist_response_id',
    )
    location_requirement = models.ForeignKey(
        ChecklistLocationRequirement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attachments',
    )
    question = models.ForeignKey(
        ChecklistCustomFieldConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='location_attachments',
    )
    requirement_name = models.CharField(max_length=120, blank=True, default='')
    requirement_description = models.TextField(blank=True, default='')
    capture_rule_snapshot = models.CharField(max_length=30, blank=True, default='LIVE_GPS')
    is_mandatory_snapshot = models.BooleanField(default=False)
    machine_id = models.BigIntegerField(db_index=True)
    checklist_item = models.ForeignKey(
        MaintenanceChecklistMaster,
        on_delete=models.PROTECT,
        related_name='location_attachments',
    )
    captured_by_id = models.BigIntegerField(db_column='user_id', db_index=True)
    frequency_code = models.CharField(max_length=30, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    accuracy_meters = models.FloatField(null=True, blank=True)
    captured_at = models.DateTimeField(default=timezone.now, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    accuracy_meters = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pm_location_attachment'
        ordering = ['-captured_at', '-id']
        indexes = [
            models.Index(fields=['machine_id', 'frequency_code', 'captured_at']),
        ]

    def __str__(self):
        return f"GPS #{self.id} | Machine {self.machine_id} | ({self.latitude}, {self.longitude})"


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
