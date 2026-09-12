from django.db import models

class Vendor(models.Model):
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

class HeroVendorAssignment(models.Model):
    user = models.ForeignKey('authentication.User', on_delete=models.CASCADE, related_name='hero_vendor_assignments')
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='user_assignments')
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey('authentication.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='created_vendor_assignments')
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('user', 'vendor')

    def __str__(self):
        return f"User {self.user.username} -> Vendor {self.vendor.name}"
