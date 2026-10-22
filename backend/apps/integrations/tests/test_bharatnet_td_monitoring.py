import base64
import time
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework import status

from apps.integrations.bharatnet_token import generate_bharatnet_live_token, verify_bharatnet_live_token

IST = timezone(timedelta(hours=5, minutes=30))


class BharatNetTDMonitoringTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.valid_user = getattr(settings, 'BHARATNET_API_USERNAME', 'bharatnet_service')
        self.valid_pass = getattr(settings, 'BHARATNET_API_PASSWORD', 'BharatNet@2026!Secure')
        self.basic_auth_header = 'Basic ' + base64.b64encode(f"{self.valid_user}:{self.valid_pass}".encode('utf-8')).decode('utf-8')

        # Build mock tasks dataset with known captures
        # Two operators in the same block, one with multiple captures on 2026-10-02
        self.mock_tasks = [
            {
                'id': 'task_upw_001',
                'taskCode': 'TASK-UPW-001',
                'location': {
                    'circle': 'UPW',
                    'district': 'AGRA',
                    'blockName': 'BAH',
                    'state': 'UPW'
                },
                'machineId': 'HDD-221',
                'assigneeName': 'Ram Kumar',
                'assigneeUserId': 'OP-4471',
                'taskExecution': {
                    'fieldData': {
                        'trenching': {
                            'trenchingMachineDetails': {'machineId': 'HDD-221'},
                            'operatorDetails': {'name': 'Ram Kumar', 'id': 'OP-4471'},
                            'hddShot': [
                                {
                                    'hddShotName': 'SHOT-1',
                                    'tentativeShotLength': 120,
                                    'depthCapture': [
                                        # Earlier capture on 2026-10-02 (10:15 IST -> 1790916300000)
                                        {
                                            'depth': 1.50,
                                            'depthoMeterImage': {
                                                'capturedAt': int(datetime(2026, 10, 2, 10, 15, 0, tzinfo=IST).timestamp() * 1000)
                                            }
                                        },
                                        # Latest capture on 2026-10-02 (14:32:07 IST -> 1790931727000)
                                        {
                                            'depth': 1.65,
                                            'depthoMeterImage': {
                                                'capturedAt': int(datetime(2026, 10, 2, 14, 32, 7, tzinfo=IST).timestamp() * 1000)
                                            }
                                        },
                                        # Different date capture (2026-10-01)
                                        {
                                            'depth': 1.80,
                                            'depthoMeterImage': {
                                                'capturedAt': int(datetime(2026, 10, 1, 11, 0, 0, tzinfo=IST).timestamp() * 1000)
                                            }
                                        },
                                    ]
                                }
                            ]
                        }
                    }
                }
            },
            # Second operator in BAH block
            {
                'id': 'task_upw_002',
                'taskCode': 'TASK-UPW-002',
                'location': {
                    'circle': 'UPW',
                    'district': 'AGRA',
                    'blockName': 'BAH',
                    'state': 'UPW'
                },
                'machineId': 'HDD-222',
                'assigneeName': 'Shyam Sundar',
                'assigneeUserId': 'OP-4472',
                'taskExecution': {
                    'fieldData': {
                        'trenching': {
                            'trenchingMachineDetails': {'machineId': 'HDD-222'},
                            'operatorDetails': {'name': 'Shyam Sundar', 'id': 'OP-4472'},
                            'hddShot': [
                                {
                                    'hddShotName': 'SHOT-2',
                                    'depthCapture': [
                                        {
                                            'depth': 1.72,
                                            'depthoMeterImage': {
                                                'capturedAt': int(datetime(2026, 10, 2, 15, 10, 0, tzinfo=IST).timestamp() * 1000)
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            },
            # Task in a different district/block
            {
                'id': 'task_upw_003',
                'taskCode': 'TASK-UPW-003',
                'location': {
                    'circle': 'UPW',
                    'district': 'MATHURA',
                    'blockName': 'CHHATA',
                    'state': 'UPW'
                },
                'machineId': 'HDD-333',
                'assigneeName': 'Devendra Singh',
                'assigneeUserId': 'OP-5501',
                'taskExecution': {
                    'fieldData': {
                        'trenching': {
                            'trenchingMachineDetails': {'machineId': 'HDD-333'},
                            'operatorDetails': {'name': 'Devendra Singh', 'id': 'OP-5501'},
                            'hddShot': [
                                {
                                    'hddShotName': 'SHOT-3',
                                    'depthCapture': [
                                        {
                                            'depth': 1.60,
                                            'depthoMeterImage': {
                                                'capturedAt': int(datetime(2026, 10, 2, 12, 0, 0, tzinfo=IST).timestamp() * 1000)
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        ]

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_01_valid_basic_authentication(self, mock_tasks_fn):
        """Test valid Basic authentication succeeds."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)
        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'OK')

    def test_02_invalid_credentials_returns_401_json(self):
        """Test invalid credentials return HTTP 401 with JSON error envelope."""
        bad_header = 'Basic ' + base64.b64encode(b'bad_user:bad_pass').decode('utf-8')
        self.client.credentials(HTTP_AUTHORIZATION=bad_header)
        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data.get('status'), 'ERROR')
        self.assertIn('Invalid or missing Basic authentication', res.data.get('message'))

    def test_03_missing_credentials_returns_401_json(self):
        """Test missing Authorization header returns HTTP 401 with JSON error envelope."""
        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data.get('status'), 'ERROR')

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_04_valid_circle_and_date_returns_schema_a(self, mock_tasks_fn):
        """Test Schema A nested structure: circles -> districts -> blocks -> user_urls."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        d = res.data

        self.assertEqual(d.get('status'), 'OK')
        self.assertEqual(d.get('message'), '2 blocks reported captures on 2026-10-02')

        results = d.get('results', {})
        self.assertIn('circles', results)
        self.assertIsInstance(results['circles'], list)
        self.assertEqual(len(results['circles']), 1)

        circle = results['circles'][0]
        self.assertEqual(circle.get('circle_name'), 'UPW')
        self.assertIsInstance(circle.get('districts'), list)
        self.assertEqual(len(circle['districts']), 2)

        # Check district AGRA
        agra = next((dist for dist in circle['districts'] if dist.get('district_name') == 'AGRA'), None)
        self.assertIsNotNone(agra)
        self.assertIsInstance(agra.get('blocks'), list)
        self.assertEqual(len(agra['blocks']), 1)

        # Check block BAH
        bah = agra['blocks'][0]
        self.assertEqual(bah.get('block_name'), 'BAH')
        self.assertIsInstance(bah.get('user_urls'), list)
        self.assertEqual(len(bah['user_urls']), 2)

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_05_case_insensitive_circle_and_state_filter(self, mock_tasks_fn):
        """Test circle filter is case-insensitive and state filter works as alias."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        # Lowercase circle
        res_lower = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=upw&date=2026-10-02')
        self.assertEqual(res_lower.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_lower.data['results']['circles']), 1)

        # State alias
        res_state = self.client.get('/api/v1/bharatnet/td-monitoring/?state=Upw&date=2026-10-02')
        self.assertEqual(res_state.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_state.data['results']['circles']), 1)

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_06_unknown_circle_returns_empty_envelope(self, mock_tasks_fn):
        """Test unknown circle returns successful empty response with circles: []."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UNKNOWN_CIRCLE&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'OK')
        self.assertEqual(res.data.get('message'), '0 blocks reported captures on 2026-10-02')
        self.assertEqual(res.data.get('results', {}).get('circles'), [])

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_07_date_with_no_captures_returns_empty_envelope(self, mock_tasks_fn):
        """Test date with no captures returns successful empty response with circles: []."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2025-01-01')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'OK')
        self.assertEqual(res.data.get('results', {}).get('circles'), [])

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_08_multiple_operators_and_only_latest_capture_returned(self, mock_tasks_fn):
        """Test multiple operators in one block and only the latest capture per operator is returned."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        d = res.data
        circle = d['results']['circles'][0]
        agra = next(dist for dist in circle['districts'] if dist['district_name'] == 'AGRA')
        bah = agra['blocks'][0]

        # Two distinct operators
        self.assertEqual(len(bah['user_urls']), 2)
        users = {u['userName']: u for u in bah['user_urls']}
        self.assertIn('Ram Kumar', users)
        self.assertIn('Shyam Sundar', users)

        # For Ram Kumar, earlier depth was 1.50, latest depth was 1.65 at 14:32:07 IST
        ram = users['Ram Kumar']
        self.assertEqual(ram['lastDepthCapturedAt'], '2026-10-02T14:32:07+05:30')
        self.assertTrue(ram['url'].startswith('https://hero.pramaanu.co.in/live-view/'))
        # Ensure extra fields (machineId, depthMeters, userId) are not sent so Pragati Patal displays clean operator links
        self.assertNotIn('machineId', ram)
        self.assertNotIn('depthMeters', ram)
        self.assertNotIn('userId', ram)
        self.assertNotIn('userId=', ram.get('map_url', ''))
        self.assertNotIn('machineId=', ram.get('map_url', ''))

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_09_ist_date_boundaries(self, mock_tasks_fn):
        """Test timestamp right before midnight IST (23:59:59) belongs to requested date."""
        late_task = {
            'id': 'task_late',
            'location': {'circle': 'UPW', 'district': 'AGRA', 'blockName': 'BAH'},
            'machineId': 'HDD-221',
            'assigneeName': 'Ram Kumar',
            'assigneeUserId': 'OP-4471',
            'taskExecution': {
                'fieldData': {
                    'trenching': {
                        'trenchingMachineDetails': {'machineId': 'HDD-221'},
                        'operatorDetails': {'name': 'Ram Kumar', 'id': 'OP-4471'},
                        'hddShot': [{
                            'depthCapture': [{
                                'depth': 1.65,
                                'depthoMeterImage': {
                                    'capturedAt': int(datetime(2026, 10, 1, 23, 59, 59, tzinfo=IST).timestamp() * 1000)
                                }
                            }]
                        }]
                    }
                }
            }
        }
        mock_tasks_fn.return_value = {'results': [late_task]}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-01')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['results']['circles']), 1)

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_10_missing_or_invalid_timestamps_ignored(self, mock_tasks_fn):
        """Test captures with missing or corrupt timestamps are safely ignored without crashing."""
        corrupt_task = {
            'id': 'task_corrupt',
            'location': {'circle': 'UPW', 'district': 'AGRA', 'blockName': 'BAH'},
            'taskExecution': {
                'fieldData': {
                    'trenching': {
                        'hddShot': [{
                            'depthCapture': [
                                {'depth': 1.5, 'depthoMeterImage': {'capturedAt': None}},
                                {'depth': 1.6, 'depthoMeterImage': {'capturedAt': 'invalid_date'}},
                            ]
                        }]
                    }
                }
            }
        }
        mock_tasks_fn.return_value = {'results': [corrupt_task]}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['results']['circles'], [])

    @override_settings(BHARATNET_ALLOWED_CIRCLES='RAJASTHAN,HARYANA')
    def test_11_unauthorized_circle_access_returns_403(self):
        """Test accessing a circle not in BHARATNET_ALLOWED_CIRCLES returns HTTP 403."""
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)
        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data.get('status'), 'ERROR')
        self.assertIn('Access denied', res.data.get('message'))

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_12_no_sensitive_fields_in_response(self, mock_tasks_fn):
        """Test response contains no sensitive credentials, database IDs, passwords or PII."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        response_str = str(res.data)

        self.assertNotIn('password', response_str.lower())
        self.assertNotIn('secret', response_str.lower())
        self.assertNotIn('token_secret', response_str.lower())
        self.assertNotIn('mobileNumber', response_str)
        self.assertNotIn('7742418806', response_str)
        self.assertNotIn('aadhaar', response_str.lower())

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_13_performance_large_set_of_records(self, mock_tasks_fn):
        """Test processing performance with 500 tasks completes in under 2 seconds."""
        # Generate 500 tasks
        large_tasks = []
        for i in range(500):
            large_tasks.append({
                'id': f'task_perf_{i}',
                'location': {'circle': 'UPW', 'district': f'DIST_{i % 5}', 'blockName': f'BLOCK_{i % 20}'},
                'machineId': f'HDD-{i % 10}',
                'assigneeName': f'Operator {i % 25}',
                'assigneeUserId': f'OP-{i % 25}',
                'taskExecution': {
                    'fieldData': {
                        'trenching': {
                            'trenchingMachineDetails': {'machineId': f'HDD-{i % 10}'},
                            'operatorDetails': {'name': f'Operator {i % 25}', 'id': f'OP-{i % 25}'},
                            'hddShot': [{
                                'depthCapture': [{
                                    'depth': 1.65,
                                    'depthoMeterImage': {
                                        'capturedAt': int(datetime(2026, 10, 2, 10, i % 60, 0, tzinfo=IST).timestamp() * 1000)
                                    }
                                }]
                            }]
                        }
                    }
                }
            })
        mock_tasks_fn.return_value = {'results': large_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        start = time.perf_counter()
        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')
        elapsed = time.perf_counter() - start

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertLess(elapsed, 2.0, f"Processing 500 tasks took {elapsed:.2f}s, expected < 2.0s")

    def test_14_token_generation_and_verification(self):
        """Test cryptographic token generation and verification for live-view."""
        token = generate_bharatnet_live_token('task_123', 'HDD-99', 'OP-88', '2026-10-02')
        self.assertIsInstance(token, str)

        payload = verify_bharatnet_live_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get('tid'), 'task_123')
        self.assertEqual(payload.get('m'), 'HDD-99')
        self.assertEqual(payload.get('u'), 'OP-88')
        self.assertEqual(payload.get('d'), '2026-10-02')

        # Invalid token returns None
        self.assertIsNone(verify_bharatnet_live_token('corrupted_token'))

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_15_generic_endpoint_valid_authenticated_request(self, mock_tasks_fn):
        """Test the new generic endpoint /api/v1/td-monitoring/ returns 200 OK with Schema A."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)
        res = self.client.get('/api/v1/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'OK')
        self.assertIn('results', res.data)
        self.assertIn('circles', res.data['results'])
        self.assertEqual(len(res.data['results']['circles']), 1)
        self.assertEqual(res.data['results']['circles'][0]['circle_name'], 'UPW')

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_16_generic_endpoint_circle_and_date_filters(self, mock_tasks_fn):
        """Test circle and date filtering on /api/v1/td-monitoring/ and 400 for invalid dates."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        # Valid date
        res = self.client.get('/api/v1/td-monitoring/?circle=upw&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Invalid date format returns 400
        res_bad_date = self.client.get('/api/v1/td-monitoring/?circle=UPW&date=02-10-2026')
        self.assertEqual(res_bad_date.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_bad_date.data.get('status'), 'ERROR')

    def test_17_generic_endpoint_auth_errors(self):
        """Test missing and invalid credentials on /api/v1/td-monitoring/ return 401."""
        # Missing auth
        res_missing = self.client.get('/api/v1/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res_missing.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_missing.data.get('status'), 'ERROR')

        # Bad credentials
        bad_header = 'Basic ' + base64.b64encode(b'wrong_user:wrong_pass').decode('utf-8')
        self.client.credentials(HTTP_AUTHORIZATION=bad_header)
        res_bad = self.client.get('/api/v1/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(res_bad.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_bad.data.get('status'), 'ERROR')

    @override_settings(BHARATNET_ALLOWED_CIRCLES='UPW')
    def test_18_generic_endpoint_unauthorized_circle(self):
        """Test requesting a circle outside BHARATNET_ALLOWED_CIRCLES returns 403 on /api/v1/td-monitoring/."""
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)
        res = self.client.get('/api/v1/td-monitoring/?circle=HARYANA&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data.get('status'), 'ERROR')

    def test_19_generic_endpoint_unsupported_http_method(self):
        """Test POST, PUT, DELETE return 405 Method Not Allowed on /api/v1/td-monitoring/."""
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)
        post_res = self.client.post('/api/v1/td-monitoring/?circle=UPW&date=2026-10-02', {})
        self.assertEqual(post_res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        put_res = self.client.put('/api/v1/td-monitoring/?circle=UPW&date=2026-10-02', {})
        self.assertEqual(put_res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        del_res = self.client.delete('/api/v1/td-monitoring/?circle=UPW&date=2026-10-02')
        self.assertEqual(del_res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_20_generic_endpoint_empty_results(self, mock_tasks_fn):
        """Test unknown circle or dates with no captures returns 200 with empty circles array."""
        mock_tasks_fn.return_value = {'results': []}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)
        res = self.client.get('/api/v1/td-monitoring/?circle=UNKNOWN_CIRCLE&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'OK')
        self.assertEqual(res.data.get('results', {}).get('circles'), [])

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_21_endpoints_equivalence(self, mock_tasks_fn):
        """Verify /api/v1/td-monitoring/ and /api/v1/bharatnet/td-monitoring/ return equivalent responses."""
        mock_tasks_fn.return_value = {'results': self.mock_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res_new = self.client.get('/api/v1/td-monitoring/?circle=UPW&date=2026-10-02')
        res_old = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=UPW&date=2026-10-02')

        self.assertEqual(res_new.status_code, res_old.status_code)
        self.assertEqual(res_new.data.get('status'), res_old.data.get('status'))
        self.assertEqual(res_new.data.get('message'), res_old.data.get('message'))
        self.assertEqual(len(res_new.data['results']['circles']), len(res_old.data['results']['circles']))
        self.assertEqual(
            res_new.data['results']['circles'][0]['circle_name'],
            res_old.data['results']['circles'][0]['circle_name']
        )

    def test_22_live_view_endpoints_equivalence(self):
        """Verify /api/v1/live-view/<token>/ and /api/v1/bharatnet/live-view/<token>/ route correctly."""
        # Corrupted token should return 403 Forbidden on both
        res_new = self.client.get('/api/v1/live-view/invalid_token/')
        res_old = self.client.get('/api/v1/bharatnet/live-view/invalid_token/')
        self.assertEqual(res_new.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_old.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_new.data.get('status'), res_old.data.get('status'))

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_23_circle_alias_as_maps_to_assam(self, mock_tasks_fn):
        """Verify circle alias AS maps correctly to ASSAM circle."""
        assam_task = {
            'id': 'task_as_01',
            'location': {'circle': 'ASSAM', 'district': 'NALBARI', 'blockName': 'TIHU'},
            'machineId': 'HDD-001',
            'assigneeName': 'Sayem Ali',
            'assigneeUserId': 'OP-001',
            'taskExecution': {
                'fieldData': {
                    'trenching': {
                        'trenchingMachineDetails': {'machineId': 'HDD-001'},
                        'operatorDetails': {'name': 'Sayem Ali', 'id': 'OP-001'},
                        'hddShot': [{
                            'depthCapture': [{
                                'depth': 1.69,
                                'depthoMeterImage': {
                                    'capturedAt': int(datetime(2026, 10, 16, 11, 0, 0, tzinfo=IST).timestamp() * 1000)
                                }
                            }]
                        }]
                    }
                }
            }
        }
        mock_tasks_fn.return_value = {'results': [assam_task]}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        # Query using alias AS
        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=AS&date=2026-10-16')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['results']['circles']), 1)
        self.assertEqual(res.data['results']['circles'][0]['circle_name'], 'ASSAM')

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_24_circle_all_returns_all_circles(self, mock_tasks_fn):
        """Verify circle=ALL does not filter out circles and returns all available circles."""
        multi_tasks = list(self.mock_tasks) + [{
            'id': 'task_as_01',
            'location': {'circle': 'ASSAM', 'district': 'NALBARI', 'blockName': 'TIHU'},
            'machineId': 'HDD-001',
            'assigneeName': 'Sayem Ali',
            'assigneeUserId': 'OP-001',
            'taskExecution': {
                'fieldData': {
                    'trenching': {
                        'trenchingMachineDetails': {'machineId': 'HDD-001'},
                        'operatorDetails': {'name': 'Sayem Ali', 'id': 'OP-001'},
                        'hddShot': [{
                            'depthCapture': [{
                                'depth': 1.69,
                                'depthoMeterImage': {
                                    'capturedAt': int(datetime(2026, 10, 2, 11, 0, 0, tzinfo=IST).timestamp() * 1000)
                                }
                            }]
                        }]
                    }
                }
            }
        }]
        mock_tasks_fn.return_value = {'results': multi_tasks}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=ALL&date=2026-10-02')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        circle_names = [c['circle_name'] for c in res.data['results']['circles']]
        self.assertIn('UPW', circle_names)
        self.assertIn('ASSAM', circle_names)

    @patch('apps.integrations.bharatnet_views.get_user_authorized_tasks')
    def test_25_assam_circle_latest_date_fallback(self, mock_tasks_fn):
        """Verify circle=ASSAM without date or with no captures today automatically falls back to latest activity."""
        assam_task = {
            'id': 'task_as_01',
            'location': {'circle': 'ASSAM', 'district': 'NALBARI', 'blockName': 'TIHU'},
            'machineId': 'HDD-001',
            'assigneeName': 'Sayem Ali',
            'assigneeUserId': 'OP-001',
            'taskExecution': {
                'fieldData': {
                    'trenching': {
                        'trenchingMachineDetails': {'machineId': 'HDD-001'},
                        'operatorDetails': {'name': 'Sayem Ali', 'id': 'OP-001'},
                        'hddShot': [{
                            'depthCapture': [{
                                'depth': 1.73,
                                'depthoMeterImage': {
                                    'capturedAt': int(datetime(2026, 10, 16, 14, 0, 0, tzinfo=IST).timestamp() * 1000)
                                }
                            }]
                        }]
                    }
                }
            }
        }
        mock_tasks_fn.return_value = {'results': [assam_task]}
        self.client.credentials(HTTP_AUTHORIZATION=self.basic_auth_header)

        # Call without date parameter
        res = self.client.get('/api/v1/bharatnet/td-monitoring/?circle=ASSAM')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['results']['circles']), 1)
        self.assertEqual(res.data['results']['circles'][0]['circle_name'], 'ASSAM')
        self.assertEqual(res.data['date'], '2026-10-16')
        self.assertEqual(res.data['latest_available_date'], '2026-10-16')

