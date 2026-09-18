from django.db import models
from apps.machines.models import Machine
from apps.authentication.models import User

class BreakdownReport(models.Model):
    class Meta:
        managed = False
    machine = models.ForeignKey(Machine, on_delete=models.CASCADE, related_name='breakdown_reports')
    reported_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    severity = models.CharField(max_length=50, default='HIGH')
    issue_description = models.TextField()
    status = models.CharField(max_length=50, default='OPEN')
    reported_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.machine} — {self.severity} ({self.status})"
