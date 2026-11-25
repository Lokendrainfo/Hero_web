import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from .conftest import make_test_image


@pytest.mark.django_db(databases=['default', 'hero'])
class TestMandatoryPhotoValidation:
    def test_reject_invalid_file_type_and_corrupt_image(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        item_id = checklist[0]['id']

        # Non-image text file
        txt_file = SimpleUploadedFile('notes.txt', b'hello world', content_type='text/plain')
        res = client.post(
            '/api/v1/pm/photos/upload/',
            {'file': txt_file, 'machine_id': m1.id, 'checklist_item_id': item_id, 'frequency': 'DAILY'},
            format='multipart',
        )
        assert res.status_code == 400

        # Fake jpg with non-image bytes
        fake_jpg = SimpleUploadedFile('fake.jpg', b'not-really-an-image', content_type='image/jpeg')
        res2 = client.post(
            '/api/v1/pm/photos/upload/',
            {'file': fake_jpg, 'machine_id': m1.id, 'checklist_item_id': item_id, 'frequency': 'DAILY'},
            format='multipart',
        )
        assert res2.status_code == 400

    def test_reject_reused_photo_across_activities(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']
        assert len(checklist) == 3

        same_bytes_img1 = make_test_image(color=(10, 20, 30), filename='shared1.png')
        raw_bytes = same_bytes_img1.read()
        img1 = SimpleUploadedFile('p1.png', raw_bytes, content_type='image/png')
        img2 = SimpleUploadedFile('p2.png', raw_bytes, content_type='image/png')

        r1 = client.post(
            '/api/v1/pm/photos/upload/',
            {'file': img1, 'machine_id': m1.id, 'checklist_item_id': checklist[0]['id'], 'frequency': '50_HOURS'},
            format='multipart',
        )
        assert r1.status_code == 201

        # Uploading identical photo bytes for second item must be rejected
        r2 = client.post(
            '/api/v1/pm/photos/upload/',
            {'file': img2, 'machine_id': m1.id, 'checklist_item_id': checklist[1]['id'], 'frequency': '50_HOURS'},
            format='multipart',
        )
        assert r2.status_code == 400

    def test_submission_fails_if_any_photo_missing_or_shared(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']

        # Upload photos for all 3 items, but try submitting item 3 without photo
        photo_ids = []
        for idx, item in enumerate(checklist):
            img = make_test_image(color=(idx * 50, 100, 150), filename=f'item_{idx}.png')
            up = client.post(
                '/api/v1/pm/photos/upload/',
                {'file': img, 'machine_id': m1.id, 'checklist_item_id': item['id'], 'frequency': '50_HOURS'},
                format='multipart',
            )
            assert up.status_code == 201
            photo_ids.append(up.json()['data']['id'])

        # Missing photo on last item
        missing_payload = {
            'machine_id': m1.id,
            'frequency': '50_HOURS',
            'hour_meter_reading': 245,
            'responses': [
                {'checklist_item_id': checklist[0]['id'], 'status': 'COMPLETED', 'photo_id': photo_ids[0]},
                {'checklist_item_id': checklist[1]['id'], 'status': 'COMPLETED', 'photo_id': photo_ids[1]},
                {'checklist_item_id': checklist[2]['id'], 'status': 'COMPLETED'},
            ],
        }
        res_missing = client.post('/api/v1/pm/submissions/', missing_payload, format='json')
        assert res_missing.status_code == 400

        # Shared photo_id[0] reused on item 2
        shared_payload = {
            'machine_id': m1.id,
            'frequency': '50_HOURS',
            'hour_meter_reading': 245,
            'responses': [
                {'checklist_item_id': checklist[0]['id'], 'status': 'COMPLETED', 'photo_id': photo_ids[0]},
                {'checklist_item_id': checklist[1]['id'], 'status': 'COMPLETED', 'photo_id': photo_ids[1]},
                {'checklist_item_id': checklist[2]['id'], 'status': 'COMPLETED', 'photo_id': photo_ids[0]},
            ],
        }
        res_shared = client.post('/api/v1/pm/submissions/', shared_payload, format='json')
        assert res_shared.status_code == 400

    def test_not_completed_requires_remarks_and_photo(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']

        responses = []
        for idx, item in enumerate(checklist):
            img = make_test_image(color=(idx * 40, 200, 100), filename=f'nc_{idx}.png')
            up = client.post(
                '/api/v1/pm/photos/upload/',
                {'file': img, 'machine_id': m1.id, 'checklist_item_id': item['id'], 'frequency': '50_HOURS'},
                format='multipart',
            )
            responses.append(
                {
                    'checklist_item_id': item['id'],
                    'status': 'NOT_COMPLETED' if idx == 0 else 'COMPLETED',
                    'remarks': '',  # Missing remarks for NOT_COMPLETED!
                    'photo_id': up.json()['data']['id'],
                }
            )

        res = client.post(
            '/api/v1/pm/submissions/',
            {'machine_id': m1.id, 'frequency': '50_HOURS', 'hour_meter_reading': 246, 'responses': responses},
            format='json',
        )
        assert res.status_code == 400

    def test_photo_access_control(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        op_alpha = make_auth_client(users['operator'])
        op_beta = make_auth_client(users['operator_beta'])
        checklist = op_alpha.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']

        img = make_test_image(color=(12, 34, 56), filename='secure.png')
        up = op_alpha.post(
            '/api/v1/pm/photos/upload/',
            {'file': img, 'machine_id': m1.id, 'checklist_item_id': checklist[0]['id'], 'frequency': '50_HOURS'},
            format='multipart',
        )
        photo_id = up.json()['data']['id']

        # Authorized user gets image bytes
        ok_res = op_alpha.get(f'/api/v1/pm/photos/{photo_id}/view/')
        assert ok_res.status_code == 200

        # Other vendor user is blocked
        blocked_res = op_beta.get(f'/api/v1/pm/photos/{photo_id}/view/')
        assert blocked_res.status_code == 403

