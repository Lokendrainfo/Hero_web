from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from apps.authentication.models import User
from apps.roles.models import Role
from apps.authentication.serializers import UserSerializer
from apps.common.responses import success_response, error_response
from apps.integrations.ilync_user_sync import fetch_and_sync_all_ilync_users

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('id')
    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        # Internal users only in DB (no external_user_id)
        qs = User.objects.filter(
            Q(external_user_id__isnull=True) | Q(external_user_id='')
        ).order_by('id')
        search = self.request.query_params.get('search', '').strip()
        role_filter = self.request.query_params.get('role', '').strip()
        req_vendor = self.request.query_params.get('vendor_id') or self.request.query_params.get('vendor')

        if hasattr(self, 'request') and self.request and self.request.user and self.request.user.is_authenticated:
            user = self.request.user
            from apps.common.vendor_scope import get_user_vendor_ids, check_vendor_access
            if req_vendor and str(req_vendor).strip() and req_vendor != 'all':
                check_vendor_access(user, req_vendor)
                qs = qs.filter(
                    Q(external_vendor_id=req_vendor) |
                    Q(assigned_vendor_ids__contains=[str(req_vendor)])
                ).distinct()
            else:
                allowed_ids = get_user_vendor_ids(user)
                if allowed_ids is not None:
                    if not allowed_ids:
                        return User.objects.none()
                    q = Q(external_vendor_id__in=allowed_ids)
                    for vid in allowed_ids:
                        q |= Q(assigned_vendor_ids__contains=[str(vid)])
                    qs = qs.filter(q).distinct()

        if search:
            qs = qs.filter(
                Q(username__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(employee_id__icontains=search) |
                Q(phone_number__icontains=search) |
                Q(external_vendor_id__icontains=search)
            )

        if role_filter and role_filter.upper() != 'ALL':
            rf = role_filter.upper()
            if rf == 'VENDOR' or 'VENDOR' in rf:
                qs = qs.filter(
                    Q(role__icontains='VENDOR') |
                    Q(roles__name__icontains='VENDOR') |
                    Q(external_vendor_id__isnull=False)
                ).exclude(external_vendor_id='').distinct()
            elif rf in ['MANAGER', 'PROJECT_MANAGER']:
                qs = qs.filter(
                    Q(role__icontains='MANAGER') |
                    Q(roles__name__icontains='MANAGER') |
                    Q(role__iexact='PROJECT_MANAGER')
                ).distinct()
            elif rf == 'ADMIN':
                qs = qs.filter(
                    Q(role__iexact='ADMIN') |
                    Q(roles__name__iexact='ADMIN') |
                    Q(is_superuser=True)
                ).distinct()
            else:
                qs = qs.filter(
                    Q(role__iexact=role_filter) |
                    Q(role__icontains=role_filter) |
                    Q(roles__name__iexact=role_filter) |
                    Q(roles__name__icontains=role_filter)
                ).distinct()

        return qs

    @staticmethod
    def _split_by_origin(qs):
        """Internal queryset only — external comes from live iLync."""
        return qs, qs.none()

    def list(self, request, *args, **kwargs):
        from apps.integrations.ilync_user_sync import (
            fetch_and_sync_all_ilync_users,
            map_ilync_user_to_api_dict,
        )

        origin = (request.query_params.get('origin') or request.query_params.get('source') or 'internal').strip().lower()
        search = (request.query_params.get('search') or '').strip().lower()

        internal_qs = self.get_queryset()
        internal_count = internal_qs.count()

        # Live external users (no DB)
        live_external = []
        try:
            raw = fetch_and_sync_all_ilync_users(max_pages=10, size=50)
            for item in raw:
                mapped = map_ilync_user_to_api_dict(item)
                if not mapped:
                    continue
                if search:
                    blob = ' '.join([
                        str(mapped.get(k) or '') for k in
                        ('name', 'username', 'email', 'employee_id', 'external_user_id', 'phone_number', 'vendor_name')
                    ]).lower()
                    if search not in blob:
                        continue
                live_external.append(mapped)
        except Exception:
            live_external = []

        origin_counts = {
            'INTERNAL': internal_count,
            'EXTERNAL': len(live_external),
        }

        page_str = request.query_params.get('page', '0')
        size_str = request.query_params.get('size') or request.query_params.get('page_size') or '20'
        try:
            page_num = max(0, int(page_str))
        except ValueError:
            page_num = 0
        try:
            size_num = 10**9 if str(size_str).lower() == 'all' else max(1, min(1000, int(size_str)))
        except ValueError:
            size_num = 20

        if origin in ('external', 'api', 'ilync'):
            total_count = len(live_external)
            start_idx = page_num * size_num
            end_idx = start_idx + size_num
            page_rows = live_external[start_idx:end_idx]
            total_pages = (total_count + size_num - 1) // size_num if total_count > 0 and size_num < 10**9 else 1
            return success_response(data={
                "count": total_count,
                "total": total_count,
                "page": page_num,
                "size": size_num if size_num < 10**9 else total_count,
                "total_pages": total_pages,
                "origin_counts": origin_counts,
                "results": page_rows,
            })

        # Default / internal
        total_count = internal_count
        total_pages = (total_count + size_num - 1) // size_num if total_count > 0 and size_num < 10**9 else 1
        start_idx = page_num * size_num
        end_idx = start_idx + size_num
        page_qs = internal_qs[start_idx:end_idx]
        serializer = self.get_serializer(page_qs, many=True)
        return success_response(data={
            "count": total_count,
            "total": total_count,
            "page": page_num,
            "size": size_num if size_num < 10**9 else total_count,
            "total_pages": total_pages,
            "origin_counts": origin_counts,
            "results": serializer.data,
        })

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            from django.core.exceptions import ValidationError as DjangoValidationError
            from rest_framework.exceptions import ValidationError as DRFValidationError
            from django.db import IntegrityError
            if isinstance(e, (DjangoValidationError, DRFValidationError)):
                err_dict = getattr(e, 'detail', None)
                if not err_dict and hasattr(e, 'message_dict'):
                    err_dict = e.message_dict
                msg = e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
                return error_response(message=msg, errors=err_dict, status_code=status.HTTP_400_BAD_REQUEST)
            elif isinstance(e, IntegrityError):
                err_msg = str(e)
                if 'unique' in err_msg.lower() or 'UNIQUE' in err_msg:
                    return error_response(message="A user with this username, email, or external ID already exists.", status_code=status.HTTP_400_BAD_REQUEST)
                return error_response(message=f"Database constraint error: {err_msg}", status_code=status.HTTP_400_BAD_REQUEST)
            return error_response(message=f"Failed to create user: {str(e)}", status_code=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        try:
            return super().update(request, *args, **kwargs)
        except Exception as e:
            from django.core.exceptions import ValidationError as DjangoValidationError
            from rest_framework.exceptions import ValidationError as DRFValidationError
            if isinstance(e, (DjangoValidationError, DRFValidationError)):
                msg = e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
                return error_response(message=msg, status_code=status.HTTP_400_BAD_REQUEST)
            raise e

    def partial_update(self, request, *args, **kwargs):
        try:
            return super().partial_update(request, *args, **kwargs)
        except Exception as e:
            from django.core.exceptions import ValidationError as DjangoValidationError
            from rest_framework.exceptions import ValidationError as DRFValidationError
            if isinstance(e, (DjangoValidationError, DRFValidationError)):
                msg = e.messages[0] if hasattr(e, 'messages') and e.messages else str(e)
                return error_response(message=msg, status_code=status.HTTP_400_BAD_REQUEST)
            raise e

    @action(detail=True, methods=['patch', 'post'], url_path='role')
    def update_role(self, request, pk=None):
        user = self.get_object()
        role_name = request.data.get('role') or request.data.get('role_name')
        roles_list = request.data.get('roles', [])
        is_active = request.data.get('is_active')

        if is_active is not None:
            user.is_active = bool(is_active)

        if role_name:
            user.role = role_name
            role_obj = Role.objects.filter(name__iexact=role_name).first()
            if role_obj:
                user.roles.set([role_obj])

        if roles_list and isinstance(roles_list, list):
            role_objs = Role.objects.filter(name__in=roles_list)
            if role_objs.exists():
                user.roles.set(role_objs)
                user.role = role_objs.first().name

        user.save()

        # If updated role is VENDOR, immediately resolve vendor assignment
        user_roles = [str(r).upper() for r in user.get_role_list()]
        if 'VENDOR' in user_roles or (user.role and 'VENDOR' in str(user.role).upper()):
            from apps.common.vendor_scope import get_user_vendor
            get_user_vendor(user, resolve_fallback=True)

        return success_response(
            data=UserSerializer(user).data,
            message=f"User {user.username} role updated successfully to {user.get_role_list()}"
        )

    @action(detail=True, methods=['get', 'post', 'delete'], url_path='vendors')
    def manage_vendors(self, request, pk=None):
        user = self.get_object()

        if request.method == 'GET':
            return success_response(
                data=user.get_assigned_vendors_data() or [],
                message=f"Fetched assigned vendors for {user.username}"
            )

        elif request.method == 'POST':
            vendor_ids = request.data.get('vendor_ids') or [request.data.get('vendor_id')]
            vendor_ids = [str(v).strip() for v in vendor_ids if v]
            if not vendor_ids:
                return error_response(message="vendor_id or vendor_ids required.")

            assigned = list(user.assigned_vendor_ids or [])
            for vid in vendor_ids:
                if vid not in assigned:
                    assigned.append(vid)
            user.assigned_vendor_ids = assigned
            if not user.external_vendor_id and assigned:
                user.external_vendor_id = assigned[0]
            user.save(update_fields=['assigned_vendor_ids', 'external_vendor_id'])
            return success_response(
                data=UserSerializer(user).data,
                message=f"Assigned vendors {vendor_ids} to user {user.username}"
            )

        elif request.method == 'DELETE':
            v_identifier = request.data.get('vendor_id') or request.query_params.get('vendor_id')
            if not v_identifier:
                return error_response(message="vendor_id is required.")
            vid = str(v_identifier).strip()
            assigned = [x for x in (user.assigned_vendor_ids or []) if str(x) != vid]
            user.assigned_vendor_ids = assigned
            if str(user.external_vendor_id or '') == vid:
                user.external_vendor_id = assigned[0] if assigned else None
            user.save(update_fields=['assigned_vendor_ids', 'external_vendor_id'])
            return success_response(
                data=UserSerializer(user).data,
                message=f"Removed vendor {vid} from user {user.username}"
            )

    @action(detail=False, methods=['post'], url_path='sync')
    def sync_ilync_users(self, request):
        """Refresh live iLync user list only — does not write to HERO DB."""
        synced = fetch_and_sync_all_ilync_users(max_pages=20, size=50)
        return success_response(
            data={"synced_count": len(synced), "persisted": False},
            message=f"Fetched {len(synced)} live users from iLync (not stored in HERO DB)."
        )

    @action(detail=False, methods=['get'], url_path='my-team')
    def my_team(self, request):
        user = request.user
        from apps.common.vendor_scope import get_user_vendor_ids
        allowed_vendor_ids = get_user_vendor_ids(user)

        if allowed_vendor_ids is None:
            team_qs = User.objects.filter(is_active=True).filter(
                Q(external_user_id__isnull=True) | Q(external_user_id='')
            ).order_by('id')
        elif not allowed_vendor_ids:
            team_qs = User.objects.none()
        else:
            team_qs = User.objects.filter(
                Q(external_vendor_id__in=allowed_vendor_ids)
            ).filter(is_active=True).distinct().order_by('id')

        results = []
        for u in team_qs:
            results.append({
                "id": u.id,
                "name": u.get_full_name() or u.username,
                "employee_id": u.employee_id or u.external_user_id or f"EMP-{u.id}",
                "role": u.get_role_list()[0] if u.get_role_list() else (u.role or 'Field Surveyor'),
                "avatar_url": u.avatar_url if hasattr(u, 'avatar_url') else None
            })
        return Response({"results": results}, status=status.HTTP_200_OK)

