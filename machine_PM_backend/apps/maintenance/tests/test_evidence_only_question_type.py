import json
import pytest

from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceQuestionResponse,
    MaintenanceVideoAttachment,
)
from .conftest import make_test_image
from .test_dynamic_config_and_video import make_test_video


@pytest.mark.django_db(databases=['default', 'hero'])
class TestEvidenceOnlyQuestionType:
    def _save_cfg(self, admin_client, payload):
        res = admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')
        assert res.status_code == 201, res.json()
        return res.json()['data']

    def _submit(self, op_client, machine_id, frequency, responses_meta, files=None, hm='400.0'):
        data = {
            'machine_id': str(machine_id),
            'frequency': frequency,
            'hour_meter_reading': str(hm),
            'capture_source': 'CAMERA',
            'general_remarks': 'Evidence only workflow verification',
            'responses': json.dumps(responses_meta),
            **(files or {}),
        }
        return op_client.post('/api/v1/machine-maintenance/data', data, format='multipart')

    def test_evidence_only_validation_rules_and_conditional_constraints(
        self, seeded_masters, users, make_auth_client
    ):
        admin_client = make_auth_client(users['admin'])

        # 1) Reject Evidence Only with zero evidence enabled
        empty_ev = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Empty Evidence Only Block',
                'description': 'Should reject when no Photo/Video/GPS is enabled',
                'item_code': 'EV-ONLY-EMPTY',
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['MONDAY']},
                'questions_enabled': True,
                'sections': [
                    {
                        'section_name': 'Media Capture',
                        'questions': [
                            {
                                'temp_key': 'ev-empty',
                                'answer_type': 'EVIDENCE_ONLY',
                                'is_photo_required': False,
                                'is_video_required': False,
                                'is_location_required': False,
                            }
                        ],
                    }
                ],
            },
            format='json',
        )
        assert empty_ev.status_code == 400

        # 2) Reject conditional trigger referencing an Evidence Only block (cannot depend on its own/nonexistent answer)
        bad_cond = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Bad Self Trigger Evidence Only',
                'description': 'Condition referencing Evidence Only must fail',
                'item_code': 'EV-ONLY-BADCOND',
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['MONDAY']},
                'questions_enabled': True,
                'sections': [
                    {
                        'section_name': 'Evidence Section',
                        'questions': [
                            {
                                'temp_key': 'ev-src',
                                'answer_type': 'EVIDENCE_ONLY',
                                'is_photo_required': True,
                                'photos': [{'photo_name': 'Gate Snap', 'is_mandatory': True}],
                            },
                            {
                                'temp_key': 'q-normal',
                                'question_name': 'Follow Up',
                                'answer_type': 'TEXT',
                                'condition_mode': 'CONDITIONAL',
                                'condition_rules': [
                                    {'source_question_key': 'ev-src', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                            },
                        ],
                    }
                ],
            },
            format='json',
        )
        assert bad_cond.status_code == 400
        assert 'cannot reference' in json.dumps(bad_cond.json())

        # 3) Valid conditional Evidence Only block referencing another YES_NO question's answer is accepted
        ok_cond = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Valid Cross-Question Evidence Only',
                'description': 'Evidence Only triggered by YES_NO question',
                'item_code': 'EV-ONLY-CROSS',
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['MONDAY']},
                'questions_enabled': True,
                'sections': [
                    {
                        'section_name': 'Inspection',
                        'questions': [
                            {
                                'temp_key': 'q-leak',
                                'question_name': 'Is there any leakage?',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                            },
                            {
                                'temp_key': 'ev-leak-media',
                                'answer_type': 'EVIDENCE_ONLY',
                                'condition_mode': 'CONDITIONAL',
                                'condition_rules': [
                                    {'source_question_key': 'q-leak', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                                'is_photo_required': True,
                                'photos': [{'photo_name': 'Leak Evidence Snap', 'is_mandatory': True}],
                            },
                        ],
                    }
                ],
            },
        )
        assert ok_cond['sections'][0]['questions'][1]['answer_type'] == 'EVIDENCE_ONLY'
        assert ok_cond['sections'][0]['questions'][1]['is_evidence_only'] is True
        assert ok_cond['sections'][0]['questions'][1]['question_name'] == ''
        assert ok_cond['sections'][0]['questions'][1]['is_mandatory'] is False

    def test_evidence_only_all_media_combinations_mandatory_optional_and_history(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # Deactivate pre-seeded DAILY items so DAILY uses only our configured items cleanly
        ChecklistFrequencyMapping.objects.filter(frequency__code='DAILY').update(is_active=False)

        # Configure distinct activities covering all combinations on DAILY with multiple submissions allowed
        def _mk_daily(code, name, ev_block):
            return self._save_cfg(
                admin_client,
                {
                    'activity_name': name,
                    'description': name,
                    'item_code': code,
                    'frequency': 'DAILY',
                    'frequency_schedule': {'schedule_type': 'DAILY_EVERY_DAY', 'allow_duplicate_in_same_slot': True},
                    'questions_enabled': True,
                    'sections': [{'section_name': 'Capture Section', 'questions': [ev_block]}],
                },
            )

        # 1) Photo only (1 Mandatory Photo + 1 Optional Photo)
        cfg_photo = _mk_daily(
            'EV-PHOTO-ONLY',
            'Photo Only Evidence Activity',
            {
                'answer_type': 'EVIDENCE_ONLY',
                'is_photo_required': True,
                'photos': [
                    {'photo_name': 'Mandatory Oil Sight Photo', 'is_mandatory': True, 'display_order': 1},
                    {'photo_name': 'Optional Overview Photo', 'is_mandatory': False, 'display_order': 2},
                ],
            },
        )
        # 2) Video only (1 Mandatory Video)
        cfg_video = _mk_daily(
            'EV-VIDEO-ONLY',
            'Video Only Evidence Activity',
            {
                'answer_type': 'EVIDENCE_ONLY',
                'is_video_required': True,
                'videos': [
                    {'video_name': 'Engine Sound Video', 'max_duration_seconds': 30, 'min_videos': 1, 'max_videos': 2, 'is_mandatory': True}
                ],
            },
        )
        # 3) GPS only (1 Mandatory GPS with Circle Geofence)
        cfg_gps = _mk_daily(
            'EV-GPS-ONLY',
            'GPS Only Evidence Activity',
            {
                'answer_type': 'EVIDENCE_ONLY',
                'is_location_required': True,
                'locations': [
                    {
                        'location_name': 'Site Entry GPS',
                        'is_mandatory': True,
                        'accuracy_threshold_meters': 50.0,
                        'is_geofence_required': True,
                        'geofence_type': 'CIRCLE',
                        'geofence_latitude': 28.6139,
                        'geofence_longitude': 77.2090,
                        'geofence_radius_meters': 100.0,
                    }
                ],
            },
        )
        # 4) Photo + Video + GPS (All 3 combined)
        cfg_all = _mk_daily(
            'EV-ALL-THREE',
            'All Three Evidence Activity',
            {
                'answer_type': 'EVIDENCE_ONLY',
                'is_photo_required': True,
                'photos': [{'photo_name': 'Panel Photo', 'is_mandatory': True}],
                'is_video_required': True,
                'videos': [{'video_name': 'Run Video', 'max_duration_seconds': 30, 'min_videos': 1, 'max_videos': 1, 'is_mandatory': True}],
                'is_location_required': True,
                'locations': [{'location_name': 'Workspot GPS', 'is_mandatory': True}],
            },
        )
        # 5) Optional evidence only (Photo + Video optional -> succeeds even without attachments or answers)
        cfg_opt = _mk_daily(
            'EV-OPT-ONLY',
            'Optional Evidence Only Activity',
            {
                'answer_type': 'EVIDENCE_ONLY',
                'is_photo_required': True,
                'photos': [{'photo_name': 'Optional Snap', 'is_mandatory': False}],
                'is_video_required': True,
                'videos': [{'video_name': 'Optional Clip', 'max_duration_seconds': 30, 'min_videos': 0, 'max_videos': 1, 'is_mandatory': False}],
            },
        )

        # Verify Mobile APK /check endpoint exposes is_evidence_only=True cleanly without fake question label
        chk = op_alpha.get(f'/api/v1/machine-maintenance/check?machine_id={m1.id}&frequency=DAILY')
        assert chk.status_code == 200
        chk_data = chk.json()['data']
        assert all(q['answer_type'] == 'EVIDENCE_ONLY' and q['is_evidence_only'] is True and q['required'] is False for q in chk_data['questions'])

        p_mand = cfg_photo['sections'][0]['questions'][0]['photos'][0]
        v_mand = cfg_video['sections'][0]['questions'][0]['videos'][0]
        l_gps = cfg_gps['sections'][0]['questions'][0]['locations'][0]
        p_all = cfg_all['sections'][0]['questions'][0]['photos'][0]
        v_all = cfg_all['sections'][0]['questions'][0]['videos'][0]
        l_all = cfg_all['sections'][0]['questions'][0]['locations'][0]

        base_valid_responses = [
            {'checklist_item_id': cfg_photo['id'], 'status': 'COMPLETED', 'custom_fields': {}},
            {'checklist_item_id': cfg_video['id'], 'status': 'COMPLETED', 'video_durations': {str(v_mand['id']): [10.0]}},
            {
                'checklist_item_id': cfg_gps['id'],
                'status': 'COMPLETED',
                'locations': {str(l_gps['id']): {'latitude': 28.61392, 'longitude': 77.20901, 'accuracy_meters': 10.0}},
            },
            {
                'checklist_item_id': cfg_all['id'],
                'status': 'COMPLETED',
                'video_durations': {str(v_all['id']): [12.0]},
                'locations': {str(l_all['id']): {'latitude': 28.6140, 'longitude': 77.2091, 'accuracy_meters': 12.0}},
            },
            {'checklist_item_id': cfg_opt['id'], 'status': 'COMPLETED'},
        ]
        def _make_valid_files(exclude_key=None):
            files_map = {
                f"photo_{cfg_photo['id']}_req_{p_mand['id']}": make_test_image(color=(10, 120, 200), filename='p_mand.png'),
                f"video_{cfg_video['id']}_req_{v_mand['id']}_0": make_test_video(tag=b'ev-vid-1', filename='v1.webm'),
                f"photo_{cfg_all['id']}_req_{p_all['id']}": make_test_image(color=(200, 120, 10), filename='p_all.png'),
                f"video_{cfg_all['id']}_req_{v_all['id']}_0": make_test_video(tag=b'ev-vid-all', filename='v_all.webm'),
            }
            if exclude_key:
                files_map.pop(exclude_key, None)
            return files_map

        # Negative 1: Missing mandatory photo -> 400
        bad_no_photo = self._submit(
            op_alpha, m1.id, 'DAILY', base_valid_responses,
            files=_make_valid_files(exclude_key=f"photo_{cfg_photo['id']}_req_{p_mand['id']}"),
            hm='401.0',
        )
        assert bad_no_photo.status_code == 400

        # Negative 2: Missing mandatory video -> 400
        bad_no_vid = self._submit(
            op_alpha, m1.id, 'DAILY', base_valid_responses,
            files=_make_valid_files(exclude_key=f"video_{cfg_video['id']}_req_{v_mand['id']}_0"),
            hm='402.0',
        )
        assert bad_no_vid.status_code == 400

        # Negative 3: Missing mandatory GPS -> 400
        bad_no_gps_resps = [
            (r if r['checklist_item_id'] != cfg_gps['id'] else {'checklist_item_id': cfg_gps['id'], 'status': 'COMPLETED'})
            for r in base_valid_responses
        ]
        bad_no_gps = self._submit(op_alpha, m1.id, 'DAILY', bad_no_gps_resps, files=_make_valid_files(), hm='403.0')
        assert bad_no_gps.status_code == 400

        # Positive: Submit without any answer values, leaving optional photo & optional video blank -> 201 Created!
        ok_res = self._submit(op_alpha, m1.id, 'DAILY', base_valid_responses, files=_make_valid_files(), hm='410.0')
        assert ok_res.status_code == 201, ok_res.json()
        sub_id = ok_res.json()['data']['submission_id']

        assert MaintenancePhotoAttachment.objects.filter(submission_id=sub_id).count() == 2
        assert MaintenanceVideoAttachment.objects.filter(submission_id=sub_id).count() == 2
        assert MaintenanceLocationAttachment.objects.filter(submission_id=sub_id).count() == 2

        q_rows = list(MaintenanceQuestionResponse.objects.filter(submission_id=sub_id))
        assert len(q_rows) == 5
        for qr in q_rows:
            assert qr.answer_type_snapshot == 'EVIDENCE_ONLY'
            assert qr.question_name_snapshot == ''
            assert qr.answer_value is None
            assert qr.is_mandatory_snapshot is False

        # Verify History Detail exposes Evidence Only snapshot cleanly without fake answer
        hist = op_alpha.get(f'/api/v1/pm/submissions/{sub_id}/').json()['data']
        for resp in hist['responses']:
            snap = resp['questions_snapshot'][0]
            assert snap['answer_type'] == 'EVIDENCE_ONLY'
            assert snap['is_evidence_only'] is True
            assert snap['answer'] is None
            assert snap['question_name'] == ''
