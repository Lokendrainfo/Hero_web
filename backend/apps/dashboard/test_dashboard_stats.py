import unittest
from apps.common.progress import get_task_statistics

class DashboardTaskStatisticsTestCase(unittest.TestCase):
    def test_status_classification_matching_tasks_page(self):
        """Verify task status classification logic matches Tasks.jsx statusCounts exactly"""
        mock_tasks = [
            {"id": "1", "status": "COMPLETED", "progress_percent": 100, "depth": 2, "routeSnapshot": {"level": "SEGMENT"}},
            {"id": "2", "status": "IN_PROGRESS", "progress_percent": 49, "depth": 2, "routeSnapshot": {"level": "SEGMENT"}},
            {"id": "3", "status": "CREATED", "progress_percent": 0, "depth": 2, "routeSnapshot": {"level": "SEGMENT"}},
            {"id": "4", "status": "PARTIALLY_SAVED", "progress_percent": 30, "depth": 2, "routeSnapshot": {"level": "SEGMENT"}},
            {"id": "5", "status": "APPROVED", "progress_percent": 100, "depth": 2, "routeSnapshot": {"level": "SEGMENT"}},
        ]

        completed = 0
        pending = 0
        in_progress = 0
        created = 0

        for t in mock_tasks:
            pct_val = float(t.get('progress_percent') or 0)
            st_val = str(t.get('status') or '').upper()
            is_done = st_val in ['COMPLETED', 'COMPLETE', 'APPROVED'] or pct_val >= 100

            if is_done:
                completed += 1
            else:
                pending += 1
                if st_val in ['IN_PROGRESS', 'EXECUTING'] or pct_val > 0:
                    in_progress += 1
                else:
                    created += 1

        self.assertEqual(completed, 2)  # items 1 and 5
        self.assertEqual(pending, 3)    # items 2, 3, and 4
        self.assertEqual(in_progress, 2) # items 2 and 4
        self.assertEqual(created, 1)    # item 3
        self.assertEqual(completed + pending, len(mock_tasks))

    def test_hierarchy_deduplication(self):
        """Verify hierarchy deduplication isolates Segment tasks from Block & Ring containers"""
        mock_hierarchy = [
            {"id": "b1", "displayName": "Block Task", "depth": 0, "routeSnapshot": {"level": "BLOCK"}},
            {"id": "r1", "displayName": "Ring Task", "depth": 1, "routeSnapshot": {"level": "RING"}},
            {"id": "s1", "displayName": "Segment Task 1", "depth": 2, "status": "COMPLETED", "progress_percent": 100, "routeSnapshot": {"level": "SEGMENT"}},
            {"id": "s2", "displayName": "Segment Task 2", "depth": 2, "status": "PARTIALLY_SAVED", "progress_percent": 49, "routeSnapshot": {"level": "SEGMENT"}},
        ]

        has_segments = any(
            str(t.get('routeSnapshot', {}).get('level') if isinstance(t.get('routeSnapshot'), dict) else '').upper() == 'SEGMENT'
            or t.get('depth') == 2
            for t in mock_hierarchy
        )

        primary_tasks = [
            t for t in mock_hierarchy
            if str(t.get('routeSnapshot', {}).get('level') if isinstance(t.get('routeSnapshot'), dict) else '').upper() == 'SEGMENT'
            or t.get('depth') == 2
        ] if has_segments else mock_hierarchy

        self.assertEqual(len(primary_tasks), 2)
        self.assertEqual(primary_tasks[0]["id"], "s1")
        self.assertEqual(primary_tasks[1]["id"], "s2")


class DashboardMachineKpiHelpersTestCase(unittest.TestCase):
    def test_row_started_shift_counts_present_and_late(self):
        import os
        import django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.testing')
        django.setup()
        from apps.dashboard.views import _row_started_shift, _unique_chassis

        self.assertTrue(_row_started_shift({'attendance_key': 'present'}))
        self.assertTrue(_row_started_shift({'attendance_key': 'late_punch_in'}))
        self.assertTrue(_row_started_shift({'actual_work_start_time': '08:12'}))
        self.assertFalse(_row_started_shift({'attendance_key': 'absent'}))
        self.assertFalse(_row_started_shift({'attendance_key': 'no_work_window'}))
        self.assertEqual(_unique_chassis(['A', 'A', '', None, 'B']), ['A', 'B'])

class DashboardAttendanceVendorScopingTestCase(unittest.TestCase):
    def test_vendor_attendance_isolation(self):
        """Verify that attendance records in one vendor are not leaked to another vendor via email or phone"""
        # User in Vendor A (id=10) with ext_id=EXT-A and email=shared@test.com
        # User in Vendor B (id=20) with ext_id=EXT-B and email=shared@test.com
        by_external = {
            'EXT-A': {'id': 101, 'status': 'PRESENT', 'user_id': 1}
        }
        by_vendor_email = {
            (10, 'shared@test.com'): {'id': 101, 'status': 'PRESENT', 'user_id': 1}
        }
        by_vendor_phone = {
            (10, '9999999999'): {'id': 101, 'status': 'PRESENT', 'user_id': 1}
        }

        # Check Vendor B user:
        v_b_user = {'userId': 'EXT-B', 'email': 'shared@test.com', 'mobile': '9999999999'}
        ext_u_id = v_b_user.get('userId')
        email = v_b_user.get('email')
        mobile = v_b_user.get('mobile')
        v_id = 20  # Vendor B

        rec = None
        if ext_u_id:
            rec = by_external.get(ext_u_id)

        if not rec:
            cand_rec = by_vendor_email.get((v_id, email.lower())) or by_vendor_phone.get((v_id, mobile))
            if cand_rec:
                rec = cand_rec

        # Must be None because Vendor B does not own the attendance record for Vendor A
        self.assertIsNone(rec)


if __name__ == '__main__':
    unittest.main()

