import json
import pytest

from apps.maintenance.models import MaintenanceAuditLog, MaintenanceSubmission
from .conftest import make_test_image


@pytest.mark.django_db(databases=['default', 'hero'])
class TestMaintenanceWorkflows:
    def _upload_and_build_responses(self, client, machine_id, frequency, checklist_items, not_completed_idx=None, color_seed=0):
        responses = []
        for idx, item in enumerate(checklist_items):
            img = make_test_image(
                color=(((idx + color_seed) * 23 + 10) % 255, ((idx + color_seed) * 57 + 30) % 255, ((idx + color_seed) * 91 + 50) % 255),
                filename=f'{frequency.lower()}_{color_seed}_{idx}.png',
            )
            up = client.post(
                '/api/v1/pm/photos/upload/',
                {
                    'file': img,
                    'machine_id': machine_id,
                    'checklist_item_id': item['id'],
                    'frequency': frequency,
                    'capture_source': 'CAMERA',
                },
                format='multipart',
            )
            assert up.status_code == 201, up.json()
            is_nc = (not_completed_idx is not None and idx == not_completed_idx)
            responses.append(
                {
                    'checklist_item_id': item['id'],
                    'status': 'NOT_COMPLETED' if is_nc else 'COMPLETED',
                    'remarks': 'Grease nipple damaged, spare requested' if is_nc else 'Checked OK',
                    'photo_id': up.json()['data']['id'],
                }
            )
        return responses

    def test_complete_operator_daily_workflow_and_duplicate_block(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        client = make_auth_client(users['operator'])

        # Validate machine & hour meter from HERO
        m_val = client.get(f'/api/v1/pm/machines/{m1.id}/validate/')
        assert m_val.status_code == 200
        m_data = m_val.json()['data']
        assert m_data['machine_number'] == '600202608401'
        assert m_data['machine_model'] == 'APOLLO A600 V2'
        assert m_data['assigned_operator'] == 'Ravi Kumar'
        assert m_data['vendor_name'] == 'Vendor Alpha Infra'

        checklist = client.get('/api/v1/pm/checklist/?frequency=DAILY').json()['data']['items']
        assert len(checklist) == 9

        responses = self._upload_and_build_responses(client, m1.id, 'DAILY', checklist)
        sub_res = client.post(
            '/api/v1/pm/submissions/',
            {
                'machine_id': m1.id,
                'frequency': 'DAILY',
                'hour_meter_reading': 245.5,
                'general_remarks': 'All daily points greased and verified',
                'client_request_id': 'req-daily-001',
                'responses': responses,
            },
            format='json',
        )
        assert sub_res.status_code == 201, sub_res.json()
        sub_data = sub_res.json()['data']
        assert sub_data['status'] == 'COMPLETED'
        assert sub_data['total_items'] == 9
        assert sub_data['completed_items_count'] == 9
        assert sub_data['photo_count'] == 9
        assert len({r['photo_hash'] for r in sub_data['responses']}) == 9

        # Duplicate submission on same day must return 409 Conflict
        responses_dup = self._upload_and_build_responses(client, m1.id, 'DAILY', checklist, color_seed=10)
        dup_res = client.post(
            '/api/v1/pm/submissions/',
            {
                'machine_id': m1.id,
                'frequency': 'DAILY',
                'hour_meter_reading': 246.0,
                'responses': responses_dup,
            },
            format='json',
        )
        assert dup_res.status_code == 409

        # Audit log recorded
        assert MaintenanceAuditLog.objects.filter(entity_type='SUBMISSION', action='SUBMISSION_CREATED').exists()

    def test_field_engineer_partial_completion_and_multipart_submit(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        fe_client = make_auth_client(users['fe'])
        checklist = fe_client.get('/api/v1/pm/checklist/?frequency=100_HOURS').json()['data']['items']
        assert len(checklist) == 5

        payload_responses = []
        files = {}
        for idx, item in enumerate(checklist):
            is_nc = idx == 0
            payload_responses.append(
                {
                    'checklist_item_id': item['id'],
                    'status': 'NOT_COMPLETED' if is_nc else 'COMPLETED',
                    'remarks': 'Battery voltage low (21.5V), needs charging' if is_nc else '',
                }
            )
            files[f"photo_{item['id']}"] = make_test_image(
                color=(idx * 45, 90, 210),
                filename=f'fe_mp_{idx}.png',
            )

        multipart_data = {
            'machine_id': str(m1.id),
            'frequency': '100_HOURS',
            'hour_meter_reading': '250.0',
            'capture_source': 'CAMERA',
            'responses': json.dumps(payload_responses),
            **files,
        }
        res = fe_client.post('/api/v1/pm/submissions/', multipart_data, format='multipart')
        assert res.status_code == 201, res.json()
        data = res.json()['data']
        assert data['status'] == 'PARTIALLY_COMPLETED'
        assert data['completed_items_count'] == 4
        assert data['not_completed_items_count'] == 1
        assert len(data['responses']) == 5

    def test_area_manager_500_1000_and_review_workflow(self, seeded_masters, users, machines, make_auth_client):
        _, m2 = machines
        am_client = make_auth_client(users['am'])
        fe_client = make_auth_client(users['fe'])

        checklist_500 = am_client.get('/api/v1/pm/checklist/?frequency=500_HOURS').json()['data']['items']
        assert len(checklist_500) == 5
        responses_500 = self._upload_and_build_responses(am_client, m2.id, '500_HOURS', checklist_500)
        sub_res = am_client.post(
            '/api/v1/pm/submissions/',
            {
                'machine_id': m2.id,
                'frequency': '500_HOURS',
                'hour_meter_reading': 510,
                'responses': responses_500,
            },
            format='json',
        )
        assert sub_res.status_code == 201
        sub_id = sub_res.json()['data']['id']

        # FE cannot review/approve submissions
        fe_review = fe_client.post(
            f'/api/v1/pm/submissions/{sub_id}/review/',
            {'action': 'APPROVED', 'remarks': 'Unauthorized'},
            format='json',
        )
        assert fe_review.status_code == 403

        # Area Manager can approve
        am_review = am_client.post(
            f'/api/v1/pm/submissions/{sub_id}/review/',
            {'action': 'APPROVED', 'remarks': 'All 500-hr filters and gearbox oil verified'},
            format='json',
        )
        assert am_review.status_code == 200
        assert am_review.json()['data']['submission']['approval_status'] == 'APPROVED'

        # Area Manager can also access & submit 1000_HOURS
        checklist_1000 = am_client.get('/api/v1/pm/checklist/?frequency=1000_HOURS').json()['data']['items']
        assert len(checklist_1000) == 4
        responses_1000 = self._upload_and_build_responses(am_client, m2.id, '1000_HOURS', checklist_1000, color_seed=20)
        sub_1000 = am_client.post(
            '/api/v1/pm/submissions/',
            {
                'machine_id': m2.id,
                'frequency': '1000_HOURS',
                'hour_meter_reading': 1005,
                'responses': responses_1000,
            },
            format='json',
        )
        assert sub_1000.status_code == 201
        assert MaintenanceSubmission.objects.filter(id=sub_1000.json()['data']['id']).exists()
