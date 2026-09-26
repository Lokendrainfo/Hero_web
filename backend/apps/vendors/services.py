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
        if isinstance(ext_v_id, dict):
            res = ext_v_id
            ext_v_id = res.get('id') or getattr(vendor_obj, 'external_vendor_id', None)
        else:
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
            mapping_status = 'MISSING'

            # 1. Primary canonical: iLync userId -> Hero User.external_user_id
            if ext_u_id:
                ext_matches = list(User.objects.filter(external_user_id=ext_u_id))
                if len(ext_matches) > 1:
                    mapping_status = 'DUPLICATE_EXTERNAL_ID'
                    print(
                        f"[iLyncMapping] vendor_external_id={ext_v_id} | vendor_hero_id={vendor_obj.id} | "
                        f"iLync_userId={ext_u_id} | iLync_empId={emp_id_str} | "
                        f"Hero_user_id=None | Hero_external_user_id={ext_u_id} | "
                        f"Hero_vendor_id=None | mapping_status=DUPLICATE_EXTERNAL_ID"
                    )
                    continue
                elif len(ext_matches) == 1:
                    cand = ext_matches[0]
                    matched_user = cand
                    mapping_status = 'CORRECT'
                    if cand.vendor_id and cand.vendor_id != vendor_obj.id:
                        HeroVendorAssignment.objects.get_or_create(
                            user=cand,
                            vendor_id=cand.vendor_id,
                            defaults={'is_active': True}
                        )

            # 2. Secondary fallback matches ONLY within the SAME vendor, and ONLY if user has no external_user_id
            # Rule 4: NEVER match an iLync user to another vendor's Hero User.
            # Rule 5: NEVER change an existing Hero User.external_user_id to another iLync user's ID.
            # Rule 6: NEVER reuse an existing Hero User just because mobile number, username, empId, name or another secondary field matches if that user belongs to another vendor.
            if not matched_user and mapping_status != 'CROSS_VENDOR_CONFLICT':
                cand_qs = User.objects.filter(vendor=vendor_obj)
                cand_user = None
                if emp_id_str:
                    cand_user = cand_qs.filter(Q(employee_id=emp_id_str) | Q(username=emp_id_str)).first()
                if not cand_user and mobile:
                    cand_user = cand_qs.filter(Q(phone_number=mobile) | Q(username=mobile)).first()
                if not cand_user and email and not email.lower().startswith('user@'):
                    cand_user = cand_qs.filter(email__iexact=email).first()
                if not cand_user and name:
                    clean_name = name.split()[0] if name else ''
                    cand_user = cand_qs.filter(first_name__iexact=clean_name).first()

                if cand_user:
                    if cand_user.external_user_id and cand_user.external_user_id != ext_u_id:
                        mapping_status = 'CROSS_VENDOR_CONFLICT'
                        print(
                            f"[iLyncMapping] vendor_external_id={ext_v_id} | vendor_hero_id={vendor_obj.id} | "
                            f"iLync_userId={ext_u_id} | iLync_empId={emp_id_str} | "
                            f"Hero_user_id={cand_user.id} | Hero_external_user_id={cand_user.external_user_id} | "
                            f"Hero_vendor_id={cand_user.vendor_id} | mapping_status=CROSS_VENDOR_CONFLICT"
                        )
                        cand_user = None
                    else:
                        matched_user = cand_user
                        mapping_status = 'CORRECT'

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
                # Preserve existing Hero role (Section 8: Hero role is controlled by Hero RBAC)
                if not matched_user.role or (matched_user.role == 'VIEWER' and not matched_user.roles.exists()):
                    matched_user.role = u_role or 'OPERATOR'
                    changed = True
                if not matched_user.vendor:
                    matched_user.vendor = vendor_obj
                    changed = True
                if ext_u_id and not matched_user.external_user_id:
                    matched_user.external_user_id = ext_u_id
                    changed = True
                if emp_id_str and not matched_user.employee_id:
                    matched_user.employee_id = emp_id_str
                    changed = True
                if mobile and not matched_user.phone_number:
                    matched_user.phone_number = mobile
                    changed = True
                if changed:
                    matched_user.save()
                assignment, _ = HeroVendorAssignment.objects.get_or_create(
                    user=matched_user,
                    vendor=vendor_obj,
                    defaults={'is_active': True}
                )
                if not assignment.is_active:
                    assignment.is_active = True
                    assignment.save(update_fields=['is_active'])
                synced_user_ids.append(matched_user.id)
                print(
                    f"[iLyncMapping] vendor_external_id={ext_v_id} | vendor_hero_id={vendor_obj.id} | "
                    f"iLync_userId={ext_u_id} | iLync_empId={emp_id_str} | "
                    f"Hero_user_id={matched_user.id} | Hero_external_user_id={matched_user.external_user_id} | "
                    f"Hero_vendor_id={matched_user.vendor_id} | mapping_status={mapping_status}"
                )
            elif (ext_u_id or mobile or name) and mapping_status != 'CROSS_VENDOR_CONFLICT':
                # Rule 9: If iLync user has no valid Hero User mapping: create a new Hero User
                # Assign: external_user_id = iLync userId, vendor = correct Hero vendor
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
                mapping_status = 'CORRECT'
                print(
                    f"[iLyncMapping] vendor_external_id={ext_v_id} | vendor_hero_id={vendor_obj.id} | "
                    f"iLync_userId={ext_u_id} | iLync_empId={emp_id_str} | "
                    f"Hero_user_id={new_user.id} | Hero_external_user_id={new_user.external_user_id} | "
                    f"Hero_vendor_id={new_user.vendor_id} | mapping_status={mapping_status}"
                )
            else:
                print(
                    f"[iLyncMapping] vendor_external_id={ext_v_id} | vendor_hero_id={vendor_obj.id} | "
                    f"iLync_userId={ext_u_id} | iLync_empId={emp_id_str} | "
                    f"Hero_user_id=None | Hero_external_user_id=None | "
                    f"Hero_vendor_id=None | mapping_status={mapping_status}"
                )

        # Section 3, 4, 9, 13: Never delete or deactivate assignments or users during normal sync
        logger.info(
            f"[iLyncMapping] vendor_external_id={ext_v_id} | vendor_hero_id={vendor_obj.id} | "
            f"Synced {len(synced_user_ids)} users. All existing assignments and user master records preserved."
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

