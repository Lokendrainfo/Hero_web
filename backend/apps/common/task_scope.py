import re
import time
import logging
import requests
import concurrent.futures
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from django.conf import settings
from apps.integrations.exceptions import IlyncTimeoutException, IlyncAPIException, IlyncNotFoundException
from apps.integrations.ilync_client import IlyncClient
from apps.common.vendor_scope import get_user_vendor_ids, check_vendor_access
from apps.vendors.models import Vendor
from apps.common.ttl_cache import ttl_get, ttl_set

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))

def parse_iso_epoch(val):
    if not val:
        return None
    if isinstance(val, (int, float)):
        return float(val / 1000.0 if val > 1e11 else val)
    val_str = str(val).strip()
    if not val_str or val_str in ['N/A', '—']:
        return None
    if val_str.isdigit():
        num = float(val_str)
        return float(num / 1000.0 if num > 1e11 else num)
    m = re.match(r'^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?', val_str)
    if m:
        dd, mm, yyyy, h, mnt, sec = m.groups()
        try:
            # Field device and survey timestamps from India are in Asia/Kolkata (IST: UTC+05:30)
            dt = datetime(int(yyyy), int(mm), int(dd), int(h or 0), int(mnt or 0), int(sec or 0), tzinfo=IST)
            return dt.timestamp()
        except Exception:
            pass
    try:
        clean_iso = val_str.replace('Z', '+00:00')
        dt = datetime.fromisoformat(clean_iso)
        if dt.tzinfo is None:
            # Naive ISO without timezone from Indian services is in IST
            dt = dt.replace(tzinfo=IST)
        return dt.timestamp()
    except Exception:
        pass
    return None

def resolve_latest_task_timestamp(task_obj, exec_data=None):
    candidates = [
        task_obj.get('updatedAt'),
        task_obj.get('lastModified'),
        task_obj.get('modifiedAt'),
        task_obj.get('createdAt'),
    ]
    if isinstance(exec_data, dict):
        candidates.extend([
            exec_data.get('updatedAt'),
            exec_data.get('createdAt'),
        ])
        fd = exec_data.get('fieldData') or exec_data.get('trenching') or {}
        if isinstance(fd, dict):
            candidates.append(fd.get('submittedAt'))
            tr = fd.get('trenching') if isinstance(fd.get('trenching'), dict) else fd
            shots = tr.get('hddShot') or tr.get('shots') or exec_data.get('shots') or []
            pits = tr.get('pitDetails') or tr.get('pits') or exec_data.get('pits') or []
            if isinstance(shots, list):
                for s in shots:
                    if isinstance(s, dict):
                        candidates.extend([s.get('hddEndTime'), s.get('hddStartTime'), s.get('updatedAt'), s.get('createdAt')])
                        dps = s.get('depthCapture') or s.get('depthReadings') or []
                        if isinstance(dps, list):
                            for dp in dps:
                                if isinstance(dp, dict):
                                    candidates.extend([
                                        dp.get('capturedAt'),
                                        dp.get('depthCaptureStartTime'),
                                        dp.get('depthCaptureEndTime'),
                                        (dp.get('depthoMeterImage') if isinstance(dp.get('depthoMeterImage'), dict) else {}).get('capturedAt'),
                                        dp.get('createdAt'),
                                        dp.get('timestamp')
                                    ])
            if isinstance(pits, list):
                for p in pits:
                    if isinstance(p, dict):
                        candidates.extend([p.get('pitDiggingTime'), p.get('updatedAt'), p.get('createdAt')])

    epochs = [parse_iso_epoch(c) for c in candidates if parse_iso_epoch(c) is not None]
    if epochs:
        max_ep = max(epochs)
        dt = datetime.fromtimestamp(max_ep, tz=timezone.utc)
        return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    return task_obj.get('updatedAt')

def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default

