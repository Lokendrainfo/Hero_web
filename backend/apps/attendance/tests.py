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

    def test_team_and_machine_attendance_isolation(self):
        """Verify machine check-in does not affect human user status or team counters."""
        # 1. Lokendra performs machine check-in
        res_mac = self.client_lokendra.post('/api/v1/attendance/machine-check-in/', {
            'machine_id': 'MAC-101',
            'machine_chassis_no': 'CHASSIS-101',
            'latitude': 28.6139,
            'longitude': 77.2090
        })
        self.assertEqual(res_mac.status_code, status.HTTP_201_CREATED)

        # 2. Check today's personal attendance for Lokendra - must be None / NOT marked as checked in yet
        res_today = self.client_lokendra.get('/api/v1/attendance/today/')
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        self.assertIsNone(res_today.data)

        # 3. Lokendra performs human check-in
        res_human = self.client_lokendra.post('/api/v1/attendance/check-in/', {
            'latitude': 28.6139,
            'longitude': 77.2090
        })
        self.assertEqual(res_human.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_human.data['data']['attendance_type'], 'TEAM')

        # 4. Verify machine record is distinct from human record
        mac_rec = AttendanceRecord.objects.get(attendance_type='MACHINE', machine_id='MAC-101')
        human_rec = AttendanceRecord.objects.get(attendance_type='TEAM', user=self.lokendra)
        self.assertNotEqual(mac_rec.id, human_rec.id)


class HistoricalAttendanceIdentityTestCase(TestCase):
    def setUp(self):
        from datetime import timedelta
        from apps.vendors.models import Vendor
        self.vendor = Vendor.objects.create(
            name='MS Rekha Ram Vendor',
            external_vendor_id='VEND-EXT-001'
        )

        # 1. User originally created with "MS Rekha Ram"
        self.user = User.objects.create_user(
            username='user_rekhram',
            email='rekhram@example.com',
            password='Password123!',
            first_name='MS Rekha',
            last_name='Ram',
            employee_id='EMP-001',
            phone_number='9876543210',
            external_user_id='EXT_USER_12345',
            vendor=self.vendor,
            role='OPERATOR'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_historical_attendance_preserves_snapshot_on_user_profile_change(self):
        """
        TEST CASE:
        Yesterday:
          external_user_id = SAME_ID
          user_name_snapshot = 'MS Rekha Ram'
        Today:
          current User name = 'Pranjal 2'
          external_user_id = SAME_ID
          new attendance snapshot name = 'Pranjal 2'
        Expected:
          Yesterday attendance -> 'MS Rekha Ram'
          Today's attendance -> 'Pranjal 2'
          Current User -> 'Pranjal 2'
          Same external_user_id for both
          No duplicate user
          No historical data rewrite.
        """
        from datetime import timedelta
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)

        # 1. Create Yesterday's attendance when user profile was "MS Rekha Ram"
        yesterday_record = AttendanceRecord.objects.create(
            user=self.user,
            vendor=self.vendor,
            date=yesterday,
            check_in=timezone.now() - timedelta(days=1),
            status='PRESENT',
            attendance_type='TEAM'
        )

        # Verify snapshot was automatically populated with "MS Rekha Ram"
        self.assertEqual(yesterday_record.external_user_id_snapshot, 'EXT_USER_12345')
        self.assertEqual(yesterday_record.user_name_snapshot, 'MS Rekha Ram')
        self.assertEqual(yesterday_record.vendor_name_snapshot, 'MS Rekha Ram Vendor')
        self.assertEqual(yesterday_record.vendor_external_id_snapshot, 'VEND-EXT-001')

        # 2. Today: iLync profile updates user's name to "Pranjal 2" (Same external_user_id)
        self.user.first_name = 'Pranjal'
        self.user.last_name = '2'
        self.user.save()

        # Verify current User profile shows "Pranjal 2"
        self.assertEqual(self.user.get_full_name(), 'Pranjal 2')
        self.assertEqual(self.user.external_user_id, 'EXT_USER_12345')
        self.assertEqual(User.objects.filter(external_user_id='EXT_USER_12345').count(), 1)

        # 3. Create Today's attendance
        today_record = AttendanceRecord.objects.create(
            user=self.user,
            vendor=self.vendor,
            date=today,
            check_in=timezone.now(),
            status='PRESENT',
            attendance_type='TEAM'
        )

        # Verify today's snapshot was populated with "Pranjal 2"
        self.assertEqual(today_record.external_user_id_snapshot, 'EXT_USER_12345')
        self.assertEqual(today_record.user_name_snapshot, 'Pranjal 2')

        # 4. CRITICAL ASSERTION: Yesterday's record was NOT modified or overwritten
        yesterday_record.refresh_from_db()
        self.assertEqual(yesterday_record.user_name_snapshot, 'MS Rekha Ram')
        self.assertEqual(yesterday_record.external_user_id_snapshot, 'EXT_USER_12345')

        # 5. Verify Serializer output:
        from apps.attendance.serializers import AttendanceRecordSerializer
        yesterday_data = AttendanceRecordSerializer(yesterday_record).data
        today_data = AttendanceRecordSerializer(today_record).data

        # Yesterday attendance serializer shows "MS Rekha Ram"
        self.assertEqual(yesterday_data['user_name'], 'MS Rekha Ram')
        self.assertEqual(yesterday_data['external_user_id'], 'EXT_USER_12345')

        # Today attendance serializer shows "Pranjal 2"
        self.assertEqual(today_data['user_name'], 'Pranjal 2')
        self.assertEqual(today_data['external_user_id'], 'EXT_USER_12345')

        # 6. Verify Team Attendance API output for yesterday vs today
        admin_user = User.objects.create_superuser('admin_user', 'admin@example.com', 'AdminPass123!')
        client_admin = APIClient()
        client_admin.force_authenticate(user=admin_user)

        res_yesterday = client_admin.get(f'/api/v1/attendance/team-attendance/?date={yesterday}')
        self.assertEqual(res_yesterday.status_code, status.HTTP_200_OK)
        members_yesterday = res_yesterday.data['data']['team_members']
        user_yesterday = next(m for m in members_yesterday if m['external_user_id'] == 'EXT_USER_12345')
        self.assertEqual(user_yesterday['user_name'], 'MS Rekha Ram')

        res_today = client_admin.get(f'/api/v1/attendance/team-attendance/?date={today}')
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        members_today = res_today.data['data']['team_members']
        user_today = next(m for m in members_today if m.get('external_user_id') == 'EXT_USER_12345')
        self.assertEqual(user_today['user_name'], 'Pranjal 2')


