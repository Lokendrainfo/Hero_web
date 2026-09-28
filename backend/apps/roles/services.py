from apps.roles.models import Permission, Role, RolePermission, UserRole

SYSTEM_PERMISSIONS = [
    # Dashboard & Analytics
    ("dashboard.view", "View Dashboard", "Dashboard", "View dashboard analytics and financial KPI statistics"),
    ("dashboard.export", "Export Dashboard Data", "Dashboard", "Export dashboard data and charts"),

    # Machinery & Fleet
    ("machines.view", "View Machinery", "Machines", "View fleet machinery list and equipment details"),
    ("machines.create", "Create Machinery", "Machines", "Add new machinery and drill rigs to fleet"),
    ("machines.edit", "Edit Machinery", "Machines", "Update equipment specs, status, and telemetry settings"),
    ("machines.delete", "Delete Machinery", "Machines", "Remove equipment from fleet"),
    ("machines.assign", "Assign Machine", "Machines", "Assign machine to vendors, operators, or tasks"),
    ("machines.manage", "Manage Machinery", "Machines", "Full administration of machinery fleet"),

    # Live GPS Telemetry & Tracking
    ("tracking.view", "View Live GPS Tracking", "Live Tracking", "View live machine locations, geofences, and route history"),
    ("tracking.manage", "Manage GPS Telemetry", "Live Tracking", "Configure GPS devices, polling frequency, and alerts"),

    # Work Tasks & Operations
    ("tasks.view", "View Work Tasks", "Tasks", "View work tasks and site assignments"),
    ("tasks.create", "Create Work Tasks", "Tasks", "Create new HDD and fiber work tasks"),
    ("tasks.edit", "Edit Work Tasks", "Tasks", "Update task status, parameters, and details"),
    ("tasks.delete", "Delete Work Tasks", "Tasks", "Delete tasks"),
    ("tasks.approve", "Approve Work Tasks", "Tasks", "Approve completed tasks"),
    ("tasks.reject", "Reject Work Tasks", "Tasks", "Reject completed tasks"),
    ("tasks.assign", "Assign Vendor Tasks", "Tasks", "Assign tasks to vendor organizations"),
    ("tasks.reassign", "Reassign Tasks", "Tasks", "Reassign work tasks to different vendors or operators"),
    ("tasks.export", "Export Tasks Data", "Tasks", "Export work tasks to CSV/Excel"),
    ("tasks.import", "Import Tasks", "Tasks", "Import work tasks via CSV/Excel template"),
    ("tasks.manage", "Manage Tasks System", "Tasks", "Full management of work tasks"),

    # Map View & GIS Topology
    ("mapview.view", "View Map View & Topology", "Map View", "View GIS map view and trenching / HDD execution topology"),
    ("mapview.export", "Export Map Data", "Map View", "Export spatial and execution topology data"),

    # Depth View / Chart View
    ("chartview.view", "View Depth View", "Depth View", "View GIS depth view profile and execution analytics"),
    ("chartview.export", "Export Depth View Data", "Depth View", "Export depth view profile logs and charts"),

    # Attendance & Geo-Verification
    ("attendance.view", "View Attendance", "Attendance", "View employee check-in/out and geo-attendance logs"),
    ("attendance.create", "Log Attendance", "Attendance", "Perform self and team check-in/out"),
    ("attendance.edit", "Edit Attendance", "Attendance", "Modify historical attendance records"),
    ("attendance.approve", "Approve Attendance", "Attendance", "Approve or reject supervisor/operator attendance logs"),
    ("attendance.reject", "Reject Attendance", "Attendance", "Reject invalid attendance submissions"),
    ("attendance.export", "Export Attendance Data", "Attendance", "Export attendance logs to Excel"),
    ("attendance.manage", "Manage Attendance Settings", "Attendance", "Configure attendance policies, shift timing, and rosters"),

    # Operational Expenses
    ("expenses.view", "View Expenses", "Expenses", "View site expenses and financial logs"),
    ("expenses.create", "Create Expense Logs", "Expenses", "Log operational site expenses and upload receipts"),
    ("expenses.edit", "Edit Expense Logs", "Expenses", "Edit expense details before payout"),
    ("expenses.delete", "Delete Expenses", "Expenses", "Delete expense entries"),
    ("expenses.approve", "Approve Expenses", "Expenses", "Review and approve expense claims"),
    ("expenses.reject", "Reject Expenses", "Expenses", "Reject expense claims with comments"),
    ("expenses.export", "Export Expenses", "Expenses", "Export expense reports to Excel/PDF"),
    ("expenses.manage", "Manage Expense Records", "Expenses", "Full control over site expenses"),

    # Fuel Logs
    ("fuel.view", "View Fuel Logs", "Fuel Logs", "View machine fuel consumption logs and efficiency"),
    ("fuel.create", "Log Fuel Entry", "Fuel Logs", "Create machine fuel consumption entry"),
    ("fuel.edit", "Edit Fuel Entry", "Fuel Logs", "Edit fuel log quantities and timestamps"),
    ("fuel.delete", "Delete Fuel Entry", "Fuel Logs", "Remove fuel log entry"),
    ("fuel.export", "Export Fuel Logs", "Fuel Logs", "Export fuel logs to CSV/Excel"),
    ("fuel.manage", "Manage Fuel Logs", "Fuel Logs", "Full management of machine fuel consumption logs"),

    # Refuel Operations
    ("refuel.view", "View Refuel Requests", "Refuel", "View machine refuel request logs and fuel dispensing"),
    ("refuel.create", "Request Refuel", "Refuel", "Create machine refuel requests and log fuel dispensing"),
    ("refuel.edit", "Edit Refuel Entry", "Refuel", "Edit fuel dispenser logs and quantities"),
    ("refuel.approve", "Approve Refuel Requests", "Refuel", "Approve or reject refuel requests"),
    ("refuel.reject", "Reject Refuel Requests", "Refuel", "Reject refuel requests with reasons"),
    ("refuel.manage", "Manage Refuel Operations", "Refuel", "Full management of fuel dispensing and logs"),

    # System Reports & Analytics
    ("reports.view", "View Operational Reports", "Reports", "Generate and view performance reports"),
    ("reports.export", "Export Reports & Data", "Reports", "Export system data and CSV/PDF audit reports"),
    ("reports.download", "Download Custom Reports", "Reports", "Download detailed custom performance reports"),

    # Masters (Expense Categories & Subcategories)
    ("expense_categories.view", "View Expense Categories", "Masters", "View expense master categories and rates"),
    ("expense_categories.manage", "Manage Expense Categories", "Masters", "Create, edit, and delete expense categories"),
    ("expense_subcategories.view", "View Subcategories", "Masters", "View expense subcategory master items"),
    ("expense_subcategories.manage", "Manage Subcategories", "Masters", "Create, edit, and delete expense subcategories"),
    ("masters.view", "View Masters Data", "Masters", "View all system reference master data"),
    ("masters.manage", "Manage Masters System", "Masters", "Full management of system master data"),

    # Workshop & Maintenance
    ("maintenance.view", "View Maintenance Logs", "Maintenance", "View preventive maintenance schedules"),
    ("maintenance.create", "Log Maintenance", "Maintenance", "Create maintenance and service entries"),
    ("maintenance.edit", "Edit Maintenance", "Maintenance", "Update maintenance status and service logs"),
    ("maintenance.manage", "Manage Maintenance", "Maintenance", "Update and complete maintenance schedules"),

    # Breakdown Incident Reports
    ("breakdowns.view", "View Breakdown Reports", "Breakdowns", "View machine breakdown incident reports"),
    ("breakdowns.create", "Report Breakdown", "Breakdowns", "Log machine breakdown incidents"),
    ("breakdowns.edit", "Edit Breakdown Log", "Breakdowns", "Update breakdown status and service logs"),
    ("breakdowns.manage", "Manage Breakdown Resolution", "Breakdowns", "Assign technicians and resolve breakdown incidents"),

    # System Alerts & Warnings
    ("alerts.view", "View System Alerts", "Alerts", "View operational warnings, breakdown notifications, and geofence alerts"),
    ("alerts.manage", "Manage Alert Rules", "Alerts", "Configure thresholds and clear system alert rules"),

    # Spare Parts & Stock Inventory
    ("inventory.view", "View Stock / Inventory", "Inventory", "View spare parts, warehouse stock, and inventory items"),
    ("stock.view", "View Stock Items", "Inventory", "View spare parts inventory"),
    ("inventory.manage", "Manage Stock / Inventory", "Inventory", "Manage stock items, issuance, and warehouse levels"),

    # Vendors & Contracting
    ("vendors.view", "View Vendors", "Vendors", "View vendor profiles and contracts"),
    ("vendors.create", "Create Vendors", "Vendors", "Register new vendor organizations"),
    ("vendors.edit", "Edit Vendors", "Vendors", "Update vendor profiles, contracts, and contact info"),
    ("vendors.delete", "Delete Vendors", "Vendors", "Delete vendor entries"),
    ("vendors.activate", "Activate Vendors", "Vendors", "Activate vendor status"),
    ("vendors.deactivate", "Deactivate Vendors", "Vendors", "Deactivate vendor status"),
    ("vendors.manage", "Manage Vendors", "Vendors", "Full administration of vendor network"),

    # Users & Staff Access
    ("users.view", "View Platform Users", "Users", "View platform users, supervisors, and vendor user accounts"),
    ("users.create", "Create Platform Users", "Users", "Create new platform user accounts"),
    ("users.edit", "Edit Platform Users", "Users", "Update user profile, status, and assigned vendor"),
    ("users.delete", "Delete Users", "Users", "Deactivate or delete user accounts"),
    ("users.activate", "Activate Users", "Users", "Activate user account"),
    ("users.deactivate", "Deactivate Users", "Users", "Deactivate user account"),
    ("users.manage", "Manage Users System", "Users", "Full administration of users"),

    # Team & Roster Management
    ("team.view", "View Team", "Team", "View team members, operators, and supervisor profiles"),
    ("team.create", "Create Team Member", "Team", "Add new team member or operator profile"),
    ("team.edit", "Edit Team Member", "Team", "Update team member details and reporting manager"),
    ("team.delete", "Delete Team Member", "Team", "Remove team member from system"),
    ("team.assign", "Assign Team Roster", "Team", "Assign team members to machines or tasks"),
    ("team.manage", "Manage Team Roster", "Team", "Full administration of workforce team roster"),

    # Roles & RBAC Configuration
    ("roles.view", "View Roles & Permissions", "Roles", "View role configurations, permission matrix, and scope settings"),
    ("roles.create", "Create Roles", "Roles", "Create custom roles with permissions and scopes"),
    ("roles.edit", "Edit Roles", "Roles", "Update existing custom roles and permissions"),
    ("roles.delete", "Delete Roles", "Roles", "Delete custom roles"),
    ("roles.activate", "Activate Roles", "Roles", "Activate roles"),
    ("roles.deactivate", "Deactivate Roles", "Roles", "Deactivate roles"),
    ("roles.manage", "Manage Roles System", "Roles", "Full administration of roles and permissions"),

    # Notifications
    ("notifications.view", "View Notifications", "Notifications", "Receive operational notifications and system updates"),
    ("notifications.manage", "Manage Notifications", "Notifications", "Configure notification dispatch rules"),

    # External Integrations
    ("integrations.view", "View External Integrations", "Integrations", "View iLync enterprise integration sync status"),
    ("integrations.manage", "Manage Integrations", "Integrations", "Trigger external data sync and API connections"),
    ("api_docs.view", "View External API Docs", "Setup & Integrations", "Allows viewing external API documentation and managing partner API keys and webhooks"),

    # System Audit Logs
    ("audit.view", "View Audit Logs", "Audit Logs", "View administrative change audit logs and security activity"),
    ("audit.export", "Export Audit Logs", "Audit Logs", "Export security audit trail"),

    # System Settings
    ("settings.view", "View Platform Settings", "System Settings", "View global platform parameters and branding"),
    ("settings.manage", "Manage Platform Settings", "System Settings", "Manage global system parameters and integrations"),

    # Machine Shift Requests
    ("machine_shift.view", "View Machine Shift Requests", "Machine Shift", "View machine shifting requests, tracking, and details"),
    ("machine_shift.create", "Create Machine Shift Request", "Machine Shift", "Create requests to shift machinery between locations"),
    ("machine_shift.edit", "Edit Machine Shift Request", "Machine Shift", "Modify pending machine shifting requests"),
    ("machine_shift.cancel", "Cancel Machine Shift Request", "Machine Shift", "Cancel pending machine shifting requests"),
    ("machine_shift.shift", "Execute Machine Shifting", "Machine Shift", "Update shifting execution details, upload machine pictures, and mark shifted"),
    ("machine_shift.scm_review", "SCM Review & Approval", "Machine Shift", "Approve or reject machine shift requests as SCM authority"),
    ("machine_shift.scm_invoice", "SCM Invoice Management", "Machine Shift", "Attach and manage shifting invoices and financial amounts"),
    ("machine_shift.scm_confirm", "SCM Final Confirmation", "Machine Shift", "Perform final confirmation and lock completed machine shift requests"),
]

