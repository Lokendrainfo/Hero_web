from rest_framework import serializers
from .models import TelemetryData

class TelemetryDataSerializer(serializers.ModelSerializer):
    machine_name = serializers.CharField(source='machine.name', read_only=True)

    class Meta:
        model = TelemetryData
        fields = '__all__'
