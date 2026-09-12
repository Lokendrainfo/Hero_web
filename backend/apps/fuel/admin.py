from django.contrib import admin
from .models import FuelCard, FuelLog


@admin.register(FuelCard)
class FuelCardAdmin(admin.ModelAdmin):
    list_display = ('card_number', 'card_holder', 'vendor', 'balance', 'is_active', 'created_at')
    list_filter = ('is_active', 'vendor')
    search_fields = ('card_number', 'card_holder', 'vendor__name')
    autocomplete_fields = ('vendor',)
    list_select_related = ('vendor',)


@admin.register(FuelLog)
class FuelLogAdmin(admin.ModelAdmin):
    list_display = ('machine', 'liters', 'cost', 'fuel_date', 'created_at')
    list_filter = ('fuel_date',)
    search_fields = ('machine__name', 'machine__serial_number', 'remarks')
    autocomplete_fields = ('machine',)
    list_select_related = ('machine',)
    date_hierarchy = 'fuel_date'
