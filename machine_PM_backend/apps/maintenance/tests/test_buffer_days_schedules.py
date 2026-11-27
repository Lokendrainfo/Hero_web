import datetime
import json
from types import SimpleNamespace
import pytest
from django.utils import timezone

from apps.maintenance.models import (
    ChecklistFrequencySchedule,
    MaintenanceFrequencyMaster,
    MaintenanceSubmission,
)
from apps.maintenance.services.schedule_service import evaluate_scheduled_cycle
from .conftest import make_test_image


@pytest.mark.django_db(databases=['default', 'hero'])
class TestBufferDaysSchedules:
    def _save_cfg(self, admin_client, payload):
        return admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')

    def test_buffer_days_validation_and_daily_rejection(self, seeded_masters, users, make_auth_client):
        admin_client = make_auth_client(users['admin'])

        # Daily must reject buffer_days > 0
        bad_daily = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Daily Cannot Have Buffer',
                'description': 'Daily must have zero grace period',
                'frequency': 'DAILY',
                'frequency_schedule': {
                    'frequency_type': 'DAILY',
                    'schedule_type': 'DAILY_EVERY_DAY',
                    'buffer_days': 2,
                },
                'questions_enabled': False,
            },
        )
        assert bad_daily.status_code == 400

        # Out of range (> 365 or negative) rejected
        for bad_val in (-1, 366, 'abc'):
            bad_weekly = self._save_cfg(
                admin_client,
                {
                    'activity_name': f'Bad Buffer {bad_val}',
                    'description': 'Buffer validation test',
                    'frequency': 'WEEKLY',
                    'frequency_schedule': {
                        'frequency_type': 'WEEKLY',
                        'schedule_type': 'WEEKLY_DAYS',
                        'selected_weekdays': ['TUESDAY'],
                        'buffer_days': bad_val,
                    },
                    'questions_enabled': False,
                },
            )
            assert bad_weekly.status_code == 400

        # Valid buffer configuration on each of the 5 supported frequencies
        valid_cases = [
            ('WEEKLY', {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['TUESDAY'], 'buffer_days': 2}),
            ('EVERY_15_DAYS', {'schedule_type': 'TWICE_MONTHLY_DATES', 'selected_dates': [1, 16], 'buffer_days': 2}),
            ('MONTHLY', {'schedule_type': 'MONTHLY_DATES', 'selected_dates': [15], 'buffer_days': 3}),
            ('QUARTERLY', {'schedule_type': 'QUARTERLY_DATES', 'quarter_start_month': 1, 'repeat_interval': 3, 'quarter_dates': [15], 'buffer_days': 5}),
            ('YEARLY', {'schedule_type': 'YEARLY_DATES', 'yearly_schedules': [{'month': 3, 'day': 10}], 'buffer_days': 2}),
        ]
        for idx, (f_code, f_sched) in enumerate(valid_cases, start=1):
            res = self._save_cfg(
                admin_client,
                {
                    'activity_name': f'Buffered {f_code} Check #{idx}',
                    'description': f'Test {f_code} with buffer days',
                    'frequency': f_code,
                    'frequency_schedule': {'frequency_type': f_code, **f_sched},
                    'questions_enabled': False,
                },
            )
            assert res.status_code == 201, res.json()
            assert res.json()['data']['frequency_schedule']['buffer_days'] == f_sched['buffer_days']

    def test_buffer_deadline_calculations_and_daily_no_buffer(self):
        created_at = timezone.make_aware(datetime.datetime(2025, 12, 1, 8, 0, 0))
        daily_freq = SimpleNamespace(code='DAILY', name='Daily')
        daily_sched = ChecklistFrequencySchedule(
            frequency_type='DAILY',
            schedule_type=ChecklistFrequencySchedule.SCHED_DAILY_EVERY_DAY,
            buffer_days=0,
            is_active=True,
            created_at=created_at,
        )
        # Daily: scheduled == deadline, overdue immediately the day after last submission
        sub_dec1 = SimpleNamespace(
            submission_date=datetime.date(2026, 12, 1),
            submission_number='PM-DAILY-1',
            status='COMPLETED',
        )
        daily_dec2 = evaluate_scheduled_cycle(
            freq=daily_freq,
            schedules=[daily_sched],
            latest_completed_sub=sub_dec1,
            today=datetime.date(2026, 12, 2),
            latest_any_sub=sub_dec1,
        )
        assert daily_dec2['status'] == 'DUE'
        assert daily_dec2['buffer_days'] == 0
        assert daily_dec2['current_occurrence_date'] == '2026-12-02'
        assert daily_dec2['completion_deadline_date'] == '2026-12-02'

        daily_dec3 = evaluate_scheduled_cycle(
            freq=daily_freq,
            schedules=[daily_sched],
            latest_completed_sub=sub_dec1,
            today=datetime.date(2026, 12, 3),
            latest_any_sub=sub_dec1,
        )
        assert daily_dec3['status'] == 'OVERDUE'
        assert daily_dec3['buffer_days'] == 0

        # Spec examples:
        # 1) Weekly: Tuesday (2026-12-01), Buffer=2 -> Deadline Thursday 2026-12-03; Overdue starting 2026-12-04
        weekly_freq = SimpleNamespace(code='WEEKLY', name='Weekly')
        weekly_sched = ChecklistFrequencySchedule(
            frequency_type='WEEKLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_WEEKLY_DAYS,
            selected_weekdays=['TUESDAY'],
            start_date=datetime.date(2026, 11, 24),
            buffer_days=2,
            is_active=True,
            created_at=created_at,
        )
        w_tue = evaluate_scheduled_cycle(freq=weekly_freq, schedules=[weekly_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 1))
        assert w_tue['status'] == 'DUE'
        assert w_tue['current_occurrence_date'] == '2026-12-01'
        assert w_tue['completion_deadline_date'] == '2026-12-03'

        w_wed = evaluate_scheduled_cycle(freq=weekly_freq, schedules=[weekly_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 2))
        assert w_wed['status'] == 'DUE'
        assert w_wed['within_buffer_period'] is True
        assert w_wed['current_occurrence_date'] == '2026-12-01'
        assert w_wed['completion_deadline_date'] == '2026-12-03'

        w_thu = evaluate_scheduled_cycle(freq=weekly_freq, schedules=[weekly_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 3))
        assert w_thu['status'] == 'DUE'
        assert w_thu['within_buffer_period'] is True

        w_fri = evaluate_scheduled_cycle(freq=weekly_freq, schedules=[weekly_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 4))
        assert w_fri['status'] == 'OVERDUE'
        assert 'Overdue by 1d' in w_fri['due_label']

        # Do not carry unused buffer forward into the next cycle:
        # Even if Dec 1 was completed on Dec 1 (2 buffer days unused), Dec 8 deadline stays Dec 10 (Dec 11 is OVERDUE)
        sub_tue = SimpleNamespace(submission_date=datetime.date(2026, 12, 1), submission_number='PM-W-1', status='COMPLETED')
        w_dec8_done = evaluate_scheduled_cycle(
            freq=weekly_freq, schedules=[weekly_sched], latest_completed_sub=sub_tue, today=datetime.date(2026, 12, 3), latest_any_sub=sub_tue
        )
        assert w_dec8_done['status'] == 'COMPLETED'
        assert w_dec8_done['already_completed_for_occurrence'] is True

        w_next_dec11 = evaluate_scheduled_cycle(
            freq=weekly_freq, schedules=[weekly_sched], latest_completed_sub=sub_tue, today=datetime.date(2026, 12, 11), latest_any_sub=sub_tue
        )
        assert w_next_dec11['status'] == 'OVERDUE'
        assert w_next_dec11['current_occurrence_date'] == '2026-12-08'
        assert w_next_dec11['completion_deadline_date'] == '2026-12-10'

        # 2) Every 15 Days: 1 Dec + 2 = 3 Dec
        e15_freq = SimpleNamespace(code='EVERY_15_DAYS', name='Every 15 Days')
        e15_sched = ChecklistFrequencySchedule(
            frequency_type='EVERY_15_DAYS',
            schedule_type=ChecklistFrequencySchedule.SCHED_TWICE_MONTHLY_DATES,
            selected_dates=[1, 16],
            start_date=datetime.date(2026, 12, 1),
            buffer_days=2,
            is_active=True,
            created_at=created_at,
        )
        assert evaluate_scheduled_cycle(freq=e15_freq, schedules=[e15_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 3))['status'] == 'DUE'
        assert evaluate_scheduled_cycle(freq=e15_freq, schedules=[e15_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 4))['status'] == 'OVERDUE'

        # 3) Monthly: 15 Dec + 3 = 18 Dec
        m_freq = SimpleNamespace(code='MONTHLY', name='Monthly')
        m_sched = ChecklistFrequencySchedule(
            frequency_type='MONTHLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_MONTHLY_DATES,
            selected_dates=[15],
            start_date=datetime.date(2026, 12, 1),
            buffer_days=3,
            is_active=True,
            created_at=created_at,
        )
        m_res = evaluate_scheduled_cycle(freq=m_freq, schedules=[m_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 18))
        assert m_res['status'] == 'DUE'
        assert m_res['current_occurrence_date'] == '2026-12-15'
        assert m_res['completion_deadline_date'] == '2026-12-18'
        assert evaluate_scheduled_cycle(freq=m_freq, schedules=[m_sched], latest_completed_sub=None, today=datetime.date(2026, 12, 19))['status'] == 'OVERDUE'

        # 4) Quarterly: 15 Jan + 5 = 20 Jan
        q_freq = SimpleNamespace(code='QUARTERLY', name='Quarterly')
        q_sched = ChecklistFrequencySchedule(
            frequency_type='QUARTERLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_QUARTERLY_DATES,
            quarter_start_month=1,
            repeat_interval=3,
            quarter_dates=[15],
            selected_dates=[15],
            start_date=datetime.date(2026, 1, 1),
            buffer_days=5,
            is_active=True,
            created_at=created_at,
        )
        q_res = evaluate_scheduled_cycle(freq=q_freq, schedules=[q_sched], latest_completed_sub=None, today=datetime.date(2026, 1, 20))
        assert q_res['status'] == 'DUE'
        assert q_res['completion_deadline_date'] == '2026-01-20'
        assert evaluate_scheduled_cycle(freq=q_freq, schedules=[q_sched], latest_completed_sub=None, today=datetime.date(2026, 1, 21))['status'] == 'OVERDUE'

        # 5) Yearly: 10 Mar + 2 = 12 Mar
        y_freq = SimpleNamespace(code='YEARLY', name='Yearly')
        y_sched = ChecklistFrequencySchedule(
            frequency_type='YEARLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_YEARLY_DATES,
            yearly_schedules=[{'month': 3, 'day': 10}],
            start_date=datetime.date(2026, 1, 1),
            buffer_days=2,
            is_active=True,
            created_at=created_at,
        )
        y_res = evaluate_scheduled_cycle(freq=y_freq, schedules=[y_sched], latest_completed_sub=None, today=datetime.date(2026, 3, 12))
        assert y_res['status'] == 'DUE'
        assert y_res['completion_deadline_date'] == '2026-03-12'
        assert evaluate_scheduled_cycle(freq=y_freq, schedules=[y_sched], latest_completed_sub=None, today=datetime.date(2026, 3, 13))['status'] == 'OVERDUE'

    def test_submission_within_buffer_stores_scheduled_and_deadline_and_blocks_duplicate(
        self, seeded_masters, users, machines, make_auth_client, monkeypatch
    ):
        m1, _m2 = machines
        admin_client = make_auth_client(users['admin'])
        op_client = make_auth_client(users['operator'])

        # Disable seeded WEEKLY default/other items or replace with our clean WEEKLY activity scheduled 2 days ago (within 3-day buffer)
        day_scheduled = datetime.date(2026, 12, 1)  # Tuesday
        day_within_buffer = datetime.date(2026, 12, 3)  # Thursday (within +3d buffer -> deadline Dec 4)
        monkeypatch.setattr(timezone, 'localdate', lambda: day_within_buffer)

        # Configure WEEKLY activity on Tuesday with buffer_days = 3
        cfg_res = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Weekly Buffered Transmission Check',
                'description': 'Scheduled Tuesday with 3 day buffer',
                'item_code': 'BUF-WEEKLY-01',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'frequency_type': 'WEEKLY',
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': ['TUESDAY'],
                    'buffer_days': 3,
                    'allow_duplicate_in_same_slot': False,
                },
                'questions_enabled': False,
            },
        )
        assert cfg_res.status_code == 201, cfg_res.json()
        cfg = cfg_res.json()['data']
        weekly_freq = MaintenanceFrequencyMaster.objects.get(code='WEEKLY')
        # Anchor seeded/new weekly schedules cleanly at 2026-12-01
        ChecklistFrequencySchedule.objects.filter(frequency=weekly_freq).update(
            schedule_type=ChecklistFrequencySchedule.SCHED_WEEKLY_DAYS,
            selected_weekdays=['TUESDAY'],
            start_date=day_scheduled,
            buffer_days=3,
            allow_duplicate_in_same_slot=False,
        )

        cl = op_client.get(f'/api/v1/pm/checklist/?frequency=WEEKLY&machine_id={m1.id}').json()['data']
        assert cl['schedule_status']['status'] == 'DUE'
        assert cl['schedule_status']['within_buffer_period'] is True
        assert cl['schedule_status']['current_occurrence_date'] == '2026-12-01'
        assert cl['schedule_status']['completion_deadline_date'] == '2026-12-04'

        # Mobile APK Check returns both scheduled_date & completion_deadline_date
        chk = op_client.get(f'/api/v1/machine-maintenance/check?machine_id={m1.id}&frequency=WEEKLY').json()['data']
        assert chk['maintenance']['scheduled_date'] == '2026-12-01'
        assert chk['maintenance']['completion_deadline_date'] == '2026-12-04'
        assert chk['maintenance']['buffer_days'] == 3

        # Submit all active WEEKLY items on Dec 3 (within buffer for Dec 1 scheduled date)
        items = cl['items']
        responses = []
        files = {}
        for idx, it in enumerate(items):
            responses.append({'checklist_item_id': it['id'], 'status': 'COMPLETED', 'remarks': 'Completed within buffer'})
            if it['requires_photo']:
                files[f'photo_{it["id"]}'] = make_test_image(color=(30 + idx * 11, 160, 210), filename=f'buf_{idx}.png')

        sub_res = op_client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': m1.id,
                'frequency': 'WEEKLY',
                'hour_meter_reading': '800.0',
                'general_remarks': 'Submitted in buffer window',
                'responses': json.dumps(responses),
                **files,
            },
            format='multipart',
        )
        assert sub_res.status_code == 201, sub_res.json()
        sub_id = sub_res.json()['data']['submission_id']

        sub = MaintenanceSubmission.objects.get(id=sub_id)
        assert sub.submission_date == datetime.date(2026, 12, 3)
        assert sub.scheduled_due_date == datetime.date(2026, 12, 1)
        assert sub.completion_deadline_date == datetime.date(2026, 12, 4)

        # Remaining buffer day (Dec 4): duplicate submission blocked & status stays COMPLETED
        monkeypatch.setattr(timezone, 'localdate', lambda: datetime.date(2026, 12, 4))
        cl_dec4 = op_client.get(f'/api/v1/pm/checklist/?frequency=WEEKLY&machine_id={m1.id}').json()['data']
        assert cl_dec4['schedule_status']['status'] == 'COMPLETED'
        assert cl_dec4['schedule_status']['already_completed_for_occurrence'] is True

        files2 = {f'photo_{it["id"]}': make_test_image(color=(120 + idx * 11, 80, 90), filename=f'buf2_{idx}.png') for idx, it in enumerate(items) if it['requires_photo']}
        dup_res = op_client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': m1.id,
                'frequency': 'WEEKLY',
                'hour_meter_reading': '802.0',
                'responses': json.dumps(responses),
                **files2,
            },
            format='multipart',
        )
        assert dup_res.status_code == 409

        # When allow_duplicate_in_same_slot=True, duplicate submission inside buffer window IS allowed
        ChecklistFrequencySchedule.objects.filter(frequency=weekly_freq).update(allow_duplicate_in_same_slot=True)
        files3 = {f'photo_{it["id"]}': make_test_image(color=(190 + idx * 11, 40, 50), filename=f'buf3_{idx}.png') for idx, it in enumerate(items) if it['requires_photo']}
        multi_res = op_client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': m1.id,
                'frequency': 'WEEKLY',
                'hour_meter_reading': '805.0',
                'responses': json.dumps(responses),
                **files3,
            },
            format='multipart',
        )
        assert multi_res.status_code == 201, multi_res.json()
