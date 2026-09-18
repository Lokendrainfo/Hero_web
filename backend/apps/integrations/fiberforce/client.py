import os
import threading
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class FiberForceClient:
    """Thread-local pooled HTTP client for FiberForce (safe under ThreadPoolExecutor)."""

    _local = threading.local()

    def __init__(self):
        self.base_url = os.environ.get('FIBERFORCE_BASE_URL', 'https://api.hdd.fiberforce.in').rstrip('/')
        self.api_key = os.environ.get('FIBERFORCE_API_KEY', '') or os.environ.get(
            'FIBERFORCE_KEY',
            'viq_vIkdGfQn-YGg3934R6AsNOJCGJGxpyrIt4hLATcQCek',
        )

    def _session(self):
        session = getattr(self._local, 'session', None)
        if session is None:
            session = requests.Session()
            retry = Retry(
                total=1,
                connect=1,
                read=0,
                backoff_factor=0.2,
                status_forcelist=(502, 503, 504),
                allowed_methods=frozenset(['GET', 'POST']),
            )
            adapter = HTTPAdapter(pool_connections=32, pool_maxsize=32, max_retries=retry)
            session.mount('https://', adapter)
            session.mount('http://', adapter)
            self._local.session = session
        return session

    def _headers(self, json_body=False):
        headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }
        if json_body:
            headers["Content-Type"] = "application/json"
        return headers

    def _request(self, method, path, *, json=None, params=None, timeout=25):
        url = f"{self.base_url}{path}"
        try:
            response = self._session().request(
                method,
                url,
                headers=self._headers(json_body=json is not None),
                json=json,
                params=params,
                timeout=timeout,
            )
            try:
                body = response.json()
            except ValueError:
                body = {"success": False, "message": (response.text or "")[:400], "data": []}
            if not isinstance(body, dict):
                body = {"success": False, "data": body}
            if response.status_code >= 400:
                body.setdefault("success", False)
                body.setdefault("message", f"FiberForce error {response.status_code}")
            return body
        except Exception as exc:
            return {"success": False, "message": str(exc), "data": []}

    def get_machines(self):
        payload = self._request("GET", "/api/ext/v1/machines/", timeout=12)
        if payload.get("success") is False and not payload.get("data"):
            return {"success": False, "data": [], "total": 0}
        return payload

    def get_live_telemetry(self, machine_chassis_no, params=None, timeout=2.0):
        body = {"machine_chassis_no": str(machine_chassis_no)}
        if params and isinstance(params, list):
            body["params"] = params
        return self._request("POST", "/api/ext/v1/machines/live/", json=body, timeout=timeout)

    def get_telemetry(self, machine_chassis_no):
        return self.get_live_telemetry(machine_chassis_no)

    def get_live_param_catalog(self):
        return self._request("GET", "/api/ext/v1/machines/live/params/", timeout=8)

    def list_machine_breakdowns(self, machine_chassis_no, status="all", days=90, limit=100):
        return self._request("POST", "/api/ext/v1/machines/breakdowns/", json={
            "machine_chassis_no": str(machine_chassis_no),
            "status": status or "all",
            "days": days,
            "limit": limit,
        }, timeout=12)

    def breakdown_options(self):
        return self._request("GET", "/api/ext/v1/machines/breakdowns/options/", timeout=8)

    def create_breakdown(self, payload):
        return self._request("POST", "/api/ext/v1/machines/breakdowns/create/", json=payload)

    def close_breakdown(self, payload):
        return self._request("POST", "/api/ext/v1/machines/breakdowns/close/", json=payload)

    def fleet_breakdowns(self, status="open", limit=200):
        return self._request("GET", "/api/ext/v1/fleet/breakdowns/", params={
            "status": status or "open",
            "limit": limit,
        }, timeout=12)

    def ops_stop_options(self):
        return self._request("GET", "/api/ext/v1/machines/ops_stops/options/", timeout=8)

    def list_machine_ops_stops(self, machine_chassis_no, status="all", days=90, limit=100):
        return self._request("POST", "/api/ext/v1/machines/ops_stops/", json={
            "machine_chassis_no": str(machine_chassis_no),
            "status": status or "all",
            "days": days,
            "limit": limit,
        }, timeout=12)

    def create_ops_stop(self, payload):
        return self._request("POST", "/api/ext/v1/machines/ops_stops/create/", json=payload)

    def close_ops_stop(self, payload):
        return self._request("POST", "/api/ext/v1/machines/ops_stops/close/", json=payload)

    def fleet_ops_stops(self, status="open", limit=200):
        return self._request("GET", "/api/ext/v1/fleet/ops_stops/", params={
            "status": status or "open",
            "limit": limit,
        }, timeout=12)

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
        return self._request("POST", "/api/ext/v1/machines/refuel/", json=body, timeout=15)

    def confirm_refuel(self, payload):
        return self._request("POST", "/api/ext/v1/machines/refuel/confirm/", json=payload or {})

    def deny_refuel(self, payload):
        return self._request("POST", "/api/ext/v1/machines/refuel/deny/", json=payload or {})
