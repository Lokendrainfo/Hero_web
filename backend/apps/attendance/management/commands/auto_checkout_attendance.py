from django.core.management.base import BaseCommand
from apps.attendance.services import auto_checkout_overnight_records

class Command(BaseCommand):
    help = 'Automatically checks out unclosed attendance records past 05:00 AM IST of the following morning'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Running 05:00 AM IST Auto Check-Out task...'))
        updated_count = auto_checkout_overnight_records()
        self.stdout.write(self.style.SUCCESS(f'Successfully auto checked-out {updated_count} unclosed attendance record(s).'))
