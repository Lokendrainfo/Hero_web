import io
from decimal import Decimal
from django.test import TestCase
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework import status
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.vendors.models import Vendor
from apps.authentication.models import User
from apps.expenses.models import ExpenseCategory, Expense

def get_data(res):
    if isinstance(res.data, dict) and 'data' in res.data:
        return res.data['data']
    return res.data

class ExpenseMasterTestSuite(TestCase):
    def setUp(self):
        # Create test vendors
        self.vendor_a = Vendor.objects.create(name="VENDOR ALPHA", code="VEN_A")
        self.vendor_b = Vendor.objects.create(name="VENDOR BETA", code="VEN_B")

        # Create admin and vendor users
        self.admin_user = User.objects.create_user(
            username="admin_user",
            email="admin@hero.com",
            password="password123",
            role="ADMIN",
            is_staff=True,
            is_superuser=True
        )
        self.user_a = User.objects.create_user(
            username="vendor_user_a",
            email="user_a@hero.com",
            password="password123",
            role="VENDOR",
            vendor=self.vendor_a
        )
        self.user_b = User.objects.create_user(
            username="vendor_user_b",
            email="user_b@hero.com",
            password="password123",
            role="VENDOR",
            vendor=self.vendor_b
        )

        # Seed predefined expense categories
        call_command('seed_expense_categories')

        # Pick specific category masters for testing
        self.water_cat = ExpenseCategory.objects.get(code='HDD_WATER_CHARGES')
        self.trolley_cat = ExpenseCategory.objects.get(code='HDD_CUSTOMIZED_TROLLEY')
        self.tractor_cat = ExpenseCategory.objects.get(code='HDD_TRACTOR_TROLLEY_TANKER')

        # Dummy proof file for testing
        self.dummy_proof = SimpleUploadedFile("receipt.pdf", b"file_content", content_type="application/pdf")

    def test_seed_command_is_idempotent(self):
        """10. Seed command is idempotent - running multiple times doesn't create duplicates."""
        initial_count = ExpenseCategory.objects.count()
        call_command('seed_expense_categories')
        final_count = ExpenseCategory.objects.count()
        self.assertEqual(initial_count, final_count)

        # Check total defined monthly cost across predefined non-null records equals 94,000
        predefined_codes = [
            'HDD_TRACTOR_TROLLEY_TANKER',
            'HDD_WATER_CHARGES',
            'HDD_STAY_TRAVEL_FOOD',
            'HDD_FUEL_TRANSPORTATION',
            'HDD_WAREHOUSE',
            'HDD_LOCAL_ROW_INCENTIVE'
        ]
        total_monthly = sum(
            cat.monthly_cost for cat in ExpenseCategory.objects.filter(code__in=predefined_codes)
            if cat.monthly_cost is not None
        )
        self.assertEqual(total_monthly, Decimal('94000.00'))

    def test_fixed_monthly_calculation(self):
        """5. Fixed monthly calculation works: monthly_cost = default_quantity * default_rate."""
        cat = ExpenseCategory.objects.create(
            name="Test Fixed Category",
            payment_type="FIXED_MONTHLY",
            default_quantity=Decimal("10.00"),
            default_rate=Decimal("150.00")
        )
        self.assertEqual(cat.monthly_cost, Decimal("1500.00"))

    def test_undefined_quantity_rate_does_not_produce_fake_zero(self):
        """6. Undefined quantity/rate does not produce fake Rs 0 monthly cost."""
        self.assertIsNone(self.trolley_cat.default_quantity)
        self.assertIsNone(self.trolley_cat.default_rate)
        self.assertIsNone(self.trolley_cat.monthly_cost)

        # Ensure serializer exposes monthly_cost as None / null
        client = APIClient()
        client.force_authenticate(user=self.admin_user)
        res = client.get(f'/api/v1/expenses/categories/{self.trolley_cat.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = get_data(res)
        self.assertIsNone(data.get('monthly_cost'))

    def test_admin_can_see_all_expense_masters(self):
        """1. Admin can see all expense masters."""
        client = APIClient()
        client.force_authenticate(user=self.admin_user)
        res = client.get('/api/v1/expenses/categories/?page_size=200')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = get_data(res)
        cats = data.get('results', data) if isinstance(data, dict) else data
        self.assertGreaterEqual(len(cats), 7)

    def test_vendor_scoping_and_isolation(self):
        """2, 3, 4. Vendor scoping, isolation, and cross-vendor access prevention."""
        # Create expense for Vendor A
        exp_a = Expense.objects.create(
            title="Vendor A Expense",
            expense_date="2026-09-01",
            vendor=self.vendor_a,
            created_by=self.user_a,
            category="Water Charges",
            category_ref=self.water_cat,
            amount=Decimal("15000.00"),
            total_amount=Decimal("15000.00")
        )

        # Create expense for Vendor B
        exp_b = Expense.objects.create(
            title="Vendor B Expense",
            expense_date="2026-09-01",
            vendor=self.vendor_b,
            created_by=self.user_b,
            category="Warehouse",
            amount=Decimal("5000.00"),
            total_amount=Decimal("5000.00")
        )

        client_a = APIClient()
        client_a.force_authenticate(user=self.user_a)

        # 2. Vendor A only sees Vendor A expenses
        res_list = client_a.get('/api/v1/expenses/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        data_list = get_data(res_list)
        exp_list = data_list.get('results', data_list) if isinstance(data_list, dict) else data_list
        exp_ids = [e['id'] for e in exp_list]
        self.assertIn(exp_a.id, exp_ids)
        self.assertNotIn(exp_b.id, exp_ids)

        # 3. Vendor A cannot access Vendor B's expense directly
        res_detail = client_a.get(f'/api/v1/expenses/{exp_b.id}/')
        self.assertIn(res_detail.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # 4. Vendor A cannot access or create expenses for Vendor B
        from apps.common.vendor_scope import check_vendor_access
        from rest_framework.exceptions import PermissionDenied
        with self.assertRaises(PermissionDenied):
            check_vendor_access(self.user_a, self.vendor_b.id)

    def test_actual_expense_accepts_actual_amount(self):
        """7. Actual expense accepts actual amount."""
        client = APIClient()
        client.force_authenticate(user=self.user_a)

        actual_cat = ExpenseCategory.objects.create(
            name="Custom Site Repair",
            payment_type="ACTUAL_WITH_PROOF",
            requires_proof=True
        )

        res = client.post('/api/v1/expenses/', {
            'title': 'Emergency Valve Replacement',
            'expense_date': '2026-09-10',
            'category': actual_cat.name,
            'category_ref': actual_cat.id,
            'amount': '12450.75',
            'total_amount': '12450.75',
            'attachment': self.dummy_proof
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        created_data = get_data(res)
        created = Expense.objects.get(id=created_data['id'])
        self.assertEqual(created.total_amount, Decimal('12450.75'))

    def test_proof_is_required_when_configured(self):
        """8. Proof is required when requires_proof=True."""
        client = APIClient()
        client.force_authenticate(user=self.user_a)

        proof_cat = ExpenseCategory.objects.create(
            name="Proof Required Test Cat",
            payment_type="ACTUAL_WITH_PROOF",
            requires_proof=True
        )

        # Attempt to create without attachment file -> should fail with 400
        res_fail = client.post('/api/v1/expenses/', {
            'title': 'Test No Proof',
            'expense_date': '2026-09-10',
            'category': proof_cat.name,
            'category_ref': proof_cat.id,
            'amount': '500.00',
            'total_amount': '500.00'
        })
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # Attempt with attachment file -> should succeed
        proof_file = SimpleUploadedFile("proof.pdf", b"proof data", content_type="application/pdf")
        res_success = client.post('/api/v1/expenses/', {
            'title': 'Test With Proof',
            'expense_date': '2026-09-10',
            'category': proof_cat.name,
            'category_ref': proof_cat.id,
            'amount': '500.00',
            'total_amount': '500.00',
            'attachment': proof_file
        }, format='multipart')
        self.assertEqual(res_success.status_code, status.HTTP_201_CREATED)

    def test_duplicate_monthly_fixed_expense_generation_prevented(self):
        """9. Duplicate monthly fixed expense generation is prevented."""
        client = APIClient()
        client.force_authenticate(user=self.user_a)

        payload = {'month': 9, 'year': 2026, 'vendor_id': self.vendor_a.id}

        # First run -> generates expenses
        res1 = client.post('/api/v1/expenses/generate-monthly/', payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        data1 = get_data(res1)
        generated_count1 = data1.get('generated_count', 0)
        self.assertGreater(generated_count1, 0)

        # Second run -> skipped duplicate entries
        res2 = client.post('/api/v1/expenses/generate-monthly/', payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        data2 = get_data(res2)
        self.assertEqual(data2.get('generated_count', 0), 0)
        self.assertGreater(data2.get('skipped_count', 0), 0)

    def test_existing_expense_functionality(self):
        """11. Existing expense workflow (draft -> submit -> approve -> pay) still works."""
        client_admin = APIClient()
        client_admin.force_authenticate(user=self.admin_user)

        client_v = APIClient()
        client_v.force_authenticate(user=self.user_a)

        # Create draft
        res = client_v.post('/api/v1/expenses/', {
            'title': 'Workflow Test Expense',
            'expense_date': '2026-09-12',
            'category': 'WAREHOUSE',
            'amount': '5000.00',
            'total_amount': '5000.00'
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        exp_id = get_data(res)['id']

        # Submit
        res_sub = client_v.post(f'/api/v1/expenses/{exp_id}/submit/')
        self.assertEqual(res_sub.status_code, status.HTTP_200_OK)
        self.assertEqual(get_data(res_sub)['status'], 'SUBMITTED')

        # Approve
        res_app = client_admin.post(f'/api/v1/expenses/{exp_id}/approve/')
        self.assertEqual(res_app.status_code, status.HTTP_200_OK)
        self.assertEqual(get_data(res_app)['status'], 'APPROVED')

        # Pay
        res_pay = client_admin.post(f'/api/v1/expenses/{exp_id}/pay/', {'payment_mode': 'BANK_TRANSFER', 'payment_reference': 'UTR998877'})
        self.assertEqual(res_pay.status_code, status.HTTP_200_OK)
        self.assertEqual(get_data(res_pay)['status'], 'PAID')
