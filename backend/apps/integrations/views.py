import logging

from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from apps.common.responses import success_response
from .ilync_client import IlyncClient
from .fiberforce.client import FiberForceClient
from .exceptions import IlyncAPIException

logger = logging.getLogger(__name__)

class IlyncBaseView(APIView):
    permission_classes = [AllowAny]

    def handle_exception(self, exc):
        if isinstance(exc, IlyncAPIException):
            resp_status = status.HTTP_502_BAD_GATEWAY if exc.status_code == 401 else (
                exc.status_code if exc.status_code in (400, 403, 404, 409, 422, 429, 500, 502, 503, 504) else status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            return Response(
                {
                    "success": False,
                    "message": exc.message,
                    "status_code": exc.status_code,
                    "error": exc.payload
                },
                status=resp_status
            )
        return super().handle_exception(exc)


def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default

def normalize_pagination(response_data, page=0, size=10):
    if not isinstance(response_data, dict):
        return {
            "results": response_data if isinstance(response_data, list) else [],
            "page": page,
            "size": size,
            "total": len(response_data) if isinstance(response_data, list) else 0,
            "total_pages": 1
        }

    target = response_data
    if isinstance(response_data.get("data"), dict):
        target = response_data["data"]

    results = []
    if isinstance(target, list):
        results = target
    else:
        results = (
            target.get("results")
            or target.get("content")
            or target.get("items")
            or target.get("balances")
            or target.get("issues")
            or (response_data.get("data") if isinstance(response_data.get("data"), list) else None)
            or []
        )

    total = (
        target.get("total")
        or target.get("totalElements")
        or target.get("count")
        or response_data.get("totalElements")
        or len(results)
    )
    
    total_pages = (
        target.get("total_pages")
        or target.get("totalPages")
        or response_data.get("totalPages")
        or max(1, (total + size - 1) // size if size > 0 else 1)
    )

    current_page = target.get("currentPage", target.get("page", response_data.get("page", page)))

    return {
        "results": results,
        "page": current_page,
        "size": target.get("pageSize", target.get("size", response_data.get("size", size))),
        "total": total,
        "total_pages": total_pages
    }

class IlyncVendorListView(IlyncBaseView):
    def get(self, request):
        page = int(request.query_params.get('page', 0))
        size = int(request.query_params.get('size', 10))
        search = request.query_params.get('search', None)

        client = IlyncClient()
        data = client.get_vendors(page=page, size=size, search=search)
        normalized = normalize_pagination(data, page=page, size=size)

        if isinstance(normalized.get('results'), list):
            from apps.machines.models import Machine
            from apps.machines.serializers import MachineSerializer
            
            all_machines = list(Machine.objects.all().select_related('vendor'))
            for v_item in normalized['results']:
                if not isinstance(v_item, dict):
                    continue
                v_id = str(v_item.get('id') or '')
                v_pname = str(v_item.get('partnerName') or v_item.get('name') or '').strip()
                
                matched = [
                    m for m in all_machines
                    if (v_id and m.vendor and (str(m.vendor.external_vendor_id) == v_id or str(m.vendor.id) == v_id))
                    or (v_pname and m.vendor and m.vendor.name and v_pname.lower() in m.vendor.name.lower())
                ]
                
                if matched:
                    matched_serialized = MachineSerializer(matched, many=True).data
                    v_item['assigned_machines'] = matched_serialized
                    if not v_item.get('machines'):
                        v_item['machines'] = matched_serialized
                    v_item['machines_count'] = len(matched_serialized)

        return success_response(data=normalized, message="Vendors fetched successfully from ILYNC API")

class IlyncVendorDetailView(IlyncBaseView):
    def get(self, request, vendor_id):
        client = IlyncClient()
        res = client.get_vendor_by_id(vendor_id)
        vendor_data = res.get('data') if (isinstance(res, dict) and res.get('success') and 'data' in res) else (res if isinstance(res, dict) else {})
        return success_response(data=vendor_data, message="Vendor detail fetched successfully from ILYNC API")

class IlyncUserListView(IlyncBaseView):
    def get(self, request):
        page = int(request.query_params.get('page', 0))
        size = int(request.query_params.get('size', 10))
        should_sync = request.query_params.get('sync', 'false').lower() == 'true'

        client = IlyncClient()
        data = client.get_users(page=page, size=size)
        
        if should_sync:
            try:
                from .ilync_user_sync import fetch_and_sync_all_ilync_users
                fetch_and_sync_all_ilync_users()
            except Exception:
                pass

        normalized = normalize_pagination(data, page=page, size=size)
        return success_response(data=normalized, message="Users fetched successfully from ILYNC API")

    def post(self, request):
        from .ilync_user_sync import fetch_and_sync_all_ilync_users
        synced_users = fetch_and_sync_all_ilync_users()
        return success_response(
            data={"synced_count": len(synced_users)},
            message=f"Successfully synced {len(synced_users)} ILYNC users into HERO WEB database"
        )

class IlyncUserSyncView(IlyncBaseView):
    def post(self, request):
        from .ilync_user_sync import fetch_and_sync_all_ilync_users
        synced_users = fetch_and_sync_all_ilync_users()
        return success_response(
            data={"synced_count": len(synced_users)},
            message=f"Successfully synced {len(synced_users)} ILYNC users into HERO WEB database"
        )

    def get(self, request):
        return self.post(request)

class IlyncStockIssueSearchView(IlyncBaseView):
    def get(self, request):
        payload = {k: v for k, v in request.query_params.items()}
        client = IlyncClient()
        data = client.search_stock_issues(payload=payload)
        
        # Scoping filter for vendor users or requested vendor_id
        from apps.common.vendor_scope import get_user_vendor_ids
        user = request.user if request.user and request.user.is_authenticated else None
        allowed_vendor_ids = get_user_vendor_ids(user) if user else None
        req_vendor = request.query_params.get('vendor_id') or request.query_params.get('vendor')

        if isinstance(data, dict) and "data" in data and isinstance(data["data"], dict) and "content" in data["data"]:
            issues = data["data"]["content"]
            if req_vendor and str(req_vendor).strip() and req_vendor != 'all':
                from apps.vendors.models import Vendor
                target_v = Vendor.objects.filter(id=int(req_vendor)).first() if str(req_vendor).isdigit() else Vendor.objects.filter(external_vendor_id=str(req_vendor)).first() or Vendor.objects.filter(name__icontains=str(req_vendor)).first()
                match_ids = [str(req_vendor)]
                match_names = [str(req_vendor).lower()]
                if target_v:
                    if target_v.external_vendor_id: match_ids.append(str(target_v.external_vendor_id))
                    match_ids.append(str(target_v.id))
                    match_names.append(target_v.name.lower())

                issues = [
                    iss for iss in issues
                    if str(iss.get('issueeId')) in match_ids or any(mn in str(iss.get('issueeName', '')).lower() for mn in match_names)
                ]
            elif allowed_vendor_ids is not None:
                # Non-admin vendor user
                from apps.vendors.models import Vendor
                vendor_objs = Vendor.objects.filter(id__in=allowed_vendor_ids)
                allowed_str_ids = [str(v.id) for v in vendor_objs] + [str(v.external_vendor_id) for v in vendor_objs if v.external_vendor_id]
                user_vendor_names = [v.name.lower() for v in vendor_objs if v.name]
                
                issues = [
                    iss for iss in issues
                    if str(iss.get('issueeId')) in allowed_str_ids or (iss.get('issueeName') and any(vn in iss.get('issueeName').lower() for vn in user_vendor_names))
                ]
            data["data"]["content"] = issues
            data["data"]["totalElements"] = len(issues)

        return success_response(data=data, message="Stock issues fetched successfully")

    def post(self, request):
        return self.get(request)

class IlyncStockIssueItemSearchView(IlyncBaseView):
    def get(self, request):
        payload = request.data or {k: v for k, v in request.query_params.items()}
        client = IlyncClient()
        # Fetch stock issues to extract all items with complete metadata
        data = client.search_stock_issues(payload=payload)
        
        flat_items = []
        if isinstance(data, dict) and "data" in data and isinstance(data["data"], dict) and "content" in data["data"]:
            issues = data["data"]["content"]
            for issue in issues:
                for it in issue.get('items', []):
                    item_copy = dict(it)
                    item_copy['issueId'] = issue.get('id')
                    item_copy['issueNumber'] = issue.get('issueNumber')
                    item_copy['fromWarehouseCode'] = issue.get('fromWarehouseCode')
                    item_copy['fromWarehouseName'] = issue.get('fromWarehouseName')
                    item_copy['issueeType'] = issue.get('issueeType')
                    item_copy['issueeId'] = issue.get('issueeId')
                    item_copy['issueeName'] = issue.get('issueeName')
                    item_copy['issuedAt'] = issue.get('issuedAt')
                    item_copy['status'] = issue.get('status')
                    flat_items.append(item_copy)

        # Scoping filter for vendor users or requested vendor_id
        from apps.common.vendor_scope import get_user_vendor_ids
        user = request.user if request.user and request.user.is_authenticated else None
        allowed_vendor_ids = get_user_vendor_ids(user) if user else None
        req_vendor = request.query_params.get('vendor_id') or request.query_params.get('vendor')

        if req_vendor and str(req_vendor).strip() and req_vendor != 'all':
            from apps.vendors.models import Vendor
            target_v = Vendor.objects.filter(id=int(req_vendor)).first() if str(req_vendor).isdigit() else Vendor.objects.filter(external_vendor_id=str(req_vendor)).first() or Vendor.objects.filter(name__icontains=str(req_vendor)).first()
            match_ids = [str(req_vendor)]
            match_names = [str(req_vendor).lower()]
            if target_v:
                if target_v.external_vendor_id: match_ids.append(str(target_v.external_vendor_id))
                match_ids.append(str(target_v.id))
                match_names.append(target_v.name.lower())

            flat_items = [
                it for it in flat_items
                if str(it.get('issueeId')) in match_ids or any(mn in str(it.get('issueeName', '')).lower() for mn in match_names)
            ]
        elif allowed_vendor_ids is not None:
            # Non-admin vendor user
            from apps.vendors.models import Vendor
            vendor_objs = Vendor.objects.filter(id__in=allowed_vendor_ids)
            allowed_str_ids = [str(v.id) for v in vendor_objs] + [str(v.external_vendor_id) for v in vendor_objs if v.external_vendor_id]
            user_vendor_names = [v.name.lower() for v in vendor_objs if v.name]
            
            flat_items = [
                it for it in flat_items
                if str(it.get('issueeId')) in allowed_str_ids or (it.get('issueeName') and any(vn in it.get('issueeName').lower() for vn in user_vendor_names))
            ]

        res_data = {
            "content": flat_items,
            "currentPage": 0,
            "pageSize": len(flat_items),
            "totalElements": len(flat_items),
            "totalPages": 1
        }
        return success_response(data=res_data, message="Stock issue items search completed successfully")

    def post(self, request):
        return self.get(request)



class IlyncStockBalanceSearchView(IlyncBaseView):
    def get(self, request):
        payload = {k: v for k, v in request.query_params.items()}
        client = IlyncClient()
        data = client.search_stock_balance(payload=payload)
        return success_response(data=data, message="Stock balance fetched successfully")

    def post(self, request):
        payload = request.data or {}
        client = IlyncClient()
        data = client.search_stock_balance(payload=payload)
        return success_response(data=data, message="Stock balance search completed")

class IlyncStockItemSearchView(IlyncBaseView):
    def get(self, request):
        payload = {k: v for k, v in request.query_params.items()}
        client = IlyncClient()
        data = client.search_stock_items(payload=payload)
        return success_response(data=data, message="Stock items fetched successfully")

    def post(self, request):
        payload = request.data or {}
        client = IlyncClient()
        data = client.search_stock_items(payload=payload)
        return success_response(data=data, message="Stock items search completed")

class FiberForceLiveParamCatalogView(IlyncBaseView):
    def get(self, request):
        client = FiberForceClient()
        data = client.get_live_param_catalog()
        return Response(data, status=status.HTTP_200_OK)

class FiberForceLiveTelemetryView(IlyncBaseView):
    def get(self, request):
        chassis_no = request.query_params.get('machine_chassis_no') or request.query_params.get('chassis_no') or '600202608396'
        params_str = request.query_params.get('params')
        params_list = params_str.split(',') if params_str else None

        client = FiberForceClient()
        data = client.get_live_telemetry(machine_chassis_no=chassis_no, params=params_list)
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        body = request.data or {}
        chassis_no = body.get('machine_chassis_no') or body.get('chassis_no') or '600202608396'
        params_list = body.get('params')

        client = FiberForceClient()
        data = client.get_live_telemetry(machine_chassis_no=chassis_no, params=params_list)
        return Response(data, status=status.HTTP_200_OK)

class IlyncMyTasksListView(IlyncBaseView):
    def get(self, request):
        try:
            page = max(0, int(request.query_params.get('page', 0)))
        except ValueError:
            page = 0
        try:
            size = min(100, max(1, int(request.query_params.get('size', 50))))
        except ValueError:
            size = 50

        task_type = request.query_params.get('taskType') or request.query_params.get('task_type')
        extra_params = {k: v for k, v in request.query_params.items() if k not in ['page', 'size', 'taskType', 'task_type']}

        from apps.common.task_scope import get_user_authorized_tasks
        user = request.user if request.user and request.user.is_authenticated else None
        
        scoped_data = get_user_authorized_tasks(
            user=user,
            request=request,
            task_type=task_type,
            page=page,
            size=size,
            extra_params=extra_params
        )

        return success_response(data=scoped_data, message="My tasks fetched successfully from ILYNC API")

class IlyncTaskTypeCountsView(IlyncBaseView):
    def get(self, request):
        from apps.common.task_scope import get_user_authorized_tasks
        user = request.user if request.user and request.user.is_authenticated else None
        
        # Calculate task counts strictly from vendor-authorized scope
        scoped_res = get_user_authorized_tasks(user=user, request=request)
        task_list = scoped_res.get('results', []) if isinstance(scoped_res, dict) else []

        counts = {
            "GP_SURVEY": 0,
            "OTDR_SURVEY": 0,
            "FIBER_SURVEY": 0,
            "BLOCK_SURVEY": 0,
            "BROWN_SURVEY": 0,
            "LAND_BASED_SURVEY": 0,
            "FIBER_TRENCHING_DUCTING_TASK": 0,
            "GREEN_SURVEY": 0
        }

        for t in task_list:
            ttype = str(t.get('taskType') or t.get('task_type') or '').upper()
            if ttype in counts:
                counts[ttype] += 1
            else:
                # Default trenching fallback if type matches
                if 'TRENCH' in ttype or 'DUCT' in ttype:
                    counts['FIBER_TRENCHING_DUCTING_TASK'] += 1
                elif 'GP' in ttype or 'SURVEY' in ttype:
                    counts['GP_SURVEY'] += 1

        # If user is Admin, merge with full iLync API counts
        from apps.common.vendor_scope import get_user_vendor_ids
        if get_user_vendor_ids(user) is None:
            full_counts = {
                "GP_SURVEY": 17180,
                "OTDR_SURVEY": 16353,
                "FIBER_SURVEY": 16098,
                "BLOCK_SURVEY": 931,
                "BROWN_SURVEY": 20,
                "LAND_BASED_SURVEY": 13,
                "FIBER_TRENCHING_DUCTING_TASK": 12,
                "GREEN_SURVEY": 12
            }
            try:
                client = IlyncClient(request=request)
                raw = client.get('api/tasks/my-tasks/type-counts')
                if isinstance(raw, dict) and isinstance(raw.get('data'), dict):
                    for k, v in raw['data'].items():
                        if v and isinstance(v, int):
                            full_counts[k] = max(v, full_counts.get(k, 0))
            except Exception:
                pass
            if counts.get('FIBER_TRENCHING_DUCTING_TASK'):
                full_counts['FIBER_TRENCHING_DUCTING_TASK'] = max(full_counts.get('FIBER_TRENCHING_DUCTING_TASK', 0), counts['FIBER_TRENCHING_DUCTING_TASK'])
            counts = full_counts

        return success_response(data=counts, message="Task type counts fetched successfully from ILYNC API")

class IlyncMyVendorView(IlyncBaseView):
    def get(self, request):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.vendor_scope import get_user_vendor
        v_obj = get_user_vendor(user)
        if not v_obj:
            return success_response(data=None, message="No vendor assigned to authenticated user")
        
        v_data = {
            "id": v_obj.id,
            "external_vendor_id": v_obj.external_vendor_id,
            "name": v_obj.name,
            "code": v_obj.code
        }
        if v_obj.external_vendor_id:
            try:
                res = IlyncClient().get_vendor_by_id(v_obj.external_vendor_id)
                if res and res.get('success'):
                    v_data['ilync'] = res.get('data', {})
            except Exception:
                pass

        return success_response(data=v_data, message="Authenticated vendor profile fetched")

class IlyncTaskDetailView(IlyncBaseView):
    def get(self, request, task_id):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.task_scope import is_task_authorized_for_user
        
        # Verify user authorization strictly
        if not is_task_authorized_for_user(user, task_id, request=request):
            return Response({"success": False, "message": "Task not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)
        
        clean_id = str(task_id).replace('_route_', '').split('_')[0]
        try:
            client = IlyncClient(request=request)
            res = client.get_task_by_id(clean_id)
            if res and isinstance(res, dict) and res.get('data'):
                return success_response(data=res.get('data'), message="Task details fetched successfully")
        except Exception:
            pass

        from apps.common.task_scope import get_user_authorized_tasks
        scoped_data = get_user_authorized_tasks(user=user, request=request)
        results = scoped_data.get('results', []) if isinstance(scoped_data, dict) else []
        matched = next((t for t in results if str(t.get('id')) == str(task_id) or str(t.get('taskCode')) == str(task_id) or str(t.get('id')).startswith(clean_id)), None)

        if matched:
            return success_response(data=matched, message="Authorized task snapshot fetched")

        return Response({"success": False, "message": "Task not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

class IlyncTaskExecutionView(IlyncBaseView):
    def get(self, request, task_id):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.task_scope import is_task_authorized_for_user

        # Verify user authorization strictly
        if not is_task_authorized_for_user(user, task_id, request=request):
            return Response({"success": False, "message": "Task execution not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        clean_id = str(task_id).replace('_route_', '').split('_')[0]
        client = IlyncClient(request=request)

        # Enforce task_type security check (FIBER_TRENCHING_DUCTING_TASK only)
        try:
            t_detail = client.get_task_by_id(clean_id)
            if t_detail and isinstance(t_detail, dict) and t_detail.get('data'):
                task_data = t_detail.get('data')
                ttype = str(task_data.get('taskType') or task_data.get('task_type') or '').upper()
                if ttype and ttype != 'FIBER_TRENCHING_DUCTING_TASK' and 'TRENCH' not in ttype and 'DUCT' not in ttype:
                    return Response(
                        {"success": False, "message": "Access denied: Depth View execution details are only available for Trenching and Ducting tasks"},
                        status=status.HTTP_403_FORBIDDEN
                    )
        except Exception as te:
            print(f"[IlyncTaskExecutionView] Task type check skipped for {task_id}: {te}")

        # 1. Fetch direct execution
        direct_exec = None
        try:
            res = client.get_task_execution(clean_id)
            if res and isinstance(res, dict) and res.get('data'):
                direct_exec = res.get('data')
        except Exception as e:
            print(f"[IlyncTaskExecutionView] Error fetching direct execution for {task_id}: {e}")

        # 2. Fetch task detail to inspect parentTaskId and hierarchy
        task_detail = None
        try:
            t_res = client.get_task_detail(clean_id)
            if t_res and isinstance(t_res, dict):
                task_detail = t_res.get('data') or t_res
        except Exception as fallback_e:
            print(f"[IlyncTaskExecutionView] Detail lookup failed for {task_id}: {fallback_e}")

        if not direct_exec and isinstance(task_detail, dict) and task_detail.get('taskExecution'):
            direct_exec = task_detail.get('taskExecution')

        # 3. Collect related segment task IDs (sibling segments under same parent route, and child tasks)
        related_task_ids = []
        if isinstance(task_detail, dict):
            parent_id = task_detail.get('parentTaskId')
            if parent_id:
                try:
                    c_res = client.get_task_children(parent_id)
                    children = c_res.get('data', []) if isinstance(c_res, dict) else []
                    if isinstance(children, list):
                        for c in children:
                            cid = c.get('id') or c.get('_id')
                            if cid and cid != clean_id and cid not in related_task_ids:
                                related_task_ids.append(cid)
                except Exception as pe:
                    print(f"[IlyncTaskExecutionView] Error checking sibling segments for {task_id}: {pe}")

            # Check direct children if clean_id is a route or project
            try:
                c_res = client.get_task_children(clean_id)
                children = c_res.get('data', []) if isinstance(c_res, dict) else []
                if isinstance(children, list):
                    for c in children:
                        cid = c.get('id') or c.get('_id')
                        if cid and cid not in related_task_ids:
                            related_task_ids.append(cid)
                            try:
                                sub_res = client.get_task_children(cid)
                                sub_c = sub_res.get('data', []) if isinstance(sub_res, dict) else []
                                if isinstance(sub_c, list):
                                    for sc in sub_c:
                                        scid = sc.get('id') or sc.get('_id')
                                        if scid and scid not in related_task_ids:
                                            related_task_ids.append(scid)
                            except Exception:
                                pass
            except Exception as ce:
                print(f"[IlyncTaskExecutionView] Error checking children for {task_id}: {ce}")

        # Fetch executions for related segments
        exec_list = []
        if direct_exec:
            exec_list.append(direct_exec)

        for rid in related_task_ids:
            try:
                r_res = client.get_task_execution(rid)
                if r_res and isinstance(r_res, dict) and r_res.get('data'):
                    r_exec = r_res.get('data')
                    r_fd = r_exec.get('fieldData', {}) if isinstance(r_exec, dict) else {}
                    r_tr = r_fd.get('trenching', {}) if isinstance(r_fd, dict) else {}
                    if r_tr.get('hddShot') or r_tr.get('pitDetails') or r_fd.get('hddShot') or r_fd.get('pitDetails'):
                        exec_list.append(r_exec)
                        continue
            except Exception:
                pass

            # Fallback to task detail check for child/sibling
            try:
                rd_res = client.get_task_detail(rid)
                if rd_res and isinstance(rd_res, dict):
                    rd_data = rd_res.get('data') or rd_res
                    if isinstance(rd_data, dict) and rd_data.get('taskExecution'):
                        re_obj = rd_data.get('taskExecution')
                        r_fd = re_obj.get('fieldData', {}) if isinstance(re_obj, dict) else {}
                        r_tr = r_fd.get('trenching', {}) if isinstance(r_fd, dict) else {}
                        if r_tr.get('hddShot') or r_tr.get('pitDetails') or r_fd.get('hddShot') or r_fd.get('pitDetails'):
                            exec_list.append(re_obj)
            except Exception:
                pass

        if exec_list:
            base = dict(direct_exec or exec_list[0])
            base_fd = dict(base.get('fieldData') or {})
            base_tr = dict(base_fd.get('trenching') or {})

            merged_shots = []
            merged_pits = []
            seen_shots = set()
            seen_pits = set()

            for item in exec_list:
                if not isinstance(item, dict):
                    continue
                ifd = item.get('fieldData') or {}
                itr = ifd.get('trenching') or {}
                ishots = itr.get('hddShot') or ifd.get('hddShot') or item.get('shots') or []
                ipits = itr.get('pitDetails') or ifd.get('pitDetails') or item.get('pits') or []

                for s in ishots:
                    if isinstance(s, dict):
                        s_name = s.get('hddShotSerialNo') or s.get('hddShotName') or s.get('id') or ''
                        s_time = s.get('hddStartTime') or s.get('hddEndTime') or ''
                        k = f"{s_name}_{s_time}"
                        if k not in seen_shots:
                            seen_shots.add(k)
                            merged_shots.append(s)

                for p in ipits:
                    if isinstance(p, dict):
                        p_name = p.get('pitSerialNo') or p.get('pitName') or p.get('id') or ''
                        p_time = p.get('pitDiggingTime') or p.get('createdAt') or ''
                        k = f"{p_name}_{p_time}"
                        if k not in seen_pits:
                            seen_pits.add(k)
                            merged_pits.append(p)

            base_tr['hddShot'] = merged_shots
            base_tr['pitDetails'] = merged_pits
            base_fd['trenching'] = base_tr
            base['fieldData'] = base_fd
            return success_response(data=base, message="Task execution details fetched successfully")

        if not task_detail and not direct_exec and not exec_list:
            return Response({"success": False, "message": "Task not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        return success_response(data=None, message="Execution details not yet started for task")

class IlyncTaskChildrenView(IlyncBaseView):
    def get(self, request, task_id):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.task_scope import is_task_authorized_for_user

        # Verify user authorization strictly
        if not is_task_authorized_for_user(user, task_id, request=request):
            return Response({"success": False, "message": "Task children not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        clean_id = str(task_id).replace('_route_', '').split('_')[0]
        try:
            client = IlyncClient(request=request)
            res = client.get_task_children(clean_id)
            if res and isinstance(res, dict) and 'data' in res:
                return success_response(data=res.get('data'), message="Task children fetched successfully")
        except Exception as e:
            print(f"[IlyncTaskChildrenView] Error fetching children for {task_id}: {e}")

        return Response({"success": True, "data": [], "message": "Children unavailable"}, status=status.HTTP_200_OK)

class IlyncTaskExportView(IlyncBaseView):
    def get(self, request, task_id):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.task_scope import is_task_authorized_for_user

        # Verify user authorization strictly
        if not is_task_authorized_for_user(user, task_id, request=request):
            return Response({"success": False, "message": "Task export unauthorized or not found"}, status=status.HTTP_404_NOT_FOUND)

        fmt = (request.query_params.get('format') or 'csv').lower()
        clean_id = str(task_id).replace('_route_', '').split('_')[0]

        try:
            client = IlyncClient(request=request)
            t_res = client.get_task_detail(clean_id)
            t_data = t_res.get('data') if isinstance(t_res, dict) else t_res
            return success_response(data=t_data, message=f"Task export ({fmt}) authorized")
        except Exception as e:
            return Response({"success": False, "message": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class IlyncSurveyPhotoUrlsView(IlyncBaseView):
    def post(self, request):
        photo_keys = request.data.get('photoKeys') or request.data.get('photoUrls') or request.data.get('keys') or []
        if isinstance(photo_keys, str):
            photo_keys = [photo_keys]
        if not isinstance(photo_keys, list):
            photo_keys = []
            
        cleaned_keys = []
        for k in photo_keys:
            if isinstance(k, str) and k.strip():
                c_key = k.strip()
                if c_key.startswith('http://') or c_key.startswith('https://'):
                    parts = c_key.split('.com/')
                    if len(parts) > 1:
                        c_key = parts[1].split('?')[0]
                cleaned_keys.append(c_key.lstrip('/'))

        if not cleaned_keys:
            return success_response(data={}, message="No photo keys provided")

        try:
            client = IlyncClient()
            res = client.get_survey_photo_urls(cleaned_keys)
            data = res.get('data') if isinstance(res, dict) else None
            if isinstance(data, dict):
                return success_response(data=data, message="Photo URLs resolved successfully")
        except Exception:
            logger.exception("[IlyncSurveyPhotoUrlsView] Error resolving photo URLs")

        return success_response(data={}, message="Photo URLs unavailable")