def get_user_authorized_tasks(user, request=None, task_type=None, page=0, size=50, extra_params=None, expand_hierarchy=None, include_telemetry=None):
    """
    Single source of truth for authorized task visibility across My Tasks, Dashboard, Maps, and Detail views.
    Strictly enforces role-based vendor scope, Advance User geographical scope, and Reporting Manager scope.
    """
    if extra_params is None:
        extra_params = {}
    else:
        extra_params = dict(extra_params)

    req_vendor = None
    if request:
        q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
        req_vendor = q_params.get('vendor_id') or q_params.get('vendor')
    if not req_vendor:
        req_vendor = extra_params.get('vendor_id') or extra_params.get('vendor')

    # Resolve whether to expand entire child hierarchy (Levels 1 & 2 child tasks).
    # Default to True so all routes, segments, districts, blocks, and users are included.
    if expand_hierarchy is None:
        if request is not None:
            q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
            expand_val = q_params.get('expand') or q_params.get('expand_hierarchy') or q_params.get('include_children')
            if expand_val is not None:
                expand_hierarchy = str(expand_val).lower() in ('1', 'true')
            else:
                expand_hierarchy = True
        elif extra_params and ('expand_hierarchy' in extra_params or 'expand' in extra_params):
            expand_val = extra_params.get('expand_hierarchy') or extra_params.get('expand')
            expand_hierarchy = str(expand_val).lower() in ('1', 'true')
        else:
            expand_hierarchy = True

    # Resolve whether to query live execution telemetry (api/task-executions/<id>) for each leaf task.
    # Omit for task listing endpoints (my-tasks) to keep response time fast (~0.6s).
    # Enable for dashboard machine output or when ?telemetry=true is explicitly requested.
    if include_telemetry is None:
        if request is not None:
            q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
            telem_val = q_params.get('telemetry') or q_params.get('include_telemetry')
            live_val = q_params.get('live')
            if telem_val is not None:
                include_telemetry = str(telem_val).lower() in ('1', 'true')
            elif live_val is not None and str(live_val).lower() in ('1', 'true'):
                include_telemetry = True
            else:
                path = getattr(request, 'path', '') or ''
                if 'tasks/my-tasks' in path:
                    include_telemetry = False
                else:
                    include_telemetry = True
        elif extra_params and ('include_telemetry' in extra_params or 'telemetry' in extra_params or 'live' in extra_params):
            telem_val = extra_params.get('include_telemetry') or extra_params.get('telemetry') or extra_params.get('live')
            include_telemetry = str(telem_val).lower() in ('1', 'true')
        else:
            include_telemetry = True

    # Fast cache retrieval if not explicitly requesting refresh and not running test suite
    import sys
    is_testing = 'test' in sys.argv or getattr(settings, 'TESTING', False)

    force_refresh = is_testing
    if request and not force_refresh:
        q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
        force_refresh = (
            str(q_params.get('refresh', '')).lower() in ('1', 'true')
            or str(q_params.get('nocache', '')).lower() in ('1', 'true')
        )
    if not force_refresh and extra_params:
        force_refresh = (
            str(extra_params.get('refresh', '')).lower() in ('1', 'true')
            or str(extra_params.get('nocache', '')).lower() in ('1', 'true')
        )

    auth_cache_key = None
    u_id = getattr(user, 'id', 'anon') if user else 'anon'
    u_type = getattr(user, 'user_type', '') if user else ''
    extra_tuple = tuple(sorted((str(k), str(v)) for k, v in extra_params.items())) if extra_params else ()
    auth_cache_key = f"auth_tasks:{u_id}:{u_type}:{task_type}:{page}:{size}:{req_vendor}:{expand_hierarchy}:{include_telemetry}:{extra_tuple}"

    if not force_refresh:
        cached_res = ttl_get(auth_cache_key)
        if cached_res is not None:
            return cached_res

    # If a specific vendor is requested or scoped, dynamically derive vendor search query for upstream iLync search
    if 'search' not in extra_params and 'query' not in extra_params:
        search_term = None
        if req_vendor and str(req_vendor).strip() and str(req_vendor).lower() not in ['all', 'undefined', 'null', 'none']:
            val_str = str(req_vendor).strip()
            v_obj = Vendor.objects.filter(id=int(val_str)).first() if val_str.isdigit() else Vendor.objects.filter(external_vendor_id=val_str).first() or Vendor.objects.filter(name__icontains=val_str).first()
            if v_obj and v_obj.name:
                search_term = v_obj.name.split()[0].strip()
            elif not val_str.isdigit():
                search_term = val_str
        elif user and user.is_authenticated:
            allowed_v_ids = get_user_vendor_ids(user)
            if allowed_v_ids:
                v_obj = Vendor.objects.filter(id__in=allowed_v_ids).first()
                if v_obj and v_obj.name:
                    search_term = v_obj.name.split()[0].strip()

        if search_term and len(search_term) >= 2:
            extra_params['search'] = search_term

    req_task_type = task_type
    if not task_type or str(task_type).upper() in ['ALL', 'NONE', 'UNDEFINED']:
        req_task_type = None

    client = IlyncClient(request=request)

    # Identify target external_vendor_id(s) to fetch tasks specifically by vendor
    target_ext_vids = []
    allowed_v_ids = get_user_vendor_ids(user) if user and user.is_authenticated else None

    if allowed_v_ids is not None and len(allowed_v_ids) > 0:
        for v_db_id in allowed_v_ids:
            v_obj = Vendor.objects.filter(id=v_db_id).first()
            if v_obj and v_obj.external_vendor_id:
                target_ext_vids.append(v_obj.external_vendor_id)
            elif v_obj:
                try:
                    resolved_v = get_user_vendor(user)
                    if resolved_v and resolved_v.external_vendor_id:
                        target_ext_vids.append(resolved_v.external_vendor_id)
                except Exception:
                    pass
    elif req_vendor and str(req_vendor).strip() and str(req_vendor).lower() not in ['all', 'undefined', 'null', 'none']:
        val_str = str(req_vendor).strip()
        v_obj = Vendor.objects.filter(id=int(val_str)).first() if val_str.isdigit() else Vendor.objects.filter(external_vendor_id=val_str).first() or Vendor.objects.filter(name__icontains=val_str).first()
        if v_obj and v_obj.external_vendor_id:
            target_ext_vids.append(v_obj.external_vendor_id)
        elif not val_str.isdigit():
            target_ext_vids.append(val_str)

    base_content = []
    total_elements = None
    total_pages = None
    current_page = page
    page_size = size

    if target_ext_vids:
        all_vendor_tasks = []
        seen_t_ids = set()
        for ext_v_id in set(target_ext_vids):
            try:
                res = client.get_tasks_by_vendor(ext_v_id)
                t_items = res.get('data', []) if isinstance(res, dict) else (res if isinstance(res, list) else [])
                if isinstance(t_items, list):
                    for item in t_items:
                        if isinstance(item, dict):
                            t_id = item.get('id') or item.get('taskCode')
                            if t_id and t_id not in seen_t_ids:
                                seen_t_ids.add(t_id)
                                if not item.get('vendorId'):
                                    item['vendorId'] = ext_v_id
                                all_vendor_tasks.append(item)
            except Exception as e:
                pass

        if req_task_type:
            base_content = [
                t for t in all_vendor_tasks
                if str(t.get('taskType') or t.get('task_type') or '').upper() == str(req_task_type).upper()
            ]
        else:
            base_content = all_vendor_tasks

        total_elements = len(base_content)
        total_pages = 1 if total_elements > 0 else 0
    else:
        raw_data = None
        for attempt in range(2):
            try:
                raw_data = client.get_my_tasks(task_type=req_task_type, page=page, size=size, params=extra_params)
                break
            except Exception as exc:
                logger.warning("[TASK_SCOPE] get_my_tasks attempt %d failed: %s", attempt + 1, exc)
                if attempt == 0:
                    time.sleep(0.5)
                else:
                    if auth_cache_key:
                        stale = ttl_get(auth_cache_key)
                        if stale:
                            logger.info("[TASK_SCOPE] Serving stale cached tasks after live fetch failure")
                            return stale
                    raise

        
        # Extract base task list and pagination metadata
        if isinstance(raw_data, dict):
            data_field = raw_data.get("data")
            if isinstance(data_field, dict):
                base_content = data_field.get("content") or data_field.get("results") or []
                total_elements = data_field.get("totalElements") if "totalElements" in data_field else data_field.get("total")
                total_pages = data_field.get("totalPages") if "totalPages" in data_field else data_field.get("total_pages")
                current_page = data_field.get("currentPage") if "currentPage" in data_field else data_field.get("page", page)
                page_size = data_field.get("pageSize") if "pageSize" in data_field else data_field.get("size", size)
            elif isinstance(data_field, list):
                base_content = data_field
            elif "results" in raw_data and isinstance(raw_data["results"], list):
                base_content = raw_data["results"]
                total_elements = raw_data.get("total") or raw_data.get("totalElements")
                total_pages = raw_data.get("total_pages") or raw_data.get("totalPages")
            elif "content" in raw_data and isinstance(raw_data["content"], list):
                base_content = raw_data["content"]
                total_elements = raw_data.get("totalElements") or raw_data.get("total")
                total_pages = raw_data.get("totalPages") or raw_data.get("total_pages")
                
        if not isinstance(base_content, list):
            base_content = []

    level1_children_lists = []
    level1_flat = []
    level2_children_lists = []

    if expand_hierarchy:
        exec_timeout = getattr(settings, 'ILYNC_TASK_EXECUTION_TIMEOUT', (2.0, 4.0))
        batch_timeout = getattr(settings, 'ILYNC_TASK_EXECUTION_BATCH_TIMEOUT', 15.0)
        max_workers_cfg = getattr(settings, 'ILYNC_TASK_EXECUTION_MAX_WORKERS', 10)

        # Parallel fetch child task hierarchy (Levels 1 & 2)
        def fetch_children_batch(tasks_list):
            def fetch_c(t):
                tid = t.get('id')
                if not tid:
                    return []
                child_cache_key = f"task_children:{tid}"
                if not is_testing:
                    cached_c = ttl_get(child_cache_key)
                    if cached_c is not None:
                        return cached_c
                try:
                    c_res = client.get_task_children(tid)
                    c_data = c_res.get('data', []) if isinstance(c_res, dict) else []
                    if not is_testing:
                        ttl_set(child_cache_key, c_data, ttl_seconds=600)
                    return c_data
                except Exception:
                    return []

            workers = min(max_workers_cfg, max(1, len(tasks_list))) if tasks_list else 1
            with ThreadPoolExecutor(max_workers=workers) as executor:
                return list(executor.map(fetch_c, tasks_list))

        level1_children_lists = fetch_children_batch(base_content)
        
        level1_flat = []
        for i, root in enumerate(base_content):
            c_list = level1_children_lists[i] if i < len(level1_children_lists) else []
            level1_flat.extend(c_list)

        level2_children_lists = fetch_children_batch(level1_flat)

        # Parallel fetch execution telemetry for segment tasks to derive accurate covered length
        all_raw_tasks = list(base_content) + list(level1_flat)
        for l2_sub in level2_children_lists:
            all_raw_tasks.extend(l2_sub)

        # Exclude parent container tasks that have children so we only query leaf tasks for segment telemetry
        parent_ids = set()
        for i, root in enumerate(base_content):
            c_list = level1_children_lists[i] if i < len(level1_children_lists) else []
            if c_list and root.get('id'):
                parent_ids.add(root.get('id'))

        for idx, l1 in enumerate(level1_flat):
            l2_list = level2_children_lists[idx] if idx < len(level2_children_lists) else []
            if l2_list and l1.get('id'):
                parent_ids.add(l1.get('id'))

        if include_telemetry:
            seg_candidates = [
                t for t in all_raw_tasks
                if isinstance(t, dict) and t.get('id') not in parent_ids and (
                    str((t.get('routeSnapshot') if isinstance(t.get('routeSnapshot'), dict) else {}).get('level') or '').upper() == 'SEGMENT'
                    or t.get('depth') == 2
                    or (t.get('totalSegments') == 0)
                    or not t.get('totalSegments')
                )
            ]

            def fetch_exec(t):
                tid = t.get('id')
                if not tid:
                    return (t, None)

                exec_cache_key = f"task_exec:{tid}"
                if not is_testing:
                    cached_exec = ttl_get(exec_cache_key)
                    if cached_exec is not None:
                        if isinstance(cached_exec, dict) and (cached_exec.get('_not_found') or cached_exec.get('_empty')):
                            return (t, None)
                        return (t, cached_exec)

                t0 = time.time()
                try:
                    e_res = client.get_task_execution(tid, timeout=exec_timeout)
                    elapsed_ms = round((time.time() - t0) * 1000, 2)
                    e_data = e_res.get('data') if isinstance(e_res, dict) else None
                    if not is_testing:
                        ttl_set(exec_cache_key, e_data or {'_empty': True}, ttl_seconds=300)
                    return (t, e_data)
                except IlyncNotFoundException:
                    if not is_testing:
                        ttl_set(exec_cache_key, {'_not_found': True}, ttl_seconds=300)
                    return (t, None)
                except (IlyncTimeoutException, requests.exceptions.Timeout) as exc:
                    elapsed_ms = round((time.time() - t0) * 1000, 2)
                    logger.warning(
                        "[TASK_EXECUTION] Timeout fetching telemetry for task_id=%s elapsed=%sms: %s",
                        tid,
                        elapsed_ms,
                        type(exc).__name__,
                    )
                    return (t, None)
                except Exception as exc:
                    elapsed_ms = round((time.time() - t0) * 1000, 2)
                    logger.warning(
                        "[TASK_EXECUTION] Error fetching telemetry for task_id=%s elapsed=%sms: %s",
                        tid,
                        elapsed_ms,
                        type(exc).__name__,
                    )
                    return (t, None)

            if seg_candidates:
                workers = min(max_workers_cfg, max(1, len(seg_candidates)))
                future_to_task = {}
                completed_futures = set()
                exec_pairs = []

                executor = ThreadPoolExecutor(max_workers=workers)
                try:
                    for t in seg_candidates:
                        f = executor.submit(fetch_exec, t)
                        future_to_task[f] = t

                    wait_timeout = batch_timeout if (batch_timeout and batch_timeout > 0) else None
                    try:
                        for future in as_completed(future_to_task, timeout=wait_timeout):
                            completed_futures.add(future)
                            task_obj = future_to_task[future]
                            try:
                                res_task, e_data = future.result()
                                exec_pairs.append((res_task, e_data))
                            except Exception as exc:
                                logger.warning(
                                    "[TASK_EXECUTION] Unexpected future error for task_id=%s: %s",
                                    task_obj.get('id'),
                                    type(exc).__name__,
                                )
                                exec_pairs.append((task_obj, None))
                    except concurrent.futures.TimeoutError:
                        logger.warning(
                            "[TASK_EXECUTION] Batch timeout reached (%ss) for execution telemetry; remaining %s tasks will proceed without telemetry",
                            batch_timeout,
                            len(future_to_task) - len(completed_futures),
                        )
                        for f, t in future_to_task.items():
                            if f not in completed_futures:
                                f.cancel()
                                exec_pairs.append((t, None))
                finally:
                    executor.shutdown(wait=False)

                for task_obj, exec_data in exec_pairs:
                    if not task_obj or not isinstance(exec_data, dict) or exec_data.get('_not_found') or exec_data.get('_empty'):
                        continue

                    # Attach live iLync execution directly to task_obj in-memory (no DB writes)
                    task_obj['taskExecution'] = exec_data
                    
                    # Calculate latest activity timestamp directly from live iLync telemetry
                    latest_iso = resolve_latest_task_timestamp(task_obj, exec_data)
                    if latest_iso:
                        task_obj['updatedAt'] = latest_iso
                        task_obj['lastModified'] = latest_iso

                    field_data = exec_data.get('fieldData') or exec_data.get('trenching') or exec_data
                    trenching = field_data.get('trenching') if isinstance(field_data, dict) else (field_data if isinstance(field_data, dict) else {})
                    shots = (trenching.get('hddShot') if isinstance(trenching, dict) else None) or exec_data.get('shots') or field_data.get('hddShot') or []

                    if isinstance(shots, list) and len(shots) > 0:
                        tot_m = sum(float(s.get('tentativeShotLength') or s.get('lengthMeters') or 0) for s in shots if isinstance(s, dict))
                        if tot_m > 0:
                            task_obj['coveredLengthKm'] = round(tot_m / 1000.0, 3)


    known_map = {
        str(ext_id).lower(): name
        for ext_id, name in Vendor.objects.exclude(external_vendor_id__isnull=True).exclude(external_vendor_id='').values_list('external_vendor_id', 'name')
    }

    expanded_results = []
    seen_task_ids = set()

    def format_and_add(t, parent_vid=None, parent_vname=None, parent_loc=None):
        tid = str(t.get('id') or t.get('taskCode') or '')
        if tid in seen_task_ids:
            return None, None, None
        seen_task_ids.add(tid)

        loc = t.get('locationSnapshot') or t.get('location') or parent_loc or {}
        if not t.get('circle') and loc.get('circle'):
            t['circle'] = loc.get('circle')
        if not t.get('district') and loc.get('district'):
            t['district'] = loc.get('district')
        if not t.get('block') and (loc.get('blockName') or loc.get('block')):
            t['block'] = loc.get('blockName') or loc.get('block')
        if not t.get('state') and (loc.get('state') or loc.get('circle')):
            t['state'] = loc.get('state') or loc.get('circle')
        if not t.get('location') and loc:
            t['location'] = loc

        v_snap = t.get('vendorSnapshot') if isinstance(t.get('vendorSnapshot'), dict) else {}
        v_obj = t.get('vendor') if isinstance(t.get('vendor'), dict) else {}
        exec_snap = t.get('taskExecution') if isinstance(t.get('taskExecution'), dict) else {}
        field_snap = exec_snap.get('fieldData') if isinstance(exec_snap.get('fieldData'), dict) else {}
        trench_snap = field_snap.get('trenching') if isinstance(field_snap.get('trenching'), dict) else {}
        mach_snap = trench_snap.get('trenchingMachineDetails') if isinstance(trench_snap.get('trenchingMachineDetails'), dict) else {}

        vid = str(
            t.get('vendorId') or
            t.get('assignedVendorId') or
            v_snap.get('id') or
            v_snap.get('_id') or
            v_obj.get('id') or
            (t.get('vendor') if isinstance(t.get('vendor'), str) else '') or
            ''
        ).strip()

        raw_vname = (
            t.get('vendorName') or
            v_snap.get('partnerName') or
            v_snap.get('name') or
            mach_snap.get('vendorName')
        )

        eff_vid = vid if vid else (parent_vid or '')

        if raw_vname and str(raw_vname).strip():
            eff_vname = str(raw_vname).strip()
        elif parent_vname:
            eff_vname = parent_vname
        elif eff_vid:
            eff_vname = known_map.get(eff_vid.lower())
            if not eff_vname:
                v_obj_db = Vendor.objects.filter(external_vendor_id=eff_vid).first()
                if v_obj_db:
                    eff_vname = v_obj_db.name
        else:
            eff_vname = None

        from apps.common.progress import calculate_task_progress

        r_snap = t.get('routeSnapshot') if isinstance(t.get('routeSnapshot'), dict) else {}
        tot_km = float(t.get('totalLengthKm') or t.get('plannedLengthKm') or t.get('plannedScopeKm') or r_snap.get('lengthKm') or 0)
        cov_km = float(t.get('coveredLengthKm') or t.get('coveredScopeKm') or 0)
        raw_pct = float(t.get('progress_percent') or t.get('pct') or t.get('progressPercentage') or 0)
        status_val = t.get('status') or t.get('taskStage')

        p_info = calculate_task_progress(planned_distance=tot_km, covered_distance=cov_km, raw_pct=raw_pct, status=status_val)

        t['planned_distance'] = p_info['planned_distance']
        t['covered_distance'] = p_info['covered_distance']
        t['remaining_distance'] = p_info['remaining_distance']
        t['progress_percent'] = p_info['progress_percent']
        t['pct'] = p_info['progress_percent']

        t['vendorId'] = eff_vid
        if eff_vname:
            t['vendorName'] = eff_vname

        expanded_results.append(t)
        return eff_vid, eff_vname, loc

    if expand_hierarchy:
        for i, root in enumerate(base_content):
            l1_list = level1_children_lists[i] if i < len(level1_children_lists) else []
            root_epochs = [parse_iso_epoch(root.get('updatedAt'))]

            for l1 in l1_list:
                l1_epochs = [parse_iso_epoch(l1.get('updatedAt'))]
                try:
                    idx = level1_flat.index(l1)
                    l2_list = level2_children_lists[idx] if idx < len(level2_children_lists) else []
                    for l2 in l2_list:
                        l2_ep = parse_iso_epoch(l2.get('updatedAt'))
                        if l2_ep is not None:
                            l1_epochs.append(l2_ep)
                except ValueError:
                    pass

                valid_l1_eps = [e for e in l1_epochs if e is not None]
                if valid_l1_eps:
                    max_l1 = max(valid_l1_eps)
                    dt = datetime.fromtimestamp(max_l1, tz=timezone.utc)
                    l1['updatedAt'] = dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
                    l1['lastModified'] = l1['updatedAt']
                    root_epochs.append(max_l1)

            valid_r_eps = [e for e in root_epochs if e is not None]
            if valid_r_eps:
                max_r = max(valid_r_eps)
                dt = datetime.fromtimestamp(max_r, tz=timezone.utc)
                root['updatedAt'] = dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
                root['lastModified'] = root['updatedAt']

            r_vid, r_vname, r_loc = format_and_add(root)

            for l1 in l1_list:
                l1_vid, l1_vname, l1_loc = format_and_add(l1, parent_vid=r_vid, parent_vname=r_vname, parent_loc=r_loc)

                try:
                    idx = level1_flat.index(l1)
                    l2_list = level2_children_lists[idx] if idx < len(level2_children_lists) else []
                    for l2 in l2_list:
                        format_and_add(l2, parent_vid=l1_vid, parent_vname=l1_vname, parent_loc=l1_loc)
                except ValueError:
                    pass
    else:
        for root in base_content:
            format_and_add(root)


    # Scoping filter for vendor users or requested vendor_id
    allowed_vendor_ids = get_user_vendor_ids(user) if user else None

    req_vendor = None
    if request:
        q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
        req_vendor = q_params.get('vendor_id') or q_params.get('vendor')

    target_match_ids = set()
    target_match_names = set()

    if req_vendor and str(req_vendor).strip() and str(req_vendor).lower() != 'all':
        if user and user.is_authenticated:
            check_vendor_access(user, req_vendor)

        val_str = str(req_vendor).strip().lower()
        if val_str:
            target_match_ids.add(val_str)
            target_v = Vendor.objects.filter(id=int(req_vendor)).first() if val_str.isdigit() else Vendor.objects.filter(external_vendor_id=val_str).first() or Vendor.objects.filter(name__icontains=val_str).first()
            if target_v:
                if target_v.external_vendor_id:
                    target_match_ids.add(target_v.external_vendor_id.lower())
                target_match_ids.add(str(target_v.id).lower())
                if target_v.code:
                    target_match_ids.add(target_v.code.lower())
                target_match_names.add(target_v.name.lower())

    elif allowed_vendor_ids is not None:
        # Non-admin vendor user
        if not allowed_vendor_ids:
            return {
                "results": [],
                "content": [],
                "total": 0,
                "totalElements": 0,
                "total_pages": 0,
                "totalPages": 0,
                "page": current_page,
                "currentPage": current_page,
                "pageSize": page_size
            }

        for v_db_id in allowed_vendor_ids:
            target_match_ids.add(str(v_db_id).lower())
            v_obj = Vendor.objects.filter(id=v_db_id).first()
            if v_obj:
                if v_obj.external_vendor_id:
                    target_match_ids.add(v_obj.external_vendor_id.lower())
                if v_obj.code:
                    target_match_ids.add(v_obj.code.lower())
                target_match_names.add(v_obj.name.lower())

        # If assigned vendor is parent company / principal contractor, do not filter out sub-vendor execution tasks
        if any(name in ['telecrats', 'telecrats site project', 'hero web', 'hero infrastructure'] for name in target_match_names):
            target_match_ids.clear()
            target_match_names.clear()

    # Advance Geography Scope Filter
    if user and user.is_authenticated and user.user_type == 'ADVANCE':
        geo_circle = user.selected_circle.name.lower() if user.selected_circle else None
        geo_district = user.selected_district.name.lower() if user.selected_district else None
        geo_block = user.selected_block.name.lower() if user.selected_block else None

        filtered_geo_tasks = []
        for t in expanded_results:
            if not isinstance(t, dict):
                continue
            loc = t.get('locationSnapshot') if isinstance(t.get('locationSnapshot'), dict) else (t.get('location') if isinstance(t.get('location'), dict) else {})
            t_circle = str(t.get('circle') or t.get('state') or t.get('circleName') or loc.get('circle') or loc.get('state') or '').strip().lower()
            t_district = str(t.get('district') or t.get('districtName') or loc.get('district') or '').strip().lower()
            t_block = str(t.get('block') or t.get('blockName') or loc.get('blockName') or loc.get('block') or '').strip().lower()

            match = True
            if geo_circle and t_circle and geo_circle not in t_circle and t_circle not in geo_circle:
                match = False
            if user.advance_scope_type in ['DISTRICT', 'BLOCK'] and geo_district and t_district and geo_district not in t_district and t_district not in geo_district:
                match = False
            if user.advance_scope_type == 'BLOCK' and geo_block and t_block and geo_block not in t_block and t_block not in geo_block:
                match = False

            if match:
                filtered_geo_tasks.append(t)

        expanded_results = filtered_geo_tasks

    # Reporting Manager Hierarchy Filter
    from apps.common.reporting_scope import get_reporting_scope
    from apps.authentication.models import User

    is_admin = bool(user and (user.is_superuser or ('ADMIN' in user.get_role_list() if hasattr(user, 'get_role_list') else False)))
    allowed_user_identifiers = set()
    has_subordinates = False

    if user and not is_admin:
        reporting_scope_ids = get_reporting_scope(user)
        if len(reporting_scope_ids) > 1:
            has_subordinates = True
            sub_users = User.objects.filter(id__in=reporting_scope_ids)
            for u in sub_users:
                allowed_user_identifiers.add(str(u.id).lower())
                if u.external_user_id:
                    allowed_user_identifiers.add(str(u.external_user_id).lower())
                if u.employee_id:
                    allowed_user_identifiers.add(str(u.employee_id).lower())
                if u.username:
                    allowed_user_identifiers.add(str(u.username).lower())
                if u.email:
                    allowed_user_identifiers.add(str(u.email).lower())

    # Advance User Geographical Scope Filter
    target_circle_name = None
    target_district_name = None
    target_block_name = None

    if user and user.is_authenticated and getattr(user, 'user_type', None) == 'ADVANCE':
        if user.advance_scope_type == 'CIRCLE' and user.selected_circle:
            target_circle_name = user.selected_circle.name.strip().lower()
        elif user.advance_scope_type == 'DISTRICT' and user.selected_district:
            target_circle_name = user.selected_circle.name.strip().lower() if user.selected_circle else None
            target_district_name = user.selected_district.name.strip().lower()
        elif user.advance_scope_type == 'BLOCK' and user.selected_block:
            target_circle_name = user.selected_circle.name.strip().lower() if user.selected_circle else None
            target_district_name = user.selected_district.name.strip().lower() if user.selected_district else None
            target_block_name = user.selected_block.name.strip().lower()

    if target_match_ids or target_match_names or (has_subordinates and allowed_user_identifiers) or target_circle_name or target_district_name or target_block_name:
        final_tasks = []
        for t in expanded_results:
            if not isinstance(t, dict):
                continue
            t_vid = str(t.get('vendorId') or '').strip().lower()
            t_vname = str(t.get('vendorName') or '').strip().lower()

            vendor_ok = True
            if target_match_ids or target_match_names:
                id_match = bool(t_vid and t_vid in target_match_ids)
                name_match = bool(t_vname and t_vname in target_match_names)
                vendor_ok = id_match or name_match

            user_ok = True
            if has_subordinates and allowed_user_identifiers:
                # Check task assignees / owners against reporting scope
                as_snap = t.get('assigneeSnapshot') if isinstance(t.get('assigneeSnapshot'), dict) else {}
                u_snap = t.get('user') if isinstance(t.get('user'), dict) else {}
                assignee_id = str(t.get('assignedToId') or t.get('assigneeId') or as_snap.get('userId') or as_snap.get('id') or t.get('userId') or t.get('assignedUser') or t.get('assignee') or u_snap.get('id') or '').strip().lower()
                assignee_email = str(t.get('assignedToEmail') or t.get('assigneeEmail') or as_snap.get('email') or as_snap.get('mobile') or u_snap.get('email') or '').strip().lower()

                # If task has an assignee, check if assignee is in reporting scope
                if assignee_id or assignee_email:
                    user_ok = (assignee_id in allowed_user_identifiers) or (assignee_email in allowed_user_identifiers)

            geo_ok = True
            if target_circle_name or target_district_name or target_block_name:
                loc = t.get('locationSnapshot') if isinstance(t.get('locationSnapshot'), dict) else (t.get('location') if isinstance(t.get('location'), dict) else {})
                t_circle = str(loc.get('circle') or loc.get('state') or t.get('circle') or t.get('state') or '').strip().lower()
                t_district = str(loc.get('district') or t.get('district') or '').strip().lower()
                t_block = str(loc.get('blockName') or loc.get('block') or t.get('blockName') or t.get('block') or '').strip().lower()

                if target_circle_name and t_circle and target_circle_name not in t_circle and t_circle not in target_circle_name:
                    geo_ok = False
                if target_district_name and t_district and target_district_name not in t_district and t_district not in target_district_name:
                    geo_ok = False
                if target_block_name and t_block and target_block_name not in t_block and t_block not in target_block_name:
                    geo_ok = False

            if vendor_ok and user_ok and geo_ok:
                final_tasks.append(t)

        calc_tot = len(final_tasks)
        final_payload = {
            "results": final_tasks,
            "content": final_tasks,
            "total": calc_tot,
            "totalElements": calc_tot,
            "total_pages": 1 if calc_tot > 0 else 0,
            "totalPages": 1 if calc_tot > 0 else 0,
            "page": current_page,
            "currentPage": current_page,
            "pageSize": page_size
        }
        if auth_cache_key:
            ttl_set(auth_cache_key, final_payload, ttl_seconds=60)
        return final_payload

    calc_tot = len(expanded_results)
    final_payload = {
        "results": expanded_results,
        "content": expanded_results,
        "total": calc_tot,
        "totalElements": calc_tot,
        "total_pages": 1 if calc_tot > 0 else 0,
        "totalPages": 1 if calc_tot > 0 else 0,
        "page": current_page,
        "currentPage": current_page,
        "pageSize": page_size
    }
    if auth_cache_key:
        ttl_set(auth_cache_key, final_payload, ttl_seconds=60)
    return final_payload


