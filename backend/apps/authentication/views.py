from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import LoginSerializer, UserSerializer, PasswordResetSerializer, PasswordChangeSerializer
from .external_user import ExternalUser, serialize_external_user
from apps.common.responses import success_response, error_response


def _issue_tokens(user):
    if isinstance(user, ExternalUser) or getattr(user, 'is_external', False):
        refresh = RefreshToken()
        for key, value in user.to_token_claims().items():
            refresh[key] = value
        return str(refresh.access_token), str(refresh)
    refresh = RefreshToken.for_user(user)
    refresh['origin'] = 'internal'
    return str(refresh.access_token), str(refresh)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            access, refresh = _issue_tokens(user)
            if isinstance(user, ExternalUser) or getattr(user, 'is_external', False):
                user_data = serialize_external_user(user)
            else:
                user_data = UserSerializer(user).data
            return success_response(
                data={
                    'access_token': access,
                    'refresh_token': refresh,
                    'user': user_data
                },
                message="Login successful"
            )
        return error_response(message="Invalid credentials", errors=serializer.errors)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if isinstance(user, ExternalUser) or getattr(user, 'is_external', False):
            user_data = serialize_external_user(user)
            vendors_list = user.get_assigned_vendors_data()
            primary_vendor = None
            if vendors_list:
                v_info = vendors_list[0]
                ext_id = v_info.get("external_vendor_id") or str(v_info.get("id"))
                primary_vendor = {
                    "id": ext_id,
                    "db_id": ext_id,
                    "name": v_info.get("name"),
                    "hddHero": True,
                }
            return Response({
                "user": user_data,
                "vendor": primary_vendor,
                "vendors": vendors_list,
            })

        vendors_list = user.get_assigned_vendors_data()

        primary_vendor = None
        if vendors_list:
            v_info = vendors_list[0]
            ext_id = v_info.get("external_vendor_id") or str(v_info.get("id"))
            primary_vendor = {
                "id": ext_id,
                "db_id": v_info.get("id"),
                "name": v_info.get("name"),
                "hddHero": v_info.get("hdd_hero", True)
            }

        data = {
            "user": {
                "id": user.id,
                "external_user_id": user.external_user_id or str(user.id),
                "username": user.username,
                "name": user.get_full_name() or user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "employee_id": user.employee_id,
                "phone_number": user.phone_number,
                "role": user.role,
                "roles": user.get_role_list(),
                "permissions": user.get_permission_codes(),
                "user_type": getattr(user, 'user_type', 'NORMAL'),
                "advance_scope_type": getattr(user, 'advance_scope_type', None),
                "selected_circle_id": getattr(user, 'selected_circle_id', None),
                "selected_circle_name": str(user.selected_circle_id) if getattr(user, 'selected_circle_id', None) else None,
                "selected_district_id": getattr(user, 'selected_district_id', None),
                "selected_district_name": str(user.selected_district_id) if getattr(user, 'selected_district_id', None) else None,
                "selected_block_id": getattr(user, 'selected_block_id', None),
                "selected_block_name": str(user.selected_block_id) if getattr(user, 'selected_block_id', None) else None,
                "is_superuser": user.is_superuser,
                "is_staff": user.is_staff,
                "is_active": user.is_active,
                "origin": "internal",
            },
            "vendor": primary_vendor,
            "vendors": vendors_list
        }
        return Response(data)

    def put(self, request):
        if isinstance(request.user, ExternalUser) or getattr(request.user, 'is_external', False):
            return error_response(message="External users cannot update profile via HERO API", status_code=status.HTTP_403_FORBIDDEN)
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return success_response(data=serializer.data, message="Profile updated successfully")
        return error_response(message="Failed to update profile", errors=serializer.errors)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh_token")
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            return success_response(message="Logout successful")
        except Exception:
            return success_response(message="Logged out")


class PasswordResetView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        if serializer.is_valid():
            return success_response(message="If the email exists, a password reset link has been sent.")
        return error_response(message="Invalid request", errors=serializer.errors)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if isinstance(request.user, ExternalUser) or getattr(request.user, 'is_external', False):
            return error_response(message="External users manage passwords in iLync", status_code=status.HTTP_403_FORBIDDEN)
        serializer = PasswordChangeSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data['old_password']):
                return error_response(message="Incorrect old password")
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return success_response(message="Password changed successfully")
        return error_response(message="Invalid data", errors=serializer.errors)
