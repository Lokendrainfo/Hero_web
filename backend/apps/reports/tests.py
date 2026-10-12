import io
import openpyxl
from django.test import TestCase, RequestFactory
from apps.reports.views import HddShotReportView


class HddShotReportTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.view = HddShotReportView.as_view()

    def test_get_hdd_shots_report_json(self):
        """Tests that GET /api/reports/hdd-shots returns valid JSON and required columns including geography"""
        request = self.factory.get('/api/reports/hdd-shots/?page=1&page_size=10')
        response = self.view(request)
        self.assertEqual(response.status_code, 200)

        data = response.data['data']
        self.assertIn('results', data)
        self.assertIn('pagination', data)
        self.assertIn('summary', data)
        self.assertIn('daily_summary', data)
        self.assertIn('filter_options', data)

        results = data['results']
        if results:
            first = results[0]
            # Required columns validation
            required_fields = [
                'date', 'circle', 'district', 'block',
                'machine_id', 'machine_name', 'chassis_number',
                'shot_id', 'shot_number', 'start_time', 'end_time',
                'shot_meters', 'daily_total_meters', 'daily_shot_count'
            ]
            for field in required_fields:
                self.assertIn(field, first, f"Missing required column: {field}")
            
            # Numeric meter validation
            self.assertIsInstance(first['shot_meters'], (int, float))
            self.assertIsInstance(first['daily_total_meters'], (int, float))
            self.assertIsInstance(first['daily_shot_count'], int)

    def test_chassis_number_filtering(self):
        """Tests filtering by machine chassis number"""
        request = self.factory.get('/api/reports/hdd-shots/?chassis_number=600202608398')
        response = self.view(request)
        self.assertEqual(response.status_code, 200)

        results = response.data['data']['results']
        for r in results:
            self.assertIn('600202608398', str(r['chassis_number']))

    def test_date_range_validation(self):
        """Tests that invalid date parameters return 400 Bad Request"""
        # 1. Invalid date string
        request_invalid = self.factory.get('/api/reports/hdd-shots/?start_date=not-a-date')
        response_invalid = self.view(request_invalid)
        self.assertEqual(response_invalid.status_code, 400)
        self.assertIn("Invalid start_date", response_invalid.data['message'])

        # 2. start_date after end_date
        request_order = self.factory.get('/api/reports/hdd-shots/?start_date=2026-10-15&end_date=2026-10-01')
        response_order = self.view(request_order)
        self.assertEqual(response_order.status_code, 400)
        self.assertIn("cannot be after", response_order.data['message'])

    def test_excel_export_download_with_today_sheet_and_geography(self):
        """Tests Excel export returns a valid 3-sheet .xlsx workbook including Today Report, Circle, District, Block"""
        request = self.factory.get('/api/reports/hdd-shots/?export=excel&start_date=2026-10-01&end_date=2026-10-11')
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        self.assertIn('attachment;', response['Content-Disposition'])

        # Verify openpyxl can read the binary bytes and has 3 sheets
        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        sheet_names = wb.sheetnames
        self.assertIn("HDD Shots", sheet_names)
        self.assertIn("Daily Summary", sheet_names)
        self.assertIn("Today Report", sheet_names)

        # Check headers in HDD Shots
        ws_shots = wb["HDD Shots"]
        headers_shots = [cell.value for cell in ws_shots[4]]
        expected_cols = [
            "Date", "Circle", "District", "Block",
            "Machine ID", "Machine Name/Model", "Chassis Number",
            "Shot ID", "Shot Number", "Start Time", "End Time",
            "Shot Meters", "Daily Total Meters", "Daily Shot Count", "Hero"
        ]
        for col in expected_cols:
            self.assertIn(col, headers_shots)

        # Check headers in Daily Summary
        ws_summary = wb["Daily Summary"]
        sum_headers = [cell.value for cell in ws_summary[4]]
        self.assertIn("Circle", sum_headers)
        self.assertIn("District", sum_headers)
        self.assertIn("Block", sum_headers)
        self.assertIn("Hero", sum_headers)
        self.assertIn("Daily Shot Count", sum_headers)
        self.assertIn("Daily Total Meters", sum_headers)

        # Check Sheet 3: Today Report
        ws_today = wb["Today Report"]
        today_headers = [cell.value for cell in ws_today[4]]
        for col in expected_cols:
            self.assertIn(col, today_headers)

        # Verify that any unfinished/empty end time cell contains 'WIP'
        end_time_col_idx = headers_shots.index("End Time") + 1
        for row_idx in range(5, min(ws_shots.max_row + 1, 30)):
            end_val = ws_shots.cell(row=row_idx, column=end_time_col_idx).value
            self.assertTrue(end_val is not None and str(end_val).strip() != "")
            # Must be either a time string or 'WIP'
            self.assertTrue(str(end_val) == 'WIP' or ':' in str(end_val))

        # Verify all rows in Today Report have valid records and WIP for unfinished shots
        if ws_today.max_row > 4:
            row5_date = ws_today.cell(row=5, column=1).value
            self.assertIsNotNone(row5_date)
            today_end_col_idx = today_headers.index("End Time") + 1
            for row_idx in range(5, min(ws_today.max_row + 1, 20)):
                today_end_val = ws_today.cell(row=row_idx, column=today_end_col_idx).value
                self.assertTrue(today_end_val is not None and str(today_end_val).strip() != "")
                self.assertTrue(str(today_end_val) == 'WIP' or ':' in str(today_end_val))
