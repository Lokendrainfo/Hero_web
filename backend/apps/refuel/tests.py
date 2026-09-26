from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.machines.models import Machine
from apps.vendors.models import Vendor
from apps.refuel.models import RefuelEntry


class RefuelSensorConfirmTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.vendor = Vendor.objects.create(name='Test Refuel Vendor', code='TRV-01')
        self.user = User.objects.create_user(
            username='refuel_operator',
            email='operator@hero.com',
            password='testpassword123',
            phone_number='9876543210'
        )
        self.user.vendor = self.vendor
        self.user.save()

        self.machine = Machine.objects.create(
            name='Drill Rig Alpha',
            code='MCH-001',
            machine_chassis_no='600202608397',
            vendor=self.vendor
        )
        self.client.force_authenticate(user=self.user)

    def test_confirm_missing_tracker_ids(self):
        """Missing refuel_tracker_ids returns 400 Bad Request."""
        res = self.client.post('/api/v1/refuel/confirm/', {
            'litres': '45.0',
            'mobile': '9876543210'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('refuel_tracker_ids', res.data.get('message', ''))

    def test_confirm_missing_litres(self):
        """Missing litres returns 400 Bad Request."""
        res = self.client.post('/api/v1/refuel/confirm/', {
            'refuel_tracker_ids': [832],
            'mobile': '9876543210'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Litres', res.data.get('message', ''))

    def test_confirm_missing_mobile_and_user_without_phone(self):
        """If user has no phone and request has no mobile, returns 400."""
        user_no_phone = User.objects.create_user(
            username='no_phone_user',
            email='nophone@hero.com',
            password='testpassword123'
        )
        self.client.force_authenticate(user=user_no_phone)
        res = self.client.post('/api/v1/refuel/confirm/', {
            'refuel_tracker_ids': [832],
            'litres': '45.0',
            'mobile': ''
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Mobile', res.data.get('message', ''))

    @patch('apps.refuel.views.FiberForceClient')
    def test_confirm_success_and_local_sync(self, mock_client_cls):
        """Successful confirmation proxies to HDD Fiber and auto-records local RefuelEntry."""
        mock_instance = MagicMock()
        mock_instance.confirm_refuel.return_value = {
            'success': True,
            'data': {
                'id': 832,
                'machine_chassis_no': '600202608397',
                'status': 'CONFIRMED',
                'acknowledged': True,
                'acknowledged_litres': 46.0,
                'amount_paid': 4370.0,
                'confirmed_by_mobile': '9876543210',
                'variance_pct': 0.0,
                'variance_ok': True,
            },
            'details': 'Refuel confirmed'
        }
        mock_client_cls.return_value = mock_instance

        res = self.client.post('/api/v1/refuel/confirm/', {
            'refuel_tracker_ids': '832',
            'litres': '46.0',
            'amount_paid': '4370.0',
            'mobile': '9876543210',
            'note': 'Verified at diesel pump',
            'variance_disposition': 'Meter Tolerance / Normal'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('success'))
        self.assertEqual(res.data['data']['status'], 'CONFIRMED')

        # Verify FiberForceClient confirm_refuel was called
        mock_instance.confirm_refuel.assert_called_once()

        # Verify local RefuelEntry was created
        entry = RefuelEntry.objects.filter(machine=self.machine).first()
        self.assertIsNotNone(entry)
        self.assertEqual(float(entry.quantity_liters), 46.0)
        self.assertEqual(float(entry.total_cost), 4370.0)

    @patch('apps.refuel.views.FiberForceClient')
    def test_confirm_hdd_fiber_error(self, mock_client_cls):
        """HDD Fiber API failure returns error response."""
        mock_instance = MagicMock()
        mock_instance.confirm_refuel.return_value = {
            'success': False,
            'error': 'all selected fills must be on the same machine',
            'message': 'FiberForce error 422'
        }
        mock_client_cls.return_value = mock_instance

        res = self.client.post('/api/v1/refuel/confirm/', {
            'refuel_tracker_ids': [832, 833],
            'litres': '80.0',
            'mobile': '9876543210'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data.get('success'))
        self.assertIn('same machine', res.data.get('message', ''))
