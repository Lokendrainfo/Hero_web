from django.core.management.base import BaseCommand
from decimal import Decimal
from apps.expenses.models import ExpenseCategory, ExpenseSubCategory

PREDEFINED_EXPENSE_MASTERS = [
    {
        "code": "HDD_TRACTOR_TROLLEY_TANKER",
        "name": "Tractor + Trolley + Tanker - HDD Works",
        "uom": "Lumpsum",
        "default_quantity": Decimal("1.00"),
        "default_rate": Decimal("38000.00"),
        "payment_type": "FIXED_MONTHLY",
        "requires_proof": False,
        "order": 1
    },
    {
        "code": "HDD_CUSTOMIZED_TROLLEY",
        "name": "Customized Trolley for HDD Movement",
        "uom": None,
        "default_quantity": None,
        "default_rate": None,
        "payment_type": "FIXED_MONTHLY",
        "requires_proof": False,
        "order": 2
    },
    {
        "code": "HDD_WATER_CHARGES",
        "name": "Water Charges",
        "uom": "Per Shot",
        "default_quantity": Decimal("60.00"),
        "default_rate": Decimal("250.00"),
        "payment_type": "FIXED_MONTHLY",
        "requires_proof": False,
        "order": 3
    },
    {
        "code": "HDD_STAY_TRAVEL_FOOD",
        "name": "Stay, Travel and Fooding for Whole Team",
        "uom": "Lumpsum",
        "default_quantity": Decimal("1.00"),
        "default_rate": Decimal("10000.00"),
        "payment_type": "FIXED_MONTHLY",
        "requires_proof": False,
        "order": 4
    },
    {
        "code": "HDD_FUEL_TRANSPORTATION",
        "name": "HDD Fuel Transportation",
        "uom": "Lumpsum",
        "default_quantity": Decimal("30.00"),
        "default_rate": Decimal("200.00"),
        "payment_type": "FIXED_MONTHLY",
        "requires_proof": False,
        "order": 5
    },
    {
        "code": "HDD_WAREHOUSE",
        "name": "Ware-House",
        "uom": "Monthly",
        "default_quantity": Decimal("1.00"),
        "default_rate": Decimal("5000.00"),
        "payment_type": "FIXED_MONTHLY",
        "requires_proof": False,
        "order": 6
    },
    {
        "code": "HDD_LOCAL_ROW_INCENTIVE",
        "name": "Local-Row-Incentive",
        "uom": "8 Km",
        "default_quantity": Decimal("2.00"),
        "default_rate": Decimal("10000.00"),
        "payment_type": "FIXED_MONTHLY",
        "requires_proof": False,
        "order": 7
    }
]

CATEGORY_SUBCATEGORY_DATA = [
    {
        "name": "Manpower",
        "code": "MANPOWER",
        "subcategories": [
            "HDD Operator", "Supervisor", "Helper", "Labour",
            "Technician", "Overtime", "Daily Wages", "Other Manpower"
        ]
    },
    {
        "name": "HDD Machine",
        "code": "HDD_MACHINE",
        "subcategories": [
            "Machine Rental", "Machine Mobilization", "Machine Demobilization",
            "Machine Hour Charges", "Machine Repair", "Machine Spare Parts", "Machine Maintenance"
        ]
    },
    {
        "name": "Fuel",
        "code": "FUEL",
        "subcategories": [
            "Diesel", "Petrol", "DG Fuel", "Vehicle Fuel", "Other Fuel"
        ]
    },
    {
        "name": "Drilling Fluid",
        "code": "DRILLING_FLUID",
        "subcategories": [
            "Bentonite", "Polymer", "Additives", "Mixing Chemicals", "Other Drilling Fluid"
        ]
    },
    {
        "name": "HDD Tools & Consumables",
        "code": "HDD_TOOLS",
        "subcategories": [
            "Drill Rod", "Drill Bit", "Reamer", "Cutter", "Swivel",
            "Roller", "Clamp", "Hose", "Coupler", "Other Tool"
        ]
    },
    {
        "name": "Duct / Fiber Material",
        "code": "DUCT_FIBER_MATERIAL",
        "subcategories": [
            "HDPE Duct", "Microduct", "Coupler", "Connector", "End Cap",
            "Pulling Rope", "Marker", "Other Material"
        ]
    },
    {
        "name": "Excavation",
        "code": "EXCAVATION",
        "subcategories": [
            "JCB", "Excavator", "Entry Pit", "Exit Pit",
            "Excavation Labour", "Soil Filling", "Debris Removal"
        ]
    },
    {
        "name": "Road Restoration",
        "code": "ROAD_RESTORATION",
        "subcategories": [
            "Asphalt", "Concrete", "Paver Block", "Road Cutting",
            "Restoration Labour", "Other Restoration"
        ]
    },
    {
        "name": "Transportation",
        "code": "TRANSPORTATION",
        "subcategories": [
            "HDD Machine Transportation", "Material Transportation", "Truck",
            "Tempo", "Tractor", "Crane", "Local Transportation", "Loading / Unloading"
        ]
    },
    {
        "name": "Equipment Rental",
        "code": "EQUIPMENT_RENTAL",
        "subcategories": [
            "Excavator", "JCB", "Crane", "Compressor",
            "Water Tanker", "Welding Machine", "Other Equipment"
        ]
    },
    {
        "name": "Water",
        "code": "WATER",
        "subcategories": [
            "Water Tanker", "Drilling Water", "Mixing Water"
        ]
    },
    {
        "name": "Vehicle",
        "code": "VEHICLE",
        "subcategories": [
            "Crew Vehicle", "Vehicle Rental", "Parking", "Toll", "Vehicle Repair"
        ]
    },
    {
        "name": "Accommodation",
        "code": "ACCOMMODATION",
        "subcategories": [
            "Hotel", "Room Rent", "Crew Accommodation"
        ]
    },
    {
        "name": "Food & Daily Allowance",
        "code": "FOOD_ALLOWANCE",
        "subcategories": [
            "Food", "Meals", "Tea / Water", "Travelling Allowance", "Daily Allowance"
        ]
    },
    {
        "name": "Permits & Permissions",
        "code": "PERMITS_PERMISSIONS",
        "subcategories": [
            "Road Permission", "Municipal Permission", "Highway Permission",
            "Railway Permission", "Authority Charges", "Other Permission"
        ]
    },
    {
        "name": "Safety",
        "code": "SAFETY",
        "subcategories": [
            "Helmet", "Safety Shoes", "Safety Jacket", "Gloves",
            "Barricading", "Cones", "Safety Signage", "Other Safety"
        ]
    },
    {
        "name": "Testing & Survey",
        "code": "TESTING_SURVEY",
        "subcategories": [
            "GPS Survey", "Survey Charges", "Duct Testing",
            "Fiber Testing", "OTDR", "Inspection"
        ]
    },
    {
        "name": "Maintenance & Repair",
        "code": "MAINTENANCE_REPAIR",
        "subcategories": [
            "Machine Repair", "Vehicle Repair", "Equipment Repair", "Tool Repair", "Spare Parts"
        ]
    },
    {
        "name": "Subcontractor",
        "code": "SUBCONTRACTOR",
        "subcategories": [
            "HDD Contractor", "Excavation Contractor", "Restoration Contractor",
            "Transportation Contractor", "Labour Contractor", "Other Subcontractor"
        ]
    },
    {
        "name": "Communication",
        "code": "COMMUNICATION",
        "subcategories": [
            "SIM", "Mobile", "Internet", "Walkie Talkie"
        ]
    },
    {
        "name": "Miscellaneous",
        "code": "MISCELLANEOUS",
        "subcategories": [
            "General Site Expense", "Other"
        ]
    }
]

