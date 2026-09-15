from django.test import TestCase
from apps.roles.models import Role, Permission, UserRole
from apps.roles.services import seed_roles_and_permissions, SYSTEM_PERMISSIONS, DEFAULT_ROLES
from apps.authentication.models import User

class RoleRBACTestCase(TestCase):
    def setUp(self):
        seed_roles_and_permissions()

    def test_seed_permissions_exist(self):
        self.assertGreaterEqual(Permission.objects.count(), len(SYSTEM_PERMISSIONS))

    def test_seed_default_roles_exist(self):
        self.assertTrue(Role.objects.filter(code='SUPER_ADMIN').exists())
        self.assertTrue(Role.objects.filter(code='ADMIN').exists())
        self.assertTrue(Role.objects.filter(code='VENDOR_ADMIN').exists())

    def test_role_duplication(self):
        role = Role.objects.get(code='VENDOR_ADMIN')
        duplicated_role = Role.objects.create(
            name=f"Copy of {role.name}",
            code=f"COPY_{role.code}",
            description=role.description,
            data_scope=role.data_scope
        )
        duplicated_role.permissions.set(role.permissions.all())
        self.assertEqual(duplicated_role.permissions.count(), role.permissions.count())
        self.assertEqual(duplicated_role.data_scope, 'OWN_VENDOR')

    def test_user_permission_resolution(self):
        user = User.objects.create_user(username='test_operator', password='password123')
        operator_role = Role.objects.get(code='OPERATOR')
        UserRole.objects.create(user=user, role=operator_role)
        
        perms = user.get_permission_codes()
        self.assertIn('tasks.view', perms)
        self.assertIn('attendance.create', perms)
        self.assertNotIn('roles.manage', perms)
