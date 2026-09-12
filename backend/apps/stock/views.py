from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import StockItem
from .serializers import StockItemSerializer
from apps.common.responses import success_response
from apps.integrations.ilync.client import IlyncClient

from apps.common.vendor_scope import filter_queryset_by_vendor

class StockViewSet(viewsets.ModelViewSet):
    queryset = StockItem.objects.all()
    serializer_class = StockItemSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        user = self.request.user
        return filter_queryset_by_vendor(StockItem.objects.all(), user, 'vendor_id', request=self.request)

    @action(detail=False, methods=['get', 'post'], url_path='item/search')
    def search_items(self, request):
        query = request.data.get('query', '') if request.method == 'POST' else request.query_params.get('query', '')
        client = IlyncClient()
        data = client.search_stock_items(query=query)
        return success_response(data=data)

    @action(detail=False, methods=['get', 'post'], url_path='balance/search')
    def search_balance(self, request):
        query = request.data.get('query', '') if request.method == 'POST' else request.query_params.get('query', '')
        client = IlyncClient()
        data = client.search_stock_balance(query=query)
        return success_response(data=data)

    @action(detail=False, methods=['get', 'post'], url_path='issue/search')
    def search_issues(self, request):
        query = request.data.get('query', '') if request.method == 'POST' else request.query_params.get('query', '')
        client = IlyncClient()
        data = client.search_stock_issues(query=query)
        return success_response(data=data)
