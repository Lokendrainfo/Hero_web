from rest_framework import serializers
from .models import Alert

class AlertSerializer(serializers.ModelSerializer):
    machine_code = serializers.CharField(source='machine.name', read_only=True, default='')
    vendor_name = serializers.CharField(source='vendor.name', read_only=True, default='')
    severity = serializers.CharField(source='alert_severity', read_only=True)
    timestamp = serializers.CharField(source='time_ago_str', read_only=True)

    class Meta:
        model = Alert
        fields = '__all__'

