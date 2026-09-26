import logging
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
        # DO NOT touch user.reporting_manager
        # DO NOT remove HeroVendorAssignment records

        if set_password_if_new:
            user.set_password(set_password_if_new)
            changed_fields.append('password')

        if changed_fields:
            user.save(update_fields=list(set(changed_fields)))
            logger.info("[ILYNC_SYNC] Updated profile for Hero User #%s %s (fields: %s)", user.id, user.username, changed_fields)
            return user, 'UPDATED'
        else:
            return user, 'UNCHANGED'


def fetch_and_sync_all_ilync_users(max_pages=100, size=100, default_role_name="VIEWER"):
    """
    Centralized, safe external user synchronization service.
    Fetches all pages from ILYNC API, validates HTTP status, processes all pagination,
    and updates/creates Hero users without deactivating or stripping assignments.

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

        # Process page 0
        content_0 = data.get('content') or data.get('results') or [] if isinstance(data, dict) else (data if isinstance(data, list) else [])
        for u_data in content_0:
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
            except Exception as e:
                logger.error("[ILYNC_SYNC] Error processing user record: %s", str(e))
                errors_count += 1

        # Fetch remaining pages safely up to min(total_pages, max_pages)
        pages_to_fetch = min(total_pages, max_pages)
        for page_idx in range(1, pages_to_fetch):
            try:
                page_res = client.get_users(page=page_idx, size=size)
                if not page_res or not isinstance(page_res, dict) or not page_res.get('success'):
                    logger.warning("[ILYNC_SYNC] Page %s failed or returned non-success; halting pagination safely without deactivating users.", page_idx)
                    errors_count += 1
                    break

                page_data = page_res.get('data') or {}
                page_content = page_data.get('content') or page_data.get('results') or [] if isinstance(page_data, dict) else (page_data if isinstance(page_data, list) else [])

                for u_data in page_content:
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
                    except Exception as e:
                        logger.error("[ILYNC_SYNC] Error processing user record on page %s: %s", page_idx, str(e))
                        errors_count += 1

            except Exception as e:
                logger.error("[ILYNC_SYNC] Network/API exception fetching page %s: %s", page_idx, str(e))
                errors_count += 1
                break

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
