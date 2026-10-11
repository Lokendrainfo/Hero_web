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
