from django.contrib.auth.models import AbstractUser
from django.db import models
from apps.vendors.models import Vendor
from apps.common.constants import ROLE_CHOICES

class User(AbstractUser):
    external_user_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    employee_id = models.CharField(max_length=50, null=True, blank=True)
    phone_number = models.CharField(max_length=30, blank=True, null=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    reporting_manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')
    role = models.CharField(max_length=100, default='VIEWER', blank=True)
    roles = models.ManyToManyField('roles.Role', through='roles.UserRole', related_name='users')
    assigned_vendors = models.ManyToManyField(Vendor, through='vendors.HeroVendorAssignment', through_fields=('user', 'vendor'), related_name='assigned_hero_users')
    is_active = models.BooleanField(default=True)
    avatar = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.external_user_id or self.username})"

    def clean(self):
        super().clean()
        if self.reporting_manager:
            from apps.common.reporting_scope import prevent_circular_reporting
            prevent_circular_reporting(self, self.reporting_manager)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def direct_reports(self):
        return self.subordinates.filter(is_active=True)

    def get_reporting_scope(self):
        from apps.common.reporting_scope import get_reporting_scope
        return get_reporting_scope(self)

    def get_role_list(self):
        role_names = list(self.roles.values_list('name', flat=True))
        if not role_names and self.role:
            role_names = [self.role]
        return role_names or ['VIEWER']

    def get_permission_codes(self):
        if self.is_superuser or 'ADMIN' in self.get_role_list():
            from apps.roles.models import Permission
            return list(Permission.objects.values_list('code', flat=True))
        
        from apps.roles.models import Permission
        perm_codes = list(Permission.objects.filter(roles__in=self.roles.all()).values_list('code', flat=True).distinct())
        if not perm_codes and self.role:
            perm_codes = list(Permission.objects.filter(roles__name__iexact=self.role).values_list('code', flat=True).distinct())
            if not perm_codes:
                perm_codes = list(Permission.objects.filter(roles__code__iexact=self.role).values_list('code', flat=True).distinct())
        
        # Only fallback to default vendor permissions if user has no assigned perms and is explicitly a VENDOR account
        roles_upper = [r.upper() for r in self.get_role_list()]
        if not perm_codes and ('VENDOR' in roles_upper or (self.vendor_id and not self.roles.exists())):
            default_vendor_perms = [
                'dashboard.view', 'machines.view', 'tracking.view', 'tasks.view',
                'team.view', 'inventory.view', 'stock.view', 'maintenance.view',
                'breakdowns.view', 'alerts.view', 'notifications.view'
            ]
            perm_codes = list(set(default_vendor_perms))

        return list(set(perm_codes))

    def get_assigned_vendors_data(self):
        if self.is_superuser or 'ADMIN' in self.get_role_list():
            from apps.vendors.models import Vendor
            return list(Vendor.objects.filter(is_active=True).values('id', 'external_vendor_id', 'name', 'code'))
        
        assignments = self.hero_vendor_assignments.filter(is_active=True, vendor__is_active=True).select_related('vendor')
        result = []
        for a in assignments:
            result.append({
                "id": a.vendor.id,
                "external_vendor_id": a.vendor.external_vendor_id or str(a.vendor.id),
                "name": a.vendor.name,
                "code": a.vendor.code or ""
            })
        return result

    def get_assigned_vendor_ids(self):
        if self.is_superuser or 'ADMIN' in self.get_role_list():
            return None # None means ALL vendors (no restriction)
        return list(self.hero_vendor_assignments.filter(is_active=True).values_list('vendor_id', flat=True))
