from django.conf import settings


class HeroReadOnlyDatabaseError(RuntimeError):
    """Raised when any PM application code attempts a write operation on the read-only HERO database."""


class HeroPMDatabaseRouter:
    """
    Multi-database router separating Machine Preventive Maintenance (`default` -> `machine_pm_db`)
    from HERO master & authentication data (`hero` -> `hero_hdd_db`).

    Enforces:
    - All `pm_maintenance` and Django metadata models read/write/migrate exclusively on `default`.
    - All `hero_integration` models read exclusively from `hero`.
    - `hero` is strictly read-only (no writes, no migrations outside isolated test setup).
    - Cross-database relations are disallowed.
    """

    HERO_APP_LABELS = {'hero_integration'}
    PM_APP_LABELS = {'pm_maintenance', 'contenttypes', 'sessions', 'messages', 'admin', 'auth'}

    def db_for_read(self, model, **hints):
        if model._meta.app_label in self.HERO_APP_LABELS:
            return 'hero'
        return 'default'

    def db_for_write(self, model, **hints):
        if model._meta.app_label in self.HERO_APP_LABELS:
            if getattr(settings, 'TESTING', False):
                return 'hero'
            raise HeroReadOnlyDatabaseError(
                f"Write operation on HERO read-only model '{model._meta.label}' against 'hero' database is prohibited."
            )
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        db1 = 'hero' if obj1._meta.app_label in self.HERO_APP_LABELS else 'default'
        db2 = 'hero' if obj2._meta.app_label in self.HERO_APP_LABELS else 'default'
        return db1 == db2

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if db == 'hero':
            if getattr(settings, 'TESTING', False) and app_label in self.HERO_APP_LABELS:
                return True
            return False

        if db == 'default':
            if app_label in self.HERO_APP_LABELS:
                return False
            return app_label in self.PM_APP_LABELS

        return False

