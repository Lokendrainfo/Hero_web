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
        machines_data = v_data.get('machines') or v_data.get('assigned_machines') or []
        for m_info in machines_data:
            if not isinstance(m_info, dict):
                continue
            m_id = m_info.get('id')
            chassis = str(m_info.get('machineNo') or m_info.get('machine_no') or m_info.get('serial_number') or m_info.get('chassis_no') or m_info.get('name') or '').strip()
            if m_id and str(m_id).isdigit():
                Machine.objects.filter(id=int(m_id)).update(vendor=vendor_obj)
            if chassis:
                Machine.objects.filter(
                    Q(machine_chassis_no=chassis) | Q(serial_number=chassis)
                ).update(vendor=vendor_obj)

        # Link & Upsert Users
        users_data = v_data.get('users') or []
        synced_user_ids = []

        for u_info in users_data:
            if not isinstance(u_info, dict):
                continue
            ext_u_id = str(u_info.get('userId') or u_info.get('id') or '').strip()
            if ext_u_id.lower() in ('none', 'null', ''):
                ext_u_id = ''
            emp_id = u_info.get('empId')
            emp_id_str = str(emp_id).strip() if emp_id and str(emp_id).lower() not in ('none', 'null') else ''
            mobile = str(u_info.get('mobile') or u_info.get('phone') or u_info.get('phoneNumber') or '').strip()
            email = str(u_info.get('email') or '').strip()
            name = str(u_info.get('name') or u_info.get('contactName') or '').strip()
            designation = str(u_info.get('designation') or 'OPERATOR').strip()

            matched_user = None
            # 1. Primary canonical: iLync userId -> Hero User.external_user_id
            if ext_u_id:
                matched_user = User.objects.filter(external_user_id=ext_u_id).first()
            # 2. Secondary fallback matches for pre-existing local records
            if not matched_user and emp_id_str:
                matched_user = User.objects.filter(Q(employee_id=emp_id_str) | Q(username=emp_id_str)).first()
            if not matched_user and mobile:
                matched_user = User.objects.filter(Q(phone_number=mobile) | Q(username=mobile)).first()
            if not matched_user and email and not email.lower().startswith('user@'):
                matched_user = User.objects.filter(email__iexact=email).first()
            if not matched_user and name:
                clean_name = name.split()[0] if name else ''
                matched_user = User.objects.filter(vendor=vendor_obj, first_name__iexact=clean_name).first()

            u_role = 'VENDOR' if designation.upper() == 'VENDOR' else ('TRACKER' if 'TRACK' in designation.upper() else 'OPERATOR')
            if matched_user:
                changed = False
                if name:
                    parts = name.split(None, 1)
                    first = parts[0]
                    last = parts[1] if len(parts) > 1 else ''
                    if matched_user.first_name != first or (last and matched_user.last_name != last):
                        matched_user.first_name = first
                        matched_user.last_name = last
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
                if ext_u_id and matched_user.external_user_id != ext_u_id:
                    matched_user.external_user_id = ext_u_id
                    changed = True
                if emp_id_str and matched_user.employee_id != emp_id_str:
                    matched_user.employee_id = emp_id_str
                    changed = True
                if mobile and not matched_user.phone_number:
                    matched_user.phone_number = mobile
                    changed = True
                if changed:
                    matched_user.save()
                HeroVendorAssignment.objects.get_or_create(
                    user=matched_user,
                    vendor=vendor_obj,
                    defaults={'is_active': True}
                )
                synced_user_ids.append(matched_user.id)
            elif ext_u_id or mobile or name:
                base_usr = emp_id_str or mobile or ext_u_id or f"VND-{vendor_obj.id}-{name.replace(' ', '')}"
                username_val = base_usr
                idx = 1
                while User.objects.filter(username=username_val).exists():
                    username_val = f"{base_usr}_{idx}"
                    idx += 1

                parts = name.split(None, 1) if name else [username_val, '']
                first = parts[0]
                last = parts[1] if len(parts) > 1 else ''

                new_user = User.objects.create(
                    username=username_val,
                    external_user_id=ext_u_id or None,
                    employee_id=emp_id_str or None,
                    phone_number=mobile or '',
                    email=email or f"{username_val}@ilync.tech",
                    first_name=first,
                    last_name=last,
                    role=u_role,
                    vendor=vendor_obj,
                    is_active=True
                )
                HeroVendorAssignment.objects.get_or_create(
                    user=new_user,
                    vendor=vendor_obj,
                    defaults={'is_active': True}
                )
                synced_user_ids.append(new_user.id)

        # Remove / unassign any duplicate database users for this vendor that are not in the iLync vendor users array
        if synced_user_ids:
            stale_users = User.objects.filter(vendor=vendor_obj).exclude(id__in=synced_user_ids)
            from apps.attendance.models import AttendanceRecord
            for su in list(stale_users):
                if not AttendanceRecord.objects.filter(user=su).exists():
                    su.delete()
                else:
                    su.vendor = None
                    su.save()

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

