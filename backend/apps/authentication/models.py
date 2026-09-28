from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.exceptions import ValidationError
from apps.vendors.models import Vendor
from apps.common.constants import ROLE_CHOICES

class User(AbstractUser):
    USER_TYPE_CHOICES = [
        ('NORMAL', 'Normal'),
        ('ADVANCE', 'Advance'),
    ]
    ADVANCE_SCOPE_CHOICES = [
        ('CIRCLE', 'Circle'),
        ('DISTRICT', 'District'),
        ('BLOCK', 'Block'),
    ]

    external_user_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    employee_id = models.CharField(max_length=50, null=True, blank=True)
    phone_number = models.CharField(max_length=30, blank=True, null=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    reporting_manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')
    role = models.CharField(max_length=100, default='VIEWER', blank=True)
    roles = models.ManyToManyField('roles.Role', through='roles.UserRole', related_name='users')
    assigned_vendors = models.ManyToManyField(Vendor, through='vendors.HeroVendorAssignment', through_fields=('user', 'vendor'), related_name='assigned_hero_users')
    # Geography Access Scope fields
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='NORMAL')
    advance_scope_type = models.CharField(max_length=20, choices=ADVANCE_SCOPE_CHOICES, blank=True, null=True)
    selected_circle = models.ForeignKey('common.Circle', on_delete=models.SET_NULL, null=True, blank=True, related_name='advance_users')
    selected_district = models.ForeignKey('common.District', on_delete=models.SET_NULL, null=True, blank=True, related_name='advance_users')
    selected_block = models.ForeignKey('common.Block', on_delete=models.SET_NULL, null=True, blank=True, related_name='advance_users')

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

        if self.user_type == 'NORMAL' or not self.user_type:
            self.user_type = 'NORMAL'
            self.advance_scope_type = None
            self.selected_circle = None
            self.selected_district = None
            self.selected_block = None
        elif self.user_type == 'ADVANCE':
            if not self.advance_scope_type or self.advance_scope_type not in ['CIRCLE', 'DISTRICT', 'BLOCK']:
                raise ValidationError({'advance_scope_type': "Access Scope is required for Advance users (CIRCLE, DISTRICT, or BLOCK)."})

            if self.advance_scope_type == 'CIRCLE':
                if not self.selected_circle:
                    raise ValidationError({'selected_circle': "Circle selection is required when Access Scope is CIRCLE."})
                self.selected_district = None
                self.selected_block = None

            elif self.advance_scope_type == 'DISTRICT':
                if not self.selected_circle:
                    raise ValidationError({'selected_circle': "Circle selection is required when Access Scope is DISTRICT."})
                if not self.selected_district:
                    raise ValidationError({'selected_district': "District selection is required when Access Scope is DISTRICT."})
                if self.selected_district.circle_id != self.selected_circle_id:
                    raise ValidationError({'selected_district': f"District '{self.selected_district.name}' does not belong to Circle '{self.selected_circle.name}'."})
                self.selected_block = None

            elif self.advance_scope_type == 'BLOCK':
                if not self.selected_circle:
                    raise ValidationError({'selected_circle': "Circle selection is required when Access Scope is BLOCK."})
                if not self.selected_district:
                    raise ValidationError({'selected_district': "District selection is required when Access Scope is BLOCK."})
                if not self.selected_block:
                    raise ValidationError({'selected_block': "Block selection is required when Access Scope is BLOCK."})
                if self.selected_district.circle_id != self.selected_circle_id:
                    raise ValidationError({'selected_district': f"District '{self.selected_district.name}' does not belong to Circle '{self.selected_circle.name}'."})
                if self.selected_block.district_id != self.selected_district_id:
                    raise ValidationError({'selected_block': f"Block '{self.selected_block.name}' does not belong to District '{self.selected_district.name}'."})

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
                'breakdowns.view', 'alerts.view', 'notifications.view',
                'machine_shift.view', 'machine_shift.create',
                'refuel.view', 'refuel.create'
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

        # Include direct vendor FK fallback if not already in result
        if getattr(self, 'vendor', None) and getattr(self.vendor, 'is_active', True):
            if not any(r['id'] == self.vendor.id for r in result):
                result.append({
                    "id": self.vendor.id,
                    "external_vendor_id": self.vendor.external_vendor_id or str(self.vendor.id),
                    "name": self.vendor.name,
                    "code": self.vendor.code or ""
                })
        return result

    def get_assigned_vendor_ids(self):
        if self.is_superuser or 'ADMIN' in self.get_role_list():
            return None # None means ALL vendors (no restriction)
        v_ids = list(self.hero_vendor_assignments.filter(is_active=True).values_list('vendor_id', flat=True))
        if self.vendor_id and self.vendor_id not in v_ids:
            v_ids.append(self.vendor_id)
        return v_ids


class APIKey(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_keys', null=True, blank=True)
    name = models.CharField(max_length=100, default='External Partner Key')
    key = models.CharField(max_length=128, unique=True, db_index=True)
    prefix = models.CharField(max_length=16, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    # Webhook integration
    webhook_url = models.CharField(max_length=500, blank=True, null=True)
    webhook_enabled = models.BooleanField(default=False)
    webhook_secret = models.CharField(max_length=64, blank=True, null=True)

    class Meta:
        ordering = ['-created_at']

    @classmethod
    def generate_key_string(cls, prefix='hero_live_'):
        import secrets
        return f"{prefix}{secrets.token_urlsafe(32)}"

    @property
    def masked_key(self):
        if not self.key or len(self.key) < 12:
            return "••••••••••••"
        return f"{self.key[:10]}...{self.key[-4:]}"

    def __str__(self):
        return f"{self.name} ({self.masked_key})"

