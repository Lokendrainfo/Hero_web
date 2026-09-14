from rest_framework import serializers
from .models import Circle, District, Block

class CircleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Circle
        fields = ['id', 'name', 'code']

class DistrictSerializer(serializers.ModelSerializer):
    circle_name = serializers.CharField(source='circle.name', read_only=True)

    class Meta:
        model = District
        fields = ['id', 'circle', 'circle_name', 'name', 'code']

class BlockSerializer(serializers.ModelSerializer):
    district_name = serializers.CharField(source='district.name', read_only=True)
    circle_id = serializers.IntegerField(source='district.circle.id', read_only=True)

    class Meta:
        model = Block
        fields = ['id', 'district', 'district_name', 'circle_id', 'name', 'code']
