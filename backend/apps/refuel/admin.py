from django.contrib import admin
from .models import RefuelEntry


@admin.register(RefuelEntry)
class RefuelEntryAdmin(admin.ModelAdmin):
    list_display = ('machine_chassis_no', 'quantity_liters', 'total_cost', 'refuel_date')
    search_fields = ('machine_chassis_no', 'notes')
    # Unmanaged / deprecated — admin is read-only informational
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
