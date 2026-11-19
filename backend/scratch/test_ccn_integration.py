"""
Comprehensive Integration Test for HERO Web Change Control Notice (CCN) Management & Java Model Alignment.
Validates:
1. Model fidelity to com.netinfra.platform.task.dao.entities.survey.CcnTaskData
2. Dual-state preservation (proposedCcn vs approvedCcn)
3. Workflow transitions: Draft -> Submit -> Review -> Approve / Reject
4. Controlled classifications matching CcnSubtype1 and CcnSubtype2
5. Route Evidence media structure, KML Route File upload & content preview
6. Register listing, metrics, and CSV export
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

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.tasks.models import Ccn
from apps.tasks.views import CcnViewSet
from apps.tasks.serializers import CCN_SUBTYPE_1, CCN_SUBTYPE_2
from apps.authentication.models import User

factory = APIRequestFactory()
admin_user = User.objects.filter(is_superuser=True).first()
if not admin_user:
    admin_user = User.objects.create_superuser('test_admin_ccn', 'admin_ccn@example.com', 'AdminPass123!')


def test_hero_ccn_creation():
    print("\n--- 1. Testing HERO-native CCN Creation with Java Model Fidelity ---")
    view = CcnViewSet.as_view({'post': 'create'})
    
    payload = {
        "ccnId": "CCN-2026-TEST-001",
        "subtype1": "Architecture change Involved",
        "subtype2": "CC Road – OT/HDD is not feasible",
        "ccnDetails": "Dense reinforced cement concrete road spanning 400m with municipal sewage mains at 0.6m depth. HDD bore infeasible.",
        "description": "CC Road OT/HDD infeasible across 400m stretch.",
        "remarks": "Requires aerial span or northern lane diversion.",
        "sLatitude": 28.4590,
        "sLongitude": 77.0260,
        "eLatitude": 28.4620,
        "eLongitude": 77.0290,
        "circle": "Haryana",
        "district": "Gurugram",
        "block": "Sohna",
        "section": "Sohna to Tauru Ring",
        "location": "Main CC Road Bazaar",
        "chainage": "CH 05+100 to 05+500",
        "startPhoto": {"key": "ccn/s1.jpg", "url": "/media/ccn/s1.jpg", "fileName": "s1.jpg"},
        "additionalStartPhotos": [
            {"key": "ccn/as1.jpg", "url": "/media/ccn/as1.jpg", "fileName": "as1.jpg"},
            {"key": "ccn/as2.jpg", "url": "/media/ccn/as2.jpg", "fileName": "as2.jpg"}
        ],
        "walkthroughVideo": {"key": "ccn/w1.mp4", "url": "/media/ccn/w1.mp4", "fileName": "w1.mp4"},
        "additionalRouteVideos": [{"key": "ccn/rv1.mp4", "url": "/media/ccn/rv1.mp4", "fileName": "rv1.mp4"}],
        "endPhoto": {"key": "ccn/e1.jpg", "url": "/media/ccn/e1.jpg", "fileName": "e1.jpg"},
        "additionalEndPhotos": [{"key": "ccn/ae1.jpg", "url": "/media/ccn/ae1.jpg", "fileName": "ae1.jpg"}],
        "additionalEndVideos": [{"key": "ccn/ev1.mp4", "url": "/media/ccn/ev1.mp4", "fileName": "ev1.mp4"}],
        "kmlType": "UPLOADED",
        "kmlFile": {"key": "ccn/route.kml", "url": "/media/ccn/route.kml", "fileName": "route.kml"},
        "kmlFileName": "route.kml",
        "kmlFileKey": "ccn/route.kml",
        "kmlContent": "<kml><Document><name>Test Diversion</name></Document></kml>",
        "action": "draft"
    }

    # Cleanup if existing
    Ccn.objects.filter(ccn_id="CCN-2026-TEST-001").delete()

    request = factory.post('/api/v1/tasks/ccn/', payload, format='json')
    force_authenticate(request, user=admin_user)
    response = view(request)

    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.data}"
    data = response.data
    assert data['surveyKind'] == 'CCN', f"Expected surveyKind CCN, got {data.get('surveyKind')}"
    assert data['ccnId'] == 'CCN-2026-TEST-001'
    assert data['status'] == 'DRAFT'
    assert data['subtype1'] == 'Architecture change Involved'
    assert data['subtype2'] == 'CC Road – OT/HDD is not feasible'
    assert data['sLatitude'] == 28.4590
    assert data['eLongitude'] == 77.0290
    assert data['kmlType'] == 'UPLOADED'
    assert data['kmlFileName'] == 'route.kml'
    assert 'proposedCcn' in data and isinstance(data['proposedCcn'], dict)
    assert data['proposedCcn']['ccnId'] == 'CCN-2026-TEST-001'
    assert len(data['proposedCcn']['additionalStartPhotos']) == 2
    assert len(data['proposedCcn']['additionalRouteVideos']) == 1
    assert len(data['proposedCcn']['additionalEndPhotos']) == 1
    assert len(data['proposedCcn']['additionalEndVideos']) == 1
    assert data['approvedCcn'] is None

    print("  [PASS] CCN created as DRAFT with full CcnTaskData fidelity and KML route data.")
    return data['id']


def test_ccn_workflow_dual_state(ccn_pk):
    print("\n--- 2. Testing Workflow Lifecycle & Dual-State Preservation (Draft -> Submit -> Approve) ---")
    # Submit
    submit_view = CcnViewSet.as_view({'post': 'submit_for_approval'})
    req_sub = factory.post(f'/api/v1/tasks/ccn/{ccn_pk}/submit/', {"remarks": "Ready for CCB approval"}, format='json')
    force_authenticate(req_sub, user=admin_user)
    res_sub = submit_view(req_sub, pk=ccn_pk)

    assert res_sub.status_code == 200, f"Submit failed: {res_sub.data}"
    assert res_sub.data['data']['status'] == 'PENDING_APPROVAL'
    original_proposed_desc = res_sub.data['data']['proposedCcn']['ccnDetails']

    # Approve with reviewer edits (verifying dual-state separation)
    approve_view = CcnViewSet.as_view({'post': 'approve'})
    approved_payload = {
        "remarks": "Approved diversion along Northern bypass lane (+65m).",
        "approvedCcn": {
            "ccnId": "CCN-2026-TEST-001",
            "subtype1": "Architecture change Involved",
            "subtype2": "CC Road – OT/HDD is not feasible",
            "ccnDetails": "APPROVED REVISION: Use 65m northern lane bypass with 40mm PLB duct.",
            "status": "APPROVED",
            "remarks": "Approved diversion along Northern bypass lane (+65m).",
            "sLatitude": 28.4590,
            "sLongitude": 77.0260,
            "eLatitude": 28.4622,
            "eLongitude": 77.0292,
            "kmlType": "UPLOADED",
            "kmlFileName": "route.kml"
        }
    }
    req_app = factory.post(f'/api/v1/tasks/ccn/{ccn_pk}/approve/', approved_payload, format='json')
    force_authenticate(req_app, user=admin_user)
    res_app = approve_view(req_app, pk=ccn_pk)

    assert res_app.status_code == 200, f"Approve failed: {res_app.data}"
    updated = res_app.data['data']
    assert updated['status'] == 'APPROVED'
    assert updated['approvedCcn'] is not None
    assert updated['approvedCcn']['ccnDetails'] == "APPROVED REVISION: Use 65m northern lane bypass with 40mm PLB duct."
    # Dual-state check: proposedCcn MUST NOT be overwritten!
    assert updated['proposedCcn']['ccnDetails'] == original_proposed_desc, "CRITICAL FAILURE: proposedCcn was overwritten during approval!"
    assert len(updated['approvalHistory']) >= 3

    print("  [PASS] Dual-state preserved! proposedCcn untouched while approvedCcn stores reviewer version.")


def test_ccn_rejection_flow():
    print("\n--- 3. Testing Rejection Flow & Validation ---")
    create_view = CcnViewSet.as_view({'post': 'create'})
    Ccn.objects.filter(ccn_id="CCN-2026-TEST-REJ").delete()
    req = factory.post('/api/v1/tasks/ccn/', {
        "ccnId": "CCN-2026-TEST-REJ",
        "subtype1": "Linear",
        "subtype2": "GP Shifting",
        "ccnDetails": "Requesting GP shifting by 500m.",
        "action": "submit"
    }, format='json')
    force_authenticate(req, user=admin_user)
    res = create_view(req)
    assert res.status_code == 201
    pk = res.data['id']
    assert res.data['status'] == 'PENDING_APPROVAL'

    reject_view = CcnViewSet.as_view({'post': 'reject'})
    # Should fail without reason
    req_bad = factory.post(f'/api/v1/tasks/ccn/{pk}/reject/', {}, format='json')
    force_authenticate(req_bad, user=admin_user)
    res_bad = reject_view(req_bad, pk=pk)
    assert res_bad.status_code == 400, "Expected 400 when rejecting without remarks"

    # Should succeed with reason
    req_ok = factory.post(f'/api/v1/tasks/ccn/{pk}/reject/', {"remarks": "GP location is fixed by Panchayat NOC."}, format='json')
    force_authenticate(req_ok, user=admin_user)
    res_ok = reject_view(req_ok, pk=pk)
    assert res_ok.status_code == 200
    assert res_ok.data['data']['status'] == 'REJECTED'
    assert res_ok.data['data']['proposedCcn']['ccnDetails'] == "Requesting GP shifting by 500m."

    Ccn.objects.filter(id=pk).delete()
    print("  [PASS] Rejection validation enforced and proposedCcn preserved.")


def test_ccn_masters():
    print("\n--- 4. Testing Controlled Classification Masters (CcnSubtype1 & CcnSubtype2) ---")
    view = CcnViewSet.as_view({'get': 'masters'})
    req = factory.get('/api/v1/tasks/ccn/masters/')
    force_authenticate(req, user=admin_user)
    res = view(req)

    assert res.status_code == 200
    assert len(res.data['subtype1']) == 2
    assert len(res.data['subtype2']['Linear']) == 4
    assert len(res.data['subtype2']['Architecture change Involved']) == 9
    assert "Permission restriction from the concerned" in res.data['subtype2']['Architecture change Involved']
    print("  [PASS] Masters match exact Java CcnSubtype1 & CcnSubtype2 enums.")


def test_ccn_kml_media_upload():
    print("\n--- 5. Testing KML & Media Upload Service ---")
    view = CcnViewSet.as_view({'post': 'upload_media'})
    kml_bytes = b'<?xml version="1.0" encoding="UTF-8"?><kml><Document><name>Route</name></Document></kml>'
    uploaded = SimpleUploadedFile("test_diversion.kml", kml_bytes, content_type="application/vnd.google-earth.kml+xml")

    req = factory.post('/api/v1/tasks/ccn/upload-media/', {'file': uploaded, 'latitude': '28.50', 'longitude': '77.10'}, format='multipart')
    force_authenticate(req, user=admin_user)
    res = view(req)

    assert res.status_code == 200, f"Upload failed: {res.data}"
    assert res.data['success'] is True
    assert res.data['data']['fileName'] == 'test_diversion.kml'
    assert '<name>Route</name>' in res.data['kmlContent']
    print("  [PASS] KML file uploaded, SurveyPhoto generated, and XML preview extracted.")


def test_ccn_list_metrics_and_export(ccn_pk):
    print("\n--- 6. Testing Register Listing, Metrics & CSV Export ---")
    list_view = CcnViewSet.as_view({'get': 'list'})
    req_list = factory.get('/api/v1/tasks/ccn/')
    force_authenticate(req_list, user=admin_user)
    res_list = list_view(req_list)

    assert res_list.status_code == 200
    assert res_list.data['success'] is True
    assert 'metrics' in res_list.data
    assert res_list.data['metrics']['total'] >= 1

    export_view = CcnViewSet.as_view({'get': 'export_csv'})
    req_exp = factory.get('/api/v1/tasks/ccn/export/')
    force_authenticate(req_exp, user=admin_user)
    res_exp = export_view(req_exp)

    assert res_exp.status_code == 200
    assert res_exp['Content-Type'] == 'text/csv'
    csv_text = res_exp.content.decode('utf-8')
    assert 'CCN ID,Title,Subtype 1,Subtype 2' in csv_text
    assert 'CCN-2026-TEST-001' in csv_text

    # Clean up test record
    Ccn.objects.filter(id=ccn_pk).delete()
    print("  [PASS] List metrics and CSV register export validated.")


if __name__ == '__main__':
    print("============================================================")
    print("  HERO WEB CCN MODULE - AUTOMATED INTEGRATION SUITE")
    print("============================================================")
    pk = test_hero_ccn_creation()
    test_ccn_workflow_dual_state(pk)
    test_ccn_rejection_flow()
    test_ccn_masters()
    test_ccn_kml_media_upload()
    test_ccn_list_metrics_and_export(pk)
    print("\n[SUCCESS] ALL 6 CCN INTEGRATION TESTS PASSED!")

