from django.contrib import admin
from .models import Permission, Role, RolePermission, UserRole


class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 0
    autocomplete_fields = ('permission',)


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'category', 'created_at')
    list_filter = ('category',)
    search_fields = ('code', 'name', 'description')
    ordering = ('category', 'code')


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_system', 'permission_count', 'updated_at')
    list_filter = ('is_system',)
    search_fields = ('name', 'code', 'description')
    inlines = (RolePermissionInline,)
    readonly_fields = ('created_at', 'updated_at')

    @admin.display(description='Permissions')
    def permission_count(self, obj):
        return obj.permissions.count()


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'permission', 'created_at')
    list_filter = ('role', 'permission__category')
    search_fields = ('role__name', 'permission__code', 'permission__name')
    autocomplete_fields = ('role', 'permission')


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'assigned_at')
    list_filter = ('role',)
    search_fields = ('user__username', 'user__email', 'role__name')
    autocomplete_fields = ('user', 'role')
