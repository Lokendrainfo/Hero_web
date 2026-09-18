from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


class UserRoleInline(admin.TabularInline):
    from apps.roles.models import UserRole
    model = UserRole
    extra = 0
    autocomplete_fields = ('role',)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        'username', 'get_full_name', 'email', 'employee_id', 'phone_number',
        'role', 'external_vendor_id', 'reporting_manager', 'is_active', 'is_staff', 'is_superuser',
    )
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'role', 'user_type')
    search_fields = (
        'username', 'first_name', 'last_name', 'email',
        'employee_id', 'phone_number', 'external_user_id', 'external_vendor_id',
    )
    ordering = ('username',)
    list_select_related = ('reporting_manager',)
    autocomplete_fields = ('reporting_manager',)
    readonly_fields = ('created_at', 'updated_at', 'last_login', 'date_joined')
    inlines = (UserRoleInline,)
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
            'fields': (
                'external_vendor_id', 'assigned_vendor_ids', 'reporting_manager', 'role',
                'user_type', 'advance_scope_type',
                'selected_circle_id', 'selected_district_id', 'selected_block_id',
            )
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
                'role', 'external_vendor_id', 'is_staff', 'is_superuser',
            ),
        }),
    )