def is_task_authorized_for_user(user, task_id, request=None):
    """
    Central function to check if a specific task_id is authorized for the given authenticated user.
    Enforces:
    - Superuser / Admin access (always authorized)
    - Vendor Scope matching
    - Advance User Geographical Scope matching (Circle / District / Block)
    - Reporting Manager Hierarchy Scope matching
    """
    if not user or not user.is_authenticated:
        return False

    is_admin = bool(user.is_superuser or ('ADMIN' in user.get_role_list() if hasattr(user, 'get_role_list') else False))
    if is_admin:
        return True

    if not task_id:
        return False

    clean_id = str(task_id).replace('_route_', '').split('_')[0].strip()
    if not clean_id:
        return False

    # 1. Direct single task API lookup & authorization check
    try:
        client = IlyncClient(request=request)
        t_res = client.get_task_by_id(clean_id)
        if t_res and isinstance(t_res, dict):
            task_obj = t_res.get('data') or t_res
            if isinstance(task_obj, dict) and (task_obj.get('id') or task_obj.get('taskCode')):
                # Vendor Scope Check
                allowed_vendor_ids = get_user_vendor_ids(user)
                if allowed_vendor_ids is not None:
                    v_id = str(task_obj.get('vendorId') or task_obj.get('assignedVendorId') or '').strip()
                    if v_id and allowed_vendor_ids:
                        from apps.vendors.models import Vendor
                        vendor_objs = Vendor.objects.filter(id__in=allowed_vendor_ids)
                        allowed_str_ids = [str(v.id) for v in vendor_objs] + [str(v.external_vendor_id) for v in vendor_objs if v.external_vendor_id]
                        if v_id not in allowed_str_ids and not any(v_id == str(vid) for vid in allowed_vendor_ids):
                            return False

                # Advance User Geography Check
                if getattr(user, 'user_type', None) == 'ADVANCE':
                    loc = task_obj.get('locationSnapshot') if isinstance(task_obj.get('locationSnapshot'), dict) else (task_obj.get('location') if isinstance(task_obj.get('location'), dict) else {})
                    t_circle = str(loc.get('circle') or loc.get('state') or task_obj.get('circle') or task_obj.get('state') or '').strip().lower()
                    t_district = str(loc.get('district') or task_obj.get('district') or '').strip().lower()
                    t_block = str(loc.get('blockName') or loc.get('block') or task_obj.get('blockName') or task_obj.get('block') or '').strip().lower()

                    if user.advance_scope_type == 'CIRCLE' and user.selected_circle:
                        target = user.selected_circle.name.strip().lower()
                        if target and t_circle and target not in t_circle and t_circle not in target:
                            return False
                    elif user.advance_scope_type == 'DISTRICT' and user.selected_district:
                        target_dist = user.selected_district.name.strip().lower()
                        if target_dist and t_district and target_dist not in t_district and t_district not in target_dist:
                            return False
                    elif user.advance_scope_type == 'BLOCK' and user.selected_block:
                        target_blk = user.selected_block.name.strip().lower()
                        if target_blk and t_block and target_blk not in t_block and t_block not in target_blk:
                            return False

                # Reporting Manager Hierarchy Scope Check
                from apps.common.reporting_scope import get_reporting_scope
                from apps.authentication.models import User
                reporting_scope_ids = get_reporting_scope(user)
                if len(reporting_scope_ids) > 1:
                    sub_users = User.objects.filter(id__in=reporting_scope_ids)
                    allowed_user_identifiers = set()
                    for u in sub_users:
                        allowed_user_identifiers.add(str(u.id).lower())
                        if u.external_user_id: allowed_user_identifiers.add(str(u.external_user_id).lower())
                        if u.employee_id: allowed_user_identifiers.add(str(u.employee_id).lower())
                        if u.username: allowed_user_identifiers.add(str(u.username).lower())
                        if u.email: allowed_user_identifiers.add(str(u.email).lower())

                    as_snap = task_obj.get('assigneeSnapshot') if isinstance(task_obj.get('assigneeSnapshot'), dict) else {}
                    assignee_id = str(task_obj.get('assignedToId') or task_obj.get('assigneeId') or as_snap.get('userId') or as_snap.get('id') or task_obj.get('userId') or '').strip().lower()
                    assignee_email = str(task_obj.get('assignedToEmail') or task_obj.get('assigneeEmail') or as_snap.get('email') or as_snap.get('mobile') or '').strip().lower()
                    if (assignee_id or assignee_email) and (assignee_id not in allowed_user_identifiers and assignee_email not in allowed_user_identifiers):
                        return False

                return True
    except Exception:
        pass

    # 2. Check local DB Task queryset if clean_id is numeric
    if clean_id.isdigit():
        try:
            from apps.tasks.models import Task
            from apps.tasks.views import TaskViewSet
            dummy_req = request
            if not dummy_req:
                from django.test import RequestFactory
                dummy_req = RequestFactory().get('/')
                dummy_req.user = user
            
            v = TaskViewSet()
            v.request = dummy_req
            qs = v.get_queryset()
            if qs.filter(id=int(clean_id)).exists():
                return True
        except Exception:
            pass

    # 3. Fallback: check against full authorized task list
    scoped_res = get_user_authorized_tasks(user=user, request=request, task_type='ALL', page=0, size=100)
    task_list = scoped_res.get('results', []) if isinstance(scoped_res, dict) else []

    for t in task_list:
        t_id = str(t.get('id') or t.get('taskCode') or t.get('_id') or '').strip()
        t_clean = t_id.replace('_route_', '').split('_')[0]
        if clean_id == t_clean or clean_id == t_id or str(task_id) == t_id:
            return True

    return False


