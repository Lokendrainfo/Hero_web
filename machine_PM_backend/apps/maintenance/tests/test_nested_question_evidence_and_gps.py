import json
import pytest

from apps.maintenance.models import (
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistVideoRequirement,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceQuestionResponse,
)
from .conftest import make_test_image
from .test_dynamic_config_and_video import make_test_video


@pytest.mark.django_db(databases=['default', 'hero'])
class TestNestedQuestionEvidenceAndGps:
    def _save_cfg(self, admin_client, payload):
        res = admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')
        assert res.status_code == 201, res.json()
        return res.json()['data']

    def _update_cfg(self, admin_client, cfg_id, payload):
        res = admin_client.put(f'/api/v1/pm/admin/activity-configurations/{cfg_id}/', payload, format='json')
        assert res.status_code == 200, res.json()
        return res.json()['data']

    def _submit_freq(self, op_client, machine_id, frequency, responses_meta, files=None):
        data = {
            'machine_id': machine_id,
            'frequency': frequency,
            'hour_meter_reading': '525.5',
            'general_remarks': 'Nested question evidence and GPS test',
            'responses': json.dumps(responses_meta),
            **(files or {}),
        }
        return op_client.post('/api/v1/machine-maintenance/data', data, format='multipart')

    def test_nested_question_photo_video_and_gps_conditions(self, seeded_masters, users, machines, make_auth_client):
        m1, m2 = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])
        op_beta = make_auth_client(users['operator_beta'])

        cfg = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Hydraulic Hose & Pressure Audit',
                'description': 'Inspect hydraulic hose leakage and pressure.',
                'item_code': 'NESTED-GPS-01',
                'frequencies': ['WEEKLY'],
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_leak',
                        'question_name': 'Is hydraulic oil leakage visible?',
                        'question_description': 'Check main boom lines.',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'condition_mode': 'ALWAYS',
                        'is_photo_required': True,
                        'photos': [
                            {
                                'photo_name': 'Leak Evidence Photo',
                                'photo_description': 'Close-up of leaking fitting',
                                'is_mandatory': True,
                                'display_order': 1,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {
                                        'source_question_key': 'q_leak',
                                        'operator': 'EQUALS',
                                        'expected_value': 'Yes',
                                    }
                                ],
                            }
                        ],
                        'is_video_required': True,
                        'videos': [
                            {
                                'video_name': 'Leak Drip Clip',
                                'video_description': 'Short optional video if dripping',
                                'max_duration_seconds': 30,
                                'min_videos': 0,
                                'max_videos': 1,
                                'is_mandatory': False,
                                'display_order': 1,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {
                                        'source_question_key': 'q_leak',
                                        'operator': 'EQUALS',
                                        'expected_value': 'Yes',
                                    }
                                ],
                            }
                        ],
                        'is_location_required': True,
                        'locations': [
                            {
                                'location_name': 'Safe Operating GPS Point',
                                'location_description': 'Capture machine yard coordinates when clean',
                                'capture_latitude': True,
                                'capture_longitude': True,
                                'accuracy_threshold_meters': 50.0,
                                'capture_timestamp': True,
                                'capture_rule': 'HIGH_ACCURACY',
                                'is_mandatory': True,
                                'display_order': 1,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {
                                        'source_question_key': 'q_leak',
                                        'operator': 'EQUALS',
                                        'expected_value': 'No',
                                    }
                                ],
                            }
                        ],
                    }
                ],
            },
        )

        q = cfg['questions'][0]
        assert q['is_photo_required'] is True
        assert q['is_video_required'] is True
        assert q['is_location_required'] is True
        assert len(q['photos']) == 1
        assert len(q['videos']) == 1
        assert len(q['locations']) == 1

        photo_req = q['photos'][0]
        video_req = q['videos'][0]
        loc_req = q['locations'][0]
        assert photo_req['question_id'] == q['id']
        assert video_req['question_id'] == q['id']
        assert loc_req['question_id'] == q['id']

        # Verify checklist endpoint exposes nested location_requirements
        cl_res = op_alpha.get('/api/v1/pm/checklist/?frequency=WEEKLY')
        assert cl_res.status_code == 200
        cl_item = next(i for i in cl_res.json()['data']['items'] if i['id'] == cfg['id'])
        assert len(cl_item['location_requirements']) == 1
        assert cl_item['location_requirements'][0]['question_id'] == q['id']

        # 1) Answer Yes without mandatory conditional photo -> 400
        bad_no_photo = self._submit_freq(
            op_alpha,
            m1.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q['id']): 'Yes'},
                }
            ],
        )
        assert bad_no_photo.status_code == 400
        assert 'Leak Evidence Photo' in json.dumps(bad_no_photo.json())

        # 2) Answer Yes WITH photo + optional video, NO GPS (GPS is hidden when Yes) -> 201
        ok_yes = self._submit_freq(
            op_alpha,
            m1.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q['id']): 'Yes'},
                    'video_durations': {str(video_req['id']): [12]},
                }
            ],
            files={
                f"photo_{cfg['id']}_req_{photo_req['id']}": make_test_image(color=(210, 40, 40), filename='leak_yes.jpg', fmt='JPEG'),
                f"video_{cfg['id']}_req_{video_req['id']}_0": make_test_video(tag=b'video-yes-bytes', filename='leak_clip.mp4', ext='mp4'),
            },
        )
        assert ok_yes.status_code == 201, ok_yes.json()
        sub_yes_id = ok_yes.json()['data']['submission_id']
        assert MaintenancePhotoAttachment.objects.filter(submission_id=sub_yes_id, question_id=q['id']).count() == 1
        assert MaintenanceLocationAttachment.objects.filter(submission_id=sub_yes_id).count() == 0

        # 3) Answer No without mandatory conditional GPS on m2 (op_beta) -> 400 (even without photo!)
        bad_no_gps = self._submit_freq(
            op_beta,
            m2.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q['id']): 'No'},
                }
            ],
        )
        assert bad_no_gps.status_code == 400
        assert 'Safe Operating GPS Point' in json.dumps(bad_no_gps.json())

        # 4) Answer No with GPS accuracy exceeding threshold (120m > 50m) -> 400
        bad_gps_acc = self._submit_freq(
            op_beta,
            m2.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q['id']): 'No'},
                    'locations': {
                        str(loc_req['id']): {
                            'latitude': 28.6139,
                            'longitude': 77.2090,
                            'accuracy_meters': 120.5,
                            'captured_at': '2026-11-26T10:15:00Z',
                        }
                    },
                }
            ],
        )
        assert bad_gps_acc.status_code == 400
        assert 'exceeds maximum threshold' in json.dumps(bad_gps_acc.json())

        # 5) Answer No with valid GPS coordinates & accuracy -> 201 + verify history snapshot immutability
        ok_gps = self._submit_freq(
            op_beta,
            m2.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q['id']): 'No'},
                    'locations': {
                        str(loc_req['id']): {
                            'latitude': 28.613939,
                            'longitude': 77.209021,
                            'accuracy_meters': 14.2,
                            'captured_at': '2026-11-26T10:16:00Z',
                        }
                    },
                }
            ],
        )
        assert ok_gps.status_code == 201, ok_gps.json()
        sub_gps_id = ok_gps.json()['data']['submission_id']
        loc_att = MaintenanceLocationAttachment.objects.get(submission_id=sub_gps_id)
        assert loc_att.question_id == q['id']
        assert abs(loc_att.latitude - 28.613939) < 1e-5
        assert abs(loc_att.longitude - 77.209021) < 1e-5
        assert loc_att.accuracy_meters == 14.2

        q_resp = MaintenanceQuestionResponse.objects.get(submission_id=sub_gps_id, question_id=q['id'])
        assert len(q_resp.evidence_snapshot['locations']) == 1
        assert q_resp.evidence_snapshot['locations'][0]['captured'] is True

        # Admin edits configuration to disable GPS -> older submission detail must preserve captured GPS & snapshot
        self._update_cfg(
            admin_client,
            cfg['id'],
            {
                'activity_name': 'Hydraulic Hose & Pressure Audit (Updated)',
                'description': 'Updated instructions',
                'item_code': 'NESTED-GPS-01',
                'frequencies': ['WEEKLY'],
                'questions_enabled': False,
            },
        )
        detail_res = op_beta.get(f'/api/v1/pm/submissions/{sub_gps_id}/')
        assert detail_res.status_code == 200
        detail_data = detail_res.json()['data']
        assert detail_data['location_count'] == 1
        resp_entry = next(r for r in detail_data['responses'] if r['checklist_item_id'] == cfg['id'])
        assert len(resp_entry['locations']) == 1
        assert resp_entry['locations'][0]['latitude'] == pytest.approx(28.613939)
        assert len(resp_entry['location_requirements_snapshot']) == 1

    def test_parent_question_hidden_hides_nested_mandatory_evidence(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        cfg = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Nested Hidden Parent Test',
                'description': 'Q2 mandatory evidence hidden when Q2 is hidden.',
                'item_code': 'NESTED-HIDE-01',
                'frequencies': ['MONTHLY'],
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_root',
                        'question_name': 'Any defect observed?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'condition_mode': 'ALWAYS',
                    },
                    {
                        'temp_key': 'q_child',
                        'question_name': 'Defect Severity',
                        'answer_type': 'DROPDOWN',
                        'options': ['Minor', 'Major'],
                        'is_mandatory': True,
                        'display_order': 2,
                        'condition_mode': 'CONDITIONAL',
                        'condition_logic': 'AND',
                        'condition_rules': [
                            {
                                'source_question_key': 'q_root',
                                'operator': 'EQUALS',
                                'expected_value': 'Yes',
                            }
                        ],
                        'is_photo_required': True,
                        'photos': [
                            {
                                'photo_name': 'Mandatory Child Defect Photo',
                                'is_mandatory': True,
                                'display_order': 1,
                                'condition_mode': 'ALWAYS',
                            }
                        ],
                        'is_location_required': True,
                        'locations': [
                            {
                                'location_name': 'Mandatory Child GPS',
                                'is_mandatory': True,
                                'display_order': 1,
                                'condition_mode': 'ALWAYS',
                            }
                        ],
                    },
                ],
            },
        )

        q_root = cfg['questions'][0]
        # Answer q_root = No => q_child and its mandatory photo/GPS are hidden, so submitting with just q_root=No succeeds!
        ok_res = self._submit_freq(
            op_alpha,
            m1.id,
            'MONTHLY',
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_root['id']): 'No'},
                }
            ],
        )
        assert ok_res.status_code == 201, ok_res.json()

        # Verify optional GPS can be omitted without failing validation
        cfg_opt = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Optional GPS Activity',
                'description': 'Optional GPS coordinate logging.',
                'item_code': 'OPT-GPS-01',
                'frequencies': ['YEARLY'],
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_opt',
                        'question_name': 'Parking Brake Checked?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'is_location_required': True,
                        'locations': [
                            {
                                'location_name': 'Optional Parking Yard GPS',
                                'is_mandatory': False,
                                'display_order': 1,
                                'condition_mode': 'ALWAYS',
                            }
                        ],
                    }
                ],
            },
        )
        q_opt = cfg_opt['questions'][0]
        ok_opt = self._submit_freq(
            op_alpha,
            m1.id,
            'YEARLY',
            [
                {
                    'checklist_item_id': cfg_opt['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_opt['id']): 'Yes'},
                }
            ],
        )
        assert ok_opt.status_code == 201, ok_opt.json()

    def test_legacy_cleanup_command_preserves_history_and_blocks_duplicate_names(self, seeded_masters, users, machines, make_auth_client):
        from django.core.management import call_command
        from apps.maintenance.models import (
            ChecklistFrequencyMapping,
            MaintenanceChecklistMaster,
            MaintenanceFrequencyMaster,
            MaintenancePhotoAttachment,
            MaintenanceSubmission,
        )

        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # Submit one DAILY historical checklist on seeded legacy SOP items first
        daily_items = admin_client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        assert len(daily_items) > 0
        resp_meta = []
        files = {}
        for idx, it in enumerate(daily_items):
            resp_meta.append({'checklist_item_id': it['id'], 'status': 'COMPLETED'})
            files[f"photo_{it['id']}"] = make_test_image(color=(idx * 20 % 250, 120, 40), filename=f'leg_{it["id"]}.jpg', fmt='JPEG')
        hist_res = self._submit_freq(op_alpha, m1.id, 'DAILY', resp_meta, files=files)
        assert hist_res.status_code == 201, hist_res.json()
        sub_id = hist_res.json()['data']['submission_id']

        # Execute cleanup twice to verify idempotency and historical preservation
        call_command('cleanup_legacy_pm_config', execute=True)
        call_command('cleanup_legacy_pm_config', execute=True)

        # Hour-based frequencies & all legacy mappings deleted
        assert not MaintenanceFrequencyMaster.objects.filter(code__in=['50_HOURS', '100_HOURS', '250_HOURS', '500_HOURS', '1000_HOURS']).exists()
        assert ChecklistFrequencyMapping.objects.count() == 0

        # Historically referenced SOP items archived & hidden from admin config list, while submission & photos intact
        assert MaintenanceSubmission.objects.filter(id=sub_id).exists()
        assert MaintenancePhotoAttachment.objects.filter(submission_id=sub_id).count() == len(daily_items)
        detail_res = op_alpha.get(f'/api/v1/pm/submissions/{sub_id}/')
        assert detail_res.status_code == 200
        assert len(detail_res.json()['data']['responses']) == len(daily_items)

        cfg_list = admin_client.get('/api/v1/pm/admin/activity-configurations/').json()['data']
        assert cfg_list == []

        # New activity creation works cleanly & duplicate name in same category is rejected
        new_cfg = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Clean Hydraulic Filter Bowl',
                'description': 'Inspect and drain water trap',
                'frequencies': ['WEEKLY'],
                'questions_enabled': False,
            },
        )
        assert new_cfg['item_code'] == 'PM-ACT-001'

        dup_res = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'clean hydraulic filter bowl',
                'description': 'Duplicate attempt',
                'frequencies': ['WEEKLY'],
                'questions_enabled': False,
            },
            format='json',
        )
        assert dup_res.status_code == 400
        assert MaintenanceChecklistMaster.objects.filter(is_archived=False, category__is_checkable=True).count() == 1
