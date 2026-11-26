from unittest.mock import MagicMock, patch
import requests
from django.test import TestCase
from rest_framework.test import APIClient

from apps.attendance.models import AttendanceRecord
from apps.authentication.models import User


SAMPLE_RECORD = {
    "id": "att-1001",
    "attendanceDate": "2026-11-25",
    "locationCode": "LOC-RJ-001",
    "locationSnapshot": {
        "enterpriseId": "ent-1",
        "company": "Hero Infra",
        "locationCode": "LOC-RJ-001",
        "locationName": "Anupgarh GP",
        "district": "Anupgarh",
        "circle": "Rajasthan",
        "blockName": "Anupgarh",
        "blockId": "blk-1",
        "oltIp": None,
        "latitude": 29.19,
        "longitude": 73.21,
        "projectPhase": "Phase-III",
        "baCmp": None,
    },
    "assigneeUserId": "u-501",
    "assigneeSnapshot": {
        "userId": "u-501",
        "name": "Ravi Operator",
        "mobile": "9999999991",
        "designation": "HDD Operator",
    },
    "submittedByUserId": "u-502",
    "submittedBySnapshot": {
        "userId": "u-502",
        "name": "Anil Supervisor",
        "mobile": "9999999992",
        "designation": "Field Engineer",
    },
    "onBehalf": True,
    "onBehalfReason": "Operator phone battery low",
    "personalMark": "PRESENT",
    "absenceReason": None,
    "status": "SUBMITTED",
    "teamPhoto": {
        "photoKey": "attendance/u-501/2026-11-25/team-abc.jpg",
        "photoCapturedAt": "2026-11-25T09:15:00Z",
        "cameraLive": True,
        "latitude": 29.19123,
        "longitude": 73.21456,
        "accuracyMeters": 11.4,
        "fixCapturedAt": "2026-11-25T09:14:58Z",
        "provider": "fused",
        "mockLocationFlagged": False,
        "geoVerdict": "INSIDE",
        "distanceFromTaskMeters": 42.0,
        "geoCheckedAgainst": "Anupgarh GP",
        "geoCheckedAt": "2026-11-25T09:15:02Z",
    },
    "machine": {
        "name": "A600 HDD (8401)",
        "photo": {
            "photoKey": "attendance/u-501/2026-11-25/machine-xyz.jpg",
            "photoCapturedAt": "2026-11-25T09:16:00Z",
            "cameraLive": True,
            "latitude": 29.19130,
            "longitude": 73.21460,
            "accuracyMeters": 12.0,
            "fixCapturedAt": "2026-11-25T09:15:59Z",
            "provider": "gps",
            "mockLocationFlagged": False,
            "geoVerdict": "INSIDE",
        },
    },
    "approverUserIds": ["u-601"],
    "approverCandidateIds": None,
    "approverSnapshots": [{"userId": "u-601", "name": "Vikram Manager", "designation": "Area Manager"}],
    "approvalSteps": [
        {
            "order": 1,
            "userId": "u-601",
            "empId": "EMP-601",
            "name": "Vikram Manager",
            "designation": "Area Manager",
            "via": "PROJECT_HIERARCHY",
            "status": "PENDING",
            "actedAt": None,
            "remarks": None,
            "candidateUserIds": None,
            "candidateNames": None,
            "foundAt": "Rajasthan",
            "anyOne": False,
            "actedByUserId": None,
            "actedByName": None,
        }
    ],
    "currentApprovalStepIndex": 0,
    "rejectionReason": None,
    "approverRemarks": None,
    "resubmitCount": 0,
    "manDays": 1.0,
    "clientAttendanceId": "cli-1001",
    "remarks": "All crew present at site",
    "createdAt": "2026-11-25T09:16:10Z",
    "updatedAt": "2026-11-25T09:16:10Z",
    "submittedAt": "2026-11-25T09:16:10Z",
    "approvedAt": None,
    "version": 1,
    "ageHours": 2.5,
}

SAMPLE_RECORD_NO_MACHINE = {
    **SAMPLE_RECORD,
    "id": "att-1002",
    "onBehalf": False,
    "onBehalfReason": None,
    "machine": None,
    "status": "APPROVED",
}


class IlyncAttendanceReadOnlyIntegrationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='hero_viewer',
            password='Password123!',
            role='VENDOR',
            is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.anon_client = APIClient()

    def test_requires_authentication(self):
        for url in (
            '/api/v1/integrations/attendance/',
            '/api/v1/integrations/attendance/pending-approval/',
            '/api/v1/integrations/attendance/eligible-users/',
            '/api/v1/integrations/attendance/today/',
            '/api/v1/integrations/attendance/photo-url/?attendanceId=1&photoKey=k',
            '/api/v1/integrations/attendance/photo/?attendanceId=1&photoKey=k',
            '/api/v1/integrations/attendance/att-1001/',
        ):
            res = self.anon_client.get(url)
            self.assertIn(res.status_code, (401, 403), f"Expected auth failure on {url}")

    def test_strictly_read_only_methods_rejected(self):
        for method in ('post', 'put', 'patch', 'delete'):
            res = getattr(self.client, method)('/api/v1/integrations/attendance/', data={})
            self.assertEqual(res.status_code, 405)

    @patch('apps.integrations.attendance_views.IlyncClient.list_attendances')
    def test_list_preserves_exact_ilance_json_and_zero_db_storage(self, mock_list):
        exact_payload = {
            "success": True,
            "statusCode": 200,
            "message": "Attendance.",
            "data": {
                "content": [SAMPLE_RECORD, SAMPLE_RECORD_NO_MACHINE],
                "page": {
                    "size": 10,
                    "number": 0,
                    "totalElements": 2,
                    "totalPages": 1,
                },
            },
            "timestamp": "2026-11-25T11:20:00Z",
        }
        mock_list.return_value = exact_payload

        res = self.client.get('/api/v1/integrations/attendance/?page=0&size=10&status=SUBMITTED&fromDate=2026-11-01')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), exact_payload)
        mock_list.assert_called_once_with(
            params={'page': '0', 'size': '10', 'status': 'SUBMITTED', 'fromDate': '2026-11-01'}
        )
        # Zero records persisted in HERO AttendanceRecord table
        self.assertEqual(AttendanceRecord.objects.count(), 0)

    @patch('apps.integrations.attendance_views.IlyncClient.get_attendance_detail')
    @patch('apps.integrations.attendance_views.IlyncClient.get_attendance_pending_approval')
    @patch('apps.integrations.attendance_views.IlyncClient.get_attendance_eligible_users')
    @patch('apps.integrations.attendance_views.IlyncClient.get_attendance_today')
    def test_detail_pending_eligible_today_passthrough(
        self, mock_today, mock_eligible, mock_pending, mock_detail
    ):
        detail_payload = {"success": True, "statusCode": 200, "message": "Attendance.", "data": SAMPLE_RECORD, "timestamp": "t1"}
        pending_payload = {"success": True, "statusCode": 200, "message": "Pending approval.", "data": [SAMPLE_RECORD], "timestamp": "t2"}
        eligible_payload = {"success": True, "statusCode": 200, "message": "Users you can file attendance for.", "data": [{"userId": "u-501", "name": "Ravi Operator"}], "timestamp": "t3"}
        today_payload = {"success": True, "statusCode": 200, "message": "Today's attendance.", "data": SAMPLE_RECORD_NO_MACHINE, "timestamp": "t4"}

        mock_detail.return_value = detail_payload
        mock_pending.return_value = pending_payload
        mock_eligible.return_value = eligible_payload
        mock_today.return_value = today_payload

        self.assertEqual(self.client.get('/api/v1/integrations/attendance/att-1001/').json(), detail_payload)
        self.assertEqual(self.client.get('/api/v1/integrations/attendance/pending-approval/').json(), pending_payload)
        self.assertEqual(self.client.get('/api/v1/integrations/attendance/eligible-users/').json(), eligible_payload)
        self.assertEqual(self.client.get('/api/v1/integrations/attendance/today/?forUserId=u-501').json(), today_payload)
        mock_today.assert_called_once_with(for_user_id='u-501')

    @patch('apps.integrations.attendance_views.requests.get')
    @patch('apps.integrations.attendance_views.IlyncClient.get_attendance_photo_url')
    def test_photo_proxy_streams_binary_without_saving_to_db(self, mock_photo_url, mock_http_get):
        mock_photo_url.return_value = {
            "success": True,
            "statusCode": 200,
            "data": "https://cdn.example.invalid/signed/photo.jpg?sig=secret",
            "timestamp": "t5",
        }
        img_resp = MagicMock()
        img_resp.status_code = 200
        img_resp.content = b'\xff\xd8\xff\xe0fake-jpeg-bytes'
        img_resp.headers = {'Content-Type': 'image/jpeg'}
        mock_http_get.return_value = img_resp

        res = self.client.get(
            '/api/v1/integrations/attendance/photo/?attendanceId=att-1001&photoKey=attendance/u-501/2026-11-25/team-abc.jpg'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'image/jpeg')
        self.assertEqual(res.content, b'\xff\xd8\xff\xe0fake-jpeg-bytes')
        self.assertEqual(AttendanceRecord.objects.count(), 0)

        # Missing parameters rejected with 400
        bad = self.client.get('/api/v1/integrations/attendance/photo/')
        self.assertEqual(bad.status_code, 400)

