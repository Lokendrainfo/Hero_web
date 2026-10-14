import logging
from collections import defaultdict
from datetime import datetime

from apps.common.ttl_cache import ttl_get, ttl_set
from apps.common.task_scope import get_user_authorized_tasks
from apps.machines.models import Machine
from apps.vendors.models import Vendor
from apps.machines.hdd_shots import (
    parse_date_to_ymd,
    normalize_date_input,
    extract_shot_date,
    extract_shot_meters,
)

logger = logging.getLogger(__name__)

CACHE_KEY_SHOTS = "hero_reports_hdd_shots_dataset_v4"
CACHE_TTL_SHOTS = 180  # 3 minutes cache for super-fast retrieval


def format_time_display(time_val):
    """
    Cleans up time values for display.
    If 'DD-MM-YYYY HH:MM:SS', extracts 'HH:MM:SS'.
    If ISO string, extracts 'HH:MM:SS'.
    """
    if not time_val:
        return ""
    s = str(time_val).strip()
    if not s or s.lower() in ('none', 'null', '-', '—', '--', 'n/a', 'nan', '00:00:00', 'undefined'):
        return ""
    if len(s) >= 19 and (" " in s or "T" in s):
        parts = s.replace("T", " ").split(" ")
        if len(parts) >= 2:
            return parts[1][:8]
    return s


