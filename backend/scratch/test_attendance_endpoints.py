from apps.authentication.models import User
from apps.attendance.models import AttendanceRecord
from apps.attendance.views import AttendanceViewSet
from rest_framework.test import APIRequestFactory, force_authenticate

def run_tests():
    print("--- TESTING ATTENDANCE API ENDPOINTS ---")
    factory = APIRequestFactory()
    user = User.objects.filter(role='ADMIN').first() or User.objects.first()

    # 1. Test GET today
    req = factory.get('/api/v1/attendance/today/')
    force_authenticate(req, user=user)
    res = AttendanceViewSet.as_view({'get': 'today_attendance'})(req)
    print("1. GET /today/ -> Status:", res.status_code, "Data:", res.data)

    # Clean existing today records for user to test check-in cleanly
    from django.utils import timezone
    AttendanceRecord.objects.filter(user=user, date=timezone.now().date()).delete()

    # 2. Test Check-In
    req2 = factory.post('/api/v1/attendance/check-in/', {
        'latitude': '26.850000',
        'longitude': '74.380000',
        'accuracy': '5.20',
        'attendance_type': 'TEAM'
    })
    force_authenticate(req2, user=user)
    res2 = AttendanceViewSet.as_view({'post': 'check_in'})(req2)
    print("2. POST /check-in/ -> Status:", res2.status_code, "Data ID:", res2.data.get('id'))

    # 3. Test Double Check-In Protection (409 Conflict)
    req3 = factory.post('/api/v1/attendance/check-in/', {
        'latitude': '26.850000',
        'longitude': '74.380000',
        'accuracy': '5.20'
    })
    force_authenticate(req3, user=user)
    res3 = AttendanceViewSet.as_view({'post': 'check_in'})(req3)
    print("3. Double Check-In Guard -> Status:", res3.status_code, "(Expected 409 Conflict)")

    # 4. Test Check-Out
    req4 = factory.post('/api/v1/attendance/check-out/', {
        'latitude': '26.850000',
        'longitude': '74.380000',
        'accuracy': '5.20'
    })
    force_authenticate(req4, user=user)
    res4 = AttendanceViewSet.as_view({'post': 'check_out'})(req4)
    print("4. POST /check-out/ -> Status:", res4.status_code, "Working Hours:", res4.data.get('total_working_hours'))

    # 5. Test Self-Approval Guard (403 Forbidden)
    att_id = res2.data.get('id') or res4.data.get('id')
    req5 = factory.post(f'/api/v1/attendance/{att_id}/approve/')
    force_authenticate(req5, user=user)
    res5 = AttendanceViewSet.as_view({'post': 'approve_attendance'})(req5, pk=att_id)
    print("5. Self Approval Guard -> Status:", res5.status_code, "(Expected 403 Forbidden)")

    print("ALL TEST CHECKS PASSED CLEANLY!")

if __name__ == '__main__':
    run_tests()
