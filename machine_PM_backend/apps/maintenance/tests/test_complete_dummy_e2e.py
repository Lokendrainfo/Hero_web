import json
from datetime import timedelta
import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.hero_integration.models import (
    HeroMachine,
    HeroRole,
    HeroUser,
    HeroUserRole,
    HeroVendor,
    HeroVendorAssignment,
)
from apps.maintenance.models import (
    ChecklistLocationRequirement,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceVideoAttachment,
)
from apps.maintenance.services.unified_config_service import ensure_calendar_frequencies_and_roles
from .conftest import make_test_image
from .test_dynamic_config_and_video import make_test_video


@pytest.fixture
def dummy_masters(db, seeded_masters):
    """
    Isolated dummy master records prefixed with TEST-DUMMY inside test DBs only.
    Never touches real HERO production data.
    """
    ensure_calendar_frequencies_and_roles()

    v1 = HeroVendor.objects.create(
        name='TEST-DUMMY-VENDOR-001',
        code='TEST-DUMMY-VENDOR-001',
        external_vendor_id='test-dummy-vnd-1',
        is_active=True,
    )
    v2 = HeroVendor.objects.create(
        name='TEST-DUMMY-VENDOR-002',
        code='TEST-DUMMY-VENDOR-002',
        external_vendor_id='test-dummy-vnd-2',
        is_active=True,
    )

    r_op, _ = HeroRole.objects.get_or_create(code='OPERATOR', defaults={'name': 'Operator', 'is_system': True, 'is_active': True})
    r_adm, _ = HeroRole.objects.get_or_create(code='ADMIN', defaults={'name': 'Admin', 'is_system': True, 'is_active': True})

    op1 = HeroUser.objects.create(
        username='TEST-DUMMY-OP-001',
        first_name='TEST-DUMMY',
        last_name='OP-001',
        role='OPERATOR',
        vendor=v1,
        is_active=True,
    )
    HeroUserRole.objects.create(user=op1, role=r_op)
    HeroVendorAssignment.objects.create(user=op1, vendor=v1, is_active=True)

    op2 = HeroUser.objects.create(
        username='TEST-DUMMY-OP-002',
        first_name='TEST-DUMMY',
        last_name='OP-002',
        role='OPERATOR',
        vendor=v2,
        is_active=True,
    )
    HeroUserRole.objects.create(user=op2, role=r_op)
    HeroVendorAssignment.objects.create(user=op2, vendor=v2, is_active=True)

    admin = HeroUser.objects.create(
        username='TEST-DUMMY-ADMIN-001',
        first_name='TEST-DUMMY',
        last_name='ADMIN-001',
        role='ADMIN',
        is_active=True,
    )
    HeroUserRole.objects.create(user=admin, role=r_adm)

    m1 = HeroMachine.objects.create(
        vendor=v1,
        serial_number='TEST-DUMMY-SN-001',
        machine_chassis_no='TEST-DUMMY-CH-001',
        code='TEST-DUMMY-MCH-001',
        name='TEST-DUMMY-MCH-001 – Apollo A600 HDD',
        model_code='A600',
        model_name='Apollo A600 HDD',
        category='HDD',
        site_name='TEST-DUMMY-SITE-001',
        location_name='TEST-DUMMY-LOC-001',
        operator={'name': 'TEST-DUMMY-OP-001'},
        engine_hours=120,
        is_commissioned=True,
        status='RUNNING',
    )
    m2 = HeroMachine.objects.create(
        vendor=v1,
        serial_number='TEST-DUMMY-SN-002',
        machine_chassis_no='TEST-DUMMY-CH-002',
        code='TEST-DUMMY-MCH-002',
        name='TEST-DUMMY-MCH-002 – Apollo A600 HDD',
        model_code='A600',
        model_name='Apollo A600 HDD',
        category='HDD',
        site_name='TEST-DUMMY-SITE-001',
        location_name='TEST-DUMMY-LOC-001',
        operator={'name': 'TEST-DUMMY-OP-001'},
        engine_hours=240,
        is_commissioned=True,
        status='RUNNING',
    )
    m3 = HeroMachine.objects.create(
        vendor=v2,
        serial_number='TEST-DUMMY-SN-003',
        machine_chassis_no='TEST-DUMMY-CH-003',
        code='TEST-DUMMY-MCH-003',
        name='TEST-DUMMY-MCH-003 – Test Machine',
        model_code='A600',
        model_name='Test Machine',
        category='HDD',
        site_name='TEST-DUMMY-SITE-002',
        location_name='TEST-DUMMY-LOC-002',
        operator={'name': 'TEST-DUMMY-OP-002'},
        engine_hours=360,
        is_commissioned=True,
        status='IDLE',
    )

    def _client_for(u):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {str(AccessToken.for_user(u))}')
        return c

    return {
        'vendors': (v1, v2),
        'users': {'op1': op1, 'op2': op2, 'admin': admin},
        'machines': (m1, m2, m3),
        'clients': {
            'op1': _client_for(op1),
            'op2': _client_for(op2),
            'admin': _client_for(admin),
        },
    }


