from django.core.management.base import BaseCommand

from apps.maintenance.services.unified_config_service import ensure_calendar_frequencies_and_roles


class Command(BaseCommand):
    help = "Seeds Daily, Weekly, Monthly, Quarterly, Yearly PM frequencies and role mappings in machine_pm_db."

    def handle(self, *args, **options):
        freqs = ensure_calendar_frequencies_and_roles()
        self.stdout.write(
            self.style.SUCCESS(f"Ensured calendar frequencies: {', '.join(sorted(freqs.keys()))}")
        )
