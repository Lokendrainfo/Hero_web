import json
from datetime import date, timedelta
import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.maintenance.models import (
    ChecklistFrequencySchedule,
    MaintenanceFrequencyMaster,
    MaintenanceSubmission,
)
from apps.maintenance.services.schedule_service import (
    get_schedule_dates_in_range,
    validate_and_normalize_schedule,
)
from .conftest import make_test_image


@pytest.mark.django_db(databases=['default', 'hero'])
class TestAdvancedFrequencySchedules:
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
            'hour_meter_reading': '610.0',
            'general_remarks': 'Schedule execution test',
            'responses': json.dumps(responses_meta),
            **(files or {}),
        }
        return op_client.post('/api/v1/machine-maintenance/data', data, format='multipart')

    def test_schedule_validation_leap_year_and_shorter_months(self):
        # Invalid calendar dates rejected
        with pytest.raises(ValidationError):
            validate_and_normalize_schedule('YEARLY', {'schedule_type': 'YEARLY_DATES', 'yearly_schedules': [{'month': 2, 'day': 30}]})
        with pytest.raises(ValidationError):
            validate_and_normalize_schedule('YEARLY', {'schedule_type': 'YEARLY_DATES', 'yearly_schedules': [{'month': 4, 'day': 31}]})

        # Duplicate dates rejected
        with pytest.raises(ValidationError):
            validate_and_normalize_schedule('MONTHLY', {'schedule_type': 'MONTHLY_DATES', 'selected_dates': [5, 5]})
        with pytest.raises(ValidationError):
            validate_and_normalize_schedule('EVERY_15_DAYS', {'schedule_type': 'TWICE_MONTHLY_DATES', 'first_date': 10, 'second_date': 10})
        with pytest.raises(ValidationError):
            validate_and_normalize_schedule('YEARLY', {'schedule_type': 'YEARLY_DATES', 'yearly_schedules': [{'month': 1, 'day': 15}, {'month': 1, 'day': 15}]})

        # Every 15 Days Option 1 requires start_date
        with pytest.raises(ValidationError):
            validate_and_normalize_schedule('EVERY_15_DAYS', {'schedule_type': 'INTERVAL_15_DAYS', 'repeat_interval': 15})

        # Leap year Feb 29 handling (fallback vs skip)
        feb29_fallback = ChecklistFrequencySchedule(
            frequency_type='YEARLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_YEARLY_DATES,
            yearly_schedules=[{'month': 2, 'day': 29}],
            use_last_day_fallback=True,
            start_date=date(2024, 1, 1),
        )
        dates_fb = get_schedule_dates_in_range(feb29_fallback, date(2024, 1, 1), date(2028, 12, 31))
        assert dates_fb == [date(2024, 2, 29), date(2025, 2, 28), date(2026, 2, 28), date(2027, 2, 28), date(2028, 2, 29)]

        feb29_strict = ChecklistFrequencySchedule(
            frequency_type='YEARLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_YEARLY_DATES,
            yearly_schedules=[{'month': 2, 'day': 29}],
            use_last_day_fallback=False,
            start_date=date(2024, 1, 1),
        )
        dates_strict = get_schedule_dates_in_range(feb29_strict, date(2024, 1, 1), date(2028, 12, 31))
        assert dates_strict == [date(2024, 2, 29), date(2028, 2, 29)]

        # Monthly 31st fallback across 28/30/31-day months
        m31 = ChecklistFrequencySchedule(
            frequency_type='MONTHLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_MONTHLY_DATES,
            selected_dates=[31],
            use_last_day_fallback=True,
            start_date=date(2026, 1, 1),
        )
        assert get_schedule_dates_in_range(m31, date(2026, 1, 1), date(2026, 4, 30)) == [
            date(2026, 1, 31),
            date(2026, 2, 28),
            date(2026, 3, 31),
            date(2026, 4, 30),
        ]

        # Every 15 Days from start date
        ev15 = ChecklistFrequencySchedule(
            frequency_type='EVERY_15_DAYS',
            schedule_type=ChecklistFrequencySchedule.SCHED_INTERVAL_15_DAYS,
            start_date=date(2026, 1, 1),
            repeat_interval=15,
        )
        assert get_schedule_dates_in_range(ev15, date(2026, 1, 1), date(2026, 2, 1)) == [
            date(2026, 1, 1),
            date(2026, 1, 16),
            date(2026, 1, 31),
        ]

        # Quarterly starting Jan 15 -> Jan, Apr, Jul, Oct
        qtr = ChecklistFrequencySchedule(
            frequency_type='QUARTERLY',
            schedule_type=ChecklistFrequencySchedule.SCHED_QUARTERLY_DATES,
            quarter_start_month=1,
            repeat_interval=3,
            quarter_dates=[15],
            start_date=date(2026, 1, 1),
        )
        assert get_schedule_dates_in_range(qtr, date(2026, 1, 1), date(2026, 12, 31)) == [
            date(2026, 1, 15),
            date(2026, 4, 15),
            date(2026, 7, 15),
            date(2026, 10, 15),
        ]

    def test_single_frequency_enforcement_daily_no_config_and_schedule_recalculation(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])

        today = timezone.localdate()

        # 1) Reject multiple frequencies on a single activity
        multi_bad = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Reject Multi Freq',
                'description': 'Should reject more than one frequency',
                'frequencies': ['DAILY', 'WEEKLY'],
                'questions_enabled': False,
            },
            format='json',
        )
        assert multi_bad.status_code == 400
        assert 'Only one frequency' in json.dumps(multi_bad.json())

        # 2) Configure 6 separate single-frequency activities cleanly (Daily defaults allow_duplicate=False, 0 buffer)
        cfg_daily = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Daily Walkaround Inspection',
                'description': 'Daily visual safety check.',
                'item_code': 'SINGLE-DAILY-01',
                'frequency': 'DAILY',
                'frequency_schedule': {
                    'schedule_type': 'DAILY_EVERY_DAY',
                    'start_date': '2026-01-01',  # must be stripped/ignored for Daily
                },
                'questions_enabled': False,
            },
        )
        assert cfg_daily['frequency'] == 'DAILY'
        assert cfg_daily['frequency_schedule']['schedule_summary'] == 'Maintenance is required every calendar day.'
        assert cfg_daily['frequency_schedule']['start_date'] is None
        assert cfg_daily['frequency_schedule']['end_date'] is None
        assert cfg_daily['frequency_schedule']['buffer_days'] == 0
        assert cfg_daily['frequency_schedule']['allow_duplicate_in_same_slot'] is False

        cfg_weekly = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Weekly Hydraulic Audit',
                'description': 'Check hydraulic lines weekly.',
                'item_code': 'SINGLE-WEEKLY-01',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': [today.strftime('%A').upper()],
                },
                'questions_enabled': False,
            },
        )
        assert cfg_weekly['frequency'] == 'WEEKLY'
        assert cfg_weekly['frequency_schedule']['start_date'] is None
        assert cfg_weekly['frequency_schedule']['end_date'] is None

        cfg_15 = self._save_cfg(
            admin_client,
            {
                'activity_name': '15-Day Filter Check',
                'description': 'Every 15 days check.',
                'item_code': 'SINGLE-15D-01',
                'frequency': 'EVERY_15_DAYS',
                'frequency_schedule': {
                    'schedule_type': 'TWICE_MONTHLY_DATES',
                    'first_date': 1,
                    'second_date': 16,
                },
                'questions_enabled': False,
            },
        )
        assert cfg_15['frequency'] == 'EVERY_15_DAYS'
        assert cfg_15['frequency_schedule']['selected_dates'] == [1, 16]

        cfg_monthly = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Monthly Track Alignment',
                'description': 'Monthly track inspection.',
                'item_code': 'SINGLE-MON-01',
                'frequency': 'MONTHLY',
                'frequency_schedule': {
                    'schedule_type': 'MONTHLY_DATES',
                    'selected_dates': [5, 20, 'LAST'],
                },
                'questions_enabled': False,
            },
        )
        assert cfg_monthly['frequency'] == 'MONTHLY'
        assert cfg_monthly['frequency_schedule']['selected_dates'] == [5, 20, 'LAST']

        cfg_qtr = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Quarterly Swing Bearing Check',
                'description': 'Quarterly check.',
                'item_code': 'SINGLE-QTR-01',
                'frequency': 'QUARTERLY',
                'frequency_schedule': {
                    'schedule_type': 'QUARTERLY_DATES',
                    'quarter_start_month': 1,
                    'repeat_interval': 3,
                    'quarter_dates': [15],
                },
                'questions_enabled': False,
            },
        )
        assert cfg_qtr['frequency'] == 'QUARTERLY'

        cfg_yr = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Yearly Frame Integrity Check',
                'description': 'Yearly check.',
                'item_code': 'SINGLE-YR-01',
                'frequency': 'YEARLY',
                'frequency_schedule': {
                    'schedule_type': 'YEARLY_DATES',
                    'yearly_schedules': [{'month': 1, 'day': 15}],
                },
                'questions_enabled': False,
            },
        )
        assert cfg_yr['frequency'] == 'YEARLY'
        assert MaintenanceFrequencyMaster.objects.filter(code='EVERY_15_DAYS', is_active=True).exists()
        assert ChecklistFrequencySchedule.objects.filter(checklist_item_id=cfg_weekly['id'], is_active=True).count() == 1

        # 3) Perform Maintenance reflects WEEKLY schedule DUE on m1 and blocks duplicate slot submit
        cl_res = op_alpha.get(f'/api/v1/pm/checklist/?frequency=WEEKLY&machine_id={m1.id}')
        assert cl_res.status_code == 200
        cl_data = cl_res.json()['data']
        assert cl_data['schedule_status']['status'] == 'DUE'
        assert cl_data['schedule_status']['current_occurrence_date'] == today.isoformat()
        assert cl_data['schedule_status']['already_completed_for_occurrence'] is False

        ok_sub = self._submit_freq(
            op_alpha,
            m1.id,
            'WEEKLY',
            [{'checklist_item_id': cfg_weekly['id'], 'status': 'COMPLETED', 'remarks': 'All clear'}],
        )
        assert ok_sub.status_code == 201, ok_sub.json()
        sub_id = ok_sub.json()['data']['submission_id']
        assert MaintenanceSubmission.objects.get(id=sub_id).scheduled_due_date == today

        dash_res = op_alpha.get(f'/api/v1/pm/dashboard/?machine_id={m1.id}&frequency=WEEKLY')
        assert dash_res.status_code == 200
        m1_row = dash_res.json()['data']['machines'][0]
        weekly_st = next(fs for fs in m1_row['frequency_statuses'] if fs['frequency_code'] == 'WEEKLY')
        assert weekly_st['status'] == 'COMPLETED'
        assert weekly_st['next_due_date'] == (today + timedelta(days=7)).isoformat()

        dup_sub = self._submit_freq(
            op_alpha,
            m1.id,
            'WEEKLY',
            [{'checklist_item_id': cfg_weekly['id'], 'status': 'COMPLETED'}],
        )
        assert dup_sub.status_code == 409

        # 4) Updating Every 15 Days schedule to future start_date recalculates next_due_date cleanly while preserving history
        future_start = (today + timedelta(days=14)).isoformat()
        upd_res = self._update_cfg(
            admin_client,
            cfg_15['id'],
            {
                'activity_name': cfg_15['activity_name'],
                'description': cfg_15['description'],
                'item_code': cfg_15['item_code'],
                'frequency': 'EVERY_15_DAYS',
                'frequency_schedule': {
                    'schedule_type': 'INTERVAL_15_DAYS',
                    'start_date': future_start,
                    'repeat_interval': 15,
                },
                'questions_enabled': False,
            },
        )
        assert upd_res['frequency'] == 'EVERY_15_DAYS'
        assert ChecklistFrequencySchedule.objects.filter(checklist_item_id=cfg_15['id'], is_active=True).count() == 1
        dash_after = op_alpha.get(f'/api/v1/pm/dashboard/?machine_id={m1.id}&frequency=EVERY_15_DAYS').json()['data']
        f15_after = next(fs for fs in dash_after['machines'][0]['frequency_statuses'] if fs['frequency_code'] == 'EVERY_15_DAYS')
        assert f15_after['next_due_date'] == future_start
        assert MaintenanceSubmission.objects.get(id=sub_id).submission_date == today

    def test_weekly_single_weekday_restriction_and_legacy_preservation(self, seeded_masters, users, make_auth_client):
        admin_client = make_auth_client(users['admin'])

        # 1) Save without selecting a weekday -> rejected
        no_day = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Weekly Empty Days',
                'description': 'No weekday provided',
                'item_code': 'WK-SINGLE-ERR0',
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': []},
                'questions_enabled': False,
            },
            format='json',
        )
        assert no_day.status_code == 400
        assert 'Select exactly one weekday' in json.dumps(no_day.json())

        # 2) Submit multiple weekdays through API -> rejected
        multi_days = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Weekly Multi Days',
                'description': 'Multiple weekdays should fail',
                'item_code': 'WK-SINGLE-ERRM',
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['MONDAY', 'WEDNESDAY']},
                'questions_enabled': False,
            },
            format='json',
        )
        assert multi_days.status_code == 400
        assert 'Only one weekday can be selected' in json.dumps(multi_days.json())

        # 3) Select Monday -> accepted; switch Monday -> Tuesday -> Sunday -> single day preserved
        cfg_mon = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Weekly Single Day Check',
                'description': 'Strict single weekday schedule',
                'item_code': 'WK-SINGLE-01',
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['MONDAY']},
                'questions_enabled': False,
            },
        )
        assert cfg_mon['frequency_schedule']['selected_weekdays'] == ['MONDAY']

        cfg_tue = self._update_cfg(
            admin_client,
            cfg_mon['id'],
            {
                'activity_name': cfg_mon['activity_name'],
                'description': cfg_mon['description'],
                'item_code': cfg_mon['item_code'],
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['TUESDAY']},
                'questions_enabled': False,
            },
        )
        assert cfg_tue['frequency_schedule']['selected_weekdays'] == ['TUESDAY']

        cfg_sun = self._update_cfg(
            admin_client,
            cfg_mon['id'],
            {
                'activity_name': cfg_mon['activity_name'],
                'description': cfg_mon['description'],
                'item_code': cfg_mon['item_code'],
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['SUNDAY']},
                'questions_enabled': False,
            },
        )
        assert cfg_sun['frequency_schedule']['selected_weekdays'] == ['SUNDAY']

        # 4) Legacy multi-weekday DB row remains readable, while PUT with multiple weekdays is rejected until corrected
        sched_row = ChecklistFrequencySchedule.objects.get(checklist_item_id=cfg_mon['id'], is_active=True)
        sched_row.selected_weekdays = ['MONDAY', 'THURSDAY']
        sched_row.save(update_fields=['selected_weekdays'])
        legacy_dates = get_schedule_dates_in_range(sched_row, date(2026, 12, 1), date(2026, 12, 10))
        assert len(legacy_dates) == len(set(legacy_dates))

        bad_put = admin_client.put(
            f"/api/v1/pm/admin/activity-configurations/{cfg_mon['id']}/",
            {
                'activity_name': cfg_mon['activity_name'],
                'description': cfg_mon['description'],
                'item_code': cfg_mon['item_code'],
                'frequency': 'WEEKLY',
                'frequency_schedule': {'schedule_type': 'WEEKLY_DAYS', 'selected_weekdays': ['MONDAY', 'THURSDAY']},
                'questions_enabled': False,
            },
            format='json',
        )
        assert bad_put.status_code == 400
        assert 'Only one weekday can be selected' in json.dumps(bad_put.json())
