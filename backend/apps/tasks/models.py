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



class Otn(models.Model):
    """
    HERO Web Optical Transport Network (OTN) Management Model.
    Strictly aligned with Java model com.netinfra.platform.task.dao.entities.survey.OtnTaskData.
    Raised on site against a stretch of an approved BoQ plan.
    Maintains dual-state architecture: proposedOtn (submitter) and approvedOtn (reviewer).
    """

    OTN_TYPE_CHOICES = [
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
    otn_id = models.CharField(max_length=64, unique=True, db_index=True)
    title = models.CharField(max_length=255)
    otn_type = models.CharField(max_length=100, default='Linear', db_index=True)
    sub_otn_type = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='HIGH', db_index=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='DRAFT', db_index=True)

    # Descriptions & Stakeholders
    description = models.TextField(blank=True, null=True)
    mitigation = models.TextField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    contractor = models.CharField(max_length=255, blank=True, null=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='otn_tasks')
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

    # Dual-State Java Alignment (com.netinfra.platform.task.dao.entities.survey.OtnTaskData)
    proposed_otn = models.JSONField(default=dict, blank=True)
    approved_otn = models.JSONField(null=True, blank=True)
    approval_history = models.JSONField(default=list, blank=True)
    field_data = models.JSONField(default=dict, blank=True)

    # Dates
    logged_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    resolved_date = models.DateField(null=True, blank=True)

    # Attribution & Sync Metadata
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_otn_tasks')
    source_system = models.CharField(max_length=30, choices=SOURCE_CHOICES, default='HERO', db_index=True)
    external_task_id = models.CharField(max_length=128, blank=True, null=True, db_index=True)
    external_otn_id = models.CharField(max_length=128, blank=True, null=True, db_index=True)
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
            models.Index(fields=['otn_type']),
        ]

    def __str__(self):
        return f"{self.otn_id} - {self.title} [{self.source_system}]"

    def build_proposed_details(self):
        """
        Constructs the canonical OtnDetails object for proposedOtn.
        """
        return {
            "otnId": self.otn_id,
            "otnType": self.otn_type or "Linear",
            "subOtnType": self.sub_otn_type or "",
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

    def to_otn_task_data_json(self):
        """
        Produces the canonical OtnTaskData JSON structure matching:
        com.netinfra.platform.task.dao.entities.survey.OtnTaskData
        """
        proposed = self.proposed_otn if (isinstance(self.proposed_otn, dict) and self.proposed_otn) else self.build_proposed_details()
        return {
            "surveyKind": "OTN",
            "otnId": self.otn_id,
            "remarks": self.remarks or "",
            "proposedOtn": proposed,
            "approvedOtn": self.approved_otn,
        }



class Ccn(models.Model):
    """
    HERO Web Change Control Notice (CCN) Management Model.
    Strictly aligned with Java model com.netinfra.platform.task.dao.entities.survey.CcnTaskData.
    Follows the dual-state layout (proposedCcn and approvedCcn) aligned with HindranceTaskData.
    """

    CCN_SUBTYPE_1_CHOICES = [
        ('Architecture change Involved', 'Architecture change Involved'),
        ('Linear', 'Linear'),
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
    ccn_id = models.CharField(max_length=64, unique=True, db_index=True)
    title = models.CharField(max_length=255)
    subtype1 = models.CharField(max_length=100, default='Linear', db_index=True)
    subtype2 = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='HIGH', db_index=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='DRAFT', db_index=True)

    # Detailed Descriptions & Stakeholders
    ccn_details = models.TextField(blank=True, null=True)  # Multiline CCN details (max 6,000 chars)
    description = models.TextField(blank=True, null=True)  # Backwards compatibility description
    mitigation = models.TextField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    contractor = models.CharField(max_length=255, blank=True, null=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='ccn_tasks')
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

    # Route Evidence Media Fields (SurveyPhoto structured objects)
    start_photo = models.JSONField(default=dict, blank=True)
    additional_start_photos = models.JSONField(default=list, blank=True)  # Up to 4
    walkthrough_video = models.JSONField(default=dict, blank=True)
    additional_route_videos = models.JSONField(default=list, blank=True)  # Up to 4
    end_photo = models.JSONField(default=dict, blank=True)
    additional_end_photos = models.JSONField(default=list, blank=True)    # Up to 10
    additional_end_videos = models.JSONField(default=list, blank=True)    # Up to 2
    photos = models.JSONField(default=list, blank=True)                   # General list

    # KML Route File
    kml_type = models.CharField(max_length=50, default='UPLOADED', blank=True, null=True)  # "GENERATED" or "UPLOADED"
    kml_file = models.JSONField(default=dict, blank=True)
    kml_file_name = models.CharField(max_length=255, blank=True, null=True)
    kml_file_key = models.CharField(max_length=255, blank=True, null=True)
    kml_content = models.TextField(blank=True, null=True)

    # Dual-State Java Alignment (com.netinfra.platform.task.dao.entities.survey.CcnTaskData)
    proposed_ccn = models.JSONField(default=dict, blank=True)
    approved_ccn = models.JSONField(null=True, blank=True)
    approval_history = models.JSONField(default=list, blank=True)
    field_data = models.JSONField(default=dict, blank=True)

    # Dates
    logged_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    resolved_date = models.DateField(null=True, blank=True)

    # Attribution & Sync Metadata
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_ccn_tasks')
    source_system = models.CharField(max_length=30, choices=SOURCE_CHOICES, default='HERO', db_index=True)
    external_task_id = models.CharField(max_length=128, blank=True, null=True, db_index=True)
    external_ccn_id = models.CharField(max_length=128, blank=True, null=True, db_index=True)
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
            models.Index(fields=['subtype1']),
        ]

    def __str__(self):
        return f"{self.ccn_id} - {self.title} [{self.source_system}]"

    def build_proposed_details(self):
        """
        Constructs the canonical CcnDetails object for proposedCcn.
        """
        return {
            "ccnId": self.ccn_id,
            "ccnDetails": self.ccn_details or self.description or "",
            "description": self.description or self.ccn_details or "",
            "subtype1": self.subtype1 or "Linear",
            "subtype2": self.subtype2 or "",
            "status": self.status,
            "remarks": self.remarks or self.mitigation or "",
            "sLatitude": self.s_latitude,
            "sLongitude": self.s_longitude,
            "eLatitude": self.e_latitude,
            "eLongitude": self.e_longitude,
            "startPhoto": self.start_photo if isinstance(self.start_photo, dict) else ({"url": self.start_photo} if self.start_photo else {}),
            "additionalStartPhotos": self.additional_start_photos if isinstance(self.additional_start_photos, list) else [],
            "walkthroughVideo": self.walkthrough_video if isinstance(self.walkthrough_video, dict) else ({"url": self.walkthrough_video} if self.walkthrough_video else {}),
            "additionalRouteVideos": self.additional_route_videos if isinstance(self.additional_route_videos, list) else [],
            "endPhoto": self.end_photo if isinstance(self.end_photo, dict) else ({"url": self.end_photo} if self.end_photo else {}),
            "additionalEndPhotos": self.additional_end_photos if isinstance(self.additional_end_photos, list) else [],
            "additionalEndVideos": self.additional_end_videos if isinstance(self.additional_end_videos, list) else [],
            "kmlType": self.kml_type or "UPLOADED",
            "kmlFile": self.kml_file if isinstance(self.kml_file, dict) else ({"url": self.kml_file} if self.kml_file else {}),
            "kmlFileName": self.kml_file_name or "",
            "kmlFileKey": self.kml_file_key or "",
            "kmlContent": self.kml_content or "",
            "photos": self.photos if isinstance(self.photos, list) else [],
        }

    def to_ccn_task_data_json(self):
        """
        Produces the canonical CcnTaskData JSON structure matching:
        com.netinfra.platform.task.dao.entities.survey.CcnTaskData
        """
        proposed = self.proposed_ccn if (isinstance(self.proposed_ccn, dict) and self.proposed_ccn) else self.build_proposed_details()
        return {
            "surveyKind": "CCN",
            "ccnId": self.ccn_id,
            "remarks": self.remarks or "",
            "proposedCcn": proposed,
            "approvedCcn": self.approved_ccn,
        }
