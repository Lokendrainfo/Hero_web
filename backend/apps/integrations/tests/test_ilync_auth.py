import time
import threading
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
import requests
import jwt

from apps.integrations.ilync_auth import IlyncTokenManager, IlyncAuthManager
from apps.integrations.ilync_client import IlyncClient
from apps.integrations.exceptions import IlyncAuthException


def generate_jwt(exp_timestamp: int, sub="test_user", role="SCM") -> str:
    """Helper to generate a test JWT with an arbitrary expiration timestamp."""
    payload = {
        "sub": sub,
        "role": role,
        "exp": exp_timestamp,
        "iat": exp_timestamp - 3600
    }
    return jwt.encode(payload, "secret-test-key-32-bytes-long-hero!", algorithm="HS256")


class IlyncTokenManagerTestCase(TestCase):
    def setUp(self):
        IlyncTokenManager.invalidate()
        self.client = IlyncClient()

    def tearDown(self):
        IlyncTokenManager.invalidate()

    # =========================================================================
    # Test A: Valid token -> API request succeeds without login
    # =========================================================================
    @patch.object(requests.Session, 'request')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_login_api')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_refresh_api')
    def test_a_valid_token_succeeds_without_login(self, mock_refresh, mock_login, mock_request):
        now = int(time.time())
        valid_token = generate_jwt(exp_timestamp=now + 7200)  # expires in 2 hours

        with override_settings(
            ILYNC_API_TOKEN=valid_token,
            ILYNC_PHONE_NUMBER="9175804320",
            ILYNC_PASSWORD="secret_password"
        ):
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"success": True, "data": {"status": "ok"}}
            mock_request.return_value = mock_resp

            res = self.client.get("api/test-endpoint")
            self.assertEqual(res, {"success": True, "data": {"status": "ok"}})

            # Verify no login or refresh calls were made
            mock_login.assert_not_called()
            mock_refresh.assert_not_called()

            # Verify the request header used the valid token
            self.assertEqual(mock_request.call_count, 1)
            sent_headers = mock_request.call_args[1]['headers']
            self.assertEqual(sent_headers['Authorization'], f"Bearer {valid_token}")

    # =========================================================================
    # Test B: Token near expiry -> token refresh occurs
    # =========================================================================
    @patch.object(requests.Session, 'request')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_refresh_api')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_login_api')
    def test_b_token_near_expiry_triggers_refresh(self, mock_login, mock_refresh, mock_request):
        now = int(time.time())
        near_expiry_token = generate_jwt(exp_timestamp=now + 300)  # 5 minutes left (< 10 min buffer)
        new_token = generate_jwt(exp_timestamp=now + 86400)

        mock_refresh.return_value = (new_token, "new_refresh_token_123")

        with override_settings(
            ILYNC_API_TOKEN=near_expiry_token,
            ILYNC_REFRESH_TOKEN="existing_refresh_token_abc"
        ):
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"success": True, "data": {"refreshed": True}}
            mock_request.return_value = mock_resp

            # Prime the cache with the near-expiry token
            IlyncTokenManager._cached_access_token = near_expiry_token

            res = self.client.get("api/test-endpoint")
            self.assertEqual(res, {"success": True, "data": {"refreshed": True}})

            # Verify refresh was triggered
            mock_refresh.assert_called_once_with("existing_refresh_token_abc")
            # Verify the request used the NEW token
            sent_headers = mock_request.call_args[1]['headers']
            self.assertEqual(sent_headers['Authorization'], f"Bearer {new_token}")

    # =========================================================================
    # Test C: Expired token -> automatic authentication occurs
    # =========================================================================
    @patch.object(requests.Session, 'request')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_login_api')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_refresh_api')
    def test_c_expired_token_triggers_automatic_login(self, mock_refresh, mock_login, mock_request):
        now = int(time.time())
        expired_token = generate_jwt(exp_timestamp=now - 120)  # Expired 2 minutes ago
        brand_new_token = generate_jwt(exp_timestamp=now + 86400)

        mock_login.return_value = (brand_new_token, "new_refresh_token_xyz")

        with override_settings(
            ILYNC_API_TOKEN=expired_token,
            ILYNC_PHONE_NUMBER="9175804320",
            ILYNC_PASSWORD="secure_hero_password"
        ):
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"success": True, "data": {"login_renewed": True}}
            mock_request.return_value = mock_resp

            # Set expired token in cache
            IlyncTokenManager._cached_access_token = expired_token

            res = self.client.get("api/test-endpoint")
            self.assertEqual(res, {"success": True, "data": {"login_renewed": True}})

            # Verify login was called with credentials
            mock_login.assert_called_once_with("9175804320", "secure_hero_password")
            # Verify the request used the brand new token
            sent_headers = mock_request.call_args[1]['headers']
            self.assertEqual(sent_headers['Authorization'], f"Bearer {brand_new_token}")

    # =========================================================================
    # Test D: API returns 401 -> refresh + one retry
    # =========================================================================
    @patch.object(requests.Session, 'request')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_login_api')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_refresh_api')
    def test_d_api_401_triggers_refresh_and_single_retry(self, mock_refresh, mock_login, mock_request):
        now = int(time.time())
        stale_token = generate_jwt(exp_timestamp=now + 5000)
        fresh_token = generate_jwt(exp_timestamp=now + 86400)

        mock_login.return_value = (fresh_token, "fresh_refresh_token")

        # First request returns 401 Unauthorized; second request returns 200 OK
        resp_401 = MagicMock()
        resp_401.status_code = 401

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.json.return_value = {"success": True, "data": "recovered_after_retry"}

        mock_request.side_effect = [resp_401, resp_200]

        with override_settings(
            ILYNC_API_TOKEN=stale_token,
            ILYNC_PHONE_NUMBER="9175804320",
            ILYNC_PASSWORD="secure_hero_password"
        ):
            IlyncTokenManager._cached_access_token = stale_token

            res = self.client.get("api/test-401")
            self.assertEqual(res, {"success": True, "data": "recovered_after_retry"})

            # Verify request was called exactly twice (1 initial + 1 retry)
            self.assertEqual(mock_request.call_count, 2)
            mock_login.assert_called_once()

            # Second call used the fresh token
            second_call_headers = mock_request.call_args_list[1][1]['headers']
            self.assertEqual(second_call_headers['Authorization'], f"Bearer {fresh_token}")

    # =========================================================================
    # Test E: Refresh fails -> controlled failure (no infinite loop)
    # =========================================================================
    @patch.object(requests.Session, 'request')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_login_api')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_refresh_api')
    def test_e_refresh_fails_controlled_error(self, mock_refresh, mock_login, mock_request):
        now = int(time.time())
        stale_token = generate_jwt(exp_timestamp=now + 5000)

        # Login renewal fails
        mock_login.side_effect = IlyncAuthException("Bad credentials")

        resp_401 = MagicMock()
        resp_401.status_code = 401
        mock_request.return_value = resp_401

        with override_settings(
            ILYNC_API_TOKEN=stale_token,
            ILYNC_PHONE_NUMBER="9175804320",
            ILYNC_PASSWORD="wrong_password"
        ):
            IlyncTokenManager._cached_access_token = stale_token

            with self.assertRaises(IlyncAuthException):
                self.client.get("api/test-fail")

            # Should have stopped cleanly after one failure (no infinite loop)
            self.assertEqual(mock_request.call_count, 1)

    # =========================================================================
    # Test F: 20 simultaneous requests with expired token -> exactly ONE auth call
    # =========================================================================
    @patch.object(requests.Session, 'request')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_login_api')
    @patch('apps.integrations.ilync_auth.IlyncTokenManager._call_refresh_api')
    def test_f_concurrent_requests_perform_single_authentication(self, mock_refresh, mock_login, mock_request):
        now = int(time.time())
        expired_token = generate_jwt(exp_timestamp=now - 300)
        fresh_token = generate_jwt(exp_timestamp=now + 86400)

        def slow_login(phone, pwd):
            # Simulate real network latency during login
            time.sleep(0.04)
            return fresh_token, "refresh_123"

        mock_login.side_effect = slow_login

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"success": True, "thread_ok": True}
        mock_request.return_value = mock_resp

        with override_settings(
            ILYNC_API_TOKEN=expired_token,
            ILYNC_PHONE_NUMBER="9175804320",
            ILYNC_PASSWORD="concurrent_password"
        ):
            IlyncTokenManager._cached_access_token = expired_token

            results = []
            errors = []

            def worker():
                try:
                    c = IlyncClient()
                    res = c.get("api/concurrent-test")
                    results.append(res)
                except Exception as ex:
                    errors.append(ex)

            threads = [threading.Thread(target=worker) for _ in range(20)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            # Ensure zero errors across all 20 threads
            self.assertEqual(len(errors), 0)
            self.assertEqual(len(results), 20)

            # CRITICAL VERIFICATION:
            # Login was called EXACTLY ONCE despite 20 concurrent threads!
            self.assertEqual(mock_login.call_count, 1)

    # =========================================================================
    # Test G: Existing iLync modules continue working
    # =========================================================================
    @patch.object(requests.Session, 'request')
    def test_g_existing_ilync_modules_continue_working(self, mock_request):
        now = int(time.time())
        token = generate_jwt(exp_timestamp=now + 7200)

        with override_settings(ILYNC_API_TOKEN=token):
            IlyncTokenManager._cached_access_token = token

            # 1. Vendor list
            mock_vendor_resp = MagicMock()
            mock_vendor_resp.status_code = 200
            mock_vendor_resp.json.return_value = {
                "success": True,
                "content": [{"id": "v1", "name": "Vendor A"}]
            }
            mock_request.return_value = mock_vendor_resp
            vendors = self.client.get_vendors()
            self.assertIn("content", vendors)

            # 2. Vendor detail
            mock_detail_resp = MagicMock()
            mock_detail_resp.status_code = 200
            mock_detail_resp.json.return_value = {
                "success": True,
                "data": {"id": "v1", "name": "Vendor A", "users": []}
            }
            mock_request.return_value = mock_detail_resp
            v_detail = self.client.get_vendor_by_id("v1")
            self.assertEqual(v_detail['data']['id'], "v1")

            # 3. Users list
            mock_users_resp = MagicMock()
            mock_users_resp.status_code = 200
            mock_users_resp.json.return_value = {
                "success": True,
                "data": {"content": [{"id": "u1", "name": "Rakesh"}]}
            }
            mock_request.return_value = mock_users_resp
            users = self.client.get_users()
            self.assertEqual(users['data']['content'][0]['name'], "Rakesh")

            # 4. Tasks
            mock_tasks_resp = MagicMock()
            mock_tasks_resp.status_code = 200
            mock_tasks_resp.json.return_value = {
                "success": True,
                "data": {"content": [{"id": "t1"}]}
            }
            mock_request.return_value = mock_tasks_resp
            tasks = self.client.get_my_tasks()
            self.assertEqual(tasks['data']['content'][0]['id'], "t1")
