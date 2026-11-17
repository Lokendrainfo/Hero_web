"""
HERO Web Change Control Notice (CCN) Management & Synchronization Service.
Enables HERO-native CCN creation, management, and authorized read-only
synchronization from NetInfra / iLync without modifying upstream systems.
Strictly adheres to: com.netinfra.platform.task.dao.entities.survey.CcnTaskData
"""
import logging
from datetime import datetime, date
from django.utils import timezone
from apps.tasks.models import Ccn
from apps.tasks.serializers import normalize_survey_photo
from apps.integrations.ilync_client import IlyncClient
from apps.integrations.exceptions import IlyncAuthException

logger = logging.getLogger(__name__)


def safe_float(val, default=None):
    if val is None or val == '':
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def parse_date(date_val):
    if not date_val:
        return None
    if isinstance(date_val, (date, datetime)):
        return date_val.date() if isinstance(date_val, datetime) else date_val
    try:
        s = str(date_val).strip()
        if 'T' in s:
            s = s.split('T')[0]
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def map_upstream_status(status_str):
    if not status_str:
        return 'OPEN'
    s = str(status_str).strip().upper()
    mapping = {
        'DRAFT': 'DRAFT',
        'SUBMITTED': 'PENDING_APPROVAL',
        'NEEDS_APPROVAL': 'PENDING_APPROVAL',
        'PENDING': 'PENDING_APPROVAL',
        'PENDING_APPROVAL': 'PENDING_APPROVAL',
        'OPEN': 'OPEN',
        'IN_PROGRESS': 'IN_PROGRESS',
        'APPROVED': 'APPROVED',
        'IN_REVIEW': 'IN_REVIEW',
        'REJECTED': 'REJECTED',
        'ESCALATED': 'ESCALATED',
        'COMPLETED': 'RESOLVED',
        'RESOLVED': 'RESOLVED',
        'CLEARED': 'RESOLVED',
    }
    return mapping.get(s, 'OPEN')


def map_upstream_severity(severity_str):
    if not severity_str:
        return 'MEDIUM'
    s = str(severity_str).strip().upper()
    if s in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
        return s
    return 'MEDIUM'