DEFAULT_ROLES = {
    "SUPER_ADMIN": {
        "code": "SUPER_ADMIN",
        "description": "Super Administrator with complete unrestricted access to all system modules, scopes, and security settings",
        "is_system": True,
        "data_scope": "ALL_DATA",
        "permission_codes": [p[0] for p in SYSTEM_PERMISSIONS]
    },
    "ADMIN": {
        "code": "ADMIN",
        "description": "Platform Administrator managing standard operations, vendors, fleet, users, and roles",
        "is_system": True,
        "data_scope": "ALL_DATA",
        "permission_codes": [p[0] for p in SYSTEM_PERMISSIONS]
    },
    "CORPORATE_MANAGER": {
        "code": "CORPORATE_MANAGER",
        "description": "Corporate Manager with enterprise-wide visibility across all vendors, regions, tasks, and reports",
        "is_system": True,
        "data_scope": "ALL_DATA",
        "permission_codes": [p[0] for p in SYSTEM_PERMISSIONS if not p[0].startswith("settings.") and not p[0].startswith("roles.")]
    },
    "REGIONAL_MANAGER": {
        "code": "REGIONAL_MANAGER",
        "description": "Regional Manager overseeing regional operations, tasks, vendors, and machinery in their geographic area",
        "is_system": True,
        "data_scope": "OWN_GEOGRAPHY",
        "permission_codes": [
            "dashboard.view", "dashboard.export", "mapview.view", "chartview.view", "mapview.export",
            "tasks.view", "tasks.create", "tasks.edit", "tasks.approve", "tasks.reject", "tasks.assign", "tasks.reassign", "tasks.export",
            "vendors.view", "machines.view", "machines.edit", "machines.assign",
            "team.view", "team.create", "team.edit", "team.assign", "tracking.view",
            "attendance.view", "attendance.approve", "attendance.reject", "attendance.export",
            "expenses.view", "expenses.approve", "expenses.reject", "expenses.export",
            "fuel.view", "refuel.view", "refuel.approve", "refuel.reject", "alerts.view", "breakdowns.view", "breakdowns.manage",
            "reports.view", "reports.export", "reports.download", "users.view", "expense_categories.view", "expense_subcategories.view", "masters.view"
        ]
    },
    "CIRCLE_MANAGER": {
        "code": "CIRCLE_MANAGER",
        "description": "Circle Manager monitoring operational circle progress, team rosters, and site tasks",
        "is_system": True,
        "data_scope": "OWN_GEOGRAPHY",
        "permission_codes": [
            "dashboard.view", "mapview.view", "chartview.view",
            "tasks.view", "tasks.edit", "tasks.approve", "tasks.assign", "tasks.export",
            "vendors.view", "machines.view", "team.view", "team.edit", "tracking.view",
            "attendance.view", "attendance.approve", "expenses.view", "expenses.approve",
            "fuel.view", "refuel.view", "refuel.approve", "alerts.view", "breakdowns.view", "reports.view"
        ]
    },
    "REPORTING_MANAGER": {
        "code": "REPORTING_MANAGER",
        "description": "Direct Manager with reporting scope to manage tasks, attendance, and expenses for direct subordinates",
        "is_system": True,
        "data_scope": "REPORTING_HIERARCHY",
        "permission_codes": [
            "dashboard.view", "mapview.view", "chartview.view",
            "tasks.view", "tasks.edit", "tasks.assign",
            "team.view", "team.edit", "attendance.view", "attendance.approve", "attendance.create",
            "expenses.view", "expenses.create", "expenses.approve",
            "fuel.view", "refuel.view", "refuel.create", "refuel.approve", "breakdowns.view", "breakdowns.create", "reports.view"
        ]
    },
    "VENDOR_ADMIN": {
        "code": "VENDOR_ADMIN",
        "description": "Vendor Administrator managing vendor team members, assigned tasks, equipment, attendance, and expenses",
        "is_system": True,
        "data_scope": "OWN_VENDOR",
        "permission_codes": [
            "dashboard.view", "mapview.view", "chartview.view",
            "tasks.view", "tasks.edit", "tasks.export",
            "machines.view", "team.view", "team.create", "team.edit", "team.assign", "tracking.view",
            "attendance.view", "attendance.create", "attendance.approve", "attendance.export",
            "expenses.view", "expenses.create", "expenses.export",
            "fuel.view", "refuel.view", "refuel.create", "refuel.approve", "breakdowns.view", "breakdowns.create", "reports.view",
            "machine_shift.view", "machine_shift.create"
        ]
    },
    "VENDOR_USER": {
        "code": "VENDOR_USER",
        "description": "Vendor Staff member updating assigned vendor tasks, field attendance, and operational fuel entries",
        "is_system": True,
        "data_scope": "OWN_VENDOR",
        "permission_codes": [
            "dashboard.view", "mapview.view", "chartview.view",
            "tasks.view", "tasks.edit", "machines.view", "team.view",
            "attendance.view", "attendance.create", "expenses.view", "expenses.create",
            "fuel.view", "refuel.view", "refuel.create", "breakdowns.view", "breakdowns.create",
            "machine_shift.view", "machine_shift.create"
        ]
    },
    "OPERATOR": {
        "code": "OPERATOR",
        "description": "Machine Operator logging machine runtime, attendance check-in, refuel requests, and breakdown reports",
        "is_system": True,
        "data_scope": "OWN_TASKS",
        "permission_codes": [
            "dashboard.view", "machines.view", "tasks.view", "tasks.edit",
            "attendance.view", "attendance.create", "fuel.view", "refuel.view", "refuel.create",
            "breakdowns.view", "breakdowns.create"
        ]
    },
    "TRACKER": {
        "code": "TRACKER",
        "description": "Data Entry Tracker responsible for updating daily trenching/HDD progress meters and site logs",
        "is_system": True,
        "data_scope": "OWN_TASKS",
        "permission_codes": [
            "dashboard.view", "mapview.view", "chartview.view", "tasks.view", "tasks.edit",
            "attendance.view", "attendance.create", "fuel.view", "refuel.view", "refuel.create"
        ]
    },
    "LABOUR": {
        "code": "LABOUR",
        "description": "Site Labourer with mobile attendance check-in and basic task status view",
        "is_system": True,
        "data_scope": "OWN_TASKS",
        "permission_codes": [
            "dashboard.view", "tasks.view", "attendance.view", "attendance.create"
        ]
    },
    "VIEWER": {
        "code": "VIEWER",
        "description": "Read-only Viewer account with view-only access across all operational modules",
        "is_system": True,
        "data_scope": "ALL_DATA",
        "permission_codes": [p[0] for p in SYSTEM_PERMISSIONS if p[0].endswith('.view')]
    },
    "SCM": {
        "code": "SCM",
        "description": "Supply Chain Management role responsible for reviewing, approving, invoice attachments, and confirming machine shift requests",
        "is_system": True,
        "data_scope": "ALL_DATA",
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view", "reports.view",
            "machine_shift.view", "machine_shift.scm_review", "machine_shift.scm_invoice", "machine_shift.scm_confirm"
        ]
    },
    "SHIFTER": {
        "code": "SHIFTER",
        "description": "Equipment Shifter responsible for executing machine relocation, uploading machine photos, and recording shifting expenses",
        "is_system": True,
        "data_scope": "ALL_DATA",
        "permission_codes": [
            "dashboard.view", "machines.view", "tracking.view",
            "machine_shift.view", "machine_shift.shift"
        ]
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

    for role_code, config in DEFAULT_ROLES.items():
        role, _ = Role.objects.get_or_create(
            code=config["code"],
            defaults={
                "name": role_code.replace("_", " ").title(),
                "description": config["description"],
                "is_system": config["is_system"],
                "data_scope": config.get("data_scope", "ALL_DATA")
            }
        )
        role.name = role_code.replace("_", " ").title()
        role.is_system = config["is_system"]
        role.data_scope = config.get("data_scope", "ALL_DATA")
        role.save()

        target_perms = [perm_objs[c] for c in config["permission_codes"] if c in perm_objs]
        role.permissions.set(target_perms)

    return True
