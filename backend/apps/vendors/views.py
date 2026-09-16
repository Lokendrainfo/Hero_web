from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Vendor
from .serializers import VendorSerializer
from apps.common.responses import success_response
from apps.common.vendor_scope import filter_queryset_by_vendor, check_vendor_access, get_user_vendor_ids
from apps.integrations.ilync_client import IlyncClient
from .services import fetch_and_sync_all_ilync_vendors

from django.db.models import Q

class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all().order_by('id')
    serializer_class = VendorSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        user = self.request.user
        qs = filter_queryset_by_vendor(Vendor.objects.all().order_by('id'), user, 'id', request=self.request)
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(code__icontains=search) |
                Q(vendor_code__icontains=search) |
                Q(contact_person__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search)
            )
        return qs

    def list(self, request, *args, **kwargs):
        user = request.user
        search = request.query_params.get('search', '').strip().lower()
        page = int(request.query_params.get('page', 0))
        size = int(request.query_params.get('size', 100))

        client = IlyncClient()
        live_res = None
        try:
            live_res = client.get_vendors(page=page, size=size, search=search)
        except Exception as e:
            print(f"[VendorViewSet] Error fetching live vendors from iLync: {e}")

        raw_data = live_res.get('data') if (isinstance(live_res, dict) and 'data' in live_res) else (live_res if isinstance(live_res, dict) else [])
        if isinstance(raw_data, dict):
            raw_list = raw_data.get('results') or raw_data.get('content') or raw_data.get('vendors') or []
        elif isinstance(raw_data, list):
            raw_list = raw_data
        else:
            raw_list = []

        allowed_vendor_ids = get_user_vendor_ids(user)

        vendors_list = []
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            v_id = str(item.get('id') or item.get('external_vendor_id') or '').strip()
            v_name = str(item.get('partnerName') or item.get('name') or '').strip()

            # Authorization Scope Filter
            if allowed_vendor_ids is not None:
                if not any(str(av_id).lower() in (v_id.lower(), v_name.lower()) for av_id in allowed_vendor_ids):
                    continue

            # Search Filter
            if search:
                concat = f"{v_name} {item.get('contactName')} {item.get('contact_person')} {item.get('phoneNumber')} {item.get('phone')} {item.get('email')} {item.get('code')}".lower()
                if search not in concat:
                    continue

            norm_v = dict(item)
            norm_v['id'] = v_id
            norm_v['external_vendor_id'] = v_id
            norm_v['name'] = v_name or item.get('name') or 'Vendor'
            norm_v['partnerName'] = norm_v['name']
            norm_v['contact_person'] = item.get('contactName') or item.get('contact_person') or ''
            norm_v['contactName'] = norm_v['contact_person']
            norm_v['phone'] = item.get('phoneNumber') or item.get('phone') or ''
            norm_v['phoneNumber'] = norm_v['phone']
            norm_v['email'] = item.get('email') or ''
            norm_v['vendor_type'] = item.get('legalEntityType') or item.get('vendor_type') or 'COMPANY'
            norm_v['legalEntityType'] = norm_v['vendor_type']
            norm_v['is_active'] = item.get('active') if 'active' in item else item.get('is_active', True)

            machines = item.get('machines') or item.get('assigned_machines') or []
            norm_v['machines'] = machines if isinstance(machines, list) else []
            norm_v['machines_count'] = len(norm_v['machines'])
            norm_v['users'] = item.get('users') or []

            vendors_list.append(norm_v)

        is_admin = user.is_authenticated and (user.is_superuser or 'ADMIN' in user.get_role_list())

        return success_response(data={
            "is_admin": is_admin,
            "vendors": vendors_list,
            "results": vendors_list,
            "total": len(vendors_list)
        })

    @action(detail=False, methods=['get'], url_path='me')
    def my_vendor(self, request):
        user = request.user
        vendor_ids = get_user_vendor_ids(user)
        if vendor_ids is None or (isinstance(vendor_ids, list) and not vendor_ids):
            # Admin or user without specific vendor assignment
            v_first = Vendor.objects.first()
            target_pk = v_first.external_vendor_id or v_first.id if v_first else '6a7c2b4f8e16e804697f18b0'
        else:
            target_pk = vendor_ids[0]
        return self.retrieve(request, pk=target_pk)

    def retrieve(self, request, pk=None, *args, **kwargs):
        user = request.user
        if str(pk).lower() == 'me':
            return self.my_vendor(request)

        # Direct object access authorization check
        check_vendor_access(user, pk)

        client = IlyncClient()
        instance = None
        try:
            if str(pk).isdigit():
                instance = Vendor.objects.filter(id=int(pk)).first()
            if not instance:
                instance = Vendor.objects.filter(external_vendor_id=str(pk)).first()
            if not instance:
                instance = Vendor.objects.filter(name=str(pk)).first()
        except Exception:
            pass

        ext_id = instance.external_vendor_id if (instance and instance.external_vendor_id) else pk

        # Fetch fresh vendor details from live ILYNC API (GET /api/vendor/<id>)
        external_res = None
        try:
            external_res = client.get_vendor_by_id(ext_id)
        except Exception as exc:
            pass

        external_vendor = {}
        if isinstance(external_res, dict):
            external_vendor = external_res.get('data') if ('data' in external_res and isinstance(external_res.get('data'), dict)) else external_res

        # Read users and machines directly from live iLync API response
        raw_users = external_vendor.get('users') if isinstance(external_vendor, dict) else []
        if not isinstance(raw_users, list):
            raw_users = []

        raw_machines = external_vendor.get('machines') if isinstance(external_vendor, dict) else []
        if not isinstance(raw_machines, list):
            raw_machines = []

        res_data = dict(external_vendor) if isinstance(external_vendor, dict) else {}

        if instance:
            res_data.setdefault('id', instance.external_vendor_id or instance.id)
            res_data.setdefault('external_vendor_id', instance.external_vendor_id or str(instance.id))
            res_data.setdefault('name', instance.name)
            res_data.setdefault('partnerName', instance.name)
            res_data.setdefault('contact_person', instance.contact_person)
            res_data.setdefault('contactName', instance.contact_person)
            res_data.setdefault('phone', instance.phone)
            res_data.setdefault('phoneNumber', instance.phone)
            res_data.setdefault('email', instance.email)

        res_data['users'] = raw_users
        res_data['machines'] = raw_machines
        res_data['assigned_machines'] = raw_machines
        res_data['machines_count'] = len(raw_machines)

        return success_response(data=res_data)

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_vendors(self, request):
        synced = fetch_and_sync_all_ilync_vendors()
        return success_response(
            data={"synced_count": len(synced)},
            message=f"Successfully synced {len(synced)} vendors from ILYNC API."
        )
