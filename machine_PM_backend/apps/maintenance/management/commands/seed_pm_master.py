import os
import openpyxl
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceFrequencyMaster,
    RoleFrequencyMapping,
)

FREQUENCIES_SEED = [
    {
        "code": "DAILY",
        "name": "Daily",
        "interval_hours": None,
        "interval_days": 1,
        "due_threshold_pct": 0.90,
        "description": "Daily pre-operating & routine preventive maintenance checklist (Operator)",
        "sort_order": 1,
    },
    {
        "code": "50_HOURS",
        "name": "50 Hours",
        "interval_hours": 50,
        "interval_days": None,
        "due_threshold_pct": 0.90,
        "description": "50 Engine Hours greasing & guide maintenance checklist (Operator)",
        "sort_order": 2,
    },
    {
        "code": "100_HOURS",
        "name": "100 Hours",
        "interval_hours": 100,
        "interval_days": None,
        "due_threshold_pct": 0.90,
        "description": "100 Engine Hours electrical, drive & hydraulic system inspection (Field Engineer)",
        "sort_order": 3,
    },
    {
        "code": "250_HOURS",
        "name": "250 Hours",
        "interval_hours": 250,
        "interval_days": None,
        "due_threshold_pct": 0.90,
        "description": "250 Engine Hours track roller, radiator & air cleaner inspection (Field Engineer)",
        "sort_order": 4,
    },
    {
        "code": "500_HOURS",
        "name": "500 Hours",
        "interval_hours": 500,
        "interval_days": None,
        "due_threshold_pct": 0.90,
        "description": "500 Engine Hours hydraulic filter, gearbox oil & lever service (Area Manager)",
        "sort_order": 5,
    },
    {
        "code": "1000_HOURS",
        "name": "1000 Hours",
        "interval_hours": 1000,
        "interval_days": None,
        "due_threshold_pct": 0.90,
        "description": "1000 Engine Hours major hydraulic & engine service overhaul (Area Manager)",
        "sort_order": 6,
    },
]

CATEGORIES_SEED = [
    {
        "code": "MACHINE",
        "name": "Machine",
        "description": "Apollo HDD A600V2 Machine mechanical, hydraulic, track, and vise activities",
        "is_checkable": True,
        "sort_order": 1,
    },
    {
        "code": "ENGINE",
        "name": "Engine",
        "description": "Apollo HDD A600V2 Engine, cooling, filtration, and electrical activities",
        "is_checkable": True,
        "sort_order": 2,
    },
    {
        "code": "GENERAL_SAFETY_GUIDELINES",
        "name": "General Safety Guidelines",
        "description": "Pre-operating instructions, drill rod usage, vise clamp, gearbox travel, and general don'ts",
        "is_checkable": False,
        "sort_order": 3,
    },
]

ROLE_FREQUENCY_SEED = [
    ("OPERATOR", "Operator", "DAILY"),
    ("OPERATOR", "Operator", "50_HOURS"),
    ("FIELD_ENGINEER", "Field Engineer", "100_HOURS"),
    ("FIELD_ENGINEER", "Field Engineer", "250_HOURS"),
    ("AREA_MANAGER", "Area Manager", "500_HOURS"),
    ("AREA_MANAGER", "Area Manager", "1000_HOURS"),
    ("ADMIN", "Admin", "DAILY"),
    ("ADMIN", "Admin", "50_HOURS"),
    ("ADMIN", "Admin", "100_HOURS"),
    ("ADMIN", "Admin", "250_HOURS"),
    ("ADMIN", "Admin", "500_HOURS"),
    ("ADMIN", "Admin", "1000_HOURS"),
]

