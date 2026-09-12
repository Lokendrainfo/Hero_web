from django.contrib import admin
from .models import StockItem


@admin.register(StockItem)
class StockItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'part_number', 'vendor', 'category', 'quantity', 'min_quantity', 'unit_price', 'location', 'updated_at')
    list_filter = ('category', 'vendor')
    search_fields = ('name', 'part_number', 'location', 'vendor__name')
    autocomplete_fields = ('vendor',)
    list_select_related = ('vendor',)
    readonly_fields = ('updated_at',)
    list_per_page = 50
