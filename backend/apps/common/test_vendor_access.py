import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.test import TestCase, RequestFactory
from rest_framework.test import APIClient
from rest_framework.exceptions import PermissionDenied
from apps.authentication.models import User
from apps.vendors.models import Vendor, HeroVendorAssignment
from apps.machines.models import Machine
from apps.tasks.models import Task
from apps.roles.models import Role
from apps.common.vendor_scope import get_user_vendor_ids, check_vendor_access, filter_queryset_by_vendor

def run_tests():
    print("=== STARTING HERO VENDOR-SCOPED ACCESS CONTROL SECURITY TESTS ===")

    # 1. Clean up test records
    User.objects.filter(username__startswith="test_").delete()
    Vendor.objects.filter(name__startswith="Test Vendor").delete()

    # 2. Create Test Vendors
    v1 = Vendor.objects.create(name="Test Vendor Gurukripa", external_vendor_id="V_TEST_001", code="VGK01")
    v2 = Vendor.objects.create(name="Test Vendor Harpal", external_vendor_id="V_TEST_002", code="VHP02")

    # 3. Create Test Machines
    m1 = Machine.objects.create(name="Machine GK 1", serial_number="M_GK_001", vendor=v1)
    m2 = Machine.objects.create(name="Machine HP 2", serial_number="M_HP_002", vendor=v2)

    # 4. Create Test Tasks
    t1 = Task.objects.create(title="Task GK 1", vendor=v1, machine=m1)
    t2 = Task.objects.create(title="Task HP 2", vendor=v2, machine=m2)

    # 5. Create Test Users
    # Admin User
    admin_role, _ = Role.objects.get_or_create(name="ADMIN")
    hero_role, _ = Role.objects.get_or_create(name="HERO")

    user_admin = User.objects.create_user(username="test_admin", password="password123", role="ADMIN")
    user_admin.roles.set([admin_role])

    # HERO User assigned to Vendor 1 only
    user_hero_v1 = User.objects.create_user(username="test_hero_v1", password="password123", role="HERO")
    user_hero_v1.roles.set([hero_role])
    HeroVendorAssignment.objects.create(user=user_hero_v1, vendor=v1)

    # HERO User with 0 Vendors assigned
    user_hero_novendor = User.objects.create_user(username="test_hero_novendor", password="password123", role="HERO")
    user_hero_novendor.roles.set([hero_role])

    print("\n[TEST 1] Testing get_user_vendor_ids()")
    assert get_user_vendor_ids(user_admin) is None, "Admin should get None (unrestricted)"
    assert get_user_vendor_ids(user_hero_v1) == [v1.id], f"Hero V1 should get {[v1.id]}"
    assert get_user_vendor_ids(user_hero_novendor) == [], "Hero with 0 vendors should get []"
    print("✓ PASSED: get_user_vendor_ids() scoping works as expected.")

    print("\n[TEST 2] QuerySet Level Filtering for Machines")
    qs_admin = filter_queryset_by_vendor(Machine.objects.all(), user_admin, 'vendor_id')
    qs_v1 = filter_queryset_by_vendor(Machine.objects.all(), user_hero_v1, 'vendor_id')
    qs_novendor = filter_queryset_by_vendor(Machine.objects.all(), user_hero_novendor, 'vendor_id')

    assert qs_admin.count() >= 2, "Admin sees all machines"
    assert list(qs_v1.values_list('id', flat=True)) == [m1.id], "Hero V1 sees only Machine GK 1"
    assert qs_novendor.count() == 0, "Hero with 0 vendors sees 0 machines"
    print("✓ PASSED: Machine queryset level security works.")

    print("\n[TEST 3] Rule 21: Never Trust Frontend Vendor Filter")
    factory = RequestFactory()
    
    # Hero V1 requesting Vendor V2 parameter -> MUST produce PermissionDenied (403)
    req_unauthorized = factory.get(f"/api/machines/?vendor_id={v2.id}")
    try:
        filter_queryset_by_vendor(Machine.objects.all(), user_hero_v1, 'vendor_id', request=req_unauthorized)
        assert False, "Should have raised PermissionDenied"
    except PermissionDenied:
        print("✓ PASSED: Querying unauthorized vendor_id parameter returns 403 Forbidden.")

    print("\n[TEST 4] Rule 22: Direct Object Access Verification")
    assert check_vendor_access(user_admin, v2.id) is True, "Admin has access to any vendor ID"
    assert check_vendor_access(user_hero_v1, v1.id) is True, "Hero V1 has access to V1"
    try:
        check_vendor_access(user_hero_v1, v2.id)
        assert False, "Hero V1 should be denied access to V2"
    except PermissionDenied:
        print("✓ PASSED: Direct object access to unassigned vendor throws 403 Forbidden.")

    print("\n[TEST 5] Rule 30: Immediate Vendor Removal Access Revocation")
    HeroVendorAssignment.objects.filter(user=user_hero_v1, vendor=v1).delete()
    assert get_user_vendor_ids(user_hero_v1) == [], "After removing vendor assignment, vendor IDs should be []"
    qs_revoked = filter_queryset_by_vendor(Machine.objects.all(), user_hero_v1, 'vendor_id')
    assert qs_revoked.count() == 0, "Machines immediately disappear after removing assignment without logout"
    print("✓ PASSED: Immediate revocation works without requiring re-login.")

    print("\n[TEST 6] GET /api/me/ Response Schema")
    # Re-assign V1 to user_hero_v1
    HeroVendorAssignment.objects.create(user=user_hero_v1, vendor=v1)
    me_data_v1 = user_hero_v1.get_assigned_vendors_data()
    assert len(me_data_v1) == 1
    assert me_data_v1[0]['id'] == v1.id
    assert me_data_v1[0]['external_vendor_id'] == "V_TEST_001"
    assert me_data_v1[0]['name'] == "Test Vendor Gurukripa"
    print("✓ PASSED: GET /api/me/ vendor payload schema verified.")

    # Cleanup
    User.objects.filter(username__startswith="test_").delete()
    Vendor.objects.filter(name__startswith="Test Vendor").delete()

    print("\n🎉 ALL 6 VENDOR ACCESS CONTROL SECURITY TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
