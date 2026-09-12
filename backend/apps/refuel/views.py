from rest_framework import viewsets, permissions
from .models import RefuelEntry
from .serializers import RefuelEntrySerializer
from apps.common.permissions import IsVendorAuthorized
from apps.common.vendor_scope import filter_queryset_by_vendor

class RefuelViewSet(viewsets.ModelViewSet):
    queryset = RefuelEntry.objects.all()
    serializer_class = RefuelEntrySerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        qs = filter_queryset_by_vendor(RefuelEntry.objects.all(), user, 'machine__vendor_id', request=self.request)
        machine_id = self.request.query_params.get('machine_id') or self.request.query_params.get('machine')
        if machine_id and str(machine_id).strip() and str(machine_id).lower() != 'all':
            from django.db.models import Q
            m_str = str(machine_id).strip()
            if m_str.isdigit():
                qs = qs.filter(Q(machine_id=int(m_str)) | Q(machine__code__iexact=m_str))
            else:
                qs = qs.filter(
                    Q(machine__code__iexact=m_str) |
                    Q(machine__name__icontains=m_str) |
                    Q(machine__serial_number__icontains=m_str) |
                    Q(machine__machine_chassis_no__icontains=m_str)
                )
        return qs.order_by('-refuel_date', '-id')

    def perform_create(self, serializer):
        if self.request.user and self.request.user.is_authenticated:
            serializer.save(performed_by=self.request.user)
        else:
            serializer.save()
