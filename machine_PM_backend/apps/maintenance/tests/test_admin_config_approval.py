import pytest

from apps.maintenance.models import MaintenanceAuditLog, MaintenanceCategoryMaster, MaintenanceFrequencyMaster


@pytest.mark.django_db(databases=['default', 'hero'])
class TestAdminConfigAndSafety:
    def test_admin_can_configure_checklist_and_role_mappings(self, seeded_masters, users, make_auth_client):
        admin_client = make_auth_client(users['admin'])
        op_client = make_auth_client(users['operator'])

        cat_machine = MaintenanceCategoryMaster.objects.get(code='MACHINE')
        freq_daily = MaintenanceFrequencyMaster.objects.get(code='DAILY')

        # Admin adds a custom configurable checklist item
        create_item = admin_client.post(
            '/api/v1/pm/admin/checklist-items/',
            {
                'item_code': 'CUSTOM-MCH-001',
                'category': cat_machine.id,
                'description': 'Emergency Stop Switch – Test',
                'remarks': 'Verify emergency cutoff response',
                'service_interval': 'Daily',
                'requires_photo': True,
                'requires_remarks_if_not_completed': True,
                'sort_order': 99,
                'is_active': True,
            },
            format='json',
        )
        assert create_item.status_code == 201, create_item.json()
        item_id = create_item.json()['id'] if 'id' in create_item.json() else create_item.json()['data']['id']

        # Map it to DAILY frequency
        map_res = admin_client.post(
            '/api/v1/pm/admin/frequency-mappings/',
            {
                'checklist_item': item_id,
                'frequency': freq_daily.id,
                'is_mandatory': True,
                'sort_order': 99,
                'is_active': True,
            },
            format='json',
        )
        assert map_res.status_code == 201

        # Operator immediately sees the newly configured item in DAILY checklist
        chk = op_client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        assert any(i['item_code'] == 'CUSTOM-MCH-001' for i in chk)

        # Safety guidelines endpoint works for all authenticated users
        sg = op_client.get('/api/v1/pm/safety-guidelines/')
        assert sg.status_code == 200
        assert len(sg.json()['data']) == 5

        # Audit logs track admin config change
        assert MaintenanceAuditLog.objects.filter(entity_type='CHECKLIST_MASTER', action='CONFIG_CREATED').exists()

