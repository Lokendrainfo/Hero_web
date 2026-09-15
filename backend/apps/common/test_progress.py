import unittest
from apps.common.progress import calculate_task_progress, aggregate_hierarchy_progress

class TaskProgressTestCase(unittest.TestCase):
    def test_single_segment_complete(self):
        """TEST 1: One Segment (planned=10, covered=10) -> 100%"""
        res = calculate_task_progress(planned_distance=10, covered_distance=10)
        self.assertEqual(res["progress_percent"], 100.0)
        self.assertEqual(res["planned_distance"], 10.0)
        self.assertEqual(res["covered_distance"], 10.0)

        agg = aggregate_hierarchy_progress([res])
        self.assertEqual(agg["progress_percent"], 100.0)

    def test_two_segments_weighted(self):
        """TEST 2: Seg A (10, 10), Seg B (10, 4.9) -> Seg A=100%, Seg B=49%, Ring=74.5%"""
        seg_a = calculate_task_progress(planned_distance=10, covered_distance=10)
        seg_b = calculate_task_progress(planned_distance=10, covered_distance=4.9)

        self.assertEqual(seg_a["progress_percent"], 100.0)
        self.assertEqual(seg_b["progress_percent"], 49.0)

        ring_agg = aggregate_hierarchy_progress([seg_a, seg_b])
        self.assertEqual(ring_agg["progress_percent"], 74.5)
        self.assertEqual(ring_agg["planned_distance"], 20.0)
        self.assertEqual(ring_agg["covered_distance"], 14.9)

    def test_different_lengths_weighted_vs_average(self):
        """TEST 3: Seg A (5, 5), Seg B (20, 9.8) -> planned=25, covered=14.8, progress=59.2% (NOT simple average 74.5%)"""
        seg_a = calculate_task_progress(planned_distance=5, covered_distance=5)
        seg_b = calculate_task_progress(planned_distance=20, covered_distance=9.8)

        self.assertEqual(seg_a["progress_percent"], 100.0)
        self.assertEqual(seg_b["progress_percent"], 49.0)

        ring_agg = aggregate_hierarchy_progress([seg_a, seg_b])
        self.assertEqual(ring_agg["progress_percent"], 59.2)
        self.assertEqual(ring_agg["planned_distance"], 25.0)
        self.assertEqual(ring_agg["covered_distance"], 14.8)

    def test_no_coverage(self):
        """TEST 4: No coverage (planned=10, covered=0) -> 0%"""
        res = calculate_task_progress(planned_distance=10, covered_distance=0)
        self.assertEqual(res["progress_percent"], 0.0)

    def test_no_planned_distance(self):
        """TEST 5: No planned distance (planned=0) -> 0% (no NaN/Infinity)"""
        res = calculate_task_progress(planned_distance=0, covered_distance=0)
        self.assertEqual(res["progress_percent"], 0.0)
        self.assertEqual(res["remaining_distance"], 0.0)

    def test_vendor_isolation_aggregation(self):
        """TEST 6: Vendor isolation in aggregation"""
        vendor_a_segments = [calculate_task_progress(planned_distance=10, covered_distance=10)]
        vendor_b_segments = [calculate_task_progress(planned_distance=10, covered_distance=0)]

        agg_a = aggregate_hierarchy_progress(vendor_a_segments)
        agg_b = aggregate_hierarchy_progress(vendor_b_segments)

        self.assertEqual(agg_a["progress_percent"], 100.0)
        self.assertEqual(agg_b["progress_percent"], 0.0)


if __name__ == '__main__':
    unittest.main()
