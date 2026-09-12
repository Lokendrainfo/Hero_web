import django_filters
from .models import Vendor

class VendorFilter(django_filters.FilterSet):
    class Meta:
        model = Vendor
        fields = ['is_active', 'name', 'code']
