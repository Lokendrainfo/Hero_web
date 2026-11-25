from rest_framework.exceptions import NotFound, PermissionDenied

from apps.hero_integration.permissions import (
    can_review_submission,
    get_primary_pm_role,
    get_user_allowed_frequencies,
    get_user_role_codes,
    is_pm_admin,
    user_can_access_frequency,
)
from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceFrequencyMaster,
    RoleFrequencyMapping,
)


def get_role_context(user) -> dict:
    allowed_codes = get_user_allowed_frequencies(user, for_submit=False)
    submit_codes = get_user_allowed_frequencies(user, for_submit=True)
    freq_objs = list(
        MaintenanceFrequencyMaster.objects.filter(code__in=allowed_codes, is_active=True)
        .order_by('sort_order', 'id')
    )
    return {
        "role": get_primary_pm_role(user),
        "roles": get_user_role_codes(user),
        "is_admin": is_pm_admin(user),
        "can_review": can_review_submission(user),
        "allowed_frequencies": [f.code for f in freq_objs],
        "submittable_frequencies": submit_codes,
        "allowed_frequency_labels": [{"code": f.code, "name": f.name} for f in freq_objs],
    }


def get_frequencies_for_user(user) -> dict:
    role_ctx = get_role_context(user)
    allowed_set = set(role_ctx["allowed_frequencies"])
    submit_set = set(role_ctx["submittable_frequencies"])

    all_freqs = MaintenanceFrequencyMaster.objects.filter(is_active=True).order_by('sort_order', 'id')
    role_maps = RoleFrequencyMapping.objects.filter(is_active=True).select_related('frequency')
    roles_by_freq = {}
    for rm in role_maps:
        roles_by_freq.setdefault(rm.frequency_id, []).append(
            {"role_code": rm.role_code, "role_name": rm.role_name}
        )

    frequencies = []
    for freq in all_freqs:
        item_count = ChecklistFrequencyMapping.objects.filter(
            frequency=freq,
            is_active=True,
            checklist_item__is_active=True,
        ).count()
        frequencies.append(
            {
                "id": freq.id,
                "code": freq.code,
                "name": freq.name,
                "interval_hours": freq.interval_hours,
                "interval_days": freq.interval_days,
                "due_threshold_pct": freq.due_threshold_pct,
                "description": freq.description,
                "sort_order": freq.sort_order,
                "checklist_item_count": item_count,
                "assigned_roles": roles_by_freq.get(freq.id, []),
                "can_view": freq.code in allowed_set,
                "can_submit": freq.code in submit_set,
            }
        )

    return {
        "role_info": role_ctx,
        "frequencies": frequencies,
        "allowed_frequencies": [f for f in frequencies if f["can_view"]],
    }


def get_checklist_for_frequency(user, frequency_code: str) -> dict:
    norm_code = str(frequency_code or '').strip().upper()
    freq = MaintenanceFrequencyMaster.objects.filter(code=norm_code, is_active=True).first()
    if not freq:
        raise NotFound(f"Maintenance frequency '{frequency_code}' not found.")

    if not user_can_access_frequency(user, freq.code, for_submit=False):
        raise PermissionDenied(
            f"Your role ({get_primary_pm_role(user)}) is not authorized to access the {freq.name} checklist."
        )

    mappings = (
        ChecklistFrequencyMapping.objects.select_related('checklist_item', 'checklist_item__category')
        .filter(
            frequency=freq,
            is_active=True,
            checklist_item__is_active=True,
            checklist_item__category__is_active=True,
        )
        .order_by('checklist_item__category__sort_order', 'sort_order', 'checklist_item__sort_order', 'id')
    )

    items = []
    grouped = {"MACHINE": [], "ENGINE": []}
    for m in mappings:
        ci = m.checklist_item
        entry = {
            "id": ci.id,
            "checklist_item_id": ci.id,
            "mapping_id": m.id,
            "item_code": ci.item_code,
            "category_code": ci.category.code,
            "category_name": ci.category.name,
            "description": ci.description,
            "remarks": ci.remarks,
            "special_instructions": ci.special_instructions,
            "service_interval": ci.service_interval,
            "is_mandatory": m.is_mandatory,
            "requires_photo": ci.requires_photo,
            "requires_remarks_if_not_completed": ci.requires_remarks_if_not_completed,
            "sort_order": m.sort_order or ci.sort_order,
        }
        items.append(entry)
        grouped.setdefault(ci.category.code, []).append(entry)

    safety_guidelines = get_safety_guidelines()

    # Also surface condition-based / as-required items from master for visibility
    as_required_items = [
        {
            "id": ci.id,
            "item_code": ci.item_code,
            "category_code": ci.category.code,
            "category_name": ci.category.name,
            "description": ci.description,
            "remarks": ci.remarks,
            "special_instructions": ci.special_instructions,
            "service_interval": ci.service_interval,
        }
        for ci in MaintenanceChecklistMaster.objects.select_related('category')
        .filter(is_active=True, is_as_required=True)
        .order_by('sort_order', 'id')
    ]

    return {
        "frequency": {
            "id": freq.id,
            "code": freq.code,
            "name": freq.name,
            "interval_hours": freq.interval_hours,
            "interval_days": freq.interval_days,
            "description": freq.description,
        },
        "can_submit": user_can_access_frequency(user, freq.code, for_submit=True),
        "total_items": len(items),
        "items": items,
        "categories": {
            "MACHINE": grouped.get("MACHINE", []),
            "ENGINE": grouped.get("ENGINE", []),
        },
        "as_required_reference_items": as_required_items,
        "safety_guidelines": safety_guidelines,
    }


def get_safety_guidelines() -> list[dict]:
    cat = MaintenanceCategoryMaster.objects.filter(code='GENERAL_SAFETY_GUIDELINES').first()
    if not cat:
        return []
    items = (
        MaintenanceChecklistMaster.objects.filter(category=cat, is_active=True)
        .order_by('sort_order', 'id')
    )
    return [
        {
            "id": item.id,
            "item_code": item.item_code,
            "section_key": item.section_key,
            "title": item.description,
            "subtitle": item.service_interval or item.remarks,
            "content": item.special_instructions,
            "remarks": item.remarks,
            "sort_order": item.sort_order,
        }
        for item in items
    ]

