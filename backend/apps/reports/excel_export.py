import io
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def generate_hdd_shot_excel_report(shots, daily_summary, filters_applied=None, today_records=None, effective_today=None, execution_summary=None):
    """
    Generates a professional styled Excel workbook (.xlsx) containing:
    1. Sheet 'Today's Shots': Exclusively today's shot report records with Circle, District, Block, sequence numbers, numeric meters.
    2. Sheet 'All Historical Shots': One row per individual shot with geography, metadata, numeric meter values.
    3. Sheet 'Summary': Exact Execution Report with PTD, Previous Month, MTD, Previous Week, daily weekly output, and Deltas.
    4. Sheet 'Daily Summary': Machine-wise daily shot counts and total metres.
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
    completed_font = Font(name="Calibri", size=10, bold=True, color="059669")
    wip_font = Font(name="Calibri", size=10, bold=True, color="D97706")
    pending_font = Font(name="Calibri", size=10, bold=True, color="2563EB")

    def resolve_end_time_display(val, is_wip=False):
        if not val or str(val).strip().lower() in ('none', 'null', '-', '—', '--', 'n/a', 'nan', '00:00:00', 'undefined'):
            return 'WIP' if is_wip else '—'
        s_val = str(val).strip()
        if s_val.upper() in ('WIP', 'PENDING'):
            return s_val.upper()
        if len(s_val) >= 19 and (" " in s_val or "T" in s_val):
            parts = s_val.replace("T", " ").split(" ")
            if len(parts) >= 2:
                return parts[1][:8]
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

    # Compute production totals for header metadata
    comp_count = sum(1 for s in shots if s.get('status') == 'COMPLETED')
    wip_count = sum(1 for s in shots if s.get('status') == 'WIP')
    pending_count = sum(1 for s in shots if s.get('status') == 'PENDING')
    comp_meters = sum(float(s.get('shot_meters') or 0.0) for s in shots if s.get('status') == 'COMPLETED')
    wip_meters = sum(float(s.get('shot_meters') or 0.0) for s in shots if s.get('status') == 'WIP')
    rate_pct = round((comp_count / len(shots) * 100), 1) if len(shots) > 0 else 0.0

    ws_shots.append([
        f"Filters: {meta_str}   |   Total: {len(shots)} shots (Completed: {comp_count}, WIP: {wip_count}, Pending: {pending_count})   |   Production: {comp_meters:,.2f} m (Completed) + {wip_meters:,.2f} m (WIP)   |   Completion Rate: {rate_pct}%"
    ])
    ws_shots.cell(row=2, column=1).font = meta_font
    ws_shots.row_dimensions[2].height = 18

    ws_shots.append([])  # Blank row

    # Headers for HDD Shots (including Circle, District, Block, Status)
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
        "Status",
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
        shot_status = str(s.get('status') or ('WIP' if s.get('is_wip') else 'COMPLETED')).upper()
        if shot_status in ('COMPLETED', 'WIP'):
            total_shot_meters += meters

        end_display = resolve_end_time_display(s.get('end_time'), is_wip=(shot_status == 'WIP' or not s.get('end_time')))

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
            shot_status,
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
            if col_idx in (1, 9, 10, 11, 12, 15):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in (13, 14):
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

            # Status styling
            if col_idx == 10:
                if cell.value == 'COMPLETED':
                    cell.font = completed_font
                elif cell.value == 'WIP':
                    cell.font = wip_font
                elif cell.value == 'PENDING':
                    cell.font = pending_font

            if col_idx == 12 and cell.value in ('WIP', 'PENDING'):
                cell.font = wip_font if cell.value == 'WIP' else pending_font

            if col_idx in (9, 15):
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
    # SHEET 2: Machine Daily Summary (Matching Screenshot 1)
    # ==========================================
    ws_mach_daily = wb.create_sheet(title="Machine Daily Summary")
    ws_mach_daily.views.sheetView[0].showGridLines = True

    # Color fills and fonts matching Screenshot 1
    yellow_fill = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
    green_hdr_fill = PatternFill(start_color="00B050", end_color="00B050", fill_type="solid")
    red_hdr_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")
    pink_cell_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
    green_cell_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    summary_cell_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")

    black_hdr_font = Font(name="Calibri", size=11, bold=True, color="000000")
    white_hdr_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    red_text_font = Font(name="Calibri", size=10, bold=True, color="9C0006")
    green_text_font = Font(name="Calibri", size=10, bold=True, color="006100")
    center_align = Alignment(horizontal="center", vertical="center")
    left_align = Alignment(horizontal="left", vertical="center")
    right_align = Alignment(horizontal="right", vertical="center")

    # Working / Idle KPI Counts
    working_count = sum(1 for d in daily_summary if str(d.get('machine_status') or '').strip().lower() == 'working')
    idle_count = sum(1 for d in daily_summary if str(d.get('machine_status') or '').strip().lower() == 'idle')

    # Top mini-summary table (Rows 1-2, Columns C & D)
    ws_mach_daily.cell(row=1, column=3, value="Working")
    c_w = ws_mach_daily.cell(row=1, column=3)
    c_w.fill = green_cell_fill
    c_w.font = green_text_font
    c_w.alignment = left_align
    c_w.border = thin_border

    ws_mach_daily.cell(row=1, column=4, value=working_count)
    c_wv = ws_mach_daily.cell(row=1, column=4)
    c_wv.font = bold_font
    c_wv.alignment = center_align
    c_wv.border = thin_border

    ws_mach_daily.cell(row=2, column=3, value="Idle")
    c_i = ws_mach_daily.cell(row=2, column=3)
    c_i.fill = red_hdr_fill
    c_i.font = white_hdr_font
    c_i.alignment = left_align
    c_i.border = thin_border

    ws_mach_daily.cell(row=2, column=4, value=idle_count)
    c_iv = ws_mach_daily.cell(row=2, column=4)
    c_iv.font = bold_font
    c_iv.alignment = center_align
    c_iv.border = thin_border

    ws_mach_daily.row_dimensions[1].height = 20
    ws_mach_daily.row_dimensions[2].height = 20

    # Determine max shots count
    max_shots = 4
    for d in daily_summary:
        s_list = d.get('shots_list') or []
        if len(s_list) > max_shots:
            max_shots = len(s_list)

    # Main Table Headers at Row 4
    mach_sum_headers = [
        "BLOCK",
        "Machine",
        "Machine Status\nWorking /Idle",
        "FTD T&D\n(m)",
        "No. of\nshots",
    ]
    for s_idx in range(1, max_shots + 1):
        mach_sum_headers.append(f"Shot {s_idx}")
    mach_sum_headers.append("Reason Of Idle")
    mach_sum_headers.append("Ageing of Idle")

    mach_hdr_row = 4
    ws_mach_daily.row_dimensions[mach_hdr_row].height = 36
    for c_i_idx, h_text in enumerate(mach_sum_headers, start=1):
        ws_mach_daily.cell(row=mach_hdr_row, column=c_i_idx, value=h_text)

    # Style Headers
    for col_idx in range(1, len(mach_sum_headers) + 1):
        c = ws_mach_daily.cell(row=mach_hdr_row, column=col_idx)
        c.border = thin_border
        c.alignment = center_align

        if col_idx in (1, 2, 3) or (6 <= col_idx <= 5 + max_shots):
            c.fill = yellow_fill
            c.font = black_hdr_font
        elif col_idx in (4, 5):
            c.fill = green_hdr_fill
            c.font = white_hdr_font
        else:
            c.fill = red_hdr_fill
            c.font = white_hdr_font

    mach_curr_row = mach_hdr_row + 1
    total_ftd_meters = 0.0
    total_shots_count = 0

    for d in daily_summary:
        status_val = str(d.get('machine_status') or 'Idle').strip()
        is_working = (status_val.lower() == 'working')

        m_meters = float(d.get('ftd_meters') or d.get('daily_total_meters') or 0.0)
        s_count = int(d.get('no_of_shots') or d.get('daily_shot_count') or 0)
        total_ftd_meters += m_meters
        total_shots_count += s_count

        shots_list = d.get('shots_list') or []
        row_vals = [
            d.get('block') or '',
            d.get('machine') or d.get('machine_id') or '',
            "Working" if is_working else "Idle",
            m_meters,
            s_count
        ]
        for s_idx in range(max_shots):
            if s_idx < len(shots_list):
                row_vals.append(shots_list[s_idx])
            else:
                row_vals.append("")

        row_vals.append(d.get('reason_of_idle') or '')
        row_vals.append(d.get('ageing_of_idle') or '')

        ws_mach_daily.row_dimensions[mach_curr_row].height = 20
        for col_idx, val in enumerate(row_vals, start=1):
            cell = ws_mach_daily.cell(row=mach_curr_row, column=col_idx, value=val)
            cell.border = thin_border

            # Machine Status (Col 3)
            if col_idx == 3:
                cell.alignment = center_align
                if is_working:
                    cell.fill = green_cell_fill
                    cell.font = green_text_font
                else:
                    cell.fill = pink_cell_fill
                    cell.font = red_text_font
            # FTD T&D (m) (Col 4)
            elif col_idx == 4:
                cell.alignment = center_align
                cell.number_format = '#,##0'
                if m_meters > 0:
                    cell.fill = green_cell_fill
                    cell.font = green_text_font
                else:
                    cell.fill = pink_cell_fill
                    cell.font = red_text_font
            # No. of shots (Col 5)
            elif col_idx == 5:
                cell.alignment = center_align
                cell.number_format = '#,##0'
                if s_count == 0:
                    cell.fill = pink_cell_fill
                    cell.font = red_text_font
                else:
                    cell.font = regular_font
            # Shot values
            elif 6 <= col_idx <= 5 + max_shots:
                cell.alignment = center_align
                cell.font = regular_font
                if cell.value != "":
                    cell.number_format = '#,##0'
            # Reason & Ageing
            elif col_idx > 5 + max_shots:
                cell.alignment = left_align
                cell.font = regular_font
            else:
                cell.alignment = center_align if col_idx == 2 else left_align
                cell.font = regular_font

        mach_curr_row += 1

    # Daily Summary Total Row (Matching Screenshot 1)
    if daily_summary:
        total_row_vals = ["", f"{len(daily_summary):.1f}", "", total_ftd_meters, total_shots_count]
        for _ in range(max_shots):
            total_row_vals.append("")
        total_row_vals.append("")
        total_row_vals.append("")

        ws_mach_daily.row_dimensions[mach_curr_row].height = 22
        for col_idx, val in enumerate(total_row_vals, start=1):
            cell = ws_mach_daily.cell(row=mach_curr_row, column=col_idx, value=val)
            cell.border = thin_border
            cell.fill = summary_cell_fill

            if col_idx == 2:
                cell.alignment = center_align
                cell.font = bold_font
            elif col_idx in (4, 5):
                cell.alignment = center_align
                cell.font = green_text_font
                cell.fill = green_cell_fill
                cell.number_format = '#,##0'

    if len(daily_summary) > 0:
        ws_mach_daily.auto_filter.ref = f"A{mach_hdr_row}:{get_column_letter(len(mach_sum_headers))}{mach_curr_row - 1}"

    for col in ws_mach_daily.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            if cell.row < mach_hdr_row:
                continue
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws_mach_daily.column_dimensions[col_letter].width = max(max_len + 4, 14)

    # ==========================================
    # SHEET 3: Daily Summary (Tabular Multi-Column)
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
        d_count = int(d.get('daily_shot_count') or d.get('no_of_shots') or 0)
        d_meters = float(d.get('daily_total_meters') or d.get('ftd_meters') or 0.0)
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

    today_comp = sum(1 for s in today_records if s.get('status') == 'COMPLETED')
    today_wip = sum(1 for s in today_records if s.get('status') == 'WIP')
    today_comp_m = sum(float(s.get('shot_meters') or 0.0) for s in today_records if s.get('status') == 'COMPLETED')
    today_wip_m = sum(float(s.get('shot_meters') or 0.0) for s in today_records if s.get('status') == 'WIP')
    today_meters_sum = round(today_comp_m + today_wip_m, 2)
    today_machines_count = len(set(s.get('chassis_number') for s in today_records))

    ws_today.append([
        f"Execution Date: {resolved_today_date}   |   Today Shots: {len(today_records)} ({today_comp} Completed, {today_wip} WIP)   |   Today Output: {today_meters_sum:,.2f} m ({today_comp_m:,.2f} m Completed + {today_wip_m:,.2f} m WIP)   |   Active Machines: {today_machines_count}"
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
        "Status",
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
        shot_status = str(s.get('status') or ('WIP' if s.get('is_wip') else 'COMPLETED')).upper()
        if shot_status in ('COMPLETED', 'WIP'):
            total_today_shot_meters += meters

        end_display = resolve_end_time_display(s.get('end_time'), is_wip=(shot_status == 'WIP' or not s.get('end_time')))

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
            shot_status,
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
            if col_idx in (1, 9, 10, 11, 12, 15):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in (13, 14):
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

            # Status styling
            if col_idx == 10:
                if cell.value == 'COMPLETED':
                    cell.font = completed_font
                elif cell.value == 'WIP':
                    cell.font = wip_font
                elif cell.value == 'PENDING':
                    cell.font = pending_font

            if col_idx == 12 and cell.value in ('WIP', 'PENDING'):
                cell.font = wip_font if cell.value == 'WIP' else pending_font

            if col_idx in (9, 15):
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
    # ==========================================
    # SHEET 3: Summary (HERO Execution Report - Exact PTD, MTD, Previous Month, Previous Week, Weekly Output, Deltas)
    # ==========================================
    ws_summary = build_execution_summary_sheet(
        wb=wb,
        execution_summary=execution_summary,
        filters_applied=filters_applied,
        shots=shots,
        effective_today=resolved_today_date
    )

    # Order sheets: 1. Execution Summary, 2. Machine Daily Summary, 3. Today's Shots, 4. Daily Summary, 5. All Historical Shots
    ws_today.title = "Today's Shots"
    ws_shots.title = "All Historical Shots"
    ws_sum.title = "Daily Summary"
    ws_mach_daily.title = "Machine Daily Summary"
    wb._sheets = [ws_summary, ws_mach_daily, ws_today, ws_sum, ws_shots]
    wb.active = ws_summary

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def build_execution_summary_sheet(wb, execution_summary=None, filters_applied=None, shots=None, effective_today=None):
    """
    Builds the Execution Report Summary sheet matching the exact business rules, date logic,
    and visual screenshot format:
    - Block, Machine, Partner
    - PTD: Total & Per Day
    - Previous Month: Total & Per Day
    - MTD: Total & Per Day
    - Previous Week: Total & Per Day
    - For the week: Monday through Sunday daily output & Average
    - Delta: Previous week & MTD
    - Totals Row
    """
    if execution_summary is None and shots:
        try:
            from .services import compute_execution_report_summary, build_all_hdd_shot_records
            dataset = build_all_hdd_shot_records(force_refresh=False)
            machines = dataset.get('filter_options', {}).get('machines', [])
            sel_date = effective_today or datetime.now().strftime('%Y-%m-%d')
            execution_summary = compute_execution_report_summary(shots, machines, sel_date)
        except Exception:
            execution_summary = None

    if not execution_summary:
        sel_str = effective_today or datetime.now().strftime('%Y-%m-%d')
        execution_summary = {
            'reporting_date': sel_str,
            'bounds': {
                'selected_date_str': sel_str,
                'project_start_date_str': '2026-09-25',
                'ptd': {'label': f'25-Sep-2026 to {sel_str}'},
                'prev_month': {'label': 'Complete previous calendar month'},
                'mtd': {'label': f'01-Oct-2026 to {sel_str}'},
                'prev_week': {'label': 'Previous completed week (Monday to Sunday)'},
                'current_week': {'label': 'Current reporting week'},
            },
            'week_days': [],
            'rows': [],
            'totals': {}
        }

    ws_sum = wb.create_sheet(title="Summary")
    ws_sum.views.sheetView[0].showGridLines = True

    bounds = execution_summary.get('bounds', {})
    week_days = execution_summary.get('week_days', [])
    rows = execution_summary.get('rows', [])
    totals = execution_summary.get('totals', {})

    # Palette matching HERO Execution Report screenshot
    c_navy = "0F2C59"
    c_ptd = "005C8A"
    c_pm = "1E7098"
    c_mtd = "0099D8"
    c_pw = "99CCE5"
    c_subhdr = "CBD5E1"
    c_pink = "FECDD3"
    c_red_text = "990000"
    c_total_fill = "E2E8F0"

    f_title = Font(name="Calibri", size=13, bold=True, color="0F2C59")
    f_meta = Font(name="Calibri", size=9, italic=True, color="475569")
    f_cat_hdr_white = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    f_cat_hdr_dark = Font(name="Calibri", size=10, bold=True, color="0F2C59")
    f_subhdr = Font(name="Calibri", size=9, bold=True, color="0F172A")
    f_subhdr_red = Font(name="Calibri", size=9, bold=True, color=c_red_text)
    f_data_reg = Font(name="Calibri", size=9, color="0F172A")
    f_data_bold = Font(name="Calibri", size=9, bold=True, color="0F172A")
    f_data_red = Font(name="Calibri", size=9, bold=True, color=c_red_text)
    f_data_green = Font(name="Calibri", size=9, bold=True, color="047857")

    fill_navy = PatternFill(start_color=c_navy, end_color=c_navy, fill_type="solid")
    fill_ptd = PatternFill(start_color=c_ptd, end_color=c_ptd, fill_type="solid")
    fill_pm = PatternFill(start_color=c_pm, end_color=c_pm, fill_type="solid")
    fill_mtd = PatternFill(start_color=c_mtd, end_color=c_mtd, fill_type="solid")
    fill_pw = PatternFill(start_color=c_pw, end_color=c_pw, fill_type="solid")
    fill_subhdr = PatternFill(start_color=c_subhdr, end_color=c_subhdr, fill_type="solid")
    fill_pink = PatternFill(start_color=c_pink, end_color=c_pink, fill_type="solid")
    fill_green = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    fill_total = PatternFill(start_color=c_total_fill, end_color=c_total_fill, fill_type="solid")

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

    # Row 1: Title
    ws_sum.cell(row=1, column=1, value="HERO PORTAL — HDD EXECUTION REPORT SUMMARY").font = f_title
    ws_sum.row_dimensions[1].height = 22

    # Row 2: Selected Report Date & Machine-Specific PTD
    sel_date = bounds.get('selected_date_str') or execution_summary.get('reporting_date', '')
    meta1 = f"Selected Report Date: {sel_date}  |  PTD Start Date: Machine-Specific  |  Timezone: Asia/Kolkata"
    ws_sum.cell(row=2, column=1, value=meta1).font = f_meta
    ws_sum.row_dimensions[2].height = 16

    # Row 3: Periods Metadata
    pm_l = bounds.get('prev_month', {}).get('label', '')
    mtd_l = bounds.get('mtd', {}).get('label', '')
    pw_l = bounds.get('prev_week', {}).get('label', '')
    cw_l = bounds.get('current_week', {}).get('label', '')
    meta2 = f"Periods: PTD: Machine-specific verified start date through {sel_date}  |  Prev Month: {pm_l}  |  MTD: {mtd_l}  |  Prev Week: {pw_l}  |  Current Week: {cw_l}"
    ws_sum.cell(row=3, column=1, value=meta2).font = f_meta
    ws_sum.row_dimensions[3].height = 16

    r4, r5 = 4, 5
    ws_sum.row_dimensions[r4].height = 22
    ws_sum.row_dimensions[r5].height = 20

    # Category Headers on Row 4
    ws_sum.merge_cells(start_row=r4, start_column=1, end_row=r5, end_column=1)
    c = ws_sum.cell(row=r4, column=1, value="Block")
    c.fill = fill_navy; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")

    ws_sum.merge_cells(start_row=r4, start_column=2, end_row=r5, end_column=2)
    c = ws_sum.cell(row=r4, column=2, value="Machine")
    c.fill = fill_navy; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")

    ws_sum.merge_cells(start_row=r4, start_column=3, end_row=r5, end_column=3)
    c = ws_sum.cell(row=r4, column=3, value="Partner")
    c.fill = fill_navy; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")

    # PTD Category (Cols 4 to 8: Production Start, PTD End, PTD Days, Total, Per Day)
    ws_sum.merge_cells(start_row=r4, start_column=4, end_row=r4, end_column=8)
    c = ws_sum.cell(row=r4, column=4, value="PTD")
    c.fill = fill_ptd; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")
    for ci in range(5, 9):
        ws_sum.cell(row=r4, column=ci).fill = fill_ptd

    # Previous Month (Cols 9 to 10)
    ws_sum.merge_cells(start_row=r4, start_column=9, end_row=r4, end_column=10)
    c = ws_sum.cell(row=r4, column=9, value="Previous Month")
    c.fill = fill_pm; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")
    ws_sum.cell(row=r4, column=10).fill = fill_pm

    # MTD (Cols 11 to 12)
    ws_sum.merge_cells(start_row=r4, start_column=11, end_row=r4, end_column=12)
    c = ws_sum.cell(row=r4, column=11, value="MTD")
    c.fill = fill_mtd; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")
    ws_sum.cell(row=r4, column=12).fill = fill_mtd

    # Previous Week (Cols 13 to 14)
    ws_sum.merge_cells(start_row=r4, start_column=13, end_row=r4, end_column=14)
    c = ws_sum.cell(row=r4, column=13, value="Previous Week")
    c.fill = fill_pw; c.font = f_cat_hdr_dark; c.alignment = Alignment(horizontal="center", vertical="center")
    ws_sum.cell(row=r4, column=14).fill = fill_pw

    # For the week (Cols 15 to 22: 7 daily + Average)
    ws_sum.merge_cells(start_row=r4, start_column=15, end_row=r4, end_column=22)
    c = ws_sum.cell(row=r4, column=15, value="For the week")
    c.fill = fill_navy; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")
    for ci in range(16, 23):
        ws_sum.cell(row=r4, column=ci).fill = fill_navy

    # Delta (Cols 23 to 24: Previous week, MTD)
    ws_sum.merge_cells(start_row=r4, start_column=23, end_row=r4, end_column=24)
    c = ws_sum.cell(row=r4, column=23, value="Delta")
    c.fill = fill_navy; c.font = f_cat_hdr_white; c.alignment = Alignment(horizontal="center", vertical="center")
    ws_sum.cell(row=r4, column=24).fill = fill_navy

    # Subheaders on Row 5
    sub_headers = [
        (4, "Production Start", f_subhdr, fill_subhdr),
        (5, "PTD End", f_subhdr, fill_subhdr),
        (6, "PTD Days", f_subhdr, fill_subhdr),
        (7, "Total", f_subhdr, fill_subhdr),
        (8, "Per Day", f_subhdr_red, fill_subhdr),
        (9, "Total", f_subhdr, fill_subhdr),
        (10, "Per Day", f_subhdr_red, fill_subhdr),
        (11, "Total", f_subhdr, fill_subhdr),
        (12, "Per Day", f_subhdr_red, fill_subhdr),
        (13, "Total", f_subhdr, fill_subhdr),
        (14, "Per Day", f_subhdr_red, fill_subhdr),
    ]
    for i, wd in enumerate(week_days):
        sub_headers.append((15 + i, wd.get('label', f"Day {i+1}"), f_subhdr, fill_subhdr))

    sub_headers.append((22, "Average", f_subhdr_red, fill_pink))
    sub_headers.append((23, "Previous week", f_subhdr, fill_subhdr))
    sub_headers.append((24, "MTD", f_subhdr, fill_subhdr))

    for col_i, text, font, fill in sub_headers:
        c = ws_sum.cell(row=r5, column=col_i, value=text)
        c.font = font; c.fill = fill
        c.alignment = Alignment(horizontal="center", vertical="center")

    for col_i in range(1, 25):
        ws_sum.cell(row=r4, column=col_i).border = thin_border
        ws_sum.cell(row=r5, column=col_i).border = thin_border

    # Format PTD end date string
    sel_end_formatted = ""
    if sel_date:
        try:
            sel_end_formatted = datetime.strptime(sel_date[:10], '%Y-%m-%d').strftime('%d-%b-%Y')
        except Exception:
            sel_end_formatted = sel_date

    # Data Rows (Row 6+)
    curr_row = 6
    for r in rows:
        ws_sum.row_dimensions[curr_row].height = 20
        ws_sum.cell(row=curr_row, column=1, value=r.get('block', '—')).alignment = Alignment(horizontal="left", vertical="center")
        ws_sum.cell(row=curr_row, column=2, value=str(r.get('machine', ''))).alignment = Alignment(horizontal="center", vertical="center")
        ws_sum.cell(row=curr_row, column=3, value=r.get('partner', '—')).alignment = Alignment(horizontal="left", vertical="center")

        # Col 4: Machine Production Start Date
        start_disp = r.get('ptd_start_formatted') or 'Unknown'
        c4 = ws_sum.cell(row=curr_row, column=4, value=start_disp)
        c4.alignment = Alignment(horizontal="center", vertical="center")

        # Col 5: PTD End Date
        r_end = r.get('ptd_end_date')
        if r_end:
            try:
                r_end_disp = datetime.strptime(r_end[:10], '%Y-%m-%d').strftime('%d-%b-%Y')
            except Exception:
                r_end_disp = r_end
        else:
            r_end_disp = sel_end_formatted
        c5 = ws_sum.cell(row=curr_row, column=5, value=r_end_disp)
        c5.alignment = Alignment(horizontal="center", vertical="center")

        # Col 6: PTD Days
        c6 = ws_sum.cell(row=curr_row, column=6, value=r.get('ptd_days', 0))
        c6.number_format = '#,##0'; c6.alignment = Alignment(horizontal="center", vertical="center")

        # Col 7: PTD Total
        c7 = ws_sum.cell(row=curr_row, column=7, value=r.get('ptd_total', 0.0))
        c7.number_format = '#,##0.00#'; c7.alignment = Alignment(horizontal="right", vertical="center")

        # Col 8: PTD Per Day (Bold Red)
        c8 = ws_sum.cell(row=curr_row, column=8, value=r.get('ptd_per_day', 0.0))
        c8.font = f_data_red; c8.number_format = '#,##0.00'; c8.alignment = Alignment(horizontal="right", vertical="center")

        # Cols 9-10: Previous Month Total & Per Day
        c9 = ws_sum.cell(row=curr_row, column=9, value=r.get('prev_month_total', 0.0))
        c9.number_format = '#,##0.00'; c9.alignment = Alignment(horizontal="right", vertical="center")
        c10 = ws_sum.cell(row=curr_row, column=10, value=r.get('prev_month_per_day', 0.0))
        c10.font = f_data_red; c10.number_format = '#,##0.00'; c10.alignment = Alignment(horizontal="right", vertical="center")

        # Cols 11-12: MTD Total & Per Day
        c11 = ws_sum.cell(row=curr_row, column=11, value=r.get('mtd_total', 0.0))
        c11.number_format = '#,##0.00'; c11.alignment = Alignment(horizontal="right", vertical="center")
        c12 = ws_sum.cell(row=curr_row, column=12, value=r.get('mtd_per_day', 0.0))
        c12.font = f_data_red; c12.number_format = '#,##0.00'; c12.alignment = Alignment(horizontal="right", vertical="center")

        # Cols 13-14: Previous Week Total & Per Day
        c13 = ws_sum.cell(row=curr_row, column=13, value=r.get('prev_week_total', 0.0))
        c13.number_format = '#,##0.00'; c13.alignment = Alignment(horizontal="right", vertical="center")
        c14 = ws_sum.cell(row=curr_row, column=14, value=r.get('prev_week_per_day', 0.0))
        c14.font = f_data_red; c14.number_format = '#,##0.00'; c14.alignment = Alignment(horizontal="right", vertical="center")

        # Cols 15-21: Daily Outputs
        for i, val in enumerate(r.get('daily_production', [])):
            col_i = 15 + i
            cell = ws_sum.cell(row=curr_row, column=col_i)
            if val is not None:
                cell.value = val
                cell.number_format = '#,##0.00' if val != 0 else '0'
            else:
                cell.value = ""
            cell.alignment = Alignment(horizontal="right", vertical="center")

        # Col 22: Current Week Average (Number Green if >= 500, Red if < 500; Fill is always pink)
        cw_avg_val = float(r.get('current_week_average') or 0.0)
        c22 = ws_sum.cell(row=curr_row, column=22, value=cw_avg_val)
        c22.font = f_data_green if cw_avg_val >= 500 else f_data_red
        c22.fill = fill_pink
        c22.number_format = '#,##0.00'
        c22.alignment = Alignment(horizontal="right", vertical="center")

        # Col 23: Previous Week Delta
        c23 = ws_sum.cell(row=curr_row, column=23, value=r.get('prev_week_delta', 0.0))
        c23.number_format = '+#,##0.00;-#,##0.00;0.00'; c23.alignment = Alignment(horizontal="right", vertical="center")

        # Col 24: MTD Delta
        c24 = ws_sum.cell(row=curr_row, column=24, value=r.get('mtd_delta', 0.0))
        c24.number_format = '+#,##0.00;-#,##0.00;0.00'; c24.alignment = Alignment(horizontal="right", vertical="center")

        for col_i in range(1, 25):
            cell = ws_sum.cell(row=curr_row, column=col_i)
            if not cell.font or cell.font == openpyxl.styles.DEFAULT_FONT:
                cell.font = f_data_reg
            cell.border = thin_border

        curr_row += 1

    # Totals Row
    if totals:
        ws_sum.row_dimensions[curr_row].height = 22
        ws_sum.cell(row=curr_row, column=1, value="Total")
        ws_sum.cell(row=curr_row, column=2, value=totals.get('machine', ''))
        ws_sum.cell(row=curr_row, column=3, value="")

        # Col 4: Machine-Specific
        c4 = ws_sum.cell(row=curr_row, column=4, value="Machine-Specific")
        c4.alignment = Alignment(horizontal="center", vertical="center")

        # Col 5: PTD End
        c5 = ws_sum.cell(row=curr_row, column=5, value=sel_end_formatted)
        c5.alignment = Alignment(horizontal="center", vertical="center")

        # Col 6: PTD Days Total
        c6 = ws_sum.cell(row=curr_row, column=6, value=totals.get('ptd_days', 0))
        c6.number_format = '#,##0'; c6.alignment = Alignment(horizontal="center", vertical="center")

        # Col 7: PTD Total
        ws_sum.cell(row=curr_row, column=7, value=totals.get('ptd_total', 0.0)).number_format = '#,##0.00#'
        # Col 8: PTD Per Day
        c8 = ws_sum.cell(row=curr_row, column=8, value=totals.get('ptd_per_day', 0.0))
        c8.font = f_data_red; c8.number_format = '#,##0.00'

        # Cols 9-10: Previous Month
        ws_sum.cell(row=curr_row, column=9, value=totals.get('prev_month_total', 0.0)).number_format = '#,##0.00'
        c = ws_sum.cell(row=curr_row, column=10, value=totals.get('prev_month_per_day', 0.0))
        c.font = f_data_red; c.number_format = '#,##0.00'

        # Cols 11-12: MTD
        ws_sum.cell(row=curr_row, column=11, value=totals.get('mtd_total', 0.0)).number_format = '#,##0.00'
        c = ws_sum.cell(row=curr_row, column=12, value=totals.get('mtd_per_day', 0.0))
        c.font = f_data_red; c.number_format = '#,##0.00'

        # Cols 13-14: Previous Week
        ws_sum.cell(row=curr_row, column=13, value=totals.get('prev_week_total', 0.0)).number_format = '#,##0.00'
        c = ws_sum.cell(row=curr_row, column=14, value=totals.get('prev_week_per_day', 0.0))
        c.font = f_data_red; c.number_format = '#,##0.00'

        # Cols 15-21: Daily Outputs
        for i, val in enumerate(totals.get('daily_production', [])):
            col_i = 15 + i
            cell = ws_sum.cell(row=curr_row, column=col_i)
            if val is not None:
                cell.value = val
                cell.number_format = '#,##0.00'
            else:
                cell.value = ""
            cell.alignment = Alignment(horizontal="right", vertical="center")

        # Col 22: Average (Number Green if >= 500, Red if < 500; Fill is always pink)
        tot_cw_avg_val = float(totals.get('current_week_average') or 0.0)
        c = ws_sum.cell(row=curr_row, column=22, value=tot_cw_avg_val)
        c.font = f_data_green if tot_cw_avg_val >= 500 else f_data_red
        c.fill = fill_pink
        c.number_format = '#,##0.00'

        # Cols 23-24: Deltas
        ws_sum.cell(row=curr_row, column=23, value=totals.get('prev_week_delta', 0.0)).number_format = '+#,##0.00;-#,##0.00;0.00'
        ws_sum.cell(row=curr_row, column=24, value=totals.get('mtd_delta', 0.0)).number_format = '+#,##0.00;-#,##0.00;0.00'

        for col_i in range(1, 25):
            cell = ws_sum.cell(row=curr_row, column=col_i)
            cell.border = total_border
            if col_i not in (8, 10, 12, 14, 22):
                cell.font = f_data_bold
            if col_i != 22:
                cell.fill = fill_total

    # Column widths
    for col in ws_sum.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            if cell.row < 4:
                continue
            val_s = str(cell.value or '')
            if len(val_s) > max_len:
                max_len = len(val_s)
        ws_sum.column_dimensions[col_letter].width = max(max_len + 3, 11)

    return ws_sum
