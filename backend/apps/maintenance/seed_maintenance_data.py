import sys
import os
import openpyxl

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
import django
django.setup()

from apps.roles.models import Role, Permission, RolePermission
from apps.maintenance.models import MaintenanceChecklistTemplate, SafetyGuideline

def run_seed():
    print("--- 1. Ensuring Roles and Permissions ---")
    fe_role, _ = Role.objects.get_or_create(
        code='FIELD_ENGINEER',
        defaults={'name': 'Field Engineer', 'is_system': True, 'data_scope': 'ALL_DATA'}
    )
    am_role, _ = Role.objects.get_or_create(
        code='AREA_MANAGER',
        defaults={'name': 'Area Manager', 'is_system': True, 'data_scope': 'ALL_DATA'}
    )

    maint_perms = Permission.objects.filter(code__startswith='maintenance.')
    for p in maint_perms:
        RolePermission.objects.get_or_create(role=fe_role, permission=p)
        RolePermission.objects.get_or_create(role=am_role, permission=p)

    op_role = Role.objects.filter(code='OPERATOR').first()
    if op_role:
        for p in maint_perms:
            RolePermission.objects.get_or_create(role=op_role, permission=p)

    print("Roles and permissions configured.")

    print("\n--- 2. Seeding Maintenance Checklist Templates from SOP ---")
    sop_file = r'C:\Users\Lokendra\Downloads\Standard Operating Procedure- A600V2.xlsx'
    
    MaintenanceChecklistTemplate.objects.all().delete()
    
    freq_map = {
        3: 'DAILY',
        4: '50_HOURS',
        5: '100_HOURS',
        6: '250_HOURS',
        7: '500_HOURS',
        8: '1000_HOURS',
    }

    if os.path.exists(sop_file):
        wb = openpyxl.load_workbook(sop_file)
        sheet = wb['Table 1']

        current_category = None
        order_counter = 0

        for r in range(6, 38):
            desc = sheet.cell(row=r, column=2).value
            if not desc:
                continue
            desc = desc.strip()
            if desc in ['Machine', 'Engine']:
                current_category = desc.upper()
                continue
            
            remarks = sheet.cell(row=r, column=9).value or ''
            remarks = str(remarks).strip()
            if remarks.lower() in ['none', 'nan']:
                remarks = ''

            for col_idx, freq_code in freq_map.items():
                val = sheet.cell(row=r, column=col_idx).value
                if val:
                    order_counter += 1
                    MaintenanceChecklistTemplate.objects.get_or_create(
                        category=current_category,
                        description=desc,
                        frequency=freq_code,
                        defaults={
                            'remarks_hint': remarks,
                            'order': order_counter
                        }
                    )

        # Ensure complementary items for comprehensive inspection
        if not MaintenanceChecklistTemplate.objects.filter(frequency='50_HOURS', category='ENGINE').exists():
            MaintenanceChecklistTemplate.objects.create(
                category='ENGINE',
                description='Air Cleaner Dust Cup – Inspect & Clean',
                frequency='50_HOURS',
                remarks_hint='Empty dust cup and check for blockages',
                order=order_counter + 1
            )

        if not MaintenanceChecklistTemplate.objects.filter(frequency='100_HOURS', category='ENGINE').exists():
            MaintenanceChecklistTemplate.objects.create(
                category='ENGINE',
                description='Coolant Hoses & Belt Tension – Detailed Inspection',
                frequency='100_HOURS',
                remarks_hint='Inspect for leaks, cracks and belt tension',
                order=order_counter + 2
            )

    print(f"Total Checklist Templates created: {MaintenanceChecklistTemplate.objects.count()}")
    for freq in ['DAILY', '50_HOURS', '100_HOURS', '250_HOURS', '500_HOURS', '1000_HOURS']:
        m_count = MaintenanceChecklistTemplate.objects.filter(frequency=freq, category='MACHINE').count()
        e_count = MaintenanceChecklistTemplate.objects.filter(frequency=freq, category='ENGINE').count()
        print(f"  [{freq:10s}] -> Machine: {m_count}, Engine: {e_count}, Total: {m_count + e_count}")

    print("\n--- 3. Seeding Apollo HDD A600V2 Safety Guidelines ---")
    SafetyGuideline.objects.all().delete()

    guidelines = [
        {
            'section_key': 'PRE_OPERATING',
            'title': 'Pre-Operating Safety Instructions',
            'subtitle': 'Critical safety checks before machine startup',
            'order': 1,
            'content': (
                "Before starting the machine, every operator must understand and follow all safety instructions:\n\n"
                "1. **Personal Protective Equipment (PPE)**: Wear all safety equipment (Hard Hat, High-Visibility Vest, Safety Boots, Heavy Duty Gloves, Eye Protection, and Ear Defenders).\n"
                "2. **Check the following points before starting the work**:\n"
                "   a. **Greasing**: Greasing of all points Daily in Vise Assembly, Guide Rollers Assembly, Cylinder Pin & Bushings, and Water Swivels.\n"
                "   b. **Leakage Inspection**: Check all leakage at joint points of hydraulic system and gearbox.\n"
                "   c. **Fuel Level**: Check level of fuel in the tank.\n"
                "   d. **Coolant Level**: Coolant level check and Top up if required.\n"
                "   e. **Hydraulic Oil Level**: Hydraulic Oil level check and Top up if required.\n"
                "   f. **Engine Oil Level**: Engine oil level is correct (Dipstick at 'H' mark), Top up if required.\n"
                "   g. **Water Pump Connection**: Check Water pump connection (Suction hose should be minimum 2-inch or 3-inch connection; never 40mm duct).\n"
                "   h. **Routine Maintenance**: Ensure that Daily/Regular Checking/Routine Maintenance is performed before starting machine.\n"
                "   i. **Sensors**: Cleaning of all electrical and position sensors.\n"
                "   j. **Track Tension**: Track tension check and tighten if required.\n"
                "   k. **Vise Assembly Washing**: Washing of Vise Assembly (Weekly)."
            )
        },
        {
            'section_key': 'DRILL_ROD_USES',
            'title': 'Drill Rod Usage Instructions',
            'subtitle': 'Guidelines for maximizing drill rod longevity and preventing breakages',
            'order': 2,
            'content': (
                "For longer life of drill rods, the following steps must be followed by the machine operator:\n\n"
                "1. **Clean Threads**: Clean the threads as per requirement with high-pressure water.\n"
                "2. **Lubricate**: Lubricate male & female threads before using (apply approved Copper Grease).\n"
                "3. **Sub Saver**: Replace sub saver when thread condition is not in good condition.\n"
                "4. **Rotate Rods**: Rotate drill rods weekly to distribute cyclic wear.\n"
                "5. **Engage Threads**: Carefully engage male & female threads without cross-threading.\n"
                "6. **Tighten Properly**: Tighten joints properly with required torque.\n"
                "7. **Bend Radius**: Don't bend more than the specified radius (Refer product specification)."
            )
        },
        {
            'section_key': 'VISE_CLAMP',
            'title': 'Vise Clamp & Greasing Guidelines',
            'subtitle': '16-point daily greasing and thread care',
            'order': 3,
            'content': (
                "1. **Vise Clamp Greasing**:\n"
                "   - Total of **16 greasing points** in the vise clamp that should be greased on a daily basis.\n\n"
                "2. **Drill Pipe Thread Protection**:\n"
                "   - Lubricating drill pipe threads (Box/Pin) on each connection with specialized Copper Greasing."
            )
        },
        {
            'section_key': 'GEAR_BOX',
            'title': 'Gearbox Positioning During Travelling',
            'subtitle': 'Mandatory carriage position during machine tracking/marching',
            'order': 4,
            'content': (
                "1. **Rotation Gearbox Position**:\n"
                "   - Rotation gearbox position while travelling should be all the way to the **back side** on the rack frame.\n\n"
                "2. **Rack Frame Position**:\n"
                "   - Rack frame position while travelling must be lowered **parallel to the ground surface**."
            )
        },
        {
            'section_key': 'GENERAL_DONTS',
            'title': "General Guidelines and Don'ts",
            'subtitle': 'Critical operational limits to prevent major breakdowns',
            'order': 5,
            'content': (
                "1. **Marching Distance Limit**:\n"
                "   - Machine marching/travels should **not exceed more than 500 meters** at one single stretch.\n\n"
                "2. **Water Pump Suction Hose**:\n"
                "   - Water pump suction hose should be **2-inch or 3-inch** reinforced suction hose and NOT 40mm HDPE Duct.\n\n"
                "3. **Ground Anchoring**:\n"
                "   - Anchoring stakes should be buried completely into the ground. If anchored only halfway, it will damage the drive motor shaft.\n\n"
                "4. **Track Ground Contact**:\n"
                "   - Machine tracks while operating should maintain solid ground contact. Lifting of machine off the ground creates excessive pressure on hydraulic cylinders and causes structural damage."
            )
        }
    ]

    for g in guidelines:
        SafetyGuideline.objects.create(**g)

    print(f"Safety Guidelines created: {SafetyGuideline.objects.count()}")
    print("\n--- Seeding Completed Successfully! ---")

if __name__ == '__main__':
    run_seed()

