"""
Drop foreign-tech tables. HERO persists only Attendance, Expenses, Internal Users, Roles.
Upstream data (FiberForce / iLync) is live-proxied — never stored here.
"""

from django.db import migrations


FOREIGN_TABLES = [
    'tracking_telemetrydata',
    'refuel_refuelentry',
    'fuel_fuellog',
    'fuel_fuelcard',
    'breakdown_breakdownreport',
    'alerts_alert',
    'maintenance_maintenanceschedule',
    'notifications_notification',
    'stock_stockitem',
    'tasks_task',
    'machines_machine',
    'vendors_vendor',
    'common_block',
    'common_district',
    'common_circle',
]


def drop_foreign_tables(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        # SQLite needs FK off for unordered drops
        try:
            cursor.execute('PRAGMA foreign_keys=OFF')
        except Exception:
            pass
        for table in FOREIGN_TABLES:
            try:
                cursor.execute(f'DROP TABLE IF EXISTS {table}')
            except Exception:
                pass
        try:
            cursor.execute('PRAGMA foreign_keys=ON')
        except Exception:
            pass


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('vendors', '0004_delete_herovendorassignment'),
        ('machines', '0006_alter_machine_location_name_alter_machine_site_name'),
        ('tasks', '0002_task_due_date_str_task_fiber_category_and_more'),
        ('tracking', '0002_alter_telemetrydata_options'),
        ('refuel', '0002_alter_refuelentry_options_and_more'),
        ('fuel', '0001_initial'),
        ('breakdown', '0001_initial'),
        ('alerts', '0002_alert_alert_severity_alert_time_ago_str_and_more'),
        ('maintenance', '0001_initial'),
        ('notifications', '0001_initial'),
        ('stock', '0001_initial'),
        ('common', '0002_block_updated_at_circle_updated_at_and_more'),
        ('attendance', '0006_proxy_external_vendor_id'),
        ('expenses', '0004_proxy_string_refs'),
        ('authentication', '0008_proxy_string_vendor_geo'),
    ]

    operations = [
        migrations.RunPython(drop_foreign_tables, noop),
    ]
