import logging
from concurrent.futures import ThreadPoolExecutor
from django.db import transaction
from django.db.models import Q
from apps.authentication.models import User
from apps.roles.models import Role, UserRole
from apps.vendors.models import Vendor, HeroVendorAssignment
from apps.integrations.ilync_client import IlyncClient

logger = logging.getLogger(__name__)


class SyncResult(list):
    """
    Subclass of list holding synced user instances with statistics attributes.
    Maintains 100% backwards compatibility with code expecting a list of users.
    """
    def __init__(self, items=None, created=0, updated=0, unchanged=0, skipped=0, errors=0):
        super().__init__(items or [])
        self.created = created
        self.updated = updated
        self.unchanged = unchanged
        self.skipped = skipped
        self.errors = errors
        self.total_processed = created + updated + unchanged + skipped + errors

    def to_dict(self):
        return {
            'created': self.created,
            'updated': self.updated,
            'unchanged': self.unchanged,
            'skipped': self.skipped,
            'errors': self.errors,
            'total_processed': self.total_processed,
            'synced_count': len(self)
        }


def map_ilync_role(role_key, designation=None):
    rk = str(role_key or '').upper()
    des = str(designation or '').upper()
    if 'ADMIN' in rk or 'ADMIN' in des:
        return 'ADMIN'
    if 'PROJECT MANAGER' in des or 'MANAGER' in des or rk in ('L4_USER', 'L4'):
        return 'MANAGER'
    if 'SUPERVISOR' in des or rk in ('L2_USER', 'L2'):
        return 'SUPERVISOR'
    if 'SURVEYOR' in des or 'OPERATOR' in des or rk in ('L1_USER', 'L1'):
        return 'OPERATOR'
    return 'VIEWER'


def extract_manager_info_from_ilync(ilync_user_data):
    """
    Extracts manager identifier or summary object from an iLync user payload.
    Handles:
    - reportingChain: list of dicts (e.g. [{'empId': '1404711', 'name': 'Yogender Singh', 'designation': 'FIELD_SUPERVISOR'}])
    - reportingTo / reportingPerson / reportingManager
    - reportingToEmpId / reportingPersonId / managerEmpId / managerId
    Returns dict with keys ('ext_id', 'emp_id', 'name', 'phone', 'email', 'designation') or None.
    """
    if not isinstance(ilync_user_data, dict):
        return None

    target = None

    # 1. Primary: reportingChain array (index 0 is direct reporting manager)
    chain = ilync_user_data.get('reportingChain')
    if isinstance(chain, list) and len(chain) > 0:
        target = chain[0]
    elif isinstance(chain, dict):
        target = chain

    # 2. Fallbacks: reportingTo, reportingPerson, reportingManager, manager
    if not target:
        for key in ('reportingTo', 'reportingPerson', 'reportingManager', 'manager'):
            val = ilync_user_data.get(key)
            if val:
                target = val
                break

    # 3. Flat string fields: reportingToEmpId, reportingPersonId, managerEmpId
    if not target:
        emp = (
            ilync_user_data.get('reportingToEmpId') or
            ilync_user_data.get('reportingPersonId') or
            ilync_user_data.get('managerEmpId')
        )
        if emp:
            target = {'empId': str(emp).strip()}

    # 4. Flat ID fields: reportingManagerId, managerId
    if not target:
        m_id = (
            ilync_user_data.get('reportingManagerId') or
            ilync_user_data.get('managerId')
        )
        if m_id:
            target = {'id': str(m_id).strip()}

    if not target:
        return None

    if isinstance(target, str):
        target = {'empId': target.strip()}

    if not isinstance(target, dict):
        return None

    ext_id = str(target.get('id') or target.get('userId') or target.get('externalUserId') or '').strip()
    emp_id = str(target.get('empId') or target.get('employeeId') or target.get('employee_id') or '').strip()
    name = str(target.get('name') or target.get('fullName') or '').strip()
    phone = str(target.get('phoneNumber') or target.get('mobile') or target.get('phone') or '').strip()
    email = str(target.get('email') or '').strip()
    designation = str(target.get('designation') or '').strip()

    if not any([ext_id, emp_id, name, phone, email]):
        return None

    return {
        'ext_id': ext_id,
        'emp_id': emp_id,
        'name': name,
        'phone': phone,
        'email': email,
        'designation': designation,
    }


