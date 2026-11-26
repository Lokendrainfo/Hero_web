import json
import pytest

from apps.maintenance.models import (
    MaintenanceChecklistMaster,
    MaintenanceQuestionResponse,
)
from .conftest import make_test_image
from .test_dynamic_config_and_video import make_test_video


@pytest.mark.django_db(databases=['default', 'hero'])
class TestFullyDynamicQuestionEvidenceSystem:
    def _save_cfg(self, admin_client, payload):
        res = admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')
        assert res.status_code == 201, res.json()
        return res.json()['data']

    def _submit_freq(self, op_client, machine_id, frequency, responses_meta, files=None):
        data = {
            'machine_id': machine_id,
            'frequency': frequency,
            'hour_meter_reading': '450.0',
            'general_remarks': 'Dynamic checklist test',
            'responses': json.dumps(responses_meta),
            **(files or {}),
        }
        return op_client.post('/api/v1/machine-maintenance/data', data, format='multipart')

    def test_all_eight_independent_scenarios(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # Scenario A: No Questions, No Photos, No Videos (Weekly)
        cfg_a = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario A Visual Inspection',
                'description': 'Zero questions, zero photos, zero videos.',
                'item_code': 'SCEN-A',
                'frequencies': ['WEEKLY'],
                'questions_enabled': False,
                'is_photo_required': False,
                'is_video_required': False,
            },
        )
        assert cfg_a['questions'] == []
        assert cfg_a['photos'] == []
        assert cfg_a['videos'] == []
        assert cfg_a['is_photo_required'] is False

        res_a = self._submit_freq(
            op_alpha,
            m1.id,
            'WEEKLY',
            [{'checklist_item_id': cfg_a['id'], 'status': 'COMPLETED', 'remarks': 'OK'}],
        )
        assert res_a.status_code == 201, res_a.json()

        # Scenario B: Questions only (1 Optional + 1 Mandatory MULTI_SELECT) on Monthly
        cfg_b = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario B Questions Only',
                'description': 'Questions without photos or videos.',
                'item_code': 'SCEN-B',
                'frequencies': ['MONTHLY'],
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'qb1',
                        'question_name': 'Checks Performed',
                        'answer_type': 'MULTI_SELECT',
                        'options': ['Gauge', 'Belts', 'Hoses'],
                        'is_mandatory': True,
                        'display_order': 1,
                    },
                    {
                        'temp_key': 'qb2',
                        'question_name': 'Optional Technician Note',
                        'answer_type': 'TEXT',
                        'is_mandatory': False,
                        'display_order': 2,
                    },
                ],
                'is_photo_required': False,
                'is_video_required': False,
            },
        )
        q_mand = cfg_b['questions'][0]
        # Missing mandatory multi-select -> 400
        bad_b = self._submit_freq(
            op_alpha,
            m1.id,
            'MONTHLY',
            [{'checklist_item_id': cfg_b['id'], 'status': 'COMPLETED', 'custom_fields': {}}],
        )
        assert bad_b.status_code == 400
        # Answering mandatory, leaving optional blank -> 201 (zero photos/videos)
        ok_b = self._submit_freq(
            op_alpha,
            m1.id,
            'MONTHLY',
            [
                {
                    'checklist_item_id': cfg_b['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_mand['id']): ['Gauge', 'Hoses']},
                }
            ],
        )
        assert ok_b.status_code == 201, ok_b.json()

        # Scenario C: Photos only (1 Optional + 1 Mandatory) on Quarterly
        cfg_c = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario C Photos Only',
                'description': 'Only photos, zero questions/videos.',
                'item_code': 'SCEN-C',
                'frequencies': ['QUARTERLY'],
                'questions_enabled': False,
                'is_photo_required': True,
                'photos': [
                    {'photo_name': 'Optional Overview', 'is_mandatory': False, 'display_order': 1},
                    {'photo_name': 'Mandatory Plate', 'is_mandatory': True, 'display_order': 2},
                ],
                'is_video_required': False,
            },
        )
        p_mand_c = cfg_c['photos'][1]
        ok_c = self._submit_freq(
            op_alpha,
            m1.id,
            'QUARTERLY',
            [{'checklist_item_id': cfg_c['id'], 'status': 'COMPLETED'}],
            files={
                f"photo_{cfg_c['id']}_req_{p_mand_c['id']}": make_test_image(color=(12, 34, 56), filename='c.png')
            },
        )
        assert ok_c.status_code == 201, ok_c.json()

        # Scenario D: Videos only (1 Mandatory video, 0 questions, 0 photos) on Yearly
        cfg_d = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario D Videos Only',
                'description': 'Video only, zero photos/questions.',
                'item_code': 'SCEN-D',
                'frequencies': ['YEARLY'],
                'questions_enabled': False,
                'is_photo_required': False,
                'is_video_required': True,
                'videos': [
                    {
                        'video_name': 'Annual Spin Clip',
                        'max_duration_seconds': 45,
                        'min_videos': 1,
                        'max_videos': 1,
                        'is_mandatory': True,
                    }
                ],
            },
        )
        v_d = cfg_d['videos'][0]
        ok_d = self._submit_freq(
            op_alpha,
            m1.id,
            'YEARLY',
            [
                {
                    'checklist_item_id': cfg_d['id'],
                    'status': 'COMPLETED',
                    'video_durations': {str(v_d['id']): [10.0]},
                }
            ],
            files={f"video_{cfg_d['id']}_req_{v_d['id']}_0": make_test_video(tag=b'scen-d', filename='d.webm')},
        )
        assert ok_d.status_code == 201, ok_d.json()

        # Scenarios E (Q+P), F (Q+V), G (Q+P+V), H (P+V) on independent activities/frequencies
        cfg_e = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario E',
                'description': 'Q + Optional Photo',
                'item_code': 'SCEN-E',
                'frequencies': ['WEEKLY'],
                'questions_enabled': True,
                'questions': [{'temp_key': 'qe1', 'question_name': 'Meter Reading', 'answer_type': 'NUMBER', 'is_mandatory': True}],
                'is_photo_required': True,
                'photos': [{'photo_name': 'Optional Snap', 'is_mandatory': False}],
                'is_video_required': False,
            },
        )
        cfg_f = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario F',
                'description': 'Q + Optional Video',
                'item_code': 'SCEN-F',
                'frequencies': ['MONTHLY'],
                'questions_enabled': True,
                'questions': [{'temp_key': 'qf1', 'question_name': 'Sound Normal?', 'answer_type': 'YES_NO', 'is_mandatory': True}],
                'is_photo_required': False,
                'is_video_required': True,
                'videos': [{'video_name': 'Optional Sound Clip', 'max_duration_seconds': 30, 'is_mandatory': False}],
            },
        )
        cfg_g = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario G',
                'description': 'Q + P + V all optional',
                'item_code': 'SCEN-G',
                'frequencies': ['QUARTERLY'],
                'questions_enabled': True,
                'questions': [{'temp_key': 'qg1', 'question_name': 'Notes', 'answer_type': 'TEXT', 'is_mandatory': False}],
                'is_photo_required': True,
                'photos': [{'photo_name': 'Optional Quarter Snap', 'is_mandatory': False}],
                'is_video_required': True,
                'videos': [{'video_name': 'Optional Quarter Video', 'max_duration_seconds': 30, 'is_mandatory': False}],
            },
        )
        cfg_h = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Scenario H',
                'description': 'Photos + Videos without questions',
                'item_code': 'SCEN-H',
                'frequencies': ['YEARLY'],
                'questions_enabled': False,
                'is_photo_required': True,
                'photos': [{'photo_name': 'Yearly Tag', 'is_mandatory': False}],
                'is_video_required': True,
                'videos': [{'video_name': 'Yearly Sound', 'max_duration_seconds': 30, 'is_mandatory': False}],
            },
        )
        assert cfg_e['id'] and cfg_f['id'] and cfg_g['id'] and cfg_h['id']

        # Optional G submits cleanly on Quarterly (with Scenario C photo satisfied) on a distinct meter reading
        ok_g = op_alpha.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': m1.id,
                'frequency': 'QUARTERLY',
                'hour_meter_reading': '451.0',
                'responses': json.dumps([
                    {'checklist_item_id': cfg_c['id'], 'status': 'COMPLETED'},
                    {'checklist_item_id': cfg_g['id'], 'status': 'COMPLETED', 'custom_fields': {}},
                ]),
                f"photo_{cfg_c['id']}_req_{p_mand_c['id']}": make_test_image(color=(99, 88, 77), filename='c2.png'),
            },
            format='multipart',
        )
        assert ok_g.status_code == 201, ok_g.json()

    def test_conditional_evidence_answer_switch_and_history_snapshot_preservation(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # Configure Activity with Dynamic Question & Conditional Photos/Videos (Zero hardcoding)
        cfg = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Hydraulic System Dynamic Check',
                'description': 'Conditional evidence based on inspection answers.',
                'item_code': 'COND-HYD-01',
                'frequencies': ['WEEKLY'],
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q-oil-ok',
                        'question_name': 'Is Hydraulic Oil Level OK?',
                        'question_description': 'Check sight glass',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                    },
                    {
                        'temp_key': 'q-pressure',
                        'question_name': 'Pressure Gauge PSI',
                        'answer_type': 'NUMBER',
                        'is_mandatory': False,
                        'display_order': 2,
                    },
                ],
                'is_photo_required': True,
                'photos': [
                    {
                        'photo_name': 'Hydraulic Oil Level Photo',
                        'photo_description': 'Normal level evidence',
                        'is_mandatory': True,
                        'display_order': 1,
                        'condition_mode': 'CONDITIONAL',
                        'condition_logic': 'AND',
                        'condition_rules': [
                            {'source_question_key': 'q-oil-ok', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                        ],
                    },
                    {
                        'photo_name': 'Hydraulic Leakage Photo',
                        'photo_description': 'Fault evidence when oil not OK or high pressure',
                        'is_mandatory': True,
                        'display_order': 2,
                        'condition_mode': 'CONDITIONAL',
                        'condition_logic': 'OR',
                        'condition_rules': [
                            {'source_question_key': 'q-oil-ok', 'operator': 'EQUALS', 'expected_value': 'No'},
                            {'source_question_key': 'q-pressure', 'operator': 'GREATER_THAN', 'expected_value': '3000'},
                        ],
                    },
                ],
                'is_video_required': True,
                'videos': [
                    {
                        'video_name': 'Hydraulic Leakage Video',
                        'video_description': 'Fault video clip',
                        'max_duration_seconds': 30,
                        'min_videos': 1,
                        'max_videos': 1,
                        'is_mandatory': True,
                        'condition_mode': 'CONDITIONAL',
                        'condition_logic': 'AND',
                        'condition_rules': [
                            {'source_question_key': 'q-oil-ok', 'operator': 'EQUALS', 'expected_value': 'No'}
                        ],
                    }
                ],
            },
        )

        q_ok_id = cfg['questions'][0]['id']
        q_psi_id = cfg['questions'][1]['id']
        p_yes_id = cfg['photos'][0]['id']
        p_no_id = cfg['photos'][1]['id']
        v_no_id = cfg['videos'][0]['id']

        # Broken condition reference validation (deleting referenced question without updating rule -> 400)
        bad_del_q = admin_client.put(
            f"/api/v1/pm/admin/activity-configurations/{cfg['id']}/",
            {
                'activity_name': cfg['activity_name'],
                'description': cfg['description'],
                'item_code': cfg['item_code'],
                'frequencies': ['WEEKLY'],
                'questions_enabled': True,
                'questions': [cfg['questions'][1]],
                'is_photo_required': True,
                'photos': cfg['photos'],
                'is_video_required': False,
            },
            format='json',
        )
        assert bad_del_q.status_code == 400

        # Answer YES (PSI = 2000): ONLY p_yes_id is required; p_no_id & v_no_id are hidden and must NOT block
        sub_yes = self._submit_freq(
            op_alpha,
            m1.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': cfg['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_ok_id): 'Yes', str(q_psi_id): 2000},
                }
            ],
            files={f"photo_{cfg['id']}_req_{p_yes_id}": make_test_image(color=(10, 200, 30), filename='ok.png')},
        )
        assert sub_yes.status_code == 201, sub_yes.json()
        sub_yes_id = sub_yes.json()['data']['submission_id']

        # Verify submission #1 snapshots stored in DB
        assert MaintenanceQuestionResponse.objects.filter(submission_id=sub_yes_id).count() == 2

        # Answer NO on distinct hour meter: missing v_no_id MUST fail on backend (400), even if only photo given
        bad_no = op_alpha.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': m1.id,
                'frequency': 'WEEKLY',
                'hour_meter_reading': '460.0',
                'responses': json.dumps([
                    {
                        'checklist_item_id': cfg['id'],
                        'status': 'NOT_COMPLETED',
                        'remarks': 'Leak observed at hose fitting',
                        'custom_fields': {str(q_ok_id): 'No'},
                    }
                ]),
                f"photo_{cfg['id']}_req_{p_no_id}": make_test_image(color=(210, 20, 20), filename='leak.png'),
            },
            format='multipart',
        )
        assert bad_no.status_code == 400

        # Providing both triggered fault photo + fault video succeeds -> 201
        ok_no = op_alpha.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': m1.id,
                'frequency': 'WEEKLY',
                'hour_meter_reading': '461.0',
                'responses': json.dumps([
                    {
                        'checklist_item_id': cfg['id'],
                        'status': 'NOT_COMPLETED',
                        'remarks': 'Leak observed at hose fitting',
                        'custom_fields': {str(q_ok_id): 'No'},
                        'video_durations': {str(v_no_id): [8.5]},
                    }
                ]),
                f"photo_{cfg['id']}_req_{p_no_id}": make_test_image(color=(210, 20, 21), filename='leak2.png'),
                f"video_{cfg['id']}_req_{v_no_id}_0": make_test_video(tag=b'leak-vid', filename='leak.webm'),
            },
            format='multipart',
        )
        assert ok_no.status_code == 201, ok_no.json()

        # Now Admin completely edits configuration to v2 (disables all questions, photos, videos)
        v2_res = admin_client.put(
            f"/api/v1/pm/admin/activity-configurations/{cfg['id']}/",
            {
                'activity_name': 'Renamed Activity v2',
                'description': 'Completely replaced configuration.',
                'item_code': cfg['item_code'],
                'frequencies': ['WEEKLY'],
                'questions_enabled': False,
                'is_photo_required': False,
                'is_video_required': False,
            },
            format='json',
        )
        assert v2_res.status_code == 200
        assert v2_res.json()['data']['config_version'] == 2

        # Historical Submission #1 detail in History MUST retain original v1 question names, answers, and photo snapshots!
        hist_detail = op_alpha.get(f'/api/v1/pm/submissions/{sub_yes_id}/').json()['data']
        hist_resp = hist_detail['responses'][0]
        assert hist_resp['description_snapshot'] == 'Hydraulic System Dynamic Check'
        assert hist_resp['config_version_snapshot'] == 1
        assert [q['question_name'] for q in hist_resp['questions_snapshot']] == [
            'Is Hydraulic Oil Level OK?',
            'Pressure Gauge PSI',
        ]
        assert hist_resp['questions_snapshot'][0]['answer'] == 'Yes'
        assert hist_resp['photo_requirements_snapshot'][0]['photo_name'] == 'Hydraulic Oil Level Photo'
        assert hist_resp['photos'][0]['requirement_name'] == 'Hydraulic Oil Level Photo'
        assert hist_resp['photos'][0]['requirement_description'] == 'Normal level evidence'
        assert hist_resp['photos'][0]['is_mandatory_snapshot'] is True

    def test_dynamic_dashboard_frequencies_and_activity_completion(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # 1) Unconfigured Weekly/Monthly frequencies must NOT appear in dashboard or frequencies list
        init_dash = admin_client.get('/api/v1/pm/dashboard/').json()['data']
        init_codes = [fc['frequency_code'] for fc in init_dash['frequency_completion']]
        assert 'WEEKLY' not in init_codes
        assert 'MONTHLY' not in init_codes

        # 2) Admin configures Weekly Activity 1 -> Weekly automatically appears
        w1 = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Weekly Check 1',
                'description': 'First weekly check',
                'item_code': 'DYN-WK-01',
                'frequencies': ['WEEKLY'],
                'questions_enabled': False,
                'is_photo_required': False,
                'is_video_required': False,
            },
        )
        dash_w1 = admin_client.get('/api/v1/pm/dashboard/?frequency=WEEKLY').json()['data']
        assert dash_w1['kpis']['total_machines'] == 2
        assert [fc['frequency_code'] for fc in dash_w1['frequency_completion']] == ['WEEKLY']

        # Operator completes Weekly Activity 1 on m1 -> m1 is COMPLETED for Weekly
        sub_w1 = self._submit_freq(
            op_alpha,
            m1.id,
            'WEEKLY',
            [{'checklist_item_id': w1['id'], 'status': 'COMPLETED', 'remarks': 'OK'}],
        )
        assert sub_w1.status_code == 201
        dash_after_sub = admin_client.get('/api/v1/pm/dashboard/?frequency=WEEKLY').json()['data']
        m1_row = next(r for r in dash_after_sub['machines'] if r['id'] == m1.id)
        assert m1_row['status'] == 'COMPLETED'
        assert dash_after_sub['kpis']['maintenance_completed'] == 1
        assert dash_after_sub['kpis']['total_machines'] == 2

        # 3) Admin adds a second Weekly Activity (DYN-WK-02) -> m1 must NOT stay COMPLETED merely from Activity 1!
        self._save_cfg(
            admin_client,
            {
                'activity_name': 'Weekly Check 2',
                'description': 'Second weekly check added later',
                'item_code': 'DYN-WK-02',
                'frequencies': ['WEEKLY'],
                'questions_enabled': False,
                'is_photo_required': False,
                'is_video_required': False,
            },
        )
        dash_w2 = admin_client.get('/api/v1/pm/dashboard/?frequency=WEEKLY').json()['data']
        m1_row_after = next(r for r in dash_w2['machines'] if r['id'] == m1.id)
        assert m1_row_after['status'] in ('DUE', 'PENDING')
        assert dash_w2['kpis']['maintenance_completed'] == 0
