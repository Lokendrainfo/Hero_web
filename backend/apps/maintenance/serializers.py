from rest_framework import serializers
from .models import MaintenanceSchedule

class MaintenanceScheduleSerializer(serializers.ModelSerializer):
    machine_name = serializers.CharField(source='machine.name', read_only=True)

    class Meta:
        model = MaintenanceSchedule
        fields = '__all__'
