from django.contrib import admin
from .models import Vendor


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ('name', 'external_vendor_id', 'code', 'status', 'is_active')
    search_fields = ('name', 'external_vendor_id', 'code', 'email', 'phone')
    list_filter = ('status', 'is_active')
    readonly_fields = ('created_at', 'updated_at')
