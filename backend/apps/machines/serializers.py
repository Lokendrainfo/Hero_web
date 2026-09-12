from rest_framework import serializers
from .models import Machine

class MachineSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True, default='')
    vendorName = serializers.CharField(source='vendor.name', read_only=True, default='')
    vendorId = serializers.SerializerMethodField()
    vendor_id = serializers.SerializerMethodField()
    externalVendorId = serializers.CharField(source='vendor.external_vendor_id', read_only=True, default='')
    machineNo = serializers.CharField(source='machine_chassis_no', read_only=True, default='')
    machine_no = serializers.CharField(source='machine_chassis_no', read_only=True, default='')
    engineNo = serializers.CharField(source='engine_no', read_only=True, default='')
    model = serializers.CharField(source='model_code', read_only=True, default='')

    class Meta:
        model = Machine
        fields = '__all__'

    def get_vendorId(self, obj):
        if obj.vendor and obj.vendor.external_vendor_id:
            return obj.vendor.external_vendor_id
        return str(obj.vendor_id) if obj.vendor_id else ''

    def get_vendor_id(self, obj):
        if obj.vendor and obj.vendor.external_vendor_id:
            return obj.vendor.external_vendor_id
        return str(obj.vendor_id) if obj.vendor_id else ''

