import os
import sys
import django
from datetime import date
from django.utils import timezone

def seed():
    from apps.tasks.models import Ccn

    initial_data = [
        {
            "ccn_id": "CCN-2026-101",
            "title": "CCN Linear: Low Depth at Saha Canal Crossing",
            "subtype1": "Linear",
            "subtype2": "Low Depth",
            "severity": "HIGH",
            "status": "PENDING_APPROVAL",
            "chainage": "CH 04+100 to 04+350 (250m)",
            "chainage_from": "04+100",
            "chainage_to": "04+350",
            "district": "Ambala",
            "block": "Saha",
            "section": "Block PoP Saha to GP Kesri",
            "location": "Kesri Approach Culvert",
            "contractor": "Premium Infra Solutions",
            "department": "Change Control Board",
            "logged_date": date(2026, 10, 15),
            "target_date": date(2026, 10, 26),
            "ccn_details": "Canal culvert structural foundation prevents 1.65m trenching depth. Max achievable depth is 0.85m across 250m. Change notice proposes DWC pipe with concrete encasing.",
            "description": "Canal culvert structural foundation prevents 1.65m trenching depth.",
            "mitigation": "Duct protection casing proposed with joint inspection scheduled with Irrigation Dept.",
            "source_system": "HERO",
            "latitude": 30.2512,
            "longitude": 77.0145,
            "s_latitude": 30.2505,
            "s_longitude": 77.0140,
            "e_latitude": 30.2520,
            "e_longitude": 77.0150,
            "kml_type": "UPLOADED",
            "kml_file_name": "route_divert_saha_kesri.kml",
            "kml_content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><name>CCN-2026-101 Route</name></Document></kml>",
        },
        {
            "ccn_id": "CCN-2026-102",
            "title": "CCN Architecture change: Heavy congestion of underground utilities",
            "subtype1": "Architecture change Involved",
            "subtype2": "Heavy congestion of underground utilities",
            "severity": "CRITICAL",
            "status": "APPROVED",
            "chainage": "CH 02+400 to 02+650 (250m)",
            "chainage_from": "02+400",
            "chainage_to": "02+650",
            "district": "Ambala",
            "block": "Saha",
            "section": "Kesri Node to GP Bihta Spurt",
            "location": "Bihta Crossing",
            "contractor": "Naveen Telecom Network",
            "department": "BSNL / GAIL",
            "logged_date": date(2026, 10, 10),
            "target_date": date(2026, 10, 22),
            "ccn_details": "Dense optical fiber corridor and 12-inch GAIL pipeline on Eastern shoulder make HDD drilling high-risk. Change notice requests rerouting 6m to Western shoulder.",
            "description": "Dense optical fiber corridor and 12-inch GAIL pipeline on Eastern shoulder.",
            "mitigation": "Revised BoQ alignment shifted 6m to western shoulder approved by Chief Engineer.",
            "source_system": "HERO",
            "latitude": 30.2789,
            "longitude": 77.0421,
            "s_latitude": 30.2780,
            "s_longitude": 77.0415,
            "e_latitude": 30.2795,
            "e_longitude": 77.0425,
            "kml_type": "GENERATED",
            "kml_file_name": "ccn_bihta_western_shift.kml",
            "approved_ccn": {
                "ccnId": "CCN-2026-102",
                "subtype1": "Architecture change Involved",
                "subtype2": "Heavy congestion of underground utilities",
                "ccnDetails": "Dense optical fiber corridor and 12-inch GAIL pipeline on Eastern shoulder.",
                "description": "Dense optical fiber corridor and 12-inch GAIL pipeline on Eastern shoulder.",
                "status": "APPROVED",
                "remarks": "Approved with Western shoulder alignment shift. BoQ adjustment +45m accepted.",
                "sLatitude": 30.2780,
                "sLongitude": 77.0415,
                "eLatitude": 30.2795,
                "eLongitude": 77.0425,
                "kmlType": "GENERATED",
                "kmlFileName": "ccn_bihta_western_shift.kml"
            }
        },
        {
            "ccn_id": "CCN-2026-103",
            "title": "CCN Architecture change: Hard Rock at Chaura Outskirts",
            "subtype1": "Architecture change Involved",
            "subtype2": "Hard Rock",
            "severity": "HIGH",
            "status": "DRAFT",
            "chainage": "CH 12+800 to 13+100 (300m)",
            "chainage_from": "12+800",
            "chainage_to": "13+100",
            "district": "Karnal",
            "block": "Gharaunda",
            "section": "Ring-B Feeder Route",
            "location": "Chaura Outskirts",
            "contractor": "Harpaal Infra Development",
            "department": "PWD / Mining",
            "logged_date": date(2026, 10, 6),
            "target_date": date(2026, 10, 20),
            "ccn_details": "Sheet rock formation encountered from 0.4m depth across 300m span. Standard trenching unviable; rock cutting / hydraulic breaker required.",
            "description": "Sheet rock formation encountered from 0.4m depth.",
            "mitigation": "Drafting proposal for specialized hydraulic breaker rate or overhead pole alternative.",
            "source_system": "HERO",
            "latitude": 29.5412,
            "longitude": 76.9745,
            "s_latitude": 29.5400,
            "s_longitude": 76.9730,
            "e_latitude": 29.5425,
            "e_longitude": 76.9760,
            "kml_type": "UPLOADED",
            "kml_file_name": "chaura_rock_section.kml"
        },
        {
            "ccn_id": "CCN-2026-104",
            "title": "CCN Linear: Route Divert due to NHAI Flyover Construction",
            "subtype1": "Linear",
            "subtype2": "Route Divert",
            "severity": "MEDIUM",
            "status": "REJECTED",
            "chainage": "CH 08+200 to 08+900 (700m)",
            "chainage_from": "08+200",
            "chainage_to": "08+900",
            "district": "Panipat",
            "block": "Samalkha",
            "section": "Samalkha - Pattikalyana Link",
            "location": "NH-44 Underpass Approach",
            "contractor": "Apex Telecom Works",
            "department": "NHAI Project Unit",
            "logged_date": date(2026, 10, 2),
            "target_date": date(2026, 10, 18),
            "ccn_details": "Contractor requested 1.2km bypass around ongoing NHAI flyover construction. Review showed NHAI provided 2m service corridor on service road.",
            "description": "Contractor requested 1.2km bypass around ongoing NHAI flyover construction.",
            "mitigation": "Rejected. Utilize existing NHAI authorized utility corridor along service road.",
            "remarks": "Rejected: NHAI has confirmed clearance for 2m utility corridor on the western service lane. No bypass required.",
            "source_system": "HERO",
            "latitude": 29.2312,
            "longitude": 77.0125,
            "s_latitude": 29.2300,
            "s_longitude": 77.0110,
            "e_latitude": 29.2325,
            "e_longitude": 77.0140,
            "kml_type": "UPLOADED",
            "kml_file_name": "rejected_flyover_bypass.kml"
        },
        {
            "ccn_id": "CCN-2026-105",
            "title": "CCN Architecture change: Permission issue from local authority",
            "subtype1": "Architecture change Involved",
            "subtype2": "Permission issue from local authority",
            "severity": "HIGH",
            "status": "RESOLVED",
            "chainage": "CH 01+100 to 01+400 (300m)",
            "chainage_from": "01+100",
            "chainage_to": "01+400",
            "district": "Rohtak",
            "block": "Kalanaur",
            "section": "Kalanaur Market Ring",
            "location": "Municipal Main Bazaar",
            "contractor": "Haryana Optical Grid Ltd",
            "department": "Municipal Corporation Rohtak",
            "logged_date": date(2026, 9, 25),
            "target_date": date(2026, 10, 12),
            "resolved_date": date(2026, 10, 14),
            "ccn_details": "Municipal corporation objected to open trenching in market area during festive season. Change notice approved night HDD drilling method.",
            "description": "Municipal corporation objected to open trenching in market area.",
            "mitigation": "Night HDD execution completed between 11 PM and 5 AM. Restoration certified by MC Engineer.",
            "remarks": "Approved and executed with night trenchless method. Route cleared.",
            "source_system": "HERO",
            "latitude": 28.8312,
            "longitude": 76.5125,
            "s_latitude": 28.8300,
            "s_longitude": 76.5110,
            "e_latitude": 28.8325,
            "e_longitude": 76.5140,
            "kml_type": "UPLOADED",
            "kml_file_name": "kalanaur_hdd_route.kml"
        }
    ]

    print(f"[*] Seeding {len(initial_data)} CCN records...")
    created_count = 0
    updated_count = 0

    for item in initial_data:
        ccn_id = item['ccn_id']
        obj, created = Ccn.objects.get_or_create(
            ccn_id=ccn_id,
            defaults=item
        )
        if created:
            created_count += 1
            obj.proposed_ccn = obj.build_proposed_details()
            obj.field_data = obj.to_ccn_task_data_json()
            obj.approval_history = [
                {
                    "action": "DRAFT_SAVED" if obj.status == 'DRAFT' else "SUBMITTED_FOR_APPROVAL",
                    "status": obj.status,
                    "user": "System Seed",
                    "timestamp": timezone.now().isoformat(),
                    "remarks": obj.remarks or "Seed initial data"
                }
            ]
            obj.save()
            print(f"  + Created {ccn_id}: {obj.title} [{obj.status}]")
        else:
            updated_count += 1
            for k, v in item.items():
                setattr(obj, k, v)
            if not obj.proposed_ccn:
                obj.proposed_ccn = obj.build_proposed_details()
            obj.field_data = obj.to_ccn_task_data_json()
            obj.save()
            print(f"  ~ Updated {ccn_id}: {obj.title} [{obj.status}]")

    print(f"[+] Done seeding CCN: {created_count} created, {updated_count} updated.")


if __name__ == '__main__':
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    if sys.path and sys.path[0] != backend_dir:
        sys.path.pop(0)
    sys.path.insert(0, backend_dir)

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    django.setup()
    seed()
