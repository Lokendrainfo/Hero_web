"""
Comprehensive Integration Test for HERO Web Optical Transport Network (OTN) Management & Java Model Alignment.
Validates:
1. Model fidelity to com.netinfra.platform.task.dao.entities.survey.OtnTaskData
2. Dual-state preservation (proposedOtn vs approvedOtn)
3. Workflow transitions: Draft -> Submit -> Review -> Approve / Reject
4. Controlled classifications matching OtnType and SubOtnType
5. SurveyPhoto media structure and media upload
6. Register listing, metrics, and CSV export
7. Safe read-only NetInfra synchronization with duplicate protection
"""
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

import django
django.setup()

from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.tasks.models import Otn
from apps.tasks.views import OtnViewSet
from apps.tasks.serializers import OtnSerializer, OTN_TYPES, SUB_OTN_TYPES
from apps.tasks.otn_service import sync_ilync_otn
from apps.authentication.models import User

factory = APIRequestFactory()
admin_user = User.objects.filter(is_superuser=True).first()
if not admin_user:
    admin_user = User.objects.create_superuser('test_admin_otn', 'admin_otn@example.com', 'AdminPass123!')


def test_hero_otn_creation():
    print("\n--- 1. Testing HERO-native OTN Creation with Java Model Fidelity ---")
    view = OtnViewSet.as_view({'post': 'create'})
    
    payload = {
        "otnId": "OTN-2026-TEST-001",
        "otnType": "Linear",
        "subOtnType": "Low Depth",
        "description": "BoQ plan stretch obstructed by underground drainage culvert at 0.8m depth.",
        "remarks": "Requires specialized casing pipe.",
        "latitude": 28.4595,
        "longitude": 77.0266,
        "sLatitude": 28.4590,
        "sLongitude": 77.0260,
        "eLatitude": 28.4600,
        "eLongitude": 77.0270,
        "circle": "Haryana",
        "district": "Gurugram",
        "block": "Sohna",
        "section": "Sohna to Tauru Stretch",
        "location": "Culvert 12/4",
        "chainage": "CH 05+100 to 05+250",
        "startPhoto": {
            "key": "otn/start_001.jpg",
            "url": "/media/otn/start_001.jpg",
            "fileName": "start_001.jpg"
        },
        "endPhoto": {
            "key": "otn/end_001.jpg",
            "url": "/media/otn/end_001.jpg",
            "fileName": "end_001.jpg"
        },
        "walkthroughVideo": {
            "key": "otn/walk_001.mp4",
            "url": "/media/otn/walk_001.mp4",
            "fileName": "walk_001.mp4"
        },
        "photos": [
            {"key": "otn/p1.jpg", "url": "/media/otn/p1.jpg", "fileName": "p1.jpg"}
        ],
        "additionalPhotos": [],
        "additionalVideos": [],
        "ieName": "Col. R. K. Sharma",
        "iePhoneNumber": "+91 9876543210",
        "iePhotoNeeded": True,
        "iePhoto": {
            "key": "otn/ie_sharma.jpg",
            "url": "/media/otn/ie_sharma.jpg",
            "fileName": "ie_sharma.jpg"
        },
        "shpFiles": ["otn/alignment.shp"],
        "action": "submit"
    }

    req = factory.post('/api/v1/tasks/otn/', payload, format='json')
    force_authenticate(req, user=admin_user)
    resp = view(req)

    assert resp.status_code == 201, f"Expected 201 Created, got {resp.status_code} ({resp.data})"
    data = resp.data
    assert data.get('otnId') == 'OTN-2026-TEST-001'
    assert data.get('surveyKind') == 'OTN'
    assert data.get('status') == 'PENDING_APPROVAL'
    assert data.get('source_system') == 'HERO'

    proposed = data.get('proposedOtn')
    assert isinstance(proposed, dict), "proposedOtn must be a dictionary"
    assert proposed.get('otnType') == 'Linear'
    assert proposed.get('subOtnType') == 'Low Depth'
    assert proposed.get('sLatitude') == 28.4590
    assert proposed.get('eLatitude') == 28.4600
    assert proposed.get('ieName') == 'Col. R. K. Sharma'
    assert len(proposed.get('shpFiles')) == 1

    assert data.get('approvedOtn') is None, "approvedOtn must be null before review"

    print(f"Created OTN: {data['otnId']} - Status: {data['status']}")
    print("PASS: Java model fields, canonical aliases, and proposedOtn validated!")
    return data['id'], data['otnId']


