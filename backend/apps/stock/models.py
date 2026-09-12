from django.db import models
from apps.vendors.models import Vendor

class StockItem(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='inventory')
    part_number = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, default='SPARE_PARTS')
    quantity = models.IntegerField(default=0)
    min_quantity = models.IntegerField(default=5)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    location = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.part_number} — {self.name}"
