from django.db import models

class Permission(models.Model):
    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=100, default='General')
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.code})"

class Role(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, null=True)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    data_scope = models.CharField(max_length=50, default='ALL_DATA')
    module_scopes = models.JSONField(default=dict, blank=True)
    permissions = models.ManyToManyField(Permission, through='RolePermission', related_name='roles')
    created_by = models.ForeignKey('authentication.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='created_roles')
    updated_by = models.ForeignKey('authentication.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_roles')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name='role_permissions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('role', 'permission')

    def __str__(self):
        return f"{self.role} → {self.permission}"

class UserRole(models.Model):
    user = models.ForeignKey('authentication.User', on_delete=models.CASCADE, related_name='user_roles')
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='user_roles')
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'role')

    def __str__(self):
        return f"{self.user} → {self.role}"
