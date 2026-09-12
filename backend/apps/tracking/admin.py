from django.contrib import admin
from .models import TelemetryData


@admin.register(TelemetryData)
class TelemetryDataAdmin(admin.ModelAdmin):
    list_display = ('machine', 'timestamp', 'status', 'latitude', 'longitude', 'speed', 'fuel_level', 'engine_temp')
    list_filter = ('status', 'timestamp')
    search_fields = ('machine__name', 'machine__serial_number', 'machine__machine_chassis_no')
    autocomplete_fields = ('machine',)
    list_select_related = ('machine',)
    date_hierarchy = 'timestamp'
    readonly_fields = ('timestamp',)
    list_per_page = 100
