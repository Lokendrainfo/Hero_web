from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.utils import timezone
from apps.authentication.models import User
from apps.roles.models import Role, UserRole
from apps.vendors.models import Vendor, HeroVendorAssignment
from apps.attendance.models import AttendanceRecord
from apps.integrations.ilync_user_sync import (
    sync_ilync_user_to_django,
    fetch_and_sync_all_ilync_users,
    map_ilync_role,
    SyncResult
)
from apps.vendors.services import sync_vendor_detail_links


class SafeIlyncUserSyncTests(TestCase):
    def setUp(self):
        # Create vendors
        self.vendor_shyam = Vendor.objects.create(
            name="SHREE SHYAM ENTERPRISES 002",
            code="SHYAM002",
            external_vendor_id="6aa3f3de12381cfcdf6a1ed4",
            is_active=True
        )
        self.vendor_vikas = Vendor.objects.create(
            name="Vikas Kumar",
            code="VIKAS",
            external_vendor_id="67417e94e772ea4cbf988a87",
            is_active=True
        )

        # Create roles
        self.role_viewer, _ = Role.objects.get_or_create(name="Viewer", defaults={'code': 'VIEWER'})
        self.role_manager, _ = Role.objects.get_or_create(name="Area Manager", defaults={'code': 'AREA_MANAGER'})

        # Reporting manager
        self.manager_user = User.objects.create(
            username="reporting_mgr_01",
            first_name="General",
            last_name="Manager",
            is_active=True
        )

        # Create existing Hero user Ajay Nayak with Area Manager role, vendor SHYAM, and reporting manager
        self.ajay_nayak = User.objects.create(
            username="9783847236",
            external_user_id="6ab756513bc56da28e43587c",
            employee_id="9783847236",
            phone_number="9783847236",
            first_name="Ajay",
            last_name="Nayak",
            role="Area Manager",
            vendor=self.vendor_shyam,
            reporting_manager=self.manager_user,
            is_active=True
        )
        self.ajay_nayak.roles.add(self.role_manager)
        HeroVendorAssignment.objects.create(
            user=self.ajay_nayak,
            vendor=self.vendor_shyam,
            is_active=True
        )

        # Create user Ajayveer Yadav
        self.ajayveer = User.objects.create(
            username="1000003",
            external_user_id="69ef970c5983e6e230cd35fd",
            employee_id="1000003",
            first_name="AJAYVEER",
            last_name="YADAV",
            role="Area Manager",
            vendor=self.vendor_shyam,
            is_active=True
        )
        HeroVendorAssignment.objects.create(
            user=self.ajayveer,
            vendor=self.vendor_shyam,
            is_active=True
        )

    def test_01_new_ilync_user_creates_hero_user(self):
        """1. A genuinely new iLync user creates a Hero user automatically."""
        payload = {
            "id": "new_user_uuid_9999",
            "empId": "EMP-9999",
            "phoneNumber": "9998887777",
            "name": "Rohan Sharma",
            "email": "rohan@example.com",
            "designation": "Field-Surveyor",
            "roleKey": "L1_USER",
            "active": True
        }
        user, status = sync_ilync_user_to_django(payload)
        self.assertEqual(status, 'CREATED')
        self.assertIsNotNone(user)
        self.assertEqual(user.external_user_id, "new_user_uuid_9999")
        self.assertEqual(user.employee_id, "EMP-9999")
        self.assertEqual(user.first_name, "Rohan")
        self.assertEqual(user.last_name, "Sharma")
        self.assertTrue(user.is_active)

    def test_02_existing_ilync_user_updates_profile(self):
        """2. Existing iLync user updates profile fields safely."""
        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Kumar Nayak",
            "email": "ajay.nayak@example.com",
            "phoneNumber": "9783847236",
            "active": True
        }
        user, status = sync_ilync_user_to_django(payload)
        self.assertEqual(status, 'UPDATED')
        self.assertEqual(user.id, self.ajay_nayak.id)
        self.assertEqual(user.first_name, "Ajay")
        self.assertEqual(user.last_name, "Kumar Nayak")
        self.assertEqual(user.email, "ajay.nayak@example.com")

    def test_03_existing_hero_role_is_preserved(self):
        """3. Existing Hero role is NOT overwritten by iLync designation (e.g. OPERATOR vs Area Manager)."""
        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Nayak",
            "roleKey": "L1_USER",
            "designation": "OPERATOR",
            "active": True
        }
        user, status = sync_ilync_user_to_django(payload)
        self.ajay_nayak.refresh_from_db()
        self.assertEqual(self.ajay_nayak.role, "Area Manager")
        self.assertTrue(self.ajay_nayak.roles.filter(name="Area Manager").exists())

    def test_04_existing_vendor_assignment_is_preserved(self):
        """4. Existing vendor assignment is preserved during sync."""
        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Nayak",
            "active": True
        }
        user, status = sync_ilync_user_to_django(payload)
        self.ajay_nayak.refresh_from_db()
        self.assertEqual(self.ajay_nayak.vendor, self.vendor_shyam)
        self.assertTrue(HeroVendorAssignment.objects.filter(user=self.ajay_nayak, vendor=self.vendor_shyam, is_active=True).exists())

    def test_05_existing_reporting_manager_is_preserved(self):
        """5. Existing reporting manager is NOT removed during iLync sync."""
        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Nayak",
            "active": True
        }
        user, status = sync_ilync_user_to_django(payload)
        self.ajay_nayak.refresh_from_db()
        self.assertEqual(self.ajay_nayak.reporting_manager, self.manager_user)

    def test_06_existing_permissions_are_preserved(self):
        """6. Existing user permissions and roles are untouched."""
        self.ajay_nayak.refresh_from_db()
        roles_before = list(self.ajay_nayak.roles.values_list('id', flat=True))
        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Nayak",
            "active": True
        }
        sync_ilync_user_to_django(payload)
        self.ajay_nayak.refresh_from_db()
        roles_after = list(self.ajay_nayak.roles.values_list('id', flat=True))
        self.assertEqual(roles_before, roles_after)

    def test_07_user_missing_from_one_api_response_is_not_deactivated(self):
        """7. User missing from an iLync vendor response is NOT deactivated (vendor sync)."""
        # Simulate vendor sync for SHYAM returning only 1 other user
        mock_vendor_payload = {
            "id": self.vendor_shyam.external_vendor_id,
            "partnerName": self.vendor_shyam.name,
            "users": [
                {
                    "userId": "SOME_OTHER_USER",
                    "empId": "EMP-OTHER",
                    "name": "Other Person",
                    "mobile": "9811122233",
                    "designation": "OPERATOR",
                    "active": True
                }
            ]
        }
        with patch('apps.integrations.ilync_client.IlyncClient.get_vendor_by_id', return_value={'success': True, 'data': mock_vendor_payload}):
            sync_vendor_detail_links(self.vendor_shyam, self.vendor_shyam.external_vendor_id)

            # Ajay Nayak and Ajayveer Yadav were NOT in mock_vendor_payload users[]
            # They MUST remain active and keep their vendor & assignments
            self.ajay_nayak.refresh_from_db()
            self.assertTrue(self.ajay_nayak.is_active)
            self.assertEqual(self.ajay_nayak.vendor, self.vendor_shyam)
            self.assertTrue(HeroVendorAssignment.objects.filter(user=self.ajay_nayak, vendor=self.vendor_shyam, is_active=True).exists())

            self.ajayveer.refresh_from_db()
            self.assertTrue(self.ajayveer.is_active)
            self.assertEqual(self.ajayveer.vendor, self.vendor_shyam)
            self.assertTrue(HeroVendorAssignment.objects.filter(user=self.ajayveer, vendor=self.vendor_shyam, is_active=True).exists())

    def test_08_api_failure_does_not_deactivate_users(self):
        """8. An API failure (e.g. 500 error / None response) modifies ZERO user state."""
        with patch('apps.integrations.ilync_client.IlyncClient.get_users', return_value={'success': False, 'statusCode': 500, 'message': 'Internal Error'}):
            res = fetch_and_sync_all_ilync_users(max_pages=5, size=10)
            self.assertEqual(res.errors, 1)
            self.assertEqual(res.created, 0)
            self.assertEqual(res.updated, 0)

            # Users remain untouched and active
            self.ajay_nayak.refresh_from_db()
            self.assertTrue(self.ajay_nayak.is_active)

    def test_09_pagination_processes_all_users(self):
        """9. Pagination processes multiple pages according to totalPages."""
        page_0 = {
            'success': True,
            'data': {
                'content': [
                    {'id': 'PAGE0_USER1', 'empId': 'P0U1', 'name': 'Page Zero User', 'active': True}
                ],
                'totalPages': 2,
                'totalElements': 2,
                'last': False
            }
        }
        page_1 = {
            'success': True,
            'data': {
                'content': [
                    {'id': 'PAGE1_USER1', 'empId': 'P1U1', 'name': 'Page One User', 'active': True}
                ],
                'totalPages': 2,
                'totalElements': 2,
                'last': True
            }
        }

        def mock_get_users(page=0, size=10):
            if page == 0:
                return page_0
            return page_1

        with patch('apps.integrations.ilync_client.IlyncClient.get_users', side_effect=mock_get_users):
            res = fetch_and_sync_all_ilync_users(max_pages=10, size=10)
            self.assertEqual(res.created, 2)
            self.assertTrue(User.objects.filter(external_user_id='PAGE0_USER1').exists())
            self.assertTrue(User.objects.filter(external_user_id='PAGE1_USER1').exists())

    def test_10_multi_vendor_user_remains_active_if_active_in_another_vendor(self):
        """10. Multi-vendor user remains active under their other vendor."""
        # Assign Ajay Nayak also to VIKAS
        HeroVendorAssignment.objects.create(
            user=self.ajay_nayak,
            vendor=self.vendor_vikas,
            is_active=True
        )

        # Deactivation signal from one vendor with other active vendors preserves user
        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Nayak",
            "active": False,
            "vendorId": self.vendor_shyam.external_vendor_id
        }
        sync_ilync_user_to_django(payload)
        self.ajay_nayak.refresh_from_db()
        # Because they are active under VIKAS, user remains active
        self.assertTrue(self.ajay_nayak.is_active)

    def test_11_duplicate_external_user_id_does_not_create_duplicate(self):
        """11. Calling sync multiple times with the same external_user_id does NOT duplicate records."""
        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Nayak",
            "active": True
        }
        count_before = User.objects.filter(external_user_id="6ab756513bc56da28e43587c").count()
        user, status = sync_ilync_user_to_django(payload)
        count_after = User.objects.filter(external_user_id="6ab756513bc56da28e43587c").count()
        self.assertEqual(count_before, 1)
        self.assertEqual(count_after, 1)

    def test_12_historical_attendance_is_untouched(self):
        """12. Historical attendance records are never modified by iLync sync."""
        yesterday = timezone.localdate() - timezone.timedelta(days=1)
        att = AttendanceRecord.objects.create(
            user=self.ajay_nayak,
            vendor=self.vendor_shyam,
            date=yesterday,
            status='PRESENT',
            marked_by=self.manager_user
        )

        payload = {
            "id": "6ab756513bc56da28e43587c",
            "empId": "9783847236",
            "name": "Ajay Updated Nayak",
            "active": True
        }
        sync_ilync_user_to_django(payload)

        att.refresh_from_db()
        self.assertEqual(att.status, 'PRESENT')
        self.assertEqual(att.user_id, self.ajay_nayak.id)
        self.assertEqual(att.vendor_id, self.vendor_shyam.id)
