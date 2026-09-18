from django.db import models
from apps.vendors.models import Vendor
from apps.machines.models import Machine

class Alert(models.Model):
    class Meta:
        managed = False
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='alerts')
    machine = models.ForeignKey(Machine, on_delete=models.SET_NULL, null=True, blank=True)
    alert_type = models.CharField(max_length=100, default='LOW_FUEL')
    title = models.CharField(max_length=255)
    message = models.TextField()
    time_ago_str = models.CharField(max_length=50, default='18m ago')
    alert_severity = models.CharField(max_length=50, default='CRITICAL') # CRITICAL, WARNING, INFO
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.alert_severity}: {self.title}"