def seed_categories():
    # 1. Seed Predefined Fixed Monthly Expense Master Records
    for item in PREDEFINED_EXPENSE_MASTERS:
        cat_obj, _ = ExpenseCategory.objects.get_or_create(
            code=item["code"],
            defaults={
                "name": item["name"],
                "uom": item["uom"],
                "default_quantity": item["default_quantity"],
                "default_rate": item["default_rate"],
                "payment_type": item["payment_type"],
                "requires_proof": item["requires_proof"],
                "order": item["order"],
                "is_active": True
            }
        )
        # Update attributes to ensure exact state idempotently
        cat_obj.name = item["name"]
        cat_obj.uom = item["uom"]
        cat_obj.default_quantity = item["default_quantity"]
        cat_obj.default_rate = item["default_rate"]
        cat_obj.payment_type = item["payment_type"]
        cat_obj.requires_proof = item["requires_proof"]
        cat_obj.order = item["order"]
        cat_obj.is_active = True
        cat_obj.save() # Triggers calculate_monthly_cost()

    # 2. Seed Standard Operational Expense Categories & Subcategories
    start_order = len(PREDEFINED_EXPENSE_MASTERS) + 1
    for cat_idx, cat_data in enumerate(CATEGORY_SUBCATEGORY_DATA, start=start_order):
        cat_obj, _ = ExpenseCategory.objects.get_or_create(
            code=cat_data["code"],
            defaults={
                "name": cat_data["name"],
                "order": cat_idx,
                "is_active": True
            }
        )
        if cat_obj.name != cat_data["name"] or cat_obj.order != cat_idx:
            cat_obj.name = cat_data["name"]
            cat_obj.order = cat_idx
            cat_obj.save()

        for sub_idx, sub_name in enumerate(cat_data["subcategories"], start=1):
            sub_code = sub_name.upper().replace(' ', '_').replace('/', '_').replace('&', 'AND')
            sub_obj, _ = ExpenseSubCategory.objects.get_or_create(
                category=cat_obj,
                name=sub_name,
                defaults={
                    "code": sub_code,
                    "order": sub_idx,
                    "is_active": True
                }
            )
            if sub_obj.order != sub_idx or not sub_obj.is_active:
                sub_obj.order = sub_idx
                sub_obj.is_active = True
                sub_obj.save()

class Command(BaseCommand):
    help = 'Seed Predefined Expense Master Records and Operational Expense Categories'

    def handle(self, *args, **options):
        seed_categories()
        predefined_count = ExpenseCategory.objects.filter(code__in=[p['code'] for p in PREDEFINED_EXPENSE_MASTERS]).count()
        defined_monthly_total = sum(c.monthly_cost for c in ExpenseCategory.objects.filter(code__in=[p['code'] for p in PREDEFINED_EXPENSE_MASTERS]) if c.monthly_cost is not None)
        self.stdout.write(self.style.SUCCESS(
            f"Successfully seeded {predefined_count} predefined expense masters (Total Monthly Cost: INR {defined_monthly_total:,.2f}) and {ExpenseCategory.objects.count()} total categories."
        ))
