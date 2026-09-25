from django.core.management.base import BaseCommand
from apps.attendance.services import auto_checkout_overnight_records, auto_store_unmarked_records

class Command(BaseCommand):
    help = 'Automatically checks out unclosed attendance records past 12:00 AM (midnight) IST of the next day, and stores NOT_MARKED records for unclosed past dates.'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='Target date (YYYY-MM-DD) to store NOT_MARKED records for', default=None)

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Running 12:00 AM IST Auto Check-Out & Store Unmarked Records task...'))
        updated_count = auto_checkout_overnight_records()
        self.stdout.write(self.style.SUCCESS(f'Successfully auto checked-out {updated_count} unclosed attendance record(s).'))

        target_date = options.get('date')
        if target_date:
            stored_count = auto_store_unmarked_records(target_date=target_date)
            self.stdout.write(self.style.SUCCESS(f'Successfully auto-stored {stored_count} NOT_MARKED record(s) for date {target_date}.'))
