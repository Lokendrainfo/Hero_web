import os
import sys
import django
from datetime import date
from django.utils import timezone

def seed():
    from apps.tasks.models import Otn

    initial_data = [
        {
            "otn_id": "OTN-2026-101",
            "title": "Block PoP Saha to GP Kesri Stretch Obstacle",
            "otn_type": "Linear",
            "sub_otn_type": "Low Depth",
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
            "department": "National Optical Fiber Delivery",
            "logged_date": date(2026, 10, 15),
            "target_date": date(2026, 10, 26),
            "description": "Culvert foundation limits trenching depth to 0.9m along 250m stretch. Requires concrete encased ducting or OTN route divert.",
            "mitigation": "Duct protection casing proposed with joint inspection scheduled with Block Development Officer.",
            "source_system": "HERO",
            "latitude": 30.2512,
            "longitude": 77.0145,
            "s_latitude": 30.2505,
            "s_longitude": 77.0140,
            "e_latitude": 30.2520,
            "e_longitude": 77.0150,
            "ie_name": "Col. R. K. Sharma",
            "ie_phone_number": "+91 9876543210",
            "ie_photo_needed": False,
        },
        {
            "otn_id": "OTN-2026-102",
            "title": "Kesri Node to GP Bihta Spurt Route Congestion",
            "otn_type": "Architecture change Involved",
            "sub_otn_type": "Heavy congestion of underground utilities",
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
            "description": "Dense telecom optical fiber cables and high-pressure gas line in existing shoulder. Micro-trenching or re-alignment required.",
            "mitigation": "Revised BoQ alignment shifted 4m to western shoulder approved by Independent Engineer.",
            "source_system": "HERO",
            "latitude": 30.2789,
            "longitude": 77.0421,
            "s_latitude": 30.2780,
            "s_longitude": 77.0415,
            "e_latitude": 30.2795,
            "e_longitude": 77.0425,
            "ie_name": "Er. Deepesh Rawat",
            "ie_phone_number": "+91 9811223344",
            "ie_photo_needed": True,
            "approved_otn": {
                "otnId": "OTN-2026-102",
                "otnType": "Architecture change Involved",
                "subOtnType": "Heavy congestion of underground utilities",
                "description": "Dense telecom optical fiber cables and high-pressure gas line in existing shoulder.",
                "status": "APPROVED",
                "remarks": "Approved with Western shoulder alignment shift.",
                "latitude": 30.2789,
                "longitude": 77.0421
            }
        },
        {
            "otn_id": "OTN-2026-103",
            "title": "Gharaunda PoP to GP Chaura Rock Obstacle",
            "otn_type": "Architecture change Involved",
            "sub_otn_type": "Hard Rock",
            "severity": "HIGH",
            "status": "IN_PROGRESS",
            "chainage": "CH 12+800 to 13+100 (300m)",
            "chainage_from": "12+800",
            "chainage_to": "13+100",
            "district": "Karnal",
            "block": "Gharaunda",
            "section": "Ring-B Feeder Route",
            "location": "Chaura Outskirts",
            "contractor": "Harpaal Infra Development",
            "department": "Mining & Geology",
            "logged_date": date(2026, 10, 6),
            "target_date": date(2026, 10, 20),
            "description": "Encountered dense granite stratum preventing normal trenching depth for 96F trunk duct.",
            "mitigation": "Mobilized pneumatic rock breaker and DTH hammer unit.",
            "source_system": "HERO",
            "latitude": 29.5312,
            "longitude": 76.9654,
            "s_latitude": 29.5305,
            "s_longitude": 76.9650,
            "e_latitude": 29.5320,
            "e_longitude": 76.9660,
        },
        {
            "otn_id": "OTN-2026-104",
            "title": "GP Chaura to GP Kohand Canal Siphon Clearance",
            "otn_type": "Linear",
            "sub_otn_type": "Route Divert",
            "severity": "MEDIUM",
            "status": "DRAFT",
            "chainage": "CH 06+100 to 06+250 (150m)",
            "chainage_from": "06+100",
            "chainage_to": "06+250",
            "district": "Karnal",
            "block": "Gharaunda",
            "section": "Sub-ring Kohand Link",
            "location": "Canal Siphon km 8",
            "contractor": "Naveen Telecom Network",
            "department": "Irrigation Dept Haryana",
            "logged_date": date(2026, 10, 16),
            "target_date": date(2026, 10, 30),
            "description": "Irrigation canal bank stability objection by local junior engineer. Drafted proposed route divert around downstream bridge.",
            "mitigation": "Preparing engineering profile drawing for Sub-Divisional Officer review.",
            "source_system": "HERO",
            "latitude": 29.4891,
            "longitude": 76.9421,
        },
        {
            "otn_id": "OTN-2026-105",
            "title": "Hansi-1 PoP to GP Sisai Central Village Dispute",
            "otn_type": "Architecture change Involved",
            "sub_otn_type": "Local objection on private land",
            "severity": "MEDIUM",
            "status": "RESOLVED",
            "chainage": "CH 08+200 to 08+400 (200m)",
            "chainage_from": "08+200",
            "chainage_to": "08+400",
            "district": "Hisar",
            "block": "Hansi-1",
            "section": "Ring-C Sisai Link",
            "location": "Sisai East Approach",
            "contractor": "Shree Shyam Enterprises",
            "department": "Gram Panchayat Sisai",
            "logged_date": date(2026, 10, 2),
            "target_date": date(2026, 10, 12),
            "resolved_date": date(2026, 10, 10),
            "description": "Local landowners objected to duct laying across entrance culvert.",
            "mitigation": "Piped thrust-boring performed beneath entrance with zero surface disturbance. Agreement signed with Panchayat.",
            "source_system": "HERO",
            "latitude": 29.1245,
            "longitude": 75.9612,
            "approved_otn": {
                "otnId": "OTN-2026-105",
                "otnType": "Architecture change Involved",
                "subOtnType": "Local objection on private land",
                "description": "Local landowners objected to duct laying across entrance culvert.",
                "status": "RESOLVED",
                "remarks": "Resolved via thrust-boring method."
            }
        }
    ]

    for item in initial_data:
        o_id = item["otn_id"]
        obj, created = Otn.objects.update_or_create(
            otn_id=o_id,
            defaults=item
        )
        if not obj.proposed_otn:
            obj.proposed_otn = obj.build_proposed_details()
        if not obj.field_data:
            obj.field_data = obj.to_otn_task_data_json()
        if not obj.approval_history:
            obj.approval_history = [
                {
                    "action": "RECORD_SEEDED",
                    "status": obj.status,
                    "user": "System Seed",
                    "timestamp": timezone.now().isoformat(),
                    "remarks": obj.remarks or "Initial OTN seeded data."
                }
            ]
        obj.save()
        action = "Created" if created else "Updated"
        print(f"[{action}] OTN {o_id} - {item['title']} (Status: {obj.status})")

    print("\nOTN seeding complete! Total records:", Otn.objects.count())

if __name__ == '__main__':
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if sys.path and sys.path[0] != backend_dir:
        sys.path.pop(0)
    sys.path.insert(0, backend_dir)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    django.setup()
    seed()
