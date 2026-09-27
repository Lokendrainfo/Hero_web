import os
import time
import base64
import json
import logging
import threading
from typing import Optional, Tuple, Dict, Any
from django.conf import settings
from .exceptions import IlyncAuthException

logger = logging.getLogger(__name__)


class IlyncTokenManager:
    """
    Centralized, thread-safe manager for iLync authentication and token lifecycle.
    - Decodes JWT expiry safely without signature verification.
    - Automatically renews tokens before expiry (< 10 minutes remaining).
    - Thread-safe double-checked locking: prevents redundant login storms during concurrent requests.
    - Never logs sensitive tokens, passwords, or credentials.
    - Integrates with login (POST /api/auth/login) and refresh (POST /api/auth/refresh).
    """

    _lock = threading.RLock()
    _cached_access_token: Optional[str] = None
    _cached_refresh_token: Optional[str] = None
    _token_expiry: Optional[int] = None
    _EXPIRY_BUFFER_SECONDS = 600  # Proactively refresh when <= 10 minutes remain

    @classmethod
    def get_base_url(cls) -> str:
        base = getattr(settings, 'ILYNC_BASE_URL', os.getenv('ILYNC_BASE_URL', 'https://ilync.tech'))
        return base.rstrip('/')

    @classmethod
    def get_auth_url(cls, endpoint_path: str) -> str:
        base = cls.get_base_url()
        if base.endswith('/api'):
            base = base[:-4]
        return f"{base}/api/{endpoint_path.lstrip('/')}"

    @classmethod
    def get_credentials(cls) -> Dict[str, str]:
        phone_number = (
            getattr(settings, 'ILYNC_PHONE_NUMBER', None)
            or os.getenv('ILYNC_PHONE_NUMBER')
            or getattr(settings, 'ILYNC_USERNAME', None)
            or os.getenv('ILYNC_USERNAME')
            or ''
        )
        password = (
            getattr(settings, 'ILYNC_PASSWORD', None)
            or os.getenv('ILYNC_PASSWORD')
            or ''
        )
        refresh_token = (
            getattr(settings, 'ILYNC_REFRESH_TOKEN', None)
            or os.getenv('ILYNC_REFRESH_TOKEN')
            or cls._cached_refresh_token
            or ''
        )
        static_token = (
            getattr(settings, 'ILYNC_API_TOKEN', None)
            or os.getenv('ILYNC_API_TOKEN')
            or getattr(settings, 'ILYNC_API_KEY', None)
            or os.getenv('ILYNC_API_KEY')
            or ''
        )
        return {
            'phone_number': str(phone_number).strip(),
            'password': str(password).strip(),
            'refresh_token': str(refresh_token).strip(),
            'static_token': str(static_token).strip(),
        }

    @staticmethod
    def decode_jwt_expiry(token: str) -> Optional[int]:
        """
        Safely extracts exp (unix epoch) from JWT without verifying signature.
        Never logs or exposes the token content.
        """
        if not token or not isinstance(token, str) or '.' not in token:
            return None

        # 1. Attempt PyJWT decode
        try:
            import jwt
            decoded = jwt.decode(token, options={"verify_signature": False})
            exp = decoded.get('exp')
            if exp is not None:
                return int(exp)
        except Exception:
            pass

        # 2. Fallback to manual payload base64 parsing
        try:
            parts = token.split('.')
            if len(parts) >= 2:
                payload_b64 = parts[1]
                rem = len(payload_b64) % 4
                if rem > 0:
                    payload_b64 += '=' * (4 - rem)
                payload_bytes = base64.urlsafe_b64decode(payload_b64.encode('utf-8'))
                payload_json = json.loads(payload_bytes.decode('utf-8'))
                exp = payload_json.get('exp')
                if exp is not None:
                    return int(exp)
        except Exception:
            pass

        return None

    @classmethod
    def check_token_status(cls, token: Optional[str]) -> str:
        """
        Returns one of: 'EXPIRED', 'NEAR_EXPIRY', 'VALID'.
        """
        if not token:
            return "EXPIRED"

        exp = cls.decode_jwt_expiry(token)
        if exp is None:
            # Opaque token or unparseable expiry: treat as valid until 401
            return "VALID"

        now = int(time.time())
        if now >= exp:
            return "EXPIRED"
        if (exp - now) <= cls._EXPIRY_BUFFER_SECONDS:
            return "NEAR_EXPIRY"
        return "VALID"

    @classmethod
    def invalidate(cls) -> None:
        """Invalidates in-memory cached tokens (e.g. upon receiving 401 or test reset)."""
        with cls._lock:
            cls._cached_access_token = None
            cls._cached_refresh_token = None
            cls._token_expiry = None

    @classmethod
    def get_valid_token(cls, force_refresh: bool = False) -> str:
        """
        Retrieves a valid token. If missing, near-expiry, or expired, performs
        thread-safe renewal.
        """
        # 1. Optimistic check without acquiring lock (fast path)
        if not force_refresh and cls._cached_access_token:
            status = cls.check_token_status(cls._cached_access_token)
            if status == "VALID":
                logger.debug("[ILYNC_AUTH] Token valid")
                return cls._cached_access_token

        # 2. Acquire lock for thread-safe renewal (Double-Checked Locking Pattern)
        with cls._lock:
            # Re-check inside lock: another thread might have just refreshed it
            if not force_refresh and cls._cached_access_token:
                status = cls.check_token_status(cls._cached_access_token)
                if status == "VALID":
                    logger.info("[ILYNC_AUTH] Token valid")
                    return cls._cached_access_token

            if cls._cached_access_token:
                status = cls.check_token_status(cls._cached_access_token)
                if status == "NEAR_EXPIRY":
                    logger.info("[ILYNC_AUTH] Token near expiry, refreshing")

            return cls._renew_token_under_lock(force_refresh=force_refresh)

    @classmethod
    def _renew_token_under_lock(cls, force_refresh: bool = False) -> str:
        creds = cls.get_credentials()
        phone_number = creds['phone_number']
        password = creds['password']
        refresh_token = creds['refresh_token']
        static_token = creds['static_token']

        # 1. Primary: Use configured ILYNC_API_TOKEN directly if strictly VALID
        if not force_refresh and static_token:
            token_status = cls.check_token_status(static_token)
            if token_status == "VALID":
                cls._cached_access_token = static_token
                cls._token_expiry = cls.decode_jwt_expiry(static_token)
                logger.info("[ILYNC_AUTH] Token valid")
                return static_token

        # 2. Token refresh endpoint if refresh_token available
        if refresh_token:
            try:
                new_access, new_refresh = cls._call_refresh_api(refresh_token)
                if new_access:
                    cls._cached_access_token = new_access
                    if new_refresh:
                        cls._cached_refresh_token = new_refresh
                    cls._token_expiry = cls.decode_jwt_expiry(new_access)
                    logger.info("[ILYNC_AUTH] Authentication successful via refresh token")
                    return new_access
            except Exception as e:
                logger.warning("[ILYNC_AUTH] Refresh token failed: %s", type(e).__name__)

        # 3. Optional fallback: Login endpoint if phone_number and password available
        if phone_number and password:
            try:
                new_access, new_refresh = cls._call_login_api(phone_number, password)
                if new_access:
                    cls._cached_access_token = new_access
                    if new_refresh:
                        cls._cached_refresh_token = new_refresh
                    cls._token_expiry = cls.decode_jwt_expiry(new_access)
                    logger.info("[ILYNC_AUTH] Authentication successful via credentials")
                    return new_access
            except Exception as e:
                logger.error("[ILYNC_AUTH] Authentication failed via credentials")
                raise IlyncAuthException("iLync login authentication failed")

        # 4. Fallback to configured ILYNC_API_TOKEN
        if static_token:
            cls._cached_access_token = static_token
            cls._token_expiry = cls.decode_jwt_expiry(static_token)
            logger.info("[ILYNC_AUTH] Using configured ILYNC_API_TOKEN")
            return static_token

        logger.error("[ILYNC_AUTH] Authentication failed: No ILYNC_API_TOKEN or credentials configured")
        raise IlyncAuthException("No iLync API token or credentials configured")

    @classmethod
    def _call_login_api(cls, phone_number: str, password: str, timeout: float = 10.0) -> Tuple[str, Optional[str]]:
        import requests
        url = cls.get_auth_url("auth/login")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        payload = {
            "phoneNumber": phone_number,
            "password": password
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
        if resp.status_code in (200, 201):
            data = resp.json()
            access_token, refresh_token = cls.extract_tokens_from_response(data)
            if not access_token:
                raise IlyncAuthException("No access token found in iLync login response")
            return access_token, refresh_token
        else:
            logger.error("[ILYNC_AUTH] Authentication failed")
            raise IlyncAuthException(f"iLync login returned status {resp.status_code}")

    @classmethod
    def _call_refresh_api(cls, refresh_token: str, timeout: float = 10.0) -> Tuple[str, Optional[str]]:
        import requests
        url = cls.get_auth_url("auth/refresh")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        payload = {
            "refreshToken": refresh_token
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
        if resp.status_code in (200, 201):
            data = resp.json()
            access_token, new_refresh_token = cls.extract_tokens_from_response(data)
            if not access_token:
                raise IlyncAuthException("No access token found in iLync refresh response")
            return access_token, new_refresh_token or refresh_token
        else:
            raise IlyncAuthException(f"iLync refresh returned status {resp.status_code}")

    @staticmethod
    def extract_tokens_from_response(res_data: Any) -> Tuple[Optional[str], Optional[str]]:
        if not isinstance(res_data, dict):
            return None, None
        payload = res_data.get('data') if isinstance(res_data.get('data'), dict) else res_data
        access_token = (
            payload.get('accessToken')
            or payload.get('token')
            or payload.get('access_token')
            or res_data.get('accessToken')
            or res_data.get('token')
        )
        refresh_token = (
            payload.get('refreshToken')
            or payload.get('refresh_token')
            or res_data.get('refreshToken')
            or res_data.get('refresh_token')
        )
        return access_token, refresh_token

    @classmethod
    def apply_auth_headers(cls, headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = headers or {}
        try:
            token = cls.get_valid_token()
            if token and token != "<PUT_REAL_TOKEN_HERE>":
                headers['Authorization'] = f"Bearer {token}"
        except Exception as e:
            logger.error("[ILYNC_AUTH] Failed applying auth headers: %s", type(e).__name__)
        headers['Accept'] = 'application/json'
        headers['Content-Type'] = 'application/json'
        return headers

    @classmethod
    def get_api_token(cls) -> str:
        """Backward-compatible helper returning the active valid token."""
        return cls.get_valid_token()


# Alias for backwards compatibility with existing Hero backend modules
IlyncAuthManager = IlyncTokenManager
