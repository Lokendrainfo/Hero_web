from django.contrib import admin
from .models import BreakdownReport


@admin.register(BreakdownReport)
class BreakdownReportAdmin(admin.ModelAdmin):
    list_display = ('machine', 'severity', 'status', 'reported_by', 'reported_at', 'resolved_at')
    list_filter = ('status', 'severity', 'reported_at')
    search_fields = ('issue_description', 'resolution_notes', 'machine__name', 'machine__serial_number')
    autocomplete_fields = ('machine', 'reported_by')
    list_select_related = ('machine', 'reported_by')
    date_hierarchy = 'reported_at'
    readonly_fields = ('reported_at',)
