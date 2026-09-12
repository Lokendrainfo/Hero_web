from rest_framework.views import APIView
from rest_framework import permissions
from apps.authentication.models import User
from apps.authentication.serializers import UserSerializer
from apps.common.responses import success_response

from django.db.models import Q
from apps.common.vendor_scope import get_user_vendor_ids, check_vendor_access

class TeamListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        allowed_ids = get_user_vendor_ids(user)

        # Check requested vendor in query params if provided
        req_vendor = request.query_params.get('vendor_id') or request.query_params.get('vendor')
        if req_vendor and str(req_vendor).strip() and req_vendor != 'all':
            check_vendor_access(user, req_vendor)

        if allowed_ids is None:
            users = User.objects.all()
        elif not allowed_ids:
            users = User.objects.none()
        else:
            users = User.objects.filter(
                Q(vendor_id__in=allowed_ids) | Q(hero_vendor_assignments__vendor_id__in=allowed_ids)
            ).distinct()

        if req_vendor and str(req_vendor).strip() and req_vendor != 'all':
            # Further filter by requested vendor
            users = users.filter(
                Q(vendor__external_vendor_id=req_vendor) | Q(vendor_id=req_vendor if str(req_vendor).isdigit() else None) | Q(hero_vendor_assignments__vendor_id=req_vendor if str(req_vendor).isdigit() else None)
            ).distinct()

        return success_response(data=UserSerializer(users, many=True).data)
