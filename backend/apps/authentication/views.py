from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import LoginSerializer, UserSerializer, PasswordResetSerializer, PasswordChangeSerializer
from apps.common.responses import success_response, error_response

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            user_data = UserSerializer(user).data
            return success_response(
                data={
                    'access_token': str(refresh.access_token),
                    'refresh_token': str(refresh),
                    'user': user_data
                },
                message="Login successful"
            )
        return error_response(message="Invalid credentials", errors=serializer.errors)

class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
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
                "email": user.email,
                "role": user.role,
                "roles": user.get_role_list(),
                "permissions": user.get_permission_codes()
            },
            "vendor": primary_vendor,
            "vendors": vendors_list
        }
        return Response(data)

    def put(self, request):
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
        serializer = PasswordChangeSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data['old_password']):
                return error_response(message="Incorrect old password")
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return success_response(message="Password changed successfully")
        return error_response(message="Invalid data", errors=serializer.errors)
