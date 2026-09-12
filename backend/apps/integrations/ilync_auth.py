import os
from django.conf import settings

class IlyncAuthManager:
    @staticmethod
    def get_base_url():
        return getattr(settings, 'ILYNC_BASE_URL', os.getenv('ILYNC_BASE_URL', 'https://ilync.tech'))

    @staticmethod
    def get_api_token():
        return getattr(settings, 'ILYNC_API_TOKEN', os.getenv('ILYNC_API_TOKEN', ''))

    @classmethod
    def apply_auth_headers(cls, headers=None):
        headers = headers or {}
        token = cls.get_api_token()
        if token and token != "<PUT_REAL_TOKEN_HERE>":
            headers['Authorization'] = f"Bearer {token}"
        headers['Accept'] = 'application/json'
        headers['Content-Type'] = 'application/json'
        return headers