def resolve_reporting_manager_from_ilync(ilync_user_data, current_user=None):
    """
    Safely resolves the Django User record corresponding to the iLync manager info.
    Matches across:
    1. external_user_id
    2. employee_id / username
    3. phone_number
    4. email
    5. full name (first_name + last_name)
    6. username matching name

    Enforces:
    - User cannot report to themselves.
    - Prevents circular reporting loops via prevent_circular_reporting.
    """
    mgr_info = extract_manager_info_from_ilync(ilync_user_data)
    if not mgr_info:
        return None

    ext_id = mgr_info.get('ext_id')
    emp_id = mgr_info.get('emp_id')
    name = mgr_info.get('name')
    phone = mgr_info.get('phone')
    email = mgr_info.get('email')

    manager = None

    # 1. Match by external_user_id
    if ext_id:
        manager = User.objects.filter(external_user_id=ext_id).first()

    # 2. Match by employee_id or username
    if not manager and emp_id:
        manager = User.objects.filter(
            Q(employee_id=emp_id) | Q(username=emp_id)
        ).first()

    # 3. Match by phone
    if not manager and phone:
        manager = User.objects.filter(phone_number=phone).first()

    # 4. Match by email
    if not manager and email and not str(email).lower().startswith('user@'):
        manager = User.objects.filter(email__iexact=email).first()

    # 5. Match by full name
    if not manager and name:
        parts = name.strip().split(None, 1)
        if len(parts) == 2:
            manager = User.objects.filter(
                first_name__iexact=parts[0],
                last_name__iexact=parts[1]
            ).first()
        if not manager:
            manager = User.objects.filter(first_name__iexact=name).first()
        if not manager:
            manager = User.objects.filter(username__iexact=name).first()

    if not manager:
        return None

    # Cannot report to oneself
    curr_id = getattr(current_user, 'id', None)
    if curr_id and manager.id == curr_id:
        return None

    # Prevent circular reporting
    if current_user and getattr(current_user, 'id', None):
        try:
            from apps.common.reporting_scope import prevent_circular_reporting
            prevent_circular_reporting(current_user, manager)
        except Exception as exc:
            logger.warning(
                "[ILYNC_SYNC] Circular reporting detected for user %s -> manager %s: %s",
                current_user.id, manager.id, exc
            )
            return None

    return manager



