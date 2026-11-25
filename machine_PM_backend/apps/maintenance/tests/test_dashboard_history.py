import pytest

from .conftest import make_test_image


@pytest.mark.django_db(databases=['default', 'hero'])
class TestDashboardHistoryAndReports:
    def test_dashboard_history_pending_overdue_and_reports(self, seeded_masters, users, machines, make_auth_client):
        m1, m2 = machines
        op_client = make_auth_client(users['operator'])
        admin_client = make_auth_client(users['admin'])

        # Operator submits 50_HOURS for m1
        checklist = op_client.get('/api/v1/pm/checklist/?frequency=50_HOURS').json()['data']['items']
        responses = []
        for idx, item in enumerate(checklist):
            img = make_test_image(color=(idx * 60 + 5, 110, 80), filename=f'dash_{idx}.png')
            up = op_client.post(
                '/api/v1/pm/photos/upload/',
                {'file': img, 'machine_id': m1.id, 'checklist_item_id': item['id'], 'frequency': '50_HOURS', 'capture_source': 'CAMERA'},
                format='multipart',
            )
            responses.append(
                {
                    'checklist_item_id': item['id'],
                    'status': 'COMPLETED',
                    'photo_id': up.json()['data']['id'],
                }
            )
        sub_res = op_client.post(
            '/api/v1/pm/submissions/',
            {'machine_id': m1.id, 'frequency': '50_HOURS', 'hour_meter_reading': 245, 'responses': responses},
            format='json',
        )
        assert sub_res.status_code == 201

        # Dashboard for Admin shows both machines and KPIs
        dash_res = admin_client.get('/api/v1/pm/dashboard/')
        assert dash_res.status_code == 200
        dash = dash_res.json()['data']
        assert dash['kpis']['total_machines'] == 2
        assert len(dash['frequency_completion']) == 6

        # Machine-wise history
        m_hist = admin_client.get(f'/api/v1/pm/history/machine/{m1.id}/')
        assert m_hist.status_code == 200
        assert len(m_hist.json()['data']) == 1
        assert m_hist.json()['data'][0]['photo_count'] == 3

        # User-wise history
        u_hist = op_client.get('/api/v1/pm/history/user/')
        assert u_hist.status_code == 200
        assert len(u_hist.json()['data']) == 1

        # Pending & Overdue
        assert admin_client.get('/api/v1/pm/pending/').status_code == 200
        assert admin_client.get('/api/v1/pm/overdue/').status_code == 200

        # Reports JSON + CSV export
        rep_json = admin_client.get('/api/v1/pm/reports/')
        assert rep_json.status_code == 200
        assert rep_json.json()['data']['activity_compliance_pct'] == 100.0

        rep_csv = admin_client.get('/api/v1/pm/reports/?export=csv')
        assert rep_csv.status_code == 200
        assert 'text/csv' in rep_csv['Content-Type']
        assert 'Submission Number' in rep_csv.content.decode('utf-8')

