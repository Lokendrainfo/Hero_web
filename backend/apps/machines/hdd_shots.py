import logging
import re
from datetime import datetime

from apps.common.ttl_cache import ttl_get, ttl_set
from apps.common.task_scope import get_user_authorized_tasks
from apps.machines.models import Machine

logger = logging.getLogger(__name__)

CACHE_KEY = "hdd_machine_chassis_shot_summary_v2"
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


def parse_shot_datetime(dt_val):
    """
    Parses start or end timestamps into a naive datetime object.
    Accepts:
    - DD-MM-YYYY HH:MM:SS or DD/MM/YYYY HH:MM:SS (optional seconds)
    - YYYY-MM-DD HH:MM:SS or YYYY/MM/DD HH:MM:SS (optional seconds)
    - ISO 8601 strings (e.g. 2026-10-14T09:00:00, 2026-10-14 09:00:00, with or without Z/offset)
    - Epoch timestamps (milliseconds or seconds, int/float or digit string)
    Returns a datetime object or None if invalid/missing.
    """
    if dt_val is None:
        return None
    
    if isinstance(dt_val, (int, float)):
        try:
            ts = float(dt_val)
            if ts <= 0:
                return None
            if ts > 1e11:  # milliseconds
                ts /= 1000.0
            return datetime.fromtimestamp(ts)
        except Exception:
            return None

    s = str(dt_val).strip()
    if not s or s.lower() in ('none', 'null', 'undefined', 'nan', 'wip', 'in_progress', 'inprogress', 'pending', '-', '—', '--', 'n/a', '00:00:00'):
        return None

    if s.isdigit():
        try:
            ts = float(s)
            if ts <= 0:
                return None
            if ts > 1e11:
                ts /= 1000.0
            return datetime.fromtimestamp(ts)
        except Exception:
            return None

    # 1. Match DD-MM-YYYY or DD/MM/YYYY
    m_dd = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$', s)
    if m_dd:
        d, mo, y, h, mi, sec = m_dd.groups()
        try:
            return datetime(int(y), int(mo), int(d), int(h or 0), int(mi or 0), int(sec or 0))
        except Exception:
            return None

    # 2. Match YYYY-MM-DD or YYYY/MM/DD
    m_yy = re.match(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$', s)
    if m_yy:
        y, mo, d, h, mi, sec = m_yy.groups()
        try:
            return datetime(int(y), int(mo), int(d), int(h or 0), int(mi or 0), int(sec or 0))
        except Exception:
            return None

    # 3. Standard ISO formatted string
    try:
        clean_s = s.replace('Z', '+00:00')
        dt = datetime.fromisoformat(clean_s)
        if dt.tzinfo is not None:
            from datetime import timezone, timedelta
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            dt = dt.astimezone(ist_tz).replace(tzinfo=None)
        return dt
    except Exception:
        pass

    return None


def is_shot_completed(shot):
    """
    Evaluates whether an individual HDD shot is fully completed according to
    enterprise validation rules:
    - Include a shot only when both start_time and end_time are present and valid.
    - Exclude in-progress/pending shots, even if they have already recorded partial metres.
    - If end_time is valid on completed historical records where start_time was left empty,
      derive start_time from ductingStartTime, photo timestamp, or previous hour so production is counted.
    - Validate that the end time is not earlier than the start time.
    Returns (is_valid: bool, start_dt: datetime, end_dt: datetime).
    """
    if not isinstance(shot, dict):
        return False, None, None

    # Check explicit in-progress status flags
    for status_key in ('taskStage', 'taskHddStage', 'status', 'shotStatus', 'executionStatus', 'state'):
        st_val = str(shot.get(status_key) or '').strip().upper()
        if st_val in ('IN_PROGRESS', 'INPROGRESS', 'WIP', 'PENDING', 'RUNNING', 'STARTED', 'PARTIAL'):
            return False, None, None

    # Extract end time candidate first
    end_raw = (
        shot.get('hddEndTime')
        or shot.get('endTime')
        or shot.get('end_time')
        or shot.get('ductedTime')
        or shot.get('savingTime')
    )
    if not end_raw:
        return False, None, None

    # String sanity check on end_raw
    end_str = str(end_raw).strip().lower()
    if end_str in ('none', 'null', 'undefined', 'wip', 'inprogress', 'in_progress', 'pending', '-', '—', '--', 'n/a', '00:00:00'):
        return False, None, None

    end_dt = parse_shot_datetime(end_raw)
    if not end_dt:
        return False, None, None

    # Extract start time candidate
    start_raw = (
        shot.get('hddStartTime')
        or shot.get('startTime')
        or shot.get('start_time')
        or shot.get('ductingStartTime')
        or shot.get('time')
    )
    start_dt = parse_shot_datetime(start_raw) if start_raw else None

    # Fallback for start_dt if missing but end_dt is valid (historical completed shots)
    if not start_dt:
        duct = shot.get('ducting') or []
        if duct and isinstance(duct, list) and isinstance(duct[0], dict):
            d_start = duct[0].get('ductingStartTime')
            if d_start:
                start_dt = parse_shot_datetime(d_start)
        if not start_dt:
            img = shot.get('startHddShotImage')
            if isinstance(img, dict) and img.get('capturedAt'):
                start_dt = parse_shot_datetime(img.get('capturedAt'))
        if not start_dt:
            from datetime import timedelta
            start_dt = end_dt - timedelta(hours=1)

    # Validate that the end time is not earlier than the start time
    if end_dt < start_dt:
        return False, None, None

    return True, start_dt, end_dt


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

        # Aggregate completed shots only
        prev_cum = None
        for s in shots:
            if not isinstance(s, dict):
                continue
            is_valid, start_dt, end_dt = is_shot_completed(s)
            if not is_valid:
                continue

            meters, prev_cum = extract_shot_meters(s, prev_cum)
            matched_rec["hdd_shot_count"] += 1
            matched_rec["hdd_shot_meters"] += meters

            iso_time = end_dt.strftime('%Y-%m-%dT%H:%M:%S')
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


DAILY_METRICS_CACHE_KEY = "hdd_machine_chassis_daily_metrics_v3"
DAILY_METRICS_CACHE_TTL = 120  # 2 minutes TTL


def parse_date_to_ymd(dt_val):
    """
    Parses timestamps or date strings (DD-MM-YYYY, YYYY-MM-DD, epoch millis/sec, ISO)
    into standard ISO date 'YYYY-MM-DD'.
    """
    if not dt_val:
        return None
    if isinstance(dt_val, (int, float)):
        try:
            ts = float(dt_val)
            if ts > 1e11:
                ts /= 1000.0
            return datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
        except Exception:
            return None
    s = str(dt_val).strip()

    # 1. Match DD-MM-YYYY or DD/MM/YYYY
    m_dd = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})', s)
    if m_dd:
        d, mo, y = m_dd.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"

    # 2. Match YYYY-MM-DD or YYYY/MM/DD
    m_yy = re.match(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})', s)
    if m_yy:
        y, mo, d = m_yy.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"

    # 3. Epoch digits
    if s.isdigit() and len(s) >= 10:
        try:
            ts = int(s)
            if ts > 1e11:
                ts /= 1000.0
            return datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
        except Exception:
            pass

    # 4. Standard ISO string
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d')
    except Exception:
        pass

    return None