@pytest.mark.django_db(databases=['default', 'hero'])
class TestCompleteDummyMaintenanceSuite:
    def _save_cfg(self, admin_client, payload):
        res = admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')
        assert res.status_code == 201, res.json()
        return res.json()['data']

    def _submit(self, client, machine_id, frequency, responses_meta, files=None, capture_source='CAMERA'):
        data = {
            'machine_id': machine_id,
            'frequency': frequency,
            'hour_meter_reading': '350.0',
            'general_remarks': 'TEST-DUMMY submission',
            'capture_source': capture_source,
            'responses': json.dumps(responses_meta),
            **(files or {}),
        }
        return client.post('/api/v1/machine-maintenance/data', data, format='multipart')

    def test_complete_dummy_e2e_configs_questions_photos_videos_gps_history_and_dashboard(self, dummy_masters):
        admin_client = dummy_masters['clients']['admin']
        op1_client = dummy_masters['clients']['op1']
        op2_client = dummy_masters['clients']['op2']
        m1, m2, m3 = dummy_masters['machines']
        today = timezone.localdate()

        # Clean legacy fixture mappings first so only TEST-PM-* activities exist for this E2E flow
        from django.core.management import call_command
        call_command('cleanup_legacy_pm_config', execute=True)

        # Verify multi-frequency selection is rejected
        bad_multi = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'TEST-DUMMY Multi Frequency Check',
                'description': 'Should reject > 1 frequency',
                'frequencies': ['DAILY', 'WEEKLY'],
                'questions_enabled': False,
            },
            format='json',
        )
        assert bad_multi.status_code == 400

        # ------------------------------------------------------------------
        # 1. Create TEST-PM-001 (DAILY) with GPS Required = Yes
        # ------------------------------------------------------------------
        pm_001 = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-PM-001',
                'activity_name': 'Fuel Tank Check',
                'description': 'TEST-DUMMY Daily fuel level inspection with GPS verification',
                'frequency': 'DAILY',
                'frequency_schedule': {'schedule_type': 'DAILY_EVERY_DAY'},
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_fuel',
                        'question_name': 'Is Fuel Tank Filled?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'is_location_required': True,
                        'locations': [
                            {
                                'location_name': 'TEST-DUMMY Fuel Refill GPS',
                                'location_description': 'Capture live yard coordinates',
                                'capture_latitude': True,
                                'capture_longitude': True,
                                'accuracy_threshold_meters': 50.0,
                                'capture_timestamp': True,
                                'capture_rule': 'HIGH_ACCURACY',
                                'is_mandatory': True,
                                'condition_mode': 'ALWAYS',
                            }
                        ],
                    }
                ],
            },
        )
        assert pm_001['frequency'] == 'DAILY'
        assert pm_001['frequency_schedule']['schedule_summary'] == 'Maintenance is required every calendar day.'
        assert pm_001['frequency_schedule']['start_date'] is None
        assert pm_001['frequency_schedule']['end_date'] is None
        q_fuel = pm_001['questions'][0]
        loc_fuel = q_fuel['locations'][0]

        # ------------------------------------------------------------------
        # 2. Create TEST-PM-002 (WEEKLY) with all 5 Questions + 3 Conditional Photos + 2 Conditional Videos
        # ------------------------------------------------------------------
        today_weekday = timezone.localdate().strftime('%A').upper()
        pm_002 = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-PM-002',
                'activity_name': 'Hydraulic Oil Check',
                'description': 'TEST-DUMMY Weekly hydraulic oil level, leakage, operation, condition, and hour-meter check',
                'frequency': 'WEEKLY',
                'frequency_schedule': {
                    'schedule_type': 'WEEKLY_DAYS',
                    'selected_weekdays': [today_weekday],
                },
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_oil_ok',
                        'question_name': 'Is Hydraulic Oil Level OK?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'is_photo_required': True,
                        'photos': [
                            {
                                'photo_name': 'Hydraulic Level Photo',
                                'photo_description': 'Sight glass showing OK level',
                                'is_mandatory': True,
                                'display_order': 1,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil_ok', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                            },
                            {
                                'photo_name': 'Hydraulic Leakage Photo',
                                'photo_description': 'Photo showing low level / leak point',
                                'is_mandatory': True,
                                'display_order': 2,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_oil_ok', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            },
                        ],
                    },
                    {
                        'temp_key': 'q_leakage',
                        'question_name': 'Is there any hydraulic leakage?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 2,
                        'is_video_required': True,
                        'videos': [
                            {
                                'video_name': 'Hydraulic Leakage Video',
                                'video_description': 'Record active oil dripping',
                                'max_duration_seconds': 45,
                                'min_videos': 1,
                                'max_videos': 1,
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_leakage', 'operator': 'EQUALS', 'expected_value': 'Yes'}
                                ],
                            }
                        ],
                    },
                    {
                        'temp_key': 'q_operating',
                        'question_name': 'Is the machine operating normally?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 3,
                        'is_photo_required': True,
                        'photos': [
                            {
                                'photo_name': 'Machine Fault Photo',
                                'photo_description': 'Fault area snapshot',
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_operating', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            }
                        ],
                        'is_video_required': True,
                        'videos': [
                            {
                                'video_name': 'Machine Fault Video',
                                'video_description': 'Record abnormal machine sound/fault',
                                'max_duration_seconds': 30,
                                'min_videos': 1,
                                'max_videos': 1,
                                'is_mandatory': True,
                                'condition_mode': 'CONDITIONAL',
                                'condition_logic': 'AND',
                                'condition_rules': [
                                    {'source_question_key': 'q_operating', 'operator': 'EQUALS', 'expected_value': 'No'}
                                ],
                            }
                        ],
                    },
                    {
                        'temp_key': 'q_condition',
                        'question_name': 'What is the machine condition?',
                        'answer_type': 'DROPDOWN',
                        'options': ['Good', 'Normal', 'Needs Attention', 'Critical'],
                        'is_mandatory': False,
                        'display_order': 4,
                    },
                    {
                        'temp_key': 'q_hour_meter',
                        'question_name': 'Current Hour Meter Reading',
                        'answer_type': 'NUMBER',
                        'is_mandatory': True,
                        'display_order': 5,
                    },
                ],
            },
        )
        qs = {q['question_name']: q for q in pm_002['questions']}
        p_level = next(p for p in qs['Is Hydraulic Oil Level OK?']['photos'] if p['photo_name'] == 'Hydraulic Level Photo')
        p_leak = next(p for p in qs['Is Hydraulic Oil Level OK?']['photos'] if p['photo_name'] == 'Hydraulic Leakage Photo')
        p_fault = qs['Is the machine operating normally?']['photos'][0]
        v_leak = qs['Is there any hydraulic leakage?']['videos'][0]
        v_fault = qs['Is the machine operating normally?']['videos'][0]

        # ------------------------------------------------------------------
        # 3. Create TEST-PM-003 .. TEST-PM-006 (15 Days, Monthly, Quarterly, Yearly w/ GPS=No)
        # ------------------------------------------------------------------
        pm_003 = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-PM-003',
                'activity_name': 'Battery Inspection',
                'description': 'TEST-DUMMY Every 15 Days battery terminal check',
                'frequency': 'EVERY_15_DAYS',
                'frequency_schedule': {
                    'schedule_type': 'INTERVAL_15_DAYS',
                    'start_date': today.isoformat(),
                    'repeat_interval': 15,
                },
                'questions_enabled': False,
            },
        )
        pm_004 = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-PM-004',
                'activity_name': 'Engine Inspection',
                'description': 'TEST-DUMMY Monthly engine inspection',
                'frequency': 'MONTHLY',
                'frequency_schedule': {'schedule_type': 'MONTHLY_DATES', 'selected_dates': [1, 15]},
                'questions_enabled': False,
            },
        )
        pm_005 = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-PM-005',
                'activity_name': 'Machine Safety Inspection',
                'description': 'TEST-DUMMY Quarterly safety check',
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
        pm_006 = self._save_cfg(
            admin_client,
            {
                'item_code': 'TEST-PM-006',
                'activity_name': 'Annual Machine Inspection',
                'description': 'TEST-DUMMY Yearly overhaul with GPS required = No',
                'frequency': 'YEARLY',
                'frequency_schedule': {
                    'schedule_type': 'YEARLY_DATES',
                    'yearly_schedules': [{'month': 1, 'day': 15}],
                },
                'questions_enabled': True,
                'questions': [
                    {
                        'temp_key': 'q_yr_ok',
                        'question_name': 'Annual Chassis Inspection Passed?',
                        'answer_type': 'YES_NO',
                        'is_mandatory': True,
                        'display_order': 1,
                        'is_location_required': False,
                    }
                ],
            },
        )
        assert pm_003['frequency'] == 'EVERY_15_DAYS'
        assert pm_004['frequency'] == 'MONTHLY'
        assert pm_005['frequency'] == 'QUARTERLY'
        assert pm_006['frequency'] == 'YEARLY'
        assert ChecklistLocationRequirement.objects.filter(checklist_item_id=pm_006['id'], is_active=True).count() == 0

        # Verify YEARLY checklist reports zero location_requirements when GPS required = No
        yr_cl = op1_client.get(f'/api/v1/pm/checklist/?frequency=YEARLY&machine_id={m1.id}').json()['data']['items'][0]
        assert yr_cl['location_requirements'] == []

        # ------------------------------------------------------------------
        # 4. GPS Tests on TEST-PM-001 (DAILY) for TEST-DUMMY-MCH-001
        # ------------------------------------------------------------------
        # Missing mandatory GPS -> 400
        bad_gps_missing = self._submit(
            op1_client,
            m1.id,
            'DAILY',
            [{'checklist_item_id': pm_001['id'], 'status': 'COMPLETED', 'custom_fields': {str(q_fuel['id']): 'Yes'}}],
        )
        assert bad_gps_missing.status_code == 400

        # Invalid latitude (out of -90..90) -> 400
        bad_gps_lat = self._submit(
            op1_client,
            m1.id,
            'DAILY',
            [
                {
                    'checklist_item_id': pm_001['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_fuel['id']): 'Yes'},
                    'locations': {str(loc_fuel['id']): {'latitude': 120.5, 'longitude': 77.2, 'accuracy_meters': 10}},
                }
            ],
        )
        assert bad_gps_lat.status_code == 400

        # Accuracy threshold exceeded -> 400
        bad_gps_acc = self._submit(
            op1_client,
            m1.id,
            'DAILY',
            [
                {
                    'checklist_item_id': pm_001['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_fuel['id']): 'Yes'},
                    'locations': {str(loc_fuel['id']): {'latitude': 28.6139, 'longitude': 77.2090, 'accuracy_meters': 125.0}},
                }
            ],
        )
        assert bad_gps_acc.status_code == 400

        # Valid GPS capture -> 201
        ok_daily = self._submit(
            op1_client,
            m1.id,
            'DAILY',
            [
                {
                    'checklist_item_id': pm_001['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_fuel['id']): 'Yes'},
                    'locations': {
                        str(loc_fuel['id']): {
                            'latitude': 28.613939,
                            'longitude': 77.209021,
                            'accuracy_meters': 11.4,
                            'captured_at': timezone.now().isoformat(),
                        }
                    },
                }
            ],
        )
        assert ok_daily.status_code == 201, ok_daily.json()
        daily_sub_id = ok_daily.json()['data']['submission_id']
        assert MaintenanceLocationAttachment.objects.filter(submission_id=daily_sub_id).count() == 1

        # Verify duplicate DAILY submission blocked with 409
        dup_daily = self._submit(
            op1_client,
            m1.id,
            'DAILY',
            [
                {
                    'checklist_item_id': pm_001['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {str(q_fuel['id']): 'Yes'},
                    'locations': {str(loc_fuel['id']): {'latitude': 28.6139, 'longitude': 77.2090, 'accuracy_meters': 10}},
                }
            ],
        )
        assert dup_daily.status_code == 409

        # ------------------------------------------------------------------
        # 5. Conditional Photos & Videos Validation on TEST-PM-002 (WEEKLY)
        # ------------------------------------------------------------------
        # Scenario A on m1: Oil=Yes, Leakage=No, Operating=Yes -> ONLY Hydraulic Level Photo required (no videos required)
        # Also test non-camera upload rejection
        bad_gallery = self._submit(
            op1_client,
            m1.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': pm_002['id'],
                    'status': 'COMPLETED',
                    'capture_source': 'GALLERY',
                    'custom_fields': {
                        str(qs['Is Hydraulic Oil Level OK?']['id']): 'Yes',
                        str(qs['Is there any hydraulic leakage?']['id']): 'No',
                        str(qs['Is the machine operating normally?']['id']): 'Yes',
                        str(qs['Current Hour Meter Reading']['id']): 120,
                    },
                }
            ],
            files={f"photo_{pm_002['id']}_req_{p_level['id']}": make_test_image(color=(10, 180, 10), filename='ok.jpg', fmt='JPEG')},
            capture_source='GALLERY',
        )
        assert bad_gallery.status_code == 400

        # Valid camera submission on m1 with optional Dropdown omitted
        ok_m1_weekly = self._submit(
            op1_client,
            m1.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': pm_002['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {
                        str(qs['Is Hydraulic Oil Level OK?']['id']): 'Yes',
                        str(qs['Is there any hydraulic leakage?']['id']): 'No',
                        str(qs['Is the machine operating normally?']['id']): 'Yes',
                        str(qs['Current Hour Meter Reading']['id']): 120,
                    },
                }
            ],
            files={f"photo_{pm_002['id']}_req_{p_level['id']}": make_test_image(color=(10, 180, 10), filename='hyd_ok.jpg', fmt='JPEG')},
        )
        assert ok_m1_weekly.status_code == 201, ok_m1_weekly.json()
        m1_w_sub_id = ok_m1_weekly.json()['data']['submission_id']
        assert MaintenancePhotoAttachment.objects.filter(submission_id=m1_w_sub_id).count() == 1
        assert MaintenanceVideoAttachment.objects.filter(submission_id=m1_w_sub_id).count() == 0

        # Scenario B on m2: Oil=No, Leakage=Yes, Operating=No -> Leakage Photo + Fault Photo + Leakage Video + Fault Video required
        # Reject video duration > max (50s > 30s)
        bad_vid_dur = self._submit(
            op1_client,
            m2.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': pm_002['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {
                        str(qs['Is Hydraulic Oil Level OK?']['id']): 'No',
                        str(qs['Is there any hydraulic leakage?']['id']): 'Yes',
                        str(qs['Is the machine operating normally?']['id']): 'No',
                        str(qs['What is the machine condition?']['id']): 'Needs Attention',
                        str(qs['Current Hour Meter Reading']['id']): 240,
                    },
                    'video_durations': {
                        str(v_leak['id']): [18],
                        str(v_fault['id']): [55],  # exceeds max 30s
                    },
                }
            ],
            files={
                f"photo_{pm_002['id']}_req_{p_leak['id']}": make_test_image(color=(200, 30, 30), filename='leak.jpg', fmt='JPEG'),
                f"photo_{pm_002['id']}_req_{p_fault['id']}": make_test_image(color=(200, 120, 30), filename='fault.jpg', fmt='JPEG'),
                f"video_{pm_002['id']}_req_{v_leak['id']}_0": make_test_video(tag=b'leak-vid-bad', filename='leak.mp4', ext='mp4'),
                f"video_{pm_002['id']}_req_{v_fault['id']}_0": make_test_video(tag=b'fault-vid-bad', filename='fault.mp4', ext='mp4'),
            },
        )
        assert bad_vid_dur.status_code == 400

        # Valid submission on m2 with valid photos + videos within max duration
        ok_m2_weekly = self._submit(
            op1_client,
            m2.id,
            'WEEKLY',
            [
                {
                    'checklist_item_id': pm_002['id'],
                    'status': 'COMPLETED',
                    'custom_fields': {
                        str(qs['Is Hydraulic Oil Level OK?']['id']): 'No',
                        str(qs['Is there any hydraulic leakage?']['id']): 'Yes',
                        str(qs['Is the machine operating normally?']['id']): 'No',
                        str(qs['What is the machine condition?']['id']): 'Critical',
                        str(qs['Current Hour Meter Reading']['id']): 240,
                    },
                    'video_durations': {
                        str(v_leak['id']): [20],
                        str(v_fault['id']): [15],
                    },
                }
            ],
            files={
                f"photo_{pm_002['id']}_req_{p_leak['id']}": make_test_image(color=(210, 20, 20), filename='leak_ok.jpg', fmt='JPEG'),
                f"photo_{pm_002['id']}_req_{p_fault['id']}": make_test_image(color=(210, 140, 20), filename='fault_ok.jpg', fmt='JPEG'),
                f"video_{pm_002['id']}_req_{v_leak['id']}_0": make_test_video(tag=b'leak-vid-good', filename='leak_good.mp4', ext='mp4'),
                f"video_{pm_002['id']}_req_{v_fault['id']}_0": make_test_video(tag=b'fault-vid-good', filename='fault_good.mp4', ext='mp4'),
            },
        )
        assert ok_m2_weekly.status_code == 201, ok_m2_weekly.json()
        m2_w_sub_id = ok_m2_weekly.json()['data']['submission_id']

        # ------------------------------------------------------------------
        # 6. History & Media Playback Verification (Photos, Videos, GPS)
        # ------------------------------------------------------------------
        det_daily = op1_client.get(f'/api/v1/pm/submissions/{daily_sub_id}/').json()['data']
        assert det_daily['location_count'] == 1
        assert det_daily['responses'][0]['locations'][0]['latitude'] == pytest.approx(28.613939)
        assert det_daily['responses'][0]['locations'][0]['longitude'] == pytest.approx(77.209021)

        det_m2 = op1_client.get(f'/api/v1/pm/submissions/{m2_w_sub_id}/').json()['data']
        assert det_m2['photo_count'] == 2
        assert det_m2['video_count'] == 2
        photo_id = det_m2['responses'][0]['photos'][0]['id']
        video_id = det_m2['responses'][0]['videos'][0]['id']
        assert op1_client.get(f'/api/v1/pm/photos/{photo_id}/view/').status_code == 200
        assert op1_client.get(f'/api/v1/pm/videos/{video_id}/view/').status_code == 200

        # ------------------------------------------------------------------
        # 7. Dashboard Calculations & Vendor Isolation Check
        # ------------------------------------------------------------------
        # op1 cannot submit for m3 (TEST-DUMMY-VENDOR-002)
        cross_vendor = self._submit(
            op1_client,
            m3.id,
            'EVERY_15_DAYS',
            [{'checklist_item_id': pm_003['id'], 'status': 'COMPLETED'}],
        )
        assert cross_vendor.status_code == 403

        # Dashboard for admin across TEST-DUMMY-MCH-001..003
        dash = admin_client.get('/api/v1/pm/dashboard/').json()['data']
        assert dash['kpis']['total_machines'] >= 3
        assert len(dash['frequency_completion']) == 6
        daily_bucket = next(b for b in dash['frequency_completion'] if b['frequency_code'] == 'DAILY')
        weekly_bucket = next(b for b in dash['frequency_completion'] if b['frequency_code'] == 'WEEKLY')
        assert daily_bucket['completed'] >= 1
        assert weekly_bucket['completed'] >= 2

        m1_dash = next(r for r in dash['machines'] if r['machine_number'] == 'TEST-DUMMY-CH-001')
        assert m1_dash['last_maintenance'] is not None
        assert m1_dash['next_scheduled_date'] is not None

        # op2 can submit on m3 cleanly
        ok_m3_15d = self._submit(
            op2_client,
            m3.id,
            'EVERY_15_DAYS',
            [{'checklist_item_id': pm_003['id'], 'status': 'COMPLETED'}],
        )
        assert ok_m3_15d.status_code == 201
