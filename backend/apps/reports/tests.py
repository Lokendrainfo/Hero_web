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
        """Tests Excel export returns a valid 4-sheet .xlsx workbook including Today's Shots, All Historical Shots, Summary, Daily Summary"""
        request = self.factory.get('/api/reports/hdd-shots/?export=excel&start_date=2026-10-01&end_date=2026-10-11')
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        self.assertIn('attachment;', response['Content-Disposition'])

        # Verify openpyxl can read the binary bytes and has 4 sheets
        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        sheet_names = wb.sheetnames
        self.assertIn("Today's Shots", sheet_names)
        self.assertIn("All Historical Shots", sheet_names)
        self.assertIn("Summary", sheet_names)
        self.assertIn("Daily Summary", sheet_names)

        # Check headers in All Historical Shots
        ws_shots = wb["All Historical Shots"]
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

        # Check Sheet 1: Today's Shots
        ws_today = wb["Today's Shots"]
        today_headers = [cell.value for cell in ws_today[4]]
        for col in expected_cols:
            self.assertIn(col, today_headers)

        # Check Sheet 3: Summary (Execution Report)
        ws_exec_summary = wb["Summary"]
        cat_headers = [ws_exec_summary.cell(row=4, column=c).value for c in [1, 2, 3, 4, 9, 11, 13, 15, 23]]
        self.assertIn("Block", cat_headers)
        self.assertIn("Machine", cat_headers)
        self.assertIn("Partner", cat_headers)
        self.assertIn("PTD", cat_headers)
        self.assertIn("Previous Month", cat_headers)
        self.assertIn("MTD", cat_headers)
        self.assertIn("Previous Week", cat_headers)
        self.assertIn("For the week", cat_headers)
        self.assertIn("Delta", cat_headers)

        # Check subheaders
        sub_headers = [ws_exec_summary.cell(row=5, column=c).value for c in range(4, 25)]
        self.assertIn("Production Start", sub_headers)
        self.assertIn("PTD End", sub_headers)
        self.assertIn("PTD Days", sub_headers)
        self.assertIn("Total", sub_headers)
        self.assertIn("Per Day", sub_headers)
        self.assertIn("Average", sub_headers)
        self.assertIn("Previous week", sub_headers)
        self.assertIn("MTD", sub_headers)

        # Verify that any unfinished/empty end time cell contains 'WIP'
        end_time_col_idx = headers_shots.index("End Time") + 1
        for row_idx in range(5, min(ws_shots.max_row + 1, 30)):
            end_val = ws_shots.cell(row=row_idx, column=end_time_col_idx).value
            self.assertTrue(end_val is not None and str(end_val).strip() != "")
            self.assertTrue(str(end_val) == 'WIP' or ':' in str(end_val))

        # Verify all rows in Today's Shots have valid records and WIP for unfinished shots
        if ws_today.max_row > 4:
            row5_date = ws_today.cell(row=5, column=1).value
            self.assertIsNotNone(row5_date)
            today_end_col_idx = today_headers.index("End Time") + 1
            for row_idx in range(5, min(ws_today.max_row, 20)):
                today_end_val = ws_today.cell(row=row_idx, column=today_end_col_idx).value
                self.assertTrue(today_end_val is not None and str(today_end_val).strip() != "")
                self.assertTrue(str(today_end_val) == 'WIP' or ':' in str(today_end_val))

    def test_date_logic_first_and_last_day_of_month(self):
        """Tests reporting boundaries for first and last day of a month"""
        from apps.reports.services import compute_reporting_date_ranges
        
        # 1. First day of October 2026 (Thursday)
        r_first = compute_reporting_date_ranges('2026-10-01')
        self.assertEqual(r_first['mtd']['days'], 1)
        self.assertEqual(r_first['mtd']['start_str'], '2026-10-01')
        self.assertEqual(r_first['mtd']['end_str'], '2026-10-01')
        self.assertEqual(r_first['prev_month']['start_str'], '2026-09-01')
        self.assertEqual(r_first['prev_month']['end_str'], '2026-09-30')
        self.assertEqual(r_first['prev_month']['days'], 30)
        self.assertEqual(r_first['prev_week']['start_str'], '2026-09-21')
        self.assertEqual(r_first['prev_week']['end_str'], '2026-09-27')
        self.assertEqual(r_first['current_week']['elapsed_days'], 4)  # Mon-Thu

        # 2. Last day of October 2026 (Saturday)
        r_last = compute_reporting_date_ranges('2026-10-31')
        self.assertEqual(r_last['mtd']['days'], 31)
        self.assertEqual(r_last['mtd']['start_str'], '2026-10-01')
        self.assertEqual(r_last['mtd']['end_str'], '2026-10-31')
        self.assertEqual(r_last['prev_month']['days'], 30)  # September
        self.assertEqual(r_last['current_week']['elapsed_days'], 6)  # Mon-Sat

    def test_date_logic_february_leap_and_non_leap(self):
        """Tests February calendar days in leap and non-leap years"""
        from apps.reports.services import compute_reporting_date_ranges
        
        # Leap year: 2024-02-29
        r_leap = compute_reporting_date_ranges('2024-02-29', project_start_date='2024-02-01')
        self.assertEqual(r_leap['mtd']['days'], 29)
        self.assertEqual(r_leap['prev_month']['days'], 31)  # January

        # Non-leap year: 2026-02-28
        r_non_leap = compute_reporting_date_ranges('2026-02-28', project_start_date='2026-02-01')
        self.assertEqual(r_non_leap['mtd']['days'], 28)
        self.assertEqual(r_non_leap['prev_month']['days'], 31)

    def test_date_logic_monday_sunday_and_midweek(self):
        """Tests exact previous week and current week behavior for Monday, Sunday, and mid-week"""
        from apps.reports.services import compute_reporting_date_ranges
        
        # 1. Selected Monday: 2026-10-19
        r_mon = compute_reporting_date_ranges('2026-10-19')
        self.assertEqual(r_mon['current_week']['start_str'], '2026-10-19')
        self.assertEqual(r_mon['current_week']['end_str'], '2026-10-25')
        self.assertEqual(r_mon['current_week']['elapsed_days'], 1)  # Monday only
        self.assertEqual(r_mon['prev_week']['start_str'], '2026-10-12')
        self.assertEqual(r_mon['prev_week']['end_str'], '2026-10-18')

        # 2. Selected Sunday: 2026-10-25
        r_sun = compute_reporting_date_ranges('2026-10-25')
        self.assertEqual(r_sun['current_week']['start_str'], '2026-10-19')
        self.assertEqual(r_sun['current_week']['end_str'], '2026-10-25')
        self.assertEqual(r_sun['current_week']['elapsed_days'], 7)  # All 7 days
        self.assertEqual(r_sun['prev_week']['start_str'], '2026-10-12')
        self.assertEqual(r_sun['prev_week']['end_str'], '2026-10-18')

        # 3. Selected Friday (mid-week): 2026-10-23 (Example from prompt Section 3)
        r_fri = compute_reporting_date_ranges('2026-10-23', project_start_date='2026-09-25')
        self.assertEqual(r_fri['ptd']['days'], 29)
        self.assertEqual(r_fri['ptd']['start_str'], '2026-09-25')
        self.assertEqual(r_fri['ptd']['end_str'], '2026-10-23')
        self.assertEqual(r_fri['prev_month']['days'], 30)
        self.assertEqual(r_fri['prev_month']['start_str'], '2026-09-01')
        self.assertEqual(r_fri['prev_month']['end_str'], '2026-09-30')
        self.assertEqual(r_fri['mtd']['days'], 23)
        self.assertEqual(r_fri['mtd']['start_str'], '2026-10-01')
        self.assertEqual(r_fri['mtd']['end_str'], '2026-10-23')
        self.assertEqual(r_fri['prev_week']['start_str'], '2026-10-12')
        self.assertEqual(r_fri['prev_week']['end_str'], '2026-10-18')
        self.assertEqual(r_fri['current_week']['elapsed_days'], 5)

    def test_date_logic_project_start_date_later_than_month_start(self):
        """Tests PTD calculation when project start date is mid-month"""
        from apps.reports.services import compute_reporting_date_ranges
        
        # Configured start date 2026-10-10, selected date 2026-10-23
        r = compute_reporting_date_ranges('2026-10-23', project_start_date='2026-10-10')
        self.assertEqual(r['ptd']['days'], 14)  # 10 to 23 inclusive is 14 days
        self.assertEqual(r['ptd']['start_str'], '2026-10-10')
        self.assertEqual(r['ptd']['end_str'], '2026-10-23')

    def test_machine_with_zero_production_and_deltas(self):
        """Tests that a machine with zero production handles averages and deltas without division by zero"""
        from apps.reports.services import compute_execution_report_summary
        
        dummy_machine = [{'chassis_number': 'ZERO-MAC-01', 'machine_id': 'MAC-0', 'machine_name': 'Zero Unit', 'vendor_name': 'Zero Partner', 'block': 'TEST'}]
        summary = compute_execution_report_summary(
            all_matching_shots=[],
            machines_catalog=dummy_machine,
            selected_report_date='2026-10-23'
        )
        self.assertEqual(len(summary['rows']), 1)
        row = summary['rows'][0]
        self.assertEqual(row['ptd_total'], 0.0)
        self.assertEqual(row['ptd_per_day'], 0.0)
        self.assertEqual(row['prev_month_total'], 0.0)
        self.assertEqual(row['prev_month_per_day'], 0.0)
        self.assertEqual(row['mtd_total'], 0.0)
        self.assertEqual(row['mtd_per_day'], 0.0)
        self.assertEqual(row['prev_week_total'], 0.0)
        self.assertEqual(row['prev_week_per_day'], 0.0)
        self.assertEqual(row['current_week_average'], 0.0)
        self.assertEqual(row['prev_week_delta'], 0.0)
        self.assertIsNone(row['prev_week_change_pct'])  # Handled safely, not ZeroDivisionError
        self.assertEqual(row['mtd_delta'], 0.0)
        self.assertIsNone(row['mtd_change_pct'])

    def test_execution_summary_reconciles_with_portal_api(self):
        """Tests that GET /api/reports/hdd-shots/ returns execution_summary with all required fields"""
        request = self.factory.get('/api/reports/hdd-shots/?end_date=2026-10-23')
        response = self.view(request)
        self.assertEqual(response.status_code, 200)

        data = response.data['data']
        self.assertIn('execution_summary', data)
        exec_sum = data['execution_summary']
        self.assertIn('reporting_date', exec_sum)
        self.assertIn('bounds', exec_sum)
        self.assertIn('week_days', exec_sum)
        self.assertIn('rows', exec_sum)
        self.assertIn('totals', exec_sum)

        # Verify week_days has 7 days
        self.assertEqual(len(exec_sum['week_days']), 7)
        # Verify totals row has required keys
        tot = exec_sum['totals']
        for k in ['ptd_total', 'ptd_per_day', 'prev_month_total', 'prev_month_per_day', 'mtd_total', 'mtd_per_day', 'prev_week_total', 'prev_week_per_day', 'current_week_average', 'prev_week_delta', 'mtd_delta']:
            self.assertIn(k, tot)

    def test_machine_specific_ptd_calculation_with_different_start_dates(self):
        """
        Acceptance Test 1 & 2:
        - Two machines with different production start dates show different PTD day counts.
        - PTD Total and PTD Per Day use the correct machine-specific period.
        Example from prompt Section 2:
        Machine A: start 2026-09-25, report date 2026-10-23 -> 29 PTD days.
        Machine B: start 2026-10-10, report date 2026-10-23 -> 14 PTD days.
        Machine C: start 2026-10-19, report date 2026-10-23 -> 5 PTD days.
        """
        from apps.reports.services import compute_execution_report_summary

        catalog = [
            {'chassis_number': 'MACH-A', 'machine_id': 'MAC-A', 'machine_name': 'Unit A', 'vendor_name': 'Partner A', 'block': 'Block 1', 'production_start_date': '2026-09-25'},
            {'chassis_number': 'MACH-B', 'machine_id': 'MAC-B', 'machine_name': 'Unit B', 'vendor_name': 'Partner B', 'block': 'Block 2', 'production_start_date': '2026-10-10'},
            {'chassis_number': 'MACH-C', 'machine_id': 'MAC-C', 'machine_name': 'Unit C', 'vendor_name': 'Partner C', 'block': 'Block 3', 'production_start_date': '2026-10-19'},
        ]

        shots = [
            # Machine A: 11628.99 meters
            {'chassis_number': 'MACH-A', 'machine_id': 'MAC-A', 'vendor_name': 'Partner A', 'block': 'Block 1', 'status': 'COMPLETED', 'start_time': '09:00:00', 'end_time': '10:00:00', 'date': '2026-09-25', 'shot_meters': 11628.99},
            # Machine B: 4200.00 meters
            {'chassis_number': 'MACH-B', 'machine_id': 'MAC-B', 'vendor_name': 'Partner B', 'block': 'Block 2', 'status': 'COMPLETED', 'start_time': '09:00:00', 'end_time': '10:00:00', 'date': '2026-10-10', 'shot_meters': 4200.00},
            # Machine C: 500.00 meters
            {'chassis_number': 'MACH-C', 'machine_id': 'MAC-C', 'vendor_name': 'Partner C', 'block': 'Block 3', 'status': 'COMPLETED', 'start_time': '09:00:00', 'end_time': '10:00:00', 'date': '2026-10-19', 'shot_meters': 500.00},
        ]

        summary = compute_execution_report_summary(
            all_matching_shots=shots,
            machines_catalog=catalog,
            selected_report_date='2026-10-23'
        )

        rows_map = {r['machine']: r for r in summary['rows']}

        # Machine A: 29 days, 11628.99 / 29 = 400.999... -> 401.0
        row_a = rows_map['MACH-A']
        self.assertEqual(row_a['ptd_start_date'], '2026-09-25')
        self.assertEqual(row_a['ptd_days'], 29)
        self.assertEqual(row_a['ptd_total'], 11628.99)
        self.assertEqual(row_a['ptd_per_day'], round(11628.99 / 29, 2))
        self.assertFalse(row_a['is_start_date_unknown'])
        self.assertFalse(row_a['is_future_start'])

        # Machine B: 14 days, 4200 / 14 = 300.0
        row_b = rows_map['MACH-B']
        self.assertEqual(row_b['ptd_start_date'], '2026-10-10')
        self.assertEqual(row_b['ptd_days'], 14)
        self.assertEqual(row_b['ptd_total'], 4200.00)
        self.assertEqual(row_b['ptd_per_day'], 300.0)
        self.assertFalse(row_b['is_start_date_unknown'])
        self.assertFalse(row_b['is_future_start'])

        # Machine C: 5 days, 500 / 5 = 100.0
        row_c = rows_map['MACH-C']
        self.assertEqual(row_c['ptd_start_date'], '2026-10-19')
        self.assertEqual(row_c['ptd_days'], 5)
        self.assertEqual(row_c['ptd_total'], 500.00)
        self.assertEqual(row_c['ptd_per_day'], 100.0)
        self.assertFalse(row_c['is_start_date_unknown'])
        self.assertFalse(row_c['is_future_start'])

    def test_machine_with_unknown_start_date_is_flagged_for_verification(self):
        """
        Acceptance Test 5:
        A machine with an unknown start date is flagged rather than assigned a guessed date.
        Must not divide by zero or negative days.
        """
        from apps.reports.services import compute_execution_report_summary

        catalog = [
            {'chassis_number': 'MACH-UNKNOWN', 'machine_id': 'MAC-UNK', 'machine_name': 'Unknown Unit', 'vendor_name': 'Partner', 'block': 'Block X'},
        ]

        summary = compute_execution_report_summary(
            all_matching_shots=[],
            machines_catalog=catalog,
            selected_report_date='2026-10-23'
        )

        self.assertEqual(len(summary['rows']), 1)
        row = summary['rows'][0]
        self.assertTrue(row['is_start_date_unknown'])
        self.assertIsNone(row['ptd_start_date'])
        self.assertEqual(row['ptd_start_formatted'], 'Unknown')
        self.assertEqual(row['ptd_days'], 0)
        self.assertEqual(row['ptd_total'], 0.0)
        self.assertEqual(row['ptd_per_day'], 0.0)
        self.assertIn('Verification Required', row['verification_status'])

    def test_machine_with_future_start_date_is_flagged_as_invalid(self):
        """
        Section 2 Business Rule:
        If the production start date is after the selected report date, flag the record as invalid
        for that report period. Never divide by zero or a negative day count.
        """
        from apps.reports.services import compute_execution_report_summary

        catalog = [
            {'chassis_number': 'MACH-FUTURE', 'machine_id': 'MAC-FUT', 'machine_name': 'Future Unit', 'vendor_name': 'Partner', 'block': 'Block F', 'production_start_date': '2026-11-01'},
        ]

        summary = compute_execution_report_summary(
            all_matching_shots=[],
            machines_catalog=catalog,
            selected_report_date='2026-10-23'
        )

        self.assertEqual(len(summary['rows']), 1)
        row = summary['rows'][0]
        self.assertTrue(row['is_future_start'])
        self.assertFalse(row['is_start_date_unknown'])
        self.assertEqual(row['ptd_days'], 0)
        self.assertEqual(row['ptd_per_day'], 0.0)
        self.assertIn('Invalid', row['verification_status'])

    def test_calendar_based_metrics_remain_consistent_across_all_machines(self):
        """
        Acceptance Test 3 & 4:
        - Previous Month, MTD and Previous Week remain calendar-based for all machines.
        - A machine starting mid-month (e.g. 10-Oct) has zero production for earlier days
          and keeps the standard calendar divisors (30 for Sep, 23 for Oct MTD, 7 for Prev Week).
        """
        from apps.reports.services import compute_execution_report_summary

        catalog = [
            {'chassis_number': 'MACH-MID', 'machine_id': 'MAC-MID', 'machine_name': 'Mid Month', 'vendor_name': 'Partner', 'block': 'Block M', 'production_start_date': '2026-10-10'},
        ]

        # 460 meters produced between 10-Oct and 23-Oct
        shots = [
            {'chassis_number': 'MACH-MID', 'machine_id': 'MAC-MID', 'vendor_name': 'Partner', 'block': 'Block M', 'status': 'COMPLETED', 'start_time': '09:00:00', 'end_time': '10:00:00', 'date': '2026-10-15', 'shot_meters': 460.0},
        ]

        summary = compute_execution_report_summary(
            all_matching_shots=shots,
            machines_catalog=catalog,
            selected_report_date='2026-10-23'
        )

        row = summary['rows'][0]
        # PTD: 14 days (10 to 23 Oct)
        self.assertEqual(row['ptd_days'], 14)
        self.assertEqual(row['ptd_total'], 460.0)
        self.assertEqual(row['ptd_per_day'], round(460.0 / 14, 2))

        # Previous Month: 30 days (September), Total = 0.0
        self.assertEqual(row['prev_month_days'], 30)
        self.assertEqual(row['prev_month_total'], 0.0)
        self.assertEqual(row['prev_month_per_day'], 0.0)

        # MTD: 23 days (1 to 23 October), Total = 460.0, Per Day = 460.0 / 23 = 20.0
        self.assertEqual(row['mtd_days'], 23)
        self.assertEqual(row['mtd_total'], 460.0)
        self.assertEqual(row['mtd_per_day'], 20.0)

        # Previous Week: 7 days (12 to 18 October), Shot on 15th falls here!
        self.assertEqual(row['prev_week_days'], 7)
        self.assertEqual(row['prev_week_total'], 460.0)
        self.assertEqual(row['prev_week_per_day'], round(460.0 / 7, 2))

    def test_excel_summary_export_reconciles_with_portal_data(self):
        """
        Acceptance Test 6 & Section 9:
        The Summary sheet includes Machine Production Start Date, PTD End Date, PTD Days,
        PTD Total, PTD Per Day and reconciles with portal API data.
        """
        from apps.reports.excel_export import generate_hdd_shot_excel_report
        from apps.reports.services import compute_execution_report_summary

        catalog = [
            {'chassis_number': 'MACH-01', 'machine_id': 'MAC-01', 'machine_name': 'Unit 01', 'vendor_name': 'Hero Partner', 'block': 'Block Alpha', 'production_start_date': '2026-09-25'},
        ]
        shots = [
            {'chassis_number': 'MACH-01', 'machine_id': 'MAC-01', 'vendor_name': 'Hero Partner', 'block': 'Block Alpha', 'status': 'COMPLETED', 'start_time': '08:00:00', 'end_time': '09:00:00', 'date': '2026-09-25', 'shot_meters': 500.0, 'daily_total_meters': 500.0, 'daily_shot_count': 1, 'shot_number': 1},
        ]

        exec_sum = compute_execution_report_summary(
            all_matching_shots=shots,
            machines_catalog=catalog,
            selected_report_date='2026-10-23'
        )

        content = generate_hdd_shot_excel_report(
            shots=shots,
            daily_summary=[],
            execution_summary=exec_sum,
            effective_today='2026-10-23'
        )

        wb = openpyxl.load_workbook(io.BytesIO(content))
        self.assertIn("Summary", wb.sheetnames)
        ws_sum = wb["Summary"]

        # Row 2 contains PTD Start Date: Machine-Specific
        meta_val = str(ws_sum.cell(row=2, column=1).value)
        self.assertIn("PTD Start Date: Machine-Specific", meta_val)

        # Check Row 6 (first machine data row)
        # Col 1: Block, Col 2: Machine, Col 3: Partner
        self.assertEqual(ws_sum.cell(row=6, column=1).value, 'Block Alpha')
        self.assertEqual(ws_sum.cell(row=6, column=2).value, 'MACH-01')
        self.assertEqual(ws_sum.cell(row=6, column=3).value, 'Hero Partner')
        # Col 4: Production Start Date (25-Sep-2026)
        self.assertEqual(ws_sum.cell(row=6, column=4).value, '25-Sep-2026')
        # Col 5: PTD End Date (23-Oct-2026)
        self.assertEqual(ws_sum.cell(row=6, column=5).value, '23-Oct-2026')
        # Col 6: PTD Days (29)
        self.assertEqual(ws_sum.cell(row=6, column=6).value, 29)
        # Col 7: PTD Total (500.0)
        self.assertEqual(ws_sum.cell(row=6, column=7).value, 500.0)
        # Col 8: PTD Per Day (17.24)
        self.assertEqual(ws_sum.cell(row=6, column=8).value, round(500.0 / 29, 2))

    def test_multi_partner_machine_execution_report(self):
        """Tests that when one machine has production under multiple partners, separate rows are generated"""
        from apps.reports.services import compute_execution_report_summary

        mock_shots = [
            # Partner A shots
            {
                'chassis_number': 'MACH-MULTI',
                'machine_id': 'MAC-MULTI',
                'machine_name': 'Multi Partner Machine',
                'vendor_name': 'Partner Alpha',
                'block': 'SUJANGARH',
                'circle': 'RAJASTHAN',
                'district': 'CHURU',
                'date': '2026-08-15',
                'start_time': '10:00:00',
                'end_time': '12:00:00',
                'shot_meters': 500.0,
                'status': 'COMPLETED'
            },
            {
                'chassis_number': 'MACH-MULTI',
                'machine_id': 'MAC-MULTI',
                'machine_name': 'Multi Partner Machine',
                'vendor_name': 'Partner Alpha',
                'block': 'SUJANGARH',
                'circle': 'RAJASTHAN',
                'district': 'CHURU',
                'date': '2026-08-20',
                'start_time': '11:00:00',
                'end_time': '13:00:00',
                'shot_meters': 350.0,
                'status': 'COMPLETED'
            },
            # Partner B shots
            {
                'chassis_number': 'MACH-MULTI',
                'machine_id': 'MAC-MULTI',
                'machine_name': 'Multi Partner Machine',
                'vendor_name': 'Partner Beta',
                'block': 'SUJANGARH',
                'circle': 'RAJASTHAN',
                'district': 'CHURU',
                'date': '2026-09-01',
                'start_time': '09:00:00',
                'end_time': '11:00:00',
                'shot_meters': 1200.0,
                'status': 'COMPLETED'
            },
            {
                'chassis_number': 'MACH-MULTI',
                'machine_id': 'MAC-MULTI',
                'machine_name': 'Multi Partner Machine',
                'vendor_name': 'Partner Beta',
                'block': 'SUJANGARH',
                'circle': 'RAJASTHAN',
                'district': 'CHURU',
                'date': '2026-10-10',
                'start_time': '14:00:00',
                'end_time': '16:00:00',
                'shot_meters': 800.0,
                'status': 'COMPLETED'
            },
        ]

        catalog = [
            {'chassis_number': 'MACH-MULTI', 'machine_id': 'MAC-MULTI', 'vendor_name': 'Partner Beta', 'block': 'SUJANGARH'}
        ]

        res = compute_execution_report_summary(
            all_matching_shots=mock_shots,
            machines_catalog=catalog,
            selected_report_date='2026-10-23'
        )

        rows = [r for r in res['rows'] if r['machine'] == 'MACH-MULTI']
        # Confirm two separate rows are generated for the same machine
        self.assertEqual(len(rows), 2)

        alpha_row = next(r for r in rows if r['partner'] == 'Partner Alpha')
        beta_row = next(r for r in rows if r['partner'] == 'Partner Beta')

        # Check separate PTD totals
        self.assertEqual(alpha_row['ptd_total'], 850.0)
        self.assertEqual(beta_row['ptd_total'], 2000.0)

        # Check machine-specific start dates
        self.assertEqual(alpha_row['ptd_start_date'], '2026-08-15')
        self.assertEqual(beta_row['ptd_start_date'], '2026-09-01')

        # Check combined machine total equals sum of partner rows
        combined = sum(r['ptd_total'] for r in rows)
        self.assertEqual(combined, 2850.0)

    def test_daily_machine_summary_shows_all_machines_and_blocks_grouped(self):
        """
        Requirement 1:
        - Display all machines grouped and listed under their respective blocks.
        - Include every machine, whether Working, Idle, or having production.
        - Do not hide machines or blocks.
        """
        from apps.reports.services import compute_daily_machine_summary_report
        from apps.machines.models import Machine

        m1, _ = Machine.objects.get_or_create(
            serial_number='TEST-SN-01',
            defaults={'machine_chassis_no': 'TEST-CH-01', 'name': 'Unit 01', 'site_name': 'Block Alpha'}
        )
        m2, _ = Machine.objects.get_or_create(
            serial_number='TEST-SN-02',
            defaults={'machine_chassis_no': 'TEST-CH-02', 'name': 'Unit 02', 'site_name': 'Block Beta'}
        )

        catalog = [
            {'chassis_number': 'TEST-CH-01', 'machine_id': 'M-01', 'machine_name': 'Unit 01', 'block': 'Block Alpha', 'vendor_name': 'Vendor Alpha', 'status': 'IDLE'},
            {'chassis_number': 'TEST-CH-02', 'machine_id': 'M-02', 'machine_name': 'Unit 02', 'block': 'Block Beta', 'vendor_name': 'Vendor Beta', 'status': 'IDLE'},
        ]

        summary = compute_daily_machine_summary_report(
            all_matching_shots=[],
            machines_catalog=catalog,
            selected_report_date='2026-10-24'
        )

        self.assertGreaterEqual(len(summary['rows']), 2)
        blocks_in_rows = {r['block'] for r in summary['rows']}
        self.assertIn('Block Alpha', blocks_in_rows)
        self.assertIn('Block Beta', blocks_in_rows)

        # Check rows are grouped by block
        row_blocks = [r['block'] for r in summary['rows']]
        # All occurrences of any block must be contiguous
        seen = set()
        prev = None
        for b in row_blocks:
            if b != prev:
                self.assertNotIn(b, seen, f"Block {b} rows are not contiguous/grouped!")
                seen.add(b)
                prev = b

    def test_producing_machine_is_never_displayed_as_idle(self):
        """
        Requirement 2:
        - If a machine has valid shot production for the selected reporting date, show actual production.
        - A machine that produced shots must NEVER be displayed as Idle.
        """
        from apps.reports.services import compute_daily_machine_summary_report

        catalog = [
            {'chassis_number': 'PROD-CH-01', 'machine_id': 'M-PROD', 'machine_name': 'Active Drill', 'block': 'Adel', 'status': 'IDLE'}
        ]

        # Valid production shots on target date
        shots = [
            {'chassis_number': 'PROD-CH-01', 'date': '2026-10-24', 'shot_meters': 150.0, 'shot_serial': 1, 'start_time_raw': '09:00:00'},
            {'chassis_number': 'PROD-CH-01', 'date': '2026-10-24', 'shot_meters': 160.0, 'shot_serial': 2, 'start_time_raw': '11:00:00'},
        ]

        summary = compute_daily_machine_summary_report(
            all_matching_shots=shots,
            machines_catalog=catalog,
            selected_report_date='2026-10-24'
        )

        prod_rows = [r for r in summary['rows'] if r['chassis_number'] == 'PROD-CH-01']
        self.assertEqual(len(prod_rows), 1)
        row = prod_rows[0]

        # Must be Working, not Idle
        self.assertEqual(row['machine_status'], 'Working')
        self.assertEqual(row['daily_total_meters'], 310)
        self.assertEqual(row['no_of_shots'], 2)
        self.assertEqual(row['shot_1'], 150)
        self.assertEqual(row['shot_2'], 160)
        self.assertEqual(row['reason_of_idle'], '')
        self.assertEqual(row['ageing_of_idle'], '')

    def test_automatic_breakdown_closure_on_valid_production(self):
        """
        Requirement 3:
        - If a machine has an active breakdown and new valid shot production is recorded on reporting date,
          automatically close the breakdown (status='RESOLVED' with resolution notes).
        - Ensure Daily Machine Summary reflects updated status.
        """
        from apps.machines.models import Machine
        from apps.breakdown.models import BreakdownReport
        from apps.reports.services import compute_daily_machine_summary_report

        mach, _ = Machine.objects.get_or_create(
            serial_number='BD-AUTO-01',
            defaults={'machine_chassis_no': 'BD-CH-01', 'name': 'Breakdown Unit', 'site_name': 'Karanpur'}
        )

        # Create an OPEN breakdown report
        bd = BreakdownReport.objects.create(
            machine=mach,
            severity='HIGH',
            issue_description='Hydraulic leak',
            status='OPEN'
        )

        # Machine records valid production on 2026-10-24
        shots = [
            {'chassis_number': 'BD-CH-01', 'date': '2026-10-24', 'shot_meters': 220.0, 'shot_serial': 1, 'start_time_raw': '08:00:00'},
        ]
        catalog = [
            {'chassis_number': 'BD-CH-01', 'machine_id': 'BD-01', 'machine_name': 'Breakdown Unit', 'block': 'Karanpur'}
        ]

        summary = compute_daily_machine_summary_report(
            all_matching_shots=shots,
            machines_catalog=catalog,
            selected_report_date='2026-10-24'
        )

        # 1. Check local BreakdownReport is RESOLVED in DB
        bd.refresh_from_db()
        self.assertEqual(bd.status, 'RESOLVED')
        self.assertIsNotNone(bd.resolved_at)
        self.assertIn('Automatically resolved', bd.resolution_notes)

        # 2. Check summary row shows Working, not Idle
        rows = [r for r in summary['rows'] if r['chassis_number'] == 'BD-CH-01']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['machine_status'], 'Working')
        self.assertEqual(rows[0]['daily_total_meters'], 220)

    def test_machine_without_partner_and_no_shots_is_excluded_from_daily_machine_summary(self):
        """
        Requirement:
        - Do not show machine in daily machine summary if partner is not assigned and machine has no shots.
        - Count only machines with an assigned partner.
        """
        from apps.reports.services import compute_daily_machine_summary_report

        catalog = [
            {'chassis_number': 'WITH-PARTNER-01', 'machine_id': 'M-01', 'machine_name': 'Partner Unit', 'block': 'Block Alpha', 'vendor_name': 'Alpha Partner', 'status': 'RUNNING'},
            {'chassis_number': 'NO-PARTNER-01', 'machine_id': 'M-02', 'machine_name': 'Unassigned Unit', 'block': 'Other', 'vendor_name': 'Hero', 'status': 'IDLE'},
        ]

        summary = compute_daily_machine_summary_report(
            all_matching_shots=[],
            machines_catalog=catalog,
            selected_report_date='2026-10-24'
        )

        chassis_in_summary = [r['chassis_number'] for r in summary['rows']]
        self.assertIn('WITH-PARTNER-01', chassis_in_summary)
        self.assertNotIn('NO-PARTNER-01', chassis_in_summary)
        self.assertEqual(summary['total_machines'], len(summary['rows']))




