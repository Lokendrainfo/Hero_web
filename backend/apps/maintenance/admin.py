from django.contrib import admin
from .models import MaintenanceSchedule


@admin.register(MaintenanceSchedule)
class MaintenanceScheduleAdmin(admin.ModelAdmin):
    list_display = ('title', 'machine', 'maintenance_type', 'scheduled_date', 'completed_date', 'status', 'cost')
    list_filter = ('status', 'maintenance_type', 'scheduled_date')
    search_fields = ('title', 'details', 'machine__name', 'machine__serial_number')
    autocomplete_fields = ('machine',)
    list_select_related = ('machine',)
    date_hierarchy = 'scheduled_date'
    readonly_fields = ('created_at',)
