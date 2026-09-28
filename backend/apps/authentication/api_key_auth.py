from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils import timezone
from .models import APIKey, User


class APIKeyAuthentication(BaseAuthentication):
    """
    Authenticate requests using an API Key provided in:
    - Header: X-API-Key: <key>
    - Header: Authorization: Api-Key <key>
    """
    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_API_KEY')
        if not api_key:
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Api-Key '):
                api_key = auth_header.split(' ', 1)[1].strip()

        if not api_key:
            return None  # Pass through to next authentication class (e.g. JWT)

        try:
            key_obj = APIKey.objects.select_related('user').get(key=api_key.strip(), is_active=True)
        except APIKey.DoesNotExist:
            raise AuthenticationFailed("Invalid or inactive API key.")

        try:
            APIKey.objects.filter(id=key_obj.id).update(last_used_at=timezone.now())
        except Exception:
            pass

        user = key_obj.user
        if not user:
            user = User.objects.filter(is_superuser=True, is_active=True).first()

        return (user, key_obj)
