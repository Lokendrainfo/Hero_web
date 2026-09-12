import os
import requests

class FiberForceClient:
    def __init__(self):
        self.base_url = os.environ.get('FIBERFORCE_BASE_URL', 'https://api.hdd.fiberforce.in')
        self.api_key = os.environ.get('FIBERFORCE_API_KEY', 'viq_vIkdGfQn-YGg3934R6AsNOJCGJGxpyrIt4hLATcQCek')

    def get_machines(self):
        url = f"{self.base_url.rstrip('/')}/api/ext/v1/machines/"
        headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json"
        }
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"[FiberForceClient] Error fetching machines: {e}")
        return {"success": False, "data": [], "total": 0}

    def get_live_telemetry(self, machine_chassis_no, params=None):
        url = f"{self.base_url.rstrip('/')}/api/ext/v1/machines/live/"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        payload = {
            "machine_chassis_no": str(machine_chassis_no)
        }
        if params and isinstance(params, list):
            payload["params"] = params

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"[FiberForceClient] Error fetching live telemetry for {machine_chassis_no}: {e}")
        return {"success": False, "data": {}}

    def get_telemetry(self, machine_chassis_no):
        return self.get_live_telemetry(machine_chassis_no)

    def get_live_param_catalog(self):
        url = f"{self.base_url.rstrip('/')}/api/ext/v1/machines/live/params/"
        headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json"
        }
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"[FiberForceClient] Error fetching live param catalog: {e}")
        return {"success": False, "data": []}
