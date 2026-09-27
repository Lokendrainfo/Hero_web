import requests
from datetime import datetime
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.conf import settings

from apps.integrations.ilync_client import IlyncClient
from apps.integrations.exceptions import IlyncTimeoutException
from apps.common.task_scope import get_user_authorized_tasks
from apps.dashboard.views import _compute_machine_hdd_output
from apps.users.models import User
from apps.vendors.models import Vendor


class TaskExecutionTelemetryTimeoutTestCase(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="admin_telemetry_test",
            email="admin_telemetry@example.com",
            password="testpassword",
            role="ADMIN",
            is_superuser=True
        )
        self.vendor = Vendor.objects.create(
            name="Test Vendor Alpha",
            code="V-ALPHA",
            external_vendor_id="ext-v-alpha-101",
            is_active=True
        )
        self.today_str = datetime.now().strftime('%Y-%m-%d')

    def _sample_tasks(self):
        """Returns 3 mock segment tasks."""
        return [
            {
                "id": "task-seg-001",
                "taskCode": "TC-001",
                "displayName": "Segment Task 1",
                "depth": 2,
                "totalSegments": 0,
                "routeSnapshot": {"level": "SEGMENT"},
                "vendorSnapshot": {"partnerName": "Test Vendor Alpha"},
                "createdAt": f"{self.today_str}T08:00:00Z",
                "updatedAt": f"{self.today_str}T08:00:00Z"
            },
            {
                "id": "task-seg-002",
                "taskCode": "TC-002",
                "displayName": "Segment Task 2",
                "depth": 2,
                "totalSegments": 0,
                "routeSnapshot": {"level": "SEGMENT"},
                "vendorSnapshot": {"partnerName": "Test Vendor Alpha"},
                "createdAt": f"{self.today_str}T09:00:00Z",
                "updatedAt": f"{self.today_str}T09:00:00Z"
            },
            {
                "id": "task-seg-003",
                "taskCode": "TC-003",
                "displayName": "Segment Task 3",
                "depth": 2,
                "totalSegments": 0,
                "routeSnapshot": {"level": "SEGMENT"},
                "vendorSnapshot": {"partnerName": "Test Vendor Alpha"},
                "createdAt": f"{self.today_str}T10:00:00Z",
                "updatedAt": f"{self.today_str}T10:00:00Z"
            }
        ]

    def _mock_execution_payload(self, machine_id, shot_length_meters):
        return {
            "success": True,
            "data": {
                "fieldData": {
                    "trenching": {
                        "trenchingMachineDetails": {
                            "machineId": machine_id,
                            "machineName": f"HDD-{machine_id}",
                            "vendorName": "Test Vendor Alpha"
                        },
                        "hddShot": [
                            {
                                "tentativeShotLength": shot_length_meters,
                                "hddStartTime": f"{self.today_str}T10:00:00Z",
                                "hddEndTime": f"{self.today_str}T11:00:00Z"
                            }
                        ]
                    }
                }
            }
        }

    def test_ilync_client_get_task_execution_uses_strict_configured_timeout(self):
        """Verify IlyncClient.get_task_execution forwards default and custom timeouts to request."""
        client = IlyncClient()
        with patch.object(client, '_request') as mock_req:
            mock_req.return_value = {"success": True, "data": {}}

            # Default timeout from settings (e.g. (2.0, 4.0))
            client.get_task_execution("task-123")
            mock_req.assert_called_with(
                'GET',
                'api/task-executions/task-123',
                params=None,
                headers=None,
                timeout=settings.ILYNC_TASK_EXECUTION_TIMEOUT
            )

            # Custom explicit timeout
            client.get_task_execution("task-123", timeout=(1.5, 3.5))
            mock_req.assert_called_with(
                'GET',
                'api/task-executions/task-123',
                params=None,
                headers=None,
                timeout=(1.5, 3.5)
            )

    @patch('apps.integrations.ilync_client.IlyncClient.get_task_children')
    @patch('apps.integrations.ilync_client.IlyncClient.get_my_tasks')
    @patch('apps.integrations.ilync_client.IlyncClient.get_task_execution')
    def test_all_execution_requests_succeed(self, mock_get_exec, mock_get_tasks, mock_get_children):
        """Test case: all execution requests succeed and populate full telemetry."""
        tasks = self._sample_tasks()
        mock_get_tasks.return_value = {"success": True, "data": {"content": tasks}}
        mock_get_children.return_value = {"success": True, "data": []}

        def side_effect(tid, timeout=None):
            lengths = {
                "task-seg-001": 100.0,
                "task-seg-002": 200.0,
                "task-seg-003": 300.0
            }
            return self._mock_execution_payload(f"MAC-{tid[-3:]}", lengths.get(tid, 50.0))

        mock_get_exec.side_effect = side_effect

        scoped_res = get_user_authorized_tasks(user=self.admin_user, task_type='FIBER_TRENCHING_DUCTING_TASK')
        results = scoped_res.get('results', [])

        self.assertEqual(len(results), 3)
        for r in results:
            self.assertIn('taskExecution', r)
            self.assertIsNotNone(r['taskExecution'])

        with patch('apps.common.ttl_cache.ttl_get', return_value=None):
            with patch('apps.common.ttl_cache.ttl_set') as _:
                output = _compute_machine_hdd_output(user=self.admin_user, date_param=self.today_str)

        self.assertEqual(output['total_meters'], 600.0)
        self.assertEqual(output['total_km'], 0.6)
        self.assertEqual(output['day_output_meters'], 600.0)
        self.assertEqual(output['day_output_km'], 0.6)
        self.assertEqual(output['total_machines'], 3)

    @patch('apps.integrations.ilync_client.IlyncClient.get_task_children')
    @patch('apps.integrations.ilync_client.IlyncClient.get_my_tasks')
    @patch('apps.integrations.ilync_client.IlyncClient.get_task_execution')
    def test_one_execution_request_times_out(self, mock_get_exec, mock_get_tasks, mock_get_children):
        """Test case: one execution request times out, other requests succeed."""
        tasks = self._sample_tasks()
        mock_get_tasks.return_value = {"success": True, "data": {"content": tasks}}
        mock_get_children.return_value = {"success": True, "data": []}

        def side_effect(tid, timeout=None):
            if tid == "task-seg-002":
                raise IlyncTimeoutException("Read timed out for task-seg-002")
            lengths = {
                "task-seg-001": 150.0,
                "task-seg-003": 250.0
            }
            return self._mock_execution_payload(f"MAC-{tid[-3:]}", lengths.get(tid, 50.0))

        mock_get_exec.side_effect = side_effect

        scoped_res = get_user_authorized_tasks(user=self.admin_user, task_type='FIBER_TRENCHING_DUCTING_TASK')
        results = scoped_res.get('results', [])

        self.assertEqual(len(results), 3)
        res_by_id = {r['id']: r for r in results}

        self.assertIn('taskExecution', res_by_id['task-seg-001'])
        self.assertIn('taskExecution', res_by_id['task-seg-003'])
        self.assertIsNone(res_by_id['task-seg-002'].get('taskExecution'))

        with patch('apps.common.ttl_cache.ttl_get', return_value=None):
            with patch('apps.common.ttl_cache.ttl_set') as _:
                output = _compute_machine_hdd_output(user=self.admin_user, date_param=self.today_str)

        self.assertEqual(output['total_meters'], 400.0)
        self.assertEqual(output['total_km'], 0.4)
        self.assertEqual(output['day_output_meters'], 400.0)
        self.assertEqual(output['total_machines'], 2)

    @patch('apps.integrations.ilync_client.IlyncClient.get_task_children')
    @patch('apps.integrations.ilync_client.IlyncClient.get_my_tasks')
    @patch('apps.integrations.ilync_client.IlyncClient.get_task_execution')
    def test_multiple_execution_requests_time_out(self, mock_get_exec, mock_get_tasks, mock_get_children):
        """Test case: multiple execution requests time out, remaining succeed."""
        tasks = self._sample_tasks()
        mock_get_tasks.return_value = {"success": True, "data": {"content": tasks}}
        mock_get_children.return_value = {"success": True, "data": []}

        def side_effect(tid, timeout=None):
            if tid in ("task-seg-001", "task-seg-002"):
                raise requests.exceptions.ReadTimeout(f"Read timed out for {tid}")
            return self._mock_execution_payload("MAC-003", 500.0)

        mock_get_exec.side_effect = side_effect

        scoped_res = get_user_authorized_tasks(user=self.admin_user, task_type='FIBER_TRENCHING_DUCTING_TASK')
        results = scoped_res.get('results', [])

        self.assertEqual(len(results), 3)
        res_by_id = {r['id']: r for r in results}

        self.assertIsNone(res_by_id['task-seg-001'].get('taskExecution'))
        self.assertIsNone(res_by_id['task-seg-002'].get('taskExecution'))
        self.assertIn('taskExecution', res_by_id['task-seg-003'])

        with patch('apps.common.ttl_cache.ttl_get', return_value=None):
            with patch('apps.common.ttl_cache.ttl_set') as _:
                output = _compute_machine_hdd_output(user=self.admin_user, date_param=self.today_str)

        self.assertEqual(output['total_meters'], 500.0)
        self.assertEqual(output['total_km'], 0.5)

    @patch('apps.integrations.ilync_client.IlyncClient.get_task_children')
    @patch('apps.integrations.ilync_client.IlyncClient.get_my_tasks')
    @patch('apps.integrations.ilync_client.IlyncClient.get_task_execution')
    def test_dashboard_still_returns_response_with_partial_telemetry(self, mock_get_exec, mock_get_tasks, mock_get_children):
        """Test case: dashboard returns a valid summary response even when telemetry partially fails."""
        tasks = self._sample_tasks()
        mock_get_tasks.return_value = {"success": True, "data": {"content": tasks}}
        mock_get_children.return_value = {"success": True, "data": []}

        def side_effect(tid, timeout=None):
            if tid == "task-seg-001":
                raise IlyncTimeoutException("Timeout")
            return self._mock_execution_payload("MAC-002", 300.0)

        mock_get_exec.side_effect = side_effect

        with patch('apps.common.ttl_cache.ttl_get', return_value=None):
            with patch('apps.common.ttl_cache.ttl_set') as _:
                output = _compute_machine_hdd_output(user=self.admin_user, date_param=self.today_str)

        expected_keys = [
            "total_meters", "total_km", "month_output_meters", "month_output_km",
            "day_output_meters", "day_output_km", "selected_date", "selected_month",
            "total_machines", "day_active_machines", "vendor_name", "day_wise", "machines"
        ]
        for key in expected_keys:
            self.assertIn(key, output, f"Missing key in dashboard response: {key}")

        self.assertEqual(output['total_meters'], 600.0)

    @patch('apps.integrations.ilync_client.IlyncClient.get_task_children')
    @patch('apps.integrations.ilync_client.IlyncClient.get_my_tasks')
    @patch('apps.integrations.ilync_client.IlyncClient.get_task_execution')
    def test_successful_telemetry_continues_contributing_to_hdd_output(self, mock_get_exec, mock_get_tasks, mock_get_children):
        """Test case: successful telemetry contributes accurately to metrics despite other tasks failing."""
        tasks = self._sample_tasks()
        mock_get_tasks.return_value = {"success": True, "data": {"content": tasks}}
        mock_get_children.return_value = {"success": True, "data": []}

        def side_effect(tid, timeout=None):
            if tid != "task-seg-003":
                raise IlyncTimeoutException(f"Failed {tid}")
            return self._mock_execution_payload("MAC-003", 750.0)

        mock_get_exec.side_effect = side_effect

        with patch('apps.common.ttl_cache.ttl_get', return_value=None):
            with patch('apps.common.ttl_cache.ttl_set') as _:
                output = _compute_machine_hdd_output(user=self.admin_user, date_param=self.today_str)

        self.assertEqual(output['total_meters'], 750.0)
        self.assertEqual(output['total_km'], 0.75)
        self.assertEqual(output['day_output_meters'], 750.0)
        self.assertEqual(output['day_output_km'], 0.75)
        self.assertEqual(output['total_machines'], 1)
        self.assertEqual(output['machines'][0]['machine_no'], "MAC-003")
        self.assertEqual(output['machines'][0]['output_meters'], 750.0)
        self.assertEqual(output['machines'][0]['output_km'], 0.75)

    @patch('apps.integrations.ilync_client.IlyncClient.get_task_children')
    @patch('apps.integrations.ilync_client.IlyncClient.get_my_tasks')
    @patch('apps.integrations.ilync_client.IlyncClient.get_task_execution')
    def test_all_execution_requests_time_out_returns_zero_meters_without_error(self, mock_get_exec, mock_get_tasks, mock_get_children):
        """Test case: when all telemetry requests time out, returns gracefully with 0 meters without crashing."""
        tasks = self._sample_tasks()
        mock_get_tasks.return_value = {"success": True, "data": {"content": tasks}}
        mock_get_children.return_value = {"success": True, "data": []}

        mock_get_exec.side_effect = IlyncTimeoutException("All timed out")

        with patch('apps.common.ttl_cache.ttl_get', return_value=None):
            with patch('apps.common.ttl_cache.ttl_set') as _:
                output = _compute_machine_hdd_output(user=self.admin_user, date_param=self.today_str)

        self.assertEqual(output['total_meters'], 0.0)
        self.assertEqual(output['total_km'], 0.0)
        self.assertEqual(output['month_output_meters'], 0.0)
        self.assertEqual(output['day_output_meters'], 0.0)
        self.assertEqual(output['total_machines'], 0)
        self.assertEqual(output['machines'], [])
