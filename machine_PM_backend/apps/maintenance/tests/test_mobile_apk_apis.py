import json
import pytest
from rest_framework.test import APIClient

from apps.hero_integration.models import HeroAPIKey
from .conftest import make_test_image


@pytest.fixture
def api_key_client(db, users):
    key_obj = HeroAPIKey.objects.create(
        user=users['admin'],
        name='Mobile APK Integration Key',
        key='hero_live_mobile_apk_test_key_123456',
        prefix='hero_live_',
        is_active=True,
    )
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=key_obj.key)
    return client, key_obj


@pytest.mark.django_db(databases=['default', 'hero'])
class TestMobileApkApis:
    def test_api_key_auth_rejects_invalid_and_accepts_valid(self, seeded_masters, users, machines, api_key_client):
        client, _ = api_key_client
        m1, _ = machines

        bad = APIClient()
        bad.credentials(HTTP_X_API_KEY='invalid_key_999')
        assert bad.get(f'/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users["operator"].id}&frequency=DAILY').status_code in (401, 403)

        ok = client.get(f'/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users["operator"].id}&frequency=DAILY')
        assert ok.status_code == 200
        assert ok.json()['data']['eligible'] is True

    def test_check_api_role_eligibility_and_duplicate_detection(self, seeded_masters, users, machines, api_key_client, make_auth_client):
        client, _ = api_key_client
        m1, m2 = machines

        # Operator checking 100_HOURS (FE frequency) -> eligible=False
        res_inelig = client.get(
            f'/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users["operator"].id}&frequency=100_HOURS'
        )
        assert res_inelig.status_code == 200
        d = res_inelig.json()['data']
        assert d['eligible'] is False
        assert d['checks']['role_authorized'] is False

        # Field Engineer checking 100_HOURS -> eligible=True
        res_fe = client.get(
            f'/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users["fe"].id}&frequency=100_HOURS'
        )
        assert res_fe.status_code == 200
        assert res_fe.json()['data']['eligible'] is True

        # Area Manager checking 500_HOURS -> eligible=True
        res_am = client.get(
            f'/api/v1/machine-maintenance/check?machine_id={m2.id}&user_id={users["am"].id}&frequency=500_HOURS'
        )
        assert res_am.status_code == 200
        assert res_am.json()['data']['eligible'] is True

        # Non-admin JWT user cannot check on behalf of another user
        op_jwt = make_auth_client(users['operator'])
        spoof = op_jwt.get(f'/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users["fe"].id}&frequency=100_HOURS')
        assert spoof.status_code == 403

        # Missing/unknown machine returns 404
        assert client.get(f'/api/v1/machine-maintenance/check?machine_id=99999&user_id={users["operator"].id}&frequency=DAILY').status_code == 404

    def test_data_post_api_multipart_submit_and_validation(self, seeded_masters, users, machines, api_key_client):
        client, _ = api_key_client
        m1, _ = machines

        # Fetch 50_HOURS checklist via list API
        list_res = client.get('/api/v1/machine-maintenance/list?frequency=50_HOURS&user_role=OPERATOR')
        assert list_res.status_code == 200
        items = list_res.json()['data']['checklist_items']
        assert len(items) == 3

        # Missing photo must fail with 400
        responses = [
            {'checklist_item_id': it['id'], 'status': 'COMPLETED', 'remarks': 'OK'}
            for it in items
        ]
        missing_photo = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': '50_HOURS',
                'hour_meter_reading': '245.5',
                'responses': json.dumps(responses),
                f"photo_{items[0]['id']}": make_test_image(color=(10, 20, 30), filename='p0.png'),
            },
            format='multipart',
        )
        assert missing_photo.status_code == 400

        # Explicit GALLERY upload on mobile endpoint must be rejected
        bad_source_res = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': '50_HOURS',
                'hour_meter_reading': '245.5',
                'capture_source': 'GALLERY',
                'responses': json.dumps(responses),
                **{
                    f"photo_{it['id']}": make_test_image(color=(idx * 30 + 5, 60, 120), filename=f'gal_{idx}.png')
                    for idx, it in enumerate(items)
                },
            },
            format='multipart',
        )
        assert bad_source_res.status_code == 400

        # Valid multipart with unique camera-captured photo per item succeeds
        files = {
            f"photo_{it['id']}": make_test_image(color=(idx * 60 + 15, 80, 140), filename=f'apk_{idx}.png')
            for idx, it in enumerate(items)
        }
        ok_res = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': '50_HOURS',
                'hour_meter_reading': '245.5',
                'capture_source': 'CAMERA',
                'general_remarks': 'Submitted from HERO Mobile APK',
                'responses': json.dumps(responses),
                **files,
            },
            format='multipart',
        )
        assert ok_res.status_code == 201, ok_res.json()
        ok_data = ok_res.json()['data']
        assert ok_data['submission_reference_id'].startswith('PM-')
        assert ok_data['status'] == 'COMPLETED'
        assert ok_data['photo_count'] == 3
        assert len(ok_data['photos']) == 3

        # Verify each returned photo URL serves real binary directly from DB via X-API-Key
        for photo_meta in ok_data['photos']:
            photo_res = client.get(photo_meta['photo_url'])
            assert photo_res.status_code == 200
            assert photo_res['Content-Type'] == photo_meta['mime_type']
            assert len(photo_res.content) == photo_meta['file_size']

        # Re-checking eligibility at same hour-meter reading now reports duplicate
        recheck = client.get(
            f'/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users["operator"].id}&frequency=50_HOURS&hour_meter_reading=245.5'
        )
        assert recheck.status_code == 200
        assert recheck.json()['data']['eligible'] is False
        assert recheck.json()['data']['checks']['duplicate_submission_exists'] is True

        # Duplicate POST returns 409 Conflict
        dup_files = {
            f"photo_{it['id']}": make_test_image(color=(idx * 60 + 99, 120, 40), filename=f'dup_{idx}.png')
            for idx, it in enumerate(items)
        }
        dup_res = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': '50_HOURS',
                'hour_meter_reading': '245.5',
                'responses': json.dumps(responses),
                **dup_files,
            },
            format='multipart',
        )
        assert dup_res.status_code == 409

    def test_list_api_filters_and_structure(self, seeded_masters, users, machines, api_key_client):
        client, _ = api_key_client
        m1, _ = machines

        res = client.get(f'/api/v1/machine-maintenance/list?machine_id={m1.id}&user_role=FIELD_ENGINEER')
        assert res.status_code == 200
        data = res.json()['data']
        assert data['machine']['id'] == m1.id
        assert len(data['categories']) == 3
        assert len(data['frequency_wise_checklists']) == 2
        freq_codes = [f['frequency_code'] for f in data['frequency_wise_checklists']]
        assert freq_codes == ['100_HOURS', '250_HOURS']
        assert len(data['safety_guidelines']) == 5

    def test_web_jwt_multipart_submit_via_data_api_and_retrieve_photos(
        self, seeded_masters, users, machines, make_auth_client
    ):
        client = make_auth_client(users['operator'])
        m1, _ = machines

        checklist = client.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']
        assert len(checklist) == 3

        responses = [
            {
                'checklist_item_id': it['id'],
                'status': 'NOT_COMPLETED' if idx == 1 else 'COMPLETED',
                'remarks': 'Oil cap loose' if idx == 1 else 'Checked OK',
                'capture_source': 'CAMERA',
            }
            for idx, it in enumerate(checklist)
        ]
        files = {
            f"photo_{it['id']}": make_test_image(color=(idx * 55 + 20, 90, 175), filename=f'web_cam_{idx}.jpg', fmt='JPEG')
            for idx, it in enumerate(checklist)
        }

        res = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'frequency': '50_HOURS',
                'hour_meter_reading': '248.5',
                'capture_source': 'CAMERA',
                'general_remarks': 'Submitted from Perform Maintenance UI',
                'responses': json.dumps(responses),
                **files,
            },
            format='multipart',
        )
        assert res.status_code == 201, res.json()
        data = res.json()['data']
        assert data['photo_count'] == 3
        assert len(data['photos']) == 3

        # Fetch submission detail (as used by History modal & post-submit modal) and verify every photo retrieves
        detail_res = client.get(f"/api/v1/pm/submissions/{data['submission_id']}/")
        assert detail_res.status_code == 200
        detail_data = detail_res.json()['data']
        for resp_item in detail_data['responses']:
            assert resp_item['photo_id'] is not None
            img_res = client.get(resp_item['photo_url'])
            assert img_res.status_code == 200
            assert img_res['Content-Type'] == 'image/jpeg'
            assert len(img_res.content) > 0

