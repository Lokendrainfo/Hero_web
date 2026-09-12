import dotenv
dotenv.load_dotenv()
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.machines.models import Machine
from apps.vendors.models import Vendor
from apps.alerts.models import Alert
from apps.breakdown.models import BreakdownReport
from apps.authentication.models import User

admin_u = User.objects.filter(is_superuser=True).first()
machines = list(Machine.objects.filter(vendor__isnull=False))
print('Found machines with vendor:', len(machines))

BreakdownReport.objects.all().delete()
Alert.objects.all().delete()

bd_types = [
    ('Mud pump pressure drop during deep trenching. Hydraulic pressure valve replacement required.', 'HIGH', 'IN_PROGRESS'),
    ('Cooling system temperature warning during prolonged drilling operation. Radiator flushed.', 'MEDIUM', 'RESOLVED'),
    ('Hydraulic hose leak near primary carriage motor assembly. Hose replaced and fluid refilled.', 'MEDIUM', 'RESOLVED'),
    ('Radiator fan belt snapped under heavy load. Maintenance crew dispatched with replacement belt.', 'HIGH', 'OPEN'),
    ('Drill rod thread inspection required before starting Ring 02 HDD pullback section.', 'LOW', 'OPEN'),
    ('Engine oil pressure sensor error logged during morning startup routine.', 'HIGH', 'IN_PROGRESS'),
    ('Transmission gear selector linkage loose. Fasteners tightened and recalibrated.', 'LOW', 'RESOLVED')
]

for idx, m in enumerate(machines):
    bd_data = bd_types[idx % len(bd_types)]
    BreakdownReport.objects.create(
        machine=m,
        issue_description=bd_data[0],
        severity=bd_data[1],
        status=bd_data[2],
        reported_by=admin_u
    )

alert_types = [
    ('Low Fuel Level Warning', 'Fuel level reached 20% on machine. Please schedule refuel.', 'CRITICAL', 'LOW_FUEL'),
    ('PM Maintenance Due Soon', 'Scheduled 500-hour service inspection due in 25 engine hours.', 'WARNING', 'MAINTENANCE_DUE'),
    ('Hydraulic Pressure Warning', 'Hydraulic pressure fluctuation detected during operation.', 'WARNING', 'HYDRAULIC_WARNING'),
    ('Engine Overheat Warning', 'Coolant temperature reached 98°C during operation.', 'CRITICAL', 'ENGINE_OVERHEAT'),
    ('GPS Signal Restored', 'Telemetry signal restored and location synced with server.', 'INFO', 'GPS_ONLINE')
]

for idx, m in enumerate(machines):
    al_data = alert_types[idx % len(alert_types)]
    Alert.objects.create(
        vendor=m.vendor,
        machine=m,
        title=f"{al_data[0]} - {m.name}",
        message=f"{al_data[1]} ({m.name})",
        alert_severity=al_data[2],
        alert_type=al_data[3],
        is_read=False if idx % 2 == 0 else True
    )

print('Real Breakdowns in DB now:', BreakdownReport.objects.count())
print('Real Alerts in DB now:', Alert.objects.count())
