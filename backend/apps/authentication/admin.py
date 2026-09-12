from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


class UserRoleInline(admin.TabularInline):
    from apps.roles.models import UserRole
    model = UserRole
    extra = 0
    autocomplete_fields = ('role',)


class VendorAssignmentInline(admin.TabularInline):
    from apps.vendors.models import HeroVendorAssignment
    model = HeroVendorAssignment
    fk_name = 'user'
    extra = 0
    autocomplete_fields = ('vendor', 'assigned_by')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        'username', 'get_full_name', 'email', 'employee_id', 'phone_number',
        'role', 'vendor', 'reporting_manager', 'is_active', 'is_staff', 'is_superuser',
    )
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'role', 'vendor')
    search_fields = (
        'username', 'first_name', 'last_name', 'email',
        'employee_id', 'phone_number', 'external_user_id',
    )
    ordering = ('username',)
    list_select_related = ('vendor', 'reporting_manager')
    autocomplete_fields = ('vendor', 'reporting_manager')
    readonly_fields = ('created_at', 'updated_at', 'last_login', 'date_joined')
    inlines = (UserRoleInline, VendorAssignmentInline)
    list_per_page = 50

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Profile', {
            'fields': (
                'first_name', 'last_name', 'email', 'phone_number',
                'employee_id', 'external_user_id', 'avatar',
            )
        }),
        ('Organization', {
            'fields': ('vendor', 'reporting_manager', 'role')
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Dates', {'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': (
                'username', 'password1', 'password2',
                'first_name', 'last_name', 'email',
                'role', 'vendor', 'is_staff', 'is_superuser',
            ),
        }),
    )
