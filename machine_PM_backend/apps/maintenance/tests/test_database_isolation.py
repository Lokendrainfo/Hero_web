import pytest
from django.db import connections
from django.test import override_settings

from apps.hero_integration.models import HeroMachine, HeroUser
from apps.maintenance.models import MaintenanceAuditLog, MaintenanceSubmission
from config.db_router import HeroPMDatabaseRouter, HeroReadOnlyDatabaseError


@pytest.mark.django_db(databases=['default', 'hero'])
class TestMultiDatabaseIsolation:
    def test_pm_tables_exist_only_in_default_and_hero_tables_only_in_hero(self, seeded_masters, users, machines):
        default_tables = set(connections['default'].introspection.table_names())
        hero_tables = set(connections['hero'].introspection.table_names())

        expected_pm_tables = {
            'pm_frequency_master',
            'pm_category_master',
            'pm_checklist_master',
            'pm_checklist_frequency_mapping',
            'pm_role_frequency_mapping',
            'pm_submission',
            'pm_checklist_response',
            'pm_photo_attachment',
            'pm_approval_review',
            'pm_audit_log',
        }
        assert expected_pm_tables.issubset(default_tables)
        assert expected_pm_tables.isdisjoint(hero_tables)

        expected_hero_tables = {'authentication_user', 'machines_machine', 'vendors_vendor', 'roles_role'}
        assert expected_hero_tables.issubset(hero_tables)
        assert expected_hero_tables.isdisjoint(default_tables)

    def test_router_enforces_migration_and_read_only_rules(self):
        router = HeroPMDatabaseRouter()
        assert router.db_for_read(HeroMachine) == 'hero'
        assert router.db_for_read(HeroUser) == 'hero'
        assert router.db_for_read(MaintenanceSubmission) == 'default'
        assert router.db_for_write(MaintenanceAuditLog) == 'default'

        with override_settings(TESTING=False):
            assert router.allow_migrate('hero', 'pm_maintenance') is False
            assert router.allow_migrate('hero', 'hero_integration') is False
            assert router.allow_migrate('default', 'pm_maintenance') is True
            assert router.allow_migrate('default', 'hero_integration') is False

            with pytest.raises(HeroReadOnlyDatabaseError):
                router.db_for_write(HeroMachine)

            with pytest.raises(HeroReadOnlyDatabaseError):
                HeroMachine(name='ShouldFail', serial_number='X').save()

    def test_hero_data_retrieved_without_modifying_hero_db(self, seeded_masters, users, machines, make_auth_client):
        m1, _ = machines
        op = users['operator']
        client = make_auth_client(op)

        res = client.get(f'/api/v1/pm/machines/{m1.id}/validate/')
        assert res.status_code == 200
        assert res.json()['data']['machine_number'] == m1.machine_chassis_no
        assert res.json()['data']['assigned_operator'] == 'Ravi Kumar'

