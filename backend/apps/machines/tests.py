from django.test import TestCase, Client
from apps.machines.models import Machine
from apps.vendors.models import Vendor
import json


class MachineHddMetricsApiTestCase(TestCase):
    def setUp(self):
        from apps.common.ttl_cache import ttl_delete
        from apps.machines.hdd_shots import DAILY_METRICS_CACHE_KEY
        ttl_delete(DAILY_METRICS_CACHE_KEY)
        self.client = Client()
        self.vendor = Vendor.objects.create(name="Test Partner", code="TP-01")
        self.machine = Machine.objects.create(
            vendor=self.vendor,
            name="A600 HDD (8401)",
            serial_number="600202608401",
            machine_chassis_no="600202608401",
            category="HDD"
        )

    def tearDown(self):
        from apps.common.ttl_cache import ttl_delete
        from apps.machines.hdd_shots import DAILY_METRICS_CACHE_KEY
        ttl_delete(DAILY_METRICS_CACHE_KEY)


    def test_get_hdd_metrics_by_query_param(self):
        url = f"/api/machines/hdd-metrics?chassis_number={self.machine.machine_chassis_no}&start_date=2026-10-01&end_date=2026-10-10"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        records = data.get("data", [])
        self.assertIsInstance(records, list)
        if records:
            first = records[0]
            self.assertEqual(first["chassis_number"], self.machine.machine_chassis_no)
            self.assertIn("date", first)
            self.assertIn("hdd_shot_count", first)
            self.assertIn("hdd_shot_meters", first)
            self.assertIn("machine_id", first)
            self.assertEqual(first["machine_id"], self.machine.id)

    def test_get_hdd_metrics_no_trailing_slash(self):
        url = f"/api/machines/hdd-metrics?chassis_number={self.machine.machine_chassis_no}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_get_hdd_metrics_with_trailing_slash(self):
        url = f"/api/machines/hdd-metrics/?chassis_number={self.machine.machine_chassis_no}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_get_hdd_metrics_api_v1(self):
        url = f"/api/v1/machines/hdd-metrics?chassis_number={self.machine.machine_chassis_no}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_get_hdd_metrics_by_path_param(self):
        url = f"/api/machines/hdd-metrics/{self.machine.machine_chassis_no}/?start_date=2026-10-01&end_date=2026-10-05"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))

    def test_get_hdd_metrics_by_machine_id(self):
        url = f"/api/machines/hdd-metrics?machine_id={self.machine.id}&start_date=2026-10-01&end_date=2026-10-05"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))

    def test_get_hdd_metrics_invalid_chassis(self):
        url = "/api/machines/hdd-metrics?chassis_number=CHS_NON_EXISTENT_99999"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertFalse(data.get("success"))
        self.assertIn("Invalid chassis number", data.get("message"))

    def test_get_hdd_metrics_no_records_in_date_range(self):
        url = f"/api/machines/hdd-metrics?chassis_number={self.machine.machine_chassis_no}&start_date=2099-01-01&end_date=2099-01-10"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(len(data.get("data", [])), 0)

    def test_get_hdd_metrics_invalid_date_format(self):
        url = f"/api/machines/hdd-metrics?chassis_number={self.machine.machine_chassis_no}&start_date=2026-99-99"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertFalse(data.get("success"))

    def test_get_hdd_metrics_reversed_dates(self):
        url = f"/api/machines/hdd-metrics?chassis_number={self.machine.machine_chassis_no}&start_date=2026-10-10&end_date=2026-10-01"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertFalse(data.get("success"))
        self.assertIn("cannot be after", data.get("message"))

    def test_post_hdd_metrics(self):
        payload = {
            "chassis_number": self.machine.machine_chassis_no,
            "start_date": "2026-10-01",
            "end_date": "2026-10-05"
        }
        response = self.client.post(
            "/api/machines/hdd-metrics",
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))

    def test_completed_shot_filtering_rules(self):
        from apps.machines.hdd_shots import is_shot_completed

        # Criterion 1: valid start and end times included
        valid_shot = {
            "hddStartTime": "14-10-2026 09:00:00",
            "hddEndTime": "14-10-2026 09:15:00",
            "tentativeShotLength": 60.0
        }
        is_valid, s_dt, e_dt = is_shot_completed(valid_shot)
        self.assertTrue(is_valid)
        self.assertEqual(s_dt.strftime('%Y-%m-%dT%H:%M:%S'), "2026-10-14T09:00:00")
        self.assertEqual(e_dt.strftime('%Y-%m-%dT%H:%M:%S'), "2026-10-14T09:15:00")

        # Criterion 2: start time but no end time excluded
        incomplete_shot = {
            "hddStartTime": "14-10-2026 09:00:00",
            "hddEndTime": None,
            "tentativeShotLength": 60.0
        }
        is_valid, _, _ = is_shot_completed(incomplete_shot)
        self.assertFalse(is_valid)

        # Empty string end time excluded
        empty_end_shot = {
            "hddStartTime": "14-10-2026 09:00:00",
            "hddEndTime": "",
            "tentativeShotLength": 60.0
        }
        is_valid, _, _ = is_shot_completed(empty_end_shot)
        self.assertFalse(is_valid)

        # WIP string end time excluded
        wip_end_shot = {
            "hddStartTime": "14-10-2026 09:00:00",
            "hddEndTime": "WIP",
            "tentativeShotLength": 60.0
        }
        is_valid, _, _ = is_shot_completed(wip_end_shot)
        self.assertFalse(is_valid)

        # Criterion 3: in-progress shot excluded even if partial meters recorded
        inprogress_shot = {
            "hddStartTime": "14-10-2026 09:00:00",
            "hddEndTime": "14-10-2026 09:15:00",
            "taskStage": "IN_PROGRESS",
            "tentativeShotLength": 60.0
        }
        is_valid, _, _ = is_shot_completed(inprogress_shot)
        self.assertFalse(is_valid)

        # End time earlier than start time excluded
        reversed_time_shot = {
            "hddStartTime": "14-10-2026 09:30:00",
            "hddEndTime": "14-10-2026 09:15:00",
            "tentativeShotLength": 60.0
        }
        is_valid, _, _ = is_shot_completed(reversed_time_shot)
        self.assertFalse(is_valid)

    def test_daily_metrics_response_shots_array_and_totals(self):
        url = f"/api/machines/hdd-metrics?chassis_number={self.machine.machine_chassis_no}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        records = data.get("data", [])
        for rec in records:
            self.assertIn("shots", rec)
            self.assertIsInstance(rec["shots"], list)
            # Daily shot count must match length of completed shots
            self.assertEqual(rec["hdd_shot_count"], len(rec["shots"]))
            # Daily shot meters must match sum of individual shot meters
            sum_meters = round(sum(s.get("shot_meters", 0.0) for s in rec["shots"]), 2)
            self.assertAlmostEqual(rec["hdd_shot_meters"], sum_meters, places=2)
            for s in rec["shots"]:
                self.assertIn("shot_id", s)
                self.assertIn("start_time", s)
                self.assertIn("end_time", s)
                self.assertIn("shot_meters", s)
                # End time must not be earlier than start time
                self.assertGreaterEqual(s["end_time"], s["start_time"])
