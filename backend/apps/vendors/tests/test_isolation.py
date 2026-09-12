from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.vendors.models import Vendor
from apps.authentication.models import User
from apps.machines.models import Machine

class VendorIsolationTests(TestCase):
    def setUp(self):
        self.vendor_a = Vendor.objects.create(name="VENDOR A", code="VA")
        self.vendor_b = Vendor.objects.create(name="VENDOR B", code="VB")

        self.user_a = User.objects.create_user(username="user_a", password="password123", vendor=self.vendor_a)
        self.user_b = User.objects.create_user(username="user_b", password="password123", vendor=self.vendor_b)

        self.machine_a = Machine.objects.create(serial_number="M-A001", name="Machine A", vendor=self.vendor_a)
        self.machine_b = Machine.objects.create(serial_number="M-B001", name="Machine B", vendor=self.vendor_b)

    def test_user_a_only_sees_vendor_a_machines(self):
        client = APIClient()
        client.force_authenticate(user=self.user_a)
        response = client.get('/api/v1/machines/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        machines = response.data['data']
        machine_ids = [m['id'] for m in machines]
        self.assertIn(self.machine_a.id, machine_ids)
        self.assertNotIn(self.machine_b.id, machine_ids)
