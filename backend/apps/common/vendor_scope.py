"""
Vendor scoping using external string IDs only — no local Vendor table writes.
"""
from types import SimpleNamespace
from rest_framework.exceptions import PermissionDenied


def _as_ext_id(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in ('all', 'undefined', 'null', 'none'):
        return None
    return text


def get_user_vendor_ids(user, resolve_fallback=True):
    """
    Returns None if unrestricted (ADMIN / GIS / non-vendor role with no assignments).
    Returns list of external vendor id strings if vendor-scoped.
    Returns [] if VENDOR role with zero assignments.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return None

    user_roles = [str(r).upper() for r in user.get_role_list()] if hasattr(user, 'get_role_list') else []
    if getattr(user, 'role', None):
        user_roles.append(str(user.role).upper())

    if getattr(user, 'is_superuser', False) or 'ADMIN' in user_roles or any('GIS' in r for r in user_roles):
        return None

    # Prefer new string-based API on User
    if hasattr(user, 'get_assigned_vendor_ids'):
        ids = user.get_assigned_vendor_ids()
        if ids is None:
            return None
        vendor_ids = list(ids or [])
    else:
        vendor_ids = []

    if not vendor_ids and resolve_fallback:
        v_obj = get_user_vendor(user, resolve_fallback=True)
        if v_obj:
            ext = getattr(v_obj, 'external_vendor_id', None) or getattr(v_obj, 'id', None)
            if ext and str(ext) not in vendor_ids:
                vendor_ids.append(str(ext))

    if not vendor_ids:
        is_vendor_role = any('VENDOR' in r for r in user_roles)
        if not is_vendor_role:
            return None

    return [str(v) for v in vendor_ids if v]


def _vendor_proxy(ext_id, name=None, code=None, raw=None):
    return SimpleNamespace(
        id=str(ext_id),
        pk=str(ext_id),
        external_vendor_id=str(ext_id),
        name=name or str(ext_id),
        code=code or '',
        is_active=True,
        raw=raw or {},
    )


def get_user_vendor(user, resolve_fallback=True):
    """
    Resolves user's primary vendor as a lightweight proxy (external id + name).
    Never creates local Vendor rows.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return None

    ext = _as_ext_id(getattr(user, 'external_vendor_id', None))
    if ext:
        return _hydrate_vendor(ext)

    assigned = getattr(user, 'assigned_vendor_ids', None) or []
    if assigned:
        return _hydrate_vendor(str(assigned[0]))

    if not resolve_fallback:
        return None

    # Live iLync resolve by user id — read only, no DB write
    ext_ids = []
    for attr in ('external_user_id', 'username', 'email', 'phone_number'):
        val = getattr(user, attr, None)
        if val:
            ext_ids.append(str(val))
    if getattr(user, 'id', None):
        ext_ids.append(str(user.id))

    for uid in ext_ids:
        try:
            from apps.integrations.ilync_client import IlyncClient
            res = IlyncClient().get_vendor_by_user_id(uid)
            if res and res.get('success') and res.get('data'):
                v_data = res.get('data') or {}
                ext_v_id = v_data.get('id')
                if ext_v_id:
                    # Live only — do not write vendor strings onto the user during resolve
                    return _vendor_proxy(
                        ext_v_id,
                        name=v_data.get('partnerName') or v_data.get('name'),
                        raw=v_data,
                    )
        except Exception:
            pass

    return None


def _hydrate_vendor(ext_id):
    name = str(ext_id)
    code = ''
    raw = {}
    try:
        from apps.integrations.ilync_client import IlyncClient
        res = IlyncClient().get_vendor_by_id(ext_id)
        if res and res.get('success') and isinstance(res.get('data'), dict):
            raw = res['data']
            name = raw.get('partnerName') or raw.get('name') or name
            code = raw.get('code') or raw.get('vendorCode') or ''
    except Exception:
        pass
    return _vendor_proxy(ext_id, name=name, code=code, raw=raw)


def filter_queryset_by_vendor(queryset, user, vendor_field='vendor_id', request=None):
    """
    Filter queryset by external vendor id string field.
    vendor_field should point at CharField like external_vendor_id (or legacy vendor_id).
    """
    allowed = get_user_vendor_ids(user)
    q_params = {}
    if request is not None:
        q_params = getattr(request, 'query_params', getattr(request, 'GET', {})) or {}

    requested = _as_ext_id(q_params.get('vendor_id') or q_params.get('vendor'))

    # Prefer external_vendor_id column when present on model
    model = queryset.model
    field_names = {f.name for f in model._meta.get_fields()}
    if 'external_vendor_id' in field_names:
        filter_field = 'external_vendor_id'
    else:
        filter_field = vendor_field

    if requested:
        check_vendor_access(user, requested)
        return queryset.filter(**{filter_field: requested})

    if allowed is None:
        return queryset

    if not allowed:
        return queryset.none()

    return queryset.filter(**{f'{filter_field}__in': allowed})


def check_vendor_access(user, vendor_identifier):
    """Raise PermissionDenied if user cannot access the given external vendor id."""
    allowed = get_user_vendor_ids(user)
    if allowed is None:
        return True
    vid = _as_ext_id(vendor_identifier)
    if not vid:
        return True
    if str(vid) not in [str(a) for a in allowed]:
        # Also allow match against hydrated names is not done — strict id match
        raise PermissionDenied("You do not have access to this vendor.")
    return True


def get_user_task_queryset(user, request=None):
    """Tasks are live-proxied; return empty queryset if Task model still exists for compat."""
    try:
        from apps.tasks.models import Task
        return filter_queryset_by_vendor(Task.objects.all(), user, 'external_vendor_id', request=request)
    except Exception:
        from apps.tasks.models import Task
        return Task.objects.none()


def normalize_machine_identifier(value):
    if not value:
        return ""
    return str(value).strip().upper()


def get_user_authorized_machines(user, request=None):
    """
    Live FiberForce machines scoped by iLync-assigned chassis for the user's vendors.
    Returns a list-like of machine dicts or Machine queryset depending on services layer.
    Prefer live path via machines.services.
    """
    from apps.machines.services import fetch_live_fiberforce_machines
    params = {}
    if request is not None:
        q = getattr(request, 'query_params', getattr(request, 'GET', {})) or {}
        params = dict(q.items()) if hasattr(q, 'items') else {}
    res = fetch_live_fiberforce_machines(user, params)
    if not isinstance(res, dict):
        return []
    results = res.get('results')
    if results is None:
        data = res.get('data') or {}
        results = data.get('results') if isinstance(data, dict) else data
    if not isinstance(results, list):
        results = []
    return results
