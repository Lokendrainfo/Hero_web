import logging
from apps.vendors.models import Vendor
from apps.integrations.ilync_client import IlyncClient

logger = logging.getLogger(__name__)

def sync_vendor_detail_links(vendor_obj, ext_v_id):
    from django.db.models import Q
    from apps.machines.models import Machine
    from apps.authentication.models import User
    from apps.vendors.models import HeroVendorAssignment

    client = IlyncClient()
    try:
        res = client.get_vendor_by_id(ext_v_id)
        if not res or not isinstance(res, dict):
            return
        
        v_data = res.get('data') if 'data' in res else res
        if not isinstance(v_data, dict):
            return

        # Link Machines
        machines_data = v_data.get('machines') or []
        for m_info in machines_data:
            chassis = str(m_info.get('machineNo') or m_info.get('name') or '').strip()
            if chassis:
                Machine.objects.filter(
                    Q(machine_chassis_no=chassis) | Q(serial_number=chassis)
                ).update(vendor=vendor_obj)

        # Link & Upsert Users
        users_data = v_data.get('users') or []
        for u_info in users_data:
            if not isinstance(u_info, dict):
                continue
            ext_u_id = str(u_info.get('userId') or '').strip()
            mobile = str(u_info.get('mobile') or u_info.get('phone') or '').strip()
            email = str(u_info.get('email') or '').strip()
            name = str(u_info.get('name') or '').strip()
            designation = str(u_info.get('designation') or 'OPERATOR').strip()

            matched_user = None
            if ext_u_id:
                matched_user = User.objects.filter(external_user_id=ext_u_id).first()
            if not matched_user and mobile:
                matched_user = User.objects.filter(Q(phone_number=mobile) | Q(username=mobile)).first()
            if not matched_user and email:
                matched_user = User.objects.filter(email__iexact=email).first()

            u_role = 'VENDOR' if designation.upper() == 'VENDOR' else ('TRACKER' if 'TRACK' in designation.upper() else 'OPERATOR')
            if matched_user:
                changed = False
                if name and matched_user.first_name != name:
                    matched_user.first_name = name
                    matched_user.last_name = ''
                    changed = True
                if email and (not matched_user.email or matched_user.email != email):
                    matched_user.email = email
                    changed = True
                if u_role and matched_user.role != u_role:
                    matched_user.role = u_role
                    changed = True
                if matched_user.vendor != vendor_obj:
                    matched_user.vendor = vendor_obj
                    changed = True
                if ext_u_id and not matched_user.external_user_id:
                    matched_user.external_user_id = ext_u_id
                    changed = True
                if changed:
                    matched_user.save()
                HeroVendorAssignment.objects.get_or_create(
                    user=matched_user,
                    vendor=vendor_obj,
                    defaults={'is_active': True}
                )
            elif name or mobile:
                u_role = 'VENDOR' if designation.upper() == 'VENDOR' else ('OPERATOR' if 'OPERATOR' in designation.upper() else 'TRACKER' if 'TRACKER' in designation.upper() else 'OPERATOR')
                username_val = mobile or ext_u_id or f"VND-{vendor_obj.id}-{name.replace(' ', '')}"
                new_user, _ = User.objects.get_or_create(
                    username=username_val,
                    defaults={
                        'external_user_id': ext_u_id or None,
                        'phone_number': mobile or '',
                        'email': email or f"{username_val}@ilync.tech",
                        'first_name': name,
                        'role': u_role,
                        'vendor': vendor_obj,
                        'is_active': True
                    }
                )
                if new_user.vendor != vendor_obj:
                    new_user.vendor = vendor_obj
                    new_user.save()
                HeroVendorAssignment.objects.get_or_create(
                    user=new_user,
                    vendor=vendor_obj,
                    defaults={'is_active': True}
                )

    except Exception as e:
        logger.error(f"Error syncing detail links for vendor {vendor_obj.name}: {str(e)}")

def fetch_and_sync_all_ilync_vendors(max_pages=5, size=50):
    client = IlyncClient()
    synced_vendors = []

    for page in range(max_pages):
        try:
            res = client.get_vendors(page=page, size=size)
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

            for item in content:
                ext_v_id = str(item.get('id') or '').strip()
                name = str(item.get('partnerName') or item.get('name') or '').strip()
                if not name:
                    continue

                code = ext_v_id[-8:].upper() if ext_v_id else name.upper()[:10]
                v_type = str(item.get('legalEntityType') or 'CONTRACTOR')
                contact = str(item.get('contactName') or '')
                email = str(item.get('email') or '')
                phone = str(item.get('phoneNumber') or '')
                is_active = bool(item.get('active', True))

                vendor, _ = Vendor.objects.update_or_create(
                    name=name,
                    defaults={
                        'external_vendor_id': ext_v_id or None,
                        'code': code,
                        'vendor_code': code,
                        'vendor_type': v_type,
                        'contact_person': contact,
                        'email': email,
                        'phone': phone,
                        'status': 'ACTIVE' if is_active else 'INACTIVE',
                        'is_active': is_active
                    }
                )
                synced_vendors.append(vendor)

                # Sync vendor detail links if external ID present
                if ext_v_id:
                    sync_vendor_detail_links(vendor, ext_v_id)

            is_last = data.get('last', True) if isinstance(data, dict) else True
            if is_last:
                break
        except Exception as e:
            logger.error(f"Error fetching ILYNC vendors page {page}: {str(e)}")
            break

    return synced_vendors

