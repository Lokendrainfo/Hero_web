from django.db import models
from django.utils import timezone
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
    Strictly aligned with Java model com.netinfra.platform.task.dao.entities.survey.HindranceTaskData.
    Maintains dual-state architecture: proposedHindrance (submitter) and approvedHindrance (reviewer).
    """

    HINDRANCE_TYPE_CHOICES = [
        ('Linear', 'Linear'),
        ('Architecture change Involved', 'Architecture change Involved'),
        ('No', 'No'),
        ('Ring to Linear', 'Ring to Linear'),
        ('Linear to Ring', 'Linear to Ring'),
    ]

    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('PENDING_APPROVAL', 'Pending Approval'),
        ('IN_PROGRESS', 'In Progress'),
        ('IN_REVIEW', 'In Review'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('RESOLVED', 'Resolved'),
        ('ESCALATED', 'Escalated'),
        ('OPEN', 'Open'),
    ]

    SEVERITY_CHOICES = [
        ('CRITICAL', 'Critical'),
        ('HIGH', 'High'),
        ('MEDIUM', 'Medium'),
        ('LOW', 'Low'),
    ]

    SOURCE_CHOICES = [
        ('HERO', 'HERO Web'),
        ('NetInfra', 'NetInfra'),
        ('ILYNC', 'iLync / Net Infra'),
    ]

    SYNC_STATUS_CHOICES = [
        ('LOCAL', 'Local'),
        ('SYNCED', 'Synced'),
        ('PENDING', 'Pending'),
        ('FAILED', 'Failed'),
    ]

    # Core Canonical Identifiers
    hindrance_id = models.CharField(max_length=64, unique=True, db_index=True)
    title = models.CharField(max_length=255)
    hindrance_type = models.CharField(max_length=100, default='Linear', db_index=True)
    sub_hindrance_type = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    category = models.CharField(max_length=100, default='Linear', db_index=True)  # alias for backwards compatibility
    sub_category = models.CharField(max_length=255, blank=True, null=True)         # alias for backwards compatibility
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='HIGH', db_index=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='DRAFT', db_index=True)

    # Descriptions & Stakeholders
    description = models.TextField(blank=True, null=True)
    mitigation = models.TextField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    contractor = models.CharField(max_length=255, blank=True, null=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='hindrances')
    department = models.CharField(max_length=255, blank=True, null=True)

    # Location Information
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    s_latitude = models.FloatField(null=True, blank=True)
    s_longitude = models.FloatField(null=True, blank=True)
    e_latitude = models.FloatField(null=True, blank=True)
    e_longitude = models.FloatField(null=True, blank=True)

    circle = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    block = models.CharField(max_length=100, blank=True, null=True)
    section = models.CharField(max_length=255, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    chainage = models.CharField(max_length=120, blank=True, null=True)
    chainage_from = models.CharField(max_length=50, blank=True, null=True)
    chainage_to = models.CharField(max_length=50, blank=True, null=True)

    # Media Fields (SurveyPhoto structured objects or string URLs)
    start_photo = models.JSONField(default=dict, blank=True)
    end_photo = models.JSONField(default=dict, blank=True)
    walkthrough_video = models.JSONField(default=dict, blank=True)
    photos = models.JSONField(default=list, blank=True)
    additional_photos = models.JSONField(default=list, blank=True)
    additional_videos = models.JSONField(default=list, blank=True)
    additional_media = models.JSONField(default=list, blank=True)

    # Independent Engineer (IE) Fields
    ie_name = models.CharField(max_length=150, blank=True, null=True)
    ie_phone_number = models.CharField(max_length=50, blank=True, null=True)
    ie_photo_needed = models.BooleanField(default=False)
    ie_photo = models.JSONField(default=dict, blank=True)

    # Supporting Documents (SHP files storage keys/names)
    shp_files = models.JSONField(default=list, blank=True)

    # Dual-State Java Alignment (com.netinfra.platform.task.dao.entities.survey.HindranceTaskData)
    proposed_hindrance = models.JSONField(default=dict, blank=True)
    approved_hindrance = models.JSONField(null=True, blank=True)
    approval_history = models.JSONField(default=list, blank=True)
    field_data = models.JSONField(default=dict, blank=True)

    # Dates
    logged_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    resolved_date = models.DateField(null=True, blank=True)

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
            models.Index(fields=['hindrance_type']),
        ]

    def __str__(self):
        return f"{self.hindrance_id} - {self.title} [{self.source_system}]"

    def build_proposed_details(self):
        """
        Constructs the canonical HindranceDetails object for proposedHindrance.
        """
        return {
            "hindranceId": self.hindrance_id,
            "hindranceType": self.hindrance_type or self.category or "Linear",
            "subHindranceType": self.sub_hindrance_type or self.sub_category or "",
            "description": self.description or "",
            "status": self.status,
            "remarks": self.remarks or self.mitigation or "",
            "latitude": self.latitude,
            "longitude": self.longitude,
            "sLatitude": self.s_latitude,
            "sLongitude": self.s_longitude,
            "eLatitude": self.e_latitude,
            "eLongitude": self.e_longitude,
            "startPhoto": self.start_photo if isinstance(self.start_photo, dict) else ({"url": self.start_photo} if self.start_photo else {}),
            "endPhoto": self.end_photo if isinstance(self.end_photo, dict) else ({"url": self.end_photo} if self.end_photo else {}),
            "walkthroughVideo": self.walkthrough_video if isinstance(self.walkthrough_video, dict) else ({"url": self.walkthrough_video} if self.walkthrough_video else {}),
            "photos": self.photos if isinstance(self.photos, list) else [],
            "additionalPhotos": self.additional_photos if isinstance(self.additional_photos, list) else [],
            "additionalVideos": self.additional_videos if isinstance(self.additional_videos, list) else [],
            "ieName": self.ie_name or "",
            "iePhoneNumber": self.ie_phone_number or "",
            "iePhotoNeeded": bool(self.ie_photo_needed),
            "iePhoto": self.ie_photo if isinstance(self.ie_photo, dict) else ({"url": self.ie_photo} if self.ie_photo else {}),
            "shpFiles": self.shp_files if isinstance(self.shp_files, list) else [],
        }

    def to_hindrance_task_data_json(self):
        """
        Produces the canonical HindranceTaskData JSON structure matching:
        com.netinfra.platform.task.dao.entities.survey.HindranceTaskData
        """
        proposed = self.proposed_hindrance if (isinstance(self.proposed_hindrance, dict) and self.proposed_hindrance) else self.build_proposed_details()
        return {
            "surveyKind": "HINDRANCE",
            "hindranceId": self.hindrance_id,
            "remarks": self.remarks or "",
            "proposedHindrance": proposed,
            "approvedHindrance": self.approved_hindrance,
        }
