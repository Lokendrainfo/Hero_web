import io
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def generate_hdd_shot_excel_report(shots, daily_summary, filters_applied=None, today_records=None, effective_today=None):
    """
    Generates a professional styled Excel workbook (.xlsx) containing:
    1. Sheet 'HDD Shots': One row per individual shot with geography (Circle, District, Block),
       metadata, numeric meter values, daily machine counts and totals.
    2. Sheet 'Daily Summary': Machine-wise daily shot counts and total metres with geography.
    3. Sheet 'Today Report': Exclusively today's shot report records with Circle, District,
       Block, sequence numbers, numeric meters, and daily machine totals.
    """
    wb = openpyxl.Workbook()

    # Define color scheme
    primary_navy = "1E3A8A"      # Deep Navy for HDD Shots
    summary_teal = "0F766E"      # Teal for Daily Summary
    today_amber = "B45309"       # Deep Amber / Gold for Today Report
    subtle_gray = "F8FAFC"       # Light Slate row alternate
    today_row_alt = "FFFBEB"     # Warm alternate row for Today Report

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="1E3A8A")
    today_title_font = Font(name="Calibri", size=14, bold=True, color="B45309")
    meta_font = Font(name="Calibri", size=10, italic=True, color="475569")
    bold_font = Font(name="Calibri", size=11, bold=True, color="0F172A")
    regular_font = Font(name="Calibri", size=10, color="0F172A")
    wip_font = Font(name="Calibri", size=10, bold=True, color="D97706")

    def resolve_end_time_display(val):
        if not val:
            return '—'
        s_val = str(val).strip()
        if not s_val or s_val.lower() in ('none', 'null', '-', '—', '--', 'n/a', 'nan', '00:00:00', 'undefined', 'wip'):
            return '—'
        return s_val

    header_fill = PatternFill(start_color=primary_navy, end_color=primary_navy, fill_type="solid")
    summary_hdr_fill = PatternFill(start_color=summary_teal, end_color=summary_teal, fill_type="solid")
    today_hdr_fill = PatternFill(start_color=today_amber, end_color=today_amber, fill_type="solid")
    alt_fill = PatternFill(start_color=subtle_gray, end_color=subtle_gray, fill_type="solid")
    today_alt_fill = PatternFill(start_color=today_row_alt, end_color=today_row_alt, fill_type="solid")
    total_row_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    total_border = Border(
        left=Side(style='thin', color='94A3B8'),
        right=Side(style='thin', color='94A3B8'),
        top=Side(style='thin', color='94A3B8'),
        bottom=Side(style='double', color='0F172A')
    )

    # Resolve Today's records
    today_str = datetime.now().strftime('%Y-%m-%d')
    if today_records is None:
        target_today = effective_today or today_str
        if not any(s.get('date') == target_today for s in shots):
            target_today = max((s.get('date') for s in shots), default=today_str)
        today_records = [s for s in shots if s.get('date') == target_today]
        resolved_today_date = target_today
    else:
        resolved_today_date = effective_today or today_str

    # ==========================================
    # SHEET 1: HDD Shots
    # ==========================================
    ws_shots = wb.active
    ws_shots.title = "HDD Shots"
    ws_shots.views.sheetView[0].showGridLines = True

    # Title & Metadata
    ws_shots.append(["HERO PORTAL - HDD SHOT REPORT"])
    ws_shots.cell(row=1, column=1).font = title_font
    ws_shots.row_dimensions[1].height = 25

    filter_desc = []
    if filters_applied:
        if filters_applied.get('start_date') or filters_applied.get('end_date'):
            s = filters_applied.get('start_date') or 'Any'
            e = filters_applied.get('end_date') or 'Any'
            filter_desc.append(f"Period: {s} to {e}")
        if filters_applied.get('chassis_number'):
            filter_desc.append(f"Chassis: {filters_applied['chassis_number']}")
        if filters_applied.get('machine_id'):
            filter_desc.append(f"Machine ID: {filters_applied['machine_id']}")
        if filters_applied.get('circle'):
            filter_desc.append(f"Circle: {filters_applied['circle']}")
        if filters_applied.get('district'):
            filter_desc.append(f"District: {filters_applied['district']}")
        if filters_applied.get('block'):
            filter_desc.append(f"Block: {filters_applied['block']}")
        if filters_applied.get('vendor_name'):
            filter_desc.append(f"Hero: {filters_applied['vendor_name']}")

    meta_str = " | ".join(filter_desc) if filter_desc else "All Machines & Dates"
    ws_shots.append([f"Applied Filters: {meta_str}   |   Total Shots: {len(shots)}"])
    ws_shots.cell(row=2, column=1).font = meta_font
    ws_shots.row_dimensions[2].height = 18

    ws_shots.append([])  # Blank row

    # Headers for HDD Shots (including Circle, District, Block)
    headers = [
        "Date",
        "Circle",
        "District",
        "Block",
        "Machine ID",
        "Machine Name/Model",
        "Chassis Number",
        "Shot ID",
        "Shot Number",
        "Start Time",
        "End Time",
        "Shot Meters",
        "Daily Total Meters",
        "Daily Shot Count",
        "Hero"
    ]
    ws_shots.append(headers)
    hdr_row = 4
    ws_shots.row_dimensions[hdr_row].height = 24

    for col_idx in range(1, len(headers) + 1):
        c = ws_shots.cell(row=hdr_row, column=col_idx)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = thin_border

    # Data Rows
    current_row = hdr_row + 1
    total_shot_meters = 0.0

    for idx, s in enumerate(shots):
        meters = float(s.get('shot_meters') or 0.0)
        daily_meters = float(s.get('daily_total_meters') or 0.0)
        daily_count = int(s.get('daily_shot_count') or 0)
        shot_num = int(s.get('shot_number') or (idx + 1))
        total_shot_meters += meters

        end_display = resolve_end_time_display(s.get('end_time'))

        row_vals = [
            s.get('date') or '',
            s.get('circle') or '',
            s.get('district') or '',
            s.get('block') or '',
            s.get('machine_id') or '',
            s.get('machine_name') or '',
            s.get('chassis_number') or '',
            s.get('shot_id') or '',
            shot_num,
            s.get('start_time') or '',
            end_display,
            meters,
            daily_meters,
            daily_count,
            s.get('vendor_name') or ''
        ]
        ws_shots.append(row_vals)
        ws_shots.row_dimensions[current_row].height = 20

        is_alt = (idx % 2 == 1)
        for col_idx in range(1, len(row_vals) + 1):
            cell = ws_shots.cell(row=current_row, column=col_idx)
            cell.font = regular_font
            cell.border = thin_border
            if is_alt:
                cell.fill = alt_fill

            # Formatting
            if col_idx in (1, 9, 10, 11, 14):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in (12, 13):
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

            if col_idx == 11 and cell.value == 'WIP':
                cell.font = wip_font

            if col_idx in (9, 14):
                cell.number_format = '#,##0'

        current_row += 1

    # Totals Row
    if shots:
        ws_shots.append([
            "Total", "", "", "", "", "", "", "", len(shots), "", "",
            round(total_shot_meters, 2), "", "", ""
        ])
        ws_shots.row_dimensions[current_row].height = 22
        for col_idx in range(1, len(headers) + 1):
            cell = ws_shots.cell(row=current_row, column=col_idx)
            cell.font = bold_font
            cell.fill = total_row_fill
            cell.border = total_border
            if col_idx in (1, 9):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 12:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'

    if len(shots) > 0:
        ws_shots.auto_filter.ref = f"A{hdr_row}:O{current_row - 1}"

    # Auto-fit column widths
    for col in ws_shots.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            if cell.row < hdr_row:
                continue
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws_shots.column_dimensions[col_letter].width = max(max_len + 4, 12)

    # ==========================================
    # SHEET 2: Daily Summary
    # ==========================================
    ws_sum = wb.create_sheet(title="Daily Summary")
    ws_sum.views.sheetView[0].showGridLines = True

    # Title & Metadata
    ws_sum.append(["HERO PORTAL - MACHINE-WISE DAILY HDD SUMMARY"])
    ws_sum.cell(row=1, column=1).font = title_font
    ws_sum.row_dimensions[1].height = 25

    ws_sum.append([f"Applied Filters: {meta_str}   |   Daily Records: {len(daily_summary)}"])
    ws_sum.cell(row=2, column=1).font = meta_font
    ws_sum.row_dimensions[2].height = 18

    ws_sum.append([])

    sum_headers = [
        "Date",
        "Circle",
        "District",
        "Block",
        "Machine ID",
        "Machine Name/Model",
        "Chassis Number",
        "Hero",
        "Daily Shot Count",
        "Daily Total Meters"
    ]
    ws_sum.append(sum_headers)
    sum_hdr_row = 4
    ws_sum.row_dimensions[sum_hdr_row].height = 24

    for col_idx in range(1, len(sum_headers) + 1):
        c = ws_sum.cell(row=sum_hdr_row, column=col_idx)
        c.fill = summary_hdr_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = thin_border

    sum_curr_row = sum_hdr_row + 1
    total_sum_count = 0
    total_sum_meters = 0.0

    for idx, d in enumerate(daily_summary):
        d_count = int(d.get('daily_shot_count') or 0)
        d_meters = float(d.get('daily_total_meters') or 0.0)
        total_sum_count += d_count
        total_sum_meters += d_meters

        row_vals = [
            d.get('date') or '',
            d.get('circle') or '',
            d.get('district') or '',
            d.get('block') or '',
            d.get('machine_id') or '',
            d.get('machine_name') or '',
            d.get('chassis_number') or '',
            d.get('vendor_name') or '',
            d_count,
            d_meters
        ]
        ws_sum.append(row_vals)
        ws_sum.row_dimensions[sum_curr_row].height = 20

        is_alt = (idx % 2 == 1)
        for col_idx in range(1, len(row_vals) + 1):
            cell = ws_sum.cell(row=sum_curr_row, column=col_idx)
            cell.font = regular_font
            cell.border = thin_border
            if is_alt:
                cell.fill = alt_fill

            if col_idx in (1, 9):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 10:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

            if col_idx == 9:
                cell.number_format = '#,##0'

        sum_curr_row += 1

    # Daily Summary Total Row
    if daily_summary:
        ws_sum.append([
            "Total", "", "", "", "", "", "", "", total_sum_count, round(total_sum_meters, 2)
        ])
        ws_sum.row_dimensions[sum_curr_row].height = 22
        for col_idx in range(1, len(sum_headers) + 1):
            cell = ws_sum.cell(row=sum_curr_row, column=col_idx)
            cell.font = bold_font
            cell.fill = total_row_fill
            cell.border = total_border
            if col_idx in (1, 9):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 10:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'

    if len(daily_summary) > 0:
        ws_sum.auto_filter.ref = f"A{sum_hdr_row}:J{sum_curr_row - 1}"

    for col in ws_sum.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            if cell.row < sum_hdr_row:
                continue
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws_sum.column_dimensions[col_letter].width = max(max_len + 4, 14)

    # ==========================================
    # SHEET 3: Today Report (Only Today's Records with Circle, District, Block)
    # ==========================================
    ws_today = wb.create_sheet(title="Today Report")
    ws_today.views.sheetView[0].showGridLines = True

    # Title & Metadata
    ws_today.append(["HERO PORTAL - TODAY'S HDD SHOT REPORT"])
    ws_today.cell(row=1, column=1).font = today_title_font
    ws_today.row_dimensions[1].height = 25

    today_meters_sum = round(sum(float(s.get('shot_meters') or 0.0) for s in today_records), 2)
    today_machines_count = len(set(s.get('chassis_number') for s in today_records))

    ws_today.append([
        f"Execution Date: {resolved_today_date}   |   Today Shots: {len(today_records)}   |   Today Output: {today_meters_sum:,.2f} m   |   Active Machines: {today_machines_count}"
    ])
    ws_today.cell(row=2, column=1).font = meta_font
    ws_today.row_dimensions[2].height = 18

    ws_today.append([])  # Blank row

    # Headers for Today Report
    today_headers = [
        "Date",
        "Circle",
        "District",
        "Block",
        "Machine ID",
        "Machine Name/Model",
        "Chassis Number",
        "Shot ID",
        "Shot Number",
        "Start Time",
        "End Time",
        "Shot Meters",
        "Daily Total Meters",
        "Daily Shot Count",
        "Hero"
    ]
    ws_today.append(today_headers)
    today_hdr_row = 4
    ws_today.row_dimensions[today_hdr_row].height = 24

    for col_idx in range(1, len(today_headers) + 1):
        c = ws_today.cell(row=today_hdr_row, column=col_idx)
        c.fill = today_hdr_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = thin_border

    # Data Rows for Today Report
    today_curr_row = today_hdr_row + 1
    total_today_shot_meters = 0.0

    for idx, s in enumerate(today_records):
        meters = float(s.get('shot_meters') or 0.0)
        daily_meters = float(s.get('daily_total_meters') or 0.0)
        daily_count = int(s.get('daily_shot_count') or 0)
        shot_num = int(s.get('shot_number') or (idx + 1))
        total_today_shot_meters += meters

        end_display = resolve_end_time_display(s.get('end_time'))

        row_vals = [
            s.get('date') or resolved_today_date,
            s.get('circle') or '',
            s.get('district') or '',
            s.get('block') or '',
            s.get('machine_id') or '',
            s.get('machine_name') or '',
            s.get('chassis_number') or '',
            s.get('shot_id') or '',
            shot_num,
            s.get('start_time') or '',
            end_display,
            meters,
            daily_meters,
            daily_count,
            s.get('vendor_name') or ''
        ]
        ws_today.append(row_vals)
        ws_today.row_dimensions[today_curr_row].height = 20

        is_alt = (idx % 2 == 1)
        for col_idx in range(1, len(row_vals) + 1):
            cell = ws_today.cell(row=today_curr_row, column=col_idx)
            cell.font = regular_font
            cell.border = thin_border
            if is_alt:
                cell.fill = today_alt_fill

            # Formatting
            if col_idx in (1, 9, 10, 11, 14):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in (12, 13):
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

            if col_idx == 11 and cell.value == 'WIP':
                cell.font = wip_font

            if col_idx in (9, 14):
                cell.number_format = '#,##0'

        today_curr_row += 1

    # Totals Row for Today Report
    if today_records:
        ws_today.append([
            "Total", "", "", "", "", "", "", "", len(today_records), "", "",
            round(total_today_shot_meters, 2), "", "", ""
        ])
        ws_today.row_dimensions[today_curr_row].height = 22
        for col_idx in range(1, len(today_headers) + 1):
            cell = ws_today.cell(row=today_curr_row, column=col_idx)
            cell.font = bold_font
            cell.fill = total_row_fill
            cell.border = total_border
            if col_idx in (1, 9):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 12:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'

    if len(today_records) > 0:
        ws_today.auto_filter.ref = f"A{today_hdr_row}:O{today_curr_row - 1}"

    # Auto-fit column widths for Today Report
    for col in ws_today.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            if cell.row < today_hdr_row:
                continue
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws_today.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
