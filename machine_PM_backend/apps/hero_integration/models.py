from django.db import models


class HeroVendor(models.Model):
    external_vendor_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=50, blank=True, null=True)
    vendor_code = models.CharField(max_length=50, blank=True, null=True)
    vendor_type = models.CharField(max_length=50, default='CONTRACTOR')
    contact_person = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=50, default='ACTIVE')
    hdd_hero = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'vendors_vendor'

    def __str__(self):
        return f"{self.name} ({self.code or self.external_vendor_id})"


class HeroUser(models.Model):
    password = models.CharField(max_length=128)
    last_login = models.DateTimeField(null=True, blank=True)
    is_superuser = models.BooleanField(default=False)
    username = models.CharField(max_length=150, unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(null=True, blank=True)
    external_user_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    employee_id = models.CharField(max_length=50, null=True, blank=True)
    phone_number = models.CharField(max_length=30, blank=True, null=True)
    vendor = models.ForeignKey(HeroVendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    reporting_manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True)
    role = models.CharField(max_length=100, default='VIEWER', blank=True)
    user_type = models.CharField(max_length=20, default='NORMAL')
    advance_scope_type = models.CharField(max_length=20, blank=True, null=True)
    avatar = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'authentication_user'

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def get_full_name(self):
        full = f"{self.first_name or ''} {self.last_name or ''}".strip()
        return full

    def get_display_name(self):
        return self.get_full_name() or self.username

    def __str__(self):
        return f"{self.get_display_name()} ({self.username})"


class HeroAPIKey(models.Model):
    user = models.ForeignKey(HeroUser, on_delete=models.CASCADE, related_name='api_keys', null=True, blank=True)
    name = models.CharField(max_length=100)
    key = models.CharField(max_length=128, unique=True)
    prefix = models.CharField(max_length=16, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'authentication_apikey'


class HeroRole(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, null=True)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    data_scope = models.CharField(max_length=50, default='ALL_DATA')
    module_scopes = models.JSONField(default=dict, blank=True)

    class Meta:
        managed = False
        db_table = 'roles_role'

    def __str__(self):
        return f"{self.name} ({self.code})"


class HeroUserRole(models.Model):
    user = models.ForeignKey(HeroUser, on_delete=models.CASCADE, related_name='user_roles')
    role = models.ForeignKey(HeroRole, on_delete=models.CASCADE, related_name='user_roles')
    assigned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'roles_userrole'
        unique_together = ('user', 'role')


class HeroVendorAssignment(models.Model):
    user = models.ForeignKey(HeroUser, on_delete=models.CASCADE, related_name='hero_vendor_assignments')
    vendor = models.ForeignKey(HeroVendor, on_delete=models.CASCADE, related_name='user_assignments')
    assigned_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'vendors_herovendorassignment'
        unique_together = ('user', 'vendor')


class HeroMachine(models.Model):
    vendor = models.ForeignKey(HeroVendor, on_delete=models.CASCADE, related_name='machines', null=True, blank=True)
    serial_number = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, default='MC-003')
    machine_chassis_no = models.CharField(max_length=100, unique=True, null=True, blank=True)
    engine_no = models.CharField(max_length=100, blank=True, default='')
    model_code = models.CharField(max_length=50, default='A600')
    model_name = models.CharField(max_length=100, default='APOLLO A600 V2')
    site_id = models.IntegerField(null=True, blank=True)
    site_name = models.CharField(max_length=255, null=True, blank=True)
    is_commissioned = models.BooleanField(default=False)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    fuel_card = models.JSONField(null=True, blank=True)
    operator = models.JSONField(null=True, blank=True)
    partners = models.JSONField(null=True, blank=True, default=list)
    category = models.CharField(max_length=100, default='HDD')
    status = models.CharField(max_length=50, default='RUNNING')
    is_online = models.BooleanField(default=True)
    location_name = models.CharField(max_length=255, null=True, blank=True)
    runtime_str = models.CharField(max_length=50, blank=True, default='')
    engine_hours = models.IntegerField(default=0)
    fuel_capacity = models.DecimalField(max_digits=10, decimal_places=2, default=500.0)
    current_fuel_level = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    fuel_percentage = models.IntegerField(default=0)
    today_consumption = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    last_filled_text = models.CharField(max_length=100, blank=True, default='')
    filled_by = models.CharField(max_length=100, blank=True, default='')
    current_latitude = models.FloatField(null=True, blank=True)
    current_longitude = models.FloatField(null=True, blank=True)
    engine_on = models.BooleanField(default=False)
    state_label = models.CharField(max_length=100, null=True, blank=True)
    rpm = models.IntegerField(default=0, null=True, blank=True)
    coolant_temp = models.FloatField(default=0.0, null=True, blank=True)
    oil_pressure = models.FloatField(default=0.0, null=True, blank=True)
    supply_voltage = models.FloatField(default=0.0, null=True, blank=True)
    internal_battery_v = models.FloatField(default=0.0, null=True, blank=True)
    today_refueled = models.FloatField(default=0.0, null=True, blank=True)
    engine_hours_today = models.FloatField(default=0.0, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'machines_machine'

    def __str__(self):
        return f"{self.name} [{self.machine_chassis_no or self.serial_number}]"


class HeroMachineVendorAssignmentHistory(models.Model):
    machine = models.ForeignKey(HeroMachine, on_delete=models.CASCADE, related_name='vendor_history')
    vendor = models.ForeignKey(HeroVendor, on_delete=models.SET_NULL, null=True, blank=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=100, default='ILYNC_SYNC')
    notes = models.TextField(blank=True, default='')

    class Meta:
        managed = False
        db_table = 'machines_machinevendorassignmenthistory'


class HeroMachineShiftRequest(models.Model):
    request_id = models.CharField(max_length=64, unique=True)
    vendor = models.ForeignKey(HeroVendor, on_delete=models.PROTECT)
    machine = models.ForeignKey(HeroMachine, on_delete=models.PROTECT)
    a_point_name = models.CharField(max_length=255)
    b_point_name = models.CharField(max_length=255)
    required_date = models.DateField()
    status = models.CharField(max_length=50)
    assigned_shifter = models.ForeignKey(HeroUser, on_delete=models.SET_NULL, null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'machine_shift_machineshiftrequest'

