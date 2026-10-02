import base64
import binascii
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

class BharatNetServiceUser:
    """
    Dedicated in-memory read-only service account for BharatNet Phase-3 integration.
    """
    is_authenticated = True
    is_anonymous = False
    is_active = True
    is_staff = False
    is_superuser = False
    username = 'bharatnet_service'
    role = 'BHARATNET_SERVICE'

    def __init__(self, username=None):
        self.username = username or getattr(settings, 'BHARATNET_API_USERNAME', 'bharatnet_service')

    def __str__(self):
        return f"BharatNetServiceUser({self.username})"

    def is_circle_allowed(self, circle_name):
        allowed_str = getattr(settings, 'BHARATNET_ALLOWED_CIRCLES', '*') or '*'
        if allowed_str == '*' or not allowed_str.strip():
            return True
        allowed_circles = [c.strip().upper() for c in allowed_str.split(',') if c.strip()]
        return str(circle_name or '').strip().upper() in allowed_circles


class BharatNetBasicAuthentication(BaseAuthentication):
    """
    HTTP Basic Authentication for BharatNet Phase-3 T&D Monitoring API.
    Also supports optional client_key query parameter or X-Client-Key header.
    """
    def authenticate(self, request):
        configured_user = getattr(settings, 'BHARATNET_API_USERNAME', 'bharatnet_service')
        configured_pass = getattr(settings, 'BHARATNET_API_PASSWORD', 'BharatNet@2026!Secure')
        configured_client_key = getattr(settings, 'BHARATNET_CLIENT_KEY', '')

        # 1. Check optional client_key if supported and provided
        client_key = (
            request.query_params.get('client_key')
            or request.headers.get('X-Client-Key')
            or request.headers.get('client-key')
        )
        if configured_client_key and client_key:
            if client_key.strip() == configured_client_key.strip():
                return (BharatNetServiceUser(configured_user), 'client_key')
            raise AuthenticationFailed('Invalid client_key provided.')

        # 2. Check HTTP Basic Authentication
        auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
        if not auth_header:
            raise AuthenticationFailed('Missing Authorization header. HTTP Basic authentication required.')

        parts = auth_header.split(' ', 1)
        if len(parts) != 2 or parts[0].lower() != 'basic':
            raise AuthenticationFailed('Invalid Authorization header format. Expected Basic <base64(username:password)>.')

        try:
            decoded = base64.b64decode(parts[1]).decode('utf-8')
            username, password = decoded.split(':', 1)
        except (binascii.Error, ValueError, UnicodeDecodeError):
            raise AuthenticationFailed('Invalid Basic authentication token encoding.')

        if username.strip() == configured_user.strip() and password.strip() == configured_pass.strip():
            return (BharatNetServiceUser(username), 'basic')

        raise AuthenticationFailed('Invalid BharatNet service username or password.')

    def authenticate_header(self, request):
        return 'Basic realm="BharatNet Phase-3 T&D Monitoring"'
