from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch
from apps.authentication.models import User
from apps.vendors.models import Vendor, HeroVendorAssignment
from apps.common.models import Circle, District, Block
from apps.tasks.models import Task
from apps.roles.models import Role
from apps.common.task_scope import is_task_authorized_for_user

class TaskSecurityScopeTestCase(TestCase):
    def setUp(self):
        # Create Roles
        self.admin_role, _ = Role.objects.get_or_create(code="ADMIN", defaults={'name': "ADMIN"})
        self.hero_role, _ = Role.objects.get_or_create(code="HERO", defaults={'name': "HERO"})

        # Create Geography Masters
        self.circle_haryana = Circle.objects.create(name="Haryana", code="HAR")
        self.district_gurugram = District.objects.create(circle=self.circle_haryana, name="Gurugram", code="GUR")
        self.block_sohna = Block.objects.create(district=self.district_gurugram, name="Sohna", code="SOH")

        self.circle_rajasthan = Circle.objects.create(name="Rajasthan", code="RAJ")
        self.district_ganganagar = District.objects.create(circle=self.circle_rajasthan, name="Ganganagar", code="GAN")

        # Create Vendors
        self.vendor_a = Vendor.objects.create(name="Vendor Alpha", external_vendor_id="V_ALPHA", code="VALPHA")
        self.vendor_b = Vendor.objects.create(name="Vendor Beta", external_vendor_id="V_BETA", code="VBETA")

        # Create Admin User
        self.admin_user = User.objects.create_superuser(
            username="sec_admin",
            email="admin@hero.com",
            password="password123",
            user_type="NORMAL"
        )
        self.admin_user.roles.set([self.admin_role])

        # Create Normal User A & User B
        self.user_a = User.objects.create_user(
            username="user_a",
            email="user_a@hero.com",
            password="password123",
            user_type="NORMAL"
        )
        self.user_b = User.objects.create_user(
            username="user_b",
            email="user_b@hero.com",
            password="password123",
            user_type="NORMAL"
        )

        # Create Reporting Manager & Subordinate
        self.manager_user = User.objects.create_user(
            username="manager_user",
            email="manager@hero.com",
            password="password123",
            user_type="NORMAL"
        )
        self.subordinate_user = User.objects.create_user(
            username="subordinate_user",
            email="subordinate@hero.com",
            password="password123",
            user_type="NORMAL",
            reporting_manager=self.manager_user
        )

        # Create Advance Circle User
        self.circle_user = User.objects.create_user(
            username="advance_circle_user",
            email="circle@hero.com",
            password="password123",
            user_type="ADVANCE",
            advance_scope_type="CIRCLE",
            selected_circle=self.circle_haryana
        )

        # Create Advance District User
        self.district_user = User.objects.create_user(
            username="advance_district_user",
            email="district@hero.com",
            password="password123",
            user_type="ADVANCE",
            advance_scope_type="DISTRICT",
            selected_circle=self.circle_haryana,
            selected_district=self.district_gurugram
        )

        # Create Advance Block User
        self.block_user = User.objects.create_user(
            username="advance_block_user",
            email="block@hero.com",
            password="password123",
            user_type="ADVANCE",
            advance_scope_type="BLOCK",
            selected_circle=self.circle_haryana,
            selected_district=self.district_gurugram,
            selected_block=self.block_sohna
        )

        # Create Vendor User
        self.vendor_user = User.objects.create_user(
            username="vendor_user",
            email="vendor@hero.com",
            password="password123",
            user_type="NORMAL"
        )
        self.vendor_user.roles.set([self.hero_role])
        HeroVendorAssignment.objects.create(user=self.vendor_user, vendor=self.vendor_a)

        # Create Tasks
        self.task_a = Task.objects.create(
            title="Haryana Gurugram Sohna Task",
            description="Task located in Haryana Circle, Gurugram District, Sohna Block",
            task_type="FIBER_TRENCHING_DUCTING_TASK",
            vendor=self.vendor_a,
            assigned_to=self.subordinate_user
        )

        self.task_b = Task.objects.create(
            title="Rajasthan Ganganagar Task",
            description="Task located in Rajasthan Circle, Ganganagar District",
            task_type="FIBER_TRENCHING_DUCTING_TASK",
            vendor=self.vendor_b,
            assigned_to=self.user_b
        )

        self.client = APIClient()

    @patch('apps.integrations.ilync_client.IlyncClient._request', return_value={'data': {'content': []}})
    def test_admin_has_global_access(self, mock_req):
        self.assertTrue(is_task_authorized_for_user(self.admin_user, self.task_a.id))
        self.assertTrue(is_task_authorized_for_user(self.admin_user, self.task_b.id))

    @patch('apps.integrations.ilync_client.IlyncClient._request', return_value={'data': {'content': []}})
    def test_advance_circle_user_scope(self, mock_req):
        self.assertTrue(is_task_authorized_for_user(self.circle_user, self.task_a.id))
        self.assertFalse(is_task_authorized_for_user(self.circle_user, self.task_b.id))

    @patch('apps.integrations.ilync_client.IlyncClient._request', return_value={'data': {'content': []}})
    def test_advance_district_user_scope(self, mock_req):
        self.assertTrue(is_task_authorized_for_user(self.district_user, self.task_a.id))
        self.assertFalse(is_task_authorized_for_user(self.district_user, self.task_b.id))

    @patch('apps.integrations.ilync_client.IlyncClient._request', return_value={'data': {'content': []}})
    def test_advance_block_user_scope(self, mock_req):
        self.assertTrue(is_task_authorized_for_user(self.block_user, self.task_a.id))
        self.assertFalse(is_task_authorized_for_user(self.block_user, self.task_b.id))

    @patch('apps.integrations.ilync_client.IlyncClient._request', return_value={'data': {'content': []}})
    def test_vendor_user_isolation(self, mock_req):
        self.assertTrue(is_task_authorized_for_user(self.vendor_user, self.task_a.id))
        self.assertFalse(is_task_authorized_for_user(self.vendor_user, self.task_b.id))

    @patch('apps.integrations.ilync_client.IlyncClient._request', return_value={'data': {'content': []}})
    def test_reporting_manager_hierarchy(self, mock_req):
        self.assertTrue(is_task_authorized_for_user(self.manager_user, self.task_a.id))
        self.assertFalse(is_task_authorized_for_user(self.user_a, self.task_a.id))

    @patch('apps.integrations.ilync_client.IlyncClient._request', return_value={'data': {'content': []}})
    def test_direct_api_unauthorized_task_rejection(self, mock_req):
        # Login as User A who has no access to Task B
        self.client.force_authenticate(user=self.user_a)

        # GET Task Detail -> MUST 404
        res_detail = self.client.get(f"/api/v1/integrations/tasks/{self.task_b.id}/")
        self.assertEqual(res_detail.status_code, status.HTTP_404_NOT_FOUND)

        # GET Task Execution -> MUST 404
        res_exec = self.client.get(f"/api/v1/integrations/tasks/{self.task_b.id}/execution/")
        self.assertEqual(res_exec.status_code, status.HTTP_404_NOT_FOUND)

        # GET Task Children -> MUST 404
        res_child = self.client.get(f"/api/v1/integrations/tasks/{self.task_b.id}/children/")
        self.assertEqual(res_child.status_code, status.HTTP_404_NOT_FOUND)

        # GET Task Export -> MUST 404
        res_exp = self.client.get(f"/api/v1/integrations/tasks/{self.task_b.id}/export/")
        self.assertEqual(res_exp.status_code, status.HTTP_404_NOT_FOUND)
