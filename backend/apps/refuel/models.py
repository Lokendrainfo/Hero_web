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
        if not self.total_cost or float(self.total_cost) == 0:
            qty = float(self.quantity_liters or 0)
            price = float(self.price_per_liter or 95.0)
            self.total_cost = round(qty * price, 2)
        super().save(*args, **kwargs)

        # Auto-sync with FuelLog
        try:
            from apps.fuel.models import FuelLog
            fuel_dt = self.refuel_date.date() if hasattr(self.refuel_date, 'date') else self.refuel_date
            perf_name = self.performed_by.get_full_name() if (self.performed_by and hasattr(self.performed_by, 'get_full_name')) else 'Operator'
            site_info = getattr(self.machine, 'location', 'Site')
            rem = self.notes or f"Field refueling at {site_info} by {perf_name}"

            log = FuelLog.objects.filter(machine=self.machine, fuel_date=fuel_dt, liters=self.quantity_liters).first()
            if not log:
                FuelLog.objects.create(
                    machine=self.machine,
                    liters=self.quantity_liters,
                    cost=self.total_cost,
                    fuel_date=fuel_dt,
                    remarks=rem
                )
            else:
                log.cost = self.total_cost
                log.remarks = rem
                log.save()
        except Exception as e:
            print(f"[RefuelEntry] Auto-sync to FuelLog exception: {e}")


class FuelSquareOff(models.Model):
    batch_key = models.CharField(max_length=120, unique=True, db_index=True)
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='fuel_square_offs')
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action_type = models.CharField(max_length=50, default='SQUARE_OFF')  # SQUARE_OFF, VENDOR_DEBIT, OPERATOR_RECOVERY, TOLERANCE
    recovery_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    gap_litres = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    status = models.CharField(max_length=20, default='DONE')  # PENDING, DONE
    disposition = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    settled_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-settled_at', '-id']

    def __str__(self):
        return f"SquareOff {self.batch_key} ({self.status}) - ₹{self.recovery_amount}"
