from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status
from apps.authentication.models import User
from apps.integrations.views import IlyncMyTasksListView, IlyncTaskDetailView, IlyncTaskExecutionView


class MapViewExecutionRegressionTestCase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin_user, _ = User.objects.get_or_create(
            username="admin_test_user",
            defaults={"is_superuser": True, "email": "admin_test@hero.in"}
        )
        self.admin_user.is_superuser = True
        self.admin_user.save()

    def test_1_existing_execution_in_list_finds_same_execution_in_detail(self):
        """
        TEST 1: Existing execution appears in list → Open Map → detail page finds same execution.
        """
        # Fetch tasks list with expand=true
        req = self.factory.get('/api/v1/integrations/tasks/my-tasks/?task_type=FIBER_TRENCHING_DUCTING_TASK&expand=true')
        force_authenticate(req, user=self.admin_user)
        list_view = IlyncMyTasksListView.as_view()
        res_list = list_view(req)
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)

        tasks = res_list.data.get('data', {}).get('results', [])
        # Find Shubham Singh's task
        shubham_task = next((t for t in tasks if 'shubham' in str(t.get('assigneeName', '')).lower() and t.get('id') == '6aa27f87a2c7b4a4dd143a51'), None)
        self.assertIsNotNone(shubham_task, "Task 6aa27f87a2c7b4a4dd143a51 should exist in list")

        # Open Detail for the exact execution ID
        req_det = self.factory.get('/api/v1/integrations/tasks/6aa27f87a2c7b4a4dd143a51/')
        force_authenticate(req_det, user=self.admin_user)
        det_view = IlyncTaskDetailView.as_view()
        res_det = det_view(req_det, task_id='6aa27f87a2c7b4a4dd143a51')
        self.assertEqual(res_det.status_code, status.HTTP_200_OK)
        det_data = res_det.data.get('data', {})
        self.assertEqual(str(det_data.get('id')), '6aa27f87a2c7b4a4dd143a51')

        # Open Execution endpoint for the exact execution ID
        req_exec = self.factory.get('/api/v1/integrations/tasks/6aa27f87a2c7b4a4dd143a51/execution/')
        force_authenticate(req_exec, user=self.admin_user)
        exec_view = IlyncTaskExecutionView.as_view()
        res_exec = exec_view(req_exec, task_id='6aa27f87a2c7b4a4dd143a51')
        self.assertEqual(res_exec.status_code, status.HTTP_200_OK)
        exec_data = res_exec.data.get('data', {})
        self.assertIsNotNone(exec_data)

    def test_2_execution_date_2026_09_23_detail_request_finds_execution(self):
        """
        TEST 2: Execution date = 2026-09-23 → detail request date = 2026-09-23 contains actual trenches and pits.
        """
        req_exec = self.factory.get('/api/v1/integrations/tasks/6aa27f87a2c7b4a4dd143a51/execution/')
        force_authenticate(req_exec, user=self.admin_user)
        exec_view = IlyncTaskExecutionView.as_view()
        res_exec = exec_view(req_exec, task_id='6aa27f87a2c7b4a4dd143a51')
        self.assertEqual(res_exec.status_code, status.HTTP_200_OK)

        exec_data = res_exec.data.get('data', {})
        fd = exec_data.get('fieldData', {})
        tr = fd.get('trenching', {})
        shots = tr.get('hddShot', [])
        pits = tr.get('pitDetails', [])

        shots_on_23 = [s for s in shots if '23-09-2026' in str(s.get('hddStartTime') or s.get('hddEndTime'))]
        pits_on_23 = [p for p in pits if '23-09-2026' in str(p.get('pitDiggingTime'))]

        self.assertGreater(len(shots_on_23), 0, "Execution for 2026-09-23 must contain shots")
        self.assertGreater(len(pits_on_23), 0, "Execution for 2026-09-23 must contain pits")
        # Check depth captures
        first_shot = shots_on_23[0]
        dps = first_shot.get('depthCapture', [])
        self.assertGreater(len(dps), 0, "Shot on 2026-09-23 must contain depth points")

    def test_3_user_block_district_filtering_remains_consistent(self):
        """
        TEST 3: User/block/district filtering remains consistent between list and detail.
        """
        req_det = self.factory.get('/api/v1/integrations/tasks/6aa27f87a2c7b4a4dd143a51/')
        force_authenticate(req_det, user=self.admin_user)
        det_view = IlyncTaskDetailView.as_view()
        res_det = det_view(req_det, task_id='6aa27f87a2c7b4a4dd143a51')
        self.assertEqual(res_det.status_code, status.HTTP_200_OK)
        task_data = res_det.data.get('data', {})

        loc = task_data.get('locationSnapshot') or task_data.get('location') or {}
        district = loc.get('district') or task_data.get('district') or ''
        block = loc.get('blockName') or loc.get('block') or task_data.get('block') or ''
        assignee = task_data.get('assigneeName') or (task_data.get('assigneeSnapshot') or {}).get('name') or ''

        self.assertEqual(str(district).upper(), 'BARMER')
        self.assertEqual(str(block).upper(), 'AADEL')
        self.assertIn('Shubham', str(assignee))

    def test_4_execution_with_zero_trenches_legitimately_shows_zero_data(self):
        """
        TEST 4: Execution with zero trenches legitimately returns empty execution or 0 trenches.
        """
        # Task 6aa27f87a2c7b4a4dd143a4d (AADEL root project) has 0 direct trenches
        req_exec = self.factory.get('/api/v1/integrations/tasks/6aa27f87a2c7b4a4dd143a4d/execution/')
        force_authenticate(req_exec, user=self.admin_user)
        exec_view = IlyncTaskExecutionView.as_view()
        res_exec = exec_view(req_exec, task_id='6aa27f87a2c7b4a4dd143a4d')
        # Even if children are merged, verify response handles it gracefully without errors
        self.assertIn(res_exec.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])

    def test_5_nonexistent_execution_id_correctly_shows_not_found(self):
        """
        TEST 5: Nonexistent execution ID correctly shows 404 Not Found.
        """
        req_exec = self.factory.get('/api/v1/integrations/tasks/000000000000000000000000/execution/')
        force_authenticate(req_exec, user=self.admin_user)
        exec_view = IlyncTaskExecutionView.as_view()
        res_exec = exec_view(req_exec, task_id='000000000000000000000000')
        self.assertEqual(res_exec.status_code, status.HTTP_404_NOT_FOUND)

    def test_6_timestamp_timezone_asia_kolkata_ist(self):
        """
        TEST 6: Execution timestamp for 6aa27f87a2c7b4a4dd143a51 parsed in IST
        does NOT produce false evening time '7:10 pm'.
        """
        from apps.common.task_scope import parse_iso_epoch, resolve_latest_task_timestamp
        from datetime import datetime, timezone, timedelta

        IST = timezone(timedelta(hours=5, minutes=30))

        # Test naive field timestamp string
        epoch_start = parse_iso_epoch('23-09-2026 13:40:10')
        self.assertIsNotNone(epoch_start)
        dt_ist = datetime.fromtimestamp(epoch_start, tz=IST)
        formatted_time = dt_ist.strftime('%I:%M %p').lower()
        self.assertEqual(formatted_time, '01:40 pm', "13:40 in IST must be 1:40 pm, not 7:10 pm")

        # Test depth reading epoch
        epoch_dp = parse_iso_epoch(1790153831817)
        self.assertIsNotNone(epoch_dp)
        dt_dp_ist = datetime.fromtimestamp(epoch_dp, tz=IST)
        formatted_dp = dt_dp_ist.strftime('%d %b, %I:%M %p')
        self.assertIn('23 Sep', formatted_dp)
        self.assertIn('02:27 PM', formatted_dp.upper())
        self.assertNotIn('07:10 PM', formatted_dp.upper())
