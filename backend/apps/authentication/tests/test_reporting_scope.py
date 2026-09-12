from django.test import TestCase
from django.core.exceptions import ValidationError
from apps.authentication.models import User
from apps.vendors.models import Vendor, HeroVendorAssignment
from apps.roles.models import Role, Permission
from apps.common.reporting_scope import (
    get_reporting_scope,
    prevent_circular_reporting,
    filter_queryset_by_reporting_and_vendor
)

class ReportingScopeTestCase(TestCase):
    def setUp(self):
        # Create Vendors
        self.vendor_shree_shyam = Vendor.objects.create(
            name="Shree Shyam Enterprise",
            code="SSE01",
            external_vendor_id="vendor_shree_shyam"
        )
        self.vendor_naveen_telecom = Vendor.objects.create(
            name="Naveen Telecom Network 2",
            code="NTN02",
            external_vendor_id="vendor_naveen_telecom"
        )

        # Create Permissions & Roles
        self.perm_tasks, _ = Permission.objects.get_or_create(code="tasks.view", defaults={'name': "View Tasks"})
        self.perm_expenses, _ = Permission.objects.get_or_create(code="expenses.view", defaults={'name': "View Expenses"})

        self.role_manager, _ = Role.objects.get_or_create(code="PROJECT_MANAGER", defaults={'name': "PROJECT_MANAGER"})
        self.role_manager.permissions.set([self.perm_tasks]) # Only tasks, no expenses

        self.role_operator, _ = Role.objects.get_or_create(code="OPERATOR", defaults={'name': "OPERATOR"})
        self.role_operator.permissions.set([self.perm_tasks, self.perm_expenses])

    def test_case_1_three_level_hierarchy(self):
        """
        CASE 1: Shakti -> Abhishek -> Lokendra
        Shakti sees: Shakti, Abhishek, Lokendra
        Abhishek sees: Abhishek, Lokendra
        Lokendra sees: Lokendra
        """
        shakti = User.objects.create(username="shakti", email="shakti@hero.com")
        abhishek = User.objects.create(username="abhishek", email="abhishek@hero.com", reporting_manager=shakti)
        lokendra = User.objects.create(username="lokendra", email="lokendra@hero.com", reporting_manager=abhishek)

        shakti_scope = set(get_reporting_scope(shakti))
        abhishek_scope = set(get_reporting_scope(abhishek))
        lokendra_scope = set(get_reporting_scope(lokendra))

        self.assertEqual(shakti_scope, {shakti.id, abhishek.id, lokendra.id})
        self.assertEqual(abhishek_scope, {abhishek.id, lokendra.id})
        self.assertEqual(lokendra_scope, {lokendra.id})

    def test_case_2_four_level_hierarchy(self):
        """
        CASE 2: A -> B -> C -> D
        A sees A, B, C, D
        B sees B, C, D
        C sees C, D
        D sees D
        """
        a = User.objects.create(username="user_a")
        b = User.objects.create(username="user_b", reporting_manager=a)
        c = User.objects.create(username="user_c", reporting_manager=b)
        d = User.objects.create(username="user_d", reporting_manager=c)

        self.assertEqual(set(get_reporting_scope(a)), {a.id, b.id, c.id, d.id})
        self.assertEqual(set(get_reporting_scope(b)), {b.id, c.id, d.id})
        self.assertEqual(set(get_reporting_scope(c)), {c.id, d.id})
        self.assertEqual(set(get_reporting_scope(d)), {d.id})

    def test_case_3_multiple_direct_reports(self):
        """
        CASE 3:
        Shakti
          ├── Abhishek
          ├── Lokendra
          └── Narendra
        Shakti sees all four users.
        """
        shakti = User.objects.create(username="shakti_c3")
        abhishek = User.objects.create(username="abhishek_c3", reporting_manager=shakti)
        lokendra = User.objects.create(username="lokendra_c3", reporting_manager=shakti)
        narendra = User.objects.create(username="narendra_c3", reporting_manager=shakti)

        self.assertEqual(set(get_reporting_scope(shakti)), {shakti.id, abhishek.id, lokendra.id, narendra.id})

    def test_case_4_multiple_branches(self):
        """
        CASE 4:
        Shakti
          ├── Abhishek -> Lokendra
          └── Narendra -> User X
        Shakti sees all 5 users.
        """
        shakti = User.objects.create(username="shakti_c4")
        abhishek = User.objects.create(username="abhishek_c4", reporting_manager=shakti)
        lokendra = User.objects.create(username="lokendra_c4", reporting_manager=abhishek)
        narendra = User.objects.create(username="narendra_c4", reporting_manager=shakti)
        user_x = User.objects.create(username="user_x_c4", reporting_manager=narendra)

        self.assertEqual(set(get_reporting_scope(shakti)), {shakti.id, abhishek.id, lokendra.id, narendra.id, user_x.id})

    def test_case_5_circular_assignment_prevention(self):
        """
        CASE 5: Circular assignment must be rejected.
        A -> B -> C. Attempting C -> A as manager must fail.
        Also self-reporting (A -> A) must fail.
        """
        a = User.objects.create(username="user_a_c5")
        b = User.objects.create(username="user_b_c5", reporting_manager=a)
        c = User.objects.create(username="user_c_c5", reporting_manager=b)

        # 1. Self reporting
        with self.assertRaises(ValidationError):
            prevent_circular_reporting(a, a)

        # 2. Circular reporting (C trying to become A's manager)
        with self.assertRaises(ValidationError):
            prevent_circular_reporting(a, c)

        # 3. Model clean validation
        a.reporting_manager = c
        with self.assertRaises(ValidationError):
            a.clean()

    def test_case_6_user_without_subordinates(self):
        """
        CASE 6: User without subordinates sees only their own data.
        """
        standalone = User.objects.create(username="standalone_user")
        self.assertEqual(get_reporting_scope(standalone), [standalone.id])

    def test_case_7_permission_check_requirement(self):
        """
        CASE 7: Manager has reporting relationship over subordinate, but lacks module permission.
        Manager must receive NO data for that module.
        """
        shakti = User.objects.create(username="shakti_c7", role="PROJECT_MANAGER", vendor=self.vendor_shree_shyam)
        shakti.roles.set([self.role_manager]) # has tasks.view, but NOT expenses.view
        HeroVendorAssignment.objects.create(user=shakti, vendor=self.vendor_shree_shyam, is_active=True)

        lokendra = User.objects.create(username="lokendra_c7", reporting_manager=shakti, role="OPERATOR", vendor=self.vendor_shree_shyam)
        lokendra.roles.set([self.role_operator])
        HeroVendorAssignment.objects.create(user=lokendra, vendor=self.vendor_shree_shyam, is_active=True)

        # Query User objects filtering by expenses.view permission
        qs = filter_queryset_by_reporting_and_vendor(
            User.objects.all(),
            shakti,
            user_field='id',
            permission_code="expenses.view"
        )
        self.assertEqual(qs.count(), 0) # Lacks permission -> 0 items returned

        # Filter with tasks.view permission
        qs_tasks = filter_queryset_by_reporting_and_vendor(
            User.objects.all(),
            shakti,
            user_field='id',
            permission_code="tasks.view"
        )
        self.assertIn(shakti, qs_tasks)
        self.assertIn(lokendra, qs_tasks)

    def test_case_8_and_9_vendor_scope_isolation_preserved(self):
        """
        CASE 8 & 9: Vendor scope isolation preserved.
        Narendra Kumar belongs only to Shree Shyam Enterprise.
        Even if Narendra manages someone, vendor scope strictly limits query to Shree Shyam Enterprise.
        """
        narendra = User.objects.create(username="narendra_c8", role="SUPERVISOR", vendor=self.vendor_shree_shyam)
        HeroVendorAssignment.objects.create(user=narendra, vendor=self.vendor_shree_shyam, is_active=True)

        user_in_other_vendor = User.objects.create(
            username="user_other_vendor",
            role="OPERATOR",
            vendor=self.vendor_naveen_telecom,
            reporting_manager=narendra
        )
        HeroVendorAssignment.objects.create(user=user_in_other_vendor, vendor=self.vendor_naveen_telecom, is_active=True)

        # Filter users for Narendra
        qs = filter_queryset_by_reporting_and_vendor(
            User.objects.all(),
            narendra,
            user_field='id',
            vendor_field='vendor_id'
        )

        # Narendra can see Narendra (Shree Shyam Enterprise), but NOT user_in_other_vendor (Naveen Telecom Network 2)
        self.assertIn(narendra, qs)
        self.assertNotIn(user_in_other_vendor, qs)
