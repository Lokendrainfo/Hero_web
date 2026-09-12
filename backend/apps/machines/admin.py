from django.contrib import admin
from .models import Machine


@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'serial_number', 'machine_chassis_no', 'model_code',
        'vendor', 'status', 'is_online', 'is_commissioned',
        'fuel_percentage', 'site_name',
    )
    list_filter = ('status', 'is_online', 'is_commissioned', 'model_code', 'category', 'vendor')
    search_fields = (
        'name', 'serial_number', 'machine_chassis_no', 'engine_no',
        'code', 'model_name', 'site_name', 'vehicle_no',
    )
    autocomplete_fields = ('vendor',)
    list_select_related = ('vendor',)
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 50
    fieldsets = (
        ('Identity', {
            'fields': (
                'vendor', 'name', 'code', 'serial_number',
                'machine_chassis_no', 'engine_no', 'vehicle_no',
            )
        }),
        ('Model & site', {
            'fields': ('category', 'model_code', 'model_name', 'site_id', 'site_name', 'location_name', 'is_commissioned')
        }),
        ('Operations', {
            'fields': ('status', 'is_online', 'engine_on', 'state_label', 'runtime_str', 'engine_hours', 'engine_hours_today')
        }),
        ('Fuel', {
            'fields': (
                'fuel_capacity', 'current_fuel_level', 'fuel_percentage',
                'today_consumption', 'today_refueled', 'last_filled_text', 'filled_by', 'fuel_card',
            )
        }),
        ('Live telemetry', {
            'fields': (
                'current_latitude', 'current_longitude', 'rpm', 'coolant_temp',
                'oil_pressure', 'supply_voltage', 'internal_battery_v',
            )
        }),
        ('Assignments', {'fields': ('operator', 'partners')}),
        ('Dates', {'fields': ('created_at', 'updated_at')}),
    )
