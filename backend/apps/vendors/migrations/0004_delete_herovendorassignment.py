# Drop HeroVendorAssignment — replaced by User.assigned_vendor_ids JSON.

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('vendors', '0003_vendor_hdd_hero'),
        ('authentication', '0008_proxy_string_vendor_geo'),
    ]

    operations = [
        migrations.DeleteModel(name='HeroVendorAssignment'),
    ]
