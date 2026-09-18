from rest_framework.exceptions import PermissionDenied
from apps.vendors.models import Vendor

def get_user_vendor_ids(user, resolve_fallback=True):
    """
    Returns None if user is ADMIN, GIS, or internal non-vendor role (unrestricted access to all execution data).
    Returns list of integer DB primary keys of assigned active vendors if vendor-scoped.
    Returns [] if VENDOR role user has 0 assigned active vendors.
    """
    if not user or not user.is_authenticated:
        return None
    
    user_roles = [str(r).upper() for r in user.get_role_list()] if hasattr(user, 'get_role_list') else []
    if getattr(user, 'role', None):
        user_roles.append(str(user.role).upper())
    
    # Check if user has ADMIN or GIS role or superuser status
    if user.is_superuser or 'ADMIN' in user_roles or any('GIS' in r for r in user_roles):
        return None
    
    # Get active vendor assignments
    vendor_ids = list(
        user.hero_vendor_assignments.filter(
            is_active=True,
            vendor__is_active=True
        ).values_list('vendor_id', flat=True)
    )
    
    # If user has a direct vendor FK fallback, include it as well
    if user.vendor_id and user.vendor_id not in vendor_ids:
        vendor_ids.append(user.vendor_id)

    # Fallback: if vendor_ids is empty, try resolving vendor via get_user_vendor
    if not vendor_ids and resolve_fallback:
        v_obj = get_user_vendor(user, resolve_fallback=True)
        if v_obj and v_obj.id and v_obj.id not in vendor_ids:
            vendor_ids.append(v_obj.id)

    # If non-admin user has no specific vendor assignments:
    # If the user is NOT a VENDOR role, grant full access (None) so map view and tasks render data.
    if not vendor_ids:
        is_vendor_role = any('VENDOR' in r for r in user_roles)
        if not is_vendor_role:
            return None

    return vendor_ids

def get_user_vendor(user, resolve_fallback=True, allow_network=False):
    """
    Resolves authenticated user's vendor record by checking direct assignment,
    local database matching, or (optionally if allow_network=True) calling iLync API.
    Returns Vendor DB object or None.
    """
    if not user or not user.is_authenticated:
        return None

    if getattr(user, 'vendor', None):
        return user.vendor

    from apps.vendors.models import Vendor, HeroVendorAssignment

    # 1. Direct DB HeroVendorAssignment check
    assignment = user.hero_vendor_assignments.filter(is_active=True, vendor__is_active=True).first()
    if assignment and assignment.vendor:
        user.vendor = assignment.vendor
        try:
            user.save(update_fields=['vendor'])
        except Exception:
            pass
        return assignment.vendor

    if resolve_fallback:
        # 2. Fast local DB check: if username / email / first_name matches any Vendor name/code in DB
        u_name = str(getattr(user, 'username', '') or '').strip()
        u_first = str(getattr(user, 'first_name', '') or '').strip()
        u_email = str(getattr(user, 'email', '') or '').strip()
        
        for search_term in [u_name, u_first, u_email]:
            if search_term and len(search_term) >= 3:
                v_db = Vendor.objects.filter(name__icontains=search_term).first()
                if v_db:
                    user.vendor = v_db
                    try:
                        user.save(update_fields=['vendor'])
                    except Exception:
                        pass
                    HeroVendorAssignment.objects.get_or_create(user=user, vendor=v_db, defaults={'is_active': True})
                    return v_db

    # 3. Slow external network calls: ONLY if explicitly allowed (never during latency-critical check-in)
    if allow_network:
        ext_ids = []
        if getattr(user, 'external_user_id', None):
            ext_ids.append(user.external_user_id)
        if getattr(user, 'id', None):
            ext_ids.append(str(user.id))
        if getattr(user, 'username', None):
            ext_ids.append(user.username)
        if getattr(user, 'email', None):
            ext_ids.append(user.email)
        if getattr(user, 'phone_number', None):
            ext_ids.append(user.phone_number)

        for uid in ext_ids:
            try:
                from apps.integrations.ilync_client import IlyncClient
                res = IlyncClient().get_vendor_by_user_id(uid)
                if res and res.get('success') and res.get('data'):
                    v_data = res.get('data', {})
                    ext_v_id = v_data.get('id')
                    v_name = v_data.get('partnerName') or v_data.get('name')
                    if ext_v_id:
                        v_obj = Vendor.objects.filter(external_vendor_id=ext_v_id).first()
                        if not v_obj and v_name:
                            v_obj = Vendor.objects.filter(name=v_name).first()
                        if not v_obj and v_name:
                            v_obj, _ = Vendor.objects.get_or_create(
                                name=v_name,
                                defaults={'external_vendor_id': ext_v_id}
                            )
                        if v_obj:
                            user.vendor = v_obj
                            user.save(update_fields=['vendor'])
                            HeroVendorAssignment.objects.get_or_create(user=user, vendor=v_obj, defaults={'is_active': True})
                            return v_obj
            except Exception:
                pass

        if resolve_fallback:
            try:
                from apps.integrations.ilync_client import IlyncClient
                client = IlyncClient()
                active_vendors = Vendor.objects.filter(is_active=True, external_vendor_id__isnull=False).exclude(external_vendor_id='')
                for v_cand in active_vendors:
                    try:
                        res = client.get_vendor_by_id(v_cand.external_vendor_id)
                        if res and res.get('success') and isinstance(res.get('data'), dict):
                            users_list = res.get('data', {}).get('users', []) or []
                            for u_entry in users_list:
                                if not isinstance(u_entry, dict):
                                    continue
                                u_ext = str(u_entry.get('userId') or u_entry.get('id') or '').strip()
                                u_em = str(u_entry.get('email') or '').strip().lower()
                                u_ph = str(u_entry.get('mobile') or u_entry.get('phone') or '').strip()
                                
                                user_ext = str(getattr(user, 'external_user_id', '') or '').strip()
                                user_em = str(getattr(user, 'email', '') or '').strip().lower()
                                user_ph = str(getattr(user, 'phone_number', '') or getattr(user, 'username', '') or '').strip()

                                match = False
                                if user_ext and u_ext and user_ext == u_ext: match = True
                                elif user_em and u_em and user_em == u_em: match = True
                                elif user_ph and u_ph and user_ph == u_ph: match = True

                                if match:
                                    user.vendor = v_cand
                                    user.save(update_fields=['vendor'])
                                    HeroVendorAssignment.objects.get_or_create(user=user, vendor=v_cand, defaults={'is_active': True})
                                    return v_cand
                    except Exception:
                        pass
            except Exception:
                pass

    return None

