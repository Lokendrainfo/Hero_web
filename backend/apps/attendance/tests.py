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



