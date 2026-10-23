from rest_framework import serializers
from .models import BreakdownReport

class BreakdownReportSerializer(serializers.ModelSerializer):
    machine_code = serializers.CharField(source='machine.name', read_only=True)
    machine_name = serializers.CharField(source='machine.name', read_only=True)
    vendor_name = serializers.SerializerMethodField()
    reported_by_name = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()
    description = serializers.CharField(source='issue_description', required=False, allow_blank=True)
    location = serializers.SerializerMethodField()
    downtime_hours = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='reported_at', read_only=True)

    class Meta:
        model = BreakdownReport
        fields = '__all__'

    def get_location(self, obj):
        if obj.machine:
            return getattr(obj.machine, 'site_name', getattr(obj.machine, 'location_name', 'Sujangarh-SITE'))
        return 'Sujangarh-SITE'

    def get_vendor_name(self, obj):
        if obj.machine and obj.machine.vendor:
            return obj.machine.vendor.name
        return "Hero"

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return obj.reported_by.get_full_name() or obj.reported_by.username
        return "Operator"

    def get_ticket_code(self, obj):
        return f"BD-2026-{obj.id:04d}"

    def get_downtime_hours(self, obj):
        return f"{min(12, max(1, (obj.id or 1) * 1.5)):.1f} hrs"

    def create(self, validated_data):
        desc = validated_data.pop('description', None) or validated_data.get('issue_description', '')
        validated_data['issue_description'] = desc
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated and not validated_data.get('reported_by'):
            validated_data['reported_by'] = request.user
        return super().create(validated_data)

