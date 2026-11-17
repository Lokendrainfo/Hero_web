import os
import sys
import django
from datetime import date
from django.utils import timezone

def seed():
    from apps.tasks.models import Hindrance

    initial_data = [
        {
            "hindrance_id": "HND-2026-104",
            "title": "GAIL High-Pressure Gas Pipeline Crossing",
            "hindrance_type": "Architecture change Involved",
            "sub_hindrance_type": "Heavy congestion of underground utilities",
            "category": "Architecture change Involved",
            "sub_category": "Heavy congestion of underground utilities",
            "severity": "CRITICAL",
            "status": "PENDING_APPROVAL",
            "chainage": "CH 14+250 to 14+320 (70m)",
            "chainage_from": "14+250",
            "chainage_to": "14+320",
            "district": "Ambala",
            "block": "Saha",
            "section": "Block PoP to GP Kesri",
            "location": "Kesri Village Approach",
            "contractor": "Premium Infra Solutions",
            "department": "GAIL (India) Limited",
            "logged_date": date(2026, 10, 12),
            "target_date": date(2026, 10, 24),
            "description": "Encountered 18-inch cross-country natural gas pipeline at 2.4m depth. Requires GAIL NOC and supervised trial pit before HDD bore initiation.",
            "mitigation": "Joint trial trenching scheduled with GAIL inspection engineer on 18 Oct. HDD entry point adjusted 15m away to maintain 3m safety clearance.",
            "source_system": "HERO",
            "latitude": 30.2458,
            "longitude": 77.0125,
            "s_latitude": 30.2450,
            "s_longitude": 77.0120,
            "e_latitude": 30.2465,
            "e_longitude": 77.0130,
            "ie_name": "Col. R. K. Sharma",
            "ie_phone_number": "+91 9876543210",
            "ie_photo_needed": False,
        },
        {
            "hindrance_id": "HND-2026-103",
            "title": "NHAI Highway Crossing ROW Permission Delay",
            "hindrance_type": "Architecture change Involved",
            "sub_hindrance_type": "Permission issue from local authority",
            "category": "Architecture change Involved",
            "sub_category": "Permission issue from local authority",
            "severity": "HIGH",
            "status": "APPROVED",
            "chainage": "CH 08+100 to 08+180 (80m)",
            "chainage_from": "08+100",
            "chainage_to": "08+180",
            "district": "Karnal",
            "block": "Gharaunda",
            "section": "Ring-A Feeder Route",
            "location": "NH-44 Crossing km 112",
            "contractor": "Naveen Telecom Network",
            "department": "NHAI Project Unit Panipat",
            "logged_date": date(2026, 10, 9),
            "target_date": date(2026, 10, 22),
            "description": "National Highway NH-44 crossing approval submitted. Demand note received; bank guarantee verification in progress with nodal office.",
            "mitigation": "Demand note fee of ₹1,45,000 processed. Expedited clearance meeting requested with Project Director NHAI.",
            "source_system": "HERO",
            "latitude": 29.5412,
            "longitude": 76.9723,
            "s_latitude": 29.5410,
            "s_longitude": 76.9720,
            "e_latitude": 29.5415,
            "e_longitude": 76.9725,
            "ie_name": "Er. Deepesh Rawat",
            "ie_phone_number": "+91 9811223344",
            "ie_photo_needed": True,
            "approved_hindrance": {
                "hindranceId": "HND-2026-103",
                "hindranceType": "Architecture change Involved",
                "subHindranceType": "Permission issue from local authority",
                "description": "National Highway NH-44 crossing approval submitted.",
                "status": "APPROVED",
                "remarks": "Approved with permission granted by NHAI Panipat.",
                "latitude": 29.5412,
                "longitude": 76.9723
            }
        },
        {
            "hindrance_id": "HND-2026-102",
            "title": "Hard Basalt Rock Strata at 2.8m Depth",
            "hindrance_type": "Architecture change Involved",
            "sub_hindrance_type": "Hard Rock",
            "category": "Architecture change Involved",
            "sub_category": "Hard Rock",
            "severity": "HIGH",
            "status": "IN_PROGRESS",
            "chainage": "CH 21+400 to 21+750 (350m)",
            "chainage_from": "21+400",
            "chainage_to": "21+750",
            "district": "Hisar",
            "block": "Hansi-1",
            "section": "GP Sisai to GP Kheri",
            "location": "Sisai Hillock Bend",
            "contractor": "Harpaal Infra Development",
            "department": "Geology & Mining / Project Tech",
            "logged_date": date(2026, 10, 5),
            "target_date": date(2026, 10, 20),
            "description": "Machine encountering unweathered quartzitic rock exceeding 140 MPa compressive strength. Standard reamer wearing prematurely.",
            "mitigation": "Mobilizing mud-motor roller cone rock bits and high-viscosity bentonite polymer mix from central depot.",
            "source_system": "HERO",
            "latitude": 29.1124,
            "longitude": 75.9541,
            "s_latitude": 29.1120,
            "s_longitude": 75.9540,
            "e_latitude": 29.1130,
            "e_longitude": 75.9545,
        },
        {
            "hindrance_id": "HND-2026-101",
            "title": "Irrigation Canal Siphon Embankment Clearance",
            "hindrance_type": "Linear",
            "sub_hindrance_type": "Low Depth",
            "category": "Linear",
            "sub_category": "Low Depth",
            "severity": "MEDIUM",
            "status": "DRAFT",
            "chainage": "CH 03+650 to 03+720 (70m)",
            "chainage_from": "03+650",
            "chainage_to": "03+720",
            "district": "Sonipat",
            "block": "Ganaur",
            "section": "Western Yamuna Canal Spurt",
            "location": "Canal Cross Syphon km 14",
            "contractor": "Shree Shyam Enterprises",
            "department": "Haryana Irrigation Dept",
            "logged_date": date(2026, 10, 14),
            "target_date": date(2026, 10, 28),
            "description": "HDD bore path passes 4.5m beneath lined distributary canal. Requires canal engineer permission and bund stability certification.",
            "mitigation": "Engineering profile drawings submitted. Field inspection slated for Monday with Sub-Divisional Officer.",
            "source_system": "HERO",
            "latitude": 29.0432,
            "longitude": 77.0189,
        },
        {
            "hindrance_id": "HND-2026-100",
            "title": "Gram Panchayat Village Road Trenching Dispute",
            "hindrance_type": "Architecture change Involved",
            "sub_hindrance_type": "Local objection on private land",
            "category": "Architecture change Involved",
            "sub_category": "Local objection on private land",
            "severity": "MEDIUM",
            "status": "RESOLVED",
            "chainage": "CH 01+200 to 01+450 (250m)",
            "chainage_from": "01+200",
            "chainage_to": "01+450",
            "district": "Rohtak",
            "block": "Kalanaur",
            "section": "GP Anwal Village Approach",
            "location": "Anwal Main Bazaar Street",
            "contractor": "Premium Infra Solutions",
            "department": "Block Development Officer (BDO)",
            "logged_date": date(2026, 10, 1),
            "target_date": date(2026, 10, 10),
            "resolved_date": date(2026, 10, 8),
            "description": "Local panchayat raised objection regarding paver block dismantling along village main street.",
            "mitigation": "Tri-party agreement executed with Sarpanch. Contractor committed to restoring paver blocks within 48h of duct laying. Clearance granted.",
            "source_system": "HERO",
            "latitude": 28.8415,
            "longitude": 76.5123,
            "approved_hindrance": {
                "hindranceId": "HND-2026-100",
                "hindranceType": "Architecture change Involved",
                "subHindranceType": "Local objection on private land",
                "description": "Local panchayat raised objection regarding paver block dismantling along village main street.",
                "status": "RESOLVED",
                "remarks": "Resolved via Tri-party agreement with Sarpanch."
            }
        },
        {
            "hindrance_id": "HND-2026-099",
            "title": "State Highway SH-12 Culvert Expansion",
            "hindrance_type": "Architecture change Involved",
            "sub_hindrance_type": "Road Expansion",
            "category": "Architecture change Involved",
            "sub_category": "Road Expansion",
            "severity": "LOW",
            "status": "RESOLVED",
            "chainage": "CH 05+400 to 05+480 (80m)",
            "chainage_from": "05+400",
            "chainage_to": "05+480",
            "district": "Panipat",
            "block": "Samalkha",
            "section": "SH-12 Feeder Alignment",
            "location": "Culvert 18/2",
            "contractor": "Naveen Telecom Network",
            "department": "Haryana PWD B&R",
            "logged_date": date(2026, 9, 25),
            "target_date": date(2026, 10, 5),
            "resolved_date": date(2026, 10, 4),
            "description": "PWD ongoing widening of box culvert required alignment shift of duct bundle 4 meters outwards into designated utility corridor.",
            "mitigation": "Revised survey profile submitted and approved by PWD Executive Engineer. Trenching resumed with shifted corridor.",
            "source_system": "HERO",
            "latitude": 29.2341,
            "longitude": 76.9945,
            "approved_hindrance": {
                "hindranceId": "HND-2026-099",
                "hindranceType": "Architecture change Involved",
                "subHindranceType": "Road Expansion",
                "description": "PWD ongoing widening of box culvert required alignment shift.",
                "status": "RESOLVED",
                "remarks": "Shifted utility corridor approved."
            }
        }
    ]

    for item in initial_data:
        h_id = item["hindrance_id"]
        obj, created = Hindrance.objects.update_or_create(
            hindrance_id=h_id,
            defaults=item
        )
        if not obj.proposed_hindrance:
            obj.proposed_hindrance = obj.build_proposed_details()
        if not obj.field_data:
            obj.field_data = obj.to_hindrance_task_data_json()
        if not obj.approval_history:
            obj.approval_history = [
                {
                    "action": "RECORD_SEEDED",
                    "status": obj.status,
                    "user": "System Seed",
                    "timestamp": timezone.now().isoformat(),
                    "remarks": obj.remarks or "Initial seeded data."
                }
            ]
        obj.save()
        action = "Created" if created else "Updated"
        print(f"[{action}] Hindrance {h_id} - {item['title']} (Status: {obj.status})")

    print("\nHindrance seeding complete! Total records:", Hindrance.objects.count())

if __name__ == '__main__':
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if sys.path and sys.path[0] != backend_dir:
        sys.path.pop(0)
    sys.path.insert(0, backend_dir)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    django.setup()
    seed()