def sync_ilync_user_to_django(ilync_user_data, set_password_if_new=None, default_role_name="VIEWER"):
    """
    Safely synchronize an ILYNC user dictionary into the Django User model.

    CRITICAL BUSINESS RULES:
    1. Hero user records and Hero assignments must be STABLE.
    2. When an existing user is found via external_user_id = iLync userId, DO NOT create a duplicate.
    3. HERO ROLE MUST NOT BE OVERWRITTEN. iLync designation does not overwrite Hero roles.
    4. NEVER remove Hero vendor assignments, reporting managers, or permissions during sync.
    5. Missing from response != deactivate user.
    6. Returns tuple: (user_obj, status_str), where status_str is 'CREATED', 'UPDATED', 'UNCHANGED', 'SKIPPED', or 'ERROR'.
    """
    if not isinstance(ilync_user_data, dict):
        return None, 'SKIPPED'

    ext_id = str(ilync_user_data.get('id') or '').strip()
    emp_id = str(ilync_user_data.get('empId') or '').strip()
    phone = str(ilync_user_data.get('phoneNumber') or ilync_user_data.get('mobile') or '').strip()
    if not emp_id and phone:
        emp_id = phone
    if not emp_id and ext_id:
        emp_id = ext_id

    if not ext_id and not emp_id:
        return None, 'SKIPPED'

    name = str(ilync_user_data.get('name') or '').strip()
    email = ilync_user_data.get('email')
    companies = ilync_user_data.get('companies') or []
    raw_active = ilync_user_data.get('active')

    # Resolve vendor reference from iLync payload without clearing existing Hero vendors
    vendor_obj = None
    v_id = str(
        ilync_user_data.get('vendorId') or
        ilync_user_data.get('assignedVendorId') or
        (ilync_user_data.get('vendor', {}).get('id') if isinstance(ilync_user_data.get('vendor'), dict) else '') or
        (ilync_user_data.get('vendorSnapshot', {}).get('id') if isinstance(ilync_user_data.get('vendorSnapshot'), dict) else '') or
        ''
    ).strip()
    v_name = str(
        ilync_user_data.get('vendorName') or
        (ilync_user_data.get('vendor', {}).get('name') if isinstance(ilync_user_data.get('vendor'), dict) else '') or
        (ilync_user_data.get('vendorSnapshot', {}).get('name') if isinstance(ilync_user_data.get('vendorSnapshot'), dict) else '') or
        ''
    ).strip()

    if v_id:
        vendor_obj = Vendor.objects.filter(external_vendor_id=v_id).first()
    if not vendor_obj and v_name:
        vendor_obj = Vendor.objects.filter(name__icontains=v_name).first()
    if not vendor_obj and companies:
        company_name = str(companies[0]).strip()
        if company_name and company_name.upper() not in ['TELECRATS', 'HERO', 'HERO INFRASTRUCTURE']:
            vendor_obj, _ = Vendor.objects.get_or_create(
                name=company_name,
                defaults={
                    'code': company_name.upper()[:10],
                    'email': f"info@{company_name.lower().replace(' ', '')}.com",
                    'is_active': True
                }
            )

    # 1. Look up existing user: primary canonical match is external_user_id
    user = None
    if ext_id:
        user = User.objects.filter(external_user_id=ext_id).first()

    # 2. Secondary fallback matches only if external_user_id not matched
    if not user:
        query_conditions = Q(username=emp_id) | (Q(employee_id=emp_id) if emp_id else Q(id=-1))
        if phone:
            query_conditions |= Q(phone_number=phone)
        user = User.objects.filter(query_conditions).first()

    first_name = name
    last_name = ''
    if ' ' in name:
        parts = name.split(None, 1)
        first_name, last_name = parts[0], parts[1]

    if not user:
        # ----------------------------------------------------
        # CREATE NEW HERO USER
        # ----------------------------------------------------
        base_username = emp_id or phone or (f"u_{ext_id[-8:]}" if ext_id else f"u_{abs(hash(name)) % 100000}")
        username_val = base_username
        idx = 1
        while User.objects.filter(username=username_val).exists():
            username_val = f"{base_username}_{idx}"
            idx += 1

        # Use default Hero role (e.g. VIEWER or mapped role); never invent arbitrary roles
        assigned_role = default_role_name or "VIEWER"
        if default_role_name == "VIEWER":
            mapped = map_ilync_role(ilync_user_data.get('roleKey'), ilync_user_data.get('designation'))
            if mapped:
                assigned_role = mapped

        user_is_active = True
        if raw_active is False:
            user_is_active = False

        reporting_mgr = resolve_reporting_manager_from_ilync(ilync_user_data)

        user = User.objects.create(
            username=username_val,
            external_user_id=ext_id or None,
            employee_id=emp_id or None,
            phone_number=phone or None,
            email=email or f"{username_val}@ilync.tech",
            first_name=first_name,
            last_name=last_name,
            role=assigned_role,
            vendor=vendor_obj,
            reporting_manager=reporting_mgr,
            is_active=user_is_active
        )
        initial_pw = set_password_if_new or 'Pass@123'
        user.set_password(initial_pw)
        user.save()

        # Link default HERO role into ManyToMany UserRoles
        default_role_obj = Role.objects.filter(name__iexact=assigned_role).first()
        if not default_role_obj:
            default_role_obj = Role.objects.filter(code__iexact=assigned_role).first()
        if not default_role_obj:
            default_role_obj = Role.objects.filter(name="Viewer").first() or Role.objects.filter(code="VIEWER").first()
        if default_role_obj:
            user.roles.add(default_role_obj)

        if vendor_obj:
            HeroVendorAssignment.objects.get_or_create(
                user=user,
                vendor=vendor_obj,
                defaults={'is_active': True}
            )

        logger.info("[ILYNC_SYNC] Created new Hero User #%s %s (ext_id: %s) with role %s", user.id, user.username, ext_id, assigned_role)
        return user, 'CREATED'

    else:
        # ----------------------------------------------------
        # UPDATE EXISTING HERO USER SAFELY
        # ----------------------------------------------------
        changed_fields = []

        # Link external_user_id if not previously attached
        if ext_id and user.external_user_id != ext_id:
            user.external_user_id = ext_id
            changed_fields.append('external_user_id')

        # Update profile names only if provided
        if name:
            if user.first_name != first_name:
                user.first_name = first_name
                changed_fields.append('first_name')
            if user.last_name != last_name:
                user.last_name = last_name
                changed_fields.append('last_name')

        # Employee ID
        if emp_id and user.employee_id != emp_id:
            user.employee_id = emp_id
            changed_fields.append('employee_id')

        # Phone Number
        if phone and not user.phone_number:
            user.phone_number = phone
            changed_fields.append('phone_number')

        # Email
        if email and not str(email).lower().startswith('user@') and user.email != email:
            user.email = email
            changed_fields.append('email')

        # Active Status (Section 7 & 12):
        # If iLync explicitly returns active = true, ensure user is marked active
        if raw_active is True and not user.is_active:
            user.is_active = True
            changed_fields.append('is_active')
        elif raw_active is False and user.is_active:
            # Explicit deactivation: only set inactive if no other active vendor assignments
            has_other_active_vendors = user.hero_vendor_assignments.filter(is_active=True).exclude(vendor=vendor_obj).exists() if vendor_obj else False
            if not has_other_active_vendors:
                user.is_active = False
                changed_fields.append('is_active')

        # Preserve existing vendor if already assigned in Hero!
        # Only assign vendor if user currently has none
        if vendor_obj:
            if not user.vendor:
                user.vendor = vendor_obj
                changed_fields.append('vendor')
            HeroVendorAssignment.objects.get_or_create(
                user=user,
                vendor=vendor_obj,
                defaults={'is_active': True}
            )

        # IMMUTABLE RULES (Section 3, 8, 9, 10, 11):
        # DO NOT touch user.role
        # DO NOT touch user.roles
        # DO NOT remove HeroVendorAssignment records

        # Reporting Manager synchronization from iLync
        mgr_info = extract_manager_info_from_ilync(ilync_user_data)
        if mgr_info:
            resolved_mgr = resolve_reporting_manager_from_ilync(ilync_user_data, current_user=user)
            if resolved_mgr and user.reporting_manager_id != resolved_mgr.id:
                try:
                    from apps.common.reporting_scope import prevent_circular_reporting
                    prevent_circular_reporting(user, resolved_mgr)
                    user.reporting_manager = resolved_mgr
                    changed_fields.append('reporting_manager')
                    logger.info("[ILYNC_SYNC] Updated reporting manager for User #%s %s -> %s", user.id, user.username, resolved_mgr.username)
                except Exception as exc:
                    logger.warning("[ILYNC_SYNC] Circular reporting prevented for User #%s %s: %s", user.id, user.username, exc)

        if set_password_if_new:
            user.set_password(set_password_if_new)
            changed_fields.append('password')

        if changed_fields:
            user.save(update_fields=list(set(changed_fields)))
            logger.info("[ILYNC_SYNC] Updated profile for Hero User #%s %s (fields: %s)", user.id, user.username, changed_fields)
            return user, 'UPDATED'
        else:
            return user, 'UNCHANGED'


