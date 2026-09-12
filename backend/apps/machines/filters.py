import django_filters
from .models import Machine

class MachineFilter(django_filters.FilterSet):
    class Meta:
        model = Machine
        fields = ['vendor', 'status', 'category']
