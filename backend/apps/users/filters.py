import django_filters
from apps.authentication.models import User

class UserFilter(django_filters.FilterSet):
    class Meta:
        model = User
        fields = ['role', 'vendor', 'is_active']