# Exact Apollo HDD Model A600V2 Routine Maintenance Schedule (used as authoritative fallback if xlsx path unavailable)
SOP_ROUTINE_ACTIVITIES = [
    # Machine (21 activities)
    ("MACHINE", "Battery Voltage – Check", ["100_HOURS"], "", "100 Hrs", ""),
    ("MACHINE", "Control Lever Check", ["500_HOURS"], "", "500 Hrs", ""),
    ("MACHINE", "Front Track Roller - Check", ["250_HOURS", "500_HOURS", "1000_HOURS"], "", "250 Hrs / 500 Hrs / 1000 Hrs", ""),
    ("MACHINE", "Fuel tank – Fill", ["DAILY"], "", "Daily", "Check level of fuel in the tank before starting work."),
    ("MACHINE", "Ground Drive System - Check", ["100_HOURS"], "", "100 Hrs", ""),
    ("MACHINE", "Hydraulic Oil Filters – Change", ["500_HOURS", "1000_HOURS"], "", "500 Hrs / 1000 Hrs", ""),
    ("MACHINE", "Hydraulic Oil Level- Check", ["DAILY"], "", "Daily", "Hyd Oil level check and top up if required. Check all leakage at joint points of hydraulic system and gearbox."),
    ("MACHINE", "Hydraulic System – Check", ["100_HOURS", "1000_HOURS"], "", "100 Hrs / 1000 Hrs", ""),
    ("MACHINE", "Hydraulic Enable- Check", ["100_HOURS"], "", "100 Hrs", ""),
    ("MACHINE", "Overall Machine – Check", ["100_HOURS"], "", "100 Hrs", ""),
    ("MACHINE", "Auto Greaser", [], "NA", "NA", ""),
    ("MACHINE", "Power Vise – Greasing", ["DAILY"], "", "Daily", "Greasing of all points Daily in Vise Assy, Guide Rollers Assy, Cylinder Pin & Bushings, and Water Swivels. Washing of Vise Assy (Weekly)."),
    ("MACHINE", "Power Vise Clamp Cylinders - Greasing", ["DAILY"], "", "Daily", "Total 16 greasing points in vise clamp that should be greased on daily basis."),
    ("MACHINE", "Power Vise Rotation Cylinder – Greasing", ["DAILY"], "", "Daily", ""),
    ("MACHINE", "Rack Frame Pivot Cylinders - Greasing", ["DAILY"], "", "Daily", ""),
    ("MACHINE", "Roller Guides – Greasing", ["50_HOURS"], "", "50 Hrs", "Greasing of Guide Rollers Assembly."),
    ("MACHINE", "Rotation Gearbox Position Bars – Greasing", ["50_HOURS"], "", "50 Hrs", ""),
    ("MACHINE", "Rotation Gearbox support Roller-Greasing", ["50_HOURS"], "", "50 Hrs", ""),
    ("MACHINE", "Track Gearbox Oil Level – Check", ["500_HOURS"], "Every 500 hrs change", "Every 500 hrs change", "Check gearbox oil level and change every 500 hrs."),
    ("MACHINE", "Track Tension – Adjust", [], "As per Requirement", "As per Requirement", "Track tension check and tighten if required."),
    ("MACHINE", "Vise Jaw Grips", [], "Replace when required", "Replace when required", ""),
    # Engine (7 activities)
    ("ENGINE", "Battery Terminals – Clean", ["500_HOURS"], "", "500 Hrs", ""),
    ("ENGINE", "Coolant in radiator – Check", ["DAILY"], "Coolant level check and Top up if required.", "Daily", "Coolant level check and Top up if required."),
    ("ENGINE", "Engine Oil and Filters – Change (Engine Service)", ["1000_HOURS"], "Every 300 Hours/ 600 Hours/ 1000 Hours", "Every 300 Hours/ 600 Hours/ 1000 Hours", "Engine Oil and Filters – Change (Engine Service): Every 300 Hours / 600 Hours / 1000 Hours."),
    ("ENGINE", "Fan and Drive Belt – Check", ["DAILY"], "", "Daily", ""),
    ("ENGINE", "Radiator and Cooler – Clean", ["250_HOURS"], "", "250 Hrs", ""),
    ("ENGINE", "Air Cleaner", ["250_HOURS"], "Clean/check if required", "250 Hrs", "Clean/check if required."),
    ("ENGINE", "Engine oil level - Check", ["DAILY"], "", "Daily", "Engine oil level is correct (Dipstick at 'H' mark), Top up if required."),
]

SPECIAL_INSTRUCTIONS_BY_DESC = {
    desc: instr for _, desc, _, _, _, instr in SOP_ROUTINE_ACTIVITIES if instr
}

