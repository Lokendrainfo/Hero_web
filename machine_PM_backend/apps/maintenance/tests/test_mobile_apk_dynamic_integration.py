import json
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory

from apps.common.exceptions import custom_exception_handler
from apps.hero_integration.models import HeroAPIKey
from apps.maintenance.models import (
    ChecklistCustomFieldConfig,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistVideoRequirement,
    MaintenanceChecklistMaster,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceSubmission,
    MaintenanceVideoAttachment,
)
from .conftest import make_test_image
from .test_dynamic_config_and_video import make_test_video


@pytest.fixture
def apk_client(db, users):
    key_obj = HeroAPIKey.objects.create(
        user=users['admin'],
        name='Mobile APK Dynamic Test Key',
        key='hero_live_dynamic_apk_key_987654',
        prefix='hero_live_',
        is_active=True,
    )
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=key_obj.key)
    return client, key_obj


@pytest.mark.django_db(databases=['default', 'hero'])
class TestMobileApkDynamicIntegration:
    def _save_cfg(self, admin_client, payload):
        res = admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')
        assert res.status_code == 201, res.json()
        return res.json()['data']

    def test_get_check_returns_dynamic_questions_conditional_evidence_and_gps(
        self, seeded_masters, users, machines, make_auth_client, apk_client
    ):
        call_command('cleanup_legacy_pm_config', execute=True)
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        client, _ = apk_client

        # Activity 1: WEEKLY with GPS enabled + conditional photos & videos
        cfg_weekly = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-DUMMY-CHK-001',
                'activity_name': 'TEST-DUMMY Hydraulic Oil Check',
                'description': 'Check hydraulic oil level, machine condition, and operating status.',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': [timezone.localdate().strftime('%A').upper()],
                },
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_oil',
                        'question_name': 'Is Hydraulic Oil Level OK?',
                        'question_description': 'Inspect sight glass.',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'is_photo_required': True,
                        'photos': [
                            {
                                'photo_name': 'Hydraulic Level Photo',
                                'photo_description': 'Sight glass OK photo',
                                'is_mandatory': True,
                                'display_order': 1,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                            },
                            {
                                'photo_name': 'Hydraulic Leakage Photo',
                                'photo_description': 'Leak point closeup',
                                'is_mandatory': True,
                                'display_order': 2,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            },
                        ],
                        'is_location_required': True,
                        'locations': [
                            {
                                'location_name': 'Site Yard GPS',
                                'location_description': 'Capture live GPS coordinates',
                                'capture_latitude': True,
                                'capture_longitude': True,
                                'accuracy_threshold_meters': 35.0,
                                'capture_timestamp': True,
                                'capture_rule': 'HIGH_ACCURACY',
                                'is_mandatory': True,
                                'condition_mode': 'ALWAYS',
                            }
                        ],
                    },
                    {
                        'temp_key': 'q_cond',
                        'question_name': 'What is the machine condition?',
                        'answer_type': 'DROPDOWN',
                        'options': ['Good', 'Normal', 'Needs Attention', 'Critical'],
                        'is_mandatory': False,
                        'display_order': 2,
                    },
                    {
                        'temp_key': 'q_op',
                        'question_name': 'Is the machine operating normally?',
                        'answer_type': 'RADIO',
                        'options': ['Yes', 'No'],
                        'is_mandatory': True,
                        'display_order': 3,
                        'is_video_required': True,
                        'videos': [
                            {
                                'video_name': 'Machine Fault Video',
                                'video_description': 'Record abnormal sound/fault',
                                'max_duration_seconds': 25,
                                'min_videos': 1,
                                'max_videos': 1,
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_op', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            }
                        ],
                    },
                ],
            },
        )

        # Activity 2: MONTHLY with GPS disabled
        self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-DUMMY-CHK-002',
                'activity_name': 'TEST-DUMMY Monthly Visual Inspection',
                'description': 'No GPS required',
                'frequency': 'MONTHLY',
                'frequency_schedule': {'schedule_type': 'MONTHLY_DATES', 'selected_dates': [1, 15, 'LAST']},
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_m',
                        'question_name': 'Visual Notes',
                        'answer_type': 'TEXT',
                        'is_mandatory': False,
                        'display_order': 1,
                        'is_location_required': False,
                    }
                ],
            },
        )

        # GET Check for WEEKLY -> returns full dynamic form + GPS enabled
        chk_res = client.get(
            f"/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users['operator'].id}&frequency=WEEKLY"
        )
        assert chk_res.status_code == 200, chk_res.json()
        data = chk_res.json()['data']
        assert data['eligible'] is True
        assert data['machine']['machine_number'] == '600202608401'
        assert data['machine']['machine_model'] == 'APOLLO A600 V2'
        assert data['machine']['vendor_name'] == 'Vendor Alpha Infra'
        assert data['machine']['assigned_operator'] == 'Ravi Operator'
        assert data['machine']['current_hour_meter_reading'] == 245.0

        assert data['maintenance']['activity_id'] == cfg_weekly['id']
        assert data['maintenance']['item_code'] == 'TEST-DUMMY-CHK-001'
        assert data['maintenance']['frequency'] == 'WEEKLY'
        assert data['maintenance']['applicable_schedule']['schedule_type'] == 'WEEKLY_DAYS'

        assert len(data['questions']) == 3
        assert data['questions'][0]['question_name'] == 'Is Hydraulic Oil Level OK?'
        assert data['questions'][1]['answer_type'] == 'DROPDOWN'
        assert data['questions'][1]['options'] == ['Good', 'Normal', 'Needs Attention', 'Critical']
        assert data['questions'][2]['answer_type'] == 'RADIO'

        assert len(data['photo_requirements']) == 2
        assert data['photo_requirements'][0]['trigger']['answer'] == 'Yes'
        assert data['photo_requirements'][1]['trigger']['answer'] == 'No'

        assert len(data['video_requirements']) == 1
        assert data['video_requirements'][0]['max_duration_seconds'] == 25
        assert data['video_requirements'][0]['trigger']['answer'] == 'No'

        gps_cfg = data['gps_configuration']
        assert gps_cfg['required'] is True
        assert gps_cfg['latitude_required'] is True
        assert gps_cfg['longitude_required'] is True
        assert gps_cfg['accuracy_required'] is True
        assert gps_cfg['accuracy_threshold_meters'] == 35.0
        assert gps_cfg['gps_capture_mandatory'] is True
        assert len(gps_cfg['location_validation_rules']) == 1

        # GET Check for MONTHLY -> GPS disabled dynamically (no hardcoding!)
        chk_monthly = client.get(
            f"/api/v1/machine-maintenance/check?machine_id={m1.id}&user_id={users['operator'].id}&frequency=MONTHLY"
        )
        assert chk_monthly.status_code == 200
        m_gps = chk_monthly.json()['data']['gps_configuration']
        assert m_gps['required'] is False
        assert m_gps['latitude_required'] is False
        assert m_gps['longitude_required'] is False
        assert m_gps['gps_capture_mandatory'] is False
        assert m_gps['location_validation_rules'] == []

    def test_post_validation_status_codes_scenarios_list_media_and_snapshot(
        self, seeded_masters, users, machines, make_auth_client, apk_client
    ):
        call_command('cleanup_legacy_pm_config', execute=True)
        m1, m2 = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])
        op_beta = make_auth_client(users['operator_beta'])
        client, _ = apk_client

        cfg = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-DUMMY-VAL-001',
                'activity_name': 'TEST-DUMMY Full Validation Check',
                'description': 'End-to-end validation test',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': [timezone.localdate().strftime('%A').upper()],
                },
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_oil',
                        'question_name': 'Is Hydraulic Oil Level OK?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'is_photo_required': True,
                        'photos': [
                            {
                                'photo_name': 'Hydraulic Level Photo',
                                'photo_description': 'OK sight glass photo',
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                            },
                            {
                                'photo_name': 'Hydraulic Leakage Photo',
                                'photo_description': 'Leak closeup',
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            },
                        ],
                    },
                    {
                        'temp_key': 'q_cond',
                        'question_name': 'Machine Condition',
                        'answer_type': 'DROPDOWN',
                        'options': ['Good', 'Normal', 'Critical'],
                        'is_mandatory': True,
                        'display_order': 2,
                    },
                    {
                        'temp_key': 'q_date',
                        'question_name': 'Last Filter Replacement Date',
                        'answer_type': 'DATE',
                        'is_mandatory': False,
                        'display_order': 3,
                    },
                    {
                        'temp_key': 'q_leak_vid',
                        'question_name': 'Need Fault Video?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 4,
                        'is_video_required': True,
                        'videos': [
                            {
                                'video_name': 'Fault Video',
                                'video_description': 'Optional or conditional video',
                                'max_duration_seconds': 20,
                                'min_videos': 1,
                                'max_videos': 1,
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_leak_vid', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                            }
                        ],
                        'is_location_required': True,
                        'locations': [
                            {
                                'location_name': 'Optional Yard GPS',
                                'is_mandatory': False,
                                'accuracy_threshold_meters': 50.0,
                                'condition_mode': 'ALWAYS',
                            }
                        ],
                    },
                ],
            },
        )
        q_oil = cfg['questions'][0]
        q_cond = cfg['questions'][1]
        q_date = cfg['questions'][2]
        q_vid = cfg['questions'][3]
        p_yes = q_oil['photos'][0]
        p_no = q_oil['photos'][1]
        v_fault = q_vid['videos'][0]

        def _post(responses_payload, files=None, extra=None):
            body = {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': 'WEEKLY',
                'hour_meter_reading': '250.0',
                'capture_source': 'CAMERA',
                'device_id': 'ANDROID-APK-01',
                'application_version': '2.4.0',
                'responses': json.dumps(responses_payload),
                **(extra or {}),
                **(files or {}),
            }
            return client.post('/api/v1/machine-maintenance/data', body, format='multipart')

        # 1) Unknown / inactive question ID -> 422
        r_422_q = _post([
            {
                'checklist_item_id': cfg['id'],
                'status': 'COMPLETED',
                'custom_fields': {
                    str(q_oil['id']): 'Yes',
                    str(q_cond['id']): 'Good',
                    str(q_vid['id']): 'No',
                    '999999': 'bogus',
                },
            }
        ])
        assert r_422_q.status_code == 422

        # 2) Unknown photo configuration ID -> 422
        r_422_p = _post(
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_oil['id']): 'Yes', str(q_cond['id']): 'Good', str(q_vid['id']): 'No'},
                    'photo_ids_by_req': {'888888': 1},
                }
            ]
        )
        assert r_422_p.status_code == 422

        # 3) Unmapped / unknown checklist_item_id -> 422
        r_422_act = _post([
            {'checklist_item_id': 999999, 'status': 'COMPLETED'},
        ])
        assert r_422_act.status_code == 422

        # 4) Invalid DATE format -> 400
        r_bad_date = _post(
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {
                        str(q_oil['id']): 'Yes',
                        str(q_cond['id']): 'Good',
                        str(q_date['id']): '26-11-2026',
                        str(q_vid['id']): 'No',
                    },
                }
            ],
            files={f"photo_{cfg['id']}_req_{p_yes['id']}": make_test_image(color=(10, 200, 10), filename='ok.jpg', fmt='JPEG')},
        )
        assert r_bad_date.status_code == 400

        # 5) Unsupported media format (.bmp / text/plain) -> 415
        r_415 = _post(
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_oil['id']): 'Yes', str(q_cond['id']): 'Good', str(q_vid['id']): 'No'},
                }
            ],
            files={f"photo_{cfg['id']}_req_{p_yes['id']}": SimpleUploadedFile('bad.txt', b'abc', content_type='text/plain')},
        )
        assert r_415.status_code == 415

        # 6) Oversized media -> 413
        with override_settings(PM_MAX_PHOTO_SIZE_MB=0, PM_MAX_PHOTO_SIZE_BYTES=50):
            r_413 = _post(
                [
                    {
                        'checklist_item_id': cfg['id'],
                        'status': 'COMPLETED',
                        'custom_fields': {str(q_oil['id']): 'Yes', str(q_cond['id']): 'Good', str(q_vid['id']): 'No'},
                    }
                ],
                files={
                    f"photo_{cfg['id']}_req_{p_yes['id']}": make_test_image(
                        color=(15, 25, 35), filename='big.jpg', fmt='JPEG', size=(200, 200)
                    )
                },
            )
            assert r_413.status_code == 413

        # 7) Scenario F simulation (operator switches YES -> NO; submits NO with p_no + v_fault + top-level GPS)
        r_ok = _post(
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {
                        str(q_oil['id']): 'No',
                        str(q_cond['id']): 'Critical',
                        str(q_date['id']): '2026-11-20',
                        str(q_vid['id']): 'Yes',
                    },
                    'video_durations': {str(v_fault['id']): [11.0]},
                }
            ],
            files={
                f"photo_{cfg['id']}_req_{p_no['id']}": make_test_image(color=(220, 40, 40), filename='leak_no.jpg', fmt='JPEG'),
                f"video_{cfg['id']}_req_{v_fault['id']}_0": make_test_video(tag=b'no-fault-vid', filename='fault.mp4', ext='mp4'),
            },
            extra={
                'gps': json.dumps({
                    'latitude': 28.613939,
                    'longitude': 77.209021,
                    'accuracy_meters': 12.5,
                    'captured_at': timezone.now().isoformat(),
                }),
                'scheduled_date': timezone.localdate().isoformat(),
            },
        )
        assert r_ok.status_code == 201, r_ok.json()
        ok_data = r_ok.json()['data']
        sub_id = ok_data['submission_id']
        photo_id = ok_data['photos'][0]['photo_id']
        video_id = ok_data['videos'][0]['video_id']
        assert ok_data['location_count'] == 1

        # Verify submission_metadata persisted
        sub_obj = MaintenanceSubmission.objects.get(id=sub_id)
        assert sub_obj.submission_metadata['device_id'] == 'ANDROID-APK-01'
        assert sub_obj.submission_metadata['application_version'] == '2.4.0'

        # Verify API 4 Photo & Video retrieval: ?metadata=true, ?submission_id= match/mismatch, 403, 404
        p_meta = client.get(f"/api/v1/machine-maintenance/photos/{photo_id}?submission_id={sub_id}&metadata=true")
        assert p_meta.status_code == 200
        pm = p_meta.json()['data']
        assert pm['photo_id'] == photo_id
        assert pm['submission_id'] == sub_id
        assert pm['machine_id'] == m1.id
        assert pm['maintenance_activity_id'] == cfg['id']
        assert pm['question_id'] == q_oil['id']
        assert pm['photo_configuration_id'] == p_no['id']
        assert pm['photo_name'] == 'Hydraulic Leakage Photo'
        assert pm['photo_description'] == 'Leak closeup'
        assert pm['latitude'] == pytest.approx(28.613939)
        assert pm['longitude'] == pytest.approx(77.209021)
        assert pm['gps_accuracy'] == pytest.approx(12.5)
        assert pm['operator_id'] == users['operator'].id
        assert pm['image_url'] == f"/api/v1/machine-maintenance/photos/{photo_id}"

        # Wrong submission_id -> 404
        assert client.get(f"/api/v1/machine-maintenance/photos/{photo_id}?submission_id=999999").status_code == 404
        # Nonexistent photo -> 404
        assert client.get("/api/v1/machine-maintenance/photos/999999").status_code == 404
        # Cross-vendor user -> 403
        assert op_beta.get(f"/api/v1/machine-maintenance/photos/{photo_id}").status_code == 403
        # Binary response has safe metadata headers
        p_bin = op_alpha.get(f"/api/v1/machine-maintenance/photos/{photo_id}?submission_id={sub_id}")
        assert p_bin.status_code == 200
        assert p_bin['Content-Type'] == 'image/jpeg'
        assert p_bin['X-Photo-Id'] == str(photo_id)
        assert p_bin['X-Submission-Id'] == str(sub_id)

        # Video metadata + Range + 404/403
        v_meta = client.get(f"/api/v1/machine-maintenance/videos/{video_id}?submission_id={sub_id}&metadata=true")
        assert v_meta.status_code == 200
        vm = v_meta.json()['data']
        assert vm['video_id'] == video_id
        assert vm['video_name'] == 'Fault Video'
        assert vm['gps_accuracy'] == pytest.approx(12.5)
        assert client.get(f"/api/v1/machine-maintenance/videos/{video_id}?submission_id=999999").status_code == 404
        assert op_beta.get(f"/api/v1/machine-maintenance/videos/{video_id}").status_code == 403

        # Verify API 3 GET List API filters & pagination
        list_res = client.get(
            f"/api/v1/machine-maintenance/list?machine_id={m1.id}&frequency=WEEKLY&maintenance_status=COMPLETED&page=1&page_size=10"
        )
        assert list_res.status_code == 200, list_res.json()
        ldata = list_res.json()['data']
        assert ldata['page']['size'] == 10
        assert ldata['page']['number'] == 1
        assert ldata['page']['totalElements'] == 1
        assert ldata['page']['totalPages'] == 1
        assert len(ldata['content']) == 1
        row = ldata['content'][0]
        assert row['machine_id'] == m1.id
        assert row['activity_id'] == cfg['id']
        assert row['submission_id'] == sub_id
        assert row['maintenance_status'] == 'COMPLETED'
        assert row['completion_status'] == 'COMPLETED'

        # Verify m2 (unsubmitted) shows as DUE under maintenance_status=DUE
        due_res = client.get(
            f"/api/v1/machine-maintenance/list?machine_id={m2.id}&frequency=WEEKLY&maintenance_status=DUE"
        )
        assert due_res.status_code == 200
        assert due_res.json()['data']['page']['totalElements'] == 1
        assert due_res.json()['data']['content'][0]['maintenance_status'] == 'DUE'

        # Verify invalid date range -> 400
        bad_dates = client.get('/api/v1/machine-maintenance/list?from_date=2026-12-01&to_date=2026-11-01')
        assert bad_dates.status_code == 400

        # Verify Historical Snapshot preserved even after Admin edits config
        upd_res = admin_client.put(
            f"/api/v1/pm/admin/activity-configurations/{cfg['id']}/",
            {
                'item_code': cfg['item_code'],
                'activity_name': 'TEST-DUMMY Renamed v2',
                'description': 'Modified later by admin',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': [timezone.localdate().strftime('%A').upper()],
                },
                'questions_enabled': False,
            },
            format='json',
        )
        assert upd_res.status_code == 200
        det = op_alpha.get(f'/api/v1/pm/submissions/{sub_id}/').json()['data']
        resp = det['responses'][0]
        assert resp['description_snapshot'] == 'TEST-DUMMY Full Validation Check'
        assert resp['photo_requirements_snapshot'][0]['captured_media_reference']['photo_id'] == photo_id
        assert resp['photo_requirements_snapshot'][0]['trigger_condition_snapshot']['condition_mode'] == 'CONDITIONAL'
        assert resp['video_requirements_snapshot'][0]['captured_media_references'][0]['video_id'] == video_id

    def test_exception_handler_never_exposes_internal_credentials_on_500(self):
        factory = APIRequestFactory()
        req = factory.get('/api/v1/machine-maintenance/check')
        exc = RuntimeError('FATAL: password authentication failed for user "postgres" at postgresql://secret:pass@db:5432/machine_pm_db')
        resp = custom_exception_handler(exc, {'request': req, 'view': None})
        assert resp.status_code == 500
        body_text = json.dumps(resp.data)
        assert 'postgres' not in body_text
        assert 'secret:pass' not in body_text
        assert 'FATAL' not in body_text

    def test_dummy_scenarios_missing_media_optional_gps_and_dashboard_reconciliation(
        self, seeded_masters, users, machines, make_auth_client, apk_client
    ):
        call_command('cleanup_legacy_pm_config', execute=True)
        m1, m2 = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])
        client, _ = apk_client

        cfg = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-DUMMY-SCEN-001',
                'activity_name': 'TEST-DUMMY Conditional Scenarios',
                'description': 'Covers scenarios A-G with optional GPS',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': [timezone.localdate().strftime('%A').upper()],
                },
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_oil',
                        'question_name': 'Is Hydraulic Oil Level OK?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'is_photo_required': True,
                        'photos': [
                            {
                                'photo_name': 'Hydraulic Level Photo',
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                            },
                            {
                                'photo_name': 'Hydraulic Leakage Photo',
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            },
                        ],
                        'is_video_required': True,
                        'videos': [
                            {
                                'video_name': 'Machine Fault Video',
                                'max_duration_seconds': 30,
                                'min_videos': 1,
                                'max_videos': 1,
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            }
                        ],
                        'is_location_required': True,
                        'locations': [
                            {
                                'location_name': 'Optional Site GPS',
                                'is_mandatory': False,
                                'condition_mode': 'ALWAYS',
                            }
                        ],
                    }
                ],
            },
        )
        q_oil = cfg['questions'][0]
        p_yes = q_oil['photos'][0]
        p_no = q_oil['photos'][1]
        v_no = q_oil['videos'][0]

        # Scenario D: Missing mandatory photo when YES -> 400
        missing_photo_res = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': 'WEEKLY',
                'hour_meter_reading': '300.0',
                'responses': json.dumps([
                    {
                        'checklist_item_id': cfg['id'],
                        'status': 'COMPLETED',
                        'custom_fields': {str(q_oil['id']): 'Yes'},
                    }
                ]),
            },
            format='multipart',
        )
        assert missing_photo_res.status_code == 400

        # Scenario E: Missing mandatory video when NO (even with photo) -> 400
        missing_vid_res = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': 'WEEKLY',
                'hour_meter_reading': '300.0',
                'responses': json.dumps([
                    {
                        'checklist_item_id': cfg['id'],
                        'status': 'COMPLETED',
                        'custom_fields': {str(q_oil['id']): 'No'},
                    }
                ]),
                f"photo_{cfg['id']}_req_{p_no['id']}": make_test_image(color=(190, 20, 20), filename='no_p.jpg', fmt='JPEG'),
            },
            format='multipart',
        )
        assert missing_vid_res.status_code == 400

        # Scenario B + Optional GPS unavailable -> ALLOWED (201)
        ok_yes_opt_gps = client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': str(m1.id),
                'user_id': str(users['operator'].id),
                'frequency': 'WEEKLY',
                'hour_meter_reading': '300.0',
                'responses': json.dumps([
                    {
                        'checklist_item_id': cfg['id'],
                        'status': 'COMPLETED',
                        'custom_fields': {str(q_oil['id']): 'Yes'},
                    }
                ]),
                f"photo_{cfg['id']}_req_{p_yes['id']}": make_test_image(color=(20, 190, 20), filename='yes_p.jpg', fmt='JPEG'),
            },
            format='multipart',
        )
        assert ok_yes_opt_gps.status_code == 201, ok_yes_opt_gps.json()

        # Reconcile Dashboard KPIs exactly: 2 machines total (m1 COMPLETED, m2 DUE)
        dash = admin_client.get('/api/v1/pm/dashboard/').json()['data']
        assert dash['kpis']['total_machines'] == 2
        assert dash['kpis']['maintenance_completed'] == 1
        assert dash['kpis']['maintenance_due'] == 1
        assert dash['kpis']['overdue_maintenance'] == 0
        wk = dash['frequency_completion'][0]
        assert wk['frequency_code'] == 'WEEKLY'
        assert wk['completed'] == 1
        assert wk['due'] == 1
        assert wk['completion_rate'] == 50.0

        # Dry-run of TEST-DUMMY cleanup command succeeds cleanly
        call_command('cleanup_test_dummy_pm')
        assert MaintenanceChecklistMaster.objects.filter(item_code='TEST-DUMMY-SCEN-001').exists()

    def test_checklist_hides_empty_categories_supports_custom_category_and_blocks_double_submit(
        self, seeded_masters, users, machines, make_auth_client
    ):
        from apps.maintenance.models import MaintenanceCategoryMaster

        call_command('cleanup_legacy_pm_config', execute=True)
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # 1) Create 1 Machine activity on WEEKLY (0 Engine activities)
        m_cfg = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-DUMMY-CAT-001',
                'activity_name': 'TEST-DUMMY Machine Boom Check',
                'description': 'Machine-only activity',
                'frequency': 'WEEKLY',
                'questions_enabled': False,
                'is_photo_required': False,
            },
        )
        cl_res = op_alpha.get(f'/api/v1/pm/checklist/?frequency=WEEKLY&machine_id={m1.id}')
        assert cl_res.status_code == 200
        cl_data = cl_res.json()['data']
        assert list(cl_data['categories'].keys()) == ['MACHINE']
        assert [g['category_code'] for g in cl_data['category_groups']] == ['MACHINE']
        assert len(cl_data['category_groups'][0]['items']) == 1

        # 2) Admin creates a brand-new category and adds an activity -> appears automatically
        hyd_cat = MaintenanceCategoryMaster.objects.create(
            code='HYDRAULIC_SYSTEM',
            name='Hydraulic System',
            is_checkable=True,
            sort_order=5,
            is_active=True,
        )
        h_cfg = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-DUMMY-CAT-002',
                'activity_name': 'TEST-DUMMY Hydraulic Valve Check',
                'description': 'Custom category activity',
                'category': hyd_cat.id,
                'frequency': 'WEEKLY',
                'questions_enabled': False,
                'is_photo_required': False,
            },
        )
        cl_res2 = op_alpha.get(f'/api/v1/pm/checklist/?frequency=WEEKLY&machine_id={m1.id}')
        assert cl_res2.status_code == 200
        cl_data2 = cl_res2.json()['data']
        assert [g['category_code'] for g in cl_data2['category_groups']] == ['MACHINE', 'HYDRAULIC_SYSTEM']
        assert 'ENGINE' not in cl_data2['categories']

        # 3) Double-submit with same client_request_id -> first 201, second 409, single History record
        req_id = 'test-dummy-client-req-uuid-001'
        payload = {
            'machine_id': str(m1.id),
            'machine_number': m1.machine_chassis_no,
            'vendor_id': str(m1.vendor_id),
            'operator_id': str(users['operator'].id),
            'frequency': 'WEEKLY',
            'hour_meter_reading': '260.0',
            'general_remarks': 'TEST-DUMMY complete form submit',
            'client_request_id': req_id,
            'capture_source': 'CAMERA',
            'responses': json.dumps([
                {'checklist_item_id': m_cfg['id'], 'status': 'COMPLETED', 'remarks': 'Boom OK'},
                {'checklist_item_id': h_cfg['id'], 'status': 'COMPLETED', 'remarks': 'Valve OK'},
            ]),
        }
        first_sub = op_alpha.post('/api/v1/machine-maintenance/data', payload, format='multipart')
        assert first_sub.status_code == 201, first_sub.json()
        dup_sub = op_alpha.post('/api/v1/machine-maintenance/data', payload, format='multipart')
        assert dup_sub.status_code == 409

        hist = op_alpha.get(f'/api/v1/pm/submissions/{first_sub.json()["data"]["submission_id"]}/')
        assert hist.status_code == 200
        hdata = hist.json()['data']
        assert hdata['machine_number'] == m1.machine_chassis_no
        assert len(hdata['responses']) == 2
        assert {r['category_code'] for r in hdata['responses']} == {'MACHINE', 'HYDRAULIC_SYSTEM'}

        # 4) Deactivating HYDRAULIC_SYSTEM item hides that category again
        del_res = admin_client.delete(f"/api/v1/pm/admin/activity-configurations/{h_cfg['id']}/")
        assert del_res.status_code in (200, 204)
        cl_res3 = op_alpha.get(f'/api/v1/pm/checklist/?frequency=WEEKLY&machine_id={m1.id}')
        assert [g['category_code'] for g in cl_res3.json()['data']['category_groups']] == ['MACHINE']

    def test_mobile_api_complete_latest_features_contract(
        self, seeded_masters, users, machines, make_auth_client
    ):
        call_command('cleanup_legacy_pm_config', execute=True)
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])
        today = timezone.localdate()
        weekday_name = today.strftime('%A').upper()

        cfg = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-CONTRACT-001',
                'activity_name': 'TEST-CONTRACT Full Feature Activity',
                'description': 'Covers sections, EVIDENCE_ONLY, buffer_days, geofence, and operator auth',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': [weekday_name],
                    'buffer_days': 3,
                    'allow_duplicate_in_same_slot': False,
                },
                'questions_enabled': True,
                'sections': [
                    {
                        'section_name': 'Section A — Check & Evidence Only',
                        'section_description': 'Mixed standard question + Evidence Only item',
                        'display_order': 1,
                        'questions': [
                            {
                                'temp_key': 'q_std',
                                'question_name': 'Is Gauge Normal?',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'display_order': 1,
                            },
                            {
                                'temp_key': 'q_ev',
                                'question_name': '',
                                'answer_type': 'EVIDENCE_ONLY',
                                'is_mandatory': False,
                                'display_order': 2,
                                'is_photo_required': True,
                                'photos': [
                                    {
                                        'photo_name': 'Gauge Proof Photo',
                                        'photo_description': 'Live photo capture',
                                        'is_mandatory': True,
                                        'display_order': 1,
                                    }
                                ],
                                'is_video_required': True,
                                'videos': [
                                    {
                                        'video_name': 'Gauge Walkaround Video',
                                        'max_duration_seconds': 20,
                                        'min_videos': 1,
                                        'max_videos': 1,
                                        'is_mandatory': True,
                                        'display_order': 1,
                                    }
                                ],
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Circle Geofence Check',
                                        'capture_latitude': True,
                                        'capture_longitude': True,
                                        'accuracy_threshold_meters': 40.0,
                                        'capture_timestamp': True,
                                        'is_mandatory': True,
                                        'is_geofence_required': True,
                                        'geofence_type': 'CIRCLE',
                                        'geofence_reference_name': 'Jaipur Depot',
                                        'geofence_latitude': 28.613939,
                                        'geofence_longitude': 77.209021,
                                        'geofence_radius_meters': 200.0,
                                        'condition_mode': 'ALWAYS',
                                    }
                                ],
                            },
                        ],
                    }
                ],
            },
        )

        # 1) GET /check returns all latest dynamic metadata cleanly
        chk_res = op_alpha.get(
            f"/api/v1/machine-maintenance/check?machine_id={m1.id}&frequency=WEEKLY"
        )
        assert chk_res.status_code == 200, chk_res.json()
        chk_data = chk_res.json()['data']
        assert chk_data['eligible'] is True
        assert chk_data['machine']['assigned_operator'] == 'Ravi Operator'
        assert chk_data['frequency']['frequency_type'] == 'WEEKLY'
        assert chk_data['maintenance']['category_id'] is not None
        assert chk_data['maintenance']['activity_status'] == 'ACTIVE'
        assert chk_data['maintenance']['is_active'] is True
        assert chk_data['maintenance']['frequency_type'] == 'WEEKLY'
        assert chk_data['maintenance']['buffer_days'] == 3
        assert chk_data['maintenance']['allow_duplicate_in_same_slot'] is False
        assert chk_data['maintenance']['original_scheduled_date'] == today.isoformat()
        assert len(chk_data['activities'][0]['sections']) == 1
        sec_questions = chk_data['activities'][0]['sections'][0]['questions']
        assert [q['answer_type'] for q in sec_questions] == ['YES_NO', 'EVIDENCE_ONLY']
        assert sec_questions[1]['is_evidence_only'] is True

        geofence_rule = chk_data['gps_configuration']['location_validation_rules'][0]
        assert geofence_rule['is_geofence_required'] is True
        assert geofence_rule['geofence_type'] == 'CIRCLE'
        assert geofence_rule['geofence_radius_meters'] == 200.0

        q_std_id = sec_questions[0]['id']
        photo_cfg_id = chk_data['photo_requirements'][0]['id']
        video_cfg_id = chk_data['video_requirements'][0]['id']
        loc_cfg_id = geofence_rule['location_requirement_id']

        # 2) GET /list returns operator-scoped machines and enriched checklist metadata
        list_res = op_alpha.get('/api/v1/machine-maintenance/list?frequency=WEEKLY')
        assert list_res.status_code == 200, list_res.json()
        list_data = list_res.json()['data']
        contract_item = next(x for x in list_data['checklist_items'] if x['id'] == cfg['id'])
        assert contract_item['activity_id'] == cfg['id']
        assert contract_item['activity_status'] == 'ACTIVE'
        assert contract_item['category_id'] is not None
        assert len(contract_item['sections']) == 1

        # 3) POST /data omitting answer on EVIDENCE_ONLY succeeds with photo+video+inside-geofence GPS
        img = make_test_image(color=(10, 120, 200), filename='contract.jpg', fmt='JPEG')
        vid = make_test_video(tag=b'contract1', filename='contract.mp4', ext='mp4')
        post_payload = {
            'machine_id': str(m1.id),
            'frequency': 'WEEKLY',
            'scheduled_date': today.isoformat(),
            'hour_meter_reading': '275.0',
            'capture_source': 'CAMERA',
            'gps': json.dumps({
                'latitude': 28.613939,
                'longitude': 77.209021,
                'accuracy_meters': 10.0,
                'captured_at': timezone.now().isoformat(),
            }),
            'responses': json.dumps([
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'remarks': 'Contract test passed',
                    'custom_fields': {str(q_std_id): 'Yes'},
                    'video_durations': {str(video_cfg_id): [8.0]},
                    'locations': {
                        str(loc_cfg_id): {
                            'latitude': 28.613939,
                            'longitude': 77.209021,
                            'accuracy_meters': 10.0,
                            'captured_at': timezone.now().isoformat(),
                        }
                    },
                }
            ]),
            f'photo_{cfg["id"]}_req_{photo_cfg_id}': img,
            f'video_{cfg["id"]}_req_{video_cfg_id}_0': vid,
        }
        post_res = op_alpha.post('/api/v1/machine-maintenance/data', post_payload, format='multipart')
        assert post_res.status_code == 201, post_res.json()
        pdata = post_res.json()['data']
        assert pdata['assigned_operator'] == 'Ravi Operator'
        assert pdata['scheduled_date'] == today.isoformat()
        assert pdata['buffer_days'] == 3
        assert pdata['allow_duplicate_in_same_slot'] is False
        assert pdata['gps']['latitude'] == 28.613939

        # 4) Duplicate submission in same slot rejected with 409; photos & videos endpoints work
        photo_id = pdata['photos'][0]['photo_id']
        video_id = pdata['videos'][0]['video_id']
        assert op_alpha.get(f'/api/v1/machine-maintenance/photos/{photo_id}?metadata=true').status_code == 200
        v_range = op_alpha.get(f'/api/v1/machine-maintenance/videos/{video_id}', HTTP_RANGE='bytes=0-15')
        assert v_range.status_code == 206

        img2 = make_test_image(color=(20, 130, 210), filename='contract2.jpg', fmt='JPEG')
        vid2 = make_test_video(tag=b'contract2', filename='contract2.mp4', ext='mp4')
        post_payload[f'photo_{cfg["id"]}_req_{photo_cfg_id}'] = img2
        post_payload[f'video_{cfg["id"]}_req_{video_cfg_id}_0'] = vid2
        dup_res = op_alpha.post('/api/v1/machine-maintenance/data', post_payload, format='multipart')
        assert dup_res.status_code == 409



