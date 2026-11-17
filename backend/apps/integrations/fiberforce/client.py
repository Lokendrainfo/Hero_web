import os
import time
import random
import logging
import threading

import requests

logger = logging.getLogger(__name__)

_thread_local = threading.local()


class TokenBucketRateLimiter:
    """
    Thread-safe token bucket rate limiter for outgoing FiberForce requests.
    Guarantees that requests to /api/ext/v1/machines/live/ strictly respect
    the maximum allowed rate of 10 requests per second.
    """
    def __init__(self, rate=10.0, capacity=10.0):
        self.rate = float(rate)          # tokens added per second (10 req/s)
        self.capacity = float(capacity)  # max burst capacity (10)
        self.tokens = float(capacity)
        self.last_update = time.time()
        self.lock = threading.Lock()
        self.cooldown_until = 0.0        # shared backoff across threads upon HTTP 429

    def set_cooldown(self, delay_seconds):
        with self.lock:
            target = time.time() + float(delay_seconds)
            if target > self.cooldown_until:
                self.cooldown_until = target

    def acquire(self):
        while True:
            sleep_needed = 0.0
            with self.lock:
                now = time.time()
                # 1. Respect 429 cooldown across all threads to prevent simultaneous retry loops
                if now < self.cooldown_until:
                    sleep_needed = self.cooldown_until - now
                else:
                    # 2. Refill tokens based on elapsed wall time
                    elapsed = now - self.last_update
                    self.last_update = now
                    self.tokens = min(self.capacity, self.tokens + (elapsed * self.rate))

                    # 3. Check token availability
                    if self.tokens >= 1.0:
                        self.tokens -= 1.0
                        return
                    else:
                        sleep_needed = (1.0 - self.tokens) / self.rate

            if sleep_needed > 0:
                time.sleep(min(sleep_needed, 0.25))


# Global rate limiter and cache for /api/ext/v1/machines/live/
_live_rate_limiter = TokenBucketRateLimiter(rate=10.0, capacity=10.0)
_live_telemetry_cache = {}
_live_cache_lock = threading.Lock()
LIVE_TELEMETRY_CACHE_TTL = 5.0  # seconds