def get_user_task_queryset(user, request=None):
    """
    Centralized helper returning authorized Task queryset based on authenticated user's vendor.
    """
    from apps.tasks.models import Task
    return filter_queryset_by_vendor(Task.objects.all(), user, 'vendor_id', request=request)

def normalize_machine_identifier(value):
    """
    Normalizes machine identifier string by converting to uppercase and stripping whitespace.
    Returns empty string if value is None/empty.
    """
    if not value:
        return ""
    return str(value).strip().upper()

def get_user_authorized_machines(user, request=None):
    """
    Single Source of Truth for Machine Authorization & Scoping across HERO WEB.
    For ADMIN / Superuser: returns all FiberForce machines.
    For Vendor user:
      1. Resolves assigned vendor IDs.
      2. Queries iLync vendor API / local Vendors to extract vendor.machines[].
      3. Normalizes iLync machine identifiers (machineNo, name, code, engineNo, id).
      4. Filters FiberForce Machine queryset matching those normalized identifiers.
    """
    from apps.machines.models import Machine
    allowed_vendor_ids = get_user_vendor_ids(user)

    if allowed_vendor_ids is None:
        qs = Machine.objects.all().order_by('id')
        if request:
            q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
            requested_vendor = q_params.get('vendor_id') or q_params.get('vendor')
            if requested_vendor and str(requested_vendor).strip() and str(requested_vendor).strip().lower() not in ['all', 'undefined', 'null', 'none', '']:
                req_vendor_obj = None
                if str(requested_vendor).isdigit():
                    req_vendor_obj = Vendor.objects.filter(id=int(requested_vendor)).first()
                if not req_vendor_obj:
                    req_vendor_obj = Vendor.objects.filter(external_vendor_id=str(requested_vendor)).first()
                if not req_vendor_obj:
                    req_vendor_obj = Vendor.objects.filter(name=str(requested_vendor)).first()
                if req_vendor_obj:
                    return qs.filter(vendor_id=req_vendor_obj.id)
                else:
                    return qs.none()
        return qs

    if not allowed_vendor_ids:
        return Machine.objects.none()

    # Non-admin vendor user: fetch vendor machine identifiers from iLync / DB
    assigned_vendors = Vendor.objects.filter(id__in=allowed_vendor_ids)
    all_identifiers = set()

    for v_obj in assigned_vendors:
        ext_id = v_obj.external_vendor_id
        machines_data = []
        if ext_id:
            try:
                from apps.integrations.ilync_client import IlyncClient
                res = IlyncClient().get_vendor_by_id(ext_id)
                if res and res.get('success'):
                    machines_data = res.get('data', {}).get('machines', []) or []
            except Exception:
                machines_data = []

        for m in machines_data:
            for key in ['machineNo', 'name', 'engineNo', 'id', 'hddHeroId']:
                val = m.get(key)
                if val:
                    all_identifiers.add(normalize_machine_identifier(val))

    # Match against Machine QuerySet
    all_machines = Machine.objects.all().order_by('id')
    matched_ids = []

    for m_obj in all_machines:
        chassis_norm = normalize_machine_identifier(m_obj.machine_chassis_no)
        serial_norm = normalize_machine_identifier(m_obj.serial_number)
        engine_norm = normalize_machine_identifier(m_obj.engine_no)
        id_norm = normalize_machine_identifier(str(m_obj.id))
        name_norm = normalize_machine_identifier(m_obj.name)

        is_assigned_in_ilync = (
            (chassis_norm and chassis_norm in all_identifiers) or
            (serial_norm and serial_norm in all_identifiers) or
            (engine_norm and engine_norm in all_identifiers) or
            (id_norm and id_norm in all_identifiers) or
            (name_norm and name_norm in all_identifiers)
        )

        if is_assigned_in_ilync:
            # Update vendor FK link dynamically
            first_v_id = allowed_vendor_ids[0]
            if m_obj.vendor_id != first_v_id:
                m_obj.vendor_id = first_v_id
                m_obj.save(update_fields=['vendor_id'])
            matched_ids.append(m_obj.id)
        elif m_obj.vendor_id in allowed_vendor_ids:
            if not all_identifiers:
                matched_ids.append(m_obj.id)

    return Machine.objects.filter(id__in=matched_ids).order_by('id')

