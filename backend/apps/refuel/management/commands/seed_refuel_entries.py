import random
from datetime import timedelta
from django.utils import timezone
from django.core.management.base import BaseCommand
from apps.machines.models import Machine
from apps.authentication.models import User
from apps.refuel.models import RefuelEntry

class Command(BaseCommand):
    help = 'Seed machine-wise refuel log entries for all machines'

    def handle(self, *args, **options):
        machines = Machine.objects.all()
        if not machines.exists():
            self.stdout.write(self.style.WARNING("No machines found in database to seed refuel entries."))
            return

        users = list(User.objects.filter(is_active=True)[:10])
        now = timezone.now()

        created_count = 0
        for m in machines:
            # Seed 2 to 4 historical refuel entries per machine
            entry_count = random.randint(2, 4)
            base_meter = m.engine_hours or 1200
            
            for i in range(entry_count):
                days_ago = (entry_count - i) * random.randint(2, 5)
                r_date = now - timedelta(days=days_ago, hours=random.randint(1, 8))
                qty = random.choice([40.0, 50.0, 60.0, 75.0, 85.0, 100.0, 120.0])
                price = 95.0
                cost = round(qty * price, 2)
                meter = base_meter - (days_ago * random.randint(4, 8))
                performed_by = random.choice(users) if users else None

                RefuelEntry.objects.create(
                    machine=m,
                    performed_by=performed_by,
                    quantity_liters=qty,
                    price_per_liter=price,
                    total_cost=cost,
                    meter_reading=max(100.0, float(meter)),
                    refuel_date=r_date,
                    notes=f"Field refueling at {m.location_name or 'Site'}"
                )
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded {created_count} refuel entries across {machines.count()} machines."))
