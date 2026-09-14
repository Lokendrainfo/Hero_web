from django.db import models

class Circle(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

class District(models.Model):
    circle = models.ForeignKey(Circle, on_delete=models.CASCADE, related_name='districts')
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('circle', 'name')
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.circle.name})"

class Block(models.Model):
    district = models.ForeignKey(District, on_delete=models.CASCADE, related_name='blocks')
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('district', 'name')
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.district.name})"
