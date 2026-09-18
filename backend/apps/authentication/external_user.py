"""
In-memory external (iLync) user for JWT sessions — never persisted to HERO DB.
"""
from types import SimpleNamespace


class ExternalUser:
    """Duck-typed user compatible with vendor_scope / permission helpers."""

    is_authenticated = True
    is_anonymous = False
    is_staff = False
    is_superuser = False
    is_active = True
    is_external = True
    pk = None
    id = None

    def __init__(
        self,
        *,
        external_user_id,
        username=None,
        email='',
        first_name='',
        last_name='',
        phone_number='',
        employee_id='',
        role='VIEWER',
        external_vendor_id=None,
        assigned_vendor_ids=None,
        permissions=None,
    ):
        self.external_user_id = str(external_user_id)
        self.username = username or self.external_user_id
        self.email = email or ''
        self.first_name = first_name or ''
        self.last_name = last_name or ''
        self.phone_number = phone_number or ''
        self.employee_id = employee_id or ''
        self.role = role or 'VIEWER'
        self.external_vendor_id = str(external_vendor_id) if external_vendor_id else None
        self.assigned_vendor_ids = list(assigned_vendor_ids or [])
        if self.external_vendor_id and self.external_vendor_id not in self.assigned_vendor_ids:
            self.assigned_vendor_ids.append(self.external_vendor_id)
        self._permissions = list(permissions or [])
        # Synthetic id for clients that expect a numeric-ish id
        self.id = f"ext:{self.external_user_id}"
        self.pk = self.id
        self.user_type = 'NORMAL'
        self.advance_scope_type = None
        self.selected_circle_id = None
        self.selected_district_id = None
        self.selected_block_id = None
        self.reporting_manager = None
        self.reporting_manager_id = None
        self.avatar = None

    def get_full_name(self):
        name = f"{self.first_name} {self.last_name}".strip()
        return name or self.username

    def get_role_list(self):
        return [self.role] if self.role else ['VIEWER']

    def get_permission_codes(self):
        if self._permissions:
            return list(self._permissions)
        # Default vendor-facing permissions for live external sessions
        return [
            'dashboard.view', 'machines.view', 'tracking.view', 'tasks.view',
            'team.view', 'inventory.view', 'stock.view', 'maintenance.view',
            'breakdowns.view', 'alerts.view', 'notifications.view',
            'attendance.view', 'expenses.view',
        ]

    def get_assigned_vendor_ids(self):
        return list(self.assigned_vendor_ids or [])

    def get_assigned_vendors_data(self):
        result = []
        for vid in self.get_assigned_vendor_ids():
            name = str(vid)
            try:
                from apps.common.vendor_scope import _hydrate_vendor
                proxy = _hydrate_vendor(vid)
                name = getattr(proxy, 'name', name) or name
            except Exception:
                pass
            result.append({
                "id": vid,
                "external_vendor_id": str(vid),
                "name": name,
                "code": "",
            })
        return result

    @property
    def vendor_id(self):
        return self.external_vendor_id

    @property
    def vendor(self):
        if not self.external_vendor_id:
            return None
        from apps.common.vendor_scope import _hydrate_vendor
        return _hydrate_vendor(self.external_vendor_id)

    @property
    def selected_circle(self):
        return self.selected_circle_id

    @property
    def selected_district(self):
        return self.selected_district_id

    @property
    def selected_block(self):
        return self.selected_block_id

    def check_password(self, raw_password):
        return False

    def set_password(self, raw_password):
        return None

    def save(self, *args, **kwargs):
        raise RuntimeError("ExternalUser must not be persisted")

    def to_token_claims(self):
        return {
            "origin": "external",
            "user_id": self.id,
            "external_user_id": self.external_user_id,
            "username": self.username,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "phone_number": self.phone_number,
            "employee_id": self.employee_id,
            "role": self.role,
            "external_vendor_id": self.external_vendor_id,
            "assigned_vendor_ids": self.assigned_vendor_ids,
            "permissions": self.get_permission_codes(),
        }

    @classmethod
    def from_token(cls, token):
        return cls(
            external_user_id=token.get("external_user_id") or str(token.get("user_id", "")).replace("ext:", ""),
            username=token.get("username"),
            email=token.get("email") or "",
            first_name=token.get("first_name") or "",
            last_name=token.get("last_name") or "",
            phone_number=token.get("phone_number") or "",
            employee_id=token.get("employee_id") or "",
            role=token.get("role") or "VIEWER",
            external_vendor_id=token.get("external_vendor_id"),
            assigned_vendor_ids=token.get("assigned_vendor_ids") or [],
            permissions=token.get("permissions") or [],
        )

    @classmethod
    def from_ilync(cls, u_item, vendor_data=None, role="VIEWER"):
        u_item = u_item or {}
        vendor_data = vendor_data or {}
        ext_id = str(u_item.get("userId") or u_item.get("id") or "").strip()
        name = str(u_item.get("name") or u_item.get("contactName") or "").strip()
        parts = name.split(None, 1) if name else [ext_id, ""]
        v_ext = str(vendor_data.get("id") or "").strip() or None
        return cls(
            external_user_id=ext_id,
            username=str(u_item.get("empId") or u_item.get("mobile") or ext_id),
            email=str(u_item.get("email") or ""),
            first_name=parts[0],
            last_name=parts[1] if len(parts) > 1 else "",
            phone_number=str(
                u_item.get("mobile") or u_item.get("phone") or u_item.get("phoneNumber") or ""
            ),
            employee_id=str(u_item.get("empId") or "") or None,
            role=role,
            external_vendor_id=v_ext,
            assigned_vendor_ids=[v_ext] if v_ext else [],
        )


def serialize_external_user(user):
    """Match UserSerializer-ish shape for login/me responses."""
    vendors = user.get_assigned_vendors_data()
    vendor = vendors[0] if vendors else None
    return {
        "id": user.id,
        "username": user.username,
        "external_user_id": user.external_user_id,
        "name": user.get_full_name(),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "employee_id": user.employee_id,
        "phone_number": user.phone_number,
        "vendor": vendor,
        "vendor_id": user.external_vendor_id,
        "vendor_name": vendor.get("name") if vendor else None,
        "role": user.role,
        "roles": user.get_role_list(),
        "designation": user.role,
        "vendors": vendors,
        "permissions": user.get_permission_codes(),
        "user_type": "NORMAL",
        "advance_scope_type": None,
        "selected_circle_id": None,
        "selected_district_id": None,
        "selected_block_id": None,
        "selected_circle_name": None,
        "selected_district_name": None,
        "selected_block_name": None,
        "is_active": True,
        "is_staff": False,
        "is_superuser": False,
        "avatar": None,
        "origin": "external",
    }
