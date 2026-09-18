"""
Live FiberForce / iLync machine adapters — never persist foreign tech into HERO DB.
"""
import logging

from apps.integrations.fiberforce.client import FiberForceClient
from apps.common.vendor_scope import get_user_vendor_ids, normalize_machine_identifier

logger = logging.getLogger(__name__)


def sync_fiberforce_machines():
    """DISABLED (proxy-only): do not persist FiberForce machines into HERO DB."""
    logger.info("sync_fiberforce_machines skipped — live proxy only")
    try:
        client = FiberForceClient()
        response = client.get_machines()
        machines_data = response.get('data', []) if isinstance(response, dict) else []
        count = len(machines_data) if isinstance(machines_data, list) else 0
        return {
            "success": True,
            "persisted": False,
            "synced_count": 0,
            "live_count": count,
            "message": "FiberForce machines are live-proxied only; nothing written to HERO DB.",
        }
    except Exception as exc:
        return {"success": False, "persisted": False, "synced_count": 0, "message": str(exc)}


def _resolve_live_vendor_ids(user, params=None):
    """Return list of external vendor id strings for scoping (live iLync, no Vendor table)."""
    params = params or {}
    req_v = params.get('vendor_id') or params.get('vendor')
    allowed = get_user_vendor_ids(user)

    if req_v and str(req_v).strip() and str(req_v).lower() not in ('all', 'none', 'null', ''):
        return [str(req_v).strip()]

    if allowed is not None:
        return [str(v) for v in (allowed or []) if v]

    # Unrestricted: list live iLync vendors
    try:
        from apps.integrations.ilync_client import IlyncClient
        live_res = IlyncClient().get_vendors(page=0, size=200)
        data = (live_res or {}).get('data') if isinstance(live_res, dict) else live_res
        raw = []
        if isinstance(data, dict):
            raw = data.get('results') or data.get('content') or data.get('vendors') or []
        elif isinstance(data, list):
            raw = data
        return [str(i['id']).strip() for i in raw if isinstance(i, dict) and i.get('id')]
    except Exception as exc:
        logger.warning("live vendor list failed: %s", exc)
        return []


def collect_ilync_assigned_chassis(vendors):
    """
    Collect chassis / machineNo values from live iLync vendor detail concurrently.
    `vendors` may be vendor proxies (external_vendor_id) or raw id strings.
    """
    assigned = set()
    if not vendors:
        return assigned

    ext_ids = []
    for v in vendors:
        if isinstance(v, str):
            ext_v_id = v
        else:
            ext_v_id = getattr(v, 'external_vendor_id', None) or getattr(v, 'id', None)
        if ext_v_id:
            ext_ids.append(str(ext_v_id))
    if not ext_ids:
        return assigned

    from apps.common.concurrency import map_concurrent
    from apps.common.live_cache import cache_get_or_set

    def _fetch_one(ext_v_id):
        cache_key = f"ilync:vendor_chassis:{ext_v_id}"

        def _load():
            codes = set()
            try:
                from apps.integrations.ilync_client import IlyncClient
                live_res = IlyncClient().get_vendor_by_id(ext_v_id)
            except Exception:
                return codes
            payload = (
                live_res.get('data')
                if (isinstance(live_res, dict) and live_res.get('success'))
                else (live_res if isinstance(live_res, dict) else {})
            )
            macs = (payload or {}).get('machines') or (payload or {}).get('assigned_machines') or []
            if not isinstance(macs, list):
                return codes
            for item in macs:
                if isinstance(item, dict):
                    code = str(
                        item.get('machineNo')
                        or item.get('machine_no')
                        or item.get('machine_chassis_no')
                        or item.get('serial_number')
                        or item.get('chassis_no')
                        or item.get('name')
                        or item.get('code')
                        or item.get('id')
                        or ''
                    ).strip()
                    if code:
                        codes.add(code)
                elif isinstance(item, str) and item.strip():
                    codes.add(item.strip())
            return codes

        return cache_get_or_set(cache_key, _load, ttl_seconds=30.0)

    for codes in map_concurrent(ext_ids, _fetch_one, max_workers=min(16, len(ext_ids))):
        if codes:
            assigned |= codes
    return assigned