class TeamMemberCheckInTestCase(TestCase):
    def setUp(self):
        from unittest.mock import patch
        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.attendance.views import AttendanceViewSet
        from apps.vendors.models import Vendor

        self.factory = APIRequestFactory()
        self.view = AttendanceViewSet.as_view({'post': 'check_in'})

        # Vendor 1: Premium infra solutions
        self.vendor_premium = Vendor.objects.create(
            name="Premium infra solutions",
            external_vendor_id="6aa540a512381cfcdf6a1ed5",
            is_active=True
        )

        # Vendor 21: Vikas kumar
        self.vendor_vikas = Vendor.objects.create(
            name="Vikas kumar",
            external_vendor_id="6a95092f544bdedf53d4ec0a",
            is_active=True
        )

        # Rakesh Karwasra in Vendor 1
        self.rakesh = User.objects.create_user(
            username="9116485564",
            first_name="Rakesh",
            last_name="karwasra",
            phone_number="9116485564",
            employee_id="EMP-12",
            external_user_id="6a95114cf475d920736bd827",
            vendor=self.vendor_premium,
            role="OPERATOR",
            is_active=True
        )

        # Vendor 1 Manager
        self.premium_manager = User.objects.create_user(
            username="premium_mgr",
            first_name="Premium",
            last_name="Manager",
            vendor=self.vendor_premium,
            role="VENDOR",
            is_active=True
        )

        # Vendor 21 Manager
        self.vikas_manager = User.objects.create_user(
            username="vikas_mgr",
            first_name="Vikas",
            last_name="Manager",
            vendor=self.vendor_vikas,
            role="VENDOR",
            is_active=True
        )

        # Admin
        self.admin = User.objects.create_superuser(
            username="sysadmin",
            first_name="System",
            last_name="Admin",
            email="admin@test.com",
            password="adminpassword"
        )

    def test_authorized_manager_check_in_rakesh_success(self):
        """
        Vendor 1 manager checking in Rakesh Karwasra:
        - Resolves Rakesh by external_user_id
        - Populates all 7 snapshots
        - Vendor remains Vendor 1 (Premium infra solutions)
        """
        from rest_framework.test import force_authenticate

        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.rakesh.id,
            'external_user_id': self.rakesh.external_user_id,
            'vendor_id': self.vendor_premium.id,
            'latitude': 28.5355,
            'longitude': 77.3910
        })
        force_authenticate(request, user=self.premium_manager)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('success'))

        data = response.data.get('data')
        self.assertEqual(data['user_id'], self.rakesh.id)
        self.assertEqual(data['user_name'], "Rakesh karwasra")
        self.assertEqual(data['external_user_id_snapshot'], "6a95114cf475d920736bd827")
        self.assertEqual(data['employee_id_snapshot'], "EMP-12")
        self.assertEqual(data['user_name_snapshot'], "Rakesh karwasra")
        self.assertEqual(data['phone_number_snapshot'], "9116485564")
        self.assertEqual(data['role_snapshot'], "OPERATOR")
        self.assertEqual(data['vendor_external_id_snapshot'], "6aa540a512381cfcdf6a1ed5")
        self.assertEqual(data['vendor_name_snapshot'], "Premium infra solutions")

        # Verify DB record
        record = AttendanceRecord.objects.get(id=data['id'])
        self.assertEqual(record.user, self.rakesh)
        self.assertEqual(record.vendor, self.vendor_premium)
        self.assertEqual(record.status, 'CHECKED_IN')
        self.assertIsNotNone(record.check_in)

        # Refresh Rakesh from DB and verify vendor was not modified
        self.rakesh.refresh_from_db()
        self.assertEqual(self.rakesh.vendor, self.vendor_premium)
        self.assertEqual(self.rakesh.external_user_id, "6a95114cf475d920736bd827")

    def test_vikas_manager_can_check_in_multi_vendor_user_rakesh_and_cannot_check_in_chandan(self):
        """
        Vikas kumar vendor manager:
        1. Checking in Rakesh Karwasra:
           - Rakesh is in Vikas iLync users[] -> ALLOWED (HTTP 201)
           - AttendanceRecord created under Vikas vendor
        2. Attempting to check in Chandan (Raj Enterprises only):
           - Chandan is NOT in Vikas iLync users[] -> DENIED (HTTP 403)
        """
        from rest_framework.test import force_authenticate

        # 1. Vikas manager checking in Rakesh -> ALLOWED
        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.rakesh.id,
            'external_user_id': self.rakesh.external_user_id,
            'vendor_id': self.vendor_vikas.id
        })
        force_authenticate(request, user=self.vikas_manager)
        response = self.view(request)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(AttendanceRecord.objects.filter(user=self.rakesh, vendor=self.vendor_vikas).exists())

        # 2. Vikas manager attempting to check in Chandan -> DENIED 403
        chandan = User.objects.create_user(
            username="9025739679_tm",
            first_name="Chandan",
            last_name="verma",
            external_user_id="6a8fc5c8df8e893b758aa2ee",
            role="OPERATOR"
        )
        req_chandan = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': chandan.id,
            'external_user_id': chandan.external_user_id,
            'vendor_id': self.vendor_vikas.id
        })
        force_authenticate(req_chandan, user=self.vikas_manager)
        res_chandan = self.view(req_chandan)
        self.assertEqual(res_chandan.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(AttendanceRecord.objects.filter(user=chandan).exists())

    def test_unresolvable_target_user_returns_404(self):
        """
        Passing non-existent external_user_id / user_id returns 404
        and does NOT silently check in request.user.
        """
        from rest_framework.test import force_authenticate

        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': 999999,
            'external_user_id': 'non_existent_external_id_999'
        })
        force_authenticate(request, user=self.premium_manager)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(AttendanceRecord.objects.filter(user=self.premium_manager).exists())

    def test_notification_failure_does_not_break_check_in(self):
        """
        If notify_user raises an exception, AttendanceRecord is still created
        and check-in returns HTTP 201 success.
        """
        from unittest.mock import patch
        from rest_framework.test import force_authenticate

        with patch('apps.attendance.views.notify_user', side_effect=RuntimeError("Notification service offline")):
            request = self.factory.post('/api/v1/attendance/check-in/', {
                'external_user_id': self.rakesh.external_user_id
            })
            force_authenticate(request, user=self.admin)
            response = self.view(request)

            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertTrue(response.data.get('success'))
            self.assertTrue(AttendanceRecord.objects.filter(user=self.rakesh).exists())


