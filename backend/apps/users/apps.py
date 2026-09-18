import os
from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.users'

    def ready(self):
        # Proxy-only: do NOT sync/persist iLync users into HERO DB on startup.
        return
