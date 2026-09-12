from django.db import models
from django.utils import timezone
from apps.machines.models import Machine
from apps.authentication.models import User

class RefuelEntry(models.Model):
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='refuel_entries')
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    quantity_liters = models.DecimalField(max_digits=10, decimal_places=2)
    price_per_liter = models.DecimalField(max_digits=10, decimal_places=2, default=95.0)
    total_cost = models.DecimalField(max_digits=12, decimal_places=2)
    meter_reading = models.DecimalField(max_digits=10, decimal_places=2)
    refuel_date = models.DateTimeField(default=timezone.now, blank=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-refuel_date', '-id']

    def __str__(self):
        return f"{self.machine.name} - {self.quantity_liters}L on {self.refuel_date}"

    def save(self, *args, **kwargs):
        if not self.total_cost or self.total_cost == 0:
            qty = float(self.quantity_liters or 0)
            price = float(self.price_per_liter or 95.0)
            self.total_cost = round(qty * price, 2)
        super().save(*args, **kwargs)
