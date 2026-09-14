from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from apps.authentication.models import User
from apps.attendance.models import AttendanceRecord
from apps.notifications.models import Notification

class AttendanceApprovalWorkflowTestCase(TestCase):
    def setUp(self):
        from apps.vendors.models import Vendor
        self.vendor = Vendor.objects.create(name='Test Vendor', external_vendor_id='VEND-001')

        # Setup Hierarchy: Shakti (Grand Manager) -> Abhishek (Manager) -> Lokendra (Employee)
        self.shakti = User.objects.create_user(
            username='shakti',
            email='shakti@example.com',
            password='Password123!',
            first_name='Shakti',
            last_name='Singh',
            vendor=self.vendor,
            role='MANAGER'
        )

        self.abhishek = User.objects.create_user(
            username='abhishek',
            email='abhishek@example.com',
            password='Password123!',
            first_name='Abhishek',
            last_name='Batra',
            vendor=self.vendor,
            reporting_manager=self.shakti,
            role='SUPERVISOR'
        )

        self.lokendra = User.objects.create_user(
            username='lokendra',
            email='lokendra@example.com',
            password='Password123!',
            first_name='Lokendra',
            last_name='Sharma',
            vendor=self.vendor,
            reporting_manager=self.abhishek,
            role='OPERATOR'
        )

        self.random_mgr = User.objects.create_user(
            username='random_mgr',
            email='random@example.com',
            password='Password123!',
            first_name='Random',
            last_name='Manager',
            vendor=self.vendor,
            role='MANAGER'
        )

        self.client_lokendra = APIClient()
        self.client_lokendra.force_authenticate(user=self.lokendra)

        self.client_abhishek = APIClient()
        self.client_abhishek.force_authenticate(user=self.abhishek)

        self.client_shakti = APIClient()
        self.client_shakti.force_authenticate(user=self.shakti)

        self.client_random = APIClient()
        self.client_random.force_authenticate(user=self.random_mgr)

    def test_mobile_check_in_derives_reporting_manager(self):
        """1. Mobile check-in must derive reporting_manager from target user hierarchy."""
        response = self.client_lokendra.post('/api/v1/attendance/check-in/', {
            'latitude': 28.6139,
            'longitude': 77.2090,
            'accuracy': 5.0
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        record = AttendanceRecord.objects.get(user=self.lokendra)
        self.assertEqual(record.reporting_manager, self.abhishek)
        self.assertEqual(record.approval_status, 'PENDING')

        # Check notification created for Abhishek
        notif = Notification.objects.filter(user=self.abhishek).first()
        self.assertIsNotNone(notif)
        self.assertIn("Pending Attendance Approval", notif.title)

    def test_pending_approvals_reporting_hierarchy_visibility(self):
        """3 & 4. Pending approvals must only return records authorized for the manager."""
        # Create pending attendance for Lokendra and Abhishek
        record_lokendra = AttendanceRecord.objects.create(
            user=self.lokendra,
            reporting_manager=self.abhishek,
            date=timezone.now().date(),
            status='CHECKED_IN',
            approval_status='PENDING'
        )

        record_abhishek = AttendanceRecord.objects.create(
            user=self.abhishek,
            reporting_manager=self.shakti,
            date=timezone.now().date(),
            status='CHECKED_IN',
            approval_status='PENDING'
        )

        # Lokendra sees 0 pending approvals
        res_lokendra = self.client_lokendra.get('/api/v1/attendance/pending-approvals/')
        self.assertEqual(res_lokendra.status_code, status.HTTP_200_OK)
        results_lokendra = res_lokendra.data.get('results', [])
        self.assertEqual(len(results_lokendra), 0)

        # Abhishek sees Lokendra's pending approval
        res_abhishek = self.client_abhishek.get('/api/v1/attendance/pending-approvals/')
        self.assertEqual(res_abhishek.status_code, status.HTTP_200_OK)
        results_abhishek = res_abhishek.data.get('results', [])
        self.assertEqual(len(results_abhishek), 1)
        self.assertEqual(results_abhishek[0]['id'], record_lokendra.id)

        # Shakti (Grand Manager) in ALL_REPORTING_DESCENDANTS mode sees Abhishek & Lokendra
        res_shakti = self.client_shakti.get('/api/v1/attendance/pending-approvals/')
        self.assertEqual(res_shakti.status_code, status.HTTP_200_OK)
        results_shakti = res_shakti.data.get('results', [])
        self.assertEqual(len(results_shakti), 2)

    def test_self_approval_prohibition_guard(self):
        """5. Employee cannot approve their own attendance record (403 Forbidden)."""
        record_lokendra = AttendanceRecord.objects.create(
            user=self.lokendra,
            reporting_manager=self.abhishek,
            date=timezone.now().date(),
            status='CHECKED_IN',
            approval_status='PENDING'
        )

        res = self.client_lokendra.post(f'/api/v1/attendance/{record_lokendra.id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("cannot approve or reject your own", res.data.get('detail', ''))

    def test_unauthorized_manager_approval_guard(self):
        """5. Random manager cannot approve Lokendra's attendance (403 Forbidden)."""
        record_lokendra = AttendanceRecord.objects.create(
            user=self.lokendra,
            reporting_manager=self.abhishek,
            date=timezone.now().date(),
            status='CHECKED_IN',
            approval_status='PENDING'
        )

        res = self.client_random.post(f'/api/v1/attendance/{record_lokendra.id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("not authorized", res.data.get('detail', ''))

    def test_authorized_manager_approve_action(self):
        """8 & 9. Abhishek approves Lokendra's attendance successfully and notifies Lokendra."""
        record_lokendra = AttendanceRecord.objects.create(
            user=self.lokendra,
            reporting_manager=self.abhishek,
            date=timezone.now().date(),
            status='CHECKED_IN',
            approval_status='PENDING'
        )

        res = self.client_abhishek.post(f'/api/v1/attendance/{record_lokendra.id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('approval_status'), 'APPROVED')

        record_lokendra.refresh_from_db()
        self.assertEqual(record_lokendra.approval_status, 'APPROVED')
        self.assertEqual(record_lokendra.approved_by, self.abhishek)
        self.assertIsNotNone(record_lokendra.approved_at)

        # Check notification created for Lokendra
        notif = Notification.objects.filter(user=self.lokendra).first()
        self.assertIsNotNone(notif)
        self.assertIn("Attendance Approved", notif.title)

    def test_authorized_manager_reject_action(self):
        """8 & 9. Abhishek rejects Lokendra's attendance with reason and notifies Lokendra."""
        record_lokendra = AttendanceRecord.objects.create(
            user=self.lokendra,
            reporting_manager=self.abhishek,
            date=timezone.now().date(),
            status='CHECKED_IN',
            approval_status='PENDING'
        )

        res = self.client_abhishek.post(f'/api/v1/attendance/{record_lokendra.id}/reject/', {
            'reason': 'GPS location is outside site perimeter bounds.'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('approval_status'), 'REJECTED')
        self.assertEqual(res.data.get('rejection_reason'), 'GPS location is outside site perimeter bounds.')

        record_lokendra.refresh_from_db()
        self.assertEqual(record_lokendra.approval_status, 'REJECTED')
        self.assertEqual(record_lokendra.rejection_reason, 'GPS location is outside site perimeter bounds.')

        # Check notification created for Lokendra
        notif = Notification.objects.filter(user=self.lokendra).first()
        self.assertIsNotNone(notif)
        self.assertIn("Attendance Rejected", notif.title)
