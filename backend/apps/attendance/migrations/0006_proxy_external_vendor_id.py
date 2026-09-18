from django.db import migrations, models


def copy_attendance_vendor(apps, schema_editor):
    AttendanceRecord = apps.get_model('attendance', 'AttendanceRecord')
    Vendor = apps.get_model('vendors', 'Vendor')
    for row in AttendanceRecord.objects.all().iterator():
        vid = getattr(row, 'vendor_id', None)
        if not vid:
            continue
        v = Vendor.objects.filter(pk=vid).first()
        if v:
            row.external_vendor_id = str(v.external_vendor_id or v.id)
            row.save(update_fields=['external_vendor_id'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('attendance', '0005_attendancerecord_reporting_manager'),
        ('vendors', '0003_vendor_hdd_hero'),
        ('authentication', '0008_proxy_string_vendor_geo'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancerecord',
            name='external_vendor_id',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.RunPython(copy_attendance_vendor, noop),
        migrations.RemoveField(model_name='attendancerecord', name='vendor'),
    ]
