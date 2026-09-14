import time
import logging
import requests
from django.conf import settings
from .ilync_auth import IlyncAuthManager
from .exceptions import (
    IlyncAPIException,
    IlyncAuthException,
    IlyncTimeoutException,
    IlyncNotFoundException,
    IlyncRateLimitException
)

logger = logging.getLogger(__name__)

class IlyncClient:
    def __init__(self, timeout=(5.0, 15.0), request=None):
        self.base_url = IlyncAuthManager.get_base_url().rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.request = request

    def _request(self, method, endpoint, params=None, data=None, json=None, headers=None):
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        req_headers = IlyncAuthManager.apply_auth_headers(headers)

        start_time = time.time()
        try:
            response = self.session.request(
                method=method.upper(),
                url=url,
                params=params,
                data=data,
                json=json,
                headers=req_headers,
                timeout=self.timeout
            )
            duration = round((time.time() - start_time) * 1000, 2)
            
            # SAFE LOGGING: NEVER LOG AUTHORIZATION HEADERS OR TOKENS
            logger.info("ILYNC API request %s %s -> %s (%sms)", method.upper(), endpoint, response.status_code, duration)

            return self._handle_response(response, endpoint)

        except (requests.exceptions.ConnectTimeout, requests.exceptions.ReadTimeout) as e:
            logger.error("ILYNC request timeout for %s %s: %s", method.upper(), endpoint, str(e))
            raise IlyncTimeoutException()
        except requests.exceptions.RequestException as e:
            logger.error("ILYNC connection error for %s %s: %s", method.upper(), endpoint, str(e))
            raise IlyncAPIException(message="Connection error to ILYNC API", status_code=503)

    def _handle_response(self, response, endpoint):
        status_code = response.status_code

        if status_code in (200, 201):
            try:
                return response.json()
            except Exception:
                return {"success": True, "data": response.text}
        elif status_code == 204:
            return {"success": True, "data": None}
        elif status_code == 401:
            raise IlyncAuthException()
        elif status_code == 404:
            raise IlyncNotFoundException(message=f"ILYNC resource not found at {endpoint}")
        elif status_code == 429:
            raise IlyncRateLimitException()
        else:
            try:
                err_payload = response.json()
            except Exception:
                err_payload = {"detail": response.text}
            raise IlyncAPIException(
                message=f"Upstream ILYNC HTTP {status_code}",
                status_code=status_code,
                payload=err_payload
            )

    def get(self, endpoint, params=None, headers=None):
        return self._request('GET', endpoint, params=params, headers=headers)

    def post(self, endpoint, json=None, params=None, headers=None):
        return self._request('POST', endpoint, json=json, params=params, headers=headers)

    def put(self, endpoint, json=None, params=None, headers=None):
        return self._request('PUT', endpoint, json=json, params=params, headers=headers)

    def patch(self, endpoint, json=None, params=None, headers=None):
        return self._request('PATCH', endpoint, json=json, params=params, headers=headers)

    def delete(self, endpoint, params=None, headers=None):
        return self._request('DELETE', endpoint, params=params, headers=headers)

    # Standard Upstream Endpoints
    def get_vendors(self, page=0, size=10, search=None):
        try:
            res = self.get("api/vendor/list")
            if isinstance(res, dict) and res.get('success'):
                return res
        except Exception:
            pass
        params = {"page": page, "size": size}
        if search:
            params["search"] = search
        return self.get("api/vendor", params=params)

    def get_vendor_by_id(self, vendor_id):
        return self.get(f"api/vendor/{vendor_id}")

    def get_vendor_by_user_id(self, user_id):
        return self.get(f"api/vendor/user/{user_id}")

    def get_task_by_id(self, task_id):
        return self.get(f"api/tasks/{task_id}")

    def get_task_detail(self, task_id):
        return self.get_task_by_id(task_id)

    def get_task_children(self, task_id):
        return self.get(f"api/tasks/{task_id}/children")

    def get_task_execution(self, task_id):
        return self.get(f"api/task-executions/{task_id}")

    def get_users(self, page=0, size=10):
        params = {"page": page, "size": size}
        return self.get("api/users", params=params)

    def get_locations(self, page=0, size=100, search=None):
        params = {"page": page, "size": size}
        if search:
            params["search"] = search
        return self.get("api/locations", params=params)

    def search_stock_issues(self, payload=None):
        return self.post("api/inventory/stock-issue/search", json=payload or {})

    def search_stock_balance(self, payload=None):
        return self.post("api/inventory/stock/balance/search", json=payload or {})

    def search_stock_items(self, payload=None):
        return self.post("api/inventory/stock/item/search", json=payload or {})

    def get_my_tasks(self, task_type=None, page=0, size=10, params=None):
        valid_types = {
            "GP_SURVEY", "OTDR_SURVEY", "FIBER_SURVEY", "BLOCK_SURVEY",
            "FIBER_TRENCHING_DUCTING_TASK", "LAND_BASED_SURVEY",
            "GREEN_SURVEY", "BROWN_SURVEY"
        }
        req_params = {"page": page, "size": size}
        if task_type and str(task_type).upper() in valid_types:
            req_params["taskType"] = str(task_type).upper()
        
        allowed_keys = {'search', 'query', 'taskType'}
        if params and isinstance(params, dict):
            for k, v in params.items():
                if k in allowed_keys:
                    if k == 'taskType' and str(v).upper() in valid_types:
                        req_params['taskType'] = str(v).upper()
                    elif k != 'taskType':
                        req_params[k] = v

        try:
            return self.get("api/tasks/my-tasks", params=req_params)
        except IlyncAPIException as e:
            if e.status_code == 400 and "taskType" in req_params:
                req_params.pop("taskType", None)
                return self.get("api/tasks/my-tasks", params=req_params)
            raise e

    def get_task_type_counts(self):
        return self.get("api/tasks/my-tasks/type-counts")

    def get_enterprise_roles(self):
        return self.get("api/enterprise/roles")

    def get_survey_photo_urls(self, photo_keys):
        if not photo_keys or not isinstance(photo_keys, list):
            return {"success": True, "data": {}}

        merged = {}
        chunk_size = 40
        previous_timeout = self.timeout
        self.timeout = (5.0, 25.0)
        try:
            for i in range(0, len(photo_keys), chunk_size):
                chunk = photo_keys[i:i + chunk_size]
                try:
                    res = self.post("api/survey/photo-urls", json={"photoKeys": chunk})
                    data = res.get("data") if isinstance(res, dict) else None
                    if isinstance(data, dict):
                        merged.update(data)
                except IlyncAPIException as exc:
                    logger.warning(
                        "Photo URL chunk failed (%s keys at offset %s): %s",
                        len(chunk),
                        i,
                        exc,
                    )
        finally:
            self.timeout = previous_timeout
        return {"success": True, "data": merged}


