from django.contrib import admin
from .models import (
    MaintenanceFrequencyMaster,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    ChecklistFrequencyMapping,
    RoleFrequencyMapping,
    MaintenanceSubmission,
    MaintenanceChecklistResponse,
    MaintenancePhotoAttachment,
    MaintenanceApprovalReview,
    MaintenanceAuditLog,
)

admin.site.register(MaintenanceFrequencyMaster)
admin.site.register(MaintenanceCategoryMaster)
admin.site.register(MaintenanceChecklistMaster)
admin.site.register(ChecklistFrequencyMapping)
admin.site.register(RoleFrequencyMapping)
admin.site.register(MaintenanceSubmission)
admin.site.register(MaintenanceChecklistResponse)
admin.site.register(MaintenancePhotoAttachment)
admin.site.register(MaintenanceApprovalReview)
admin.site.register(MaintenanceAuditLog)

