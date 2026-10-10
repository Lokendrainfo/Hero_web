import logging
import re
from datetime import datetime

from apps.common.ttl_cache import ttl_get, ttl_set
from apps.common.task_scope import get_user_authorized_tasks
from apps.machines.models import Machine

logger = logging.getLogger(__name__)

CACHE_KEY = "hdd_machine_chassis_shot_summary_v1"
CACHE_TTL = 120  # 2 minutes cache for sub-10ms response times


def parse_timestamp_to_iso(dt_val):
    """
    Parses timestamps (DD-MM-YYYY HH:MM:SS, epoch millis, or ISO string)
    into standard ISO 8601 'YYYY-MM-DDTHH:MM:SS' string.
    """
    if not dt_val:
        return None
    s = str(dt_val).strip()
    
    # 1. Match DD-MM-YYYY HH:MM:SS or DD/MM/YYYY HH:MM:SS
    m = re.match(r'^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?', s)
    if m:
        d, mo, y, h, mi, sec = m.groups()
        return f"{y}-{mo}-{d}T{h or '00'}:{mi or '00'}:{sec or '00'}"
    
    # 2. Match milliseconds epoch timestamp
    if s.isdigit() and len(s) >= 12:
        try:
            dt = datetime.fromtimestamp(int(s) / 1000.0)
            return dt.strftime('%Y-%m-%dT%H:%M:%S')
        except Exception:
            pass

    # 3. Standard ISO formatted string
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%dT%H:%M:%S')
    except Exception:
        return s


def build_all_chassis_hdd_shot_summary(force_refresh=False):
    """
    Scans all execution telemetry tasks and aggregates HDD shot count,
    HDD shot meters, and latest timestamp mapped to machine chassis numbers.
    """
    if not force_refresh:
        cached = ttl_get(CACHE_KEY)
        if cached is not None and isinstance(cached, dict):
            return cached

    # Map registered database machines by chassis and serial number
    db_machines_by_chassis = {}
    for m in Machine.objects.all():
        if m.machine_chassis_no:
            db_machines_by_chassis[str(m.machine_chassis_no).strip().lower()] = m
        if m.serial_number:
            db_machines_by_chassis[str(m.serial_number).strip().lower()] = m

    summary_map = {}

    # Seed all known DB machines (so even 0-shot machines exist in the fleet registry)
    for m in Machine.objects.all():
        chassis_key = str(m.machine_chassis_no or m.serial_number or '').strip()
        if not chassis_key:
            continue
        last_dt = m.updated_at.strftime('%Y-%m-%dT%H:%M:%S') if m.updated_at else None
        raw_keys = {chassis_key.lower()}
        if m.serial_number:
            raw_keys.add(str(m.serial_number).strip().lower())
        if m.machine_chassis_no:
            raw_keys.add(str(m.machine_chassis_no).strip().lower())

        summary_map[chassis_key] = {
            "chassis_number": chassis_key,
            "hdd_shot_count": 0,
            "hdd_shot_meters": 0.0,
            "machine_id": m.id,
            "last_updated": last_dt,
            "_raw_keys": raw_keys
        }

    # Fetch all authorized tasks with telemetry from iLync / execution endpoints
    try:
        scoped = get_user_authorized_tasks(
            user=None,
            task_type='FIBER_TRENCHING_DUCTING_TASK',
            page=0,
            size=500,
            expand_hierarchy=True,
            include_telemetry=True
        )
        tasks = scoped.get('results', []) if isinstance(scoped, dict) else []
    except Exception as exc:
        logger.error("[build_all_chassis_hdd_shot_summary] Error fetching tasks: %s", exc)
        tasks = []

    # Aggregate shots and meters per machine chassis number
    for t in tasks:
        if not isinstance(t, dict):
            continue

        ex = t.get('taskExecution') if isinstance(t.get('taskExecution'), dict) else {}
        fd = ex.get('fieldData') if isinstance(ex.get('fieldData'), dict) else {}
        tr = fd.get('trenching') if isinstance(fd.get('trenching'), dict) else {}

        mach = tr.get('trenchingMachineDetails') if isinstance(tr.get('trenchingMachineDetails'), dict) else {}
        if not mach and isinstance(t.get('machineDetails'), dict):
            mach = t.get('machineDetails')

        raw_chassis = str(
            mach.get('machineId')
            or mach.get('chassisNo')
            or mach.get('machine_chassis_no')
            or mach.get('registrationNo')
            or t.get('machineId')
            or ''
        ).strip()

        if not raw_chassis or raw_chassis.lower() in ('none', 'null', '—', 'n/a'):
            continue

        shots = tr.get('hddShot') if isinstance(tr.get('hddShot'), list) else []

        # Find or create record in summary_map
        matched_rec = None
        raw_lower = raw_chassis.lower()
        if raw_chassis in summary_map:
            matched_rec = summary_map[raw_chassis]
        else:
            for k, rec in summary_map.items():
                if raw_lower in rec.get('_raw_keys', set()) or k.lower() == raw_lower:
                    matched_rec = rec
                    break

        if not matched_rec:
            db_m = db_machines_by_chassis.get(raw_lower)
            matched_rec = {
                "chassis_number": raw_chassis,
                "hdd_shot_count": 0,
                "hdd_shot_meters": 0.0,
                "machine_id": db_m.id if db_m else None,
                "last_updated": None,
                "_raw_keys": {raw_lower}
            }
            summary_map[raw_chassis] = matched_rec

        # Aggregate shots
        for s in shots:
            if not isinstance(s, dict):
                continue
            matched_rec["hdd_shot_count"] += 1
            length = float(s.get('tentativeShotLength') or s.get('lengthMeters') or s.get('shotLength') or 0.0)
            matched_rec["hdd_shot_meters"] += length

            shot_time = (
                s.get('hddEndTime')
                or s.get('hddStartTime')
                or s.get('date')
                or t.get('updatedAt')
                or t.get('lastModified')
            )
            iso_time = parse_timestamp_to_iso(shot_time)
            if iso_time and (not matched_rec["last_updated"] or iso_time > matched_rec["last_updated"]):
                matched_rec["last_updated"] = iso_time

    # Final pass: round meters and cleanup internal keys
    final_dict = {}
    for k, rec in summary_map.items():
        clean_rec = {
            "chassis_number": rec["chassis_number"],
            "hdd_shot_count": int(rec["hdd_shot_count"]),
            "hdd_shot_meters": round(float(rec["hdd_shot_meters"]), 2),
            "machine_id": rec["machine_id"],
            "last_updated": rec["last_updated"],
        }
        final_dict[k] = clean_rec

    ttl_set(CACHE_KEY, final_dict, ttl_seconds=CACHE_TTL)
    return final_dict


