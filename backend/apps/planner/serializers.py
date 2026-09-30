from rest_framework import serializers

class PlanRequestSerializer(serializers.Serializer):
    plan_id = serializers.CharField(required=True, max_length=255, trim_whitespace=True)

class MapLayersQuerySerializer(serializers.Serializer):
    includeSummary = serializers.BooleanField(default=True, required=False)
    source = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=['DTP_IMPORT', 'PLANNER', 'LAND_BASED_SURVEY']
    )
