from django.apps import AppConfig


class MaintenanceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.maintenance'
    label = 'pm_maintenance'
    verbose_name = 'Machine Preventive Maintenance'
