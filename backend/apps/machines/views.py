from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Machine
from .serializers import MachineSerializer
from apps.common.responses import success_response
from apps.integrations.fiberforce.client import FiberForceClient

from django.db.models import Q

from apps.common.vendor_scope import filter_queryset_by_vendor, check_vendor_access, get_user_vendor_ids

class MachineViewSet(viewsets.ModelViewSet):
    queryset = Machine.objects.all().order_by('id')
    serializer_class = MachineSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        user = self.request.user
        qs = filter_queryset_by_vendor(Machine.objects.all().order_by('id'), user, 'vendor_id', request=self.request)

        # Search Filter
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(machine_chassis_no__icontains=search) |
                Q(serial_number__icontains=search) |
                Q(engine_no__icontains=search) |
                Q(model_code__icontains=search) |
                Q(model_name__icontains=search) |
                Q(name__icontains=search)
            )

        # Status Filter
        status_param = self.request.query_params.get('status', '').strip()
        if status_param and status_param.upper() != 'ALL':
            if status_param.upper() == 'COMMISSIONED':
                qs = qs.filter(is_commissioned=True)
            elif status_param.upper() == 'LIVE':
                qs = qs.filter(is_online=True)
            elif status_param.upper() == 'OFFLINE':
                qs = qs.filter(is_online=False)
            else:
                qs = qs.filter(status__iexact=status_param)

        return qs

    def list(self, request, *args, **kwargs):
        user = request.user
        should_resync = request.query_params.get('resync', '').lower() in ['true', '1'] or request.query_params.get('refresh', '').lower() in ['true', '1']
        if should_resync:
            try:
                from .services import sync_fiberforce_machines
                sync_fiberforce_machines()
            except Exception as e:
                pass

        base_qs = filter_queryset_by_vendor(Machine.objects.all().order_by('id'), user, 'vendor_id', request=request)

        # Determine vendor assigned count & empty state code for non-admin users
        from apps.common.vendor_scope import get_user_vendor_ids
        from apps.vendors.models import Vendor
        allowed_vendor_ids = get_user_vendor_ids(user)

        vendor_assigned_count = base_qs.count()
        empty_state_code = "OK"
        empty_state_message = ""

        if allowed_vendor_ids is not None:
            if not allowed_vendor_ids:
                empty_state_code = "NO_ASSIGNED_MACHINES"
                empty_state_message = "No machines are assigned to this vendor."
                vendor_assigned_count = 0
            else:
                assigned_vendors = Vendor.objects.filter(id__in=allowed_vendor_ids)
                assigned_m_set = set()
                for v_obj in assigned_vendors:
                    if v_obj.external_vendor_id:
                        try:
                            from apps.integrations.ilync_client import IlyncClient
                            v_detail = IlyncClient().get_vendor_by_id(v_obj.external_vendor_id)
                            if v_detail and v_detail.get('success'):
                                m_list = v_detail.get('data', {}).get('machines', []) or []
                                for m_item in m_list:
                                    m_id_str = m_item.get('machineNo') or m_item.get('name') or m_item.get('id')
                                    if m_id_str:
                                        assigned_m_set.add(m_id_str)
                        except Exception:
                            pass
                vendor_assigned_count = len(assigned_m_set)
                if vendor_assigned_count == 0:
                    empty_state_code = "NO_ASSIGNED_MACHINES"
                    empty_state_message = "No machines are assigned to this vendor."
                elif base_qs.count() == 0:
                    empty_state_code = "NOT_IN_FIBERFORCE"
                    empty_state_message = "Machine assigned to vendor but not available in FiberForce."

        # Counts calculated strictly within current vendor scope
        status_counts = {
            'ALL': base_qs.count(),
            'LIVE': base_qs.filter(is_online=True).count(),
            'RUNNING': base_qs.filter(status__iexact='RUNNING').count(),
            'IDLE': base_qs.filter(status__iexact='IDLE').count(),
            'MAINTENANCE': base_qs.filter(status__iexact='MAINTENANCE').count(),
            'BREAKDOWN': base_qs.filter(status__iexact='BREAKDOWN').count(),
            'OFFLINE': base_qs.filter(is_online=False).count(),
            'COMMISSIONED': base_qs.filter(is_commissioned=True).count(),
        }

        qs = self.get_queryset()

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            res_data = self.get_paginated_response(serializer.data).data
            res_data['status_counts'] = status_counts
            res_data['vendor_assigned_count'] = vendor_assigned_count
            res_data['fiberforce_matched_count'] = base_qs.count()
            res_data['empty_state_code'] = empty_state_code
            res_data['empty_state_message'] = empty_state_message
            return Response(res_data)

        serializer = self.get_serializer(qs, many=True)
        return success_response(data={
            "count": len(serializer.data),
            "results": serializer.data,
            "status_counts": status_counts,
            "vendor_assigned_count": vendor_assigned_count,
            "fiberforce_matched_count": base_qs.count(),
            "empty_state_code": empty_state_code,
            "empty_state_message": empty_state_message
        })

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.vendor_id:
            check_vendor_access(request.user, instance.vendor_id)
        serializer = self.get_serializer(instance)
        return success_response(data=serializer.data)

    @action(detail=False, methods=['post', 'get'], url_path='sync-fiberforce')
    def sync_fiberforce(self, request):
        from .services import sync_fiberforce_machines
        result = sync_fiberforce_machines()
        return Response(result)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        machine = self.get_object()
        if machine.vendor_id:
            check_vendor_access(request.user, machine.vendor_id)
        return success_response(data={
            'id': machine.id,
            'name': machine.name,
            'status': machine.status,
            'fuel_level': float(machine.current_fuel_level),
            'hours_operated': float(machine.engine_hours),
            'last_ping': machine.last_ping,
            'chassis_no': machine.machine_chassis_no,
            'model_name': machine.model_name
        })

    @action(detail=False, methods=['get'], url_path='assigned')
    def assigned_machines(self, request):
        user = request.user
        should_resync = request.query_params.get('resync', '').lower() in ['true', '1']
        
        # Auto-resync from external APIs (FiberForce & Ilync) if DB is empty or explicitly requested
        if should_resync or not Machine.objects.exists():
            try:
                from .services import sync_fiberforce_machines
                sync_fiberforce_machines()
            except Exception as e:
                pass

        allowed_vendor_ids = get_user_vendor_ids(user)
        if allowed_vendor_ids is None:
            machines = filter_queryset_by_vendor(Machine.objects.all().order_by('id'), user, 'vendor_id', request=request)
        elif not allowed_vendor_ids:
            machines = Machine.objects.none()
        else:
            machines = Machine.objects.filter(vendor_id__in=allowed_vendor_ids).order_by('id')

        results = []
        for m in machines:
            vendor_name = m.vendor.name if m.vendor else "Unassigned Vendor"
            results.append({
                "id": m.id,
                "machine_chassis_no": m.machine_chassis_no or getattr(m, 'chassis_number', getattr(m, 'serial_number', f"CH-{m.id}")),
                "model_code": m.model_code or getattr(m, 'model', 'A600'),
                "model_name": m.model_name or getattr(m, 'name', 'APOLLO A600 V2'),
                "site_name": m.site_name or getattr(m, 'location_name', None) or getattr(m, 'location', "") or "",
                "site_id": m.site_id,
                "status": m.status or 'Online',
                "is_commissioned": m.is_commissioned,
                "is_online": m.is_online,
                "vendor_id": m.vendor_id,
                "vendor_name": vendor_name,
                "engine_no": m.engine_no or '',
                "vehicle_no": m.vehicle_no,
                "fuel_card": m.fuel_card,
                "current_fuel_level": float(m.current_fuel_level or 0.0),
                "fuel_percentage": m.fuel_percentage or 0,
                "engine_hours": float(m.engine_hours or 0.0)
            })
        return Response({
            "success": True,
            "data": results,
            "results": results,
            "total": len(results),
            "count": len(results)
        }, status=status.HTTP_200_OK)

