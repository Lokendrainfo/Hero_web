from rest_framework import serializers
from .models import Task, Hindrance

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = '__all__'


class HindranceSerializer(serializers.ModelSerializer):
    hindrance_id = serializers.CharField(required=False)
    created_by_name = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()

    class Meta:
        model = Hindrance
        fields = '__all__'

    def get_created_by_name(self, obj):
        if obj.created_by:
            name = f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
            return name or obj.created_by.username
        return 'System'

    def get_vendor_name(self, obj):
        if obj.vendor:
            return obj.vendor.name
        return obj.contractor or '—'

    def create(self, validated_data):
        if not validated_data.get('hindrance_id'):
            count = Hindrance.objects.count() + 105
            h_id = f"HND-2026-{count:03d}"
            while Hindrance.objects.filter(hindrance_id=h_id).exists():
                count += 1
                h_id = f"HND-2026-{count:03d}"
            validated_data['hindrance_id'] = h_id
        return super().create(validated_data)
