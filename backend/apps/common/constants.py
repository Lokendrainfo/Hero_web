ROLE_CHOICES = (
    ('ADMIN', 'System Administrator'),
    ('PROJECT_MANAGER', 'Project Manager'),
    ('ENGINEER', 'Engineer'),
    ('SUPERVISOR', 'Supervisor'),
    ('OPERATOR', 'Machine Operator'),
    ('VENDOR', 'Vendor'),
    ('VIEWER', 'Viewer'),
    ('MANAGER', 'Manager'),
    ('VENDOR_ADMIN', 'Vendor Administrator'),
)

MACHINE_STATUS_CHOICES = (
    ('IDLE', 'Idle'),
    ('WORKING', 'Working'),
    ('BREAKDOWN', 'Breakdown'),
    ('MAINTENANCE', 'Maintenance'),
    ('OFFLINE', 'Offline'),
)

TASK_STATUS_CHOICES = (
    ('PENDING', 'Pending'),
    ('IN_PROGRESS', 'In Progress'),
    ('COMPLETED', 'Completed'),
    ('CANCELLED', 'Cancelled'),
)
