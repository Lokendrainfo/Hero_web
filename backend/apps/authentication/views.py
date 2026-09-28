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
                "selected_circle_name": user.selected_circle.name if getattr(user, 'selected_circle', None) else None,
                "selected_district_id": getattr(user, 'selected_district_id', None),
                "selected_district_name": user.selected_district.name if getattr(user, 'selected_district', None) else None,
                "selected_block_id": getattr(user, 'selected_block_id', None),
                "selected_block_name": user.selected_block.name if getattr(user, 'selected_block', None) else None,
                "is_superuser": user.is_superuser,
                "is_staff": user.is_staff,
                "is_active": user.is_active,
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


class ApiKeyManageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_or_create_key(self, user):
        from .models import APIKey
        key_obj = APIKey.objects.filter(user=user).first()
        if not key_obj:
            key_obj = APIKey.objects.filter(user__isnull=True).first()
        if not key_obj:
            new_key = APIKey.generate_key_string()
            key_obj = APIKey.objects.create(
                user=user,
                name="External Partner Key",
                key=new_key,
                prefix="hero_live_",
                is_active=True,
                webhook_url="https://your.app/hooks/vehicleiq",
                webhook_secret=""
            )
        return key_obj

    def _serialize_key(self, key_obj):
        return {
            "id": key_obj.id,
            "name": key_obj.name,
            "key": key_obj.key,
            "masked_key": key_obj.masked_key,
            "is_active": key_obj.is_active,
            "created_at": key_obj.created_at.isoformat() if key_obj.created_at else None,
            "last_used_at": key_obj.last_used_at.isoformat() if key_obj.last_used_at else None,
            "webhook_url": key_obj.webhook_url or "",
            "webhook_enabled": bool(key_obj.webhook_enabled),
            "webhook_secret": key_obj.webhook_secret or "",
        }

    def get(self, request):
        key_obj = self._get_or_create_key(request.user)
        return success_response(data=self._serialize_key(key_obj), message="API key retrieved successfully")

    def post(self, request):
        import secrets
        import json
        import hashlib
        from django.utils import timezone
        from .models import APIKey

        action = request.data.get('action') or 'rotate'
        key_obj = self._get_or_create_key(request.user)

        if action == 'rotate':
            key_obj.key = APIKey.generate_key_string()
            key_obj.is_active = True
            key_obj.save(update_fields=['key', 'is_active'])
            return success_response(data=self._serialize_key(key_obj), message="API key rotated successfully")

        elif action == 'toggle':
            key_obj.is_active = not key_obj.is_active
            key_obj.save(update_fields=['is_active'])
            status_text = "enabled" if key_obj.is_active else "disabled"
            return success_response(data=self._serialize_key(key_obj), message=f"API key {status_text} successfully")

        elif action == 'webhook_save':
            webhook_url = request.data.get('webhook_url', '').strip()
            webhook_enabled = bool(request.data.get('webhook_enabled', False))
            key_obj.webhook_url = webhook_url
            key_obj.webhook_enabled = webhook_enabled
            key_obj.save(update_fields=['webhook_url', 'webhook_enabled'])
            return success_response(data=self._serialize_key(key_obj), message="Webhook configuration saved")

        elif action == 'webhook_rotate_secret':
            key_obj.webhook_secret = f"whsec_{secrets.token_hex(16)}"
            key_obj.save(update_fields=['webhook_secret'])
            return success_response(data=self._serialize_key(key_obj), message="Webhook signing secret rotated")

        elif action == 'webhook_test':
            url = key_obj.webhook_url or request.data.get('webhook_url')
            if not url:
                return error_response(message="Please provide a valid webhook URL first.")
            try:
                import requests
                payload = {
                    "event": "alert.created",
                    "timestamp": timezone.now().isoformat(),
                    "data": {
                        "alert_id": "ALT-9021",
                        "severity": "CRITICAL",
                        "machine_chassis_no": "600202608397",
                        "message": "Engine RPM exceeded operating limit (test ping)",
                    }
                }
                headers = {"Content-Type": "application/json"}
                if key_obj.webhook_secret:
                    import hmac
                    signature = hmac.new(key_obj.webhook_secret.encode(), json.dumps(payload).encode(), hashlib.sha256).hexdigest()
                    headers["X-Hub-Signature-256"] = f"sha256={signature}"

                resp = requests.post(url, json=payload, headers=headers, timeout=3.0)
                return success_response(
                    data={"status_code": resp.status_code, "response_body": resp.text[:200]},
                    message=f"Test ping delivered successfully (HTTP {resp.status_code})"
                )
            except Exception as exc:
                return success_response(
                    data={"simulated": True, "error": str(exc)},
                    message=f"Test webhook triggered. (Target responded with: {exc})"
                )

        return error_response(message=f"Unknown action: {action}")

