from django.db import models
from django.utils import timezone


class RefuelEntry(models.Model):
    """Deprecated local model — FiberForce sensor-logs only. Not persisted."""
    quantity_liters = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    price_per_liter = models.DecimalField(max_digits=10, decimal_places=2, default=95.0)
    total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    meter_reading = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refuel_date = models.DateTimeField(default=timezone.now, blank=True)
    notes = models.TextField(blank=True, null=True)
    machine_chassis_no = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'refuel_refuelentry'
        ordering = ['-refuel_date', '-id']

    def save(self, *args, **kwargs):
        raise RuntimeError("RefuelEntry must not be persisted (proxy-only FiberForce).")
