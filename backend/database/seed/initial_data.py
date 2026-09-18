import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.vendors.models import Vendor
from apps.authentication.models import User
from apps.machines.models import Machine
from apps.alerts.models import Alert
from apps.tasks.models import Task

def seed_all():
    print("Seeding Hero Web screenshot screen data...")
    hero_vendor, _ = Vendor.objects.get_or_create(name="HERO INFRASTRUCTURE", code="HERO", contact_person="John Doe", email="admin@hero.com")
    gk_vendor, _ = Vendor.objects.get_or_create(name="GURUKRIPA LOGISTICS", code="GURUKRIPA", contact_person="Rajesh Kumar", email="admin@gurukripa.com")

    # Superuser & Admins
    admin, _ = User.objects.get_or_create(username="admin", defaults={"email": "admin@hero.com"})
    admin.set_password("admin123")
    admin.first_name = "Admin"
    admin.last_name = ""
    admin.vendor = hero_vendor
    admin.role = "ADMIN"
    admin.is_superuser = True
    admin.is_staff = True
    admin.save()

    hero_admin, _ = User.objects.get_or_create(username="hero_admin", defaults={"email": "hero_admin@hero.com"})
    hero_admin.set_password("hero123")
    hero_admin.first_name = "Hero"
    hero_admin.last_name = "Admin"
    hero_admin.vendor = hero_vendor
    hero_admin.role = "VENDOR_ADMIN"
    hero_admin.save()

    gk_admin, _ = User.objects.get_or_create(username="gk_admin", defaults={"email": "gk_admin@gurukripa.com"})
    gk_admin.set_password("gk123")
    gk_admin.first_name = "Gurukripa"
    gk_admin.last_name = "Admin"
    gk_admin.vendor = gk_vendor
    gk_admin.role = "VENDOR_ADMIN"
    gk_admin.save()

    # Sync 23 real FiberForce HDD machines
    from apps.machines.services import sync_fiberforce_machines
    sync_res = sync_fiberforce_machines()
    print(f"FiberForce machines seed result: {sync_res}")

    m0 = Machine.objects.filter(category='HDD').first()

    # Seed Alerts for A600 HDD
    Alert.objects.all().delete()
    Alert.objects.create(
        vendor=hero_vendor,
        machine=m0,
        alert_type="LOW_FUEL",
        title="Low Fuel Alert",
        message="Fuel level is below 20%",
        time_ago_str="18m ago",
        alert_severity="CRITICAL"
    )
    Alert.objects.create(
        vendor=hero_vendor,
        machine=m0,
        alert_type="PREVENTIVE_MAINTENANCE",
        title="PM Due Soon",
        message="Next PM due on 28 Aug 2025",
        time_ago_str="2h ago",
        alert_severity="WARNING"
    )
    Alert.objects.create(
        vendor=hero_vendor,
        machine=m0,
        alert_type="OFFLINE_WARNING",
        title="Machine Offline",
        message="Machine was offline for 2h",
        time_ago_str="20h ago",
        alert_severity="INFO"
    )

    print("Initial screenshot seed completed successfully.")

if __name__ == "__main__":
    seed_all()