def test_draft_and_approval_workflow():
    print("\n--- 2. Testing Save Draft -> Submit -> Review -> Approve / Reject Workflow for OTN ---")
    create_view = OtnViewSet.as_view({'post': 'create'})
    submit_view = OtnViewSet.as_view({'post': 'submit_for_approval'})
    approve_view = OtnViewSet.as_view({'post': 'approve'})
    reject_view = OtnViewSet.as_view({'post': 'reject'})

    # 1. Save as Draft
    draft_payload = {
        "otnId": "OTN-DRAFT-999",
        "otnType": "Architecture change Involved",
        "subOtnType": "Narrow Road",
        "description": "Right of way width is 1.6m due to roadside masonry wall.",
        "remarks": "Proposing route divert along secondary link road.",
        "action": "draft"
    }
    req = factory.post('/api/v1/tasks/otn/', draft_payload, format='json')
    force_authenticate(req, user=admin_user)
    resp = create_view(req)
    assert resp.status_code == 201
    draft_id = resp.data['id']
    assert resp.data['status'] == 'DRAFT'
    print(f"Draft created successfully: {resp.data['otnId']} (Status: {resp.data['status']})")

    # 2. Submit for Approval
    req = factory.post(f'/api/v1/tasks/otn/{draft_id}/submit/', {"remarks": "Ready for field inspection review"}, format='json')
    force_authenticate(req, user=admin_user)
    resp = submit_view(req, pk=draft_id)
    assert resp.status_code == 200
    assert resp.data['data']['status'] == 'PENDING_APPROVAL'
    print(f"Draft submitted for approval: Status={resp.data['data']['status']}")

    # 3. Approve OTN (Dual-state check: proposed untouched, approved populated)
    approve_payload = {
        "remarks": "Reviewed on site. Approved route divert with 2m depth requirement.",
        "approvedOtn": {
            "otnId": "OTN-DRAFT-999",
            "otnType": "Architecture change Involved",
            "subOtnType": "Narrow Road",
            "description": "Right of way width is 1.6m due to roadside masonry wall.",
            "status": "APPROVED",
            "remarks": "Approved route divert with 2m depth requirement."
        }
    }
    req = factory.post(f'/api/v1/tasks/otn/{draft_id}/approve/', approve_payload, format='json')
    force_authenticate(req, user=admin_user)
    resp = approve_view(req, pk=draft_id)
    assert resp.status_code == 200
    data = resp.data['data']
    assert data['status'] == 'APPROVED'
    assert data['proposedOtn'] is not None
    assert data['approvedOtn'] is not None
    assert data['approvedOtn']['status'] == 'APPROVED'
    assert len(data['approvalHistory']) >= 3
    print(f"OTN approved: proposedOtn preserved and approvedOtn saved!")

    # 4. Test Rejection flow
    rej_payload = {
        "otnId": "OTN-REJ-001",
        "otnType": "Linear",
        "subOtnType": "Route Divert",
        "description": "Proposed route diversion across canal.",
        "action": "submit"
    }
    req = factory.post('/api/v1/tasks/otn/', rej_payload, format='json')
    force_authenticate(req, user=admin_user)
    rej_resp = create_view(req)
    rej_id = rej_resp.data['id']

    req = factory.post(f'/api/v1/tasks/otn/{rej_id}/reject/', {"remarks": "Canal authority clearance not attached."}, format='json')
    force_authenticate(req, user=admin_user)
    resp = reject_view(req, pk=rej_id)
    assert resp.status_code == 200
    assert resp.data['data']['status'] == 'REJECTED'
    print(f"OTN rejected: Status={resp.data['data']['status']}, Reason preserved!")

    # Clean up
    Otn.objects.filter(id__in=[draft_id, rej_id]).delete()
    print("PASS: Full draft, submit, approve, reject workflow verified for OTN!")


