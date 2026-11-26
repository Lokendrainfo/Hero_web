import json
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.maintenance.models import (
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceVideoAttachment,
)
from .conftest import make_test_image


def unwrap_obj(payload):
    return payload['data'] if isinstance(payload, dict) and 'data' in payload and isinstance(payload['data'], dict) else payload


def make_test_video(tag=b'clip1', filename='capture.webm', ext='webm'):
    if ext in ('mp4', 'mov'):
        raw = b'\x00\x00\x00\x18ftypisom' + tag + (b'\x00' * 32)
        ctype = 'video/mp4'
    else:
        raw = b'\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81' + tag + (b'\x00' * 32)
        ctype = 'video/webm'
    return SimpleUploadedFile(filename, raw, content_type=ctype)


@pytest.mark.django_db(databases=['default', 'hero'])
class TestDynamicConfigAndVideo:
    def _configure_first_daily_item(self, admin_client):
        checklist = admin_client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        first_item = checklist[0]
        category_id = MaintenanceCategoryMaster.objects.get(code=first_item['category_code']).id

        cf_dd = admin_client.post(
            '/api/v1/pm/admin/custom-fields/',
            {
                'category': category_id,
                'checklist_item': first_item['id'],
                'frequency': None,
                'field_name': 'oil_level_status',
                'field_label': 'Engine Oil Level',
                'field_description': 'Check dipstick mark',
                'field_type': 'DROPDOWN',
                'options': ['Low', 'Normal', 'High'],
                'is_mandatory': True,
                'display_order': 1,
                'is_active': True,
            },
            format='json',
        )
        assert cf_dd.status_code == 201, cf_dd.json()

        cf_yn = admin_client.post(
            '/api/v1/pm/admin/custom-fields/',
            {
                'category': category_id,
                'checklist_item': first_item['id'],
                'frequency': None,
                'field_name': 'leak_observed',
                'field_label': 'Leak Observed',
                'field_type': 'YES_NO',
                'is_mandatory': False,
                'display_order': 2,
                'is_active': True,
            },
            format='json',
        )
        assert cf_yn.status_code == 201, cf_yn.json()

        pr_req = admin_client.post(
            '/api/v1/pm/admin/photo-requirements/',
            {
                'category': category_id,
                'checklist_item': first_item['id'],
                'photo_name': 'Sight Glass View',
                'photo_description': 'Mandatory gauge closeup',
                'is_required': True,
                'is_mandatory': True,
                'display_order': 1,
                'is_active': True,
            },
            format='json',
        )
        assert pr_req.status_code == 201, pr_req.json()

        pr_opt = admin_client.post(
            '/api/v1/pm/admin/photo-requirements/',
            {
                'category': category_id,
                'checklist_item': first_item['id'],
                'photo_name': 'Optional Surround View',
                'photo_description': 'Optional angle',
                'is_required': True,
                'is_mandatory': False,
                'display_order': 2,
                'is_active': True,
            },
            format='json',
        )
        assert pr_opt.status_code == 201, pr_opt.json()

        vr_req = admin_client.post(
            '/api/v1/pm/admin/video-requirements/',
            {
                'category': category_id,
                'checklist_item': first_item['id'],
                'video_name': 'Idle Sound Check',
                'video_description': 'Record 10s engine idle',
                'is_required': True,
                'is_mandatory': True,
                'min_videos': 1,
                'max_videos': 2,
                'max_duration_seconds': 20,
                'display_order': 1,
                'is_active': True,
            },
            format='json',
        )
        assert vr_req.status_code == 201, vr_req.json()

        return {
            'checklist': checklist,
            'first_item': first_item,
            'cf_dd': unwrap_obj(cf_dd.json()),
            'cf_yn': unwrap_obj(cf_yn.json()),
            'pr_req': unwrap_obj(pr_req.json()),
            'pr_opt': unwrap_obj(pr_opt.json()),
            'vr_req': unwrap_obj(vr_req.json()),
        }

    def test_admin_crud_and_checklist_propagation(self, seeded_masters, users, make_auth_client):
        admin_client = make_auth_client(users['admin'])
        op_client = make_auth_client(users['operator'])

        # Operator cannot configure dynamic fields
        forbidden = op_client.post('/api/v1/pm/admin/custom-fields/', {}, format='json')
        assert forbidden.status_code == 403

        cfg = self._configure_first_daily_item(admin_client)
        first_id = cfg['first_item']['id']

        # Web checklist & Mobile APK API both include configured dynamic rules
        web_items = op_client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        first_web = next(it for it in web_items if it['id'] == first_id)
        assert len(first_web['custom_fields']) == 2
        assert first_web['custom_fields'][0]['field_type'] == 'DROPDOWN'
        assert first_web['custom_fields'][0]['options'] == ['Low', 'Normal', 'High']
        assert len(first_web['photo_requirements']) == 2
        assert [p['photo_name'] for p in first_web['photo_requirements']] == [
            'Sight Glass View',
            'Optional Surround View',
        ]
        assert len(first_web['video_requirements']) == 1
        assert first_web['video_requirements'][0]['max_duration_seconds'] == 20

        mob_res = op_client.get('/api/v1/machine-maintenance/list?frequency=DAILY')
        assert mob_res.status_code == 200
        mob_items = mob_res.json()['data']['checklist_items']
        first_mob = next(it for it in mob_items if it['id'] == first_id)
        assert len(first_mob['custom_fields']) == 2
        assert len(first_mob['photo_requirements']) == 2
        assert len(first_mob['video_requirements']) == 1

        # Verify edit + audit log previous_value / updated_value capture
        cf_id = cfg['cf_yn']['id']
        upd = admin_client.patch(
            f'/api/v1/pm/admin/custom-fields/{cf_id}/',
            {'field_label': 'Visible Leak Observed', 'is_mandatory': True},
            format='json',
        )
        assert upd.status_code == 200, upd.json()

        logs = admin_client.get('/api/v1/pm/audit-logs/?page_size=20').json()['data']
        cf_upd_log = next(
            l for l in logs
            if l['entity_type'] == 'CUSTOM_FIELD_CONFIG' and str(l['entity_id']) == str(cf_id) and l['action'] == 'CONFIG_UPDATED'
        )
        assert cf_upd_log['details']['previous_value']['field_label'] == 'Leak Observed'
        assert cf_upd_log['details']['previous_value']['is_mandatory'] is False
        assert cf_upd_log['details']['updated_value']['field_label'] == 'Visible Leak Observed'
        assert cf_upd_log['details']['updated_value']['is_mandatory'] is True

        delete_res = admin_client.delete(f'/api/v1/pm/admin/custom-fields/{cf_id}/')
        assert delete_res.status_code in (200, 204)

    def _build_base_form_payload(self, machine_id, checklist, cfg, color_seed=1, include_mandatory_video=True):
        responses_meta = []
        files = {}
        first_id = cfg['first_item']['id']
        for idx, it in enumerate(checklist):
            meta = {
                'checklist_item_id': it['id'],
                'status': 'COMPLETED',
                'remarks': 'OK',
                'capture_source': 'CAMERA',
            }
            if it['id'] == first_id:
                meta['custom_fields'] = {
                    str(cfg['cf_dd']['id']): 'Normal',
                    str(cfg['cf_yn']['id']): 'No',
                }
                files[f"photo_{it['id']}_req_{cfg['pr_req']['id']}"] = make_test_image(
                    color=(10 + color_seed, 20 + idx, 200),
                    filename=f'req_{idx}.png',
                )
                if include_mandatory_video:
                    meta['video_durations'] = {str(cfg['vr_req']['id']): [9.5]}
                    files[f"video_{it['id']}_req_{cfg['vr_req']['id']}_0"] = make_test_video(
                        tag=f'vid-{color_seed}-{idx}'.encode(),
                        filename=f'idle_{idx}.webm',
                    )
            else:
                files[f"photo_{it['id']}"] = make_test_image(
                    color=((idx * 27 + color_seed) % 255, (idx * 61 + 40) % 255, (idx * 89 + 20) % 255),
                    filename=f'item_{idx}.png',
                )
            responses_meta.append(meta)

        payload = {
            'machine_id': machine_id,
            'frequency': 'DAILY',
            'hour_meter_reading': '300.5',
            'general_remarks': 'Dynamic config submission test',
            'responses': json.dumps(responses_meta),
            **files,
        }
        return payload

    def test_submission_validation_storage_and_video_streaming(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])
        op_beta = make_auth_client(users['operator_beta'])

        cfg = self._configure_first_daily_item(admin_client)
        checklist = cfg['checklist']
        first_id = cfg['first_item']['id']

        # 1) Missing mandatory custom field -> 400
        p_missing_cf = self._build_base_form_payload(m1.id, checklist, cfg, color_seed=1)
        bad_meta = json.loads(p_missing_cf['responses'])
        bad_meta[0]['custom_fields'] = {}
        p_missing_cf['responses'] = json.dumps(bad_meta)
        res = op_alpha.post('/api/v1/machine-maintenance/data', p_missing_cf, format='multipart')
        assert res.status_code == 400, res.json()

        # 2) Invalid dropdown option -> 400
        p_bad_opt = self._build_base_form_payload(m1.id, checklist, cfg, color_seed=2)
        bad_opt_meta = json.loads(p_bad_opt['responses'])
        bad_opt_meta[0]['custom_fields'][str(cfg['cf_dd']['id'])] = 'InvalidLevel'
        p_bad_opt['responses'] = json.dumps(bad_opt_meta)
        res = op_alpha.post('/api/v1/machine-maintenance/data', p_bad_opt, format='multipart')
        assert res.status_code == 400, res.json()

        # 3) Missing mandatory video -> 400
        p_no_vid = self._build_base_form_payload(
            m1.id, checklist, cfg, color_seed=3, include_mandatory_video=False
        )
        res = op_alpha.post('/api/v1/machine-maintenance/data', p_no_vid, format='multipart')
        assert res.status_code == 400, res.json()

        # 4) Video exceeding max_duration_seconds (20s) -> 400
        p_long_vid = self._build_base_form_payload(m1.id, checklist, cfg, color_seed=4)
        long_meta = json.loads(p_long_vid['responses'])
        long_meta[0]['video_durations'][str(cfg['vr_req']['id'])] = [35.0]
        p_long_vid['responses'] = json.dumps(long_meta)
        res = op_alpha.post('/api/v1/machine-maintenance/data', p_long_vid, format='multipart')
        assert res.status_code == 400, res.json()

        # 5) Invalid fake video magic bytes -> 400
        p_fake_vid = self._build_base_form_payload(m1.id, checklist, cfg, color_seed=5)
        p_fake_vid[f"video_{first_id}_req_{cfg['vr_req']['id']}_0"] = SimpleUploadedFile(
            'fake.webm', b'NOT_A_VALID_VIDEO_FILE', content_type='video/webm'
        )
        res = op_alpha.post('/api/v1/machine-maintenance/data', p_fake_vid, format='multipart')
        assert res.status_code == 400, res.json()

        # 6) Duplicate photo reused across named requirement & optional requirement -> 400
        p_dup_photo = self._build_base_form_payload(m1.id, checklist, cfg, color_seed=6)
        same_img_bytes = make_test_image(color=(77, 88, 99), filename='same.png').read()
        p_dup_photo[f"photo_{first_id}_req_{cfg['pr_req']['id']}"] = SimpleUploadedFile(
            'req1.png', same_img_bytes, content_type='image/png'
        )
        p_dup_photo[f"photo_{first_id}_req_{cfg['pr_opt']['id']}"] = SimpleUploadedFile(
            'req2.png', same_img_bytes, content_type='image/png'
        )
        res = op_alpha.post('/api/v1/machine-maintenance/data', p_dup_photo, format='multipart')
        assert res.status_code == 400, res.json()

        # 7) Valid complete submission succeeds cleanly (even with optional photo omitted)
        p_ok = self._build_base_form_payload(m1.id, checklist, cfg, color_seed=7)
        ok_res = op_alpha.post('/api/v1/machine-maintenance/data', p_ok, format='multipart')
        assert ok_res.status_code == 201, ok_res.json()
        ok_data = ok_res.json()['data']
        assert ok_data['video_count'] == 1
        assert len(ok_data['videos']) == 1
        sub_id = ok_data['submission_id']

        # Verify PostgreSQL BYTEA storage & submission detail payload
        detail = op_alpha.get(f'/api/v1/pm/submissions/{sub_id}/').json()['data']
        first_resp = next(r for r in detail['responses'] if r['checklist_item_id'] == first_id)
        assert len(first_resp['custom_field_values']) == 2
        assert first_resp['custom_field_values'][0]['value'] == 'Normal'
        assert len(first_resp['photos']) == 1
        assert first_resp['photos'][0]['requirement_name'] == 'Sight Glass View'
        assert len(first_resp['videos']) == 1
        assert first_resp['videos'][0]['requirement_name'] == 'Idle Sound Check'
        assert first_resp['videos'][0]['duration_seconds'] == 9.5

        vid_id = first_resp['videos'][0]['id']
        vid_row = MaintenanceVideoAttachment.objects.get(id=vid_id)
        assert len(bytes(vid_row.video_data)) > 20

        # Authorized full stream & 206 Range request
        stream_full = op_alpha.get(f'/api/v1/machine-maintenance/videos/{vid_id}')
        assert stream_full.status_code == 200
        assert stream_full['Accept-Ranges'] == 'bytes'

        stream_range = op_alpha.get(
            f'/api/v1/machine-maintenance/videos/{vid_id}',
            HTTP_RANGE='bytes=0-15',
        )
        assert stream_range.status_code == 206
        assert len(b''.join(stream_range.streaming_content)) == 16

        # Different vendor operator cannot access protected video (403)
        forbidden_vid = op_beta.get(f'/api/v1/machine-maintenance/videos/{vid_id}')
        assert forbidden_vid.status_code == 403

    def test_single_dynamic_form_atomic_save_and_no_photo_flow(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # 1) Partial/invalid configuration (missing photo name) must rollback without saving partial activity
        bad_save = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Should Not Persist',
                'description': 'Rollback verification',
                'item_code': 'SOP-ROLLBACK-01',
                'frequency': 'WEEKLY',
                'is_photo_required': True,
                'photos': [{'photo_name': '', 'photo_description': 'missing name', 'is_mandatory': True}],
                'is_video_required': False,
                'videos': [],
            },
            format='json',
        )
        assert bad_save.status_code == 400
        assert not MaintenanceChecklistMaster.objects.filter(item_code='SOP-ROLLBACK-01').exists()

        # 2) Valid single-form submission saves activity + single frequency + 3 photos + 2 videos atomically
        save_res = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Hydraulic Oil Level – Check',
                'description': 'Check hydraulic sight glass before operation.',
                'item_code': 'SOP-HYD-900',
                'frequency': 'WEEKLY',
                'is_photo_required': True,
                'photos': [
                    {'photo_name': 'Before Maintenance', 'photo_description': 'Initial state', 'is_mandatory': True},
                    {'photo_name': 'During Maintenance', 'photo_description': 'Mid-check', 'is_mandatory': True},
                    {'photo_name': 'After Maintenance', 'photo_description': 'Final check', 'is_mandatory': False},
                ],
                'is_video_required': True,
                'videos': [
                    {'video_name': 'Machine Operation', 'video_description': 'Operate machine', 'max_duration_seconds': 60, 'is_mandatory': True},
                    {'video_name': 'Hydraulic System Operation', 'video_description': 'Check hoses', 'max_duration_seconds': 30, 'is_mandatory': False},
                ],
            },
            format='json',
        )
        assert save_res.status_code == 201, save_res.json()
        cfg = save_res.json()['data']
        assert cfg['item_code'] == 'SOP-HYD-900'
        assert cfg['frequency'] == 'WEEKLY'
        assert cfg['frequencies'] == ['WEEKLY']
        assert cfg['is_photo_required'] is True
        assert [p['photo_name'] for p in cfg['photos']] == [
            'Before Maintenance',
            'During Maintenance',
            'After Maintenance',
        ]
        assert cfg['is_video_required'] is True
        assert [v['video_name'] for v in cfg['videos']] == [
            'Machine Operation',
            'Hydraulic System Operation',
        ]

        # Automatically available on Perform Maintenance checklist for Weekly & Monthly
        weekly_items = op_alpha.get('/api/v1/pm/checklist/?frequency=WEEKLY').json()['data']['items']
        hyd_weekly = next(it for it in weekly_items if it['item_code'] == 'SOP-HYD-900')
        assert len(hyd_weekly['photo_requirements']) == 3
        assert len(hyd_weekly['video_requirements']) == 2

        # 3) Update to Is Photo Required = No & Is Video Required = No -> Operator can submit Quarterly without photos
        upd_res = admin_client.put(
            f"/api/v1/pm/admin/activity-configurations/{cfg['id']}/",
            {
                'activity_name': 'Quick Visual Walkaround',
                'description': 'Visual inspection only.',
                'item_code': 'SOP-HYD-900',
                'frequencies': ['QUARTERLY'],
                'is_photo_required': False,
                'photos': [],
                'is_video_required': False,
                'videos': [],
            },
            format='json',
        )
        assert upd_res.status_code == 200, upd_res.json()
        upd_cfg = upd_res.json()['data']
        assert upd_cfg['is_photo_required'] is False
        assert upd_cfg['is_video_required'] is False
        assert upd_cfg['photos'] == []
        assert upd_cfg['videos'] == []

        quarterly_items = op_alpha.get('/api/v1/pm/checklist/?frequency=QUARTERLY').json()['data']['items']
        assert len(quarterly_items) == 1
        assert quarterly_items[0]['requires_photo'] is False

        no_photo_sub = op_alpha.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': m1.id,
                'frequency': 'QUARTERLY',
                'hour_meter_reading': '320.0',
                'general_remarks': 'No photo activity test',
                'responses': json.dumps([
                    {
                        'checklist_item_id': cfg['id'],
                        'status': 'COMPLETED',
                        'remarks': 'Verified OK',
                    }
                ]),
            },
            format='multipart',
        )
        assert no_photo_sub.status_code == 201, no_photo_sub.json()