def normalize_date_input(val):
    """
    Validates and normalizes user input dates into 'YYYY-MM-DD' calendar dates.
    """
    if not val:
        return None
    ymd = parse_date_to_ymd(val)
    if not ymd:
        return None
    try:
        datetime.strptime(ymd, '%Y-%m-%d')
        return ymd
    except ValueError:
        return None


def extract_shot_date(shot, task):
    """
    Extracts the recorded execution date (YYYY-MM-DD) for an HDD shot.
    """
    if not isinstance(shot, dict):
        return None

    # Check primary shot timestamps
    for field in ['hddEndTime', 'hddStartTime', 'date', 'savingTime', 'time', 'ductedTime', 'ductingStartTime']:
        d = parse_date_to_ymd(shot.get(field))
        if d:
            return d

    # Check shot images / videos
    for img_key in ['startHddShotImage', 'pitToPitVideo']:
        img = shot.get(img_key)
        if isinstance(img, dict) and img.get('capturedAt'):
            d = parse_date_to_ymd(img.get('capturedAt'))
            if d:
                return d

    # Check pit images
    pilot = shot.get('pilotHole') if isinstance(shot.get('pilotHole'), dict) else {}
    for pit in [pilot.get('entryPitPic'), pilot.get('exitPitPic')]:
        if isinstance(pit, dict) and pit.get('capturedAt'):
            d = parse_date_to_ymd(pit.get('capturedAt'))
            if d:
                return d

    # Check depth capture sensor/camera timestamps
    for dp in (shot.get('depthCapture') or []):
        if isinstance(dp, dict):
            d = parse_date_to_ymd(dp.get('capturedAt')) or parse_date_to_ymd((dp.get('depthoMeterImage') or {}).get('capturedAt'))
            if d:
                return d

    # Fallback to parent task timestamps
    if isinstance(task, dict):
        for t_field in ['updatedAt', 'lastModified', 'createdAt', 'taskDate']:
            d = parse_date_to_ymd(task.get(t_field))
            if d:
                return d

    return None


