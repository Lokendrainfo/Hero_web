from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.exceptions import ValidationError
from apps.common.constants import ROLE_CHOICES


class User(AbstractUser):
    """
    HERO-owned internal user only.
    External (iLync) users are not persisted — served live from APIs.
    Vendor / geography references are string IDs resolved live from upstream.
    """
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

    # Live iLync vendor scoping (no local Vendor FK)
    external_vendor_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    assigned_vendor_ids = models.JSONField(default=list, blank=True)

    reporting_manager = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates'
    )
    role = models.CharField(max_length=100, default='VIEWER', blank=True)
    roles = models.ManyToManyField('roles.Role', through='roles.UserRole', related_name='users')

    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='NORMAL')
    advance_scope_type = models.CharField(max_length=20, choices=ADVANCE_SCOPE_CHOICES, blank=True, null=True)
    # String IDs (live geography from APIs / masters) — no Circle/District/Block FKs
    selected_circle_id = models.CharField(max_length=100, blank=True, null=True)
    selected_district_id = models.CharField(max_length=100, blank=True, null=True)
    selected_block_id = models.CharField(max_length=100, blank=True, null=True)

    is_active = models.BooleanField(default=True)
    avatar = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.external_user_id or self.username})"

    @property
    def is_internal(self):
        return not bool(str(self.external_user_id or '').strip())

    def clean(self):
        super().clean()
        if self.reporting_manager:
            from apps.common.reporting_scope import prevent_circular_reporting
            prevent_circular_reporting(self, self.reporting_manager)

        if self.user_type == 'NORMAL' or not self.user_type:
            self.user_type = 'NORMAL'
            self.advance_scope_type = None
            self.selected_circle_id = None
            self.selected_district_id = None
            self.selected_block_id = None
        elif self.user_type == 'ADVANCE':
            if not self.advance_scope_type or self.advance_scope_type not in ['CIRCLE', 'DISTRICT', 'BLOCK']:
                raise ValidationError({
                    'advance_scope_type': "Access Scope is required for Advance users (CIRCLE, DISTRICT, or BLOCK)."
                })
            if self.advance_scope_type == 'CIRCLE':
                if not self.selected_circle_id:
                    raise ValidationError({'selected_circle_id': "Circle selection is required when Access Scope is CIRCLE."})
                self.selected_district_id = None
                self.selected_block_id = None
            elif self.advance_scope_type == 'DISTRICT':
                if not self.selected_circle_id:
                    raise ValidationError({'selected_circle_id': "Circle selection is required when Access Scope is DISTRICT."})
                if not self.selected_district_id:
                    raise ValidationError({'selected_district_id': "District selection is required when Access Scope is DISTRICT."})
                self.selected_block_id = None
            elif self.advance_scope_type == 'BLOCK':
                if not self.selected_circle_id:
                    raise ValidationError({'selected_circle_id': "Circle selection is required when Access Scope is BLOCK."})
                if not self.selected_district_id:
                    raise ValidationError({'selected_district_id': "District selection is required when Access Scope is BLOCK."})
                if not self.selected_block_id:
                    raise ValidationError({'selected_block_id': "Block selection is required when Access Scope is BLOCK."})

    def save(self, *args, **kwargs):
        self.clean()
        if not isinstance(self.assigned_vendor_ids, list):
            self.assigned_vendor_ids = []
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
        perm_codes = list(
            Permission.objects.filter(roles__in=self.roles.all()).values_list('code', flat=True).distinct()
        )
        if not perm_codes and self.role:
            perm_codes = list(
                Permission.objects.filter(roles__name__iexact=self.role).values_list('code', flat=True).distinct()
            )
            if not perm_codes:
                perm_codes = list(
                    Permission.objects.filter(roles__code__iexact=self.role).values_list('code', flat=True).distinct()
                )

        roles_upper = [r.upper() for r in self.get_role_list()]
        has_vendor = bool(self.external_vendor_id) or bool(self.assigned_vendor_ids)
        if not perm_codes and ('VENDOR' in roles_upper or (has_vendor and not self.roles.exists())):
            default_vendor_perms = [
                'dashboard.view', 'machines.view', 'tracking.view', 'tasks.view',
                'team.view', 'inventory.view', 'stock.view', 'maintenance.view',
                'breakdowns.view', 'alerts.view', 'notifications.view'
            ]
            perm_codes = list(set(default_vendor_perms))

        return list(set(perm_codes))

    def get_assigned_vendors_data(self):
        """Return vendor dicts from assigned string IDs (hydrated live when possible)."""
        if self.is_superuser or 'ADMIN' in self.get_role_list():
            return None  # unrestricted — callers fetch live vendor list

        ids = list(self.assigned_vendor_ids or [])
        if self.external_vendor_id and self.external_vendor_id not in ids:
            ids.append(self.external_vendor_id)

        result = []
        for vid in ids:
            if not vid:
                continue
            name = str(vid)
            try:
                from apps.integrations.ilync_client import IlyncClient
                live = IlyncClient().get_vendor_by_id(vid)
                payload = (live or {}).get('data') if isinstance(live, dict) else {}
                if isinstance(payload, dict) and payload:
                    name = payload.get('partnerName') or payload.get('name') or name
            except Exception:
                pass
            result.append({
                "id": vid,
                "external_vendor_id": str(vid),
                "name": name,
                "code": "",
            })
        return result

    def get_assigned_vendor_ids(self):
        """
        Returns None for unrestricted (admin).
        Returns list of external vendor id strings for scoped users.
        """
        if self.is_superuser or 'ADMIN' in self.get_role_list():
            return None
        ids = [str(v) for v in (self.assigned_vendor_ids or []) if v]
        if self.external_vendor_id and str(self.external_vendor_id) not in ids:
            ids.append(str(self.external_vendor_id))
        return ids

    # ---- Compat shims for legacy code expecting .vendor / .vendor_id ----
    @property
    def vendor_id(self):
        return self.external_vendor_id

    @property
    def vendor(self):
        if not self.external_vendor_id:
            return None
        from apps.common.vendor_scope import get_user_vendor
        return get_user_vendor(self, resolve_fallback=False)

    @property
    def selected_circle(self):
        return self.selected_circle_id

    @property
    def selected_district(self):
        return self.selected_district_id

    @property
    def selected_block(self):
        return self.selected_block_id
