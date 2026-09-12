from django.db import models
from apps.machines.models import Machine

class TelemetryData(models.Model):
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='telemetry_logs')
    latitude = models.FloatField()
    longitude = models.FloatField()
    speed = models.FloatField(default=0.0)
    heading = models.FloatField(default=0.0)
    status = models.CharField(max_length=50, default='WORKING')
    engine_temp = models.FloatField(null=True, blank=True)
    fuel_level = models.FloatField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Telemetry reading'
        verbose_name_plural = 'Telemetry readings'

    def __str__(self):
        return f"{self.machine} @ {self.timestamp}"
