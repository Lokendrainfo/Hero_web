from rest_framework import generics, permissions
from .models import Circle, District, Block
from .serializers import CircleSerializer, DistrictSerializer, BlockSerializer

class CircleListView(generics.ListAPIView):
    queryset = Circle.objects.all()
    serializer_class = CircleSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

class DistrictListView(generics.ListAPIView):
    serializer_class = DistrictSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        qs = District.objects.select_related('circle').all()
        circle_id = self.request.query_params.get('circle_id')
        if circle_id:
            qs = qs.filter(circle_id=circle_id)
        return qs

class BlockListView(generics.ListAPIView):
    serializer_class = BlockSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        qs = Block.objects.select_related('district', 'district__circle').all()
        district_id = self.request.query_params.get('district_id')
        if district_id:
            qs = qs.filter(district_id=district_id)
        return qs

class SyncGeographyView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        from .geography_sync import sync_geography_from_ilync
        from apps.common.responses import success_response, error_response
        res = sync_geography_from_ilync()
        if res.get("success"):
            return success_response(data=res, message="Geography master (Circles, Districts, Blocks) successfully synchronized from iLync API.")
        return error_response(message=res.get("error", "Failed to sync geography from iLync API."))

