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


class VendorRosterSecurityTestCase(TestCase):
    def setUp(self):
        from apps.vendors.models import Vendor, HeroVendorAssignment
        self.vendor_a = Vendor.objects.create(name='Vendor A', external_vendor_id='VEND-A-001')
        self.vendor_b = Vendor.objects.create(name='Vendor B', external_vendor_id='VEND-B-002')

        # Vendor A Admin/User
        self.user_vendor_a = User.objects.create_user(
            username='vendor_a_user',
            password='Password123!',
            first_name='Vendor A User',
            vendor=self.vendor_a,
            role='VENDOR'
        )
        HeroVendorAssignment.objects.create(user=self.user_vendor_a, vendor=self.vendor_a, is_active=True)

        # Member belonging to Vendor A
        self.member_a1 = User.objects.create_user(
            username='member_a1',
            password='Password123!',
            first_name='Member A1',
            vendor=self.vendor_a,
            role='OPERATOR'
        )
        HeroVendorAssignment.objects.create(user=self.member_a1, vendor=self.vendor_a, is_active=True)

        # Member belonging to Vendor B
        self.member_b1 = User.objects.create_user(
            username='member_b1',
            password='Password123!',
            first_name='Member B1',
            vendor=self.vendor_b,
            role='OPERATOR'
        )
        HeroVendorAssignment.objects.create(user=self.member_b1, vendor=self.vendor_b, is_active=True)

        # Global user without vendor assignment
        self.unassigned_user = User.objects.create_user(
            username='unassigned_user',
            password='Password123!',
            first_name='Unassigned User',
            role='OPERATOR'
        )

        # Admin User
        self.admin_user = User.objects.create_user(
            username='admin_user',
            password='Password123!',
            first_name='Admin User',
            is_superuser=True,
            role='ADMIN'
        )

        self.client_vendor_a = APIClient()
        self.client_vendor_a.force_authenticate(user=self.user_vendor_a)

        self.client_admin = APIClient()
        self.client_admin.force_authenticate(user=self.admin_user)

    def test_1_vendor_a_logs_in_returns_only_vendor_a_team(self):
        """TEST 1: Vendor A logs in -> Only Vendor A team returned."""
        res = self.client_vendor_a.get('/api/v1/attendance/team-attendance/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        members = res.data.get('data', {}).get('team_members', [])
        member_ids = [m['id'] for m in members]
        self.assertIn(self.member_a1.id, member_ids)
        self.assertNotIn(self.member_b1.id, member_ids)
        self.assertNotIn(self.unassigned_user.id, member_ids)

    def test_2_vendor_a_queries_vendor_b_id_rejected(self):
        """TEST 2: Vendor A tries API request with Vendor B ID -> HTTP 403 Forbidden."""
        res = self.client_vendor_a.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_b.id}')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_3_vendor_a_manual_query_params_enforces_scope(self):
        """TEST 3: Vendor A modifies query parameters manually -> Backend returns only Vendor A authorized team."""
        res = self.client_vendor_a.get(f'/api/v1/attendance/team-attendance/?vendor={self.vendor_b.name}')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_4_unassigned_user_excluded_from_vendor_attendance(self):
        """TEST 4: Global user exists but has no vendor assignment -> Excluded from Vendor Attendance."""
        res = self.client_vendor_a.get('/api/v1/attendance/team-attendance/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        members = res.data.get('data', {}).get('team_members', [])
        member_ids = [m['id'] for m in members]
        self.assertNotIn(self.unassigned_user.id, member_ids)

    def test_5_user_with_attendance_record_not_in_vendor_team_excluded(self):
        """TEST 5: User has attendance record but is not in vendor team -> Not included in roster."""
        # Create attendance record for unassigned_user today
        AttendanceRecord.objects.create(
            user=self.unassigned_user,
            date=timezone.now().date(),
            status='CHECKED_IN'
        )
        res = self.client_vendor_a.get('/api/v1/attendance/team-attendance/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        members = res.data.get('data', {}).get('team_members', [])
        member_ids = [m['id'] for m in members]
        self.assertNotIn(self.unassigned_user.id, member_ids)

    def test_6_assigned_team_member_no_attendance_shows_not_marked(self):
        """TEST 6: Assigned team member has no attendance record -> Included as NOT_MARKED."""
        res = self.client_vendor_a.get('/api/v1/attendance/team-attendance/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        members = res.data.get('data', {}).get('team_members', [])
        a1_data = next((m for m in members if m['id'] == self.member_a1.id), None)
        self.assertIsNotNone(a1_data)
        self.assertEqual(a1_data['status'], 'NOT_MARKED')

    def test_7_admin_all_vendors_returns_all_vendor_teams(self):
        """TEST 7: ADMIN + All vendors -> All authorized vendor teams."""
        res = self.client_admin.get('/api/v1/attendance/team-attendance/?vendor=ALL')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        members = res.data.get('data', {}).get('team_members', [])
        member_ids = [m['id'] for m in members]
        self.assertIn(self.member_a1.id, member_ids)
        self.assertIn(self.member_b1.id, member_ids)
        self.assertNotIn(self.unassigned_user.id, member_ids)

    def test_8_admin_selects_vendor_a_returns_only_vendor_a(self):
        """TEST 8: ADMIN selects Vendor A -> Only Vendor A team."""
        res = self.client_admin.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_a.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        members = res.data.get('data', {}).get('team_members', [])
        member_ids = [m['id'] for m in members]
        self.assertIn(self.member_a1.id, member_ids)
        self.assertNotIn(self.member_b1.id, member_ids)
        self.assertNotIn(self.unassigned_user.id, member_ids)

