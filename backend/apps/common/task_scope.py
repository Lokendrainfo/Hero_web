from concurrent.futures import ThreadPoolExecutor
from apps.integrations.ilync_client import IlyncClient
from apps.common.vendor_scope import get_user_vendor_ids, check_vendor_access
from apps.vendors.models import Vendor

def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default

def get_user_authorized_tasks(user, request=None, task_type=None, page=0, size=50, extra_params=None):
    """
    Single source of truth for authorized task visibility across My Tasks and Dashboard.
    Strictly enforces role-based vendor scope.
    If user has 0 assigned tasks or 0 vendor access, returns empty results ([]) and total = 0.
    """
    if not task_type or str(task_type).upper() in ['ALL', 'NONE', 'UNDEFINED']:
        task_type = 'FIBER_TRENCHING_DUCTING_TASK'

    client = IlyncClient(request=request)
    raw_data = client.get_my_tasks(task_type=task_type, page=page, size=size, params=extra_params)
    
    # Extract base task list and pagination metadata
    base_content = []
    total_elements = None
    total_pages = None
    current_page = page
    page_size = size

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

    # Parallel fetch child task hierarchy (Levels 1 & 2)
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

    level1_children_lists = fetch_children_batch(base_content)
    
    level1_flat = []
    for i, root in enumerate(base_content):
        c_list = level1_children_lists[i] if i < len(level1_children_lists) else []
        level1_flat.extend(c_list)

    level2_children_lists = fetch_children_batch(level1_flat)

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

        vid = str(
            t.get('vendorId') or
            t.get('assignedVendorId') or
            t.get('vendorSnapshot', {}).get('id') or
            t.get('vendorSnapshot', {}).get('_id') or
            t.get('vendor', {}).get('id') or
            t.get('vendor') or
            ''
        ).strip()

        raw_vname = (
            t.get('vendorName') or
            t.get('vendorSnapshot', {}).get('partnerName') or
            t.get('vendorSnapshot', {}).get('name') or
            t.get('taskExecution', {}).get('fieldData', {}).get('trenching', {}).get('trenchingMachineDetails', {}).get('vendorName')
        )

        eff_vid = vid if vid else (parent_vid or '')

        if raw_vname and str(raw_vname).strip() and str(raw_vname).strip() != 'Telecrats':
            eff_vname = str(raw_vname).strip()
        elif parent_vname:
            eff_vname = parent_vname
        elif eff_vid:
            eff_vname = known_map.get(eff_vid.lower())
            if not eff_vname:
                v_obj = Vendor.objects.filter(external_vendor_id=eff_vid).first()
                if v_obj:
                    eff_vname = v_obj.name
        else:
            eff_vname = None

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

    is_admin = bool(user and (user.is_superuser or 'ADMIN' in user.get_role_list()))
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

    if target_match_ids or target_match_names or (has_subordinates and allowed_user_identifiers):
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
                assignee_id = str(t.get('assignedToId') or t.get('assigneeId') or t.get('userId') or t.get('assignedUser') or t.get('assignee') or t.get('user', {}).get('id') or '').strip().lower()
                assignee_email = str(t.get('assignedToEmail') or t.get('assigneeEmail') or t.get('user', {}).get('email') or '').strip().lower()

                # If task has an assignee, check if assignee is in reporting scope
                if assignee_id or assignee_email:
                    user_ok = (assignee_id in allowed_user_identifiers) or (assignee_email in allowed_user_identifiers)

            if vendor_ok and user_ok:
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

