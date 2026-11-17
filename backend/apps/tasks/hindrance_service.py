"""
HERO Web Hindrance Management & Synchronization Service.
Enables HERO-native Hindrance creation, management, and authorized read-only
synchronization from iLync/Net Infra without modifying upstream systems.
"""
import logging
import re
from datetime import datetime, date
from django.utils import timezone
from apps.tasks.models import Hindrance
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
        # e.g. "2026-10-12" or "2026-10-12T14:30:00Z"
        s = str(date_val).strip()
        if 'T' in s:
            s = s.split('T')[0]
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def map_ilync_status(status_str):
    if not status_str:
        return 'OPEN'
    s = str(status_str).strip().upper()
    mapping = {
        'SUBMITTED': 'OPEN',
        'PENDING': 'OPEN',
        'OPEN': 'OPEN',
        'IN_PROGRESS': 'IN_PROGRESS',
        'APPROVED': 'IN_PROGRESS',
        'IN_REVIEW': 'IN_REVIEW',
        'REJECTED': 'ESCALATED',
        'ESCALATED': 'ESCALATED',
        'COMPLETED': 'RESOLVED',
        'RESOLVED': 'RESOLVED',
        'CLEARED': 'RESOLVED',
    }
    return mapping.get(s, 'OPEN')


def map_ilync_severity(severity_str):
    if not severity_str:
        return 'MEDIUM'
    s = str(severity_str).strip().upper()
    if s in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
        return s
    return 'MEDIUM'


def sync_ilync_hindrances(user=None):
    """
    Synchronizes HINDRANCE tasks from iLync into HERO Web.
    Read-only integration respecting all security and duplicate-prevention rules:
    - Never writes to or modifies Net Infra/iLync.
    - Uses unique external_task_id matching to prevent duplicates.
    - Preserves locally updated HERO records from overwrite.
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
        # Fetch HINDRANCE tasks from iLync
        res = client.get("api/tasks/my-tasks", params={"taskType": "HINDRANCE", "page": 0, "size": 100})
    except IlyncAuthException as auth_exc:
        logger.warning("[HINDRANCE_SYNC] iLync authentication not available: %s", auth_exc)
        return {
            "success": False,
            "message": "iLync service authentication expired or not configured.",
            "total_upstream": 0,
            "imported": 0,
            "updated": 0,
            "skipped": 0
        }
    except Exception as exc:
        logger.error("[HINDRANCE_SYNC] Error fetching tasks from iLync: %s", exc)
        return {
            "success": False,
            "message": f"Failed to connect to iLync API: {str(exc)}",
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
            "message": "Sync completed. No external hindrance tasks found in iLync scope.",
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

        # Check existing record by external_task_id
        existing = Hindrance.objects.filter(source_system='ILYNC', external_task_id=task_id).first()
        if not existing and task_code:
            existing = Hindrance.objects.filter(source_system='ILYNC', external_hindrance_id=task_code).first()

        # Duplicate & Overwrite Protection:
        # If record exists and was updated locally, DO NOT overwrite with older imported data!
        if existing and existing.sync_status == 'LOCAL':
            stats["skipped"] += 1
            continue

        # Fetch Execution Details for proposedHindrance payload
        execution_data = {}
        try:
            exec_res = client.get_task_execution(task_id)
            if isinstance(exec_res, dict) and exec_res.get('data'):
                execution_data = exec_res['data']
        except Exception as exec_err:
            logger.warning("[HINDRANCE_SYNC] Could not fetch execution for task %s: %s", task_id, exec_err)

        field_data = execution_data.get('fieldData') or {}
        proposed = field_data.get('proposedHindrance') or field_data

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

        # Category and Severity
        category = proposed.get('hindranceType') or proposed.get('category') or field_data.get('hindranceType') or 'Utility Crossing'
        sub_category = proposed.get('subHindranceType') or field_data.get('subHindranceType') or ''
        severity = map_ilync_severity(proposed.get('severity') or field_data.get('severity') or 'HIGH')
        status = map_ilync_status(task.get('status') or task.get('approvalStatus'))

        # GPS Coordinates
        lat = safe_float(proposed.get('latitude') or proposed.get('startLat') or field_data.get('latitude'))
        lng = safe_float(proposed.get('longitude') or proposed.get('startLng') or field_data.get('longitude'))

        # Media Keys
        start_photo = proposed.get('startPhotoKey') or field_data.get('startPhotoKey')
        end_photo = proposed.get('endPhotoKey') or field_data.get('endPhotoKey')
        walkthrough_video = proposed.get('walkthroughVideoKey') or field_data.get('walkthroughVideoKey')
        attachment_keys = execution_data.get('attachmentKeys') or []

        # Resolve Photo URLs if keys present
        photo_keys_to_resolve = [k for k in [start_photo, end_photo] if k and isinstance(k, str) and not k.startswith('http')]
        resolved_urls = {}
        if photo_keys_to_resolve:
            try:
                url_res = client.get_survey_photo_urls(photo_keys_to_resolve)
                if isinstance(url_res, dict) and isinstance(url_res.get('data'), dict):
                    resolved_urls = url_res['data']
            except Exception:
                pass

        if start_photo and start_photo in resolved_urls:
            start_photo = resolved_urls[start_photo]
        if end_photo and end_photo in resolved_urls:
            end_photo = resolved_urls[end_photo]

        # Dates
        logged_date = parse_date(task.get('createdAt') or task.get('submittedAt')) or timezone.now().date()
        target_date = parse_date(task.get('dueDate'))

        # Description & Mitigation
        description = proposed.get('description') or task.get('description') or ''
        mitigation = proposed.get('mitigation') or field_data.get('mitigation') or task.get('remarks') or ''

        # Unique Hindrance ID
        local_h_id = f"HND-IL-{task_code or task_id[:8]}"

        defaults = {
            "title": display_name,
            "category": category,
            "sub_category": sub_category,
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
            "description": description,
            "mitigation": mitigation,
            "contractor": task.get('vendorId') or "Assigned Contractor",
            "department": proposed.get('department') or "Nodal Authority",
            "logged_date": logged_date,
            "target_date": target_date,
            "start_photo": start_photo,
            "end_photo": end_photo,
            "walkthrough_video": walkthrough_video,
            "additional_media": attachment_keys if isinstance(attachment_keys, list) else [],
            "source_system": 'ILYNC',
            "external_task_id": task_id,
            "external_hindrance_id": task_code or task_id,
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

    msg = f"Sync completed. {stats['imported']} imported, {stats['updated']} updated, {stats['skipped']} skipped."
    stats["message"] = msg
    return stats
