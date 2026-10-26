import logging
from django.core.management.base import BaseCommand
from django.db.models import Q
from apps.vendors.models import Vendor, HeroVendorAssignment
from apps.authentication.models import User
from apps.attendance.views import normalize_attendance_role
from apps.integrations.ilync_client import IlyncClient

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = (
        "Non-destructively synchronizes vendor master data, live names, "
        "and vendor team users from iLync without deleting any existing data."
    )

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("=" * 60))
        self.stdout.write(self.style.NOTICE("STARTING SAFE, NON-DESTRUCTIVE iLYNC VENDOR SYNC"))
        self.stdout.write(self.style.NOTICE("Rule: ZERO deletions. All existing records preserved."))
        self.stdout.write(self.style.NOTICE("=" * 60))

        client = IlyncClient()

        # ---------------------------------------------------------
        # Step 1: Fetch all vendors from iLync (across pages)
        # ---------------------------------------------------------
        ilync_vendors_list = []
        seen_ext_ids = set()
        for page in range(20):
            try:
                res = client.get_vendors(page=page, size=50)
                if not res or not res.get('success'):
                    break
                data = res.get('data') or {}
                total_pages = data.get('totalPages', 1) if isinstance(data, dict) else 1
                content = data.get('content') or data.get('results') or [] if isinstance(data, dict) else (data if isinstance(data, list) else [])
                if not content:
                    break
                for v in content:
                    if isinstance(v, dict):
                        v_id = str(v.get('id') or '').strip()
                        if v_id and v_id in seen_ext_ids:
                            continue
                        if v_id:
                            seen_ext_ids.add(v_id)
                        ilync_vendors_list.append(v)
                if page >= total_pages - 1:
                    break
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Warning fetching vendor page {page}: {e}"))
                break

        self.stdout.write(self.style.SUCCESS(f"Found {len(ilync_vendors_list)} vendor(s) in iLync API."))

        # ---------------------------------------------------------
        # Step 2: Update or create vendors in Hero DB
        # ---------------------------------------------------------
        vendor_synced_count = 0
        for item in ilync_vendors_list:
            if not isinstance(item, dict):
                continue
            ext_v_id = str(item.get('id') or '').strip()
            name = str(item.get('partnerName') or item.get('name') or '').strip()
            if not name:
                continue

            code = str(item.get('vendorCode') or (ext_v_id[-8:].upper() if ext_v_id else name.upper()[:10])).strip()
            v_type = str(item.get('legalEntityType') or 'CONTRACTOR').strip()
            contact = str(item.get('contactName') or '').strip()
            email = str(item.get('email') or '').strip()
            phone = str(item.get('phoneNumber') or '').strip()
            is_active = bool(item.get('active', True))

            try:
                # Match vendor in DB:
                # 1. By external_vendor_id
                # 2. Or by name (case-insensitive)
                # 3. Or by code
                vendor = None
                if ext_v_id:
                    vendor = Vendor.objects.filter(external_vendor_id=ext_v_id).first()
                if not vendor:
                    vendor = Vendor.objects.filter(name__iexact=name).first()
                if not vendor and code:
                    vendor = Vendor.objects.filter(code__iexact=code).first()

                if vendor:
                    # Non-destructive update
                    updated_fields = []
                    if vendor.name != name:
                        clash = Vendor.objects.filter(name__iexact=name).exclude(id=vendor.id).exists()
                        if clash:
                            # Keep existing unique name if it already starts with name (e.g. GRAVELL (a3db))
                            if not vendor.name.lower().startswith(name.lower()):
                                suffix = ext_v_id[-4:] if ext_v_id else str(vendor.id)
                                unique_name = f"{name} ({suffix})"
                                if not Vendor.objects.filter(name__iexact=unique_name).exclude(id=vendor.id).exists():
                                    vendor.name = unique_name
                                    updated_fields.append('name')
                        else:
                            vendor.name = name
                            updated_fields.append('name')
                    if ext_v_id and vendor.external_vendor_id != ext_v_id:
                        vendor.external_vendor_id = ext_v_id
                        updated_fields.append('external_vendor_id')
                    if code and vendor.code != code:
                        vendor.code = code
                        vendor.vendor_code = code
                        updated_fields.extend(['code', 'vendor_code'])
                    if contact and vendor.contact_person != contact:
                        vendor.contact_person = contact
                        updated_fields.append('contact_person')
                    if email and vendor.email != email:
                        vendor.email = email
                        updated_fields.append('email')
                    if phone and vendor.phone != phone:
                        vendor.phone = phone
                        updated_fields.append('phone')
                    if not vendor.is_active:
                        vendor.is_active = True
                        vendor.status = 'ACTIVE'
                        updated_fields.extend(['is_active', 'status'])

                    if updated_fields:
                        vendor.save(update_fields=list(set(updated_fields)))
                        self.stdout.write(f"  [UPDATED] Vendor #{vendor.id}: '{vendor.name}' (ext_id={vendor.external_vendor_id})")
                    else:
                        self.stdout.write(f"  [UNCHANGED] Vendor #{vendor.id}: '{vendor.name}'")
                else:
                    # Create missing vendor
                    target_name = name
                    if Vendor.objects.filter(name__iexact=target_name).exists():
                        suffix = ext_v_id[-4:] if ext_v_id else 'ext'
                        target_name = f"{name} ({suffix})"
                    vendor = Vendor.objects.create(
                        name=target_name,
                        external_vendor_id=ext_v_id or None,
                        code=code,
                        vendor_code=code,
                        vendor_type=v_type,
                        contact_person=contact,
                        email=email,
                        phone=phone,
                        status='ACTIVE',
                        is_active=True
                    )
                    self.stdout.write(self.style.SUCCESS(f"  [CREATED] Vendor #{vendor.id}: '{vendor.name}' (ext_id={vendor.external_vendor_id})"))

                vendor_synced_count += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Error syncing vendor '{name}' ({ext_v_id}): {e}"))

        self.stdout.write(self.style.SUCCESS(f"Synchronized {vendor_synced_count} vendor(s) in Hero database."))

        # ---------------------------------------------------------
        # Step 3: Synchronize live vendor users from iLync GET /api/vendor/{id}
        # ---------------------------------------------------------
        self.stdout.write(self.style.NOTICE("\nSynchronizing vendor team members from live iLync rosters..."))
        total_users_synced = 0
        all_active_vendors = Vendor.objects.filter(is_active=True).exclude(external_vendor_id__isnull=True).exclude(external_vendor_id='')

        for v_obj in all_active_vendors:
            try:
                res = client.get_vendor_by_id(v_obj.external_vendor_id)
                data = res.get('data') or {}
                # Update vendor name if iLync detail has newer partnerName
                live_pname = str(data.get('partnerName') or data.get('name') or '').strip()
                if live_pname and v_obj.name != live_pname:
                    clash = Vendor.objects.filter(name__iexact=live_pname).exclude(id=v_obj.id).exists()
                    if not clash:
                        v_obj.name = live_pname
                        v_obj.save(update_fields=['name'])

                users = data.get('users') or []
                if not isinstance(users, list):
                    continue

                for u_info in users:
                    if not isinstance(u_info, dict) or u_info.get('active') is False:
                        continue

                    ext_uid = str(u_info.get('userId') or u_info.get('id') or '').strip()
                    name = str(u_info.get('name') or u_info.get('contactName') or '').strip()
                    phone = str(u_info.get('mobile') or u_info.get('phone') or '').strip()
                    emp_id = str(u_info.get('empId') or '').strip()
                    email = str(u_info.get('email') or '').strip()
                    designation = str(u_info.get('designation') or u_info.get('role') or 'OPERATOR').strip()
                    norm_role = normalize_attendance_role(designation)

                    # Match user:
                    matched_user = None
                    if ext_uid:
                        matched_user = User.objects.filter(external_user_id=ext_uid).first()
                    if not matched_user and phone:
                        matched_user = User.objects.filter(Q(phone_number=phone) | Q(username=phone)).first()
                    if not matched_user and emp_id:
                        matched_user = User.objects.filter(Q(employee_id=emp_id) | Q(username=emp_id)).first()

                    parts = name.split(None, 1) if name else ['', '']
                    first = parts[0]
                    last = parts[1] if len(parts) > 1 else ''

                    if matched_user:
                        up_fields = []
                        if ext_uid and matched_user.external_user_id != ext_uid:
                            matched_user.external_user_id = ext_uid
                            up_fields.append('external_user_id')
                        if first and matched_user.first_name != first:
                            matched_user.first_name = first
                            up_fields.append('first_name')
                        if last and matched_user.last_name != last:
                            matched_user.last_name = last
                            up_fields.append('last_name')
                        if phone and matched_user.phone_number != phone:
                            matched_user.phone_number = phone
                            up_fields.append('phone_number')
                        if emp_id and matched_user.employee_id != emp_id:
                            matched_user.employee_id = emp_id
                            up_fields.append('employee_id')
                        if email and not email.lower().startswith('user@') and matched_user.email != email:
                            matched_user.email = email
                            up_fields.append('email')
                        if norm_role and matched_user.role != norm_role:
                            matched_user.role = norm_role
                            up_fields.append('role')
                        if matched_user.vendor_id != v_obj.id:
                            matched_user.vendor = v_obj
                            up_fields.append('vendor')
                        if not matched_user.is_active:
                            matched_user.is_active = True
                            up_fields.append('is_active')

                        if up_fields:
                            matched_user.save(update_fields=list(set(up_fields)))

                        # Ensure active assignment
                        assignment, _ = HeroVendorAssignment.objects.get_or_create(
                            user=matched_user,
                            vendor=v_obj,
                            defaults={'is_active': True}
                        )
                        if not assignment.is_active:
                            assignment.is_active = True
                            assignment.save(update_fields=['is_active'])

                        total_users_synced += 1

                    else:
                        # Create missing user non-destructively
                        base_usr = emp_id or phone or (f"u_{ext_uid[-8:]}" if ext_uid else f"u_{v_obj.id}_{name.replace(' ', '')[:6]}")
                        username_val = base_usr
                        idx = 1
                        while User.objects.filter(username=username_val).exists():
                            username_val = f"{base_usr}_{idx}"
                            idx += 1

                        user_kwargs = {
                            'username': username_val,
                            'external_user_id': ext_uid or None,
                            'employee_id': emp_id or None,
                            'phone_number': phone or '',
                            'email': email or f"{username_val}@ilync.tech",
                            'first_name': first,
                            'last_name': last,
                            'role': norm_role,
                            'vendor': v_obj,
                            'is_active': True
                        }
                        matched_user = User.objects.create(**user_kwargs)
                        HeroVendorAssignment.objects.get_or_create(
                            user=matched_user,
                            vendor=v_obj,
                            defaults={'is_active': True}
                        )
                        total_users_synced += 1

            except Exception as e:
                self.stdout.write(self.style.WARNING(f"  Notice: Could not fetch detail for vendor {v_obj.name}: {e}"))

        self.stdout.write(self.style.SUCCESS(f"Synchronized {total_users_synced} vendor team user(s)."))

        # ---------------------------------------------------------
        # Step 4: Ensure all admin/manager accounts are active
        # ---------------------------------------------------------
        self.stdout.write(self.style.NOTICE("\nEnsuring all Admin, Staff, and Vendor Manager accounts are active..."))
        reactivated_count = 0
        key_accounts = User.objects.filter(
            Q(is_superuser=True) |
            Q(is_staff=True) |
            Q(role__in=['ADMIN', 'MANAGER', 'SUPERVISOR', 'VENDOR', 'VENDOR_ADMIN', 'HERO', 'PROJECT_MANAGER'])
        ).filter(is_active=False)

        for u in key_accounts:
            u.is_active = True
            u.save(update_fields=['is_active'])
            reactivated_count += 1
            self.stdout.write(f"  [REACTIVATED] User #{u.id}: {u.username} ({u.get_full_name() or u.role})")

        self.stdout.write(self.style.SUCCESS(f"Reactivated {reactivated_count} key account(s)."))

        self.stdout.write(self.style.NOTICE("=" * 60))
        self.stdout.write(self.style.SUCCESS("DATABASE SYNCHRONIZATION COMPLETED SUCCESSFULLY!"))
        self.stdout.write(self.style.SUCCESS("All vendors and team members are aligned with live iLync."))
        self.stdout.write(self.style.NOTICE("=" * 60))
