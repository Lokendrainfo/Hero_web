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
        qs = self.get_queryset()

        is_admin = user.is_authenticated and (user.is_superuser or 'ADMIN' in user.get_role_list())
        db_vendors = VendorSerializer(qs, many=True).data

        # If DB is empty for ADMIN, trigger sync from ILYNC
        if is_admin and not db_vendors and Vendor.objects.count() == 0:
            fetch_and_sync_all_ilync_vendors()
            qs = self.get_queryset()
            db_vendors = VendorSerializer(qs, many=True).data

        return success_response(data={
            "is_admin": is_admin,
            "vendors": db_vendors,
            "total": len(db_vendors)
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

        # Fetch fresh full vendor details from live ILYNC API (/api/vendor/<id>)
        external_res = None
        try:
            external_res = client.get_vendor_by_id(ext_id)
        except Exception as exc:
            pass

        external_vendor = {}
        if isinstance(external_res, dict):
            external_vendor = external_res.get('data') if external_res.get('success') else external_res

        if instance and ext_id:
            try:
                sync_vendor_detail_links(instance, ext_id)
            except Exception:
                pass

        from apps.machines.models import Machine
        from apps.machines.serializers import MachineSerializer
        from apps.authentication.models import User
        from apps.authentication.serializers import UserSerializer

        assigned_machines_qs = Machine.objects.none()
        if instance:
            assigned_machines_qs = Machine.objects.filter(vendor=instance)
        elif str(ext_id):
            assigned_machines_qs = Machine.objects.filter(vendor__external_vendor_id=str(ext_id))

        machines_data = MachineSerializer(assigned_machines_qs, many=True).data

        # Determine users dynamically from live response or DB
        raw_users = []
        if isinstance(external_vendor, dict) and external_vendor.get('users'):
            raw_users = external_vendor.get('users')
        elif instance:
            db_users = User.objects.filter(vendor=instance).exclude(
                Q(is_superuser=True) | Q(role__iexact='ADMIN')
            ).distinct()
            raw_users = UserSerializer(db_users, many=True).data

        dedup_users = []
        seen_user_keys = set()
        for u in (raw_users or []):
            if not isinstance(u, dict):
                continue
            key = str(u.get('userId') or u.get('id') or u.get('mobile') or u.get('phone') or u.get('phone_number') or u.get('email') or u.get('username') or u.get('name') or '').strip().lower()
            if key and key not in seen_user_keys:
                seen_user_keys.add(key)
                dedup_users.append(u)

        if instance:
            data = VendorSerializer(instance).data
            if isinstance(external_vendor, dict):
                for k, v in external_vendor.items():
                    if v is not None:
                        data[k] = v
            if isinstance(external_vendor, dict) and external_vendor.get('machines'):
                data['machines'] = external_vendor['machines']
            else:
                data['machines'] = machines_data
            data['assigned_machines'] = machines_data
            data['machines_count'] = len(data.get('machines', []))
            data['users'] = dedup_users
            return success_response(data=data)
        else:
            if isinstance(external_vendor, dict):
                if not external_vendor.get('machines'):
                    external_vendor['machines'] = machines_data
                external_vendor['assigned_machines'] = machines_data
                external_vendor['machines_count'] = len(external_vendor.get('machines', []))
                external_vendor['users'] = dedup_users
            return success_response(data=external_vendor)

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_vendors(self, request):
        synced = fetch_and_sync_all_ilync_vendors()
        return success_response(
            data={"synced_count": len(synced)},
            message=f"Successfully synced {len(synced)} vendors from ILYNC API."
        )
