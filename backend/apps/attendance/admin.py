from django.contrib import admin
from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = (
        'user', 'date', 'attendance_type', 'status', 'approval_status',
        'external_vendor_id', 'check_in', 'check_out', 'shift',
    )
    list_filter = ('status', 'approval_status', 'attendance_type', 'shift', 'date')
    search_fields = (
        'user__username', 'user__first_name', 'user__last_name',
        'machine_chassis_no', 'machine_id', 'external_vendor_id', 'notes',
    )
    autocomplete_fields = (
        'user', 'marked_for_user', 'marked_by',
        'updated_by', 'approved_by', 'reporting_manager',
    )
    list_select_related = ('user',)
    date_hierarchy = 'date'
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 50
    fieldsets = (
        ('Record', {'fields': ('user', 'external_vendor_id', 'date', 'attendance_type', 'shift', 'status')}),
        ('Timing', {'fields': ('check_in', 'check_out', 'total_working_seconds', 'total_working_hours')}),
        ('Equipment', {'fields': ('machine_id', 'machine_chassis_no', 'machine_assignment_id', 'site_id')}),
        ('Marking & approval', {
            'fields': (
                'marked_for_user', 'marked_by', 'updated_by', 'reporting_manager',
                'approval_status', 'approved_by', 'approved_at', 'rejection_reason',
            )
        }),
        ('Check-in location', {
            'fields': (
                'check_in_latitude', 'check_in_longitude', 'check_in_accuracy',
                'check_in_photo', 'location_source',
            )
        }),
        ('Check-out location', {
            'fields': ('check_out_latitude', 'check_out_longitude', 'check_out_accuracy', 'check_out_photo')
        }),
        ('Notes', {'fields': ('notes', 'created_at', 'updated_at')}),
    )
