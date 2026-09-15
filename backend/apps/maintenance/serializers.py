from rest_framework import serializers
from .models import MaintenanceSchedule

class MaintenanceScheduleSerializer(serializers.ModelSerializer):
    machine_code = serializers.CharField(source='machine.name', read_only=True)
    machine_name = serializers.CharField(source='machine.name', read_only=True)
    vendor_name = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceSchedule
        fields = '__all__'

    def get_vendor_name(self, obj):
        if obj.machine and obj.machine.vendor:
            return obj.machine.vendor.name
        return "HERO INFRASTRUCTURE"

    def get_location(self, obj):
        if obj.machine:
            return getattr(obj.machine, 'site_name', getattr(obj.machine, 'location_name', 'Sujangarh-SITE'))
        return 'Sujangarh-SITE'