def check_vendor_access(user, vendor_identifier):
    """
    Validates whether the given user is authorized to access data for a vendor_identifier.
    vendor_identifier can be a DB integer ID, external_vendor_id (str), or vendor name (str).
    Raises PermissionDenied (HTTP 403) if unauthorized.
    """
    allowed_ids = get_user_vendor_ids(user)
    if allowed_ids is None:
        return True  # ADMIN has access to all vendors
    
    if not vendor_identifier:
        return True
    
    if not allowed_ids:
        raise PermissionDenied("No vendor access assigned to your user account.")

    # Match DB ID or string representation of DB ID
    if isinstance(vendor_identifier, int) or (isinstance(vendor_identifier, str) and vendor_identifier.isdigit()):
        v_id = int(vendor_identifier)
        if v_id in allowed_ids:
            return True

    # Match by external_vendor_id
    v_by_ext = Vendor.objects.filter(external_vendor_id=str(vendor_identifier)).first()
    if v_by_ext and v_by_ext.id in allowed_ids:
        return True

    # Match by name
    v_by_name = Vendor.objects.filter(name=str(vendor_identifier)).first()
    if v_by_name and v_by_name.id in allowed_ids:
        return True

    raise PermissionDenied("You do not have permission to access data for this vendor.")

def filter_queryset_by_vendor(queryset, user, vendor_field='vendor_id', request=None):
    """
    Filters a Django QuerySet based on user's vendor scope.
    Also validates any requested `vendor_id` or `vendor` query parameter in `request`.
    """
    from apps.machines.models import Machine
    if queryset.model == Machine:
        return get_user_authorized_machines(user, request=request)

    allowed_ids = get_user_vendor_ids(user)

    if request:
        q_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
        requested_vendor = q_params.get('vendor_id') or q_params.get('vendor')
        if requested_vendor and str(requested_vendor).strip() and str(requested_vendor).strip().lower() not in ['all', 'undefined', 'null', 'none', '']:
            # Strictly verify if user is allowed to access requested vendor
            check_vendor_access(user, requested_vendor)

            # Resolve target vendor object to get exact DB ID
            req_vendor_obj = None
            if str(requested_vendor).isdigit():
                req_vendor_obj = Vendor.objects.filter(id=int(requested_vendor)).first()
            if not req_vendor_obj:
                req_vendor_obj = Vendor.objects.filter(external_vendor_id=str(requested_vendor)).first()
            if not req_vendor_obj:
                req_vendor_obj = Vendor.objects.filter(name=str(requested_vendor)).first()

            if req_vendor_obj:
                filter_kwargs = {vendor_field: req_vendor_obj.id}
                return queryset.filter(**filter_kwargs)
            else:
                return queryset.none()

    if allowed_ids is None:
        return queryset

    if not allowed_ids:
        return queryset.none()

    filter_kwargs = {f"{vendor_field}__in": allowed_ids}
    return queryset.filter(**filter_kwargs)

def validate_machine_vendor_access(user, machine_identifier):
    """
    Validates whether the given user is authorized to access/assign a machine.
    machine_identifier can be a Machine DB ID (int), chassis number (str), or name.
    Raises PermissionDenied (HTTP 403) if unauthorized.
    """
    allowed_ids = get_user_vendor_ids(user)
    if allowed_ids is None:
        return True  # ADMIN has access to all machines

    if not machine_identifier:
        return True

    if not allowed_ids:
        raise PermissionDenied("No vendor access assigned to your user account.")

    auth_machines = get_user_authorized_machines(user)
    m_id_list = list(auth_machines.values_list('id', flat=True))
    m_chassis_list = list(auth_machines.values_list('machine_chassis_no', flat=True))
    m_name_list = list(auth_machines.values_list('name', flat=True))

    norm_target = normalize_machine_identifier(machine_identifier)

    if (isinstance(machine_identifier, int) or str(machine_identifier).isdigit()) and int(machine_identifier) in m_id_list:
        return True

    if norm_target in [normalize_machine_identifier(c) for c in m_chassis_list if c]:
        return True

    if norm_target in [normalize_machine_identifier(n) for n in m_name_list if n]:
        return True

    raise PermissionDenied("Selected machine does not belong to your assigned vendor.")