SOP_SAFETY_GUIDELINES = [
    {
        "section_key": "PRE_OPERATING",
        "title": "PRE-OPERATING INSTRUCTION",
        "service_interval": "Before starting the machine",
        "remarks": "Mandatory before every shift / machine startup",
        "special_instructions": (
            "Before the starting of the machine user must know about all the safety instructions and follow those instructions.\n\n"
            "1. Wear all safety equipment (PPE).\n"
            "2. Check the below points before starting the work:\n"
            "   a. Greasing of all points Daily in Vise Assy, Guide Rollers Assy, Cylinder Pin & Bushings, and Water Swivels.\n"
            "   b. Check all leakage at joint point of hydraulic system and gearbox.\n"
            "   c. Check level of fuel in the tank.\n"
            "   d. Coolant level check and Top up if required.\n"
            "   e. Hyd Oil level check and Top up if required.\n"
            "   f. Engine oil level is correct (Dipstick at \"H\" mark), Top up if required.\n"
            "   g. Check Water pump connection. (Suction hose should be minimum 2 inch or 3 inch connection).\n"
            "   h. Ensure that the Daily / Regular Checking / Routine Maintenance is performed before starting of machine.\n"
            "   i. Cleaning of all electrical sensors.\n"
            "   j. Track tension check and tighten if required.\n"
            "   k. Washing of Vise Assy (Weekly)."
        ),
        "sort_order": 1,
    },
    {
        "section_key": "DRILL_ROD_USES",
        "title": "DRILL ROD USES INSTRUCTION",
        "service_interval": "During drill rod operations",
        "remarks": "For longer life of drill rods",
        "special_instructions": (
            "For longer life of drill rods, the following steps have to be followed by the machine operator:\n\n"
            "1. Clean the threads as per requirement with high pressure water.\n"
            "2. Lubricate male & female threads before using.\n"
            "3. Replace sub saver when thread condition is not in good condition.\n"
            "4. Rotate drill rods weekly.\n"
            "5. Carefully engage male & female threads.\n"
            "6. Tighten joints properly with required torque.\n"
            "7. Don't bend more than the specified radius (Refer product specification)."
        ),
        "sort_order": 2,
    },
    {
        "section_key": "VISE_CLAMP",
        "title": "1. Vise Clamp",
        "service_interval": "Daily / Every Rod Connection",
        "remarks": "16 greasing points & Copper Greasing",
        "special_instructions": (
            "1. Greasing Points - Total 16 points in vise clamp that should be greased on daily basis.\n"
            "2. Greasing - Lubricating drill pipe threads (Box/Pin) on each connection (Copper Greasing)."
        ),
        "sort_order": 3,
    },
    {
        "section_key": "GEAR_BOX",
        "title": "2. Gear Box positioning during travelling",
        "service_interval": "During machine travelling / marching",
        "remarks": "Mandatory carriage positioning",
        "special_instructions": (
            "1. Rotation gearbox position while travelling should be all the way back side on rack frame.\n"
            "2. Rack frame position while travelling parallel to ground surface."
        ),
        "sort_order": 4,
    },
    {
        "section_key": "GENERAL_DONTS",
        "title": "3. General Guidelines Don'ts",
        "service_interval": "All machine operations",
        "remarks": "Critical operational safety & equipment protection rules",
        "special_instructions": (
            "1. Machine marching/travels should not exceed more than 500 mtr at one stretch.\n"
            "2. Water pump suction hose should be 2\" Inch and not 40 MM Duct.\n"
            "3. Anchoring should be buried completely into the ground; if halfway it will damage shaft of motor.\n"
            "4. Machine track while operating should have ground contact; lifting of machine off the ground creates extra pressure on hydraulic cylinders and causes damage."
        ),
        "sort_order": 5,
    },
]


def _parse_sop_excel(excel_path: str):
    if not excel_path or not os.path.exists(excel_path):
        return None

    wb = openpyxl.load_workbook(excel_path, data_only=True)
    sheet = wb['Table 1'] if 'Table 1' in wb.sheetnames else wb.active
    col_freq_map = {
        3: 'DAILY',
        4: '50_HOURS',
        5: '100_HOURS',
        6: '250_HOURS',
        7: '500_HOURS',
        8: '1000_HOURS',
    }
    freq_labels = {
        'DAILY': 'Daily',
        '50_HOURS': '50 Hrs',
        '100_HOURS': '100 Hrs',
        '250_HOURS': '250 Hrs',
        '500_HOURS': '500 Hrs',
        '1000_HOURS': '1000 Hrs',
    }

    parsed = []
    current_category = None
    for r in range(6, sheet.max_row + 1):
        desc = sheet.cell(row=r, column=2).value
        if not desc:
            continue
        desc_clean = str(desc).strip()
        if desc_clean.lower() in ('machine', 'engine'):
            current_category = desc_clean.upper()
            continue
        if not current_category:
            continue

        raw_rem = sheet.cell(row=r, column=9).value
        remarks = str(raw_rem).replace('\n', ' ').strip() if raw_rem is not None else ''
        if remarks.lower() in ('none', 'nan'):
            remarks = ''

        freqs = []
        for col_idx, fcode in col_freq_map.items():
            if sheet.cell(row=r, column=col_idx).value:
                freqs.append(fcode)

        # Preserve Engine Service 300/600/1000 Hours mapping at 1000_HOURS when no checkmark column is ticked
        if not freqs and '1000 hours' in remarks.lower():
            freqs = ['1000_HOURS']

        service_interval = remarks if remarks else ' / '.join(freq_labels[f] for f in freqs)
        special_instr = SPECIAL_INSTRUCTIONS_BY_DESC.get(desc_clean, '')
        parsed.append((current_category, desc_clean, freqs, remarks, service_interval, special_instr))

    return parsed if parsed else None


