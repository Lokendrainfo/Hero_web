from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.hero_integration.models import (
    HeroMachine,
    HeroRole,
    HeroUser,
    HeroUserRole,
    HeroVendor,
    HeroVendorAssignment,
)
from apps.maintenance.management.commands.seed_pm_master import seed_pm_masters


def make_test_image(color=(255, 0, 0), filename='test_photo.png', fmt='PNG', size=(24, 24)):
    buf = BytesIO()
    img = Image.new('RGB', size, color=color)
    img.save(buf, format=fmt)
    buf.seek(0)
    content_type = f"image/{'jpeg' if fmt.upper() == 'JPEG' else fmt.lower()}"
    return SimpleUploadedFile(filename, buf.read(), content_type=content_type)


@pytest.fixture
def seeded_masters(db):
    return seed_pm_masters()


@pytest.fixture
def vendors(db):
    v1 = HeroVendor.objects.create(
        name='Vendor Alpha Infra',
        code='VND-ALPHA',
        external_vendor_id='ext-alpha-1',
        is_active=True,
    )
    v2 = HeroVendor.objects.create(
        name='Vendor Beta Telecom',
        code='VND-BETA',
        external_vendor_id='ext-beta-2',
        is_active=True,
    )
    return v1, v2


@pytest.fixture
def roles(db):
    r_op = HeroRole.objects.create(name='Operator', code='OPERATOR', is_system=True, is_active=True)
    r_fe = HeroRole.objects.create(name='Field Engineer', code='FIELD_ENGINEER', is_system=True, is_active=True)
    r_am = HeroRole.objects.create(name='Area Manager', code='AREA_MANAGER', is_system=True, is_active=True)
    r_admin = HeroRole.objects.create(name='Admin', code='ADMIN', is_system=True, is_active=True)
    return {'OPERATOR': r_op, 'FIELD_ENGINEER': r_fe, 'AREA_MANAGER': r_am, 'ADMIN': r_admin}


@pytest.fixture
def users(db, vendors, roles):
    v1, v2 = vendors

    op = HeroUser.objects.create(
        username='op_alpha',
        first_name='Ravi',
        last_name='Operator',
        role='OPERATOR',
        vendor=v1,
        is_active=True,
    )
    HeroUserRole.objects.create(user=op, role=roles['OPERATOR'])
    HeroVendorAssignment.objects.create(user=op, vendor=v1, is_active=True)

    fe = HeroUser.objects.create(
        username='fe_user',
        first_name='Anil',
        last_name='Engineer',
        role='FIELD_ENGINEER',
        is_active=True,
    )
    HeroUserRole.objects.create(user=fe, role=roles['FIELD_ENGINEER'])

    am = HeroUser.objects.create(
        username='am_user',
        first_name='Vikram',
        last_name='Manager',
        role='AREA_MANAGER',
        is_active=True,
    )
    HeroUserRole.objects.create(user=am, role=roles['AREA_MANAGER'])

    admin = HeroUser.objects.create(
        username='admin_user',
        first_name='Super',
        last_name='Admin',
        role='ADMIN',
        is_superuser=True,
        is_staff=True,
        is_active=True,
    )
    HeroUserRole.objects.create(user=admin, role=roles['ADMIN'])

    op_beta = HeroUser.objects.create(
        username='op_beta',
        first_name='Suresh',
        last_name='BetaOp',
        role='OPERATOR',
        vendor=v2,
        is_active=True,
    )
    HeroUserRole.objects.create(user=op_beta, role=roles['OPERATOR'])
    HeroVendorAssignment.objects.create(user=op_beta, vendor=v2, is_active=True)

    return {
        'operator': op,
        'fe': fe,
        'am': am,
        'admin': admin,
        'operator_beta': op_beta,
    }


@pytest.fixture
def machines(db, vendors):
    v1, v2 = vendors
    m1 = HeroMachine.objects.create(
        vendor=v1,
        serial_number='SN-600-8401',
        machine_chassis_no='600202608401',
        code='MAC-8401',
        name='A600 HDD (8401)',
        model_code='A600',
        model_name='APOLLO A600 V2',
        category='HDD',
        site_name='Anupgarh-SITE',
        location_name='Anupgarh, RJ',
        operator=None,
        engine_hours=245,
        is_commissioned=True,
        status='RUNNING',
    )
    m2 = HeroMachine.objects.create(
        vendor=v2,
        serial_number='SN-600-8402',
        machine_chassis_no='600202608402',
        code='MAC-8402',
        name='A600 HDD (8402)',
        model_code='A600',
        model_name='APOLLO A600 V2',
        category='HDD',
        site_name='Sujangarh-SITE',
        location_name='Sujangarh, RJ',
        operator=None,
        engine_hours=510,
        is_commissioned=True,
        status='IDLE',
    )
    return m1, m2


@pytest.fixture
def make_auth_client():
    def _factory(user):
        client = APIClient()
        token = AccessToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(token)}')
        return client
    return _factory

