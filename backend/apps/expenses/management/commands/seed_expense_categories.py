from django.core.management.base import BaseCommand
from apps.expenses.models import ExpenseCategory, ExpenseSubCategory

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
    for cat_idx, cat_data in enumerate(CATEGORY_SUBCATEGORY_DATA, start=1):
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
    help = 'Seed 21 Main Expense Categories and Subcategories for HDD Operational Expense Management System'

    def handle(self, *args, **options):
        seed_categories()
        self.stdout.write(self.style.SUCCESS(f"Successfully seeded {ExpenseCategory.objects.count()} categories and {ExpenseSubCategory.objects.count()} subcategories."))