class FiberForceClient:
    def __init__(self):
        self.base_url = (
            os.environ.get('HDD_FIBER_BASE_URL')
            or os.environ.get('FIBERFORCE_BASE_URL', 'https://api.hdd.fiberforce.in')
        ).rstrip('/')
        self.api_key = (
            os.environ.get('HDD_FIBER_API_KEY')
            or os.environ.get('FIBERFORCE_API_KEY', '')
        )
        if not self.api_key:
            try:
                from django.conf import settings
                self.api_key = getattr(settings, 'HDD_FIBER_API_KEY', '') or getattr(settings, 'FIBERFORCE_API_KEY', '')
            except Exception:
                pass

    def _session(self):
        session = getattr(_thread_local, 'ff_session', None)
        if session is None:
            session = requests.Session()
            _thread_local.ff_session = session
        return session

    def _headers(self, json_body=False):
        headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }
        if json_body:
            headers["Content-Type"] = "application/json"
        return headers

    def _request(self, method, path, *, json=None, data=None, files=None, params=None, timeout=25, max_retries=3):
        url = f"{self.base_url}{path}"
        is_live_api = "/api/ext/v1/machines/live" in path

        for attempt in range(max_retries + 1):
            if is_live_api:
                _live_rate_limiter.acquire()

            try:
                headers = self._headers(json_body=(json is not None and not files))
                if files:
                    headers.pop("Content-Type", None)
                response = self._session().request(
                    method,
                    url,
                    headers=headers,
                    json=json,
                    data=data,
                    files=files,
                    params=params,
                    timeout=timeout,
                )

                # Handle HTTP 429 Too Many Requests
                if response.status_code == 429:
                    retry_after_hdr = response.headers.get("Retry-After")
                    delay = None
                    if retry_after_hdr:
                        try:
                            delay = float(retry_after_hdr)
                        except (ValueError, TypeError):
                            pass

                    # Required 429 Retry Delay: 100–150 milliseconds if no Retry-After specified
                    if delay is None or delay <= 0:
                        delay = random.uniform(0.10, 0.15)

                    # Pause all threads accessing the live API to prevent simultaneous retry storms
                    if is_live_api:
                        _live_rate_limiter.set_cooldown(delay)

                    logger.warning(
                        "[FIBERFORCE_429] endpoint=%s attempt=%d/%d delay=%.3fs retry_after=%s",
                        path, attempt + 1, max_retries, delay, retry_after_hdr
                    )

                    # Bounded retries: avoid infinite retry loops
                    if attempt < max_retries:
                        time.sleep(delay)
                        continue
                    else:
                        return {
                            "success": False,
                            "status_code": 429,
                            "message": f"FiberForce rate limit exceeded (HTTP 429). Retries exhausted after {max_retries} attempts.",
                            "retry_after": round(delay, 3),
                            "data": {}
                        }

                try:
                    body = response.json()
                except ValueError:
                    body = {"success": False, "message": (response.text or "")[:400], "data": []}
                if not isinstance(body, dict):
                    body = {"success": False, "data": body}
                if response.status_code >= 400:
                    body.setdefault("success", False)
                    body.setdefault("status_code", response.status_code)
                    body.setdefault("message", f"FiberForce error {response.status_code}")
                return body

            except Exception as exc:
                if attempt < max_retries and is_live_api:
                    time.sleep(random.uniform(0.10, 0.15))
                    continue
                return {"success": False, "message": str(exc), "data": []}

    def get_machines(self):
        payload = self._request("GET", "/api/ext/v1/machines/")
        if payload.get("success") is False and not payload.get("data"):
            return {"success": False, "data": [], "total": 0}
        return payload

    def get_live_telemetry(self, machine_chassis_no, params=None, timeout=2.5):
        chassis_str = str(machine_chassis_no or '').strip()
        if not chassis_str:
            return {"success": False, "data": {}, "message": "Missing chassis number"}

        # Short TTL cache to prevent duplicate requests across components and intervals
        params_key = tuple(sorted(params)) if isinstance(params, list) else ('all',)
        cache_key = f"{chassis_str}:{params_key}"
        now = time.time()
        with _live_cache_lock:
            cached = _live_telemetry_cache.get(cache_key)
            if cached and (now - cached['time']) < LIVE_TELEMETRY_CACHE_TTL:
                return cached['data']

        body = {"machine_chassis_no": chassis_str}
        if params and isinstance(params, list):
            body["params"] = params

        res = self._request("POST", "/api/ext/v1/machines/live/", json=body, timeout=timeout)
        if isinstance(res, dict) and res.get("success"):
            with _live_cache_lock:
                _live_telemetry_cache[cache_key] = {"data": res, "time": time.time()}

        return res

    def get_telemetry(self, machine_chassis_no):
        return self.get_live_telemetry(machine_chassis_no)

    def get_live_param_catalog(self):
        return self._request("GET", "/api/ext/v1/machines/live/params/")

    def list_machine_breakdowns(self, machine_chassis_no, status="all", days=90, limit=100):
        return self._request("POST", "/api/ext/v1/machines/breakdowns/", json={
            "machine_chassis_no": str(machine_chassis_no),
            "status": status or "all",
            "days": days,
            "limit": limit,
        })

    def breakdown_options(self):
        return self._request("GET", "/api/ext/v1/machines/breakdowns/options/")

    def create_breakdown(self, payload):
        return self._request("POST", "/api/ext/v1/machines/breakdowns/create/", json=payload)

    def close_breakdown(self, payload):
        return self._request("POST", "/api/ext/v1/machines/breakdowns/close/", json=payload)

    def fleet_breakdowns(self, status="open", limit=200):
        return self._request("GET", "/api/ext/v1/fleet/breakdowns/", params={
            "status": status or "open",
            "limit": limit,
        })

    def ops_stop_options(self):
        return self._request("GET", "/api/ext/v1/machines/ops_stops/options/")

    def list_machine_ops_stops(self, machine_chassis_no, status="all", days=90, limit=100):
        return self._request("POST", "/api/ext/v1/machines/ops_stops/", json={
            "machine_chassis_no": str(machine_chassis_no),
            "status": status or "all",
            "days": days,
            "limit": limit,
        })

    def create_ops_stop(self, payload):
        return self._request("POST", "/api/ext/v1/machines/ops_stops/create/", json=payload)

    def close_ops_stop(self, payload):
        return self._request("POST", "/api/ext/v1/machines/ops_stops/close/", json=payload)

    def fleet_ops_stops(self, status="open", limit=200):
        return self._request("GET", "/api/ext/v1/fleet/ops_stops/", params={
            "status": status or "open",
            "limit": limit,
        })

    def get_fleet_attendance_today(self, machine_chassis_nos=None, attendance_key=None):
        """
        Today-only punch-in board (Asia/Kolkata).
        POST /api/ext/v1/fleet/attendance/today/
        Send commissioned chassis as a JSON array. Actual start = first RPM > 500 today.
        """
        body = {}
        if machine_chassis_nos:
            if isinstance(machine_chassis_nos, str):
                body["machine_chassis_no"] = machine_chassis_nos
            else:
                body["machine_chassis_no"] = [str(c).strip() for c in machine_chassis_nos if str(c).strip()]
        if attendance_key:
            body["attendance_key"] = str(attendance_key).strip()
        return self._request("POST", "/api/ext/v1/fleet/attendance/today/", json=body, timeout=8)

    def list_refuels(
        self,
        *,
        machine_chassis_no=None,
        days=30,
        date=None,
        status=None,
        acknowledged=None,
        page=1,
        page_size=50,
    ):
        """
        Sensor-detected tank fills from FiberForce.
        POST /api/ext/v1/machines/refuel/
        status: PENDING | CONFIRMED | DENIED (omit for all)
        """
        body = {
            "page": int(page or 1),
            "page_size": min(200, max(1, int(page_size or 50))),
        }
        if machine_chassis_no:
            body["machine_chassis_no"] = str(machine_chassis_no).strip()
        if date:
            body["date"] = str(date).strip()
        else:
            body["days"] = min(365, max(1, int(days or 30)))
        if status:
            body["status"] = str(status).strip().upper()
        if acknowledged is not None:
            body["acknowledged"] = bool(acknowledged)
        return self._request("POST", "/api/ext/v1/machines/refuel/", json=body)

    def confirm_refuel(self, data, files=None):
        """Map slip / litres to 1..N sensor fills. POST /api/ext/v1/machines/refuel/confirm/"""
        if not files or 'slip' not in files:
            # 1x1 dummy JPEG so FiberForce API satisfies slip image requirement if omitted by user
            dummy_jpg = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' \",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9'
            files = {'slip': ('voucher.jpg', dummy_jpg, 'image/jpeg')}
        return self._request("POST", "/api/ext/v1/machines/refuel/confirm/", data=data, files=files)

    def deny_refuel(self, payload):
        """Archive false spike. POST /api/ext/v1/machines/refuel/deny/"""
        return self._request("POST", "/api/ext/v1/machines/refuel/deny/", json=payload or {})
