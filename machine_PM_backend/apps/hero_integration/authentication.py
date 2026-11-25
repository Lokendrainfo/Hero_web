from django.conf import settings
from django.utils import timezone
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import HeroAPIKey, HeroUser


class HeroJWTAuthentication(authentication.BaseAuthentication):
    """
    Authenticates requests using JWT Bearer tokens issued by the existing HERO backend.
    Resolves users directly from HERO's `authentication_user` table without duplicating users.
    """

    keyword = 'Bearer'

    def authenticate(self, request):
        auth_header = authentication.get_authorization_header(request).decode('utf-8')
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != self.keyword.lower():
            return None

        raw_token = parts[1].strip()
        if not raw_token:
            return None

        try:
            token = AccessToken(raw_token)
        except TokenError as exc:
            raise AuthenticationFailed(f"Invalid or expired token: {exc}")

        user_id_claim = settings.SIMPLE_JWT.get('USER_ID_CLAIM', 'user_id')
        user_id = token.get(user_id_claim)
        if not user_id:
            raise AuthenticationFailed("Token missing user_id claim.")

        user = HeroUser.objects.select_related('vendor').filter(id=user_id).first()
        if not user:
            raise AuthenticationFailed("Authenticated HERO user not found.")
        if not user.is_active:
            raise AuthenticationFailed("HERO user account is inactive.")

        return (user, token)

    def authenticate_header(self, request):
        return self.keyword


class HeroAPIKeyAuthentication(authentication.BaseAuthentication):
    """
    API key authentication compatible with HERO's `authentication_apikey` table.
    Supports:
    - Header: X-API-Key: <key>
    - Header: Authorization: Api-Key <key>
    """

    header_name = 'HTTP_X_API_KEY'

    def authenticate(self, request):
        api_key = request.META.get(self.header_name)
        if not api_key:
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Api-Key '):
                api_key = auth_header.split(' ', 1)[1].strip()

        if not api_key:
            return None

        key_obj = (
            HeroAPIKey.objects.select_related('user', 'user__vendor')
            .filter(key=api_key.strip(), is_active=True)
            .first()
        )
        if not key_obj:
            raise AuthenticationFailed("Invalid or inactive API key.")

        user = key_obj.user
        if not user:
            user = HeroUser.objects.select_related('vendor').filter(is_superuser=True, is_active=True).first()
        if not user or not user.is_active:
            raise AuthenticationFailed("API key user account is missing or inactive.")

        return (user, key_obj)

