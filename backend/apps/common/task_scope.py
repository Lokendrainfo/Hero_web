from concurrent.futures import ThreadPoolExecutor
from apps.integrations.ilync_client import IlyncClient
from apps.common.vendor_scope import (
    get_user_vendor_ids,
    check_vendor_access,
    get_user_vendor,
    _hydrate_vendor,
    _as_ext_id,
)

def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _vendor_name_token(ext_id):
    """First word of live vendor name for iLync search — never hits Vendor table."""
    if not ext_id:
        return None
    try:
        proxy = _hydrate_vendor(str(ext_id))
        name = (getattr(proxy, 'name', None) or '').strip()
        if name and name != str(ext_id):
            return name.split()[0].strip()
    except Exception:
        pass
    text = str(ext_id).strip()
    return text if text and not text.isdigit() else None


def get_user_authorized_tasks(user, request=None, task_type=None, page=0, size=50, extra_params=None):
    """
    Single source of truth for authorized task visibility across My Tasks, Dashboard, Maps, and Detail views.
    Strictly enforces role-based vendor scope, Advance User geographical scope, and Reporting Manager scope.

    Pass expand_children=0|false|lite in extra_params / query to skip deep iLync child + execution fan-out
    (used by map-view/trenching for a fast root list; children load on demand).
    """
    if extra_params is None:
        extra_params = {}
    else:
        extra_params = dict(extra_params)

    expand_flag = str(
        extra_params.pop('expand_children', None)
        or extra_params.pop('expand', None)
        or '1'
    ).strip().lower()
    expand_children = expand_flag not in ('0', 'false', 'no', 'lite', 'root')

    req_vendor = None
    if request:
        q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
        req_vendor = q_params.get('vendor_id') or q_params.get('vendor')
        if 'expand_children' in q_params or 'expand' in q_params:
            expand_flag = str(q_params.get('expand_children') or q_params.get('expand') or expand_flag).strip().lower()
            expand_children = expand_flag not in ('0', 'false', 'no', 'lite', 'root')
    if not req_vendor:
        req_vendor = extra_params.get('vendor_id') or extra_params.get('vendor')

    # If a specific vendor is requested or scoped, dynamically derive vendor search query for upstream iLync search
    if 'search' not in extra_params and 'query' not in extra_params:
        search_term = None
        if req_vendor and str(req_vendor).strip() and str(req_vendor).lower() not in ['all', 'undefined', 'null', 'none']:
            val_str = str(req_vendor).strip()
            search_term = _vendor_name_token(val_str) or (val_str if not val_str.isdigit() else None)
        elif user and user.is_authenticated:
            allowed_v_ids = get_user_vendor_ids(user)
            if allowed_v_ids:
                search_term = _vendor_name_token(allowed_v_ids[0])

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
        target_ext_vids.extend([str(v) for v in allowed_v_ids if v])
    elif req_vendor and str(req_vendor).strip() and str(req_vendor).lower() not in ['all', 'undefined', 'null', 'none']:
        val_str = _as_ext_id(req_vendor)
        if val_str:
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
        raw_data = client.get_my_tasks(task_type=req_task_type, page=page, size=size, params=extra_params)
        
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

    # Parallel fetch child task hierarchy (Levels 1 & 2) — skip in lite/root mode for map speed
    def fetch_children_batch(tasks_list):
        def fetch_c(t):
            tid = t.get('id')
            if not tid:
                return []
            try:
                c_res = client.get_task_children(tid)
                return c_res.get('data', []) if isinstance(c_res, dict) else []
            except Exception:
                return []

        with ThreadPoolExecutor(max_workers=10) as executor:
            return list(executor.map(fetch_c, tasks_list))

    if expand_children:
        level1_children_lists = fetch_children_batch(base_content)
    else:
        level1_children_lists = [[] for _ in base_content]
    
    level1_flat = []
    for i, root in enumerate(base_content):
        c_list = level1_children_lists[i] if i < len(level1_children_lists) else []
        level1_flat.extend(c_list)

    if expand_children:
        level2_children_lists = fetch_children_batch(level1_flat)
    else:
        level2_children_lists = []

    # Parallel fetch execution telemetry for segment tasks to derive accurate covered length
    all_raw_tasks = list(base_content) + list(level1_flat)
    for l2_sub in level2_children_lists:
        all_raw_tasks.extend(l2_sub)

    seg_candidates = []
    if expand_children:
        seg_candidates = [
            t for t in all_raw_tasks
            if isinstance(t, dict) and (
                str((t.get('routeSnapshot') if isinstance(t.get('routeSnapshot'), dict) else {}).get('level') or '').upper() == 'SEGMENT'
                or t.get('depth') == 2
                or not t.get('totalSegments')
            )
        ]

    def fetch_exec(t):
        tid = t.get('id')
        if not tid:
            return (t, None)
        try:
            e_res = client.get_task_execution(tid)
            e_data = e_res.get('data') if isinstance(e_res, dict) else None
            return (t, e_data)
        except Exception:
            return (t, None)

    if seg_candidates:
        with ThreadPoolExecutor(max_workers=10) as executor:
            exec_pairs = list(executor.map(fetch_exec, seg_candidates))

        for task_obj, exec_data in exec_pairs:
            if not task_obj or not isinstance(exec_data, dict):
                continue
            field_data = exec_data.get('fieldData') or exec_data.get('trenching') or exec_data
            trenching = field_data.get('trenching') if isinstance(field_data, dict) else (field_data if isinstance(field_data, dict) else {})
            shots = (trenching.get('hddShot') if isinstance(trenching, dict) else None) or exec_data.get('shots') or field_data.get('hddShot') or []

            if isinstance(shots, list) and len(shots) > 0:
                tot_m = sum(float(s.get('tentativeShotLength') or s.get('lengthMeters') or 0) for s in shots if isinstance(s, dict))
                if tot_m > 0:
                    task_obj['coveredLengthKm'] = round(tot_m / 1000.0, 3)

    known_map = {
        '6a852f2600cd99ac6337f4a9': 'HARPAL INFRA DEVELOPMENT',
        '6a7c2b4f8e16e804697f18b0': 'Gurukripa Enterprises',
        '6a8bdb93b8fd1ac215ebfeed': 'KHALSA TELECOM',
        '6a7e941d4312cab2fd6d36cc': 'Hero Infrastructure',
        '6a8a77d5b8fd1ac215ebfeeb': 'Naveen Telecom',
        '6a8badb1b8fd1ac215ebfeec': 'Naveen Telecom Network',
        '6a97b260544bdedf53d4ec0c': 'Naveen Telecom Network 1',
        '6a9d22c43fe4e1b061d189a9': 'Naveen Telecom Network 2',
        '6a82e6f24312cab2fd6d36cd': 'Pranjal Enterprises',
        '6a8fc284544bdedf53d4ec09': 'Raj Enterprises'
    }

    expanded_results = []
    seen_task_ids = set()

    def format_and_add(t, parent_vid=None, parent_vname=None):
        tid = str(t.get('id') or t.get('taskCode') or '')
        if tid in seen_task_ids:
            return None, None
        seen_task_ids.add(tid)

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

        if raw_vname and str(raw_vname).strip() and str(raw_vname).strip() != 'Telecrats':
            eff_vname = str(raw_vname).strip()
        elif parent_vname:
            eff_vname = parent_vname
        elif eff_vid:
            eff_vname = known_map.get(eff_vid.lower())
            if not eff_vname:
                try:
                    proxy = _hydrate_vendor(str(eff_vid))
                    name = (getattr(proxy, 'name', None) or '').strip()
                    if name and name != str(eff_vid):
                        eff_vname = name
                except Exception:
                    pass
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
        return eff_vid, eff_vname

    for i, root in enumerate(base_content):
        r_vid, r_vname = format_and_add(root)

        l1_list = level1_children_lists[i] if i < len(level1_children_lists) else []
        for l1 in l1_list:
            l1_vid, l1_vname = format_and_add(l1, parent_vid=r_vid, parent_vname=r_vname)

            try:
                idx = level1_flat.index(l1)
                l2_list = level2_children_lists[idx] if idx < len(level2_children_lists) else []
                for l2 in l2_list:
                    format_and_add(l2, parent_vid=l1_vid, parent_vname=l1_vname)
            except ValueError:
                pass

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
            try:
                proxy = _hydrate_vendor(str(req_vendor).strip())
                if getattr(proxy, 'external_vendor_id', None):
                    target_match_ids.add(str(proxy.external_vendor_id).lower())
                if getattr(proxy, 'code', None):
                    target_match_ids.add(str(proxy.code).lower())
                if getattr(proxy, 'name', None):
                    target_match_names.add(str(proxy.name).lower())
            except Exception:
                pass

    elif allowed_vendor_ids is not None:
        # Non-admin vendor user — allowed ids are already external string ids
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

        for vid in allowed_vendor_ids:
            target_match_ids.add(str(vid).lower())
            try:
                proxy = _hydrate_vendor(str(vid))
                if getattr(proxy, 'external_vendor_id', None):
                    target_match_ids.add(str(proxy.external_vendor_id).lower())
                if getattr(proxy, 'code', None):
                    target_match_ids.add(str(proxy.code).lower())
                if getattr(proxy, 'name', None):
                    target_match_names.add(str(proxy.name).lower())
            except Exception:
                pass

        # If assigned vendor is parent company Telecrats, do not filter out sub-vendor execution tasks
        if any(name in ['telecrats', 'telecrats site project', 'hero web'] for name in target_match_names) or '17' in target_match_ids:
            target_match_ids.clear()
            target_match_names.clear()

    # Advance Geography Scope Filter
    if user and user.is_authenticated and user.user_type == 'ADVANCE':
        geo_circle = user.selected_circle.name.lower() if user.selected_circle else None
        geo_district = user.selected_district.name.lower() if user.selected_district else None
        geo_block = user.selected_block.name.lower() if user.selected_block else None

        filtered_geo_tasks = []
        for t in expanded_results:
            t_circle = str(t.get('circle') or t.get('state') or t.get('circleName') or '').strip().lower()
            t_district = str(t.get('district') or t.get('districtName') or '').strip().lower()
            t_block = str(t.get('block') or t.get('blockName') or '').strip().lower()

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
                assignee_id = str(t.get('assignedToId') or t.get('assigneeId') or as_snap.get('userId') or as_snap.get('id') or t.get('userId') or t.get('assignedUser') or t.get('assignee') or t.get('user', {}).get('id') or '').strip().lower()
                assignee_email = str(t.get('assignedToEmail') or t.get('assigneeEmail') or as_snap.get('email') or as_snap.get('mobile') or t.get('user', {}).get('email') or '').strip().lower()

                # If task has an assignee, check if assignee is in reporting scope
                if assignee_id or assignee_email:
                    user_ok = (assignee_id in allowed_user_identifiers) or (assignee_email in allowed_user_identifiers)

            geo_ok = True
            if target_circle_name or target_district_name or target_block_name:
                loc = t.get('locationSnapshot') or t.get('location') or {}
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
        return {
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

    calc_tot = len(expanded_results)
    return {
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
                        allowed_str_ids = {str(vid) for vid in allowed_vendor_ids if vid}
                        if v_id not in allowed_str_ids:
                            return False

                # Advance User Geography Check (string geo ids — no Circle/District/Block tables)
                if getattr(user, 'user_type', None) == 'ADVANCE':
                    loc = task_obj.get('locationSnapshot') or task_obj.get('location') or {}
                    t_circle = str(loc.get('circle') or loc.get('state') or task_obj.get('circle') or task_obj.get('state') or '').strip().lower()
                    t_district = str(loc.get('district') or task_obj.get('district') or '').strip().lower()
                    t_block = str(loc.get('blockName') or loc.get('block') or task_obj.get('blockName') or task_obj.get('block') or '').strip().lower()

                    if user.advance_scope_type == 'CIRCLE' and user.selected_circle_id:
                        target = str(user.selected_circle_id).strip().lower()
                        if target and t_circle and target not in t_circle and t_circle not in target:
                            return False
                    elif user.advance_scope_type == 'DISTRICT' and getattr(user, 'selected_district_id', None):
                        target_dist = str(user.selected_district_id).strip().lower()
                        if target_dist and t_district and target_dist not in t_district and t_district not in target_dist:
                            return False
                    elif user.advance_scope_type == 'BLOCK' and getattr(user, 'selected_block_id', None):
                        target_blk = str(user.selected_block_id).strip().lower()
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

    # 2. Fallback: check against full authorized live task list (lite — no child fan-out)
    scoped_res = get_user_authorized_tasks(
        user=user,
        request=request,
        task_type='ALL',
        page=0,
        size=100,
        extra_params={'expand_children': '0'},
    )
    task_list = scoped_res.get('results', []) if isinstance(scoped_res, dict) else []

    for t in task_list:
        t_id = str(t.get('id') or t.get('taskCode') or t.get('_id') or '').strip()
        t_clean = t_id.replace('_route_', '').split('_')[0]
        if clean_id == t_clean or clean_id == t_id or str(task_id) == t_id:
            return True

    return False


