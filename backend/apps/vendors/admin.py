from django.contrib import admin
from .models import Vendor, HeroVendorAssignment


class HeroVendorAssignmentInline(admin.TabularInline):
    model = HeroVendorAssignment
    fk_name = 'vendor'
    extra = 0
    autocomplete_fields = ('user', 'assigned_by')


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'code', 'vendor_code', 'external_vendor_id',
        'vendor_type', 'status', 'hdd_hero', 'is_active', 'contact_person',
    )
    list_filter = ('is_active', 'hdd_hero', 'status', 'vendor_type')
    search_fields = ('name', 'code', 'vendor_code', 'external_vendor_id', 'email', 'phone', 'contact_person')
    readonly_fields = ('created_at', 'updated_at')
    inlines = (HeroVendorAssignmentInline,)
    list_per_page = 50
    fieldsets = (
        (None, {'fields': ('name', 'code', 'vendor_code', 'external_vendor_id', 'vendor_type')}),
        ('Contact', {'fields': ('contact_person', 'email', 'phone', 'address')}),
        ('Status', {'fields': ('status', 'hdd_hero', 'is_active')}),
        ('Dates', {'fields': ('created_at', 'updated_at')}),
    )


@admin.register(HeroVendorAssignment)
class HeroVendorAssignmentAdmin(admin.ModelAdmin):
    list_display = ('user', 'vendor', 'is_active', 'assigned_by', 'assigned_at')
    list_filter = ('is_active', 'vendor')
    search_fields = ('user__username', 'user__email', 'vendor__name')
    autocomplete_fields = ('user', 'vendor', 'assigned_by')
    list_select_related = ('user', 'vendor', 'assigned_by')
