from apps.hero_integration.permissions import get_primary_pm_role
from apps.maintenance.models import MaintenanceAuditLog


def _get_client_ip(request):
    if not request:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def record_audit_log(
    entity_type: str,
    entity_id,
    action: str,
    actor=None,
    machine_id=None,
    frequency_code: str = '',
    details: dict | None = None,
    request=None,
):
    return MaintenanceAuditLog.objects.create(
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        actor=actor if (actor and getattr(actor, 'id', None)) else None,
        actor_username=getattr(actor, 'username', '') if actor else '',
        actor_role=get_primary_pm_role(actor) if actor else '',
        machine_id=machine_id,
        frequency_code=frequency_code or '',
        details=details or {},
        ip_address=_get_client_ip(request),
    )

