import csv
import io
import json
import pytest

from apps.maintenance.models import (
    ChecklistCustomFieldConfig,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistVideoRequirement,
    MaintenanceChecklistResponse,
    MaintenanceQuestionResponse,
    MaintenanceSection,
)
from .conftest import make_test_image
from .test_dynamic_config_and_video import make_test_video


@pytest.mark.django_db(databases=['default', 'hero'])
class TestNestedSectionsAndQuestions:
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
            'hour_meter_reading': '640.5',
            'general_remarks': 'Nested sections E2E verification',
            'responses': json.dumps(responses_meta),
            **(files or {}),
        }
        return op_client.post('/api/v1/machine-maintenance/data', data, format='multipart')

    def test_multi_section_crud_edit_duplicate_remove_and_no_orphans(
        self, seeded_masters, users, machines, make_auth_client
    ):
        admin_client = make_auth_client(users['admin'])

        # Validation: section name required
        bad_res = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Invalid Section Test',
                'description': 'Missing section name must fail',
                'frequency': 'DAILY',
                'questions_enabled': True,
                'sections': [{'section_name': '', 'questions': []}],
            },
            format='json',
        )
        assert bad_res.status_code == 400

        # Validation: duplicate section name blocked
        dup_res = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Duplicate Section Name Test',
                'description': 'Duplicate section names must fail',
                'frequency': 'DAILY',
                'questions_enabled': True,
                'sections': [
                    {'section_name': 'Cooling System', 'questions': []},
                    {'section_name': 'cooling system', 'questions': []},
                ],
            },
            format='json',
        )
        assert dup_res.status_code == 400

        # 1. Create activity with 3 sections, multiple answer types, and per-question Photo/Video/GPS + conditional rules
        created = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Full Powertrain & Safety Audit',
                'description': 'Multi-section daily inspection checklist',
                'item_code': 'SEC-AUDIT-01',
                'frequency': 'DAILY',
                'questions_enabled': True,
                'sections': [
                    {
                        'temp_key': 'sec_1',
                        'section_name': 'Engine Oil Inspection',
                        'section_description': 'Check engine oil level and dipstick condition',
                        'display_order': 1,
                        'is_active': True,
                        'questions': [
                            {
                                'temp_key': 'q_oil_ok',
                                'question_name': 'Is engine oil level within safe marks?',
                                'question_description': 'Verify dipstick between MIN and MAX',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'display_order': 1,
                                'condition_mode': 'ALWAYS',
                                'is_photo_required': True,
                                'photos': [
                                    {
                                        'photo_name': 'Engine Oil Dipstick Photo',
                                        'photo_description': 'Close-up of dipstick gauge',
                                        'is_mandatory': True,
                                        'display_order': 1,
                                        'condition_mode': 'ALWAYS',
                                    }
                                ],
                            },
                            {
                                'temp_key': 'q_oil_grade',
                                'question_name': 'Observed oil condition',
                                'answer_type': 'DROPDOWN',
                                'options': ['Clean Amber', 'Dark / Aged', 'Milky / Contaminated'],
                                'is_mandatory': True,
                                'display_order': 2,
                                'condition_mode': 'ALWAYS',
                            },
                        ],
                    },
                    {
                        'temp_key': 'sec_2',
                        'section_name': 'Cooling System',
                        'section_description': 'Radiator coolant and fan drive inspection',
                        'display_order': 2,
                        'is_active': True,
                        'questions': [
                            {
                                'temp_key': 'q_coolant_level',
                                'question_name': 'Coolant expansion tank level',
                                'answer_type': 'RADIO',
                                'options': ['Full', 'Low', 'Empty'],
                                'is_mandatory': True,
                                'display_order': 1,
                                'is_video_required': True,
                                'videos': [
                                    {
                                        'video_name': 'Radiator Fan Operation Video',
                                        'video_description': 'Record 5s video when coolant is Low or Empty',
                                        'max_duration_seconds': 20,
                                        'min_videos': 1,
                                        'max_videos': 1,
                                        'is_mandatory': True,
                                        'display_order': 1,
                                        'condition_mode': 'CONDITIONAL',
                                        'condition_logic': 'OR',
                                        'condition_rules': [
                                            {'source_question_key': 'q_coolant_level', 'operator': 'EQUALS', 'expected_value': 'Low'},
                                            {'source_question_key': 'q_coolant_level', 'operator': 'EQUALS', 'expected_value': 'Empty'},
                                        ],
                                    }
                                ],
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Cooling Bay GPS Point',
                                        'capture_latitude': True,
                                        'capture_longitude': True,
                                        'capture_timestamp': True,
                                        'is_mandatory': False,
                                        'display_order': 1,
                                        'condition_mode': 'ALWAYS',
                                    }
                                ],
                            },
                            {
                                'temp_key': 'q_radiator_temp',
                                'question_name': 'Radiator core temperature (C)',
                                'answer_type': 'NUMBER',
                                'is_mandatory': False,
                                'display_order': 2,
                            },
                        ],
                    },
                    {
                        'temp_key': 'sec_3',
                        'section_name': 'Battery Inspection',
                        'section_description': 'Terminals, voltage and electrolyte checks',
                        'display_order': 3,
                        'is_active': True,
                        'questions': [
                            {
                                'temp_key': 'q_battery_checks',
                                'question_name': 'Select observed battery anomalies',
                                'answer_type': 'MULTI_SELECT',
                                'options': ['None', 'Corrosion', 'Loose Clamp', 'Low Charge'],
                                'is_mandatory': True,
                                'display_order': 1,
                            },
                            {
                                'temp_key': 'q_battery_notes',
                                'question_name': 'Battery corrective action notes',
                                'answer_type': 'TEXT',
                                'is_mandatory': False,
                                'display_order': 2,
                            },
                        ],
                    },
                ],
            },
        )

        item_id = created['id']
        assert len(created['sections']) == 3
        assert len(created['questions']) == 6
        assert MaintenanceSection.objects.filter(checklist_item_id=item_id).count() == 3
        assert ChecklistCustomFieldConfig.objects.filter(checklist_item_id=item_id, section__isnull=True).count() == 0
        # Independent display order per section
        assert [q['display_order'] for q in created['sections'][0]['questions']] == [1, 2]
        assert [q['display_order'] for q in created['sections'][1]['questions']] == [1, 2]
        assert [q['display_order'] for q in created['sections'][2]['questions']] == [1, 2]

        # 2. Reopen and edit ONLY one question inside Section 2; Sections 1 and 3 IDs must remain preserved cleanly
        sec1_id_orig = created['sections'][0]['id']
        sec2_id_orig = created['sections'][1]['id']
        sec3_id_orig = created['sections'][2]['id']
        sec1_q_ids_orig = [q['id'] for q in created['sections'][0]['questions']]
        sec3_q_ids_orig = [q['id'] for q in created['sections'][2]['questions']]

        edit_payload = dict(created)
        edit_payload['sections'][1]['questions'][1]['question_name'] = 'Radiator core outlet temperature (C)'
        edit_payload['sections'][1]['questions'][1]['is_mandatory'] = True
        updated = self._update_cfg(admin_client, item_id, edit_payload)

        assert [s['id'] for s in updated['sections']] == [sec1_id_orig, sec2_id_orig, sec3_id_orig]
        assert [q['id'] for q in updated['sections'][0]['questions']] == sec1_q_ids_orig
        assert [q['id'] for q in updated['sections'][2]['questions']] == sec3_q_ids_orig
        assert updated['sections'][1]['questions'][1]['question_name'] == 'Radiator core outlet temperature (C)'
        assert updated['sections'][1]['questions'][1]['is_mandatory'] is True

        # 3. Duplicate Section 3 & remove original Section 3 -> clean replacement without duplicates
        sec3_copy = json.loads(json.dumps(updated['sections'][2]))
        sec3_copy['id'] = None
        sec3_copy['temp_key'] = 'sec_3_copy'
        sec3_copy['section_name'] = 'Battery Inspection Backup'
        sec3_copy['display_order'] = 3
        for q_copy in sec3_copy['questions']:
            q_copy['id'] = None
            q_copy['temp_key'] = f"copy_{q_copy['temp_key']}"

        updated['sections'] = [updated['sections'][0], updated['sections'][1], sec3_copy]
        after_dup_remove = self._update_cfg(admin_client, item_id, updated)
        assert [s['section_name'] for s in after_dup_remove['sections']] == [
            'Engine Oil Inspection',
            'Cooling System',
            'Battery Inspection Backup',
        ]
        assert MaintenanceSection.objects.filter(checklist_item_id=item_id).count() == 3

    def test_inactive_empty_sections_mobile_checklist_submission_history_and_reports(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _m2 = machines
        admin_client = make_auth_client(users['admin'])
        op_client = make_auth_client(users['operator'])

        cfg = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Nested Submission & History Audit',
                'description': 'Verify active/inactive sections, mobile APK, submission snapshots, history and CSV export',
                'item_code': 'SEC-HIST-01',
                'frequency': 'DAILY',
                'questions_enabled': True,
                'sections': [
                    {
                        'temp_key': 's_active',
                        'section_name': 'Primary Fluid Check',
                        'section_description': 'Active section rendered to operator',
                        'display_order': 1,
                        'is_active': True,
                        'questions': [
                            {
                                'temp_key': 'q_fluid',
                                'question_name': 'Fluid level OK?',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'display_order': 1,
                                'is_photo_required': True,
                                'photos': [
                                    {
                                        'photo_name': 'Fluid Gauge Photo',
                                        'is_mandatory': True,
                                        'display_order': 1,
                                        'condition_mode': 'ALWAYS',
                                    }
                                ],
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Check Bay GPS',
                                        'is_mandatory': True,
                                        'capture_latitude': True,
                                        'capture_longitude': True,
                                        'display_order': 1,
                                    }
                                ],
                            }
                        ],
                    },
                    {
                        'temp_key': 's_empty',
                        'section_name': 'Empty Pending Section',
                        'section_description': 'Has zero questions',
                        'display_order': 2,
                        'is_active': True,
                        'questions': [],
                    },
                    {
                        'temp_key': 's_inactive',
                        'section_name': 'Archived Section',
                        'section_description': 'Inactive section must never show or accept answers',
                        'display_order': 3,
                        'is_active': False,
                        'questions': [
                            {
                                'temp_key': 'q_hidden',
                                'question_name': 'Old hidden check',
                                'answer_type': 'TEXT',
                                'is_mandatory': True,
                                'display_order': 1,
                            }
                        ],
                    },
                ],
            },
        )

        item_id = cfg['id']
        active_sec = cfg['sections'][0]
        active_q = active_sec['questions'][0]
        active_photo_req_id = active_q['photos'][0]['id']
        active_loc_req_id = active_q['locations'][0]['id']
        inactive_q = cfg['sections'][2]['questions'][0]

        # Web checklist API returns ONLY non-empty active sections
        cl_res = op_client.get(f'/api/v1/pm/checklist/?frequency=DAILY&machine_id={m1.id}')
        assert cl_res.status_code == 200, cl_res.json()
        cl_items = {it['id']: it for it in cl_res.json()['data']['items']}
        target_cl = cl_items[item_id]
        assert [s['section_name'] for s in target_cl['sections']] == ['Primary Fluid Check']
        assert [q['id'] for q in target_cl['custom_fields']] == [active_q['id']]

        # Mobile APK Check & List APIs also expose non-empty active sections cleanly
        chk_res = op_client.get(f'/api/v1/machine-maintenance/check?machine_id={m1.id}&frequency=DAILY')
        assert chk_res.status_code == 200, chk_res.json()
        chk_acts = {a['activity_id']: a for a in chk_res.json()['data']['activities']}
        assert [s['section_name'] for s in chk_acts[item_id]['sections']] == ['Primary Fluid Check']

        list_res = op_client.get(f'/api/v1/machine-maintenance/list?machine_id={m1.id}&frequency=DAILY')
        assert list_res.status_code == 200, list_res.json()
        list_items = {it['checklist_item_id']: it for it in list_res.json()['data']['checklist_items']}
        assert [s['section_name'] for s in list_items[item_id]['sections']] == ['Primary Fluid Check']

        # Build complete response payload for all DAILY activities on m1
        all_daily_items = cl_res.json()['data']['items']
        base_responses = []
        photo_specs = []
        for idx, cl_it in enumerate(all_daily_items):
            if cl_it['id'] == item_id:
                base_responses.append(
                    {
                        'checklist_item_id': item_id,
                        'status': 'COMPLETED',
                        'remarks': 'Primary section verified cleanly',
                        'custom_fields': [{'question_id': active_q['id'], 'value': 'Yes'}],
                        'locations': [
                            {
                                'location_requirement_id': active_loc_req_id,
                                'question_id': active_q['id'],
                                'latitude': 28.4135,
                                'longitude': 77.0426,
                                'accuracy_meters': 12.0,
                            }
                        ],
                    }
                )
                photo_specs.append((f'photo_{item_id}_req_{active_photo_req_id}', (20 + idx * 5, 110, 190), f'sec_{idx}.png'))
            else:
                base_responses.append(
                    {
                        'checklist_item_id': cl_it['id'],
                        'status': 'COMPLETED',
                        'remarks': 'Standard item checked',
                    }
                )
                photo_specs.append((f'photo_{cl_it["id"]}', (40 + idx * 5, 150, 90), f'std_{idx}.png'))

        def build_files():
            return {k: make_test_image(color=c, filename=fn) for k, c, fn in photo_specs}

        # Attempt submitting answer to inactive section's question -> rejected 422
        bad_responses = json.loads(json.dumps(base_responses))
        for row in bad_responses:
            if row['checklist_item_id'] == item_id:
                row['custom_fields'].append({'question_id': inactive_q['id'], 'value': 'Should fail'})
        reject_res = self._submit_freq(op_client, m1.id, 'DAILY', bad_responses, build_files())
        assert reject_res.status_code == 422, reject_res.json()

        # Submit valid multi-section checklist
        sub_res = self._submit_freq(op_client, m1.id, 'DAILY', base_responses, build_files())
        assert sub_res.status_code == 201, sub_res.json()
        sub_id = sub_res.json()['data']['submission_id']

        resp_obj = MaintenanceChecklistResponse.objects.get(submission_id=sub_id, checklist_item_id=item_id)
        assert len(resp_obj.sections_snapshot) == 1
        assert resp_obj.sections_snapshot[0]['section_name'] == 'Primary Fluid Check'
        q_resp = MaintenanceQuestionResponse.objects.get(response=resp_obj, question_id=active_q['id'])
        assert q_resp.section_name_snapshot == 'Primary Fluid Check'
        assert q_resp.section_display_order_snapshot == 1

        # Later admin renames section & disables questions -> Historical submission snapshot stays intact!
        cfg['sections'] = [
            {
                'id': active_sec['id'],
                'section_name': 'Renamed Section V2',
                'section_description': 'Changed after submission',
                'display_order': 1,
                'is_active': True,
                'questions': [active_sec['questions'][0]],
            }
        ]
        self._update_cfg(admin_client, item_id, cfg)

        # Also test disabling questions completely on update clears sections/questions cleanly without affecting history
        hist_res = op_client.get(f'/api/v1/pm/submissions/{sub_id}/')
        assert hist_res.status_code == 200, hist_res.json()
        hist_resps = {r['checklist_item_id']: r for r in hist_res.json()['data']['responses']}
        assert hist_resps[item_id]['sections_snapshot'][0]['section_name'] == 'Primary Fluid Check'
        assert hist_resps[item_id]['questions_snapshot'][0]['section_name'] == 'Primary Fluid Check'
        assert hist_resps[item_id]['questions_snapshot'][0]['answer'] == 'Yes'

        # Verify Report API and CSV Export include Section Name and Question Name
        rep_res = admin_client.get('/api/v1/pm/reports/')
        assert rep_res.status_code == 200, rep_res.json()
        sq_summary = rep_res.json()['data']['section_question_summary']
        assert any(
            row['section_name'] == 'Primary Fluid Check' and row['question_name'] == 'Fluid level OK?'
            for row in sq_summary
        )

        csv_res = admin_client.get('/api/v1/pm/reports/?export=csv')
        assert csv_res.status_code == 200
        csv_text = csv_res.content.decode('utf-8')
        assert 'Submission Number' in csv_text
        assert 'Sections' in csv_text
        assert 'Questions & Answers' in csv_text
        assert 'Primary Fluid Check' in csv_text
        assert 'Fluid level OK?' in csv_text
        parsed_rows = list(csv.reader(io.StringIO(csv_text)))
        assert len(parsed_rows) >= 2

        # Disabling questions clears sections cleanly while historical snapshots stay intact
        disabled_cfg = self._update_cfg(
            admin_client,
            item_id,
            {
                'activity_name': cfg['activity_name'],
                'description': cfg['description'],
                'item_code': cfg['item_code'],
                'frequency': 'DAILY',
                'questions_enabled': False,
                'sections': [],
                'questions': [],
            },
        )
        assert disabled_cfg['sections'] == []
        assert disabled_cfg['questions'] == []
        assert MaintenanceSection.objects.filter(checklist_item_id=item_id).count() == 0

        hist_after_disable = op_client.get(f'/api/v1/pm/submissions/{sub_id}/')
        assert hist_after_disable.status_code == 200
        hist_after_resps = {r['checklist_item_id']: r for r in hist_after_disable.json()['data']['responses']}
        assert hist_after_resps[item_id]['sections_snapshot'][0]['section_name'] == 'Primary Fluid Check'
