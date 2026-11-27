import json
import pytest
from rest_framework.test import APIClient

from apps.hero_integration.models import (
    HeroAPIKey,
    HeroMachine,
    HeroUser,
    HeroUserRole,
    HeroVendorAssignment,
)
from apps.maintenance.models import ChecklistFrequencyMapping, MaintenanceSubmission


@pytest.mark.django_db(databases=['default', 'hero'])
class TestDynamicAssignedOperatorIntegration:
    def _setup_weekly_activity(self, admin_client):
        res = admin_client.post(
            '/api/v1/pm/admin/activity-configurations/',
            {
                'activity_name': 'Dynamic Operator Check',
                'description': 'Simple activity for operator assignment tests',
                'item_code': 'DYN-OP-01',
                'frequency': 'DAILY',
                'frequency_schedule': {'schedule_type': 'DAILY_EVERY_DAY', 'allow_duplicate_in_same_slot': True},
                'questions_enabled': False,
                'is_photo_required': False,
                'is_video_required': False,
            },
            format='json',
        )
        assert res.status_code == 201, res.json()
        cfg = res.json()['data']
        ChecklistFrequencyMapping.objects.filter(frequency__code='DAILY').exclude(checklist_item_id=cfg['id']).update(is_active=False)
        return cfg

    def _submit_apk_jwt(self, client, machine_id, item_id, extra=None):
        body = {
            'machine_id': str(machine_id),
            'frequency': 'DAILY',
            'hour_meter_reading': '150.0',
            'capture_source': 'CAMERA',
            'general_remarks': 'Operator assignment verification',
            'gps': json.dumps({'latitude': 28.6139, 'longitude': 77.209, 'accuracy_meters': 12.0}),
            'responses': json.dumps([{'checklist_item_id': item_id, 'status': 'COMPLETED', 'remarks': 'OK'}]),
            **(extra or {}),
        }
        return client.post('/api/v1/machine-maintenance/data', body, format='multipart')

    def test_machine_with_and_without_assigned_operator_no_hardcoding(
        self, seeded_masters, users, vendors, make_auth_client
    ):
        v1, v2 = vendors
        admin_client = make_auth_client(users['admin'])
        op_alpha = users['operator']  # Assigned to v1

        # 1) Machine with explicit operator ID in HERO machine.operator (ignoring filled_by dummy value!)
        m_explicit = HeroMachine.objects.create(
            vendor=v1,
            serial_number='SN-OP-001',
            machine_chassis_no='CH-OP-001',
            code='MC-OP01',
            name='Explicit Operator Machine',
            operator={'user_id': op_alpha.id, 'name': 'Stale Override Should Use Live User'},
            filled_by='Ravi Kumar',  # legacy fuel filler column MUST be ignored
            engine_hours=310,
            is_commissioned=True,
        )
        val_1 = admin_client.get(f'/api/v1/pm/machines/{m_explicit.id}/validate/').json()['data']
        assert val_1['assigned_operator'] == op_alpha.get_display_name()
        assert val_1['assigned_operator_id'] == op_alpha.id

        # 2) Machine without assigned operator and no vendor operators (even with filled_by set!) -> 'Not Assigned'
        m_unassigned = HeroMachine.objects.create(
            vendor=None,
            serial_number='SN-OP-002',
            machine_chassis_no='CH-OP-002',
            code='MC-OP02',
            name='Unassigned Machine',
            operator=None,
            filled_by='Ravi Kumar',  # MUST be ignored!
            engine_hours=120,
            is_commissioned=True,
        )
        val_2 = admin_client.get(f'/api/v1/pm/machines/{m_unassigned.id}/validate/').json()['data']
        assert val_2['assigned_operator'] == 'Not Assigned'
        assert val_2['assigned_operator_id'] is None

        # Vendor-only machine where vendor has ONLY a VENDOR role user (no OPERATOR role user) -> 'Not Assigned'
        v_no_op = HeroUser.objects.create(
            username='vendor_mgr_only',
            first_name='VendorOnly',
            last_name='User',
            role='VENDOR',
            vendor=v1,
            is_active=True,
        )
        HeroVendorAssignment.objects.create(user=v_no_op, vendor=v1, is_active=True)
        m_vendor_without_op = HeroMachine.objects.create(
            vendor=v2,
            serial_number='SN-OP-003',
            machine_chassis_no='CH-OP-003',
            code='MC-OP03',
            name='Vendor Beta Machine',
            operator=None,
            filled_by='Ravi Kumar',
            engine_hours=80,
        )
        # Deactivate v2's operator temporarily to verify 'Not Assigned' when no active operator exists
        HeroVendorAssignment.objects.filter(user=users['operator_beta'], vendor=v2).update(is_active=False)
        val_3 = admin_client.get(f'/api/v1/pm/machines/{m_vendor_without_op.id}/validate/').json()['data']
        assert val_3['assigned_operator'] == 'Not Assigned'

    def test_operator_multiple_machines_and_never_trusts_client_identity(
        self, seeded_masters, users, vendors, roles, make_auth_client
    ):
        v1, v2 = vendors
        admin_client = make_auth_client(users['admin'])
        cfg = self._setup_weekly_activity(admin_client)
        op_alpha = users['operator']
        op_beta = users['operator_beta']

        # Assign op_alpha to multiple machines (m_a via v1, m_b via v2 VendorAssignment) while m_c belongs strictly to op_beta
        m_a = HeroMachine.objects.create(
            vendor=v1, serial_number='SN-MA', machine_chassis_no='CH-MA', code='MA-01', name='Alpha Machine A', operator=None, engine_hours=100
        )
        m_b = HeroMachine.objects.create(
            vendor=v2, serial_number='SN-MB', machine_chassis_no='CH-MB', code='MB-01', name='Shared Vendor Machine B', operator={'user_id': op_alpha.id}, engine_hours=200
        )
        m_c = HeroMachine.objects.create(
            vendor=v2, serial_number='SN-MC', machine_chassis_no='CH-MC', code='MC-01', name='Beta Only Machine C', operator={'user_id': op_beta.id}, engine_hours=300
        )

        op_jwt = make_auth_client(op_alpha)

        # Operator sees ONLY m_a and m_b (NOT m_c!) in PM list and Mobile APK list
        pm_machines = op_jwt.get('/api/v1/pm/machines/').json()['data']
        pm_ids = {m['id'] for m in pm_machines}
        assert m_a.id in pm_ids
        assert m_b.id in pm_ids
        assert m_c.id not in pm_ids

        apk_list = op_jwt.get('/api/v1/machine-maintenance/list').json()['data']
        apk_ids = {m['id'] for m in apk_list['machines']}
        assert apk_ids == {m for m in pm_ids}
        assert apk_list['authenticated_operator']['id'] == op_alpha.id
        # Operator receives only eligible frequencies (Daily, not FE 100_HOURS)
        assert all(fc in ('DAILY', '50_HOURS') for fc in [b['frequency_code'] for b in apk_list['frequency_wise_checklists']])

        # Spoofing another operator's user_id/operator_id in /check or /list or /data is REJECTED (403)
        assert op_jwt.get(f'/api/v1/machine-maintenance/list?operator_id={op_beta.id}').status_code == 403
        assert op_jwt.get(f'/api/v1/machine-maintenance/check?machine_id={m_a.id}&user_id={op_beta.id}&frequency=DAILY').status_code == 403

        spoof_submit = self._submit_apk_jwt(
            op_jwt,
            m_a.id,
            cfg['id'],
            extra={'user_id': str(op_beta.id), 'submitted_by_name': 'Fake Operator'},
        )
        assert spoof_submit.status_code == 403

        # Valid submission ignoring spoofed submitted_by_name / assigned_operator fields in payload
        ok_sub = self._submit_apk_jwt(
            op_jwt,
            m_a.id,
            cfg['id'],
            extra={'submitted_by_name': 'Spoofed Name', 'assigned_operator': 'Spoofed Op'},
        )
        assert ok_sub.status_code == 201, ok_sub.json()
        sub_obj = MaintenanceSubmission.objects.get(id=ok_sub.json()['data']['submission_id'])
        assert sub_obj.submitted_by_id == op_alpha.id
        assert sub_obj.submitted_by_name == op_alpha.get_display_name()
        assert sub_obj.assigned_operator == op_alpha.get_display_name()
        assert sub_obj.vendor_id == v1.id

        # Unauthorized operator op_alpha cannot submit to m_c (assigned to op_beta)
        unauth_sub = self._submit_apk_jwt(op_jwt, m_c.id, cfg['id'])
        assert unauth_sub.status_code == 403

        # Operator-scoped API key is also locked to its owner and cannot act for another operator
        op_key = HeroAPIKey.objects.create(user=op_alpha, name='Op Mobile Key', key='hero_op_key_001', prefix='hero_op_', is_active=True)
        op_key_client = APIClient()
        op_key_client.credentials(HTTP_X_API_KEY=op_key.key)
        assert op_key_client.get(f'/api/v1/machine-maintenance/check?machine_id={m_a.id}&user_id={op_beta.id}&frequency=DAILY').status_code == 403

    def test_assignment_change_blocks_revoked_operator_and_preserves_history(
        self, seeded_masters, users, vendors, roles, make_auth_client
    ):
        v1, _ = vendors
        admin_client = make_auth_client(users['admin'])
        cfg = self._setup_weekly_activity(admin_client)
        op_alpha = users['operator']

        # Second operator assigned to same vendor later
        op_new = HeroUser.objects.create(
            username='op_gamma',
            first_name='Deepak',
            last_name='Sharma',
            role='OPERATOR',
            vendor=v1,
            is_active=True,
        )
        HeroUserRole.objects.create(user=op_new, role=roles['OPERATOR'])
        HeroVendorAssignment.objects.create(user=op_new, vendor=v1, is_active=True)

        m_track = HeroMachine.objects.create(
            vendor=v1,
            serial_number='SN-REASSIGN',
            machine_chassis_no='CH-REASSIGN',
            code='MC-REAS',
            name='Reassignment HDD Rig',
            operator={'user_id': op_alpha.id},
            filled_by='Ravi Kumar',
            engine_hours=400,
        )

        # 1) Initial operator op_alpha submits maintenance -> 201, snapshot records op_alpha
        op_alpha_jwt = make_auth_client(op_alpha)
        s1 = self._submit_apk_jwt(op_alpha_jwt, m_track.id, cfg['id'])
        assert s1.status_code == 201, s1.json()
        s1_id = s1.json()['data']['submission_id']

        # 2) Machine operator assignment changes to op_new AND op_alpha's vendor assignment is deactivated
        m_track.operator = {'user_id': op_new.id}
        m_track.save(update_fields=['operator'])

        # Card now dynamically shows Deepak Sharma (latest assigned operator)
        val_after = admin_client.get(f'/api/v1/pm/machines/{m_track.id}/validate/').json()['data']
        assert val_after['assigned_operator'] == 'Deepak Sharma'
        assert val_after['assigned_operator_id'] == op_new.id

        # 3) Previous operator (op_alpha) CANNOT submit new maintenance after reassignment
        revoked_attempt = self._submit_apk_jwt(op_alpha_jwt, m_track.id, cfg['id'])
        assert revoked_attempt.status_code == 403

        # Mobile check reflects ineligibility cleanly for op_alpha and eligibility for op_new
        chk_revoked = admin_client.get(
            f'/api/v1/machine-maintenance/check?machine_id={m_track.id}&user_id={op_alpha.id}&frequency=DAILY'
        ).json()['data']
        assert chk_revoked['eligible'] is False
        assert chk_revoked['checks']['operator_authorized'] is False

        # 4) Historical submission s1 MUST preserve original operator identity & assigned_operator snapshot!
        hist_detail = admin_client.get(f'/api/v1/pm/submissions/{s1_id}/').json()['data']
        assert hist_detail['submitted_by_id'] == op_alpha.id
        assert hist_detail['submitted_by_name'] == op_alpha.get_display_name()
        assert hist_detail['assigned_operator'] == op_alpha.get_display_name()

        # 5) Also test unassigned operator (no vendor & no machine) attempting submission -> rejected 403
        op_unassigned = HeroUser.objects.create(
            username='op_nobody', first_name='Unassigned', last_name='User', role='OPERATOR', vendor=None, is_active=True
        )
        HeroUserRole.objects.create(user=op_unassigned, role=roles['OPERATOR'])
        op_nobody_jwt = make_auth_client(op_unassigned)
        assert op_nobody_jwt.get('/api/v1/pm/machines/').json()['data'] == []
        assert self._submit_apk_jwt(op_nobody_jwt, m_track.id, cfg['id']).status_code == 403
