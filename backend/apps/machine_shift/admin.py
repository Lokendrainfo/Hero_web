from django.contrib import admin
from .models import MachineShiftReason, MachineShiftRequest, MachineShiftRequestAudit


@admin.register(MachineShiftReason)
class MachineShiftReasonAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active', 'created_at')
    search_fields = ('name', 'code')
    list_filter = ('is_active',)


class MachineShiftRequestAuditInline(admin.TabularInline):
    model = MachineShiftRequestAudit
    extra = 0
    readonly_fields = ('action', 'performed_by', 'previous_status', 'new_status', 'remarks', 'created_at')
    can_delete = False


@admin.register(MachineShiftRequest)
class MachineShiftRequestAdmin(admin.ModelAdmin):
    list_display = (
        'request_id', 'vendor', 'machine', 'status',
        'required_date', 'mode_of_shifting', 'created_by', 'created_at'
    )
    list_filter = ('status', 'mode_of_shifting', 'vendor', 'required_date')
    search_fields = ('request_id', 'machine__name', 'machine__machine_chassis_no', 'vendor__name')
    readonly_fields = ('request_id', 'created_at', 'updated_at')
    inlines = [MachineShiftRequestAuditInline]


@admin.register(MachineShiftRequestAudit)
class MachineShiftRequestAuditAdmin(admin.ModelAdmin):
    list_display = ('request', 'action', 'performed_by', 'previous_status', 'new_status', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('request__request_id', 'performed_by__username', 'action')
