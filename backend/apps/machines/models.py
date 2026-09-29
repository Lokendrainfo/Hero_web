from django.db import models
from apps.vendors.models import Vendor

class Machine(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='machines', null=True, blank=True)
    serial_number = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, default="MC-003")
    
    # FiberForce HDD Fields
    machine_chassis_no = models.CharField(max_length=100, unique=True, null=True, blank=True)
    engine_no = models.CharField(max_length=100, blank=True, default='')
    model_code = models.CharField(max_length=50, default="A600")
    model_name = models.CharField(max_length=100, default="APOLLO A600 V2")
    site_id = models.IntegerField(null=True, blank=True, default=16)
    site_name = models.CharField(max_length=255, default="Anupgarh-SITE", null=True, blank=True)
    is_commissioned = models.BooleanField(default=False)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    fuel_card = models.JSONField(null=True, blank=True)
    operator = models.JSONField(null=True, blank=True)
    partners = models.JSONField(null=True, blank=True, default=list)

    # Operational & Telemetry fields
    category = models.CharField(max_length=100, default='HDD')
    status = models.CharField(max_length=50, default='RUNNING') # RUNNING, IDLE, MAINTENANCE, BREAKDOWN
    is_online = models.BooleanField(default=True)
    location_name = models.CharField(max_length=255, default="Anupgarh-SITE, RJ", null=True, blank=True)
    runtime_str = models.CharField(max_length=50, default="08h 32m")
    engine_hours = models.IntegerField(default=1250)
    fuel_capacity = models.DecimalField(max_digits=10, decimal_places=2, default=500.0)
    current_fuel_level = models.DecimalField(max_digits=10, decimal_places=2, default=170.0)
    fuel_percentage = models.IntegerField(default=58)
    today_consumption = models.DecimalField(max_digits=10, decimal_places=2, default=120.0)
    last_filled_text = models.CharField(max_length=100, default="24 Aug • 40 L")
    filled_by = models.CharField(max_length=100, default="Ravi Kumar")
    current_latitude = models.FloatField(null=True, blank=True, default=28.4595)
    current_longitude = models.FloatField(null=True, blank=True, default=77.0266)
    # Live FiberForce Telemetry Attributes
    engine_on = models.BooleanField(default=False)
    state_label = models.CharField(max_length=100, default='STOPPED', null=True, blank=True)
    rpm = models.IntegerField(default=0, null=True, blank=True)
    coolant_temp = models.FloatField(default=0.0, null=True, blank=True)
    oil_pressure = models.FloatField(default=0.0, null=True, blank=True)
    supply_voltage = models.FloatField(default=0.0, null=True, blank=True)
    internal_battery_v = models.FloatField(default=0.0, null=True, blank=True)
    today_refueled = models.FloatField(default=0.0, null=True, blank=True)
    engine_hours_today = models.FloatField(default=0.0, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} [{self.machine_chassis_no or self.serial_number}]"


class MachineVendorAssignmentHistory(models.Model):
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='vendor_history')
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='machine_history')
    assigned_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(max_length=100, default='ILYNC_SYNC')
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-assigned_at']
        verbose_name = 'Machine Vendor Assignment History'
        verbose_name_plural = 'Machine Vendor Assignment Histories'

    def __str__(self):
        return f"{self.machine.name} -> {self.vendor.name if self.vendor else 'Unassigned'} at {self.assigned_at}"
