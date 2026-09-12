from django.db import models
from apps.vendors.models import Vendor
from apps.machines.models import Machine

class FuelCard(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE)
    card_number = models.CharField(max_length=100, unique=True)
    card_holder = models.CharField(max_length=255)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.card_number} ({self.card_holder})"

class FuelLog(models.Model):
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='fuel_logs')
    liters = models.DecimalField(max_digits=10, decimal_places=2)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
    fuel_date = models.DateField()
    remarks = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.machine} — {self.liters} L on {self.fuel_date}"