def build_all_hdd_shot_records(force_refresh=False):
    """
    Gathers, validates, deduplicates, and compiles all individual HDD shots
    across the entire machine fleet and execution telemetry tasks, including
    geography (circle, district, block).
    Returns:
    {
        'shots': list_of_enriched_shot_dicts,
        'daily_summary': list_of_machine_daily_summaries,
        'filter_options': { 'machines': [...], 'vendors': [...], 'circles': [...], 'districts': [...], 'blocks': [...] },
        'overall_summary': { ... }
    }
    """
    if not force_refresh:
        cached = ttl_get(CACHE_KEY_SHOTS)
        if cached is not None and isinstance(cached, dict):
            return cached

    # 1. Map registered database machines
    db_machines_by_chassis = {}
    all_db_machines = list(Machine.objects.select_related('vendor').all())

    for m in all_db_machines:
        if m.machine_chassis_no:
            db_machines_by_chassis[str(m.machine_chassis_no).strip().lower()] = m
        if m.serial_number:
            db_machines_by_chassis[str(m.serial_number).strip().lower()] = m
        if m.code:
            db_machines_by_chassis[str(m.code).strip().lower()] = m

    # 2. Fetch tasks with telemetry
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
        logger.error("[build_all_hdd_shot_records] Error fetching tasks: %s", exc)
        tasks = []

    raw_shots = []
    seen_dedup_keys = set()
    unique_machines = {}
    unique_vendors = {}

    for t in tasks:
        if not isinstance(t, dict):
            continue

        task_id = str(t.get('id') or '')
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

        # Extract Geography: Circle, District, Block
        loc = t.get('locationSnapshot') if isinstance(t.get('locationSnapshot'), dict) else (t.get('location') if isinstance(t.get('location'), dict) else {})
        circle = str(t.get('circle') or loc.get('circle') or loc.get('state') or t.get('state') or '').strip()
        district = str(t.get('district') or loc.get('district') or loc.get('districtName') or '').strip()
        block = str(t.get('block') or loc.get('blockName') or loc.get('block') or '').strip()

        # Link to DB Machine
        db_m = db_machines_by_chassis.get(raw_chassis.lower())
        canonical_chassis = str(db_m.machine_chassis_no or db_m.serial_number) if db_m else raw_chassis
        machine_pk = db_m.id if db_m else None
        machine_code = db_m.code if db_m and db_m.code else (f"MAC-{db_m.id}" if db_m else raw_chassis)
        machine_name = db_m.name if db_m and db_m.name else (mach.get('machineName') or raw_chassis)
        
        vendor_id = db_m.vendor_id if db_m and db_m.vendor_id else None
        vendor_name = (
            db_m.vendor.name if db_m and db_m.vendor
            else (mach.get('vendorName') or t.get('vendorName') or '')
        )

        # Track machines & vendors for filter dropdowns
        if canonical_chassis not in unique_machines:
            unique_machines[canonical_chassis] = {
                'chassis_number': canonical_chassis,
                'machine_id': machine_code,
                'machine_pk': machine_pk,
                'machine_name': machine_name,
                'vendor_id': vendor_id,
                'vendor_name': vendor_name,
                'circle': circle,
                'district': district,
                'block': block
            }

        if vendor_id and vendor_id not in unique_vendors:
            unique_vendors[vendor_id] = {
                'id': vendor_id,
                'name': vendor_name
            }
        elif vendor_name and vendor_name not in unique_vendors:
            unique_vendors[vendor_name] = {
                'id': vendor_name,
                'name': vendor_name
            }

        shots = tr.get('hddShot') if isinstance(tr.get('hddShot'), list) else []
        prev_cum = None

        for idx, s in enumerate(shots):
            if not isinstance(s, dict):
                continue

            shot_date = extract_shot_date(s, t)
            if not shot_date:
                continue

            meters, prev_cum = extract_shot_meters(s, prev_cum)
            meters = round(float(meters), 2)

            shot_serial = str(s.get('hddShotSerialNo') or f"HDD-{idx+1:03d}").strip()
            shot_name = str(s.get('hddShotName') or '').strip()
            start_raw = s.get('hddStartTime') or ''
            end_raw = s.get('hddEndTime') or ''

            # Deduplication key to prevent duplicates
            dedup_key = (canonical_chassis, shot_serial, shot_name, str(start_raw), meters)
            if dedup_key in seen_dedup_keys:
                continue
            seen_dedup_keys.add(dedup_key)

            shot_id = shot_name or s.get('id') or s.get('hddShotId') or f"{canonical_chassis}_{shot_serial}"
            end_formatted = format_time_display(end_raw)
            end_display = end_formatted if end_formatted else 'WIP'

            raw_shots.append({
                'date': shot_date,
                'circle': circle,
                'district': district,
                'block': block,
                'machine_id': machine_code,
                'machine_pk': machine_pk,
                'machine_name': machine_name,
                'chassis_number': canonical_chassis,
                'shot_id': shot_id,
                'shot_serial': shot_serial,
                'start_time': format_time_display(start_raw),
                'start_time_raw': start_raw,
                'end_time': end_display,
                'end_time_raw': end_raw,
                'shot_meters': meters,
                'vendor_id': vendor_id,
                'vendor_name': vendor_name,
                '_task_id': task_id,
            })

    # Group by (machine, date) to compute daily totals
    daily_stats = defaultdict(lambda: {'count': 0, 'meters': 0.0, 'machine_info': {}})
    for s in raw_shots:
        k = (s['chassis_number'], s['date'])
        daily_stats[k]['count'] += 1
        daily_stats[k]['meters'] += s['shot_meters']
        daily_stats[k]['machine_info'] = {
            'circle': s.get('circle', ''),
            'district': s.get('district', ''),
            'block': s.get('block', ''),
            'machine_id': s['machine_id'],
            'machine_pk': s['machine_pk'],
            'machine_name': s['machine_name'],
            'chassis_number': s['chassis_number'],
            'vendor_id': s['vendor_id'],
            'vendor_name': s['vendor_name'],
        }

    # Group by machine to assign sequential Shot Number (chronologically sorted)
    machine_shots = defaultdict(list)
    for s in raw_shots:
        machine_shots[s['chassis_number']].append(s)

    final_shots = []
    for chassis, m_list in machine_shots.items():
        # Sort chronologically by date ascending, then start_time
        m_list.sort(key=lambda x: (x['date'], str(x['start_time_raw']), x['shot_serial']))
        for seq_idx, s in enumerate(m_list, start=1):
            k = (s['chassis_number'], s['date'])
            s['shot_number'] = seq_idx
            s['daily_total_meters'] = round(daily_stats[k]['meters'], 2)
            s['daily_shot_count'] = daily_stats[k]['count']
            final_shots.append(s)

    # Sort final shots descending by date, then chassis, then shot_number descending
    final_shots.sort(key=lambda x: (x['date'], x['chassis_number'], x['shot_number']), reverse=True)

    # Compile Daily Summary list
    daily_summary_list = []
    for (chassis, d_date), data in sorted(daily_stats.items(), key=lambda item: (item[0][1], item[0][0]), reverse=True):
        m_info = data['machine_info']
        daily_summary_list.append({
            'date': d_date,
            'circle': m_info.get('circle', ''),
            'district': m_info.get('district', ''),
            'block': m_info.get('block', ''),
            'machine_id': m_info.get('machine_id'),
            'machine_pk': m_info.get('machine_pk'),
            'machine_name': m_info.get('machine_name'),
            'chassis_number': chassis,
            'vendor_id': m_info.get('vendor_id'),
            'vendor_name': m_info.get('vendor_name'),
            'daily_shot_count': data['count'],
            'daily_total_meters': round(data['meters'], 2)
        })

    # Overall Summary
    total_meters = round(sum(s['shot_meters'] for s in final_shots), 2)
    min_date = min((s['date'] for s in final_shots), default=None)
    max_date = max((s['date'] for s in final_shots), default=None)

    dataset = {
        'shots': final_shots,
        'daily_summary': daily_summary_list,
        'filter_options': {
            'machines': sorted(list(unique_machines.values()), key=lambda x: x['machine_name']),
            'vendors': sorted(list(unique_vendors.values()), key=lambda x: str(x['name'])),
            'circles': sorted(list({s['circle'] for s in final_shots if s['circle']})),
            'districts': sorted(list({s['district'] for s in final_shots if s['district']})),
            'blocks': sorted(list({s['block'] for s in final_shots if s['block']}))
        },
        'overall_summary': {
            'total_shots': len(final_shots),
            'total_meters': total_meters,
            'total_machines': len(unique_machines),
            'date_range': {'start': min_date, 'end': max_date}
        }
    }

    ttl_set(CACHE_KEY_SHOTS, dataset, ttl_seconds=CACHE_TTL_SHOTS)
    return dataset


