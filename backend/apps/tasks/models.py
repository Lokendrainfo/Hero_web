from django.db import models
from apps.vendors.models import Vendor
from apps.machines.models import Machine
from apps.authentication.models import User

class Task(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='tasks')
    machine = models.ForeignKey(Machine, on_delete=models.SET_NULL, null=True, blank=True)
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    title = models.CharField(max_length=255)
    task_type = models.CharField(max_length=100, default="HDD")
    description = models.TextField(blank=True, null=True)
    scope_str = models.CharField(max_length=100, default="500 m")
    progress_val = models.IntegerField(default=320)
    scope_val = models.IntegerField(default=500)
    progress_percent = models.IntegerField(default=64)
    due_date_str = models.CharField(max_length=100, default="20 August 2025")
    overdue_str = models.CharField(max_length=100, default="Overdue by 3 days")
    fiber_category = models.CharField(max_length=50, default="Fiber 1")
    status = models.CharField(max_length=50, default='PENDING')
    priority = models.CharField(max_length=50, default='MEDIUM')
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({self.status})"
