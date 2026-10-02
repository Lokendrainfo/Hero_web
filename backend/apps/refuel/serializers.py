from rest_framework import serializers
from .models import RefuelEntry

class RefuelEntrySerializer(serializers.ModelSerializer):
    machine_name = serializers.CharField(source='machine.name', read_only=True)
    machine_code = serializers.CharField(source='machine.code', read_only=True)
    machine_no = serializers.CharField(source='machine.code', read_only=True)
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RefuelEntry
        fields = '__all__'

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return obj.performed_by.get_full_name() or obj.performed_by.username
        return 'Field Operator'


from .models import FuelSquareOff

class FuelSquareOffSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()
    machine_code = serializers.CharField(source='machine.code', read_only=True)

    class Meta:
        model = FuelSquareOff
        fields = '__all__'

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return obj.performed_by.get_full_name() or obj.performed_by.username
        return 'System Operator'
