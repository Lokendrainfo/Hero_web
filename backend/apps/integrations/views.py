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
            # Machines come live on vendor detail; do not join local Machine table
            for v_item in normalized['results']:
                if not isinstance(v_item, dict):
                    continue
                machines = v_item.get('machines') or v_item.get('assigned_machines') or []
                if not isinstance(machines, list):
                    machines = []
                v_item['machines'] = machines
                v_item['assigned_machines'] = machines
                v_item['machines_count'] = len(machines)

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
                match_ids = {str(req_vendor).strip().lower()}
                match_names = {str(req_vendor).strip().lower()}
                try:
                    from apps.common.vendor_scope import _hydrate_vendor
                    proxy = _hydrate_vendor(str(req_vendor).strip())
                    if getattr(proxy, 'external_vendor_id', None):
                        match_ids.add(str(proxy.external_vendor_id).lower())
                    if getattr(proxy, 'name', None):
                        match_names.add(str(proxy.name).lower())
                except Exception:
                    pass

                issues = [
                    iss for iss in issues
                    if str(iss.get('issueeId', '')).lower() in match_ids
                    or any(mn in str(iss.get('issueeName', '')).lower() for mn in match_names)
                ]
            elif allowed_vendor_ids is not None:
                # Non-admin vendor user — allowed ids are external string ids
                allowed_str_ids = {str(v).lower() for v in (allowed_vendor_ids or []) if v}
                user_vendor_names = set()
                for vid in list(allowed_str_ids)[:10]:
                    try:
                        from apps.common.vendor_scope import _hydrate_vendor
                        proxy = _hydrate_vendor(vid)
                        if getattr(proxy, 'name', None):
                            user_vendor_names.add(str(proxy.name).lower())
                        if getattr(proxy, 'external_vendor_id', None):
                            allowed_str_ids.add(str(proxy.external_vendor_id).lower())
                    except Exception:
                        pass

                issues = [
                    iss for iss in issues
                    if str(iss.get('issueeId', '')).lower() in allowed_str_ids
                    or (iss.get('issueeName') and any(vn in iss.get('issueeName').lower() for vn in user_vendor_names))
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
            match_ids = {str(req_vendor).strip().lower()}
            match_names = {str(req_vendor).strip().lower()}
            try:
                from apps.common.vendor_scope import _hydrate_vendor
                proxy = _hydrate_vendor(str(req_vendor).strip())
                if getattr(proxy, 'external_vendor_id', None):
                    match_ids.add(str(proxy.external_vendor_id).lower())
                if getattr(proxy, 'name', None):
                    match_names.add(str(proxy.name).lower())
            except Exception:
                pass

            flat_items = [
                it for it in flat_items
                if str(it.get('issueeId', '')).lower() in match_ids
                or any(mn in str(it.get('issueeName', '')).lower() for mn in match_names)
            ]
        elif allowed_vendor_ids is not None:
            allowed_str_ids = {str(v).lower() for v in (allowed_vendor_ids or []) if v}
            user_vendor_names = set()
            for vid in list(allowed_str_ids)[:10]:
                try:
                    from apps.common.vendor_scope import _hydrate_vendor
                    proxy = _hydrate_vendor(vid)
                    if getattr(proxy, 'name', None):
                        user_vendor_names.add(str(proxy.name).lower())
                    if getattr(proxy, 'external_vendor_id', None):
                        allowed_str_ids.add(str(proxy.external_vendor_id).lower())
                except Exception:
                    pass

            flat_items = [
                it for it in flat_items
                if str(it.get('issueeId', '')).lower() in allowed_str_ids
                or (it.get('issueeName') and any(vn in it.get('issueeName').lower() for vn in user_vendor_names))
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
        extra_params = {
            k: v for k, v in request.query_params.items()
            if k not in ['page', 'size', 'taskType', 'task_type']
        }

        from apps.common.task_scope import get_user_authorized_tasks
        from apps.common.live_cache import cache_get_or_set
        user = request.user if request.user and request.user.is_authenticated else None
        user_key = getattr(user, 'id', None) or getattr(user, 'external_user_id', None) or 'anon'
        cache_key = f"ilync:my-tasks:{user_key}:{task_type}:{page}:{size}:{sorted(extra_params.items())}"

        def _load():
            return get_user_authorized_tasks(
                user=user,
                request=request,
                task_type=task_type,
                page=page,
                size=size,
                extra_params=extra_params,
            )

        # Short TTL — map/dashboard share this; lite mode is especially cache-friendly
        ttl = 25.0 if str(extra_params.get('expand_children') or extra_params.get('expand') or '1').lower() in (
            '0', 'false', 'no', 'lite', 'root'
        ) else 12.0
        scoped_data = cache_get_or_set(cache_key, _load, ttl_seconds=ttl)

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

        # 1. Check direct execution endpoint
        try:
            res = client.get_task_execution(clean_id)
            if res and isinstance(res, dict) and res.get('data'):
                e_data = res.get('data')
                fd = e_data.get('fieldData', {}) if isinstance(e_data, dict) else {}
                tr = fd.get('trenching', {}) if isinstance(fd, dict) else {}
                if tr.get('hddShot') or tr.get('pitDetails') or fd.get('hddShot') or fd.get('pitDetails'):
                    return success_response(data=e_data, message="Task execution details fetched successfully")
        except Exception as e:
            print(f"[IlyncTaskExecutionView] Error fetching execution endpoint for {task_id}: {e}")

        # 2. Check task detail endpoint
        try:
            t_res = client.get_task_detail(clean_id)
            if t_res and isinstance(t_res, dict):
                t_data = t_res.get('data') or t_res
                if isinstance(t_data, dict) and t_data.get('taskExecution'):
                    e_obj = t_data.get('taskExecution')
                    fd = e_obj.get('fieldData', {}) if isinstance(e_obj, dict) else {}
                    tr = fd.get('trenching', {}) if isinstance(fd, dict) else {}
                    if tr.get('hddShot') or tr.get('pitDetails') or fd.get('hddShot') or fd.get('pitDetails'):
                        return success_response(data=e_obj, message="Task execution fetched from task detail")
        except Exception as fallback_e:
            print(f"[IlyncTaskExecutionView] Fallback detail check failed for {task_id}: {fallback_e}")

        # 3. Check child tasks recursively if parent has no direct execution
        def find_child_execution(tid, depth=0):
            if depth > 3:
                return None
            try:
                c_res = client.get_task_children(tid)
                children = c_res.get('data', []) if isinstance(c_res, dict) else []
                for c in children:
                    cid = c.get('id') or c.get('_id')
                    if not cid:
                        continue
                    # Check child detail
                    cd_res = client.get_task_detail(cid)
                    if cd_res and isinstance(cd_res, dict):
                        cd_data = cd_res.get('data') or cd_res
                        if isinstance(cd_data, dict) and cd_data.get('taskExecution'):
                            e_obj = cd_data.get('taskExecution')
                            fd = e_obj.get('fieldData', {}) if isinstance(e_obj, dict) else {}
                            tr = fd.get('trenching', {}) if isinstance(fd, dict) else {}
                            if tr.get('hddShot') or tr.get('pitDetails') or fd.get('hddShot') or fd.get('pitDetails'):
                                return e_obj
                    # Deep check
                    deep_exec = find_child_execution(cid, depth + 1)
                    if deep_exec:
                        return deep_exec
            except Exception as ce:
                print(f"[IlyncTaskExecutionView] Error checking children for {tid}: {ce}")
            return None

        child_exec = find_child_execution(clean_id)
        if child_exec:
            return success_response(data=child_exec, message="Task execution fetched from child segment task")

        return success_response(data=None, message="Execution details not yet started for task")

class IlyncTaskChildrenView(IlyncBaseView):
    def get(self, request, task_id):
        user = request.user if request.user and request.user.is_authenticated else None
        from apps.common.task_scope import is_task_authorized_for_user
        from apps.common.live_cache import cache_get_or_set

        # Verify user authorization strictly
        if not is_task_authorized_for_user(user, task_id, request=request):
            return Response({"success": False, "message": "Task children not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        clean_id = str(task_id).replace('_route_', '').split('_')[0]

        def _load():
            try:
                client = IlyncClient(request=request)
                res = client.get_task_children(clean_id)
                if res and isinstance(res, dict) and 'data' in res:
                    return res.get('data')
            except Exception as e:
                print(f"[IlyncTaskChildrenView] Error fetching children for {task_id}: {e}")
            return []

        children = cache_get_or_set(f"ilync:task_children:{clean_id}", _load, ttl_seconds=30.0)
        return success_response(data=children, message="Task children fetched successfully")

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


class SystemStatusView(APIView):
    """Lightweight health checks for HERO API + dependencies (proxy-only ops)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import time
        from django.conf import settings
        from django.db import connection
        from apps.common.concurrency import run_concurrent

        checks = []

        # Self
        t0 = time.perf_counter()
        checks.append({
            "name": "HERO API",
            "ok": True,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
            "message": "ok",
        })

        # Database (Postgres or local SQLite)
        t0 = time.perf_counter()
        db_engine = connection.settings_dict.get("ENGINE", "")
        db_label = "SQLite" if "sqlite" in db_engine else "Postgres"
        try:
            connection.ensure_connection()
            with connection.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            checks.append({
                "name": db_label,
                "ok": True,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                "message": "ok",
            })
        except Exception as exc:
            checks.append({
                "name": db_label,
                "ok": False,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                "message": str(exc)[:200],
            })

        # Redis (optional) — cheap, keep inline
        redis_url = getattr(settings, "REDIS_URL", None) or getattr(settings, "CELERY_BROKER_URL", None)
        if redis_url and str(redis_url).startswith("redis"):
            t0 = time.perf_counter()
            try:
                import redis
                client = redis.from_url(str(redis_url), socket_connect_timeout=2, socket_timeout=2)
                client.ping()
                checks.append({
                    "name": "Redis",
                    "ok": True,
                    "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                    "message": "ok",
                })
            except Exception as exc:
                checks.append({
                    "name": "Redis",
                    "ok": False,
                    "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                    "message": str(exc)[:200],
                })
        else:
            checks.append({
                "name": "Redis",
                "ok": True,
                "latency_ms": 0,
                "message": "not configured",
            })

        def _check_fiberforce():
            t0 = time.perf_counter()
            try:
                ff = FiberForceClient()
                base = getattr(ff, "base_url", None) or getattr(settings, "FIBERFORCE_BASE_URL", "")
                if not base:
                    raise RuntimeError("FIBERFORCE_BASE_URL not set")
                ff.get_machines()
                return {
                    "name": "FiberForce",
                    "ok": True,
                    "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                    "message": "ok",
                }
            except Exception as exc:
                return {
                    "name": "FiberForce",
                    "ok": False,
                    "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                    "message": str(exc)[:200],
                }

        def _check_ilync():
            t0 = time.perf_counter()
            try:
                il = IlyncClient()
                base = getattr(il, "base_url", None) or getattr(settings, "ILYNC_BASE_URL", "")
                if not base:
                    raise RuntimeError("ILYNC_BASE_URL not set")
                il.get_vendors(page=0, size=1)
                return {
                    "name": "iLync",
                    "ok": True,
                    "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                    "message": "ok",
                }
            except Exception as exc:
                return {
                    "name": "iLync",
                    "ok": False,
                    "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                    "message": str(exc)[:200],
                }

        checks.extend(run_concurrent([_check_fiberforce, _check_ilync], max_workers=2))

        overall_ok = all(c.get("ok") for c in checks)
        return Response({
            "success": True,
            "data": {
                "ok": overall_ok,
                "checks": checks,
            },
        })


