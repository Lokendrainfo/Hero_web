import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.integrations.views import IlyncMyTasksListView
from apps.dashboard.views import DashboardSummaryView
from apps.vendors.models import Vendor

User = get_user_model()
admin_user = User.objects.filter(is_superuser=True).first() or User.objects.filter(role__name='ADMIN').first()
if not admin_user:
    admin_user = User.objects.create_superuser('admin_test', 'admin@test.com', 'pass123')

# Create a test vendor user with 0 assigned tasks
vendor_0_user, _ = User.objects.get_or_create(username='vendor_0_test', defaults={'email': 'vendor0@test.com'})
test_vendor = Vendor.objects.filter(external_vendor_id='6a9ea20ccb810397f313887b').first()
if test_vendor:
    vendor_0_user.vendor_id = test_vendor.id
    vendor_0_user.save()

factory = APIRequestFactory()

def get_d(res):
    d = res.data
    return d.get('data') if isinstance(d, dict) and 'data' in d else d

print("=== TEST 1: Admin User ===")
req_admin = factory.get('/api/v1/integrations/tasks/my-tasks/')
force_authenticate(req_admin, user=admin_user)
res_tasks_admin = IlyncMyTasksListView.as_view()(req_admin)
print("My Tasks (Admin) total:", get_d(res_tasks_admin)['total'])

req_dash_admin = factory.get('/api/v1/dashboard/summary/')
force_authenticate(req_dash_admin, user=admin_user)
res_dash_admin = DashboardSummaryView.as_view()(req_dash_admin)
print("res_dash_admin.data:", res_dash_admin.data)
print("get_d(res_dash_admin):", get_d(res_dash_admin))
print("Dashboard (Admin) fiber tasks count:", len(get_d(res_dash_admin)['fiber_tasks']['Fiber 1']))

print("\n=== TEST 2: Vendor User with 0 Tasks (Vendor ID 18) ===")
req_v0 = factory.get('/api/v1/integrations/tasks/my-tasks/')
force_authenticate(req_v0, user=vendor_0_user)
res_tasks_v0 = IlyncMyTasksListView.as_view()(req_v0)
print("My Tasks (Vendor 0) total:", get_d(res_tasks_v0)['total'])
print("My Tasks (Vendor 0) results:", get_d(res_tasks_v0)['results'])

req_dash_v0 = factory.get('/api/v1/dashboard/summary/')
force_authenticate(req_dash_v0, user=vendor_0_user)
res_dash_v0 = DashboardSummaryView.as_view()(req_dash_v0)
print("Dashboard (Vendor 0) pending tasks:", get_d(res_dash_v0)['quick_stats']['tasks_pending'])
print("Dashboard (Vendor 0) fiber tasks count:", len(get_d(res_dash_v0)['fiber_tasks']['Fiber 1']))
print("Dashboard (Vendor 0) performance msg:", get_d(res_dash_v0)['performance']['message'])

print("\n=== TEST 3: Admin requesting vendor_id filter for Vendor 18 (0 Tasks) ===")
req_v18_filter = factory.get('/api/v1/integrations/tasks/my-tasks/?vendor_id=18')
force_authenticate(req_v18_filter, user=admin_user)
res_tasks_v18 = IlyncMyTasksListView.as_view()(req_v18_filter)
print("My Tasks (vendor_id=18) total:", get_d(res_tasks_v18)['total'])

req_dash_v18 = factory.get('/api/v1/dashboard/summary/?vendor_id=18')
force_authenticate(req_dash_v18, user=admin_user)
res_dash_v18 = DashboardSummaryView.as_view()(req_dash_v18)
print("Dashboard (vendor_id=18) pending tasks:", get_d(res_dash_v18)['quick_stats']['tasks_pending'])
print("Dashboard (vendor_id=18) fiber tasks count:", len(get_d(res_dash_v18)['fiber_tasks']['Fiber 1']))
