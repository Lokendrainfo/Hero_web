import logging
from apps.integrations.ilync_client import IlyncClient

logger = logging.getLogger(__name__)


def map_ilync_role(role_key, designation=None):
    """Map iLync role key / designation to a HERO role name (read-only helper)."""
    key = str(role_key or '').upper()
    des = str(designation or '').upper()
    if 'ADMIN' in key:
        return 'ADMIN'
    if 'MANAGER' in des or 'L4' in key:
        return 'PROJECT_MANAGER'
    if 'SUPERVISOR' in des:
        return 'SUPERVISOR'
    if 'OPERATOR' in des or 'SURVEY' in des or 'L1' in key:
        return 'OPERATOR'
    return 'VIEWER'


def sync_ilync_user_to_django(ilync_user_data, set_password_if_new=None, default_role_name="VIEWER"):
    """
    DISABLED (proxy-only backend).
    External iLync users must not be persisted into HERO DB.
    """
    logger.info(
        "sync_ilync_user_to_django skipped (proxy-only): ext_id=%s",
        (ilync_user_data or {}).get('id'),
    )
    return None


def fetch_and_sync_all_ilync_users(max_pages=20, size=50, default_role_name="VIEWER"):
    """
    DISABLED write path. Fetches live iLync users for listing only (no DB upsert).
    Returns list of raw iLync user dicts.
    """
    client = IlyncClient()
    live_users = []

    for page in range(max_pages):
        try:
            res = client.get_users(page=page, size=size)
            if not res or not res.get('success'):
                break

            data = res.get('data') or {}
            content = []
            if isinstance(data, dict):
                content = data.get('content') or data.get('results') or []
            elif isinstance(data, list):
                content = data

            if not content:
                break

            for u_data in content:
                if isinstance(u_data, dict):
                    live_users.append(u_data)

            is_last = data.get('last', True) if isinstance(data, dict) else True
            if is_last:
                break
        except Exception as e:
            logger.error("Error fetching ILYNC users page %s: %s", page, str(e))
            break

    logger.info("Fetched %d live iLync users (no DB write).", len(live_users))
    return live_users


def map_ilync_user_to_api_dict(u_data):
    """Normalize an iLync user payload into the shape expected by web/mobile User list."""
    if not isinstance(u_data, dict):
        return None
    ext_id = str(u_data.get('id') or '').strip()
    emp_id = str(u_data.get('empId') or u_data.get('phoneNumber') or ext_id or '').strip()
    name = str(u_data.get('name') or '').strip()
    first_name = name
    last_name = ''
    if ' ' in name:
        parts = name.rsplit(' ', 1)
        first_name, last_name = parts[0], parts[1]
    role = map_ilync_role(u_data.get('role') or u_data.get('roleKey'), u_data.get('designation'))
    vendor = u_data.get('vendor') if isinstance(u_data.get('vendor'), dict) else {}
    vendor_id = (
        u_data.get('vendorId')
        or u_data.get('assignedVendorId')
        or vendor.get('id')
        or ''
    )
    return {
        'id': ext_id or emp_id,
        'username': emp_id or ext_id,
        'external_user_id': ext_id,
        'employee_id': emp_id,
        'first_name': first_name,
        'last_name': last_name,
        'name': name or emp_id,
        'email': u_data.get('email') or '',
        'phone_number': u_data.get('phoneNumber') or '',
        'role': role,
        'roles': [role],
        'is_active': bool(u_data.get('active', True)),
        'external_vendor_id': str(vendor_id) if vendor_id else None,
        'vendor_name': vendor.get('name') or u_data.get('vendorName') or '',
        'origin': 'EXTERNAL',
        'is_external': True,
    }
