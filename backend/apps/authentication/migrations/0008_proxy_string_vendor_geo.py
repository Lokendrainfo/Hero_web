# Phase 1: string vendor/geo fields on User, then drop Vendor/geo FKs

import django.db.models.deletion
from django.db import migrations, models


def copy_vendor_and_geo(apps, schema_editor):
    User = apps.get_model('authentication', 'User')
    Vendor = apps.get_model('vendors', 'Vendor')
    try:
        HeroVendorAssignment = apps.get_model('vendors', 'HeroVendorAssignment')
    except LookupError:
        HeroVendorAssignment = None

    for u in User.objects.all().iterator():
        assigned = list(u.assigned_vendor_ids or []) if u.assigned_vendor_ids else []

        if getattr(u, 'vendor_id', None):
            v = Vendor.objects.filter(pk=u.vendor_id).first()
            if v:
                ext = str(v.external_vendor_id or v.id)
                u.external_vendor_id = ext
                if ext not in assigned:
                    assigned.append(ext)

        if HeroVendorAssignment is not None:
            for a in HeroVendorAssignment.objects.filter(user_id=u.id, is_active=True):
                v = Vendor.objects.filter(pk=a.vendor_id).first()
                if not v:
                    continue
                ext = str(v.external_vendor_id or v.id)
                if ext not in assigned:
                    assigned.append(ext)
                if not u.external_vendor_id:
                    u.external_vendor_id = ext

        # FK integer columns → string copies
        if getattr(u, 'selected_circle_id', None):
            u.selected_circle_id_str = str(u.selected_circle_id)
        if getattr(u, 'selected_district_id', None):
            u.selected_district_id_str = str(u.selected_district_id)
        if getattr(u, 'selected_block_id', None):
            u.selected_block_id_str = str(u.selected_block_id)

        u.assigned_vendor_ids = assigned
        u.save()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('authentication', '0007_user_advance_scope_type_user_selected_block_and_more'),
        ('vendors', '0003_vendor_hdd_hero'),
        ('common', '0002_block_updated_at_circle_updated_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='external_vendor_id',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='assigned_vendor_ids',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='user',
            name='selected_circle_id_str',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='selected_district_id_str',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='selected_block_id_str',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.RunPython(copy_vendor_and_geo, noop),
        migrations.RemoveField(model_name='user', name='assigned_vendors'),
        migrations.RemoveField(model_name='user', name='vendor'),
        migrations.RemoveField(model_name='user', name='selected_circle'),
        migrations.RemoveField(model_name='user', name='selected_district'),
        migrations.RemoveField(model_name='user', name='selected_block'),
        migrations.RenameField(model_name='user', old_name='selected_circle_id_str', new_name='selected_circle_id'),
        migrations.RenameField(model_name='user', old_name='selected_district_id_str', new_name='selected_district_id'),
        migrations.RenameField(model_name='user', old_name='selected_block_id_str', new_name='selected_block_id'),
    ]
