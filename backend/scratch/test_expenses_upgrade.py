import os
import sys
import django

sys.path.insert(0, '.')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.expenses.models import Expense, ExpenseCategory, ExpenseSubCategory
from apps.expenses.views import ExpenseViewSet, ExpenseCategoryViewSet
from apps.vendors.models import Vendor
from apps.authentication.models import User

def run_tests():
    print("=== STARTING EXPENSES MODULE UPGRADE END-TO-END TESTS ===")
    factory = APIRequestFactory()
    exp_view = ExpenseViewSet.as_view({
        'get': 'list',
        'post': 'create'
    })
    exp_detail_view = ExpenseViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    })
    submit_view = ExpenseViewSet.as_view({'post': 'submit'})
    approve_view = ExpenseViewSet.as_view({'post': 'approve'})
    reject_view = ExpenseViewSet.as_view({'post': 'reject'})
    pay_view = ExpenseViewSet.as_view({'post': 'pay'})
    export_view = ExpenseViewSet.as_view({'get': 'export'})
    stats_view = ExpenseViewSet.as_view({'get': 'dashboard_stats'})

    # Get/Create Admin & Vendor Users
    admin_user = User.objects.filter(is_superuser=True).first() or User.objects.filter(role='ADMIN').first()
    vendor_obj = Vendor.objects.first() or Vendor.objects.create(name='Test Vendor 101')
    
    vendor_user, _ = User.objects.get_or_create(
        username='test_vendor_user_101',
        defaults={'email': 'vuser101@example.com', 'role': 'VENDOR', 'vendor': vendor_obj}
    )
    vendor_user.vendor = vendor_obj
    vendor_user.save()

    # 1. Categories Check
    cat_count = ExpenseCategory.objects.count()
    subcat_count = ExpenseSubCategory.objects.count()
    print(f"1. Database Categories: {cat_count} Main Categories, {subcat_count} Subcategories.")
    assert cat_count >= 21, "Expected at least 21 main categories."

    # 2. Calculation & Creation Test
    payload = {
        'title': 'Bentonite Clay Supply',
        'category': 'Drilling Fluid',
        'subcategory': 'Bentonite',
        'quantity': '10',
        'rate': '850',
        'discount': '500',
        'gst_applicable': True,
        'gst_percentage': '18',
        'expense_date': str(timezone.now().date()),
        'supplier_name': 'Imperial Chemicals',
        'invoice_number': 'INV-7788',
        'payment_mode': 'CASH',
        'vendor_id': str(vendor_obj.id)
    }

    req = factory.post('/api/v1/expenses/', payload, format='json')
    force_authenticate(req, user=vendor_user)
    res = exp_view(req)
    assert res.status_code == 201, f"Create failed: {res.data}"
    exp_data = res.data
    exp_id = exp_data['id']
    
    # Verify Math: Qty(10)*Rate(850)=8500 - Disc(500)=8000 * 18% GST (1440) = Total 9440
    print(f"2. Created Expense {exp_data['expense_id']}: Total Amount = RS {exp_data['total_amount']} (Expected 9440.00)")
    assert Decimal(str(exp_data['total_amount'])) == Decimal('9440.00'), f"Incorrect calculation: {exp_data['total_amount']}"
    assert exp_data['status'] == 'DRAFT', f"Expected DRAFT status, got {exp_data['status']}"

    # 3. Workflow: Submit
    req_sub = factory.post(f'/api/v1/expenses/{exp_id}/submit/')
    force_authenticate(req_sub, user=vendor_user)
    res_sub = submit_view(req_sub, pk=exp_id)
    assert res_sub.status_code == 200, f"Submit failed: {res_sub.data}"
    print("3. Submit Workflow Passed: Status =", res_sub.data['data']['status'])
    assert res_sub.data['data']['status'] == 'SUBMITTED'

    # 4. Workflow: Vendor Cannot Approve (Permission Check)
    req_app_v = factory.post(f'/api/v1/expenses/{exp_id}/approve/')
    force_authenticate(req_app_v, user=vendor_user)
    res_app_v = approve_view(req_app_v, pk=exp_id)
    assert res_app_v.status_code == 403, "Vendor user should NOT be able to approve expenses."
    print("4. Vendor Approval Restriction Passed: HTTP 403 Forbidden.")

    # 5. Workflow: Admin Approves
    req_app = factory.post(f'/api/v1/expenses/{exp_id}/approve/')
    force_authenticate(req_app, user=admin_user)
    res_app = approve_view(req_app, pk=exp_id)
    assert res_app.status_code == 200, f"Approve failed: {res_app.data}"
    print("5. Admin Approval Passed: Status =", res_app.data['data']['status'])
    assert res_app.data['data']['status'] == 'APPROVED'

    # 6. Workflow: Admin Marks Paid
    req_pay = factory.post(f'/api/v1/expenses/{exp_id}/pay/', {'payment_mode': 'UPI', 'payment_reference': 'UPI998811'}, format='json')
    force_authenticate(req_pay, user=admin_user)
    res_pay = pay_view(req_pay, pk=exp_id)
    assert res_pay.status_code == 200, f"Pay failed: {res_pay.data}"
    print("6. Pay Workflow Passed: Status =", res_pay.data['data']['status'])
    assert res_pay.data['data']['status'] == 'PAID'

    # 7. Dashboard Stats & CSV Export Test
    req_stats = factory.get('/api/v1/expenses/dashboard_stats/')
    force_authenticate(req_stats, user=admin_user)
    res_stats = stats_view(req_stats)
    assert res_stats.status_code == 200
    print("7. Dashboard Stats Passed: Total Amount =", res_stats.data['data']['total_amount'])

    req_exp = factory.get('/api/v1/expenses/export/')
    force_authenticate(req_exp, user=admin_user)
    res_exp = export_view(req_exp)
    assert res_exp.status_code == 200
    print("8. CSV Export Passed: Response length =", len(res_exp.content))

    # Clean up test user & expense
    Expense.objects.filter(id=exp_id).delete()
    print("=== ALL 8 END-TO-END TESTS PASSED CLEANLY ===")

if __name__ == '__main__':
    run_tests()
