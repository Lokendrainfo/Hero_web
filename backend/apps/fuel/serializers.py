from rest_framework import serializers
from .models import FuelCard, FuelLog

class FuelCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = FuelCard
        fields = '__all__'

class FuelLogSerializer(serializers.ModelSerializer):
    machine_name = serializers.CharField(source='machine.name', read_only=True)

    class Meta:
        model = FuelLog
        fields = '__all__'
