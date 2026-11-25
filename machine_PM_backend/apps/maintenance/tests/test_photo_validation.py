import json
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.maintenance.models import MaintenancePhotoAttachment, MaintenanceSubmission
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
            {'file': txt_file, 'machine_id': m1.id, 'checklist_item_id': item_id, 'frequency': 'DAILY', 'capture_source': 'CAMERA'},
            format='multipart',
        )
        assert res.status_code == 400

        # Fake jpg with non-image bytes
        fake_jpg = SimpleUploadedFile('fake.jpg', b'not-really-an-image', content_type='image/jpeg')
        res2 = client.post(
            '/api/v1/pm/photos/upload/',
            {'file': fake_jpg, 'machine_id': m1.id, 'checklist_item_id': item_id, 'frequency': 'DAILY', 'capture_source': 'CAMERA'},
            format='multipart',
        )
        assert res2.status_code == 400

    def test_reject_gallery_or_file_upload_source(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        item_id = checklist[0]['id']

        for bad_source in ('', 'GALLERY', 'FILE_UPLOAD', 'FILE_PICKER'):
            img = make_test_image(color=(42, 84, 126), filename='gallery.png')
            payload = {'file': img, 'machine_id': m1.id, 'checklist_item_id': item_id, 'frequency': 'DAILY'}
            if bad_source:
                payload['capture_source'] = bad_source
            res = client.post('/api/v1/pm/photos/upload/', payload, format='multipart')
            assert res.status_code == 400

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
            {'file': img1, 'machine_id': m1.id, 'checklist_item_id': checklist[0]['id'], 'frequency': '50_HOURS', 'capture_source': 'CAMERA'},
            format='multipart',
        )
        assert r1.status_code == 201

        # Uploading identical photo bytes for second item must be rejected
        r2 = client.post(
            '/api/v1/pm/photos/upload/',
            {'file': img2, 'machine_id': m1.id, 'checklist_item_id': checklist[1]['id'], 'frequency': '50_HOURS', 'capture_source': 'CAMERA'},
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
                {'file': img, 'machine_id': m1.id, 'checklist_item_id': item['id'], 'frequency': '50_HOURS', 'capture_source': 'CAMERA'},
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
                {'file': img, 'machine_id': m1.id, 'checklist_item_id': item['id'], 'frequency': '50_HOURS', 'capture_source': 'CAMERA'},
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
            {'file': img, 'machine_id': m1.id, 'checklist_item_id': checklist[0]['id'], 'frequency': '50_HOURS', 'capture_source': 'CAMERA'},
            format='multipart',
        )
        photo_id = up.json()['data']['id']

        # Authorized user gets image bytes
        ok_res = op_alpha.get(f'/api/v1/pm/photos/{photo_id}/view/')
        assert ok_res.status_code == 200

        # Other vendor user is blocked
        blocked_res = op_beta.get(f'/api/v1/pm/photos/{photo_id}/view/')
        assert blocked_res.status_code == 403

        # Unauthenticated request to /api/v1/machine-maintenance/photos/{photo_id} blocked
        from rest_framework.test import APIClient
        anon = APIClient()
        assert anon.get(f'/api/v1/machine-maintenance/photos/{photo_id}').status_code in (401, 403)
        assert op_beta.get(f'/api/v1/machine-maintenance/photos/{photo_id}').status_code == 403

        # Authorized retrieval from /api/v1/machine-maintenance/photos/{photo_id} returns PostgreSQL BYTEA binary
        mobile_ok = op_alpha.get(f'/api/v1/machine-maintenance/photos/{photo_id}')
        assert mobile_ok.status_code == 200
        assert mobile_ok['Content-Type'] == 'image/png'
        assert len(mobile_ok.content) > 0

    def test_photo_stored_in_bytea_without_local_disk_and_resized(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']

        # Build a large noisy 2200x1650 JPEG to verify resize + compression + no disk storage
        large_img = Image.effect_noise((2200, 1650), 64).convert('RGB')
        raw_buf = BytesIO()
        large_img.save(raw_buf, format='JPEG', quality=95)
        raw_bytes = raw_buf.getvalue()
        uploaded = SimpleUploadedFile('large_camera.jpg', raw_bytes, content_type='image/jpeg')

        media_dir = Path(settings.MEDIA_ROOT)
        before_files = [p for p in media_dir.rglob('*') if p.is_file()] if media_dir.exists() else []

        files = {f"photo_{checklist[0]['id']}": uploaded}
        responses = []
        for idx, it in enumerate(checklist):
            if idx > 0:
                files[f"photo_{it['id']}"] = make_test_image(color=(idx * 70, 90, 180), filename=f'cam_{idx}.jpg', fmt='JPEG')
            responses.append({'checklist_item_id': it['id'], 'status': 'COMPLETED', 'remarks': 'OK'})

        sub_res = client.post(
            '/api/v1/pm/submissions/',
            {
                'machine_id': m1.id,
                'frequency': '50_HOURS',
                'hour_meter_reading': 247.0,
                'capture_source': 'CAMERA',
                'responses': json.dumps(responses),
                **files,
            },
            format='multipart',
        )
        assert sub_res.status_code == 201, sub_res.json()
        sub_data = sub_res.json()['data']

        # Verify no photo_data binary leaked in ordinary submission JSON or photo list JSON
        assert 'photo_data' not in json.dumps(sub_data)
        list_json = client.get('/api/v1/pm/photos/').json()
        assert 'photo_data' not in json.dumps(list_json)

        # Verify local MEDIA_ROOT was NOT used to store permanent files
        after_files = [p for p in media_dir.rglob('*') if p.is_file()] if media_dir.exists() else []
        assert after_files == before_files

        # Verify PostgreSQL BYTEA stored compressed & resized image linked to submission + checklist_response
        att = MaintenancePhotoAttachment.objects.get(submission_id=sub_data['id'], checklist_item_id=checklist[0]['id'])
        stored_bytes = bytes(att.photo_data)
        assert len(stored_bytes) > 0
        assert len(stored_bytes) < len(raw_bytes)
        assert att.file_size == len(stored_bytes)
        assert att.response_id is not None
        assert att.uploaded_by_id == users['operator'].id
        assert att.content_type == 'image/jpeg'

        with Image.open(BytesIO(stored_bytes)) as decoded:
            assert max(decoded.size) <= 1600

        # Verify retrieval endpoint returns exact BYTEA binary with matching Content-Type
        fetch_res = client.get(f'/api/v1/machine-maintenance/photos/{att.id}')
        assert fetch_res.status_code == 200
        assert fetch_res['Content-Type'] == 'image/jpeg'
        assert fetch_res.content == stored_bytes

    def test_reject_base64_and_rollback_on_partial_failure_and_enforce_max_size(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']

        # 1. Reject base64 image JSON payload
        b64_payload = {
            'machine_id': m1.id,
            'frequency': '50_HOURS',
            'hour_meter_reading': 248.0,
            'capture_source': 'CAMERA',
            'responses': [
                {
                    'checklist_item_id': it['id'],
                    'status': 'COMPLETED',
                    'photo_base64': 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
                }
                for it in checklist
            ],
        }
        b64_res = client.post('/api/v1/pm/submissions/', b64_payload, format='json')
        assert b64_res.status_code == 400

        # 2. Enforce configurable maximum image size
        with override_settings(PM_MAX_PHOTO_SIZE_MB=0, PM_MAX_PHOTO_SIZE_BYTES=50):
            oversized = make_test_image(color=(12, 34, 56), filename='too_big.jpg', fmt='JPEG', size=(200, 200))
            big_res = client.post(
                '/api/v1/pm/photos/upload/',
                {'file': oversized, 'machine_id': m1.id, 'checklist_item_id': checklist[0]['id'], 'frequency': '50_HOURS', 'capture_source': 'CAMERA'},
                format='multipart',
            )
            assert big_res.status_code == 400

        # 3. Atomic transaction rollback: if 3rd item is missing photo, 1st and 2nd photos are NOT left in DB
        before_sub_count = MaintenanceSubmission.objects.count()
        before_photo_count = MaintenancePhotoAttachment.objects.count()
        partial_res = client.post(
            '/api/v1/pm/submissions/',
            {
                'machine_id': m1.id,
                'frequency': '50_HOURS',
                'hour_meter_reading': 249.0,
                'capture_source': 'CAMERA',
                'responses': json.dumps(
                    [{'checklist_item_id': it['id'], 'status': 'COMPLETED'} for it in checklist]
                ),
                f"photo_{checklist[0]['id']}": make_test_image(color=(11, 22, 33), filename='r0.jpg', fmt='JPEG'),
                f"photo_{checklist[1]['id']}": make_test_image(color=(44, 55, 66), filename='r1.jpg', fmt='JPEG'),
            },
            format='multipart',
        )
        assert partial_res.status_code == 400
        assert MaintenanceSubmission.objects.count() == before_sub_count
        assert MaintenancePhotoAttachment.objects.count() == before_photo_count

    def test_retake_replaces_unsaved_staged_photo(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])
        checklist = client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        item_id = checklist[0]['id']

        first = client.post(
            '/api/v1/pm/photos/upload/',
            {
                'file': make_test_image(color=(10, 10, 10), filename='first.jpg', fmt='JPEG'),
                'machine_id': m1.id,
                'checklist_item_id': item_id,
                'frequency': 'DAILY',
                'capture_source': 'CAMERA',
            },
            format='multipart',
        )
        assert first.status_code == 201
        first_id = first.json()['data']['id']

        retake = client.post(
            '/api/v1/pm/photos/upload/',
            {
                'file': make_test_image(color=(200, 10, 10), filename='retake.jpg', fmt='JPEG'),
                'machine_id': m1.id,
                'checklist_item_id': item_id,
                'frequency': 'DAILY',
                'capture_source': 'CAMERA',
            },
            format='multipart',
        )
        assert retake.status_code == 201
        retake_id = retake.json()['data']['id']
        assert retake_id != first_id
        assert not MaintenancePhotoAttachment.objects.filter(id=first_id).exists()
        assert MaintenancePhotoAttachment.objects.filter(id=retake_id).exists()

