from rest_framework import viewsets, permissions
from .models import FuelCard, FuelLog
from .serializers import FuelCardSerializer, FuelLogSerializer
from apps.common.permissions import IsVendorAuthorized

from apps.common.vendor_scope import filter_queryset_by_vendor

class FuelLogViewSet(viewsets.ModelViewSet):
    queryset = FuelLog.objects.all()
    serializer_class = FuelLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        
        # Auto-sync RefuelEntry records if FuelLog count is less than RefuelEntry count
        try:
            from apps.refuel.models import RefuelEntry
            refuel_cnt = RefuelEntry.objects.count()
            fuel_cnt = FuelLog.objects.count()
            if fuel_cnt < refuel_cnt:
                for r in RefuelEntry.objects.select_related('machine', 'performed_by').all():
                    fuel_dt = r.refuel_date.date() if hasattr(r.refuel_date, 'date') else r.refuel_date
                    perf_name = r.performed_by.get_full_name() if (r.performed_by and hasattr(r.performed_by, 'get_full_name')) else 'Operator'
                    site_info = getattr(r.machine, 'location', 'Site')
                    rem = r.notes or f"Field refueling at {site_info} by {perf_name}"
                    FuelLog.objects.get_or_create(
                        machine=r.machine,
                        fuel_date=fuel_dt,
                        liters=r.quantity_liters,
                        defaults={
                            'cost': r.total_cost,
                            'remarks': rem
                        }
                    )
        except Exception as e:
            print(f"[FuelLogViewSet] Auto sync error: {e}")

        qs = filter_queryset_by_vendor(FuelLog.objects.select_related('machine').all(), user, 'machine__vendor_id', request=self.request)
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
                    Q(machine__external_machine_id=m_str)
                )
        return qs.order_by('-fuel_date', '-id')

class FuelCardViewSet(viewsets.ModelViewSet):
    queryset = FuelCard.objects.all()
    serializer_class = FuelCardSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def get_queryset(self):
        user = self.request.user
        return filter_queryset_by_vendor(FuelCard.objects.all(), user, 'vendor_id', request=self.request)
