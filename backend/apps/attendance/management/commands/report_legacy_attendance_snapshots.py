from django.core.management.base import BaseCommand
from apps.attendance.models import AttendanceRecord

class Command(BaseCommand):
    help = "Identify and report old AttendanceRecords where snapshot fields are NULL without overwriting them."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Scanning for legacy AttendanceRecords with missing identity snapshots..."))

        total = AttendanceRecord.objects.count()
        missing_snapshots = AttendanceRecord.objects.filter(
            external_user_id_snapshot__isnull=True
        ).select_related('user', 'vendor').order_by('date', 'id')

        count_missing = missing_snapshots.count()

        self.stdout.write(f"Total Attendance Records: {total}")
        self.stdout.write(f"Records with missing snapshots: {count_missing}")

        if count_missing == 0:
            self.stdout.write(self.style.SUCCESS("All attendance records have populated identity snapshots."))
            return

        self.stdout.write("\nSummary of records requiring historical reconstruction:")
        self.stdout.write("-" * 90)
        self.stdout.write(f"{'Att ID':<8} | {'Date':<12} | {'User ID':<8} | {'Username':<18} | {'Vendor Name':<28} | {'Status'}")
        self.stdout.write("-" * 90)

        for rec in missing_snapshots[:50]:
            u_name = rec.user.username if rec.user else 'Unknown'
            v_name = rec.vendor.name if rec.vendor else (rec.user.vendor.name if rec.user and rec.user.vendor else 'No Vendor')
            self.stdout.write(f"{rec.id:<8} | {str(rec.date):<12} | {rec.user_id:<8} | {u_name:<18} | {v_name[:28]:<28} | {rec.status}")

        if count_missing > 50:
            self.stdout.write(f"... and {count_missing - 50} more records.")

        self.stdout.write("-" * 90)
        self.stdout.write(self.style.WARNING(
            f"IMPORTANT: {count_missing} records identified. Per integrity rules, these records have NOT been modified or overwritten."
        ))
