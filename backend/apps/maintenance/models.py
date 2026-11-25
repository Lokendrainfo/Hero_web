from django.db import models
from django.utils import timezone
from apps.machines.models import Machine
from apps.authentication.models import User

class MaintenanceSchedule(models.Model):
    """
    Legacy maintenance schedule model preserved for backward compatibility.
    """
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='maintenance_logs')
    title = models.CharField(max_length=255)
    maintenance_type = models.CharField(max_length=100, default='ROUTINE')
    scheduled_date = models.DateField()
    completed_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, default='SCHEDULED')
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    details = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-scheduled_date', '-id']

    def __str__(self):
        return f"{self.title} — {self.machine} ({self.status})"


class MaintenanceChecklistTemplate(models.Model):
    """
    Digitized master checklist activities from Apollo HDD A600V2 SOP.
    Categorized into Machine and Engine, mapped to specific maintenance frequencies.
    """
    CATEGORY_CHOICES = (
        ('MACHINE', 'Machine'),
        ('ENGINE', 'Engine'),
    )
    FREQUENCY_CHOICES = (
        ('DAILY', 'Daily'),
        ('50_HOURS', '50 Hours'),
        ('100_HOURS', '100 Hours'),
        ('250_HOURS', '250 Hours'),
        ('500_HOURS', '500 Hours'),
        ('1000_HOURS', '1000 Hours'),
    )

    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    description = models.CharField(max_length=255)
    frequency = models.CharField(max_length=30, choices=FREQUENCY_CHOICES, db_index=True)
    remarks_hint = models.CharField(max_length=255, blank=True, null=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['frequency', 'category', 'order', 'id']
        unique_together = ('category', 'description', 'frequency')

    def __str__(self):
        return f"[{self.frequency}] [{self.category}] {self.description}"


class MaintenanceLog(models.Model):
    """
    Digitized preventive maintenance execution record for a machine.
    Captures complete machine information, current hour meter, frequency,
    performed by user details, date/time, and status.
    """
    FREQUENCY_CHOICES = (
        ('DAILY', 'Daily'),
        ('50_HOURS', '50 Hours'),
        ('100_HOURS', '100 Hours'),
        ('250_HOURS', '250 Hours'),
        ('500_HOURS', '500 Hours'),
        ('1000_HOURS', '1000 Hours'),
    )
    STATUS_CHOICES = (
        ('COMPLETED', 'Completed'),
        ('PARTIALLY_COMPLETED', 'Partially Completed'),
        ('PENDING', 'Pending'),
        ('OVERDUE', 'Overdue'),
    )

    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='maintenance_records')
    machine_number = models.CharField(max_length=100, blank=True, db_index=True)
    machine_name = models.CharField(max_length=255, blank=True)
    machine_model = models.CharField(max_length=255, blank=True)
    assigned_operator = models.CharField(max_length=255, blank=True)
    assigned_vendor = models.CharField(max_length=255, blank=True)
    hour_meter_reading = models.FloatField(default=0.0)
    frequency = models.CharField(max_length=30, choices=FREQUENCY_CHOICES, db_index=True)
    maintenance_date = models.DateTimeField(default=timezone.now, db_index=True)
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='performed_maintenances')
    performed_by_name = models.CharField(max_length=255, blank=True)
    performed_by_role = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='COMPLETED', db_index=True)
    total_items = models.PositiveIntegerField(default=0)
    completed_items_count = models.PositiveIntegerField(default=0)
    not_completed_items_count = models.PositiveIntegerField(default=0)
    general_remarks = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-maintenance_date', '-id']

    def __str__(self):
        return f"{self.machine_number or self.machine.name} - {self.frequency} ({self.status}) on {self.maintenance_date.strftime('%Y-%m-%d')}"


class MaintenanceChecklistItem(models.Model):
    """
    Individual checklist activity evidence and status record.
    Enforces Mandatory Photo Rule:
    - Unique photo evidence per checklist item (photo_hash prevents shared photos).
    - Captures photo, machine ID, checklist item ID, user ID, and timestamp.
    - Mandatory remarks when status is Not Completed.
    """
    STATUS_CHOICES = (
        ('COMPLETED', 'Completed'),
        ('NOT_COMPLETED', 'Not Completed'),
    )

    record = models.ForeignKey(MaintenanceLog, on_delete=models.CASCADE, related_name='items')
    template_item = models.ForeignKey(MaintenanceChecklistTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='record_items')
    item_id = models.CharField(max_length=100, db_index=True)
    category = models.CharField(max_length=20, db_index=True)  # 'MACHINE' or 'ENGINE'
    description = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, db_index=True)
    photo = models.FileField(upload_to='maintenance/photos/%Y/%m/')
    photo_hash = models.CharField(max_length=64, blank=True, db_index=True)
    remarks = models.TextField(blank=True, default='')
    captured_machine_id = models.CharField(max_length=100, blank=True)
    captured_user_id = models.CharField(max_length=100, blank=True)
    captured_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category', 'id']

    def __str__(self):
        return f"{self.description} - {self.status} (Record: {self.record_id})"


class SafetyGuideline(models.Model):
    """
    Digitized safety guidelines and pre-operating instructions from the Apollo HDD A600V2 SOP.
    """
    SECTION_CHOICES = (
        ('PRE_OPERATING', 'Pre-Operating Instructions'),
        ('DRILL_ROD_USES', 'Drill Rod Usage Instructions'),
        ('VISE_CLAMP', 'Vise Clamp Operating Instructions'),
        ('GEAR_BOX', 'Gearbox Travelling Positioning'),
        ('GENERAL_DONTS', "General Guidelines & Don'ts"),
    )

    section_key = models.CharField(max_length=50, choices=SECTION_CHOICES, db_index=True)
    title = models.CharField(max_length=255)
    subtitle = models.CharField(max_length=255, blank=True)
    content = models.TextField()
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.title} ({self.section_key})"
