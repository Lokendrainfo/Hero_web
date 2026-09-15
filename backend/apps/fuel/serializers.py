from rest_framework import serializers
from .models import FuelCard, FuelLog

class FuelCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = FuelCard
        fields = '__all__'

class FuelLogSerializer(serializers.ModelSerializer):
    machine_name = serializers.SerializerMethodField()
    machine_no = serializers.SerializerMethodField()
    machine_details = serializers.SerializerMethodField()

    class Meta:
        model = FuelLog
        fields = '__all__'

    def get_machine_name(self, obj):
        if obj.machine:
            return obj.machine.code or obj.machine.name or f"MAC-{obj.machine.id}"
        return 'HDD Machine'

    def get_machine_no(self, obj):
        if obj.machine:
            return obj.machine.code or obj.machine.name or f"MAC-{obj.machine.id}"
        return ''

    def get_machine_details(self, obj):
        if obj.machine:
            return {
                "id": obj.machine.id,
                "code": obj.machine.code,
                "name": obj.machine.name,
                "model_name": getattr(obj.machine, 'name', getattr(obj.machine, 'model', 'APOLLO A600 V2')),
                "chassis_number": getattr(obj.machine, 'serial_number', f"CH-{obj.machine.id}")
            }
        return {}
