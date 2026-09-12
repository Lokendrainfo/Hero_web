from django.core.management.base import BaseCommand
from apps.machines.services import sync_fiberforce_machines

class Command(BaseCommand):
    help = 'Sync machines from FiberForce HDD API'

    def handle(self, *args, **options):
        result = sync_fiberforce_machines()
        if result.get('success'):
            self.stdout.write(self.style.SUCCESS(result.get('message')))
        else:
            self.stdout.write(self.style.ERROR(result.get('message')))
