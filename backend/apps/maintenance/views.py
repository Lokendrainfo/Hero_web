from rest_framework import viewsets, permissions
from .models import MaintenanceSchedule
from .serializers import MaintenanceScheduleSerializer
from apps.common.permissions import IsVendorAuthorized

from apps.common.vendor_scope import filter_queryset_by_vendor

class MaintenanceViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceSchedule.objects.all()
    serializer_class = MaintenanceScheduleSerializer
    permission_classes = [permissions.IsAuthenticated, IsVendorAuthorized]

    def seed_initial_maintenance(self):
        from apps.machines.models import Machine
        from datetime import date, timedelta
        machines = list(Machine.objects.all())
        if not machines:
            return
        
        sample_types = ['ROUTINE_SERVICE', '500H_ENGINE_CHECK', 'HYDRAULIC_FLUSH', 'DRILL_ROD_INSPECTION', 'PREVENTIVE_MAINTENANCE']
        sample_titles = [
            '500 Hour Engine Oil & Filter Service',
            'Hydraulic System High Pressure Valve Check',
            'Mud Pump Seal & Diaphragm Replacement',
            'Drill Rod Thread Lubrication & Inspection',
            'Cooling System Radiator Flush & Hose Check',
            'Carriage Motor Gearbox Fluid Replacement',
            'Electrical Harness & Battery Voltage Audit',
            'Track Tensioner & Undercarriage Inspection'
        ]
        sample_statuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE']
        
        for i, m in enumerate(machines[:15]):
            MaintenanceSchedule.objects.create(
                machine=m,
                title=sample_titles[i % len(sample_titles)],
                maintenance_type=sample_types[i % len(sample_types)],
                scheduled_date=date.today() + timedelta(days=(i * 3 - 10)),
                completed_date=date.today() - timedelta(days=2) if i % 3 == 0 else None,
                status=sample_statuses[i % len(sample_statuses)],
                cost=15000.00 + (i * 2500),
                details=f"Routine PM service scheduled for {m.name} at site {m.site_name}."
            )

    def get_queryset(self):
        if MaintenanceSchedule.objects.count() == 0:
            try:
                self.seed_initial_maintenance()
            except Exception as e:
                print("Error seeding maintenance:", e)

        user = self.request.user
        q_params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        requested_vendor = q_params.get('vendor_id') or q_params.get('vendor')

        if (user.is_superuser or 'ADMIN' in [str(r).upper() for r in user.get_role_list()]) and (not requested_vendor or str(requested_vendor).strip().lower() in ['all', 'undefined', 'null', 'none', '']):
            return MaintenanceSchedule.objects.all().order_by('-scheduled_date', '-id')

        qs = filter_queryset_by_vendor(MaintenanceSchedule.objects.all(), user, 'machine__vendor_id', request=self.request)
        return qs.order_by('-scheduled_date', '-id')
