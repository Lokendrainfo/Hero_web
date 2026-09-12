from django.contrib import admin
from .models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'task_type', 'vendor', 'machine', 'assigned_to',
        'status', 'priority', 'progress_percent', 'due_date',
    )
    list_filter = ('status', 'priority', 'task_type', 'fiber_category', 'vendor')
    search_fields = ('title', 'description', 'vendor__name', 'assigned_to__username')
    autocomplete_fields = ('vendor', 'machine', 'assigned_to')
    list_select_related = ('vendor', 'machine', 'assigned_to')
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)
    list_per_page = 50
    fieldsets = (
        (None, {'fields': ('title', 'task_type', 'fiber_category', 'description')}),
        ('Assignment', {'fields': ('vendor', 'machine', 'assigned_to')}),
        ('Progress', {'fields': ('status', 'priority', 'scope_str', 'scope_val', 'progress_val', 'progress_percent')}),
        ('Dates', {'fields': ('due_date', 'due_date_str', 'overdue_str', 'created_at')}),
    )
