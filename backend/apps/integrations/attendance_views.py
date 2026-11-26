import logging
import requests
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.ttl_cache import ttl_get, ttl_set
from .exceptions import IlyncAPIException, IlyncNotFoundException, IlyncTimeoutException
from .ilync_client import IlyncClient
from .views import IlyncBaseView

logger = logging.getLogger(__name__)

# Only allow query parameters accepted by iLance GET /api/attendance (no HERO-side filters)
_ALLOWED_ATTENDANCE_LIST_PARAMS = (
    'page',
    'size',
    'search',
    'assigneeUserId',
    'onBehalf',
    'submittedByUserId',
    'status',
    'fromDate',
    'toDate',
    'district',
    'block',
)


def _passthrough_response(payload):
    """Returns exact iLance JSON response without modifying keys, values, or nulls."""
    return Response(payload, status=status.HTTP_200_OK)


class IlyncAttendanceListView(IlyncBaseView):
    """
    Read-only proxy for iLance GET /api/attendance.
    Preserves exact upstream JSON structure (success, statusCode, message, data.{content,page}, timestamp).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = {}
        for key in _ALLOWED_ATTENDANCE_LIST_PARAMS:
            val = request.query_params.get(key)
            if val is not None and str(val).strip() != '':
                params[key] = str(val).strip()

        params.setdefault('page', request.query_params.get('page', '0'))
        params.setdefault('size', request.query_params.get('size', '10'))

        client = IlyncClient(request=request)
        raw_payload = client.list_attendances(params=params)
        return _passthrough_response(raw_payload)


class IlyncAttendanceDetailView(IlyncBaseView):
    """
    Read-only proxy for iLance GET /api/attendance/{id}.
    Preserves exact upstream JSON response without modifying any fields.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, attendance_id):
        client = IlyncClient(request=request)
        raw_payload = client.get_attendance_detail(attendance_id)
        return _passthrough_response(raw_payload)


class IlyncAttendancePendingApprovalView(IlyncBaseView):
    """
    Read-only proxy for iLance GET /api/attendance/pending-approval.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        client = IlyncClient(request=request)
        raw_payload = client.get_attendance_pending_approval()
        return _passthrough_response(raw_payload)


class IlyncAttendanceEligibleUsersView(IlyncBaseView):
    """
    Read-only proxy for iLance GET /api/attendance/eligible-users.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        client = IlyncClient(request=request)
        raw_payload = client.get_attendance_eligible_users()
        return _passthrough_response(raw_payload)


class IlyncAttendanceTodayView(IlyncBaseView):
    """
    Read-only proxy for iLance GET /api/attendance/today.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        for_user_id = request.query_params.get('forUserId')
        client = IlyncClient(request=request)
        raw_payload = client.get_attendance_today(for_user_id=for_user_id)
        return _passthrough_response(raw_payload)


class IlyncAttendancePhotoUrlView(IlyncBaseView):
    """
    Read-only proxy for iLance GET /api/attendance/photo-url?attendanceId=...&photoKey=...
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        attendance_id = (request.query_params.get('attendanceId') or '').strip()
        photo_key = (request.query_params.get('photoKey') or '').strip()
        if not attendance_id or not photo_key:
            return Response(
                {"success": False, "message": "Query parameters 'attendanceId' and 'photoKey' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client = IlyncClient(request=request)
        raw_payload = client.get_attendance_photo_url(attendance_id, photo_key)
        return _passthrough_response(raw_payload)


class IlyncAttendancePhotoProxyView(IlyncBaseView):
    """
    Authenticated image proxy for iLance attendance photographs (teamPhoto and machine.photo).
    Resolves view URL via iLance GET /api/attendance/photo-url and streams bytes without
    storing images in HERO PostgreSQL databases or local storage, and without exposing credentials.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        attendance_id = (request.query_params.get('attendanceId') or '').strip()
        photo_key = (request.query_params.get('photoKey') or '').strip()
        if not attendance_id or not photo_key:
            return Response(
                {"success": False, "message": "Query parameters 'attendanceId' and 'photoKey' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cache_key = f"ilync_att_photo:{attendance_id}:{photo_key}"
        signed_url = ttl_get(cache_key)

        if not signed_url:
            client = IlyncClient(request=request)
            res = client.get_attendance_photo_url(attendance_id, photo_key)
            signed_url = res.get('data') if isinstance(res, dict) else None
            if not isinstance(signed_url, str) or not signed_url.startswith(('https://', 'http://')):
                raise IlyncNotFoundException(message="Attendance photograph URL was not returned by iLance.")
            ttl_set(cache_key, signed_url, ttl_seconds=300)

        try:
            img_resp = requests.get(signed_url, timeout=(5.0, 15.0))
        except (requests.exceptions.ConnectTimeout, requests.exceptions.ReadTimeout):
            raise IlyncTimeoutException()
        except requests.exceptions.RequestException:
            raise IlyncAPIException(message="Failed to retrieve attendance photograph from upstream storage.", status_code=502)

        if img_resp.status_code in (401, 403, 404):
            # Signed URL may have expired early; clear short-lived cache and retry once
            ttl_set(cache_key, None, ttl_seconds=1)
            client = IlyncClient(request=request)
            res = client.get_attendance_photo_url(attendance_id, photo_key)
            signed_url = res.get('data') if isinstance(res, dict) else None
            if not isinstance(signed_url, str) or not signed_url.startswith(('https://', 'http://')):
                raise IlyncNotFoundException(message="Attendance photograph not found.")
            ttl_set(cache_key, signed_url, ttl_seconds=300)
            img_resp = requests.get(signed_url, timeout=(5.0, 15.0))

        if img_resp.status_code != 200 or not img_resp.content:
            raise IlyncNotFoundException(message="Attendance photograph could not be loaded.")

        content_type = img_resp.headers.get('Content-Type') or 'image/jpeg'
        response = HttpResponse(img_resp.content, content_type=content_type)
        response['Cache-Control'] = 'private, max-age=300'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

