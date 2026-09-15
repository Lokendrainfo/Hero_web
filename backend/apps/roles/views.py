from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.roles.models import Role, Permission
from apps.roles.serializers import RoleSerializer, PermissionSerializer
from apps.common.responses import success_response, error_response
from apps.roles.services import seed_roles_and_permissions, SYSTEM_PERMISSIONS

class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all().order_by('id')
    serializer_class = RoleSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        if Role.objects.count() == 0 or not Role.objects.filter(code='ALL_VIEWER').exists() or Permission.objects.count() < len(SYSTEM_PERMISSIONS):
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