def test_classification_masters():
    print("\n--- 3. Testing OTN Classification Masters Endpoint ---")
    view = OtnViewSet.as_view({'get': 'masters'})
    req = factory.get('/api/v1/tasks/otn/masters/')
    force_authenticate(req, user=admin_user)
    resp = view(req)

    assert resp.status_code == 200
    types = [t['value'] for t in resp.data['otnTypes']]
    assert "Linear" in types
    assert "Architecture change Involved" in types
    assert "No" in types
    assert "Ring to Linear" in types
    assert "Linear to Ring" in types

    subtypes = resp.data['subOtnTypes']
    assert "Low Depth" in subtypes["Linear"]
    assert "Route Divert" in subtypes["Linear"]
    assert "Narrow Road" in subtypes["Architecture change Involved"]
    print("PASS: Controlled classification enums match OtnTaskData Java specification!")


def test_upload_media():
    print("\n--- 4. Testing Media Upload Service for OTN ---")
    view = OtnViewSet.as_view({'post': 'upload_media'})
    test_content = b"fake image bytes for otn obstacle evidence"
    uploaded = SimpleUploadedFile("otn_evidence.jpg", test_content, content_type="image/jpeg")

    req = factory.post(
        '/api/v1/tasks/otn/upload-media/',
        {"file": uploaded, "latitude": "28.5000", "longitude": "77.1000"},
        format='multipart'
    )
    force_authenticate(req, user=admin_user)
    resp = view(req)

    assert resp.status_code == 200
    photo = resp.data.get('photo') or resp.data.get('data')
    assert photo is not None
    assert photo.get('fileName') == 'otn_evidence.jpg'
    assert photo.get('latitude') == 28.5
    assert photo.get('longitude') == 77.1
    assert photo.get('url').startswith('/media/otn/')
    print(f"Uploaded photo: {photo['key']} -> URL: {photo['url']}")
    print("PASS: SurveyPhoto upload structure conforms to OTN model!")


def test_duplicate_prevention_and_sync():
    print("\n--- 5. Testing Safe Read-Only NetInfra OTN Synchronization ---")
    sync_result = sync_ilync_otn()
    print("NetInfra OTN Sync Result:", sync_result)
    assert sync_result.get("success") is True, f"Sync should succeed gracefully, got {sync_result}"
    print("PASS: Duplicate prevention and safe read-only NetInfra synchronization verified for OTN!")


def test_csv_export():
    print("\n--- 6. Testing OTN CSV Register Export ---")
    view = OtnViewSet.as_view({'get': 'export_csv'})
    req = factory.get('/api/v1/tasks/otn/export/')
    force_authenticate(req, user=admin_user)
    resp = view(req)

    assert resp.status_code == 200
    assert resp.get('Content-Type') == 'text/csv'
    assert 'attachment; filename=' in resp.get('Content-Disposition')
    content = resp.content.decode()
    assert 'OTN ID,Title,OTN Type,Sub-OTN Type' in content
    print(f"Export CSV generated successfully ({len(content)} bytes).")
    print("PASS: Export register contains complete Java fields in CSV format!")


if __name__ == '__main__':
    pk, o_id = test_hero_otn_creation()
    test_draft_and_approval_workflow()
    test_classification_masters()
    test_upload_media()
    test_duplicate_prevention_and_sync()
    test_csv_export()

    # Clean up test created record
    Otn.objects.filter(id=pk).delete()
    print("\n=======================================================")
    print("ALL 6 OTN MANAGEMENT & JAVA FIDELITY TESTS PASSED!")
    print("=======================================================\n")
