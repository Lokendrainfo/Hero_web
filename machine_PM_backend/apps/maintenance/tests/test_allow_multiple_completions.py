import datetime
import json
from unittest.mock import patch

import pytest
from django.db import IntegrityError

from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    ChecklistFrequencySchedule,
    MaintenanceSubmission,
)


@pytest.mark.django_db(databases=['default', 'hero'])
class TestAllowMultipleCompletionsSetting:
    def _save_cfg(self, admin_client, payload):
        res = admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')
        assert res.status_code == 201, res.json()
        return res.json()['data']

    def _update_cfg(self, admin_client, item_id, payload):
        res = admin_client.put(f'/api/v1/pm/admin/activity-configurations/{item_id}/', payload, format='json')
        assert res.status_code == 200, res.json()
        return res.json()['data']

    def _submit(self, op_client, machine_id, frequency, responses_meta, hour_meter='300.0', client_request_id=None):
        data = {
            'machine_id': str(machine_id),
            'frequency': frequency,
            'hour_meter_reading': str(hour_meter),
            'general_remarks': 'Multiple completion setting test',
            'responses': json.dumps(responses_meta),
        }
        if client_request_id is not None:
            data['client_request_id'] = client_request_id
        return op_client.post('/api/v1/machine-maintenance/data', data, format='multipart')

    def test_default_unchecked_across_all_frequencies_and_preserved_on_edit(
        self, seeded_masters, users, make_auth_client
    ):
        admin_client = make_auth_client(users['admin'])
        specs = [
            ('DAILY', {'schedule_type': 'DAILY_EVERY_DAY'}),
            ('WEEKLY', {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['MONDAY'], 'buffer_days': 2}),
            ('EVERY_15_DAYS', {'schedule_type': 'TWICE_MONTHLY_DATES', 'selected_dates': [1, 16], 'buffer_days': 1}),
            ('MONTHLY', {'schedule_type': 'MONTHLY_DATES', 'selected_dates': [10], 'buffer_days': 3}),
            ('QUARTERLY', {'schedule_type': 'QUARTERLY_DATES', 'quarter_start_month': 1, 'repeat_interval': 3, 'quarter_dates': [15], 'buffer_days': 2}),
            ('YEARLY', {'schedule_type': 'YEARLY_DATES', 'yearly_schedules': [{'month': 6, 'day': 1}], 'buffer_days': 5}),
        ]

        created_items = []
        for idx, (freq_code, sched_payload) in enumerate(specs, start=1):
            cfg = self._save_cfg(
                admin_client,
                {
                    'activity_name': f'Default Flag Check {freq_code}',
                    'description': f'Default unchecked check for {freq_code}',
                    'item_code': f'AMC-DEF-{idx:02d}',
                    'frequency': freq_code,
                    'frequency_schedule': sched_payload,
                    'questions_enabled': False,
                    'is_photo_required': False,
                    'is_video_required': False,
                },
            )
            assert cfg['frequency_schedule']['allow_duplicate_in_same_slot'] is False
            created_items.append((cfg, freq_code, sched_payload))

        # Enable allow_duplicate_in_same_slot on DAILY and WEEKLY, then re-edit without touching it? No, pass updated fields preserving True
        daily_cfg, _, daily_sched = created_items[0]
        updated_daily = self._update_cfg(
            admin_client,
            daily_cfg['id'],
            {
                'activity_name': 'Default Flag Check DAILY (Enabled)',
                'description': daily_cfg['description'],
                'item_code': daily_cfg['item_code'],
                'frequency': 'DAILY',
                'frequency_schedule': {**daily_sched, 'allow_duplicate_in_same_slot': True},
                'questions_enabled': False,
            },
        )
        assert updated_daily['frequency_schedule']['allow_duplicate_in_same_slot'] is True
        assert updated_daily['frequency_schedule']['buffer_days'] == 0

        # Fetching list/detail reflects preserved True
        detail = admin_client.get(f"/api/v1/pm/admin/activity-configurations/{daily_cfg['id']}/").json()['data']
        assert detail['frequency_schedule']['allow_duplicate_in_same_slot'] is True

    def test_daily_blocks_when_unchecked_and_allows_when_checked_with_retry_guard(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        cfg = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Daily Oil & Filter',
                'description': 'Daily duplicate control check',
                'item_code': 'AMC-DAILY-01',
                'frequency': 'DAILY',
                'frequency_schedule': {'schedule_type': 'DAILY_EVERY_DAY'},
                'questions_enabled': False,
                'is_photo_required': False,
            },
        )
        ChecklistFrequencyMapping.objects.filter(frequency__code='DAILY').exclude(checklist_item_id=cfg['id']).update(is_active=False)

        # Unchecked by default -> 1st succeeds, 2nd fails even with different meter & request ID
        s1 = self._submit(
            op_alpha, m1.id, 'DAILY',
            [{'checklist_item_id': cfg['id'], 'status': 'COMPLETED'}],
            hour_meter='100.0',
            client_request_id='daily-req-1',
        )
        assert s1.status_code == 201, s1.json()

        cl_blocked = op_alpha.get(f'/api/v1/pm/checklist/?frequency=DAILY&machine_id={m1.id}').json()['data']
        assert cl_blocked['schedule_status']['allow_duplicate_in_same_slot'] is False
        assert cl_blocked['schedule_status']['already_completed_for_occurrence'] is True

        s2_blocked = self._submit(
            op_alpha, m1.id, 'DAILY',
            [{'checklist_item_id': cfg['id'], 'status': 'COMPLETED'}],
            hour_meter='102.0',
            client_request_id='daily-req-2',
        )
        assert s2_blocked.status_code == 409
        assert 'Daily Oil & Filter' in s2_blocked.json()['message']

        # Admin checks the box for Daily -> multiple submissions allowed, same client_request_id still blocked
        self._update_cfg(
            admin_client,
            cfg['id'],
            {
                'activity_name': cfg['activity_name'],
                'description': cfg['description'],
                'item_code': cfg['item_code'],
                'frequency': 'DAILY',
                'frequency_schedule': {'schedule_type': 'DAILY_EVERY_DAY', 'allow_duplicate_in_same_slot': True},
                'questions_enabled': False,
                'is_photo_required': False,
            },
        )
        cl_allowed = op_alpha.get(f'/api/v1/pm/checklist/?frequency=DAILY&machine_id={m1.id}').json()['data']
        assert cl_allowed['schedule_status']['allow_duplicate_in_same_slot'] is True
        assert cl_allowed['schedule_status']['already_completed_for_occurrence'] is False

        s3_allowed = self._submit(
            op_alpha, m1.id, 'DAILY',
            [{'checklist_item_id': cfg['id'], 'status': 'COMPLETED'}],
            hour_meter='103.0',
            client_request_id='daily-req-3',
        )
        assert s3_allowed.status_code == 201, s3_allowed.json()

        # API retry with same client_request_id MUST STILL return 409 even when multiple completions are enabled
        s3_retry = self._submit(
            op_alpha, m1.id, 'DAILY',
            [{'checklist_item_id': cfg['id'], 'status': 'COMPLETED'}],
            hour_meter='103.0',
            client_request_id='daily-req-3',
        )
        assert s3_retry.status_code == 409
        assert 'already processed' in s3_retry.json()['message'].lower()

    def test_buffer_days_do_not_grant_extra_completion_and_per_activity_isolation(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        # Weekly on Tuesday (2026-12-01) with 3 buffer days -> deadline Friday (2026-12-04)
        cfg_a = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Weekly Hydraulic Unchecked',
                'description': 'Must remain single completion even across buffer days',
                'item_code': 'AMC-WK-NO',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': ['TUESDAY'],
                    'buffer_days': 3,
                    'allow_duplicate_in_same_slot': False,
                },
                'questions_enabled': False,
            },
        )
        cfg_b = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Weekly Lubrication Checked',
                'description': 'Explicitly enabled duplicate completion',
                'item_code': 'AMC-WK-YES',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': ['TUESDAY'],
                    'buffer_days': 3,
                    'allow_duplicate_in_same_slot': True,
                },
                'questions_enabled': False,
            },
        )
        ChecklistFrequencySchedule.objects.update(created_at=datetime.datetime(2026, 11, 20, 8, 0, tzinfo=datetime.timezone.utc))

        # Submit both on scheduled day Dec 1 (Tuesday)
        with patch('apps.maintenance.services.submission_service.timezone.localdate', return_value=datetime.date(2026, 12, 1)), \
             patch('apps.maintenance.services.checklist_service.timezone.localdate', return_value=datetime.date(2026, 12, 1)):
            s1 = self._submit(
                op_alpha, m1.id, 'WEEKLY',
                [
                    {'checklist_item_id': cfg_a['id'], 'status': 'COMPLETED'},
                    {'checklist_item_id': cfg_b['id'], 'status': 'COMPLETED'},
                ],
                hour_meter='500.0',
                client_request_id='wk-dec1-a',
            )
            assert s1.status_code == 201, s1.json()

        # On Thursday Dec 3 (still inside 3-day buffer of Dec 1 occurrence):
        # Unchecked Activity A MUST still block duplicate submission; Buffer Days never add slots.
        with patch('apps.maintenance.services.submission_service.timezone.localdate', return_value=datetime.date(2026, 12, 3)), \
             patch('apps.maintenance.services.checklist_service.timezone.localdate', return_value=datetime.date(2026, 12, 3)):
            cl_dec3 = op_alpha.get(f'/api/v1/pm/checklist/?frequency=WEEKLY&machine_id={m1.id}').json()['data']
            assert cl_dec3['schedule_status']['allow_duplicate_in_same_slot'] is False
            assert cl_dec3['schedule_status']['already_completed_for_occurrence'] is True

            s2_buf = self._submit(
                op_alpha, m1.id, 'WEEKLY',
                [
                    {'checklist_item_id': cfg_a['id'], 'status': 'COMPLETED'},
                    {'checklist_item_id': cfg_b['id'], 'status': 'COMPLETED'},
                ],
                hour_meter='505.0',
                client_request_id='wk-dec3-b',
            )
            assert s2_buf.status_code == 409
            assert 'Weekly Hydraulic Unchecked' in s2_buf.json()['message']

            # Once Admin enables allow_duplicate_in_same_slot on Activity A too, resubmission within the same window succeeds
            self._update_cfg(
                admin_client,
                cfg_a['id'],
                {
                    'activity_name': cfg_a['activity_name'],
                    'description': cfg_a['description'],
                    'item_code': cfg_a['item_code'],
                    'frequency': 'WEEKLY',
                    'frequency_schedule': {
                        'schedule_type': 'WEEKLY_DAYS',
                        'selected_weekdays': ['TUESDAY'],
                        'buffer_days': 3,
                        'allow_duplicate_in_same_slot': True,
                    },
                    'questions_enabled': False,
                },
            )
            s3_ok = self._submit(
                op_alpha, m1.id, 'WEEKLY',
                [
                    {'checklist_item_id': cfg_a['id'], 'status': 'COMPLETED'},
                    {'checklist_item_id': cfg_b['id'], 'status': 'COMPLETED'},
                ],
                hour_meter='506.0',
                client_request_id='wk-dec3-c',
            )
            assert s3_ok.status_code == 201, s3_ok.json()

    def test_concurrent_integrity_error_returns_clean_409_not_500(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])
        cfg = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Concurrency Guard Check',
                'description': 'Guard DB IntegrityError on concurrent double click',
                'item_code': 'AMC-CONC-01',
                'frequency': 'DAILY',
                'frequency_schedule': {'schedule_type': 'DAILY_EVERY_DAY', 'allow_duplicate_in_same_slot': True},
                'questions_enabled': False,
            },
        )
        ChecklistFrequencyMapping.objects.filter(frequency__code='DAILY').exclude(checklist_item_id=cfg['id']).update(is_active=False)
        with patch.object(MaintenanceSubmission.objects, 'create', side_effect=IntegrityError('duplicate client_request_id')):
            res = self._submit(
                op_alpha, m1.id, 'DAILY',
                [{'checklist_item_id': cfg['id'], 'status': 'COMPLETED'}],
                hour_meter='600.0',
                client_request_id='race-req-001',
            )
        assert res.status_code == 409
        assert 'Duplicate submission' in res.json()['message']
