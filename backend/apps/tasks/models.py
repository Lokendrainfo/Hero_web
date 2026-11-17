from django.db import models
from apps.vendors.models import Vendor
from apps.machines.models import Machine
from apps.authentication.models import User

class Task(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='tasks')
    machine = models.ForeignKey(Machine, on_delete=models.SET_NULL, null=True, blank=True)
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    title = models.CharField(max_length=255)
    task_type = models.CharField(max_length=100, default="HDD")
    description = models.TextField(blank=True, null=True)
    scope_str = models.CharField(max_length=100, default="500 m")
    progress_val = models.IntegerField(default=320)
    scope_val = models.IntegerField(default=500)
    progress_percent = models.IntegerField(default=64)
    due_date_str = models.CharField(max_length=100, default="20 August 2025")
    overdue_str = models.CharField(max_length=100, default="Overdue by 3 days")
    fiber_category = models.CharField(max_length=50, default="Fiber 1")
    status = models.CharField(max_length=50, default='PENDING')
    priority = models.CharField(max_length=50, default='MEDIUM')
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({self.status})"


class Hindrance(models.Model):
    """
    HERO Web Hindrance Management Model.
    Supports both HERO-created Hindrances and imported iLync/Net Infra Hindrances.
    """
    SEVERITY_CHOICES = [
        ('CRITICAL', 'Critical'),
        ('HIGH', 'High'),
        ('MEDIUM', 'Medium'),
        ('LOW', 'Low'),
    ]

    STATUS_CHOICES = [
        ('OPEN', 'Open'),
        ('IN_PROGRESS', 'In Progress'),
        ('IN_REVIEW', 'In Review'),
        ('ESCALATED', 'Escalated'),
        ('RESOLVED', 'Resolved'),
    ]

    SOURCE_CHOICES = [
        ('HERO', 'HERO Web'),
        ('ILYNC', 'iLync / Net Infra'),
    ]

    SYNC_STATUS_CHOICES = [
        ('LOCAL', 'Local'),
        ('SYNCED', 'Synced'),
        ('PENDING', 'Pending'),
        ('FAILED', 'Failed'),
    ]

    # Core Identifiers
    hindrance_id = models.CharField(max_length=64, unique=True, db_index=True)
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, default='Utility Crossing', db_index=True)
    sub_category = models.CharField(max_length=100, blank=True, null=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='HIGH', db_index=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='OPEN', db_index=True)

    # Location & Chainage
    circle = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    block = models.CharField(max_length=100, blank=True, null=True)
    section = models.CharField(max_length=255, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    chainage = models.CharField(max_length=120, blank=True, null=True)
    chainage_from = models.CharField(max_length=50, blank=True, null=True)
    chainage_to = models.CharField(max_length=50, blank=True, null=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    # Descriptions & Stakeholders
    description = models.TextField(blank=True, null=True)
    mitigation = models.TextField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    contractor = models.CharField(max_length=255, blank=True, null=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='hindrances')
    department = models.CharField(max_length=255, blank=True, null=True)

    # Dates
    logged_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    resolved_date = models.DateField(null=True, blank=True)

    # Media & Attachments
    start_photo = models.TextField(blank=True, null=True)
    end_photo = models.TextField(blank=True, null=True)
    walkthrough_video = models.TextField(blank=True, null=True)
    additional_media = models.JSONField(default=list, blank=True)
    shp_files = models.JSONField(default=list, blank=True)

    # Attribution & Sync Metadata
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_hindrances')
    source_system = models.CharField(max_length=30, choices=SOURCE_CHOICES, default='HERO', db_index=True)
    external_task_id = models.CharField(max_length=128, blank=True, null=True, db_index=True)
    external_hindrance_id = models.CharField(max_length=128, blank=True, null=True, db_index=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    sync_status = models.CharField(max_length=30, choices=SYNC_STATUS_CHOICES, default='LOCAL')
    last_sync_error = models.TextField(blank=True, null=True)
    raw_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['source_system', 'external_task_id']),
            models.Index(fields=['status', 'severity']),
            models.Index(fields=['district', 'block']),
        ]

    def __str__(self):
        return f"{self.hindrance_id} - {self.title} [{self.source_system}]"