class VendorMultiMappingAttendanceTestCase(TestCase):
    def setUp(self):
        from rest_framework.test import APIRequestFactory
        from apps.attendance.views import AttendanceViewSet
        from apps.vendors.models import Vendor, HeroVendorAssignment
        from django.core.cache import cache

        cache.clear()
        self.factory = APIRequestFactory()
        self.view = AttendanceViewSet.as_view({'post': 'check_in'})

        # Vendors
        self.vendor_premium = Vendor.objects.create(
            name="Premium infra solutions",
            external_vendor_id="6aa540a512381cfcdf6a1ed5",
            is_active=True
        )

        self.vendor_vikas = Vendor.objects.create(
            name="Vikas kumar",
            external_vendor_id="6a95092f544bdedf53d4ec0a",
            is_active=True
        )

        self.vendor_raj = Vendor.objects.create(
            name="Raj Enterprises",
            external_vendor_id="6a8fc284544bdedf53d4ec09",
            is_active=True
        )

        # User 475: Satyanarayan Rajpurohit (Vendor user / manager for Premium)
        self.user_475 = User.objects.create_user(
            username="9664115330",
            first_name="Satyanarayan",
            last_name="Rajpurohit",
            phone_number="9664115330",
            employee_id="VND-9664115330",
            external_user_id="6aa540a5ea7c1bedb4c9c51f",
            vendor=self.vendor_premium,
            role="VENDOR",
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.user_475, vendor=self.vendor_premium, is_active=True)

        # User 447: Balaram (Tracker for Premium)
        self.user_447 = User.objects.create_user(
            username="8955011301",
            first_name="Balaram",
            last_name="",
            phone_number="8955011301",
            employee_id="EMP-447",
            external_user_id="6a95116a9b9a3a047ebccb9d",
            vendor=self.vendor_premium,
            role="TRACKER",
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.user_447, vendor=self.vendor_premium, is_active=True)

        # User 541: Rakesh Karwasra (Initially mapped to Vikas kumar, role=VIEWER, but has iLync membership in Premium)
        self.user_541 = User.objects.create_user(
            username="9116485564",
            first_name="Rakesh",
            last_name="karwasra",
            phone_number="9116485564",
            employee_id="EMP-12",
            external_user_id="6a95114cf475d920736bd827",
            vendor=self.vendor_vikas,
            role="VIEWER",
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.user_541, vendor=self.vendor_vikas, is_active=True)

        # User 436: Chandan Kumar verma (Raj Enterprises operator ONLY)
        self.user_436 = User.objects.create_user(
            username="9025739679",
            first_name="Chandan",
            last_name="Kumar verma",
            phone_number="9025739679",
            employee_id="EMP-436",
            external_user_id="6a8fc5c8df8e893b758aa2ee",
            vendor=self.vendor_raj,
            role="OPERATOR",
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.user_436, vendor=self.vendor_raj, is_active=True)

        # User Vikas Vendor (Vendor user for Vikas kumar)
        self.user_vikas_vendor = User.objects.create_user(
            username="9829000001",
            first_name="Vikas",
            last_name="kumar",
            phone_number="9829000001",
            employee_id="VND-VIKAS",
            external_user_id="6a95092f9b9a3a047ebccb98",
            vendor=self.vendor_vikas,
            role="VENDOR",
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.user_vikas_vendor, vendor=self.vendor_vikas, is_active=True)

        # User Raj Vendor (Vendor user for Raj Enterprises)
        self.user_raj_vendor = User.objects.create_user(
            username="9928396031",
            first_name="Sanwar",
            last_name="lal",
            phone_number="9928396031",
            employee_id="VND-RAJ",
            external_user_id="6a8fc283df8e893b758aa2e7",
            vendor=self.vendor_raj,
            role="VENDOR",
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.user_raj_vendor, vendor=self.vendor_raj, is_active=True)

    def test_sync_vendor_detail_links_associates_user_541_with_premium(self):
        """
        Ensure sync_vendor_detail_links updates User 541 with HeroVendorAssignment for Premium
        and updates role from VIEWER to OPERATOR without creating duplicate users.
        """
        from apps.vendors.services import sync_vendor_detail_links
        user_count_before = User.objects.count()

        mock_premium_payload = {
            "id": "6aa540a512381cfcdf6a1ed5",
            "partnerName": "Premium infra solutions",
            "users": [
                {
                    "userId": "6aa540a5ea7c1bedb4c9c51f",
                    "empId": "VND-9664115330",
                    "name": "Satyanarayan Rajpurohit",
                    "mobile": "9664115330",
                    "designation": "VENDOR",
                    "active": True
                },
                {
                    "userId": "6a95114cf475d920736bd827",
                    "empId": "EMP-12",
                    "name": "Rakesh karwasra",
                    "mobile": "9116485564",
                    "designation": "OPERATOR",
                    "active": True
                },
                {
                    "userId": "6a95116a9b9a3a047ebccb9d",
                    "empId": "EMP-447",
                    "name": "Balaram",
                    "mobile": "8955011301",
                    "designation": "TRACKER",
                    "active": True
                }
            ]
        }

        sync_vendor_detail_links(self.vendor_premium, mock_premium_payload)

        self.assertEqual(User.objects.count(), user_count_before)
        self.user_541.refresh_from_db()
        self.assertEqual(self.user_541.external_user_id, "6a95114cf475d920736bd827")
        self.assertEqual(self.user_541.role, "OPERATOR")

        # Verify User 541 is actively assigned to Premium infra solutions
        from apps.vendors.models import HeroVendorAssignment
        self.assertTrue(
            HeroVendorAssignment.objects.filter(
                user=self.user_541,
                vendor=self.vendor_premium,
                is_active=True
            ).exists()
        )

    def test_vendor_475_can_check_in_user_447(self):
        """Vendor 475 marking attendance for User 447 (Balaram) -> ALLOWED."""
        from rest_framework.test import force_authenticate
        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.user_447.id,
            'external_user_id': self.user_447.external_user_id,
            'vendor_id': self.vendor_premium.id,
            'latitude': 28.5355,
            'longitude': 77.3910
        })
        force_authenticate(request, user=self.user_475)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('success'))
        data = response.data.get('data')
        self.assertEqual(data['user_id'], self.user_447.id)
        self.assertEqual(data['external_user_id_snapshot'], "6a95116a9b9a3a047ebccb9d")
        self.assertEqual(data['vendor_name_snapshot'], "Premium infra solutions")

    def test_vendor_475_can_check_in_self(self):
        """Vendor 475 marking attendance for self -> ALLOWED."""
        from rest_framework.test import force_authenticate
        request = self.factory.post('/api/v1/attendance/check-in/', {
            'vendor_id': self.vendor_premium.id,
            'latitude': 28.5355,
            'longitude': 77.3910
        })
        force_authenticate(request, user=self.user_475)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('success'))
        data = response.data.get('data')
        self.assertEqual(data['user_id'], self.user_475.id)
        self.assertEqual(data['external_user_id_snapshot'], "6aa540a5ea7c1bedb4c9c51f")
        self.assertEqual(data['vendor_name_snapshot'], "Premium infra solutions")

    def test_vendor_475_can_check_in_user_541_rakesh_without_hero_assignment(self):
        """
        Vendor 475 marking attendance for User 541 (Rakesh) -> ALLOWED.
        Even though User 541 has vendor_id = Vikas kumar and NO HeroVendorAssignment for Premium,
        Rakesh is explicitly present in Premium's active iLync users[] roster.
        """
        from rest_framework.test import force_authenticate

        # Ensure user_541 has NO HeroVendorAssignment to Premium
        from apps.vendors.models import HeroVendorAssignment
        HeroVendorAssignment.objects.filter(user=self.user_541, vendor=self.vendor_premium).delete()
        self.assertEqual(self.user_541.vendor_id, self.vendor_vikas.id)

        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.user_541.id,
            'external_user_id': self.user_541.external_user_id,
            'vendor_id': self.vendor_premium.id,
            'latitude': 28.5355,
            'longitude': 77.3910
        })
        force_authenticate(request, user=self.user_475)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('success'))
        data = response.data.get('data')
        self.assertEqual(data['user_id'], self.user_541.id)
        self.assertEqual(data['external_user_id_snapshot'], "6a95114cf475d920736bd827")
        self.assertEqual(data['vendor_name_snapshot'], "Premium infra solutions")
        self.assertEqual(data['vendor_external_id_snapshot'], "6aa540a512381cfcdf6a1ed5")

        # Crucial: Hero User.vendor_id must NOT be altered
        self.user_541.refresh_from_db()
        self.assertEqual(self.user_541.vendor_id, self.vendor_vikas.id)

    def test_vendor_475_cannot_check_in_user_436_chandan(self):
        """Vendor 475 attempting to mark attendance for User 436 (Chandan under Raj Enterprises) -> DENIED with HTTP 403."""
        from rest_framework.test import force_authenticate

        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.user_436.id,
            'external_user_id': self.user_436.external_user_id,
            'vendor_id': self.vendor_premium.id
        })
        force_authenticate(request, user=self.user_475)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(AttendanceRecord.objects.filter(user=self.user_436, vendor=self.vendor_premium).exists())

    def test_raj_vendor_can_check_in_user_436_chandan(self):
        """Raj Enterprises vendor marking attendance for User 436 (Chandan) -> ALLOWED."""
        from rest_framework.test import force_authenticate

        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.user_436.id,
            'external_user_id': self.user_436.external_user_id,
            'vendor_id': self.vendor_raj.id,
            'latitude': 28.5355,
            'longitude': 77.3910
        })
        force_authenticate(request, user=self.user_raj_vendor)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('success'))
        data = response.data.get('data')
        self.assertEqual(data['user_id'], self.user_436.id)
        self.assertEqual(data['external_user_id_snapshot'], "6a8fc5c8df8e893b758aa2ee")
        self.assertEqual(data['vendor_name_snapshot'], "Raj Enterprises")

    def test_vikas_vendor_can_check_in_user_541_rakesh(self):
        """Vikas kumar vendor marking attendance for User 541 (Rakesh) -> ALLOWED (Rakesh is in Vikas iLync users[])."""
        from rest_framework.test import force_authenticate

        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.user_541.id,
            'external_user_id': self.user_541.external_user_id,
            'vendor_id': self.vendor_vikas.id,
            'latitude': 28.5355,
            'longitude': 77.3910
        })
        force_authenticate(request, user=self.user_vikas_vendor)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('success'))
        data = response.data.get('data')
        self.assertEqual(data['user_id'], self.user_541.id)
        self.assertEqual(data['external_user_id_snapshot'], "6a95114cf475d920736bd827")
        self.assertEqual(data['vendor_name_snapshot'], "Vikas kumar")

    def test_historical_records_and_identity_remain_unchanged(self):
        """Verify historical attendance records and snapshots are never modified by subsequent sync or check-in."""
        from datetime import date, timedelta
        yesterday = date.today() - timedelta(days=1)
        old_rec = AttendanceRecord.objects.create(
            user=self.user_541,
            vendor=self.vendor_vikas,
            date=yesterday,
            status='CHECKED_IN',
            external_user_id_snapshot="6a95114cf475d920736bd827",
            employee_id_snapshot="EMP-12",
            user_name_snapshot="Old Rakesh Name",
            vendor_name_snapshot="Vikas kumar",
            vendor_external_id_snapshot="6a95092f544bdedf53d4ec0a"
        )

        from apps.vendors.models import HeroVendorAssignment
        HeroVendorAssignment.objects.get_or_create(
            user=self.user_541,
            vendor=self.vendor_premium,
            defaults={'is_active': True}
        )

        from rest_framework.test import force_authenticate
        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.user_541.id,
            'external_user_id': self.user_541.external_user_id,
            'vendor_id': self.vendor_premium.id
        })
        force_authenticate(request, user=self.user_475)
        response = self.view(request)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify old record snapshots were completely untouched
        old_rec.refresh_from_db()
        self.assertEqual(old_rec.user_name_snapshot, "Old Rakesh Name")
        self.assertEqual(old_rec.vendor_name_snapshot, "Vikas kumar")
        self.assertEqual(old_rec.vendor_external_id_snapshot, "6a95092f544bdedf53d4ec0a")

    def test_vendor_475_can_check_in_team_member_with_foreign_vendor_id_in_payload(self):
        """
        When frontend or mobile sends vendor_id of the team member (e.g. Vikas kumar / 21)
        instead of the logged-in vendor's ID, the check-in MUST succeed and be authorized under Premium.
        """
        from rest_framework.test import force_authenticate
        request = self.factory.post('/api/v1/attendance/check-in/', {
            'user_id': self.user_541.id,
            'external_user_id': self.user_541.external_user_id,
            'vendor_id': self.vendor_vikas.id,  # Foreign vendor ID passed in body
            'latitude': 28.5355,
            'longitude': 77.3910
        })
        force_authenticate(request, user=self.user_475)
        response = self.view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('success'))
        data = response.data.get('data')
        self.assertEqual(data['user_id'], self.user_541.id)
        self.assertEqual(data['vendor_name_snapshot'], "Premium infra solutions")
        self.assertEqual(data['vendor_external_id_snapshot'], "6aa540a512381cfcdf6a1ed5")

    def test_vendor_475_can_team_check_in_user_541(self):
        """Verify team-check-in endpoint succeeds when marked by vendor 475."""
        from rest_framework.test import force_authenticate
        from apps.attendance.views import AttendanceViewSet
        view_team = AttendanceViewSet.as_view({'post': 'team_check_in'})
        request = self.factory.post('/api/v1/attendance/team-check-in/', {
            'marked_for_user_id': self.user_541.id,
            'external_user_id': self.user_541.external_user_id,
            'vendor_id': self.vendor_vikas.id
        })
        force_authenticate(request, user=self.user_475)
        response = view_team(request)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_vendor_475_can_bulk_mark_team_members(self):
        """Verify bulk-mark endpoint succeeds when marked by vendor 475."""
        from rest_framework.test import force_authenticate
        from apps.attendance.views import AttendanceViewSet
        view_bulk = AttendanceViewSet.as_view({'post': 'bulk_mark'})
        request = self.factory.post('/api/v1/attendance/bulk-mark/', {
            'date': '2026-09-19',
            'records': [
                {
                    'user_id': self.user_541.id,
                    'external_user_id': self.user_541.external_user_id,
                    'vendor_id': self.vendor_vikas.id,
                    'status': 'PRESENT'
                }
            ]
        }, format='json')
        force_authenticate(request, user=self.user_475)
        response = view_bulk(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('success'))

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()


