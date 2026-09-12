from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'is_read', 'created_at')
    list_filter = ('is_read', 'created_at')
    search_fields = ('title', 'body', 'user__username', 'user__email')
    autocomplete_fields = ('user',)
    list_select_related = ('user',)
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)
    actions = ('mark_read',)

    @admin.action(description='Mark selected notifications as read')
    def mark_read(self, request, queryset):
        queryset.update(is_read=True)