def extract_shot_meters(shot, prev_cumulative=None):
    """
    Extracts drilled meters for a shot.
    - Authoritative production source field: HDD Shot Distance (User Input),
      captured in `tentativeShotLength`.
    - Fallback: lengthMeters, shotLength, delta of readings.
    Returns (meters, current_cumulative).
    """
    if not isinstance(shot, dict):
        return 0.0, prev_cumulative

    # 1. Authoritative production source field: HDD Shot Distance (User Input)
    user_dist = shot.get('tentativeShotLength')
    if user_dist is not None and str(user_dist).strip() != '':
        try:
            return float(user_dist), prev_cumulative
        except (ValueError, TypeError):
            pass

    # 2. Fallback to incremental length attributes
    for k in ('lengthMeters', 'shotLength', 'boreLength'):
        val = shot.get(k)
        if val is not None and str(val).strip() != '':
            try:
                return float(val), prev_cumulative
            except (ValueError, TypeError):
                pass

    # 3. Explicit end and start readings on the shot
    end_reading = shot.get('endReading') or shot.get('endMeter') or shot.get('meterEnd')
    start_reading = shot.get('startReading') or shot.get('startMeter') or shot.get('meterStart')
    if end_reading is not None and start_reading is not None:
        try:
            delta = abs(float(end_reading) - float(start_reading))
            return delta, float(end_reading)
        except (ValueError, TypeError):
            pass

    # 4. Cumulative meter readings (calculate difference between consecutive readings)
    cum_reading = shot.get('cumulativeReading') or shot.get('cumulative_meters') or shot.get('meterReading')
    if cum_reading is not None:
        try:
            curr_cum = float(cum_reading)
            if prev_cumulative is not None and curr_cum >= prev_cumulative:
                return curr_cum - prev_cumulative, curr_cum
            elif prev_cumulative is None:
                return curr_cum, curr_cum
        except (ValueError, TypeError):
            pass

    return 0.0, prev_cumulative


