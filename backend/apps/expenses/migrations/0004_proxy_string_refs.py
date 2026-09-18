from django.db import migrations, models


def copy_expense_refs(apps, schema_editor):
    Expense = apps.get_model('expenses', 'Expense')
    Vendor = apps.get_model('vendors', 'Vendor')
    Machine = apps.get_model('machines', 'Machine')
    Task = apps.get_model('tasks', 'Task')
    for row in Expense.objects.all().iterator():
        changed = []
        if getattr(row, 'vendor_id', None):
            v = Vendor.objects.filter(pk=row.vendor_id).first()
            if v:
                row.external_vendor_id = str(v.external_vendor_id or v.id)
                changed.append('external_vendor_id')
        if getattr(row, 'machine_id', None):
            m = Machine.objects.filter(pk=row.machine_id).first()
            if m:
                row.machine_chassis_no = str(
                    getattr(m, 'machine_chassis_no', None) or getattr(m, 'serial_number', None) or m.id
                )
                changed.append('machine_chassis_no')
        if getattr(row, 'task_id', None):
            t = Task.objects.filter(pk=row.task_id).first()
            if t:
                row.external_task_id = str(getattr(t, 'external_task_id', None) or t.id)
                changed.append('external_task_id')
        if changed:
            row.save(update_fields=changed)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('expenses', '0003_expense_payment_type_expense_requires_proof_and_more'),
        ('vendors', '0003_vendor_hdd_hero'),
        ('machines', '0006_alter_machine_location_name_alter_machine_site_name'),
        ('tasks', '0002_task_due_date_str_task_fiber_category_and_more'),
        ('authentication', '0008_proxy_string_vendor_geo'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='external_vendor_id',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='machine_chassis_no',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='external_task_id',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.RunPython(copy_expense_refs, noop),
        migrations.RemoveField(model_name='expense', name='vendor'),
        migrations.RemoveField(model_name='expense', name='machine'),
        migrations.RemoveField(model_name='expense', name='task'),
    ]