def sync_ilync_ccn(user=None):
    """
    Synchronizes CCN tasks from NetInfra/iLync into HERO Web.
    Read-only integration respecting all security and duplicate-prevention rules:
    - Never writes to or modifies Net Infra/iLync.
    - Uses unique combination (source_system, external_task_id) to prevent duplicates.
    - Preserves locally updated HERO records from overwrite.
    - Populates exact Java dual-state structures: proposedCcn & approvedCcn.
    """
    client = IlyncClient()
    stats = {
        "success": True,
        "total_upstream": 0,
        "imported": 0,
        "updated": 0,
        "skipped": 0,
        "errors": []
    }

    try:
        res = client.get("api/tasks/my-tasks", params={"taskType": "CCN", "page": 0, "size": 100})
    except IlyncAuthException as auth_exc:
        logger.warning("[CCN_SYNC] NetInfra authentication not available: %s", auth_exc)
        return {
            "success": False,
            "message": "NetInfra / iLync service authentication expired or not configured.",
            "total_upstream": 0,
            "imported": 0,
            "updated": 0,
            "skipped": 0
        }
    except Exception as exc:
        logger.error("[CCN_SYNC] Error fetching tasks from NetInfra: %s", exc)
        return {
            "success": False,
            "message": f"Failed to connect to NetInfra API: {str(exc)}",
            "total_upstream": 0,
            "imported": 0,
            "updated": 0,
            "skipped": 0
        }

    raw_data = res.get('data') if isinstance(res, dict) else None
    task_items = []
    if isinstance(raw_data, dict):
        task_items = raw_data.get('content') or raw_data.get('results') or []
    elif isinstance(raw_data, list):
        task_items = raw_data

    stats["total_upstream"] = len(task_items)
    if not task_items:
        return {
            "success": True,
            "message": "Sync completed. No external CCN tasks found in NetInfra scope.",
            "total_upstream": 0,
            "imported": 0,
            "updated": 0,
            "skipped": 0
        }

    for task in task_items:
        if not isinstance(task, dict):
            continue

        task_id = str(task.get('id') or '').strip()
        if not task_id:
            continue

        task_code = str(task.get('taskCode') or task.get('code') or '').strip()
        display_name = task.get('displayName') or task.get('title') or f"CCN {task_code}"

        # Duplicate Prevention: Check existing record by external_task_id
        existing = Ccn.objects.filter(source_system__in=['NetInfra', 'ILYNC'], external_task_id=task_id).first()
        if not existing and task_code:
            existing = Ccn.objects.filter(source_system__in=['NetInfra', 'ILYNC'], external_ccn_id=task_code).first()

        # Overwrite Protection
        if existing and existing.sync_status == 'LOCAL':
            stats["skipped"] += 1
            continue

        # Fetch Execution Details for proposedCcn & approvedCcn payloads
        execution_data = {}
        try:
            exec_res = client.get_task_execution(task_id)
            if isinstance(exec_res, dict) and exec_res.get('data'):
                execution_data = exec_res['data']
        except Exception as exec_err:
            logger.warning("[CCN_SYNC] Could not fetch execution for task %s: %s", task_id, exec_err)

        field_data = execution_data.get('fieldData') or {}
        proposed = field_data.get('proposedCcn') or {}
        approved = field_data.get('approvedCcn')

        if not proposed:
            proposed = field_data

        # Location snapshot
        loc_snapshot = task.get('locationSnapshot') or {}
        circle = loc_snapshot.get('circleName') or loc_snapshot.get('circle') or ''
        district = loc_snapshot.get('districtName') or loc_snapshot.get('district') or ''
        block = loc_snapshot.get('blockName') or loc_snapshot.get('block') or ''
        section = loc_snapshot.get('gpName') or loc_snapshot.get('routeName') or field_data.get('section') or ''
        location_name = field_data.get('location') or loc_snapshot.get('name') or ''

        # Chainage
        ch_from = str(proposed.get('chainageFrom') or field_data.get('chainageFrom') or '').strip()
        ch_to = str(proposed.get('chainageTo') or field_data.get('chainageTo') or '').strip()
        chainage_str = f"CH {ch_from} to {ch_to}" if (ch_from and ch_to) else (ch_from or ch_to or '')

        # Classification
        subtype1 = proposed.get('subtype1') or proposed.get('ccnType') or field_data.get('subtype1') or 'Linear'
        subtype2 = proposed.get('subtype2') or proposed.get('subCcnType') or field_data.get('subtype2') or ''
        severity = map_upstream_severity(proposed.get('severity') or field_data.get('severity') or 'HIGH')
        status = map_upstream_status(task.get('status') or task.get('approvalStatus'))

        # Coordinates
        s_lat = safe_float(proposed.get('sLatitude') or proposed.get('startLatitude') or proposed.get('slatitude') or proposed.get('latitude'))
        s_lng = safe_float(proposed.get('sLongitude') or proposed.get('startLongitude') or proposed.get('slongitude') or proposed.get('longitude'))
        e_lat = safe_float(proposed.get('eLatitude') or proposed.get('endLatitude') or proposed.get('elatitude'))
        e_lng = safe_float(proposed.get('eLongitude') or proposed.get('endLongitude') or proposed.get('elongitude'))
        lat = safe_float(proposed.get('latitude') or field_data.get('latitude')) or s_lat
        lng = safe_float(proposed.get('longitude') or field_data.get('longitude')) or s_lng

        # Route Evidence Media
        start_photo = normalize_survey_photo(proposed.get('startPhoto') or field_data.get('startPhoto'))
        end_photo = normalize_survey_photo(proposed.get('endPhoto') or field_data.get('endPhoto'))
        walkthrough_video = normalize_survey_photo(proposed.get('walkthroughVideo') or field_data.get('walkthroughVideo'))

        def norm_list(raw):
            if not isinstance(raw, list):
                return []
            return [normalize_survey_photo(item) for item in raw if normalize_survey_photo(item)]

        additional_start_photos = norm_list(proposed.get('additionalStartPhotos') or field_data.get('additionalStartPhotos'))[:4]
        additional_route_videos = norm_list(proposed.get('additionalRouteVideos') or field_data.get('additionalRouteVideos'))[:4]
        additional_end_photos = norm_list(proposed.get('additionalEndPhotos') or field_data.get('additionalEndPhotos'))[:10]
        additional_end_videos = norm_list(proposed.get('additionalEndVideos') or field_data.get('additionalEndVideos'))[:2]
        photos = norm_list(proposed.get('photos') or field_data.get('photos'))

        # KML Route File
        kml_type = proposed.get('kmlType') or field_data.get('kmlType') or 'UPLOADED'
        kml_file = normalize_survey_photo(proposed.get('kmlFile') or field_data.get('kmlFile'))
        kml_file_name = proposed.get('kmlFileName') or field_data.get('kmlFileName') or (kml_file.get('fileName') if isinstance(kml_file, dict) else '')
        kml_file_key = proposed.get('kmlFileKey') or field_data.get('kmlFileKey') or (kml_file.get('key') if isinstance(kml_file, dict) else '')
        kml_content = proposed.get('kmlContent') or field_data.get('kmlContent') or ''

        # Dates
        logged_date = parse_date(task.get('createdAt') or task.get('submittedAt')) or timezone.now().date()
        target_date = parse_date(task.get('dueDate'))

        # Details, Description & Remarks
        ccn_details = proposed.get('ccnDetails') or proposed.get('details') or proposed.get('description') or task.get('description') or ''
        description = proposed.get('description') or ccn_details
        remarks = field_data.get('remarks') or proposed.get('remarks') or task.get('remarks') or ''
        mitigation = proposed.get('mitigation') or field_data.get('mitigation') or remarks

        external_c_id = (
            proposed.get('ccnId') or
            field_data.get('ccnId') or
            task_code or
            task_id
        )
        local_c_id = f"CCN-NET-{task_code or task_id[:8]}"

        canonical_proposed = {
            "ccnId": external_c_id,
            "ccnDetails": ccn_details,
            "description": description,
            "subtype1": subtype1,
            "subtype2": subtype2,
            "status": status,
            "remarks": remarks,
            "sLatitude": s_lat,
            "sLongitude": s_lng,
            "eLatitude": e_lat,
            "eLongitude": e_lng,
            "startPhoto": start_photo or {},
            "additionalStartPhotos": additional_start_photos,
            "walkthroughVideo": walkthrough_video or {},
            "additionalRouteVideos": additional_route_videos,
            "endPhoto": end_photo or {},
            "additionalEndPhotos": additional_end_photos,
            "additionalEndVideos": additional_end_videos,
            "kmlType": kml_type,
            "kmlFile": kml_file or {},
            "kmlFileName": kml_file_name or "",
            "kmlFileKey": kml_file_key or "",
            "kmlContent": kml_content or "",
            "photos": photos,
        }

        defaults = {
            "title": display_name,
            "subtype1": subtype1,
            "subtype2": subtype2,
            "severity": severity,
            "status": status,
            "circle": circle,
            "district": district,
            "block": block,
            "section": section,
            "location": location_name,
            "chainage": chainage_str,
            "chainage_from": ch_from,
            "chainage_to": ch_to,
            "latitude": lat,
            "longitude": lng,
            "s_latitude": s_lat,
            "s_longitude": s_lng,
            "e_latitude": e_lat,
            "e_longitude": e_lng,
            "ccn_details": ccn_details,
            "description": description,
            "mitigation": mitigation,
            "remarks": remarks,
            "contractor": task.get('vendorId') or "NetInfra CCN Contractor",
            "department": proposed.get('department') or "Change Control Board",
            "logged_date": logged_date,
            "target_date": target_date,
            "start_photo": start_photo or {},
            "additional_start_photos": additional_start_photos,
            "walkthrough_video": walkthrough_video or {},
            "additional_route_videos": additional_route_videos,
            "end_photo": end_photo or {},
            "additional_end_photos": additional_end_photos,
            "additional_end_videos": additional_end_videos,
            "photos": photos,
            "kml_type": kml_type,
            "kml_file": kml_file or {},
            "kml_file_name": kml_file_name or "",
            "kml_file_key": kml_file_key or "",
            "kml_content": kml_content or "",
            "proposed_ccn": canonical_proposed,
            "approved_ccn": approved if isinstance(approved, dict) else None,
            "field_data": {
                "surveyKind": "CCN",
                "ccnId": external_c_id,
                "remarks": remarks,
                "proposedCcn": canonical_proposed,
                "approvedCcn": approved if isinstance(approved, dict) else None
            },
            "source_system": 'NetInfra',
            "external_task_id": task_id,
            "external_ccn_id": external_c_id,
            "last_synced_at": timezone.now(),
            "sync_status": 'SYNCED',
            "raw_payload": {"task": task, "execution": execution_data}
        }

        try:
            if existing:
                for k, v in defaults.items():
                    setattr(existing, k, v)
                existing.save()
                stats["updated"] += 1
            else:
                defaults["ccn_id"] = local_c_id
                if Ccn.objects.filter(ccn_id=local_c_id).exists():
                    defaults["ccn_id"] = f"{local_c_id}-{task_id[-4:]}"
                Ccn.objects.create(**defaults)
                stats["imported"] += 1
        except Exception as save_err:
            logger.error("[CCN_SYNC] Error saving CCN for task %s: %s", task_id, save_err)
            stats["errors"].append(str(save_err))

    msg = f"NetInfra CCN sync completed. {stats['imported']} imported, {stats['updated']} updated, {stats['skipped']} skipped."
    stats["message"] = msg
    return stats
