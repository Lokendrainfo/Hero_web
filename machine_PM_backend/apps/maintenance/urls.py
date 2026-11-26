from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.maintenance.views import (
    AdminActivityConfigurationDetailView,
    AdminActivityConfigurationListCreateView,
    AdminCategoryViewSet,
    AdminChecklistFrequencyMappingViewSet,
    AdminChecklistItemViewSet,
    AdminCustomFieldViewSet,
    AdminFrequencyViewSet,
    AdminPhotoRequirementViewSet,
    AdminRoleFrequencyMappingViewSet,
    AdminVideoRequirementViewSet,
    AuditLogListView,
    ChecklistRetrieveView,
    DashboardView,
    FrequencyListView,
    HealthCheckView,
    MachineHistoryView,
    MachineHourMeterView,
    MachineListView,
    MachineValidateView,
    MaintenanceReportView,
    OverdueMaintenanceView,
    PendingMaintenanceView,
    PhotoEvidenceListView,
    PhotoProtectedView,
    PhotoUploadView,
    SafetyGuidelinesView,
    SubmissionDetailView,
    SubmissionListCreateView,
    SubmissionReviewView,
    UserHistoryView,
    VideoProtectedView,
)

admin_router = DefaultRouter()
admin_router.register(r'categories', AdminCategoryViewSet, basename='pm-admin-categories')
admin_router.register(r'frequencies', AdminFrequencyViewSet, basename='pm-admin-frequencies')
admin_router.register(r'checklist-items', AdminChecklistItemViewSet, basename='pm-admin-checklist-items')
admin_router.register(r'frequency-mappings', AdminChecklistFrequencyMappingViewSet, basename='pm-admin-frequency-mappings')
admin_router.register(r'role-mappings', AdminRoleFrequencyMappingViewSet, basename='pm-admin-role-mappings')
admin_router.register(r'custom-fields', AdminCustomFieldViewSet, basename='pm-admin-custom-fields')
admin_router.register(r'photo-requirements', AdminPhotoRequirementViewSet, basename='pm-admin-photo-requirements')
admin_router.register(r'video-requirements', AdminVideoRequirementViewSet, basename='pm-admin-video-requirements')

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='pm-health'),
    path('dashboard/', DashboardView.as_view(), name='pm-dashboard'),
    path('frequencies/', FrequencyListView.as_view(), name='pm-frequencies'),
    path('checklist/', ChecklistRetrieveView.as_view(), name='pm-checklist'),
    path('safety-guidelines/', SafetyGuidelinesView.as_view(), name='pm-safety-guidelines'),
    path('machines/', MachineListView.as_view(), name='pm-machines'),
    path('machines/<str:machine_id>/validate/', MachineValidateView.as_view(), name='pm-machine-validate'),
    path('machines/<str:machine_id>/hour-meter/', MachineHourMeterView.as_view(), name='pm-machine-hour-meter'),
    path('photos/', PhotoEvidenceListView.as_view(), name='pm-photos-list'),
    path('photos/upload/', PhotoUploadView.as_view(), name='pm-photo-upload'),
    path('photos/<int:photo_id>/view/', PhotoProtectedView.as_view(), name='pm-photo-view'),
    path('videos/<int:video_id>/view/', VideoProtectedView.as_view(), name='pm-video-view'),
    path('submissions/', SubmissionListCreateView.as_view(), name='pm-submissions'),
    path('submissions/<int:submission_id>/', SubmissionDetailView.as_view(), name='pm-submission-detail'),
    path('submissions/<int:submission_id>/review/', SubmissionReviewView.as_view(), name='pm-submission-review'),
    path('history/machine/<str:machine_id>/', MachineHistoryView.as_view(), name='pm-machine-history'),
    path('history/user/', UserHistoryView.as_view(), name='pm-my-history'),
    path('history/user/<int:user_id>/', UserHistoryView.as_view(), name='pm-user-history'),
    path('pending/', PendingMaintenanceView.as_view(), name='pm-pending'),
    path('overdue/', OverdueMaintenanceView.as_view(), name='pm-overdue'),
    path('reports/', MaintenanceReportView.as_view(), name='pm-reports'),
    path('audit-logs/', AuditLogListView.as_view(), name='pm-audit-logs'),
    path('admin/activity-configurations/', AdminActivityConfigurationListCreateView.as_view(), name='pm-admin-activity-configs'),
    path('admin/activity-configurations/<int:item_id>/', AdminActivityConfigurationDetailView.as_view(), name='pm-admin-activity-config-detail'),
    path('admin/', include(admin_router.urls)),
]

