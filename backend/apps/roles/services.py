from apps.roles.models import Permission, Role, RolePermission, UserRole

SYSTEM_PERMISSIONS = [
    ("dashboard.view", "View Dashboard", "Dashboard", "View dashboard analytics and statistics"),
    ("machines.view", "View Machinery", "Machines", "View fleet machinery list and details"),
    ("machines.manage", "Manage Machinery", "Machines", "Add, update, or remove fleet machinery"),
    ("tracking.view", "View Live GPS Tracking", "Tracking", "View live machine locations and route history"),
    ("mapview.view", "View Map View", "Map View", "View GIS map view and trenching / HDD execution topology"),
    ("tasks.view", "View Tasks", "Tasks", "View work tasks and assignments"),
    ("tasks.create", "Create Tasks", "Tasks", "Create new work tasks"),
    ("tasks.update", "Update Tasks", "Tasks", "Update task status and details"),
    ("tasks.delete", "Delete Tasks", "Tasks", "Delete tasks"),
    ("team.view", "View Team", "Team", "View team members and profiles"),
    ("attendance.view", "View Attendance", "Attendance", "View employee attendance records"),
    ("expenses.view", "View Expenses", "Expenses", "View site expenses and financial logs"),
    ("fuel.view", "View Fuel Records", "Fuel", "View fuel consumption logs"),
    ("refuel.view", "View Refuel Requests", "Refuel", "View and approve refuel logs"),
    ("maintenance.view", "View Maintenance Logs", "Maintenance", "View preventive maintenance schedules"),
    ("breakdowns.view", "View Breakdown Reports", "Breakdowns", "View machine breakdown incident reports"),
    ("inventory.view", "View Inventory/Stock", "Inventory", "View spare parts and inventory items"),
    ("inventory.manage", "Manage Inventory/Stock", "Inventory", "Manage stock items and issuance"),
    ("vendors.view", "View Vendors", "Vendors", "View vendor profiles"),
    ("vendors.manage", "Manage Vendors", "Vendors", "Add and edit vendor organizations"),
    ("users.view", "View Users", "Users", "View imported platform users"),
    ("users.manage", "Manage Users", "Users", "Manage user access and assign roles"),
    ("roles.view", "View Roles & Permissions", "Roles", "View role configurations"),
    ("roles.manage", "Manage Roles & Permissions", "Roles", "Create and edit custom roles and permissions"),
    ("reports.view", "View Operational Reports", "Reports", "Generate and view performance reports"),
    ("notifications.view", "View Notifications", "Notifications", "Receive operational alerts"),
    ("settings.view", "View Platform Settings", "Settings", "View system settings"),
    ("settings.manage", "Manage Platform Settings", "Settings", "Manage system configurations"),
]

DEFAULT_ROLES = {
    "ADMIN": {
        "code": "ADMIN",
        "description": "Full System Administrator with unrestricted access to all modules and configurations",
        "is_system": True,
        "permission_codes": [p[0] for p in SYSTEM_PERMISSIONS]
    },
    "PROJECT_MANAGER": {
        "code": "PROJECT_MANAGER",
        "description": "Project Manager overseeing fleet operations, tasks, team, and site analytics",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "machines.manage", "tracking.view", "mapview.view",
            "tasks.view", "tasks.create", "tasks.update", "tasks.delete", "team.view",
            "attendance.view", "expenses.view", "fuel.view", "refuel.view",
            "maintenance.view", "breakdowns.view", "inventory.view", "inventory.manage",
            "vendors.view", "users.view", "reports.view", "notifications.view", "settings.view"
        ]
    },
    "ENGINEER": {
        "code": "ENGINEER",
        "description": "Site Engineer managing machinery, task updates, and technical maintenance",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view", "mapview.view", "tasks.view",
            "tasks.create", "tasks.update", "maintenance.view", "breakdowns.view",
            "inventory.view", "reports.view", "notifications.view"
        ]
    },
    "SUPERVISOR": {
        "code": "SUPERVISOR",
        "description": "Field Supervisor monitoring daily machine progress, attendance, and refuel entries",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view", "mapview.view", "tasks.view",
            "tasks.update", "attendance.view", "fuel.view", "refuel.view", "notifications.view"
        ]
    },
    "OPERATOR": {
        "code": "OPERATOR",
        "description": "Machine Operator logging machine runtime, refuel requests, and task completion",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tasks.view", "attendance.view", "fuel.view", "refuel.view"
        ]
    },
    "VENDOR": {
        "code": "VENDOR",
        "description": "Vendor representative viewing assigned machines and maintenance status",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "maintenance.view", "breakdowns.view"
        ]
    },
    "VIEWER": {
        "code": "VIEWER",
        "description": "Read-only Viewer account with basic dashboard, machine, tracking, and report access",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view", "mapview.view", "reports.view"
        ]
    },
    "ALL_VIEWER": {
        "code": "ALL_VIEWER",
        "description": "Read-only Global Viewer with view-only permissions across all standard and customized modules",
        "is_system": True,
        "permission_codes": [p[0] for p in SYSTEM_PERMISSIONS if p[0].endswith('.view')]
    }
}

def seed_roles_and_permissions():
    """
    Seed or update all system permissions and default roles in DB.
    """
    perm_objs = {}
    for code, name, category, desc in SYSTEM_PERMISSIONS:
        p, _ = Permission.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "category": category,
                "description": desc
            }
        )
        perm_objs[code] = p

    for role_name, config in DEFAULT_ROLES.items():
        role, _ = Role.objects.get_or_create(
            code=config["code"],
            defaults={
                "name": role_name,
                "description": config["description"],
                "is_system": config["is_system"]
            }
        )
        role.name = role_name
        role.is_system = config["is_system"]
        role.save()

        target_perms = [perm_objs[c] for c in config["permission_codes"] if c in perm_objs]
        role.permissions.set(target_perms)

    return True