def enrich_users_with_details(client, user_items):
    """
    Concurrently enriches user items that lack 'reportingChain' by calling
    the full detail endpoint api/users/id/{id}.
    """
    if not hasattr(client, 'get_user_by_id'):
        return user_items

    items_to_fetch = [
        u for u in user_items
        if isinstance(u, dict) and 'reportingChain' not in u and u.get('id')
    ]
    if not items_to_fetch:
        return user_items

    def _fetch_one(item):
        u_id = item.get('id')
        try:
            res = client.get_user_by_id(u_id)
            if isinstance(res, dict) and res.get('success') and isinstance(res.get('data'), dict):
                return u_id, res['data']
        except Exception as exc:
            logger.debug("[ILYNC_SYNC] Could not fetch detail for %s: %s", u_id, exc)
        return u_id, None

    max_workers = min(20, max(1, len(items_to_fetch)))
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            details_map = dict(executor.map(_fetch_one, items_to_fetch))
    except Exception as exc:
        logger.warning("[ILYNC_SYNC] Detail enrichment pool failed: %s", exc)
        details_map = {}

    for item in user_items:
        if isinstance(item, dict):
            detail = details_map.get(item.get('id'))
            if detail and isinstance(detail, dict):
                if 'reportingChain' in detail:
                    item['reportingChain'] = detail.get('reportingChain')
                for k in ('circles', 'districts', 'blockIds', 'locationCodes', 'client', 'project', 'projectCode', 'userLevel'):
                    if k in detail and k not in item:
                        item[k] = detail[k]

    return user_items


