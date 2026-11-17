import os
import sys
import django
from datetime import date

def seed():
    from apps.tasks.models import Hindrance

    initial_data = [
        {
            "hindrance_id": "HND-2026-104",
            "title": "GAIL High-Pressure Gas Pipeline Crossing",
            "category": "Utility Crossing",
            "severity": "CRITICAL",
            "status": "ESCALATED",
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
            "longitude": 77.0125
        },
        {
            "hindrance_id": "HND-2026-103",
            "title": "NHAI Highway Crossing ROW Permission Delay",
            "category": "ROW Clearance",
            "severity": "HIGH",
            "status": "IN_REVIEW",
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
            "longitude": 76.9723
        },
        {
            "hindrance_id": "HND-2026-102",
            "title": "Hard Basalt Rock Strata at 2.8m Depth",
            "category": "Strata Obstacle",
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
            "longitude": 75.9541
        },
        {
            "hindrance_id": "HND-2026-101",
            "title": "Irrigation Canal Siphon Embankment Clearance",
            "category": "Waterway / Canal",
            "severity": "MEDIUM",
            "status": "OPEN",
            "chainage": "CH 03+650 to 03+720 (70m)",
            "chainage_from": "03+650",
            "chainage_to": "03+720",
            "district": "Sonipat",
            "block": "Ganaur",
            "section": "Western Yamuna Canal Spurt",
            "location": "RD 42 Distributary",
            "contractor": "Shree Shyam Enterprises",
            "department": "Haryana Irrigation Dept",
            "logged_date": date(2026, 10, 14),
            "target_date": date(2026, 10, 28),
            "description": "HDD bore path passes 4.5m beneath lined distributary canal. Requires canal engineer permission and bund stability certification.",
            "mitigation": "Engineering profile drawings submitted. Field inspection slated for Monday with Sub-Divisional Officer.",
            "source_system": "HERO",
            "latitude": 29.1321,
            "longitude": 77.0145
        },
        {
            "hindrance_id": "HND-2026-100",
            "title": "Gram Panchayat Village Road Trenching Dispute",
            "category": "Local ROW",
            "severity": "MEDIUM",
            "status": "RESOLVED",
            "chainage": "CH 01+200 to 01+450 (250m)",
            "chainage_from": "01+200",
            "chainage_to": "01+450",
            "district": "Rohtak",
            "block": "Kalanaur",
            "section": "GP Anwal Village Approach",
            "location": "Main Bazaar Road",
            "contractor": "Premium Infra Solutions",
            "department": "Block Development Officer (BDO)",
            "logged_date": date(2026, 10, 1),
            "target_date": date(2026, 10, 10),
            "resolved_date": date(2026, 10, 8),
            "description": "Local panchayat raised objection regarding paver block dismantling along village main street.",
            "mitigation": "Tri-party agreement executed with Sarpanch. Contractor committed to restoring paver blocks within 48h of duct laying. Clearance granted.",
            "source_system": "HERO",
            "latitude": 28.8341,
            "longitude": 76.4021
        },
        {
            "hindrance_id": "HND-2026-099",
            "title": "State Electricity 33kV Underground Power Cable Clash",
            "category": "Utility Crossing",
            "severity": "CRITICAL",
            "status": "RESOLVED",
            "chainage": "CH 11+820 to 11+860 (40m)",
            "chainage_from": "11+820",
            "chainage_to": "11+860",
            "district": "Faridabad",
            "block": "Ballabgarh",
            "section": "Substation Feeder Link",
            "location": "Sector 58 Junction",
            "contractor": "Naveen Telecom Network",
            "department": "DHBVN Electricity Board",
            "logged_date": date(2026, 9, 28),
            "target_date": date(2026, 10, 8),
            "resolved_date": date(2026, 10, 7),
            "description": "Uncharted 33kV high-voltage transmission line located along proposed trench route.",
            "mitigation": "Joint cable detection conducted. Depth profile revised to 3.8m beneath power conduit with concrete slab markers.",
            "source_system": "HERO",
            "latitude": 28.3245,
            "longitude": 77.3198
        }
    ]

    created = 0
    for item in initial_data:
        h_id = item["hindrance_id"]
        if not Hindrance.objects.filter(hindrance_id=h_id).exists():
            Hindrance.objects.create(**item)
            created += 1
    print(f"Seeded {created} hindrances (Total in DB: {Hindrance.objects.count()})")

if __name__ == '__main__':
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    django.setup()
    seed()
