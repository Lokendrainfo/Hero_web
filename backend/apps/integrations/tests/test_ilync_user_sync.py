from django.test import TestCase
from apps.authentication.models import User
from apps.integrations.ilync_user_sync import sync_ilync_user_to_django, map_ilync_role

class IlyncUserSyncTestCase(TestCase):
    def test_map_ilync_role(self):
        self.assertEqual(map_ilync_role('ADMIN', 'Manager'), 'ADMIN')
        self.assertEqual(map_ilync_role('L4_USER', 'Project Manager'), 'MANAGER')
        self.assertEqual(map_ilync_role('L1_USER', 'Field-Supervisor'), 'SUPERVISOR')
        self.assertEqual(map_ilync_role('L1_USER', 'Field-Surveyor'), 'OPERATOR')

    def test_sync_ilync_user_creates_and_updates_user(self):
        ilync_data = {
            "id": "6a9b9374dc6b416504ddcf9e",
            "phoneNumber": "8764129290",
            "name": "Kulwinder Singh",
            "email": None,
            "roleKey": "L1_USER",
            "roleName": "L1-user",
            "designation": "Field-Surveyor",
            "active": True,
            "empId": "8764129290",
            "companies": ["Telecrats"],
            "circles": ["RAJASTHAN"],
            "districts": ["GANGANAGAR"]
        }

        user = sync_ilync_user_to_django(ilync_data, set_password_if_new="TestPass@123")
        self.assertIsNotNone(user)
        self.assertEqual(user.username, "8764129290")
        self.assertEqual(user.employee_id, "8764129290")
        self.assertEqual(user.phone_number, "8764129290")
        self.assertEqual(user.first_name, "Kulwinder")
        self.assertEqual(user.last_name, "Singh")
        self.assertEqual(user.role, "OPERATOR")
        self.assertTrue(user.check_password("TestPass@123"))
        self.assertEqual(user.vendor.name, "Telecrats")

        # Test updating existing user
        ilync_data["designation"] = "Field-Supervisor"
        updated_user = sync_ilync_user_to_django(ilync_data)
        self.assertEqual(updated_user.id, user.id)