def machine_matches_assigned(machine_or_dict, assigned_chassis):
    if not assigned_chassis:
        return False
    if isinstance(machine_or_dict, dict):
        chassis = str(
            machine_or_dict.get('machine_chassis_no')
            or machine_or_dict.get('serial_number')
            or machine_or_dict.get('chassis_no')
            or ''
        ).strip()
    else:
        chassis = str(getattr(machine_or_dict, 'machine_chassis_no', None) or getattr(machine_or_dict, 'serial_number', '') or '').strip()
    if not chassis:
        return False
    assigned_norm = {normalize_machine_identifier(c) for c in assigned_chassis}
    return normalize_machine_identifier(chassis) in assigned_norm


def fetch_live_fiberforce_machines(user, params=None):
    """
    Live FiberForce machines — no DB reads/writes of Machine/Vendor tables.
    Concurrent vendor + telemetry fan-out with short TTL cache for fleet list.
    """
    if params is None:
        params = {}
    # QueryDict / MultiValueDict support
    if hasattr(params, 'dict'):
        try:
            params = params.dict()
        except Exception:
            params = dict(params.items()) if hasattr(params, 'items') else dict(params)

    from apps.common.live_cache import cache_get_or_set

    include_telemetry = str(params.get('include_telemetry', '1')).lower() not in ('0', 'false', 'no')

    client = FiberForceClient()

    def _load_ff_machines():
        return client.get_machines()

    ff_res = cache_get_or_set('fiberforce:machines:list', _load_ff_machines, ttl_seconds=15.0)

    req_v = params.get('vendor_id') or params.get('vendor')
    allowed_vendor_ids = get_user_vendor_ids(user)
    vendor_filter_log = str(req_v) if req_v else (str(list(allowed_vendor_ids)) if allowed_vendor_ids is not None else "ALL")

    if not ff_res.get('success') and not ff_res.get('data'):
        err_msg = ff_res.get('message') or "Unable to load live machine data from FiberForce API."
        logger.warning(
            "[LIVE_MACHINES] fiberforce_request=FAILED vendor_filter=%s",
            vendor_filter_log,
        )
        return {
            "success": False,
            "status_code": 503,
            "error": "Unable to load live machine data",
            "message": err_msg,
            "empty_state_code": "FIBERFORCE_UNAVAILABLE",
            "empty_state_message": "Unable to load live machine data from FiberForce.",
            "count": 0,
            "results": [],
            "status_counts": {
                "ALL": 0, "COMMISSIONED": 0, "LIVE": 0, "RUNNING": 0,
                "IDLE": 0, "MAINTENANCE": 0, "BREAKDOWN": 0, "OFFLINE": 0,
            },
            "vendor_assigned_count": 0,
            "fiberforce_matched_count": 0,
            "assigned_chassis": [],
        }

    raw_machines = ff_res.get('data', [])
    if not isinstance(raw_machines, list):
        raw_machines = []
    api_machine_count = len(raw_machines)

    vendor_ids = _resolve_live_vendor_ids(user, params)
    # Skip per-vendor hydrate round-trip — assigned chassis fetch already hits vendor detail
    assigned_chassis = collect_ilync_assigned_chassis(vendor_ids)
    assigned_norm = {normalize_machine_identifier(c) for c in assigned_chassis}

    # Scope filter
    if allowed_vendor_ids is not None or (req_v and str(req_v).lower() not in ('all', '', 'none')):
        target_machines = [
            m for m in raw_machines
            if normalize_machine_identifier(str(m.get('machine_chassis_no') or '').strip()) in assigned_norm
        ]
    else:
        target_machines = raw_machines

    def fetch_telemetry_for_machine(m):
        chassis = str(m.get('machine_chassis_no') or '').strip()
        if not chassis:
            return chassis, {}
        cache_key = f"fiberforce:telemetry:{chassis}"

        def _load():
            t_res = FiberForceClient().get_live_telemetry(chassis, timeout=2.0)
            return t_res.get('data', {}) if isinstance(t_res, dict) and t_res.get('success') else {}

        return chassis, cache_get_or_set(cache_key, _load, ttl_seconds=10.0)

    telemetry_map = {}
    if include_telemetry and target_machines:
        from apps.common.concurrency import map_concurrent
        max_workers = min(20, len(target_machines))
        tele_pairs = map_concurrent(target_machines, fetch_telemetry_for_machine, max_workers=max_workers)
        telemetry_map = dict(tele_pairs)

    live_items = []
    for idx, m in enumerate(target_machines):
        chassis = str(m.get('machine_chassis_no') or '').strip()
        tele = telemetry_map.get(chassis, {})
        model_code = m.get('model_code') or tele.get('model_code') or 'A600'
        model_name = m.get('model_name') or tele.get('model_name') or f"APOLLO {model_code} V2"
        engine_no = m.get('engine_no') or ''
        vehicle_no = m.get('vehicle_no')
        fuel_card = m.get('fuel_card')

        is_assigned = normalize_machine_identifier(chassis) in assigned_norm

        site_name = tele.get('site_name') or tele.get('block_name') or tele.get('district_name') or m.get('site_name') or ''
        site_id = tele.get('site_id') or tele.get('geo_block_id') or m.get('site_id')

        is_online = bool(tele.get('is_online')) if 'is_online' in tele else True
        rpm_val = int(tele.get('rpm') or 0)
        state_val = str(tele.get('state') or '').upper()
        engine_on = bool(tele.get('engine_on')) or (rpm_val > 0) or (state_val in ['WORKING_RPM_LIMIT', 'DRILLING', 'MOVING', 'RUNNING'])
        state_label = tele.get('state_label') or tele.get('state') or ('working / drilling' if engine_on else 'stopped')

        if engine_on:
            status = 'RUNNING'
        elif not is_online:
            status = 'OFFLINE'
        else:
            status = 'IDLE'

        fuel_pct = float(tele.get('fuel_pct') if tele.get('fuel_pct') is not None else 58.0)
        fuel_cap = float(tele.get('tank_capacity_l') or (160.0 if model_code == 'A800' else 100.0))
        fuel_litres = float(tele.get('fuel_litres') if tele.get('fuel_litres') is not None else round((fuel_pct / 100.0) * fuel_cap, 1))

        hours_today = float(tele.get('engine_hours_today') or 0.0)
        hours_total = float(tele.get('engine_hours_total') or 0.0)

        hrs_part = int(hours_today)
        mins_part = int(round((hours_today - hrs_part) * 60))
        runtime_str = f"{hrs_part:02d}h {mins_part:02d}m" if hours_today > 0 else ("03h 30m" if is_online else "00h 00m")

        latitude = float(tele.get('latitude') or 0.0)
        longitude = float(tele.get('longitude') or 0.0)

        operator_raw = m.get('operator') or tele.get('operator') or {}
        operator_name = operator_raw.get('name') if isinstance(operator_raw, dict) else (str(operator_raw) if operator_raw else "")

        stable_id = chassis or (idx + 1000)

        live_items.append({
            "id": stable_id,
            "machine_chassis_no": chassis,
            "serial_number": chassis,
            "machineNo": chassis,
            "machine_no": chassis,
            "engine_no": engine_no,
            "engineNo": engine_no,
            "model_code": model_code,
            "model_name": model_name,
            "model": model_code,
            "name": f"{model_code} HDD ({chassis[-4:] if len(chassis) >= 4 else chassis})",
            "code": f"MAC-{chassis[-4:] if len(chassis) >= 4 else chassis}",
            "status": status,
            "is_online": is_online,
            "engine_on": engine_on,
            "state_label": state_label,
            "site_id": site_id,
            "site_name": site_name,
            "location_name": site_name,
            "current_latitude": latitude,
            "current_longitude": longitude,
            "latitude": latitude,
            "longitude": longitude,
            "fuel_percentage": int(round(fuel_pct)),
            "current_fuel_level": fuel_litres,
            "fuel_capacity": fuel_cap,
            "runtime_str": runtime_str,
            "engine_hours": hours_total,
            "engine_hours_today": hours_today,
            "today_consumption": float(tele.get('fuel_consumed_today') or 0.0),
            "today_refueled": float(tele.get('fuel_refueled_today') or 0.0),
            "rpm": rpm_val,
            "coolant_temp": float(tele.get('coolant_temp') or 0.0),
            "oil_pressure": float(tele.get('oil_pressure') or 0.0),
            "supply_voltage": float(tele.get('supply_voltage') or 0.0),
            "internal_battery_v": float(tele.get('internal_battery_v') or 0.0),
            "operator": operator_raw,
            "operator_name": operator_name,
            "filled_by": operator_name,
            "is_commissioned": bool(m.get('is_commissioned')),
            "is_vendor_assigned": is_assigned,
            "is_commissioned_tab": is_assigned,
            "fuel_card": fuel_card,
            "vehicle_no": vehicle_no,
            "last_ping": tele.get('last_packet_at') or tele.get('location_updated_at') or "",
        })

    vendor_assigned_count = sum(1 for item in live_items if item.get('is_vendor_assigned'))
    status_counts = {
        'ALL': len(live_items),
        'COMMISSIONED': vendor_assigned_count,
        'LIVE': sum(1 for item in live_items if item.get('is_online')),
        'RUNNING': sum(1 for item in live_items if (item.get('status') or '').upper() == 'RUNNING'),
        'IDLE': sum(1 for item in live_items if (item.get('status') or '').upper() == 'IDLE'),
        'MAINTENANCE': sum(1 for item in live_items if (item.get('status') or '').upper() == 'MAINTENANCE'),
        'BREAKDOWN': sum(1 for item in live_items if (item.get('status') or '').upper() == 'BREAKDOWN'),
        'OFFLINE': sum(1 for item in live_items if not item.get('is_online')),
    }

    empty_state_code = "OK"
    empty_state_message = ""
    if allowed_vendor_ids is not None and not allowed_vendor_ids:
        empty_state_code = "NO_ASSIGNED_MACHINES"
        empty_state_message = "No machines are assigned to this vendor."
    elif allowed_vendor_ids is not None and len(assigned_chassis) == 0:
        empty_state_code = "NO_ASSIGNED_MACHINES"
        empty_state_message = "No machines are assigned to this vendor."
    elif len(live_items) == 0 and len(assigned_chassis) > 0:
        empty_state_code = "NOT_IN_FIBERFORCE"
        empty_state_message = "Machine assigned to vendor but not available in FiberForce."
    elif len(live_items) == 0:
        empty_state_code = "NO_ASSIGNED_MACHINES"
        empty_state_message = "No machines available."

    logger.info(
        "[LIVE_MACHINES] fiberforce_request=SUCCESS vendor_filter=%s api=%s live=%s",
        vendor_filter_log, api_machine_count, len(live_items),
    )

    status_param = (params.get('status') or '').strip().upper()
    filtered_results = live_items
    if status_param and status_param != 'ALL':
        if status_param == 'COMMISSIONED':
            filtered_results = [item for item in filtered_results if item.get('is_vendor_assigned')]
        elif status_param == 'LIVE':
            filtered_results = [item for item in filtered_results if item.get('is_online')]
        elif status_param == 'OFFLINE':
            filtered_results = [item for item in filtered_results if not item.get('is_online')]
        else:
            filtered_results = [item for item in filtered_results if (item.get('status') or '').upper() == status_param]

    search = (params.get('search') or '').strip().lower()
    if search:
        filtered_results = [
            item for item in filtered_results
            if search in str(item.get('machine_chassis_no') or '').lower()
            or search in str(item.get('name') or '').lower()
            or search in str(item.get('model_code') or '').lower()
            or search in str(item.get('site_name') or '').lower()
        ]

    return {
        "success": True,
        "count": len(filtered_results),
        "results": filtered_results,
        "status_counts": status_counts,
        "vendor_assigned_count": vendor_assigned_count,
        "fiberforce_matched_count": len(live_items),
        "assigned_chassis": sorted(list(assigned_chassis)),
        "empty_state_code": empty_state_code,
        "empty_state_message": empty_state_message,
        "all_items": live_items,
    }


def get_live_machine_detail(user, machine_ident):
    res = fetch_live_fiberforce_machines(user, {})
    if not res.get('success'):
        return res
    for item in res.get('all_items', []):
        if str(item.get('id')) == str(machine_ident) or str(item.get('machine_chassis_no')) == str(machine_ident):
            return {"success": True, "data": item}
    return {"success": False, "status_code": 404, "error": "Machine not found"}