def get_chassis_hdd_shot_data(chassis_query=None, machine_id=None, force_refresh=False):
    """
    Main query function for machine chassis-wise HDD shot count and meters.
    Supports single or multiple comma-separated chassis numbers, machine_id filtering,
    or returning all machines.
    """
    summary_map = build_all_chassis_hdd_shot_summary(force_refresh=force_refresh)

    if not chassis_query and not machine_id:
        # Return all machines (active with shots > 0 first, then sorted by chassis_number)
        data = list(summary_map.values())
        data.sort(key=lambda x: (-x['hdd_shot_count'], -x['hdd_shot_meters'], x['chassis_number']))
        return {"success": True, "data": data, "total_records": len(data)}

    # 1. Filter by machine_id
    if machine_id is not None:
        try:
            m_id = int(machine_id)
        except (ValueError, TypeError):
            return {
                "success": False,
                "message": f"Invalid machine_id parameter: '{machine_id}'. Expected an integer ID.",
                "data": []
            }

        matches = [rec for rec in summary_map.values() if rec.get('machine_id') == m_id]
        if not matches:
            return {
                "success": False,
                "message": f"No machine found with machine_id: {machine_id}",
                "data": []
            }
        return {"success": True, "data": matches, "total_records": len(matches)}

    # 2. Filter by chassis_number (supports single string, comma-separated, or list)
    if isinstance(chassis_query, str):
        requested_list = [c.strip() for c in chassis_query.split(',') if c.strip()]
    elif isinstance(chassis_query, (list, tuple, set)):
        requested_list = [str(c).strip() for c in chassis_query if str(c).strip()]
    else:
        requested_list = []

    if not requested_list:
        return {
            "success": False,
            "message": "Invalid chassis_number parameter provided.",
            "data": []
        }

    matches = []
    seen = set()

    for req in requested_list:
        req_lower = req.lower()
        matched = None

        # Exact match
        for k, rec in summary_map.items():
            if k.lower() == req_lower or rec['chassis_number'].lower() == req_lower:
                matched = rec
                break

        # Substring / last-digits match for flexible querying
        if not matched and len(req) >= 4:
            for k, rec in summary_map.items():
                if req_lower in rec['chassis_number'].lower() or rec['chassis_number'].lower().endswith(req_lower):
                    matched = rec
                    break

        if matched and matched['chassis_number'] not in seen:
            seen.add(matched['chassis_number'])
            matches.append(matched)

    if not matches:
        return {
            "success": False,
            "message": f"No machine records found matching chassis number(s): {', '.join(requested_list)}",
            "data": []
        }

    return {"success": True, "data": matches, "total_records": len(matches)}