def build_all_chassis_daily_hdd_metrics(force_refresh=False):
    """
    Builds day-wise HDD performance metrics (shot count and shot meters)
    mapped to machine chassis numbers from execution telemetry tasks.
    """
    if not force_refresh:
        cached = ttl_get(DAILY_METRICS_CACHE_KEY)
        if cached is not None and isinstance(cached, tuple) and len(cached) == 2:
            return cached

    from collections import defaultdict

    known_fleet = {}
    for m in Machine.objects.all():
        chassis_key = str(m.machine_chassis_no or m.serial_number or '').strip()
        if not chassis_key:
            continue
        info = {
            "chassis_number": chassis_key,
            "machine_id": m.id,
            "machine_name": m.name,
            "keys": {chassis_key.lower()}
        }
        if m.machine_chassis_no:
            info["keys"].add(str(m.machine_chassis_no).strip().lower())
        if m.serial_number:
            info["keys"].add(str(m.serial_number).strip().lower())
        for k in info["keys"]:
            known_fleet[k] = info

    # Fetch all authorized tasks with telemetry
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
        logger.error("[build_all_chassis_daily_hdd_metrics] Error fetching tasks: %s", exc)
        tasks = []

    daily_map = defaultdict(lambda: defaultdict(lambda: {"count": 0, "meters": 0.0, "shots": []}))
    canonical_chassis_info = {}
    seen_shot_keys = set()

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

        raw_lower = raw_chassis.lower()
        matched_info = known_fleet.get(raw_lower)
        if matched_info:
            canonical_chassis = matched_info["chassis_number"]
        else:
            canonical_chassis = raw_chassis
            matched_info = {
                "chassis_number": raw_chassis,
                "machine_id": None,
                "machine_name": raw_chassis,
                "keys": {raw_lower}
            }
            known_fleet[raw_lower] = matched_info

        canonical_chassis_info[canonical_chassis] = matched_info

        shots = tr.get('hddShot') if isinstance(tr.get('hddShot'), list) else []
        prev_cum = None
        for idx, s in enumerate(shots):
            if not isinstance(s, dict):
                continue
            
            # 1. Enforce completed shot validation rules
            is_valid, start_dt, end_dt = is_shot_completed(s)
            if not is_valid:
                continue

            shot_date = start_dt.strftime('%Y-%m-%d')
            meters, prev_cum = extract_shot_meters(s, prev_cum)
            meters = round(float(meters), 2)

            start_iso = start_dt.strftime('%Y-%m-%dT%H:%M:%S')
            end_iso = end_dt.strftime('%Y-%m-%dT%H:%M:%S')
            shot_id = str(
                s.get('hddShotName')
                or s.get('hddShotSerialNo')
                or s.get('shot_id')
                or s.get('id')
                or f"SHOT{len(daily_map[canonical_chassis][shot_date]['shots']) + 1:03d}"
            ).strip()

            # Prevent duplicate processing of the same telemetry shot
            dedup_key = (canonical_chassis, shot_id, start_iso, end_iso)
            if dedup_key in seen_shot_keys:
                continue
            seen_shot_keys.add(dedup_key)

            daily_map[canonical_chassis][shot_date]["count"] += 1
            daily_map[canonical_chassis][shot_date]["meters"] += meters
            daily_map[canonical_chassis][shot_date]["shots"].append({
                "shot_id": shot_id,
                "start_time": start_iso,
                "end_time": end_iso,
                "shot_meters": meters
            })

    # Build clean formatted day-wise records
    formatted_chassis_records = {}
    for canon_chassis, date_dict in daily_map.items():
        info = canonical_chassis_info.get(canon_chassis, {})
        m_id = info.get("machine_id")
        rec_list = []
        for d_str, data in sorted(date_dict.items()):
            day_shots = data.get("shots", [])
            # Sort individual shots chronologically by start_time
            day_shots.sort(key=lambda x: x.get("start_time", ""))
            rec_list.append({
                "chassis_number": canon_chassis,
                "date": d_str,
                "hdd_shot_count": int(data["count"]),
                "hdd_shot_meters": round(float(data["meters"]), 2),
                "machine_id": m_id,
                "shots": day_shots
            })
        formatted_chassis_records[canon_chassis] = rec_list

    cache_val = (formatted_chassis_records, known_fleet)
    ttl_set(DAILY_METRICS_CACHE_KEY, cache_val, ttl_seconds=DAILY_METRICS_CACHE_TTL)
    return cache_val


