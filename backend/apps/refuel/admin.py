from django.contrib import admin
from .models import RefuelEntry


@admin.register(RefuelEntry)
class RefuelEntryAdmin(admin.ModelAdmin):
    list_display = ('machine', 'quantity_liters', 'price_per_liter', 'total_cost', 'meter_reading', 'performed_by', 'refuel_date')
    list_filter = ('refuel_date',)
    search_fields = ('machine__name', 'machine__serial_number', 'notes', 'performed_by__username')
    autocomplete_fields = ('machine', 'performed_by')
    list_select_related = ('machine', 'performed_by')
    date_hierarchy = 'refuel_date'
    readonly_fields = ('total_cost',)
