from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.common.responses import success_response, error_response
from apps.common.vendor_scope import check_vendor_access, get_user_vendor_ids
from apps.integrations.ilync_client import IlyncClient
from .services import fetch_and_sync_all_ilync_vendors

class VendorViewSet(viewsets.ViewSet):
    """Live iLync vendors only — no Vendor table reads/writes."""
    permission_classes = [permissions.AllowAny]

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
        if vendor_ids and len(vendor_ids) > 0:
            target_pk = vendor_ids[0]
        else:
            # Fall back to first live iLync vendor for admins
            try:
                live = IlyncClient().get_vendors(page=0, size=1)
                data = (live or {}).get('data') if isinstance(live, dict) else live
                raw = []
                if isinstance(data, dict):
                    raw = data.get('results') or data.get('content') or data.get('vendors') or []
                elif isinstance(data, list):
                    raw = data
                target_pk = str(raw[0].get('id')) if raw and isinstance(raw[0], dict) else None
            except Exception:
                target_pk = None
        if not target_pk:
            return error_response(message="No vendor available", status_code=status.HTTP_404_NOT_FOUND)
        return self.retrieve(request, pk=target_pk)

    def retrieve(self, request, pk=None, *args, **kwargs):
        user = request.user
        if str(pk).lower() == 'me':
            return self.my_vendor(request)

        check_vendor_access(user, pk)

        client = IlyncClient()
        ext_id = pk

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
        res_data.setdefault('id', str(ext_id))
        res_data.setdefault('external_vendor_id', str(ext_id))
        res_data.setdefault('name', res_data.get('partnerName') or res_data.get('name') or str(ext_id))
        res_data.setdefault('partnerName', res_data['name'])

        res_data['users'] = raw_users
        res_data['machines'] = raw_machines
        res_data['assigned_machines'] = raw_machines
        res_data['machines_count'] = len(raw_machines)

        return success_response(data=res_data)

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_vendors(self, request):
        result = fetch_and_sync_all_ilync_vendors()
        live_count = result.get('live_count', 0) if isinstance(result, dict) else 0
        return success_response(
            data={"synced_count": 0, "live_count": live_count, "persisted": False},
            message="Vendors are live-proxied from iLync; nothing written to HERO DB.",
        )

    def create(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Vendors are managed in iLync (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Vendors are managed in iLync (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"success": False, "message": "Vendors are managed in iLync (proxy-only)."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