def get_chassis_daily_hdd_metrics(
    chassis_query=None,
    start_date=None,
    end_date=None,
    machine_id=None,
    force_refresh=False
):
    """
    Main query function for Chassis Number-Wise Day-Wise HDD Shot Count and Shot Meters API.
    
    Filters:
    - chassis_query: Target machine chassis number or comma-separated list
    - start_date: Starting date (inclusive, YYYY-MM-DD or DD-MM-YYYY)
    - end_date: Ending date (inclusive, YYYY-MM-DD or DD-MM-YYYY)
    - machine_id: Target database machine ID
    - force_refresh: Force refresh bypass cache
    """
    # 1. Normalize and validate date parameters
    norm_start = None
    if start_date:
        norm_start = normalize_date_input(start_date)
        if not norm_start:
            return {
                "success": False,
                "message": f"Invalid start_date parameter: '{start_date}'. Expected format YYYY-MM-DD or DD-MM-YYYY.",
                "data": []
            }

    norm_end = None
    if end_date:
        norm_end = normalize_date_input(end_date)
        if not norm_end:
            return {
                "success": False,
                "message": f"Invalid end_date parameter: '{end_date}'. Expected format YYYY-MM-DD or DD-MM-YYYY.",
                "data": []
            }

    if norm_start and norm_end and norm_start > norm_end:
        return {
            "success": False,
            "message": f"start_date ({norm_start}) cannot be after end_date ({norm_end}).",
            "data": []
        }

    # 2. Retrieve day-wise records and fleet registry
    daily_records, known_fleet = build_all_chassis_daily_hdd_metrics(force_refresh=force_refresh)

    target_chassis_list = []

    # 3. Handle filter by machine_id
    if machine_id is not None:
        try:
            mid_int = int(machine_id)
        except (ValueError, TypeError):
            return {
                "success": False,
                "message": f"Invalid machine_id parameter: '{machine_id}'. Expected an integer ID.",
                "data": []
            }

        matched_fleet = [v for v in known_fleet.values() if v.get('machine_id') == mid_int]
        if not matched_fleet:
            return {
                "success": False,
                "message": f"No machine found with machine_id: {machine_id}",
                "data": []
            }
        target_chassis_list = [matched_fleet[0]['chassis_number']]

    # 4. Handle filter by chassis_query
    elif chassis_query:
        if isinstance(chassis_query, str):
            requested = [c.strip() for c in chassis_query.split(',') if c.strip()]
        elif isinstance(chassis_query, (list, tuple, set)):
            requested = [str(c).strip() for c in chassis_query if str(c).strip()]
        else:
            requested = []

        if not requested:
            return {
                "success": False,
                "message": "Invalid chassis_number parameter provided.",
                "data": []
            }

        matched_set = set()
        for req in requested:
            req_lower = req.lower()
            matched_canonical = None

            # Check known fleet registry
            if req_lower in known_fleet:
                matched_canonical = known_fleet[req_lower]['chassis_number']
            else:
                for k, info in known_fleet.items():
                    if k == req_lower or info['chassis_number'].lower() == req_lower:
                        matched_canonical = info['chassis_number']
                        break

            # Flexible substring / last-digits matching if >= 4 characters
            if not matched_canonical and len(req) >= 4:
                for k, info in known_fleet.items():
                    if req_lower in k or k.endswith(req_lower) or info['chassis_number'].lower().endswith(req_lower):
                        matched_canonical = info['chassis_number']
                        break

            # Also check daily records map directly
            if not matched_canonical:
                for c_k in daily_records.keys():
                    if c_k.lower() == req_lower or (len(req) >= 4 and (req_lower in c_k.lower() or c_k.lower().endswith(req_lower))):
                        matched_canonical = c_k
                        break

            if matched_canonical:
                matched_set.add(matched_canonical)

        if not matched_set:
            return {
                "success": False,
                "message": f"Invalid chassis number or machine not found: '{', '.join(requested)}'",
                "data": []
            }

        target_chassis_list = sorted(list(matched_set))

    # 5. If no filter, target all machines with records
    else:
        target_chassis_list = sorted(list(daily_records.keys()))

    # 6. Collect and filter day-wise records
    filtered_results = []
    for c_num in target_chassis_list:
        recs = daily_records.get(c_num, [])
        for r in recs:
            rec_date = r.get('date')
            if norm_start and rec_date < norm_start:
                continue
            if norm_end and rec_date > norm_end:
                continue
            filtered_results.append(r)

    # Sort results by date ascending, then by chassis_number
    filtered_results.sort(key=lambda x: (x.get('date', ''), x.get('chassis_number', '')))

    if not filtered_results:
        # Machine(s) are valid, but no shot records exist in the selected period
        date_desc = ""
        if norm_start and norm_end:
            date_desc = f" between {norm_start} and {norm_end}"
        elif norm_start:
            date_desc = f" from {norm_start} onwards"
        elif norm_end:
            date_desc = f" up to {norm_end}"

        chassis_desc = f" for chassis '{', '.join(target_chassis_list)}'" if target_chassis_list else ""
        return {
            "success": True,
            "data": [],
            "message": f"No HDD shot records found{chassis_desc}{date_desc}.",
            "total_records": 0
        }

    return {
        "success": True,
        "data": filtered_results,
        "total_records": len(filtered_results)
    }

