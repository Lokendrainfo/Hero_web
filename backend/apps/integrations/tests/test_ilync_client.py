from unittest.mock import patch, MagicMock
from django.test import TestCase
import requests
from apps.integrations.ilync_client import IlyncClient
from apps.integrations.exceptions import (
    IlyncAPIException,
    IlyncAuthException,
    IlyncTimeoutException,
    IlyncNotFoundException
)

class IlyncClientTestCase(TestCase):
    def setUp(self):
        self.client = IlyncClient()

    @patch.object(requests.Session, 'request')
    def test_get_vendors_success(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "success": True,
            "content": [{"id": "v101", "name": "Apex Vendor"}],
            "totalElements": 1,
            "totalPages": 1
        }
        mock_request.return_value = mock_resp

        res = self.client.get_vendors(page=0, size=10)
        self.assertEqual(len(res['content']), 1)
        self.assertEqual(res['content'][0]['name'], "Apex Vendor")
        mock_request.assert_called_once()

    @patch.object(requests.Session, 'request')
    def test_get_vendor_by_id_success(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"id": "v101", "name": "Apex Vendor"}
        mock_request.return_value = mock_resp

        res = self.client.get_vendor_by_id("v101")
        self.assertEqual(res['id'], "v101")
        self.assertEqual(res['name'], "Apex Vendor")

    @patch.object(requests.Session, 'request')
    def test_get_users_success(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "content": [{"id": 1, "username": "admin_user"}],
            "totalElements": 1
        }
        mock_request.return_value = mock_resp

        res = self.client.get_users(page=0, size=10)
        self.assertEqual(res['content'][0]['username'], "admin_user")

    @patch.object(requests.Session, 'request')
    def test_stock_issue_search_success(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"issues": [{"issueId": "ISS-1"}]}
        mock_request.return_value = mock_resp

        res = self.client.search_stock_issues({"query": "fluid"})
        self.assertEqual(res['issues'][0]['issueId'], "ISS-1")

    @patch.object(requests.Session, 'request')
    def test_stock_balance_search_success(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"balances": [{"itemId": "STK-1"}]}
        mock_request.return_value = mock_resp

        res = self.client.search_stock_balance({"query": ""})
        self.assertEqual(res['balances'][0]['itemId'], "STK-1")

    @patch.object(requests.Session, 'request')
    def test_stock_items_search_success(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"items": [{"id": "STK-1"}]}
        mock_request.return_value = mock_resp

        res = self.client.search_stock_items({"query": ""})
        self.assertEqual(res['items'][0]['id'], "STK-1")

    @patch.object(requests.Session, 'request')
    def test_401_authentication_error(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_request.return_value = mock_resp

        with self.assertRaises(IlyncAuthException):
            self.client.get_vendors()

    @patch.object(requests.Session, 'request')
    def test_404_not_found_error(self, mock_request):
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_request.return_value = mock_resp

        with self.assertRaises(IlyncNotFoundException):
            self.client.get_vendor_by_id("nonexistent")

    @patch.object(requests.Session, 'request')
    def test_timeout_error(self, mock_request):
        mock_request.side_effect = requests.exceptions.ConnectTimeout()

        with self.assertRaises(IlyncTimeoutException):
            self.client.get_vendors()
