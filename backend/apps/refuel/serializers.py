from rest_framework import serializers
from .models import RefuelEntry


class RefuelEntrySerializer(serializers.ModelSerializer):
    machine_name = serializers.CharField(source='machine_chassis_no', read_only=True)
    machine_code = serializers.CharField(source='machine_chassis_no', read_only=True)
    machine_no = serializers.CharField(source='machine_chassis_no', read_only=True)
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RefuelEntry
        fields = [
            'id', 'quantity_liters', 'price_per_liter', 'total_cost', 'meter_reading',
            'refuel_date', 'notes', 'machine_chassis_no',
            'machine_name', 'machine_code', 'machine_no', 'performed_by_name',
        ]

    def get_performed_by_name(self, obj):
        return 'Sensor'
