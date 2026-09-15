"""
Centralized Task Progress Calculation Helper
Single source of truth for distance-weighted task progress across Segments, Rings, and Blocks,
and single source of truth for authorized task status statistics across Dashboard & Tasks pages.
"""

def calculate_task_progress(planned_distance=0, covered_distance=0, raw_pct=0, status=None):
    """
    Calculate progress metrics for a single task (e.g. SEGMENT).
    Distance-weighted formula: (covered_distance / planned_distance) * 100
    Clamped strictly between 0 and 100.
    """
    try:
        planned = max(0.0, float(planned_distance or 0))
    except (ValueError, TypeError):
        planned = 0.0

    try:
        covered = max(0.0, float(covered_distance or 0))
    except (ValueError, TypeError):
        covered = 0.0

    try:
        pct_val = max(0.0, float(raw_pct or 0))
    except (ValueError, TypeError):
        pct_val = 0.0

    status_str = str(status or '').upper()
    if status_str in ['COMPLETED', 'COMPLETE']:
        pct_val = 100.0
        if planned > 0 and covered == 0:
            covered = planned

    if covered == 0 and pct_val > 0 and planned > 0:
        covered = (planned * pct_val) / 100.0

    if planned > 0:
        progress_percent = min(100.0, round((covered / planned) * 100.0, 2))
    elif pct_val > 0:
        progress_percent = min(100.0, round(pct_val, 2))
    else:
        progress_percent = 0.0

    remaining = max(0.0, planned - covered)

    return {
        "planned_distance": round(planned, 2),
        "covered_distance": round(covered, 2),
        "remaining_distance": round(remaining, 2),
        "progress_percent": progress_percent
    }


def aggregate_hierarchy_progress(child_items):
    """
    Aggregate progress for parent tasks (RING / BLOCK) from descendant items.
    Uses distance-weighted calculation: sum(covered) / sum(planned) * 100.
    """
    if not child_items:
        return {
            "planned_distance": 0.0,
            "covered_distance": 0.0,
            "remaining_distance": 0.0,
            "progress_percent": 0.0
        }

    total_planned = 0.0
    total_covered = 0.0

    for item in child_items:
        if not item:
            continue
        try:
            p_dist = max(0.0, float(item.get('planned_distance') or item.get('totalLengthKm') or 0))
        except (ValueError, TypeError):
            p_dist = 0.0

        try:
            c_dist = max(0.0, float(item.get('covered_distance') or item.get('coveredLengthKm') or 0))
        except (ValueError, TypeError):
            c_dist = 0.0

        raw_p = float(item.get('progress_percent') or item.get('pct') or 0)
        if c_dist == 0 and raw_p > 0 and p_dist > 0:
            c_dist = (p_dist * raw_p) / 100.0

        total_planned += p_dist
        total_covered += c_dist

    if total_planned > 0:
        pct = min(100.0, round((total_covered / total_planned) * 100.0, 2))
    else:
        # Fallback to average of non-zero percentages if no planned distance
        pcts = [float(item.get('progress_percent') or item.get('pct') or 0) for item in child_items if item]
        pct = min(100.0, round(sum(pcts) / len(pcts), 2)) if pcts else 0.0

    remaining = max(0.0, total_planned - total_covered)

    return {
        "planned_distance": round(total_planned, 2),
        "covered_distance": round(total_covered, 2),
        "remaining_distance": round(remaining, 2),
        "progress_percent": pct
    }


def get_task_statistics(user, request=None, task_type='FIBER_TRENCHING_DUCTING_TASK', page_size=50):
    """
    Single source of truth for authorized task counts and status statistics
    across Dashboard, Tasks Page, and Reports.
    Strictly restricted to FIBER_TRENCHING_DUCTING_TASK.
    Reuses exact status classification logic matching frontend Tasks.jsx.
    """
    from apps.common.task_scope import get_user_authorized_tasks

    scoped_res = get_user_authorized_tasks(user=user, request=request, task_type='FIBER_TRENCHING_DUCTING_TASK', page=0, size=page_size)
    raw_tasks = scoped_res.get("results", []) if isinstance(scoped_res, dict) else []

    # Enforce task_type = FIBER_TRENCHING_DUCTING_TASK strictly
    trenching_tasks = [
        t for t in raw_tasks
        if isinstance(t, dict) and (
            str(t.get('taskType') or t.get('task_type') or t.get('type') or '').upper() == 'FIBER_TRENCHING_DUCTING_TASK'
            or 'TRENCH' in str(t.get('taskType') or t.get('task_type') or t.get('type') or '').upper()
            or 'DUCT' in str(t.get('taskType') or t.get('task_type') or t.get('type') or '').upper()
        )
    ]
    if not trenching_tasks:
        trenching_tasks = [t for t in raw_tasks if isinstance(t, dict)]

    has_segments = any(
        str(t.get('routeSnapshot', {}).get('level') if isinstance(t.get('routeSnapshot'), dict) else '').upper() == 'SEGMENT'
        or t.get('depth') == 2
        for t in trenching_tasks
    )

    if has_segments:
        primary_tasks = [
            t for t in trenching_tasks
            if str(t.get('routeSnapshot', {}).get('level') if isinstance(t.get('routeSnapshot'), dict) else '').upper() == 'SEGMENT'
            or t.get('depth') == 2
            or (not t.get('routeSnapshot') and t.get('depth') is None)
        ]
    else:
        primary_tasks = trenching_tasks

    completed = 0
    pending = 0
    in_progress = 0
    created = 0

    for t in primary_tasks:
        pct_val = float(t.get('progress_percent') or t.get('pct') or t.get('progressPercentage') or 0)
        st_val = str(t.get('status') or t.get('taskStage') or t.get('approvalStatus') or '').upper()
        is_done = st_val in ['COMPLETED', 'COMPLETE', 'APPROVED'] or pct_val >= 100

        if is_done:
            completed += 1
        else:
            pending += 1
            is_in_prog = st_val in ['IN_PROGRESS', 'EXECUTING'] or pct_val > 0
            if is_in_prog:
                in_progress += 1
            else:
                created += 1

    return {
        "all": len(primary_tasks),
        "total": len(primary_tasks),
        "pending": pending,
        "tasks_pending": pending,
        "in_progress": in_progress,
        "completed": completed,
        "created": created,
        "authorized_tasks": trenching_tasks,
        "primary_tasks": primary_tasks
    }
