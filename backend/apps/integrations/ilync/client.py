import os
import requests
from pathlib import Path
import dotenv

class IlyncClient:
    def __init__(self):
        try:
            env_path = Path(__file__).resolve().parent.parent.parent.parent / '.env'
            dotenv.load_dotenv(env_path)
        except Exception:
            pass

        from apps.integrations.ilync_auth import IlyncAuthManager
        base_env = IlyncAuthManager.get_base_url()
        base_env = base_env.rstrip('/')
        if not base_env.endswith('/api'):
            base_env = f"{base_env}/api"
        self.base_url = base_env

    def _get_headers(self):
        from apps.integrations.ilync_auth import IlyncAuthManager
        return IlyncAuthManager.apply_auth_headers()

    def get_vendors(self, page=0, size=10):
        url = f"{self.base_url}/vendor?page={page}&size={size}"
        try:
            res = requests.get(url, headers=self._get_headers(), timeout=8)
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            print(f"[IlyncClient] Error fetching vendors: {e}")
        
        # Structured fallback mock for demo/offline compliance
        return {
            "content": [
                {
                    "id": "6a7c2b4f8e16e804697f18b0",
                    "name": "Apex Equipment Services",
                    "code": "VEN-001",
                    "contactPerson": "Ravi Kumar",
                    "email": "ravi@apex.local",
                    "mobile": "9876543210",
                    "category": "HEAVY_MACHINERY",
                    "status": "ACTIVE",
                    "machinesCount": 12,
                    "rating": 4.8
                },
                {
                    "id": "7b8d3c5a9f27f915708a29c1",
                    "name": "Mahaveer HDD Parts & Spares",
                    "code": "VEN-002",
                    "contactPerson": "Mahaveer Gurjar",
                    "email": "mahaveer@hddparts.local",
                    "mobile": "6201205697",
                    "category": "SPARE_PARTS",
                    "status": "ACTIVE",
                    "machinesCount": 6,
                    "rating": 4.6
                },
                {
                    "id": "8c9e4d6b0a38a026819b30d2",
                    "name": "Indian Oil Fleet Fueling",
                    "code": "VEN-003",
                    "contactPerson": "Swarnim Mittal",
                    "email": "contacts@example.com",
                    "mobile": "8765432346",
                    "category": "FUEL_SUPPLIER",
                    "status": "ACTIVE",
                    "machinesCount": 22,
                    "rating": 4.9
                }
            ],
            "totalElements": 3,
            "totalPages": 1,
            "page": page,
            "size": size
        }

    def get_vendor_by_id(self, vendor_id):
        url = f"{self.base_url}/vendor/{vendor_id}"
        try:
            res = requests.get(url, headers=self._get_headers(), timeout=8)
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            print(f"[IlyncClient] Error fetching vendor {vendor_id}: {e}")

        return {
            "id": vendor_id,
            "name": "Apex Equipment Services",
            "code": "VEN-001",
            "contactPerson": "Ravi Kumar",
            "email": "ravi@apex.local",
            "mobile": "9876543210",
            "category": "HEAVY_MACHINERY",
            "status": "ACTIVE",
            "address": "Sector 63, Gurugram, HR",
            "machinesCount": 12,
            "rating": 4.8,
            "assignedMachines": ["600202608396", "600202608397", "600202608398"]
        }

    def get_users(self, page=0, size=10):
        url = f"{self.base_url}/users?page={page}&size={size}"
        try:
            res = requests.get(url, headers=self._get_headers(), timeout=8)
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            print(f"[IlyncClient] Error fetching users: {e}")

        return {
            "content": [
                {"id": 1, "username": "admin", "first_name": "System", "last_name": "Admin", "email": "admin@hero.local", "role": "ADMIN", "is_active": True},
                {"id": 2, "username": "ravi_operator", "first_name": "Ravi", "last_name": "Kumar", "email": "ravi@operator.local", "role": "OPERATOR", "is_active": True},
                {"id": 3, "username": "mahaveer_hero", "first_name": "Mahaveer", "last_name": "Gurjar", "email": "mahaveer@operator.local", "role": "HERO", "is_active": True}
            ],
            "totalElements": 3,
            "totalPages": 1,
            "page": page,
            "size": size
        }

    def search_stock_items(self, payload=None, query=""):
        url = f"{self.base_url}/inventory/stock/item/search"
        json_body = payload if isinstance(payload, dict) else {"query": query or ""}
        try:
            res = requests.post(url, json=json_body, headers=self._get_headers(), timeout=8)
            if res.status_code in [200, 201]:
                return res.json()
        except Exception as e:
            print(f"[IlyncClient] Error searching stock items: {e}")

        return {
            "items": [
                {"id": "STK-101", "name": "Bentonite Drilling Fluid (50kg)", "part_number": "FLUID-BEN-50", "category": "DRILLING_FLUID", "quantity": 120, "unit_price": 1450.0, "location": "Sujangarh-SITE Warehouse"},
                {"id": "STK-102", "name": "HDD Drill Rod (3.0m Threaded)", "part_number": "ROD-HDD-3M", "category": "DRILL_RODS", "quantity": 45, "unit_price": 8500.0, "location": "Sujangarh-SITE Yard"},
                {"id": "STK-103", "name": "Reamer Cutter Head (12 inch)", "part_number": "REMH-12IN", "category": "CUTTERS", "quantity": 8, "unit_price": 24500.0, "location": "Sujangarh-SITE Spares Rack"},
                {"id": "STK-104", "name": "Hydraulic Oil Filter Element", "part_number": "FLT-HYD-A600", "category": "FILTERS", "quantity": 30, "unit_price": 1850.0, "location": "Gurugram Central Store"}
            ]
        }

    def search_stock_balance(self, payload=None, query=""):
        url = f"{self.base_url}/inventory/stock/balance/search"
        json_body = payload if isinstance(payload, dict) else {"query": query or ""}
        try:
            res = requests.post(url, json=json_body, headers=self._get_headers(), timeout=8)
            if res.status_code in [200, 201]:
                return res.json()
        except Exception as e:
            print(f"[IlyncClient] Error searching stock balance: {e}")

        return {
            "balances": [
                {"itemId": "STK-101", "itemName": "Bentonite Drilling Fluid (50kg)", "siteName": "Sujangarh-SITE", "openingBalance": 150, "issued": 30, "closingBalance": 120, "unit": "Bags"},
                {"itemId": "STK-102", "itemName": "HDD Drill Rod (3.0m Threaded)", "siteName": "Sujangarh-SITE", "openingBalance": 50, "issued": 5, "closingBalance": 45, "unit": "Pcs"},
                {"itemId": "STK-103", "itemName": "Reamer Cutter Head (12 inch)", "siteName": "Sujangarh-SITE", "openingBalance": 10, "issued": 2, "closingBalance": 8, "unit": "Pcs"}
            ]
        }

    def search_stock_issues(self, payload=None, query=""):
        url = f"{self.base_url}/inventory/stock-issue/search"
        json_body = payload if isinstance(payload, dict) else {"query": query or ""}
        try:
            res = requests.post(url, json=json_body, headers=self._get_headers(), timeout=8)
            if res.status_code in [200, 201]:
                return res.json()
        except Exception as e:
            print(f"[IlyncClient] Error searching stock issues: {e}")

        return {
            "issues": [
                {"issueId": "ISS-501", "itemName": "Bentonite Drilling Fluid (50kg)", "quantity": 10, "issuedTo": "A600 HDD (8396)", "issuedBy": "Mahaveer Gurjar", "date": "04 Sep 2026", "status": "APPROVED"},
                {"issueId": "ISS-502", "itemName": "HDD Drill Rod (3.0m Threaded)", "quantity": 2, "issuedTo": "A800 HDD (7590)", "issuedBy": "Chandan Kumar Verma", "date": "03 Sep 2026", "status": "ISSUED"}
            ]
        }

    def get_my_tasks(self, task_type="FIBER_TASK", page=0, size=10):
        url = f"{self.base_url}/tasks/my-tasks?taskType={task_type}&page={page}&size={size}"
        try:
            res = requests.get(url, headers=self._get_headers(), timeout=10)
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            print(f"[IlyncClient] Error fetching my tasks: {e}")
        
        return {
            "data": {
                "content": [],
                "currentPage": page,
                "pageSize": size,
                "totalElements": 0,
                "totalPages": 1
            }
        }
