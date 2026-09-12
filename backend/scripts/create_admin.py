import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()
from apps.authentication.models import User
if not User.objects.filter(username="admin").exists():
    User.objects.create_superuser("admin", "admin@hero.com", "admin123")
    print("Admin user created successfully.")
