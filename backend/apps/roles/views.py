from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.roles.models import Role, Permission, UserRole
from apps.roles.serializers import RoleSerializer, PermissionSerializer
from apps.common.responses import success_response, error_response
from apps.roles.services import seed_roles_and_permissions, SYSTEM_PERMISSIONS
from apps.authentication.models import User

class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all().order_by('id')
    serializer_class = RoleSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        if Role.objects.count() == 0 or not Role.objects.filter(code='SUPER_ADMIN').exists() or Permission.objects.count() < len(SYSTEM_PERMISSIONS):
            seed_roles_and_permissions()
        return Role.objects.all().order_by('id')

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.is_system:
            return error_response(
                message=f"System-critical role '{role.name}' cannot be deleted.",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        user_count = role.users.count()
        if user_count > 0:
            return error_response(
                message=f"Cannot delete role '{role.name}' because {user_count} user(s) are currently assigned to it.",
                status_code=status.HTTP_400_BAD_REQUEST
            )
        role.delete()
        return success_response(message=f"Role '{role.name}' deleted successfully.")

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        original_role = self.get_object()
        new_name = request.data.get('name') or f"Copy of {original_role.name}"
        new_code = request.data.get('code') or f"COPY_{original_role.code}"
        
        # Ensure code uniqueness
        counter = 1
        base_code = new_code
        while Role.objects.filter(code=new_code).exists():
            new_code = f"{base_code}_{counter}"
            counter += 1

        new_role = Role.objects.create(
            name=new_name,
            code=new_code,
            description=f"Duplicated from {original_role.name}. {original_role.description or ''}",
            is_system=False,
            is_active=True,
            data_scope=original_role.data_scope,
            module_scopes=original_role.module_scopes,
            created_by=request.user if request.user.is_authenticated else None,
            updated_by=request.user if request.user.is_authenticated else None,
        )
        new_role.permissions.set(original_role.permissions.all())
        serializer = RoleSerializer(new_role, context={'request': request})
        return success_response(data=serializer.data, message=f"Role '{original_role.name}' duplicated successfully as '{new_name}'.")

    @action(detail=True, methods=['post', 'patch'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        role = self.get_object()
        if role.is_system and role.is_active:
            # Prevent deactivating super critical roles if required, or allow toggle with warning
            pass
        role.is_active = not role.is_active
        if request.user.is_authenticated:
            role.updated_by = request.user
        role.save()
        status_str = "activated" if role.is_active else "deactivated"
        return success_response(data={'id': role.id, 'is_active': role.is_active}, message=f"Role '{role.name}' {status_str} successfully.")

    @action(detail=True, methods=['post'], url_path='assign-users')
    def assign_users(self, request, pk=None):
        role = self.get_object()
        user_ids = request.data.get('user_ids', [])
        if not isinstance(user_ids, list):
            return error_response(message="user_ids must be a list of user IDs.")
        
        users = User.objects.filter(id__in=user_ids)
        # Clear existing role assignments for these users or assign this role
        for u in users:
            UserRole.objects.get_or_create(user=u, role=role)
        
        return success_response(message=f"Role '{role.name}' assigned to {users.count()} user(s) successfully.")

    @action(detail=False, methods=['get'], url_path='me-permissions')
    def me_permissions(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return error_response(message="Authentication required.", status_code=status.HTTP_401_UNAUTHORIZED)
        
        roles = user.roles.filter(is_active=True)
        role_codes = list(roles.values_list('code', flat=True))
        if not role_codes and user.role:
            role_codes = [user.role]
            
        role_names = list(roles.values_list('name', flat=True))
        if not role_names and user.role:
            role_names = [user.role]

        permission_codes = user.get_permission_codes()
        
        # Effective scope aggregation
        scopes = set(roles.values_list('data_scope', flat=True))
        if 'ALL_DATA' in scopes or user.is_superuser or 'SUPER_ADMIN' in role_codes or 'ADMIN' in role_codes:
            effective_scope = 'ALL_DATA'
        elif 'OWN_GEOGRAPHY' in scopes:
            effective_scope = 'OWN_GEOGRAPHY'
        elif 'REPORTING_HIERARCHY' in scopes:
            effective_scope = 'REPORTING_HIERARCHY'
        elif 'OWN_VENDOR' in scopes or user.vendor_id:
            effective_scope = 'OWN_VENDOR'
        elif 'OWN_TEAM' in scopes:
            effective_scope = 'OWN_TEAM'
        elif 'OWN_TASKS' in scopes:
            effective_scope = 'OWN_TASKS'
        else:
            effective_scope = 'ALL_DATA'

        return Response({
            'success': True,
            'user_id': user.id,
            'username': user.username,
            'role_codes': role_codes,
            'role_names': role_names,
            'data_scope': effective_scope,
            'permission_codes': permission_codes
        })

    @action(detail=False, methods=['get'], url_path='ilync-roles')
    def ilync_roles(self, request):
        try:
            from apps.integrations.ilync_client import IlyncClient
            client = IlyncClient()
            data = client.get_enterprise_roles()
            return Response(data)
        except Exception as e:
            return error_response(message=f"Failed to fetch external ILYNC roles: {str(e)}")

class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all().order_by('category', 'id')
    serializer_class = PermissionSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        if Permission.objects.count() < len(SYSTEM_PERMISSIONS):
            seed_roles_and_permissions()
        return Permission.objects.all().order_by('category', 'id')
