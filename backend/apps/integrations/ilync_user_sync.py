import logging
from django.db.models import Q
from apps.authentication.models import User
from apps.roles.models import Role, UserRole
from apps.vendors.models import Vendor
from apps.integrations.ilync_client import IlyncClient

logger = logging.getLogger(__name__)

def sync_ilync_user_to_django(ilync_user_data, set_password_if_new=None, default_role_name="VIEWER"):
    """
    Sync an ILYNC user dictionary into Django User model.
    EXTERNAL USER IDENTITY != HERO ROLE.
    External portal controls identity/profile data.
    HERO Django controls roles and permissions.
    """
    ext_id = str(ilync_user_data.get('id') or '').strip()
    emp_id = str(ilync_user_data.get('empId') or ilync_user_data.get('phoneNumber') or ext_id or '').strip()
    if not emp_id and not ext_id:
        return None

    phone = str(ilync_user_data.get('phoneNumber') or '').strip()
    name = str(ilync_user_data.get('name') or '').strip()
    email = ilync_user_data.get('email') or f"{emp_id or ext_id}@ilync.tech"
    companies = ilync_user_data.get('companies') or []
    is_active = ilync_user_data.get('active', True)

    # Vendor lookup / assignment
    vendor_obj = None
    if companies:
        company_name = companies[0]
        if company_name and company_name.strip() and company_name.upper() not in ['TELECRATS', 'HERO', 'HERO INFRASTRUCTURE']:
            vendor_obj, _ = Vendor.objects.get_or_create(
                name=company_name,
                defaults={
                    'code': company_name.upper()[:10],
                    'email': f"info@{company_name.lower().replace(' ', '')}.com",
                    'is_active': True
                }
            )


    # Search existing user by external_user_id first, then employee_id / username / phone
    user = None
    if ext_id:
        user = User.objects.filter(external_user_id=ext_id).first()

    if not user:
        query_conditions = Q(username=emp_id) | (Q(employee_id=emp_id) if emp_id else Q(id=-1))
        if phone:
            query_conditions |= Q(phone_number=phone)
        user = User.objects.filter(query_conditions).first()

    first_name = name
    last_name = ''
    if ' ' in name:
        parts = name.rsplit(' ', 1)
        first_name, last_name = parts[0], parts[1]

    if not user:
        # Create NEW user with configurable default HERO role (default: VIEWER)
        user = User.objects.create(
            username=emp_id or ext_id,
            external_user_id=ext_id or emp_id,
            employee_id=emp_id,
            phone_number=phone,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=default_role_name,
            vendor=vendor_obj,
            is_active=is_active
        )
        initial_pw = set_password_if_new or 'Pass@123'
        user.set_password(initial_pw)
        user.save()

        # Link default HERO role object into UserRole ManyToMany
        default_role_obj = Role.objects.filter(name=default_role_name).first()
        if not default_role_obj:
            default_role_obj = Role.objects.filter(name="VIEWER").first()
        if default_role_obj:
            user.roles.add(default_role_obj)

        logger.info("Created new Django User %s (ext_id: %s) with default HERO role %s", user.username, ext_id, default_role_name)
    else:
        # Update existing user profile WITHOUT resetting HERO role!
        changed = False
        if ext_id and user.external_user_id != ext_id:
            user.external_user_id = ext_id
            changed = True
        if emp_id and user.employee_id != emp_id:
            user.employee_id = emp_id
            changed = True
        if phone and not user.phone_number:
            user.phone_number = phone
            changed = True
        if vendor_obj and user.vendor != vendor_obj:
            user.vendor = vendor_obj
            changed = True
        if name and (not user.first_name or user.first_name != first_name):
            user.first_name = first_name
            user.last_name = last_name
            changed = True
        # Respect HERO local database authority on active/inactive status:
        # If user was deactivated locally (user.is_active is False), do NOT re-activate them via sync.
        # Only deactivate if ILYNC deactivated the user (is_active is False).
        if not is_active and user.is_active:
            user.is_active = False
            changed = True
        if set_password_if_new:
            user.set_password(set_password_if_new)
            changed = True

        if changed:
            user.save()
            logger.info("Updated profile for existing Django User %s (HERO role preserved: %s)", user.username, user.get_role_list())

    return user

def fetch_and_sync_all_ilync_users(max_pages=5, size=50, default_role_name="VIEWER"):
    """
    Fetch users from ILYNC API and sync them into Django DB.
    """
    client = IlyncClient()
    synced_users = []
    
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
                u_obj = sync_ilync_user_to_django(u_data, default_role_name=default_role_name)
                if u_obj:
                    synced_users.append(u_obj)

            is_last = data.get('last', True) if isinstance(data, dict) else True
            if is_last:
                break
        except Exception as e:
            logger.error("Error fetching ILYNC users page %s: %s", page, str(e))
            break

    return synced_users