class AttendanceRosterSyncTestCase(TestCase):
    def setUp(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.attendance.views import AttendanceViewSet
        from apps.vendors.models import Vendor, HeroVendorAssignment
        from django.core.cache import cache

        cache.clear()
        self.factory = APIRequestFactory()
        self.view_roster = AttendanceViewSet.as_view({'get': 'get_team_attendance'})
        self.view_check_in = AttendanceViewSet.as_view({'post': 'check_in'})

        self.vendor_raj = Vendor.objects.create(
            name="Raj Enterprises Sync Test",
            external_vendor_id="SYNC_RAJ_001",
            is_active=True
        )

        self.vendor_premium = Vendor.objects.create(
            name="Premium Sync Test",
            external_vendor_id="SYNC_PREM_002",
            is_active=True
        )

        self.vendor_vikas = Vendor.objects.create(
            name="Vikas Sync Test",
            external_vendor_id="SYNC_VIKAS_003",
            is_active=True
        )

        self.admin = User.objects.create_user(
            username="admin_sync",
            email="admin_sync@example.com",
            role="ADMIN",
            is_superuser=True
        )

        self.raj_mgr = User.objects.create_user(
            username="raj_mgr",
            email="raj_mgr@example.com",
            first_name="Raj",
            last_name="Manager",
            role="VENDOR",
            vendor=self.vendor_raj,
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.raj_mgr, vendor=self.vendor_raj, is_active=True)

        self.user_001 = User.objects.create_user(
            username="user_001",
            first_name="Old",
            last_name="Name",
            phone_number="9999999999",
            employee_id="EMP-001",
            external_user_id="USER_001",
            vendor=self.vendor_raj,
            role="OPERATOR",
            is_active=True
        )
        HeroVendorAssignment.objects.create(user=self.user_001, vendor=self.vendor_raj, is_active=True)

    def test_01_ilync_adds_user_appears_in_roster(self):
        """1. New user added in iLync -> appears in Hero current roster and mapping created."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate
        from apps.vendors.models import HeroVendorAssignment

        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "NEW_USER_999",
                    "empId": "EMP-NEW-999",
                    "name": "New Team Member",
                    "mobile": "9876543210",
                    "email": "new_team@example.com",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            request = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(request, user=self.admin)
            response = self.view_roster(request)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            team_members = response.data['data']['team_members']
            uids = [m.get('external_user_id') for m in team_members]
            self.assertIn("NEW_USER_999", uids)

            member_row = next(m for m in team_members if m.get('external_user_id') == "NEW_USER_999")
            self.assertEqual(member_row['user_name'], "New Team Member")
            self.assertEqual(member_row['phone_number'], "9876543210")
            self.assertEqual(member_row['employee_id'], "EMP-NEW-999")

            # Verify local Hero user was created
            created_u = User.objects.filter(external_user_id="NEW_USER_999").first()
            self.assertIsNotNone(created_u)
            self.assertEqual(created_u.first_name, "New")
            self.assertEqual(created_u.last_name, "Team Member")
            self.assertTrue(created_u.is_active)
            self.assertTrue(HeroVendorAssignment.objects.filter(user=created_u, vendor=self.vendor_raj, is_active=True).exists())

    def test_02_ilync_changes_name_shows_new_name(self):
        """2. User changes name in iLync -> current roster shows new name without duplicate users."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate

        user_count_before = User.objects.count()
        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "USER_001",
                    "empId": "EMP-001",
                    "name": "Updated Full Name",
                    "mobile": "9999999999",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            request = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(request, user=self.admin)
            response = self.view_roster(request)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            team_members = response.data['data']['team_members']
            member_row = next(m for m in team_members if m.get('external_user_id') == "USER_001")
            self.assertEqual(member_row['user_name'], "Updated Full Name")

            # No duplicate user created
            self.assertEqual(User.objects.count(), user_count_before)
            self.user_001.refresh_from_db()
            self.assertEqual(self.user_001.first_name, "Updated")
            self.assertEqual(self.user_001.last_name, "Full Name")

    def test_03_ilync_changes_phone_shows_new_phone(self):
        """3. User changes phone in iLync -> current roster shows new phone without duplicate users."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate

        user_count_before = User.objects.count()
        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "USER_001",
                    "empId": "EMP-001",
                    "name": "Old Name",
                    "mobile": "8888777766",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            request = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(request, user=self.admin)
            response = self.view_roster(request)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            team_members = response.data['data']['team_members']
            member_row = next(m for m in team_members if m.get('external_user_id') == "USER_001")
            self.assertEqual(member_row['phone_number'], "8888777766")

            self.assertEqual(User.objects.count(), user_count_before)
            self.user_001.refresh_from_db()
            self.assertEqual(self.user_001.phone_number, "8888777766")

    def test_04_ilync_deactivates_user_disappears_from_roster(self):
        """4. User deactivated (active=False) in iLync -> disappears from current Hero roster."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate

        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "USER_001",
                    "empId": "EMP-001",
                    "name": "Old Name",
                    "mobile": "9999999999",
                    "designation": "OPERATOR",
                    "active": False
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            request = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(request, user=self.admin)
            response = self.view_roster(request)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            team_members = response.data['data']['team_members']
            uids = [m.get('external_user_id') for m in team_members]
            self.assertNotIn("USER_001", uids)

            # User must NOT be physically deleted
            self.assertTrue(User.objects.filter(external_user_id="USER_001").exists())

    def test_05_ilync_removes_user_disappears_from_roster(self):
        """5. User removed from iLync vendor users[] -> disappears from current Hero roster, not deleted physically."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate
        from apps.vendors.models import HeroVendorAssignment

        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "OTHER_USER_123",
                    "empId": "EMP-OTHER",
                    "name": "Other Active User",
                    "mobile": "9123456780",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            request = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(request, user=self.admin)
            response = self.view_roster(request)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            team_members = response.data['data']['team_members']
            uids = [m.get('external_user_id') for m in team_members]
            self.assertNotIn("USER_001", uids)
            self.assertIn("OTHER_USER_123", uids)

            # User_001 is NOT deleted physically, but marked inactive
            self.assertTrue(User.objects.filter(external_user_id="USER_001").exists())
            self.user_001.refresh_from_db()
            self.assertFalse(self.user_001.is_active)
            self.assertFalse(HeroVendorAssignment.objects.filter(user=self.user_001, vendor=self.vendor_raj, is_active=True).exists())

    def test_06_historical_attendance_remains_unchanged_after_user_update(self):
        """6. Historical AttendanceRecord snapshots remain intact after user profile updates in iLync."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate
        from datetime import timedelta

        today = timezone.localdate()
        yesterday = today - timedelta(days=1)

        # Yesterday attendance created with snapshot "MS Rekha Ram"
        hist_rec = AttendanceRecord.objects.create(
            user=self.user_001,
            vendor=self.vendor_raj,
            date=yesterday,
            status='PRESENT',
            attendance_type='TEAM',
            user_name_snapshot='MS Rekha Ram',
            employee_id_snapshot='EMP-001',
            external_user_id_snapshot='USER_001',
            vendor_name_snapshot='Raj Enterprises',
            vendor_external_id_snapshot=self.vendor_raj.external_vendor_id
        )

        # Today iLync updates user profile to "Pranjal 2"
        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "USER_001",
                    "empId": "EMP-001",
                    "name": "Pranjal 2",
                    "mobile": "9999999999",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            # Today roster
            req_today = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}&date={today}')
            force_authenticate(req_today, user=self.admin)
            res_today = self.view_roster(req_today)
            self.assertEqual(res_today.status_code, status.HTTP_200_OK)
            m_today = next(m for m in res_today.data['data']['team_members'] if m.get('external_user_id') == "USER_001")
            self.assertEqual(m_today['user_name'], "Pranjal 2")

            # Yesterday roster
            req_yesterday = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}&date={yesterday}')
            force_authenticate(req_yesterday, user=self.admin)
            res_yesterday = self.view_roster(req_yesterday)
            self.assertEqual(res_yesterday.status_code, status.HTTP_200_OK)
            m_yesterday = next(m for m in res_yesterday.data['data']['team_members'] if m.get('external_user_id') == "USER_001")
            self.assertEqual(m_yesterday['user_name'], "MS Rekha Ram")

            # Historical record completely untouched in DB
            hist_rec.refresh_from_db()
            self.assertEqual(hist_rec.user_name_snapshot, "MS Rekha Ram")
            self.assertEqual(hist_rec.external_user_id_snapshot, "USER_001")

    def test_07_ilync_timeout_does_not_delete_or_deactivate_users(self):
        """7. iLync timeout -> existing users are NOT deleted or deactivated."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate
        from django.core.cache import cache
        import requests

        # Set last known good cache
        last_good_key = f"ilync_vendor_detail_last_good_{self.vendor_raj.external_vendor_id}"
        cache.set(last_good_key, {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "USER_001",
                    "empId": "EMP-001",
                    "name": "Old Name",
                    "mobile": "9999999999",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }, timeout=86400)

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', side_effect=requests.exceptions.Timeout("Connection timed out")):
            request = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(request, user=self.admin)
            response = self.view_roster(request)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            team_members = response.data['data']['team_members']
            uids = [m.get('external_user_id') for m in team_members]
            self.assertIn("USER_001", uids)

            # Ensure user is not deactivated
            self.user_001.refresh_from_db()
            self.assertTrue(self.user_001.is_active)

    def test_08_ilync_500_does_not_delete_or_deactivate_users(self):
        """8. iLync 500 error -> existing users are NOT deleted or deactivated."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate
        from django.core.cache import cache

        # Set last known good cache
        last_good_key = f"ilync_vendor_detail_last_good_{self.vendor_raj.external_vendor_id}"
        cache.set(last_good_key, {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": "USER_001",
                    "empId": "EMP-001",
                    "name": "Old Name",
                    "mobile": "9999999999",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }, timeout=86400)

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': False, 'message': '500 Internal Server Error'}):
            request = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(request, user=self.admin)
            response = self.view_roster(request)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            team_members = response.data['data']['team_members']
            uids = [m.get('external_user_id') for m in team_members]
            self.assertIn("USER_001", uids)

            self.user_001.refresh_from_db()
            self.assertTrue(self.user_001.is_active)

    def test_09_multi_vendor_user_appears_in_respective_vendors(self):
        """9. Multi-vendor user appears only in vendors whose live iLync users[] contain that user."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate

        rakesh_uid = "6a95114cf475d920736bd827"
        def mock_get_vendor(ext_id):
            if ext_id == self.vendor_premium.external_vendor_id:
                return {'success': True, 'data': {
                    'id': ext_id,
                    'partnerName': 'Premium infra solutions',
                    'users': [{'userId': rakesh_uid, 'name': 'Rakesh Karwasra', 'mobile': '9116485564', 'active': True}]
                }}
            elif ext_id == self.vendor_vikas.external_vendor_id:
                return {'success': True, 'data': {
                    'id': ext_id,
                    'partnerName': 'Vikas kumar',
                    'users': [{'userId': rakesh_uid, 'name': 'Rakesh Karwasra', 'mobile': '9116485564', 'active': True}]
                }}
            elif ext_id == self.vendor_raj.external_vendor_id:
                return {'success': True, 'data': {
                    'id': ext_id,
                    'partnerName': 'Raj Enterprises',
                    'users': [{'userId': 'RAJ_ONLY_USER', 'name': 'Sanwar lal', 'mobile': '9928396031', 'active': True}]
                }}
            return {'success': False}

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', side_effect=mock_get_vendor):
            # 1. Premium roster has Rakesh
            req_prem = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_premium.external_vendor_id}')
            force_authenticate(req_prem, user=self.admin)
            res_prem = self.view_roster(req_prem)
            uids_prem = [m.get('external_user_id') for m in res_prem.data['data']['team_members']]
            self.assertIn(rakesh_uid, uids_prem)

            # 2. Vikas roster has Rakesh
            req_vikas = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_vikas.external_vendor_id}')
            force_authenticate(req_vikas, user=self.admin)
            res_vikas = self.view_roster(req_vikas)
            uids_vikas = [m.get('external_user_id') for m in res_vikas.data['data']['team_members']]
            self.assertIn(rakesh_uid, uids_vikas)

            # 3. Raj roster does NOT have Rakesh
            req_raj = self.factory.get(f'/api/v1/attendance/team-attendance/?vendor_id={self.vendor_raj.external_vendor_id}')
            force_authenticate(req_raj, user=self.admin)
            res_raj = self.view_roster(req_raj)
            uids_raj = [m.get('external_user_id') for m in res_raj.data['data']['team_members']]
            self.assertNotIn(rakesh_uid, uids_raj)

    def test_10_new_ilync_user_can_perform_attendance(self):
        """10. New iLync user can perform attendance after appearing in active users[]."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate

        new_uid = "NEW_ILYNC_USER_777"
        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": new_uid,
                    "empId": "EMP-777",
                    "name": "Pooja Sharma",
                    "mobile": "9829999999",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            # Vendor manager marks attendance for Pooja
            request = self.factory.post('/api/v1/attendance/check-in/', {
                'external_user_id': new_uid,
                'vendor_id': self.vendor_raj.id,
                'latitude': 28.5355,
                'longitude': 77.3910
            })
            force_authenticate(request, user=self.raj_mgr)
            response = self.view_check_in(request)

            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertTrue(response.data.get('success'))
            data = response.data.get('data')
            self.assertEqual(data['external_user_id_snapshot'], new_uid)
            self.assertEqual(data['vendor_external_id_snapshot'], self.vendor_raj.external_vendor_id)

    def test_11_removed_or_inactive_user_cannot_perform_attendance(self):
        """11. Removed or inactive iLync user cannot perform attendance under that vendor."""
        from unittest.mock import patch
        from rest_framework.test import force_authenticate

        inactive_uid = "INACTIVE_USER_404"
        inactive_user = User.objects.create_user(
            username="inactive_emp",
            external_user_id=inactive_uid,
            phone_number="9777777777",
            vendor=self.vendor_raj,
            role="OPERATOR",
            is_active=True
        )

        mock_payload = {
            "id": self.vendor_raj.external_vendor_id,
            "partnerName": "Raj Enterprises",
            "users": [
                {
                    "userId": inactive_uid,
                    "empId": "EMP-INACTIVE",
                    "name": "Inactive Worker",
                    "mobile": "9777777777",
                    "designation": "OPERATOR",
                    "active": False  # Deactivated in iLync
                }
            ]
        }

        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_payload}):
            request = self.factory.post('/api/v1/attendance/check-in/', {
                'external_user_id': inactive_uid,
                'vendor_id': self.vendor_raj.id
            })
            force_authenticate(request, user=self.raj_mgr)
            response = self.view_check_in(request)

            # Must be denied (HTTP 403 Forbidden)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            err_msg = str(response.data.get('message') or response.data.get('detail') or response.data)
            self.assertIn("not an active team member", err_msg)

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()
