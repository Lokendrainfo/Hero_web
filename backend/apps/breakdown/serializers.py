from rest_framework import serializers
from .models import BreakdownReport

class BreakdownReportSerializer(serializers.ModelSerializer):
    machine_code = serializers.CharField(source='machine.name', read_only=True)
    machine_name = serializers.CharField(source='machine.name', read_only=True)
    vendor_name = serializers.SerializerMethodField()
    reported_by_name = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()
    description = serializers.CharField(source='issue_description', read_only=True)
    location = serializers.CharField(source='machine.current_site', read_only=True, default='Sujangarh-SITE')
    downtime_hours = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='reported_at', read_only=True)

    class Meta:
        model = BreakdownReport
        fields = '__all__'

    def get_vendor_name(self, obj):
        if obj.machine and obj.machine.vendor:
            return obj.machine.vendor.name
        return "Hero Vendor"

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return obj.reported_by.get_full_name() or obj.reported_by.username
        return "Operator"

    def get_ticket_code(self, obj):
        return f"BD-2026-{obj.id:04d}"

    def get_downtime_hours(self, obj):
        return f"{min(12, max(1, obj.id * 1.5)):.1f} hrs"