def get_hdd_shot_report_data(
    start_date=None,
    end_date=None,
    chassis_number=None,
    machine_id=None,
    vendor_id=None,
    circle=None,
    district=None,
    block=None,
    today_only=False,
    page=1,
    page_size=25,
    force_refresh=False
):
    """
    Applies filters (including circle, district, block, today_only),
    builds daily aggregation for the filtered slice,
    and paginates individual shot records.
    """
    today_str = datetime.now().strftime('%Y-%m-%d')

    # If today_only is requested and no explicit date range was provided, override date range to today's date
    if today_only and not start_date and not end_date:
        start_date = today_str
        end_date = today_str

    # 1. Normalize dates
    norm_start = None
    if start_date:
        norm_start = normalize_date_input(start_date)
        if not norm_start:
            raise ValueError(f"Invalid start_date parameter: '{start_date}'. Expected format YYYY-MM-DD or DD-MM-YYYY.")

    norm_end = None
    if end_date:
        norm_end = normalize_date_input(end_date)
        if not norm_end:
            raise ValueError(f"Invalid end_date parameter: '{end_date}'. Expected format YYYY-MM-DD or DD-MM-YYYY.")

    if norm_start and norm_end and norm_start > norm_end:
        raise ValueError(f"start_date ({norm_start}) cannot be after end_date ({norm_end}).")

    # 2. Get dataset
    dataset = build_all_hdd_shot_records(force_refresh=force_refresh)
    shots = dataset['shots']

    # 3. Filtering
    filtered = []
    all_matching_non_date = []
    today_matching = []

    chassis_query = str(chassis_number or '').strip().lower()
    machine_query = str(machine_id or '').strip().lower()
    vendor_query = str(vendor_id or '').strip().lower()
    circle_query = str(circle or '').strip().lower()
    district_query = str(district or '').strip().lower()
    block_query = str(block or '').strip().lower()

    # Determine effective today from active fleet records
    effective_today = today_str if any(s.get('date') == today_str for s in shots) else (max((s['date'] for s in shots), default=today_str))

    for s in shots:
        if chassis_query:
            c_val = str(s['chassis_number']).lower()
            if chassis_query != c_val and chassis_query not in c_val:
                continue

        if machine_query:
            m_id = str(s.get('machine_id') or '').lower()
            m_pk = str(s.get('machine_pk') or '').lower()
            m_name = str(s.get('machine_name') or '').lower()
            if machine_query != m_id and machine_query != m_pk and machine_query not in m_name:
                continue

        if vendor_query:
            v_id = str(s.get('vendor_id') or '').lower()
            v_name = str(s.get('vendor_name') or '').lower()
            if vendor_query != v_id and vendor_query != v_name and vendor_query not in v_name:
                continue

        if circle_query:
            s_circ = str(s.get('circle') or '').lower()
            if circle_query != s_circ and circle_query not in s_circ:
                continue

        if district_query:
            s_dist = str(s.get('district') or '').lower()
            if district_query != s_dist and district_query not in s_dist:
                continue

        if block_query:
            s_blk = str(s.get('block') or '').lower()
            if block_query != s_blk and block_query not in s_blk:
                continue

        all_matching_non_date.append(s)

        s_date = s['date']
        if s_date == effective_today:
            today_matching.append(s)

        if norm_start and s_date < norm_start:
            continue
        if norm_end and s_date > norm_end:
            continue

        filtered.append(s)

    # 4. Filtered summary and daily aggregation
    filtered_daily_map = defaultdict(lambda: {'count': 0, 'meters': 0.0, 'info': {}})
    for s in filtered:
        k = (s['chassis_number'], s['date'])
        filtered_daily_map[k]['count'] += 1
        filtered_daily_map[k]['meters'] += s['shot_meters']
        filtered_daily_map[k]['info'] = {
            'date': s['date'],
            'circle': s.get('circle', ''),
            'district': s.get('district', ''),
            'block': s.get('block', ''),
            'machine_id': s['machine_id'],
            'machine_pk': s['machine_pk'],
            'machine_name': s['machine_name'],
            'chassis_number': s['chassis_number'],
            'vendor_id': s['vendor_id'],
            'vendor_name': s['vendor_name'],
        }

    filtered_daily_summary = []
    for k, d in sorted(filtered_daily_map.items(), key=lambda item: (item[0][1], item[0][0]), reverse=True):
        info = d['info']
        filtered_daily_summary.append({
            'date': info['date'],
            'circle': info.get('circle', ''),
            'district': info.get('district', ''),
            'block': info.get('block', ''),
            'machine_id': info['machine_id'],
            'machine_pk': info['machine_pk'],
            'machine_name': info['machine_name'],
            'chassis_number': info['chassis_number'],
            'vendor_id': info['vendor_id'],
            'vendor_name': info['vendor_name'],
            'daily_shot_count': d['count'],
            'daily_total_meters': round(d['meters'], 2)
        })

    total_records = len(filtered)
    total_meters = round(sum(s['shot_meters'] for s in filtered), 2)
    machines_matched = len(set(s['chassis_number'] for s in filtered))

    today_records = today_matching

    # 5. Pagination
    try:
        p = max(1, int(page))
    except (ValueError, TypeError):
        p = 1

    try:
        ps = int(page_size)
    except (ValueError, TypeError):
        ps = 25

    if ps > 0:
        total_pages = (total_records + ps - 1) // ps if total_records > 0 else 1
        start_idx = (p - 1) * ps
        end_idx = start_idx + ps
        paginated_records = filtered[start_idx:end_idx]
    else:
        # ps == 0 means unpaginated (all records)
        p = 1
        total_pages = 1
        paginated_records = filtered

    is_today_view = bool(today_only and not (start_date and norm_start != today_str) and not norm_end != today_str)

    return {
        'results': paginated_records,
        'all_filtered_records': filtered,
        'today_records': today_records,
        'effective_today': effective_today,
        'pagination': {
            'page': p,
            'page_size': ps,
            'total_records': total_records,
            'total_pages': total_pages
        },
        'summary': {
            'total_shots': len(all_matching_non_date) if today_only else total_records,
            'total_filtered_shots': total_records,
            'total_meters': total_meters,
            'total_machines': machines_matched,
            'today_shots_count': len(today_records),
            'today_meters': round(sum(s['shot_meters'] for s in today_records), 2),
            'total_historical_shots': len(all_matching_non_date),
            'date_range': {
                'start': norm_start or (min((s['date'] for s in filtered), default=None)),
                'end': norm_end or (max((s['date'] for s in filtered), default=None))
            }
        },
        'daily_summary': filtered_daily_summary,
        'filter_options': dataset['filter_options']
    }
