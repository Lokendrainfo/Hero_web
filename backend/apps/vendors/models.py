from django.db import models

class Vendor(models.Model):
    class Meta:
        managed = False
    """
    Legacy local Vendor table — no longer written by HERO.
    Live vendor data comes from iLync; kept for historical migrations only.
    """
    external_vendor_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=50, blank=True, null=True)
    vendor_code = models.CharField(max_length=50, blank=True, null=True)
    vendor_type = models.CharField(max_length=50, default='CONTRACTOR')
    contact_person = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=50, default='ACTIVE')
    hdd_hero = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.code or self.external_vendor_id})"