def fetch_and_sync_all_ilync_users(max_pages=100, size=100, default_role_name="VIEWER"):
    """
    Centralized, safe external user synchronization service.
    Fetches all pages from ILYNC API, validates HTTP status, processes all pagination,
    enriches users with reporting chain hierarchy, and updates/creates Hero users.

    Returns SyncResult (subclass of list).
    """
    client = IlyncClient()
    synced_users = []
    created_count = 0
    updated_count = 0
    unchanged_count = 0
    skipped_count = 0
    errors_count = 0

    try:
        # Page 0 test & totalPages discovery
        first_page = client.get_users(page=0, size=size)
        if not first_page or not isinstance(first_page, dict) or not first_page.get('success'):
            logger.error("[ILYNC_SYNC] API failure on initial request - no user state modified.")
            return SyncResult([], created=0, updated=0, unchanged=0, skipped=0, errors=1)

        data = first_page.get('data') or {}
        total_pages = data.get('totalPages') or 1
        total_elements = data.get('totalElements') or 0
        logger.info("[ILYNC_SYNC] Starting sync: totalElements=%s, totalPages=%s, pageSize=%s", total_elements, total_pages, size)

        # Collect raw items from page 0
        all_raw_items = []
        content_0 = data.get('content') or data.get('results') or [] if isinstance(data, dict) else (data if isinstance(data, list) else [])
        all_raw_items.extend(content_0)

        # Fetch remaining pages safely up to min(total_pages, max_pages)
        pages_to_fetch = min(total_pages, max_pages)
        for page_idx in range(1, pages_to_fetch):
            try:
                page_res = client.get_users(page=page_idx, size=size)
                if not page_res or not isinstance(page_res, dict) or not page_res.get('success'):
                    logger.warning("[ILYNC_SYNC] Page %s failed or returned non-success; halting pagination safely.", page_idx)
                    errors_count += 1
                    break

                page_data = page_res.get('data') or {}
                page_content = page_data.get('content') or page_data.get('results') or [] if isinstance(page_data, dict) else (page_data if isinstance(page_data, list) else [])
                all_raw_items.extend(page_content)

            except Exception as e:
                logger.error("[ILYNC_SYNC] Network/API exception fetching page %s: %s", page_idx, str(e))
                errors_count += 1
                break

        # Enrich items with full details (reportingChain, etc.) concurrently
        enriched_items = enrich_users_with_details(client, all_raw_items)

        # Pass 1: Sync all users to Django
        pending_manager_sync = []
        for u_data in enriched_items:
            try:
                u_obj, status_str = sync_ilync_user_to_django(u_data, default_role_name=default_role_name)
                if status_str == 'CREATED':
                    created_count += 1
                    synced_users.append(u_obj)
                elif status_str == 'UPDATED':
                    updated_count += 1
                    synced_users.append(u_obj)
                elif status_str == 'UNCHANGED':
                    unchanged_count += 1
                    synced_users.append(u_obj)
                elif status_str == 'SKIPPED':
                    skipped_count += 1
                else:
                    errors_count += 1

                if u_obj and u_obj.reporting_manager is None and extract_manager_info_from_ilync(u_data):
                    pending_manager_sync.append((u_obj, u_data))

            except Exception as e:
                logger.error("[ILYNC_SYNC] Error processing user record: %s", str(e))
                errors_count += 1

        # Pass 2: Resolve forward-referenced reporting managers
        for u_obj, u_data in pending_manager_sync:
            try:
                mgr = resolve_reporting_manager_from_ilync(u_data, current_user=u_obj)
                if mgr and u_obj.reporting_manager_id != mgr.id:
                    from apps.common.reporting_scope import prevent_circular_reporting
                    prevent_circular_reporting(u_obj, mgr)
                    u_obj.reporting_manager = mgr
                    u_obj.save(update_fields=['reporting_manager'])
                    logger.info("[ILYNC_SYNC] (Pass 2) Resolved reporting manager %s for user %s", mgr.username, u_obj.username)
            except Exception as exc:
                logger.debug("[ILYNC_SYNC] (Pass 2) Could not link reporting manager for %s: %s", u_obj.username, exc)

    except Exception as e:
        logger.error("[ILYNC_SYNC] API failure: %s - no user state modified.", str(e))
        errors_count += 1

    logger.info(
        "[ILYNC_SYNC] users_received=%d created=%d updated=%d unchanged=%d skipped=%d errors=%d",
        len(synced_users), created_count, updated_count, unchanged_count, skipped_count, errors_count
    )

    return SyncResult(
        synced_users,
        created=created_count,
        updated=updated_count,
        unchanged=unchanged_count,
        skipped=skipped_count,
        errors=errors_count
    )
