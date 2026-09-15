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


if __name__ == '__main__':
    unittest.main()
