"""
Machine Live API Rate Limiting & Throttling
Strictly enforces maximum 10 requests per second for /api/ext/v1/machines/live/.
Thread-safe, concurrency-safe sliding-window rate limiter with User/API Key/IP scoping.
"""
import time
import logging
from threading import Lock
from collections import defaultdict
from django.conf import settings
from rest_framework.throttling import BaseThrottle
from rest_framework.exceptions import Throttled

logger = logging.getLogger(__name__)

# Thread-safe sliding window storage
_rate_lock = Lock()
_window_history = defaultdict(list)
_cleanup_last_run = time.time()


def get_client_ip(request):
    """Safely extract client IP address from request headers."""
    if not request:
        return '127.0.0.1'
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1') or '127.0.0.1'


def get_rate_limit_identity(request):
    """
    Preserve rate-limit scope:
    1. Authenticated User (user.id)
    2. API Key (X-API-Key / Authorization header or request.auth)
    3. Client IP Address (X-Forwarded-For or REMOTE_ADDR)
    """
    if not request:
        return 'anon:127.0.0.1'

    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return f"user:{getattr(user, 'id', user.pk)}"

    # Check API key from auth or headers
    auth_obj = getattr(request, 'auth', None)
    if auth_obj and hasattr(auth_obj, 'key'):
        return f"apikey:{auth_obj.key[:16]}"

    api_key = request.META.get('HTTP_X_API_KEY')
    if not api_key:
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Api-Key '):
            api_key = auth_header.split(' ', 1)[1].strip()

    if api_key:
        return f"apikey:{api_key[:16]}"

    return f"ip:{get_client_ip(request)}"


class MachineLiveRateThrottle(BaseThrottle):
    """
    Strict Rate Limiter for Machine Live API (/api/ext/v1/machines/live/).
    - Maximum allowed rate: 10 requests per second.
    - Scope: Authenticated User > API Key > Client IP.
    - Concurrency-safe: serialized lock prevents concurrent race-condition bypass.
    - Returns HTTP 429 (Too Many Requests) with Retry-After header.
    """
    # Rate limit: 10 requests per 1 second
    DEFAULT_RATE_LIMIT = 10
    WINDOW_SECONDS = 1.0

    def __init__(self):
        self.rate_limit = getattr(settings, 'MACHINE_LIVE_RATE_LIMIT', self.DEFAULT_RATE_LIMIT)
        self._wait_time = 0.0

    def get_ident(self, request):
        return get_rate_limit_identity(request)

    def allow_request(self, request, view):
        global _cleanup_last_run
        now = time.time()
        ident = self.get_ident(request)
        cutoff = now - self.WINDOW_SECONDS

        with _rate_lock:
            # Periodic cleanup of idle identities every 60 seconds
            if now - _cleanup_last_run > 60.0:
                for k in list(_window_history.keys()):
                    _window_history[k] = [t for t in _window_history[k] if t > cutoff]
                    if not _window_history[k]:
                        _window_history.pop(k, None)
                _cleanup_last_run = now

            timestamps = [t for t in _window_history[ident] if t > cutoff]

            if len(timestamps) >= self.rate_limit:
                # Exceeded rate limit: calculate remaining wait in window
                oldest = timestamps[0]
                self._wait_time = max(0.1, self.WINDOW_SECONDS - (now - oldest))
                _window_history[ident] = timestamps
                logger.warning(
                    "[RATE_LIMIT_EXCEEDED] ident=%s endpoint=/api/ext/v1/machines/live/ count=%d limit=%d retry_after=%.3fs",
                    ident, len(timestamps), self.rate_limit, self._wait_time
                )
                return False

            timestamps.append(now)
            _window_history[ident] = timestamps
            self._wait_time = 0.0
            return True

    def wait(self):
        """Returns the number of seconds to wait before retrying (used for Retry-After header)."""
        return max(0.1, self._wait_time)


def check_machine_live_rate_limit(request, rate_limit=10, window=1.0):
    """
    Programmatic helper to check if a request exceeds the 10 req/s limit.
    Returns (allowed: bool, retry_after_seconds: float).
    """
    now = time.time()
    ident = get_rate_limit_identity(request)
    cutoff = now - window

    with _rate_lock:
        timestamps = [t for t in _window_history[ident] if t > cutoff]
        if len(timestamps) >= rate_limit:
            oldest = timestamps[0]
            wait_time = max(0.1, window - (now - oldest))
            _window_history[ident] = timestamps
            return False, wait_time

        timestamps.append(now)
        _window_history[ident] = timestamps
        return True, 0.0

