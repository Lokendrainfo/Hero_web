from django.contrib import admin
from .models import Alert


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ('title', 'alert_type', 'alert_severity', 'vendor', 'machine', 'is_read', 'created_at')
    list_filter = ('is_read', 'alert_severity', 'alert_type', 'vendor')
    search_fields = ('title', 'message', 'vendor__name', 'machine__name')
    autocomplete_fields = ('vendor', 'machine')
    list_select_related = ('vendor', 'machine')
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)
    actions = ('mark_read', 'mark_unread')

    @admin.action(description='Mark selected alerts as read')
    def mark_read(self, request, queryset):
        queryset.update(is_read=True)

    @admin.action(description='Mark selected alerts as unread')
    def mark_unread(self, request, queryset):
        queryset.update(is_read=False)
