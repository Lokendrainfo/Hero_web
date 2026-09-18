from django.db import models
from apps.machines.models import Machine

class MaintenanceSchedule(models.Model):
    class Meta:
        managed = False
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='maintenance_logs')
    title = models.CharField(max_length=255)
    maintenance_type = models.CharField(max_length=100, default='ROUTINE')
    scheduled_date = models.DateField()
    completed_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, default='SCHEDULED')
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    details = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} — {self.machine} ({self.status})"
