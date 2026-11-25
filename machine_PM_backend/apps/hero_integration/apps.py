from django.apps import AppConfig
from django.conf import settings


class HeroIntegrationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.hero_integration'
    verbose_name = 'HERO Master Integration'

    def ready(self):
        if getattr(settings, 'TESTING', False):
            for model in self.get_models():
                model._meta.managed = True

