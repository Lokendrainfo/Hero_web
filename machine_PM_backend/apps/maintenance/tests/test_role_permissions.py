import pytest


@pytest.mark.django_db(databases=['default', 'hero'])
class TestRoleBasedAccess:
    def test_unauthenticated_rejected(self, seeded_masters):
        from rest_framework.test import APIClient
        client = APIClient()
        res = client.get('/api/v1/pm/frequencies/')
        assert res.status_code in (401, 403)

    def test_operator_frequency_permissions(self, seeded_masters, users, make_auth_client):
        client = make_auth_client(users['operator'])
        freq_res = client.get('/api/v1/pm/frequencies/')
        assert freq_res.status_code == 200
        allowed = freq_res.json()['data']['role_info']['allowed_frequencies']
        assert allowed == ['DAILY', '50_HOURS']

        # Allowed
        assert client.get('/api/v1/pm/checklist/?frequency=DAILY').status_code == 200
        assert client.get('/api/v1/pm/checklist/?frequency=50_HOURS').status_code == 200

        # Forbidden for Operator (FE & Area Manager checklists)
        for forbidden in ('100_HOURS', '250_HOURS', '500_HOURS', '1000_HOURS'):
            res = client.get(f'/api/v1/pm/checklist/?frequency={forbidden}')
            assert res.status_code == 403, f"Operator unexpectedly accessed {forbidden}"

        # Forbidden Admin Config
        assert client.get('/api/v1/pm/admin/checklist-items/').status_code == 403

    def test_field_engineer_frequency_permissions(self, seeded_masters, users, make_auth_client):
        client = make_auth_client(users['fe'])
        freq_res = client.get('/api/v1/pm/frequencies/')
        assert freq_res.status_code == 200
        allowed = freq_res.json()['data']['role_info']['allowed_frequencies']
        assert allowed == ['100_HOURS', '250_HOURS']

        # Allowed
        assert client.get('/api/v1/pm/checklist/?frequency=100_HOURS').status_code == 200
        assert client.get('/api/v1/pm/checklist/?frequency=250_HOURS').status_code == 200

        # Forbidden for FE (Operator & Area Manager checklists)
        for forbidden in ('DAILY', '50_HOURS', '500_HOURS', '1000_HOURS'):
            res = client.get(f'/api/v1/pm/checklist/?frequency={forbidden}')
            assert res.status_code == 403, f"FE unexpectedly accessed {forbidden}"

        assert client.get('/api/v1/pm/admin/checklist-items/').status_code == 403

    def test_area_manager_frequency_permissions(self, seeded_masters, users, make_auth_client):
        client = make_auth_client(users['am'])
        freq_res = client.get('/api/v1/pm/frequencies/')
        assert freq_res.status_code == 200
        allowed = freq_res.json()['data']['role_info']['allowed_frequencies']
        assert allowed == ['500_HOURS', '1000_HOURS']

        # Allowed
        assert client.get('/api/v1/pm/checklist/?frequency=500_HOURS').status_code == 200
        assert client.get('/api/v1/pm/checklist/?frequency=1000_HOURS').status_code == 200

        # Forbidden for AM (Operator & FE checklists)
        for forbidden in ('DAILY', '50_HOURS', '100_HOURS', '250_HOURS'):
            res = client.get(f'/api/v1/pm/checklist/?frequency={forbidden}')
            assert res.status_code == 403

        assert client.get('/api/v1/pm/admin/checklist-items/').status_code == 403

    def test_admin_has_access_to_all_frequencies_and_config(self, seeded_masters, users, make_auth_client):
        client = make_auth_client(users['admin'])
        freq_res = client.get('/api/v1/pm/frequencies/')
        assert freq_res.status_code == 200
        allowed = freq_res.json()['data']['role_info']['allowed_frequencies']
        assert allowed == ['DAILY', '50_HOURS', '100_HOURS', '250_HOURS', '500_HOURS', '1000_HOURS']

        for fcode in allowed:
            assert client.get(f'/api/v1/pm/checklist/?frequency={fcode}').status_code == 200

        assert client.get('/api/v1/pm/admin/checklist-items/').status_code == 200

    def test_operator_cannot_submit_fe_or_am_form(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        op_client = make_auth_client(users['operator'])
        res = op_client.post(
            '/api/v1/pm/submissions/',
            {
                'machine_id': m1.id,
                'frequency': '100_HOURS',
                'hour_meter_reading': 250,
                'responses': [],
            },
            format='json',
        )
        assert res.status_code == 403

    def test_vendor_isolation_blocks_other_vendor_machine(self, seeded_masters, users, machines, make_auth_client):
        m1, m2 = machines
        op_client = make_auth_client(users['operator'])  # belongs to Vendor Alpha (m1)
        list_res = op_client.get('/api/v1/pm/machines/')
        assert list_res.status_code == 200
        ids = [m['id'] for m in list_res.json()['data']]
        assert m1.id in ids
        assert m2.id not in ids

        # Attempting to validate m2 (Vendor Beta) returns 403
        val_res = op_client.get(f'/api/v1/pm/machines/{m2.id}/validate/')
        assert val_res.status_code == 403

