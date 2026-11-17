"""
HERO Web Hindrance Management & Synchronization Service.
Enables HERO-native Hindrance creation, management, and authorized read-only
synchronization from NetInfra / iLync without modifying upstream systems.
Strictly adheres to: com.netinfra.platform.task.dao.entities.survey.HindranceTaskData
"""
import logging
import re
from datetime import datetime, date
from django.utils import timezone
from apps.tasks.models import Hindrance
from apps.tasks.serializers import normalize_survey_photo
from apps.integrations.ilync_client import IlyncClient
from apps.integrations.exceptions import IlyncAPIException, IlyncAuthException

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


def sync_ilync_hindrances(user=None):
    """
    Synchronizes HINDRANCE tasks from NetInfra/iLync into HERO Web.
    Read-only integration respecting all security and duplicate-prevention rules:
    - Never writes to or modifies Net Infra/iLync.
    - Uses unique combination (source_system, external_task_id) to prevent duplicates.
    - Preserves locally updated HERO records from overwrite.
    - Populates exact Java dual-state structures: proposedHindrance & approvedHindrance.
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
        # Fetch HINDRANCE tasks from NetInfra / iLync API
        res = client.get("api/tasks/my-tasks", params={"taskType": "HINDRANCE", "page": 0, "size": 100})
    except IlyncAuthException as auth_exc:
        logger.warning("[HINDRANCE_SYNC] NetInfra authentication not available: %s", auth_exc)
        return {
            "success": False,
            "message": "NetInfra / iLync service authentication expired or not configured.",
            "total_upstream": 0,
            "imported": 0,
            "updated": 0,
            "skipped": 0
        }
    except Exception as exc:
        logger.error("[HINDRANCE_SYNC] Error fetching tasks from NetInfra: %s", exc)
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
            "message": "Sync completed. No external hindrance tasks found in NetInfra scope.",
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
        display_name = task.get('displayName') or task.get('title') or f"Hindrance {task_code}"

        # Duplicate Prevention: Check existing record by external_task_id
        existing = Hindrance.objects.filter(source_system__in=['NetInfra', 'ILYNC'], external_task_id=task_id).first()
        if not existing and task_code:
            existing = Hindrance.objects.filter(source_system__in=['NetInfra', 'ILYNC'], external_hindrance_id=task_code).first()

        # Overwrite Protection: If record exists and was updated locally, DO NOT overwrite!
        if existing and existing.sync_status == 'LOCAL':
            stats["skipped"] += 1
            continue

        # Fetch Execution Details for proposedHindrance & approvedHindrance payloads
        execution_data = {}
        try:
            exec_res = client.get_task_execution(task_id)
            if isinstance(exec_res, dict) and exec_res.get('data'):
                execution_data = exec_res['data']
        except Exception as exec_err:
            logger.warning("[HINDRANCE_SYNC] Could not fetch execution for task %s: %s", task_id, exec_err)

        field_data = execution_data.get('fieldData') or {}
        proposed = field_data.get('proposedHindrance') or {}
        approved = field_data.get('approvedHindrance')

        # Fallback if fieldData is flat
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
        hindrance_type = proposed.get('hindranceType') or field_data.get('hindranceType') or proposed.get('category') or 'Linear'
        sub_hindrance_type = proposed.get('subHindranceType') or field_data.get('subHindranceType') or ''
        severity = map_upstream_severity(proposed.get('severity') or field_data.get('severity') or 'HIGH')
        status = map_upstream_status(task.get('status') or task.get('approvalStatus'))

        # Coordinates
        lat = safe_float(proposed.get('latitude') or field_data.get('latitude'))
        lng = safe_float(proposed.get('longitude') or field_data.get('longitude'))
        s_lat = safe_float(proposed.get('sLatitude') or proposed.get('startLatitude') or proposed.get('slatitude'))
        s_lng = safe_float(proposed.get('sLongitude') or proposed.get('startLongitude') or proposed.get('slongitude'))
        e_lat = safe_float(proposed.get('eLatitude') or proposed.get('endLatitude') or proposed.get('elatitude'))
        e_lng = safe_float(proposed.get('eLongitude') or proposed.get('endLongitude') or proposed.get('elongitude'))

        # Media Keys & SurveyPhoto Objects
        start_photo = normalize_survey_photo(proposed.get('startPhoto') or field_data.get('startPhoto') or field_data.get('startPhotoKey'))
        end_photo = normalize_survey_photo(proposed.get('endPhoto') or field_data.get('endPhoto') or field_data.get('endPhotoKey'))
        walkthrough_video = normalize_survey_photo(proposed.get('walkthroughVideo') or field_data.get('walkthroughVideo') or field_data.get('walkthroughVideoKey'))
        photos_raw = proposed.get('photos') or field_data.get('photos') or []
        add_photos_raw = proposed.get('additionalPhotos') or field_data.get('additionalPhotos') or []
        add_videos_raw = proposed.get('additionalVideos') or field_data.get('additionalVideos') or []
        shp_raw = proposed.get('shpFiles') or field_data.get('shpFiles') or []

        photos = [normalize_survey_photo(p) for p in photos_raw if normalize_survey_photo(p)]
        additional_photos = [normalize_survey_photo(p) for p in add_photos_raw if normalize_survey_photo(p)]
        additional_videos = [normalize_survey_photo(v) for v in add_videos_raw if normalize_survey_photo(v)]
        shp_files = shp_raw if isinstance(shp_raw, list) else []

        # Independent Engineer Details
        ie_name = proposed.get('ieName') or field_data.get('ieName') or ''
        ie_phone = proposed.get('iePhoneNumber') or field_data.get('iePhoneNumber') or ''
        ie_needed = bool(proposed.get('iePhotoNeeded') or field_data.get('iePhotoNeeded'))
        ie_photo = normalize_survey_photo(proposed.get('iePhoto') or field_data.get('iePhoto'))

        # Dates
        logged_date = parse_date(task.get('createdAt') or task.get('submittedAt')) or timezone.now().date()
        target_date = parse_date(task.get('dueDate'))

        # Description & Remarks
        description = proposed.get('description') or task.get('description') or ''
        remarks = field_data.get('remarks') or proposed.get('remarks') or task.get('remarks') or ''
        mitigation = proposed.get('mitigation') or field_data.get('mitigation') or remarks

        # External Hindrance Reference
        external_h_id = (
            proposed.get('hindranceId') or
            field_data.get('hindranceId') or
            task_code or
            task_id
        )
        local_h_id = f"HND-NET-{task_code or task_id[:8]}"

        # Canonical proposedHindrance structure
        canonical_proposed = {
            "hindranceId": external_h_id,
            "hindranceType": hindrance_type,
            "subHindranceType": sub_hindrance_type,
            "description": description,
            "status": status,
            "remarks": remarks,
            "latitude": lat,
            "longitude": lng,
            "sLatitude": s_lat,
            "sLongitude": s_lng,
            "eLatitude": e_lat,
            "eLongitude": e_lng,
            "startPhoto": start_photo or {},
            "endPhoto": end_photo or {},
            "walkthroughVideo": walkthrough_video or {},
            "photos": photos,
            "additionalPhotos": additional_photos,
            "additionalVideos": additional_videos,
            "ieName": ie_name,
            "iePhoneNumber": ie_phone,
            "iePhotoNeeded": ie_needed,
            "iePhoto": ie_photo or {},
            "shpFiles": shp_files,
        }

        defaults = {
            "title": display_name,
            "hindrance_type": hindrance_type,
            "sub_hindrance_type": sub_hindrance_type,
            "category": hindrance_type,
            "sub_category": sub_hindrance_type,
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
            "description": description,
            "mitigation": mitigation,
            "remarks": remarks,
            "contractor": task.get('vendorId') or "NetInfra Contractor",
            "department": proposed.get('department') or "Field Operations",
            "logged_date": logged_date,
            "target_date": target_date,
            "start_photo": start_photo or {},
            "end_photo": end_photo or {},
            "walkthrough_video": walkthrough_video or {},
            "photos": photos,
            "additional_photos": additional_photos,
            "additional_videos": additional_videos,
            "ie_name": ie_name,
            "ie_phone_number": ie_phone,
            "ie_photo_needed": ie_needed,
            "ie_photo": ie_photo or {},
            "shp_files": shp_files,
            "proposed_hindrance": canonical_proposed,
            "approved_hindrance": approved if isinstance(approved, dict) else None,
            "field_data": {
                "surveyKind": "HINDRANCE",
                "hindranceId": external_h_id,
                "remarks": remarks,
                "proposedHindrance": canonical_proposed,
                "approvedHindrance": approved if isinstance(approved, dict) else None
            },
            "source_system": 'NetInfra',
            "external_task_id": task_id,
            "external_hindrance_id": external_h_id,
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
                defaults["hindrance_id"] = local_h_id
                # Ensure local hindrance_id uniqueness
                if Hindrance.objects.filter(hindrance_id=local_h_id).exists():
                    defaults["hindrance_id"] = f"{local_h_id}-{task_id[-4:]}"
                Hindrance.objects.create(**defaults)
                stats["imported"] += 1
        except Exception as save_err:
            logger.error("[HINDRANCE_SYNC] Error saving hindrance for task %s: %s", task_id, save_err)
            stats["errors"].append(str(save_err))

    msg = f"NetInfra sync completed. {stats['imported']} imported, {stats['updated']} updated, {stats['skipped']} skipped."
    stats["message"] = msg
    return stats