@transaction.atomic
def seed_pm_masters(excel_path: str | None = None):
    freq_objs = {}
    for fdata in FREQUENCIES_SEED:
        obj, _ = MaintenanceFrequencyMaster.objects.update_or_create(
            code=fdata['code'],
            defaults={k: v for k, v in fdata.items() if k != 'code'},
        )
        freq_objs[obj.code] = obj

    cat_objs = {}
    for cdata in CATEGORIES_SEED:
        obj, _ = MaintenanceCategoryMaster.objects.update_or_create(
            code=cdata['code'],
            defaults={k: v for k, v in cdata.items() if k != 'code'},
        )
        cat_objs[obj.code] = obj

    for role_code, role_name, freq_code in ROLE_FREQUENCY_SEED:
        RoleFrequencyMapping.objects.update_or_create(
            role_code=role_code,
            frequency=freq_objs[freq_code],
            defaults={'role_name': role_name, 'can_view': True, 'can_submit': True, 'is_active': True},
        )

    activities = _parse_sop_excel(excel_path or getattr(settings, 'PM_SOP_EXCEL_PATH', '')) or SOP_ROUTINE_ACTIVITIES

    for idx, (cat_code, desc, freqs, remarks, service_interval, special_instr) in enumerate(activities, start=1):
        prefix = 'MCH' if cat_code == 'MACHINE' else 'ENG'
        item_code = f"SOP-{prefix}-{idx:03d}"
        is_as_required = len(freqs) == 0

        item_obj, _ = MaintenanceChecklistMaster.objects.update_or_create(
            item_code=item_code,
            defaults={
                'category': cat_objs[cat_code],
                'description': desc,
                'remarks': remarks,
                'special_instructions': special_instr,
                'service_interval': service_interval,
                'requires_photo': True,
                'requires_remarks_if_not_completed': True,
                'is_as_required': is_as_required,
                'sort_order': idx,
                'is_active': True,
            },
        )

        for f_idx, f_code in enumerate(freqs, start=1):
            ChecklistFrequencyMapping.objects.update_or_create(
                checklist_item=item_obj,
                frequency=freq_objs[f_code],
                defaults={'is_mandatory': True, 'sort_order': idx, 'is_active': True},
            )

    for g_idx, g in enumerate(SOP_SAFETY_GUIDELINES, start=1):
        item_code = f"SOP-SAF-{g_idx:03d}"
        MaintenanceChecklistMaster.objects.update_or_create(
            item_code=item_code,
            defaults={
                'category': cat_objs['GENERAL_SAFETY_GUIDELINES'],
                'description': g['title'],
                'remarks': g['remarks'],
                'special_instructions': g['special_instructions'],
                'service_interval': g['service_interval'],
                'section_key': g['section_key'],
                'requires_photo': False,
                'requires_remarks_if_not_completed': False,
                'is_as_required': False,
                'sort_order': g['sort_order'],
                'is_active': True,
            },
        )

    return {
        "frequencies": MaintenanceFrequencyMaster.objects.count(),
        "categories": MaintenanceCategoryMaster.objects.count(),
        "checklist_items": MaintenanceChecklistMaster.objects.count(),
        "frequency_mappings": ChecklistFrequencyMapping.objects.count(),
        "role_mappings": RoleFrequencyMapping.objects.count(),
    }


class Command(BaseCommand):
    help = "Seeds Apollo HDD A600V2 Preventive Maintenance masters, frequencies, categories, role mappings, and SOP checklist activities."

    def add_arguments(self, parser):
        parser.add_argument('--excel', type=str, default=None, help='Optional path to SOP Excel file')

    def handle(self, *args, **options):
        summary = seed_pm_masters(excel_path=options.get('excel'))
        self.stdout.write(self.style.SUCCESS(f"PM Masters seeded successfully: {summary}"))

