from apps.roles.models import Permission, Role, RolePermission, UserRole

SYSTEM_PERMISSIONS = [
    # Dashboard & Analytics
    ("dashboard.view", "View Dashboard", "Dashboard", "View dashboard analytics and financial KPI statistics"),

    # Machinery & Fleet
    ("machines.view", "View Machinery", "Machines", "View fleet machinery list and equipment details"),
    ("machines.manage", "Manage Machinery", "Machines", "Add, update, or decommission fleet machinery"),

    # GPS Telemetry & GIS Mapping
    ("tracking.view", "View Live GPS Tracking", "Tracking", "View live machine locations and route history"),
    ("mapview.view", "View Map View & Topology", "Map View", "View GIS map view and trenching / HDD execution topology"),
    ("chartview.view", "View Chart View", "Map View", "View GIS chart view and execution analytics"),

    # Work Tasks & Operations
    ("tasks.view", "View Work Tasks", "Tasks", "View work tasks and site assignments"),
    ("tasks.create", "Create Work Tasks", "Tasks", "Create new HDD and fiber work tasks"),
    ("tasks.update", "Update Work Tasks", "Tasks", "Update task status and execution details"),
    ("tasks.delete", "Delete Work Tasks", "Tasks", "Delete tasks"),
    ("tasks.assign", "Assign Vendor Tasks", "Tasks", "Assign tasks to vendor organizations"),

    # Team & Roster Management
    ("team.view", "View Team", "Team", "View team members, operators, and supervisor profiles"),
    ("team.manage", "Manage Team Members", "Team", "Add, edit, or reassign team members and operators"),

    # Attendance & Geo-Verification
    ("attendance.view", "View Attendance", "Attendance", "View employee check-in/out and geo-attendance logs"),
    ("attendance.create", "Log Attendance", "Attendance", "Perform self and team check-in/out"),
    ("attendance.approve", "Approve Attendance", "Attendance", "Approve or reject supervisor/operator attendance logs"),
    ("attendance.manage", "Manage Attendance Settings", "Attendance", "Configure attendance policies and rosters"),

    # Operational Expenses & Expense Masters
    ("expenses.view", "View Expenses", "Expenses", "View site expenses and financial logs"),
    ("expenses.create", "Create Expense Logs", "Expenses", "Log operational site expenses and upload receipts"),
    ("expenses.approve", "Approve Expenses", "Expenses", "Review and approve/reject expense claims"),
    ("expenses.pay", "Process Expense Payments", "Expenses", "Mark approved expenses as paid/settled"),
    ("expenses.manage", "Manage Expense Records", "Expenses", "Full control to edit or delete expense records"),
    ("expense_categories.view", "View Expense Masters", "Expense Masters", "View expense master categories and rates"),
    ("expense_categories.manage", "Manage Expense Masters", "Expense Masters", "Create and edit expense category masters"),

    # Fuel & Refuel Workflows
    ("fuel.view", "View Fuel Records", "Fuel", "View fuel consumption logs and machine fuel efficiency"),
    ("fuel.manage", "Manage Fuel Records", "Fuel", "Add, update, or audit fuel logs"),
    ("refuel.view", "View Refuel Requests", "Refuel", "View refuel request logs"),
    ("refuel.create", "Request Refuel", "Refuel", "Create machine refuel requests"),
    ("refuel.approve", "Approve Refuel Requests", "Refuel", "Approve or reject refuel requests"),
    ("refuel.manage", "Manage Refuel Operations", "Refuel", "Full management of fuel dispensing and logs"),

    # Maintenance & Machine Repairs
    ("maintenance.view", "View Maintenance Logs", "Maintenance", "View preventive maintenance schedules"),
    ("maintenance.create", "Log Maintenance", "Maintenance", "Create maintenance and service entries"),
    ("maintenance.manage", "Manage Maintenance", "Maintenance", "Update and complete maintenance schedules"),

    # Breakdown Incident Reports
    ("breakdowns.view", "View Breakdown Reports", "Breakdowns", "View machine breakdown incident reports"),
    ("breakdowns.create", "Report Breakdown", "Breakdowns", "Log machine breakdown incidents"),
    ("breakdowns.manage", "Manage Breakdown Resolution", "Breakdowns", "Assign technicians and resolve breakdown incidents"),

    # Spare Parts & Inventory
    ("inventory.view", "View Inventory/Stock", "Inventory", "View spare parts and inventory items"),
    ("inventory.manage", "Manage Inventory/Stock", "Inventory", "Manage stock items, issuance, and warehouse levels"),

    # Vendor Management
    ("vendors.view", "View Vendors", "Vendors", "View vendor profiles and contracts"),
    ("vendors.manage", "Manage Vendors", "Vendors", "Add and edit vendor organizations and user links"),

    # User Access & Roles
    ("users.view", "View Platform Users", "Users", "View platform users and vendor accounts"),
    ("users.manage", "Manage Users", "Users", "Create users, reset passwords, and assign roles"),
    ("roles.view", "View Roles & Permissions", "Roles", "View role configurations"),
    ("roles.manage", "Manage Roles & Permissions", "Roles", "Create and edit custom roles and permissions"),

    # System Reports & Analytics
    ("reports.view", "View Operational Reports", "Reports", "Generate and view performance reports"),
    ("reports.export", "Export Reports & Data", "Reports", "Export system data and CSV/PDF audit reports"),

    # Alerts & Notifications
    ("alerts.view", "View System Alerts", "Alerts", "View operational warnings and system alerts"),
    ("alerts.manage", "Manage Alert Rules", "Alerts", "Configure and clear system alert rules"),
    ("notifications.view", "View Notifications", "Notifications", "Receive operational notifications"),

    # Integration Sync
    ("integrations.view", "View External Integrations", "Integrations", "View iLync enterprise integration sync status"),
    ("integrations.manage", "Manage Integrations", "Integrations", "Trigger external data sync and API connections"),

    # System Settings
    ("settings.view", "View Platform Settings", "Settings", "View system configuration settings"),
    ("settings.manage", "Manage Platform Settings", "Settings", "Manage global system parameters"),
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
        "description": "Project Manager overseeing fleet operations, tasks, team, expenses, and site analytics",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "machines.manage", "tracking.view", "mapview.view", "chartview.view",
            "tasks.view", "tasks.create", "tasks.update", "tasks.delete", "tasks.assign",
            "team.view", "team.manage", "attendance.view", "attendance.approve",
            "expenses.view", "expenses.create", "expenses.approve", "expense_categories.view",
            "fuel.view", "fuel.manage", "refuel.view", "refuel.create", "refuel.approve",
            "maintenance.view", "maintenance.create", "maintenance.manage",
            "breakdowns.view", "breakdowns.create", "breakdowns.manage",
            "inventory.view", "inventory.manage", "vendors.view", "users.view",
            "reports.view", "reports.export", "alerts.view", "notifications.view", "settings.view"
        ]
    },
    "ENGINEER": {
        "code": "ENGINEER",
        "description": "Site Engineer managing machinery, task updates, technical maintenance, and breakdown resolution",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view", "mapview.view", "chartview.view",
            "tasks.view", "tasks.create", "tasks.update",
            "maintenance.view", "maintenance.create", "maintenance.manage",
            "breakdowns.view", "breakdowns.create", "breakdowns.manage",
            "inventory.view", "reports.view", "alerts.view", "notifications.view"
        ]
    },
    "SUPERVISOR": {
        "code": "SUPERVISOR",
        "description": "Field Supervisor monitoring daily machine progress, team attendance, and refuel entries",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view", "mapview.view", "chartview.view",
            "tasks.view", "tasks.update", "team.view",
            "attendance.view", "attendance.create", "attendance.approve",
            "expenses.view", "expenses.create", "fuel.view", "refuel.view", "refuel.create",
            "breakdowns.view", "breakdowns.create", "notifications.view"
        ]
    },
    "OPERATOR": {
        "code": "OPERATOR",
        "description": "Machine Operator logging machine runtime, attendance check-in, refuel requests, and breakdown reports",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tasks.view", "tasks.update",
            "attendance.view", "attendance.create", "fuel.view", "refuel.view", "refuel.create",
            "breakdowns.view", "breakdowns.create"
        ]
    },
    "VENDOR": {
        "code": "VENDOR",
        "description": "Vendor representative managing assigned fleet, logged expenses, refuel requests, and maintenance status",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tasks.view", "attendance.view",
            "expenses.view", "expenses.create", "expense_categories.view",
            "fuel.view", "refuel.view", "refuel.create", "maintenance.view", "breakdowns.view"
        ]
    },
    "VIEWER": {
        "code": "VIEWER",
        "description": "Read-only Viewer account with basic dashboard, machine, tracking, and report access",
        "is_system": True,
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view", "mapview.view", "chartview.view", "reports.view"
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

