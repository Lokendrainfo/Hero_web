import io
import logging
import time
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from apps.integrations.ilync_client import IlyncClient

logger = logging.getLogger(__name__)

# Circle mapping from warehouse codes / names
CIRCLE_PREFIX_MAP = {
    'ASS': 'Assam',
    'HAR': 'Haryana',
    'RAJ': 'Rajasthan',
    'PUN': 'Punjab',
    'DEL': 'Delhi',
    'GUJ': 'Gujarat',
    'MAH': 'Maharashtra',
    'MP': 'Madhya Pradesh',
    'UP': 'Uttar Pradesh',
    'BIH': 'Bihar',
    'WB': 'West Bengal',
    'ODI': 'Odisha',
    'TN': 'Tamil Nadu',
    'KER': 'Kerala',
    'KAR': 'Karnataka',
    'AP': 'Andhra Pradesh',
    'TEL': 'Telangana',
    'JNK': 'Jammu & Kashmir',
    'HP': 'Himachal Pradesh',
    'UK': 'Uttarakhand',
}

def resolve_circle(wh_code, wh_name=''):
    code_str = str(wh_code or '').strip().upper()
    prefix = code_str.split('-')[0] if '-' in code_str else code_str[:3]
    if prefix in CIRCLE_PREFIX_MAP:
        return CIRCLE_PREFIX_MAP[prefix]

    name_str = str(wh_name or '').lower()
    if 'assam' in name_str or 'guwahati' in name_str:
        return 'Assam'
    if 'haryana' in name_str or 'ambala' in name_str or 'gurugram' in name_str:
        return 'Haryana'
    if 'rajasthan' in name_str or 'jaipur' in name_str or 'bagru' in name_str or 'barmer' in name_str or 'sujangarh' in name_str:
        return 'Rajasthan'
    if 'punjab' in name_str:
        return 'Punjab'
    if 'delhi' in name_str:
        return 'Delhi'

    return prefix or 'Central'

def format_dt(val):
    if not val:
        return ''
    try:
        if isinstance(val, str):
            clean = val.replace('Z', '+00:00')
            d = datetime.fromisoformat(clean)
            return d.strftime('%Y-%m-%d %H:%M')
        if isinstance(val, datetime):
            return val.strftime('%Y-%m-%d %H:%M')
    except Exception:
        pass
    return str(val)[:19]


# Global in-memory cache for vendors and users with TTL
_CACHE = {
    'vendors_by_id': {},
    'vendors_by_name': {},
    'users_by_id': {},
    'last_fetched': 0
}

def get_cached_metadata(client):
    """Retrieve vendors and users metadata, cached for 5 minutes."""
    now = time.time()
    if _CACHE['last_fetched'] and (now - _CACHE['last_fetched'] < 300) and _CACHE['vendors_by_id'] and _CACHE['users_by_id']:
        return _CACHE['vendors_by_id'], _CACHE['vendors_by_name'], _CACHE['users_by_id']

    vendors_by_id = {}
    vendors_by_name = {}
    users_by_id = {}

    # 1. Fetch vendors
    try:
        v_res = client.get("api/vendor/list")
        vendors = v_res.get('data', []) if isinstance(v_res, dict) else []
        for v in vendors:
            vid = str(v.get('id') or '').strip()
            pname = str(v.get('partnerName') or v.get('name') or '').strip()
            if vid:
                vendors_by_id[vid] = v
            if pname:
                vendors_by_name[pname.lower()] = v
    except Exception as e:
        logger.warning("[InventoryExportService] Error fetching vendors: %s", e)

    # 2. Fetch users
    try:
        all_users = []
        for p in range(10):
            u_res = client.get(f"api/users?page={p}&size=100")
            cnt = u_res.get('data', {}).get('content', []) if isinstance(u_res, dict) else []
            if not cnt:
                break
            all_users.extend(cnt)
            total = u_res.get('data', {}).get('totalElements', 0) if isinstance(u_res, dict) else len(all_users)
            if len(all_users) >= total:
                break
        for u in all_users:
            uid = str(u.get('id') or '').strip()
            if uid:
                users_by_id[uid] = u
    except Exception as e:
        logger.warning("[InventoryExportService] Error fetching users: %s", e)

    _CACHE['vendors_by_id'] = vendors_by_id
    _CACHE['vendors_by_name'] = vendors_by_name
    _CACHE['users_by_id'] = users_by_id
    _CACHE['last_fetched'] = now

    return vendors_by_id, vendors_by_name, users_by_id


class InventoryExportService:
    def __init__(self, client=None, vendor_filter=None):
        self.client = client or IlyncClient()
        self.vendor_filter = vendor_filter  # optional vendor ID/name filter
        self.materials_map = {}
        self.balances = []
        self.issues = []
        self.issue_items = []
        self.stock_items = []
        self.vendors_by_id = {}
        self.vendors_by_name = {}
        self.users_by_id = {}
        self.issue_by_serial = {}

    def fetch_all_data(self):
        """Fetch all inventory data from iLync upstream APIs."""
        # 1. Fetch vendors and users for recipient / issuer resolution
        self.vendors_by_id, self.vendors_by_name, self.users_by_id = get_cached_metadata(self.client)

        # 2. Fetch master materials
        logger.info("[InventoryExportService] Fetching all master materials...")
        try:
            mat_res = self.client.get('api/inventory/material')
            m_data = mat_res.get('data', {}) if isinstance(mat_res, dict) else {}
            content = m_data.get('content', []) if isinstance(m_data, dict) else (m_data if isinstance(m_data, list) else [])
            for m in content:
                mat_id = m.get('matId') or m.get('id')
                if mat_id:
                    self.materials_map[mat_id] = m
        except Exception as e:
            logger.warning("[InventoryExportService] Error fetching materials master: %s", e)

        # 3. Fetch stock balances
        logger.info("[InventoryExportService] Fetching stock balances...")
        try:
            bal_res = self.client.search_stock_balance(payload={'page': 0, 'size': 500})
            b_data = bal_res.get('data', {}) if isinstance(bal_res, dict) else {}
            self.balances = b_data.get('content', []) if isinstance(b_data, dict) else (b_data if isinstance(b_data, list) else [])
        except Exception as e:
            logger.warning("[InventoryExportService] Error fetching stock balances: %s", e)

        # 4. Fetch stock issues and resolve recipients
        logger.info("[InventoryExportService] Fetching stock issues...")
        try:
            iss_res = self.client.search_stock_issues(payload={'page': 0, 'size': 500})
            i_data = iss_res.get('data', {}) if isinstance(iss_res, dict) else {}
            raw_issues = i_data.get('content', []) if isinstance(i_data, dict) else (i_data if isinstance(i_data, list) else [])
            self.issues = raw_issues

            for iss in raw_issues:
                issue_num = iss.get('issueNumber') or ''
                wh_code = iss.get('fromWarehouseCode') or ''
                wh_name = iss.get('fromWarehouseName') or ''
                issuee_id = str(iss.get('issueeId') or '').strip()
                issuee_name = str(iss.get('issueeName') or '').strip()
                issued_by_id = str(iss.get('issuedBy') or iss.get('createdBy') or '').strip()
                transfer_ref = iss.get('stockTransferNumber') or ''
                issue_status = iss.get('status') or 'ISSUED'
                issued_at = iss.get('issuedAt') or iss.get('createdAt')

                # Recipient mapping resolution:
                # 1. Match vendor by id or registered name
                v_match = self.vendors_by_id.get(issuee_id) or self.vendors_by_name.get(issuee_name.lower())
                # 2. Match individual user by id
                u_match = self.users_by_id.get(issuee_id)

                vendor_registered_name = ''
                recipient_person = ''
                vendor_or_emp_id = ''

                if v_match:
                    vendor_registered_name = (v_match.get('partnerName') or v_match.get('name') or issuee_name).strip()
                    recipient_person = (v_match.get('contactName') or '').strip()
                    v_users = v_match.get('users', [])
                    matched_u = None
                    if recipient_person:
                        matched_u = next((u for u in v_users if (u.get('name') or '').strip().lower() == recipient_person.lower()), None)
                    if not matched_u:
                        matched_u = next((u for u in v_users if (u.get('designation') or '').upper() == 'VENDOR'), None)
                    if not matched_u and v_users:
                        matched_u = v_users[0]
                    if matched_u:
                        vendor_or_emp_id = matched_u.get('empId') or ''
                        if not recipient_person:
                            recipient_person = (matched_u.get('name') or '').strip()
                    if not vendor_or_emp_id:
                        vendor_or_emp_id = v_match.get('phoneNumber') or ''
                    issued_to = vendor_registered_name
                elif u_match:
                    issued_to = (u_match.get('name') or '').strip()
                    recipient_person = issued_to
                    vendor_or_emp_id = u_match.get('empId') or u_match.get('phoneNumber') or ''
                else:
                    issued_to = issuee_name
                    recipient_person = ''
                    vendor_or_emp_id = str(iss.get('issueeCode') or iss.get('issueeId') or '')

                # Resolve human user who processed the issue (Issued By)
                issued_by_user = self.users_by_id.get(issued_by_id)
                if issued_by_user:
                    u_name = (issued_by_user.get('name') or '').strip()
                    u_emp = (issued_by_user.get('empId') or '').strip()
                    issued_by_str = f"{u_name} ({u_emp})" if u_emp else u_name
                else:
                    issued_by_str = 'Store Admin / Manager'

                for it in iss.get('items', []):
                    item_copy = dict(it)
                    item_copy['issueNumber'] = issue_num
                    item_copy['fromWarehouseCode'] = wh_code
                    item_copy['fromWarehouseName'] = wh_name
                    item_copy['issueeId'] = issuee_id
                    item_copy['issueeName'] = issuee_name
                    item_copy['issuedTo'] = issued_to
                    item_copy['recipientPerson'] = recipient_person
                    item_copy['vendorOrEmpId'] = vendor_or_emp_id
                    item_copy['transferRef'] = transfer_ref
                    item_copy['issueStatus'] = issue_status
                    item_copy['issuedAt'] = issued_at
                    item_copy['issuedBy'] = issued_by_str
                    item_copy['circle'] = resolve_circle(wh_code, wh_name)
                    self.issue_items.append(item_copy)

                    # Build serial lookup map for Sheet 6
                    serial = (it.get('serialNo') or it.get('drumNumber') or '').strip()
                    if serial:
                        self.issue_by_serial[serial] = {
                            'issueNumber': issue_num,
                            'issuedTo': issued_to,
                            'recipientPerson': recipient_person,
                            'vendorOrEmpId': vendor_or_emp_id,
                            'issuedAt': issued_at,
                            'issuedBy': issued_by_str,
                            'transferRef': transfer_ref
                        }
        except Exception as e:
            logger.warning("[InventoryExportService] Error fetching stock issues: %s", e)

        # 5. Fetch all stock items (drums & serials)
        logger.info("[InventoryExportService] Fetching all stock items (drums & serials)...")
        try:
            page = 0
            size = 2000
            while True:
                it_res = self.client.search_stock_items(payload={'page': page, 'size': size})
                it_data = it_res.get('data', {}) if isinstance(it_res, dict) else {}
                content = it_data.get('content', []) if isinstance(it_data, dict) else (it_data if isinstance(it_data, list) else [])
                if not content:
                    break
                self.stock_items.extend(content)
                total = it_data.get('totalElements', len(self.stock_items))
                if len(self.stock_items) >= total or page >= it_data.get('totalPages', 1) - 1:
                    break
                page += 1
        except Exception as e:
            logger.warning("[InventoryExportService] Error fetching stock items: %s", e)

        # Apply vendor filter if specified
        if self.vendor_filter and str(self.vendor_filter).lower() != 'all':
            v_key = str(self.vendor_filter).lower().strip()
            self.issue_items = [
                it for it in self.issue_items
                if it.get('issueeId') == self.vendor_filter or v_key in str(it.get('issuedTo', '')).lower() or v_key in str(it.get('issueeName', '')).lower()
            ]

    def _get_mat_meta(self, mat_id, mat_desc=''):
        mat = self.materials_map.get(mat_id)
        if mat:
            return {
                'name': mat.get('name') or mat_desc,
                'category': mat.get('categoryName') or 'General Telecom Material',
                'subCategory': mat.get('subCategoryName') or '',
                'code': mat.get('matId') or mat_id,
                'uom': mat.get('unitOfMeasurement') or 'NOS',
                'make': mat.get('brandName') or ''
            }

        desc_lower = str(mat_desc or '').lower()
        if 'duct' in desc_lower or 'plb' in desc_lower or (mat_id and 'PLB' in str(mat_id)):
            return {'name': mat_desc or 'HDPE PLB Duct', 'category': 'PLB-Duct', 'subCategory': 'PLB Duct', 'code': mat_id or 'PLB-MAT', 'uom': 'METER', 'make': ''}
        if 'ofc' in desc_lower or 'fiber' in desc_lower or 'cable' in desc_lower or 'armoured' in desc_lower or (mat_id and 'OPT' in str(mat_id)):
            return {'name': mat_desc or 'Optical Fiber Cable', 'category': 'Optical Fiber Cable (OFC)', 'subCategory': 'OFC Cable', 'code': mat_id or 'OPT-MAT', 'uom': 'METER', 'make': ''}
        if 'jc' in desc_lower or 'closure' in desc_lower:
            return {'name': mat_desc or 'Joint Closure', 'category': 'Joint Closures & Splicing', 'subCategory': 'Joint Closure', 'code': mat_id or 'JC-MAT', 'uom': 'NOS', 'make': ''}
        if 'fdms' in desc_lower:
            return {'name': mat_desc or 'FDMS Unit', 'category': 'FDMS Systems', 'subCategory': 'FDMS', 'code': mat_id or 'FDM-MAT', 'uom': 'NOS', 'make': ''}
        if 'plug' in desc_lower or 'simplex' in desc_lower:
            return {'name': mat_desc or 'Duct Plug', 'category': 'Duct Accessories', 'subCategory': 'Plugs', 'code': mat_id or 'PLUG-MAT', 'uom': 'NOS', 'make': ''}
        if 'coupler' in desc_lower:
            return {'name': mat_desc or 'Duct Coupler', 'category': 'Duct Accessories', 'subCategory': 'Couplers', 'code': mat_id or 'COU-MAT', 'uom': 'NOS', 'make': ''}
        if 'cap' in desc_lower:
            return {'name': mat_desc or 'End Cap', 'category': 'Duct Accessories', 'subCategory': 'End Caps', 'code': mat_id or 'CAP-MAT', 'uom': 'NOS', 'make': ''}

        return {'name': mat_desc or mat_id or 'Material', 'category': 'Other Telecom Material', 'subCategory': '', 'code': mat_id or '', 'uom': 'NOS', 'make': ''}

    def generate_excel_workbook(self):
        """Generates the comprehensive 6-sheet Excel workbook."""
        wb = openpyxl.Workbook()
        wb.remove(wb.active)  # Remove default blank sheet

        # Styles definition
        header_font = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
        header_fill = PatternFill(start_color='1E3A8A', end_color='1E3A8A', fill_type='solid')
        header_align = Alignment(horizontal='center', vertical='center', wrap_text=True)

        zebra_fill = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')
        regular_font = Font(name='Calibri', size=10)
        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        def style_header(ws, col_count):
            ws.row_dimensions[1].height = 28
            for col in range(1, col_count + 1):
                cell = ws.cell(row=1, column=col)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_align
                cell.border = thin_border
            ws.freeze_panes = 'A2'

        def autofit(ws, max_cols):
            for col in range(1, max_cols + 1):
                max_len = 0
                col_letter = get_column_letter(col)
                for row in range(1, min(ws.max_row + 1, 1000)):
                    val = ws.cell(row=row, column=col).value
                    if val is not None:
                        s_len = len(str(val))
                        if s_len > max_len:
                            max_len = s_len
                ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        # Pre-aggregate issued quantities by (warehouseCode, matId)
        issued_wh_mat = {}
        issued_wh_mat_recipients = {}
        for it in self.issue_items:
            wcode = it.get('fromWarehouseCode') or 'UNASSIGNED'
            mid = it.get('matId') or it.get('materialDescription') or 'UNKNOWN'
            qty = float(it.get('quantity') or it.get('unitCount') or 0.0)
            k = (wcode, mid)
            issued_wh_mat[k] = issued_wh_mat.get(k, 0.0) + qty

            if k not in issued_wh_mat_recipients:
                issued_wh_mat_recipients[k] = set()
            r_name = it.get('issuedTo') or it.get('issueeName')
            if r_name:
                issued_wh_mat_recipients[k].add(r_name)

        # =====================================================================
        # SHEET 1: Complete Stock Summary
        # =====================================================================
        ws1 = wb.create_sheet(title='Stock Summary')
        headers1 = [
            'Material Name / Description',
            'Material Category',
            'Material Code',
            'Total Stock Quantity',
            'Total Issued Quantity',
            'Available Quantity',
            'Reserved Quantity',
            'Unit of Measurement (UOM)',
            'Warehouse Code',
            'Warehouse Name',
            'Circle',
            'Issued To (Vendors / Recipients)',
            'Stock Status'
        ]
        ws1.append(headers1)
        style_header(ws1, len(headers1))

        row_idx = 2
        seen_wh_mat = set()

        for b in self.balances:
            wcode = b.get('warehouseCode') or ''
            wname = b.get('warehouseName') or ''
            mid = b.get('matId') or ''
            meta = self._get_mat_meta(mid, b.get('materialDescription') or b.get('name'))
            circle = resolve_circle(wcode, wname)

            avail_qty = float(b.get('quantity') or 0.0)
            issued_qty = float(issued_wh_mat.get((wcode, mid), 0.0))
            total_qty = avail_qty + issued_qty
            reserved_qty = 0.0
            uom = b.get('unitOfMeasurement') or meta['uom']

            recip_set = issued_wh_mat_recipients.get((wcode, mid), set())
            recipient_str = ', '.join(sorted(recip_set)) if recip_set else 'In Central Warehouse'

            status_str = 'AVAILABLE'
            if avail_qty <= 0 and issued_qty > 0:
                status_str = 'FULLY ISSUED'
            elif avail_qty > 0 and issued_qty > 0:
                status_str = 'PARTIALLY ISSUED'
            elif avail_qty > 0 and issued_qty == 0:
                status_str = 'IN STOCK'

            seen_wh_mat.add((wcode, mid))

            row_data = [
                meta['name'],
                meta['category'],
                meta['code'],
                total_qty,
                issued_qty,
                avail_qty,
                reserved_qty,
                uom,
                wcode,
                wname,
                circle,
                recipient_str,
                status_str
            ]
            ws1.append(row_data)

            for c_idx in range(1, len(headers1) + 1):
                cell = ws1.cell(row=row_idx, column=c_idx)
                cell.font = regular_font
                cell.border = thin_border
                if row_idx % 2 == 1:
                    cell.fill = zebra_fill
                if c_idx in [4, 5, 6, 7]:
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal='right')
            row_idx += 1

        for (wcode, mid), issued_qty in issued_wh_mat.items():
            if (wcode, mid) in seen_wh_mat:
                continue
            matching_items = [it for it in self.issue_items if it.get('fromWarehouseCode') == wcode and (it.get('matId') == mid or it.get('materialDescription') == mid)]
            first_it = matching_items[0] if matching_items else {}
            wname = first_it.get('fromWarehouseName') or ''
            meta = self._get_mat_meta(mid, first_it.get('materialDescription'))
            circle = resolve_circle(wcode, wname)
            recip_set = issued_wh_mat_recipients.get((wcode, mid), set())
            recipient_str = ', '.join(sorted(recip_set)) if recip_set else 'Assigned Vendors'

            row_data = [
                meta['name'],
                meta['category'],
                meta['code'],
                issued_qty,
                issued_qty,
                0.0,
                0.0,
                first_it.get('unitOfMeasurement') or meta['uom'],
                wcode,
                wname,
                circle,
                recipient_str,
                'ISSUED TO SITE'
            ]
            ws1.append(row_data)
            for c_idx in range(1, len(headers1) + 1):
                cell = ws1.cell(row=row_idx, column=c_idx)
                cell.font = regular_font
                cell.border = thin_border
                if c_idx in [4, 5, 6, 7]:
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal='right')
            row_idx += 1

        autofit(ws1, len(headers1))

        # =====================================================================
        # SHEET 2: Warehouse-Wise Stock
        # =====================================================================
        ws2 = wb.create_sheet(title='Warehouse-Wise Stock')
        headers2 = [
            'Warehouse Code',
            'Warehouse Name',
            'Circle',
            'Material Name',
            'Material Category',
            'Total Received Quantity',
            'Total Issued Quantity',
            'Available Quantity',
            'Reserved Quantity',
            'UOM',
            'Last Updated Date'
        ]
        ws2.append(headers2)
        style_header(ws2, len(headers2))

        row_idx = 2
        for b in sorted(self.balances, key=lambda x: (x.get('warehouseCode') or '', x.get('name') or '')):
            wcode = b.get('warehouseCode') or ''
            wname = b.get('warehouseName') or ''
            mid = b.get('matId') or ''
            meta = self._get_mat_meta(mid, b.get('materialDescription') or b.get('name'))
            circle = resolve_circle(wcode, wname)

            avail_qty = float(b.get('quantity') or 0.0)
            issued_qty = float(issued_wh_mat.get((wcode, mid), 0.0))
            received_qty = avail_qty + issued_qty
            reserved_qty = 0.0
            uom = b.get('unitOfMeasurement') or meta['uom']
            updated_at = format_dt(b.get('lastUpdatedAt'))

            row_data = [
                wcode,
                wname,
                circle,
                meta['name'],
                meta['category'],
                received_qty,
                issued_qty,
                avail_qty,
                reserved_qty,
                uom,
                updated_at
            ]
            ws2.append(row_data)
            for c_idx in range(1, len(headers2) + 1):
                cell = ws2.cell(row=row_idx, column=c_idx)
                cell.font = regular_font
                cell.border = thin_border
                if row_idx % 2 == 1:
                    cell.fill = zebra_fill
                if c_idx in [6, 7, 8, 9]:
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal='right')
            row_idx += 1

        autofit(ws2, len(headers2))

        # =====================================================================
        # SHEET 3: Stock Issue Details (with mandatory Issued To & Recipient)
        # =====================================================================
        ws3 = wb.create_sheet(title='Stock Issue Details')
        headers3 = [
            'Issue Number',
            'Issue Date',
            'Drum Serial Number / Material Serial Number',
            'Material Name',
            'Material Description',
            'Material Category',
            'Issued Quantity',
            'UOM',
            'Item Status',
            'Warehouse Code',
            'Warehouse Name',
            'Circle',
            'Issued To (Person / Vendor Name)',
            'Recipient / Contact Person',
            'Vendor ID / Employee ID',
            'Issued By (User)',
            'Project / Work Reference'
        ]
        ws3.append(headers3)
        style_header(ws3, len(headers3))

        row_idx = 2
        for it in sorted(self.issue_items, key=lambda x: str(x.get('issuedAt') or ''), reverse=True):
            meta = self._get_mat_meta(it.get('matId'), it.get('materialDescription'))
            serial = it.get('serialNo') or it.get('drumNumber') or '-'
            qty = float(it.get('quantity') or it.get('unitCount') or 0.0)

            row_data = [
                it.get('issueNumber') or '-',
                format_dt(it.get('issuedAt')),
                serial,
                meta['name'],
                it.get('materialDescription') or meta['name'],
                meta['category'],
                qty,
                it.get('unitOfMeasurement') or meta['uom'],
                it.get('itemStatus') or it.get('issueStatus') or 'ISSUED',
                it.get('fromWarehouseCode') or '-',
                it.get('fromWarehouseName') or '-',
                it.get('circle') or resolve_circle(it.get('fromWarehouseCode'), it.get('fromWarehouseName')),
                it.get('issuedTo') or it.get('issueeName') or '-',
                it.get('recipientPerson') or '-',
                it.get('vendorOrEmpId') or '-',
                it.get('issuedBy') or '-',
                it.get('transferRef') or '-'
            ]
            ws3.append(row_data)
            for c_idx in range(1, len(headers3) + 1):
                cell = ws3.cell(row=row_idx, column=c_idx)
                cell.font = regular_font
                cell.border = thin_border
                if row_idx % 2 == 1:
                    cell.fill = zebra_fill
                if c_idx == 7:
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal='right')
                if c_idx in [1, 3, 10, 15]:
                    cell.alignment = Alignment(horizontal='center')
            row_idx += 1

        autofit(ws3, len(headers3))

        # =====================================================================
        # SHEET 4: Available Inventory
        # =====================================================================
        ws4 = wb.create_sheet(title='Available Inventory')
        headers4 = [
            'Warehouse',
            'Circle',
            'Material Name',
            'Material Code',
            'Material Category',
            'Available Quantity',
            'Reserved Quantity',
            'Total Quantity',
            'UOM',
            'Stock Status'
        ]
        ws4.append(headers4)
        style_header(ws4, len(headers4))

        row_idx = 2
        for b in self.balances:
            avail = float(b.get('quantity') or 0.0)
            if avail <= 0:
                continue

            wcode = b.get('warehouseCode') or ''
            wname = b.get('warehouseName') or ''
            circle = resolve_circle(wcode, wname)
            meta = self._get_mat_meta(b.get('matId'), b.get('materialDescription') or b.get('name'))
            wh_display = f"{wname} ({wcode})".strip()

            row_data = [
                wh_display,
                circle,
                meta['name'],
                meta['code'],
                meta['category'],
                avail,
                0.0,
                avail,
                b.get('unitOfMeasurement') or meta['uom'],
                'AVAILABLE'
            ]
            ws4.append(row_data)
            for c_idx in range(1, len(headers4) + 1):
                cell = ws4.cell(row=row_idx, column=c_idx)
                cell.font = regular_font
                cell.border = thin_border
                if row_idx % 2 == 1:
                    cell.fill = zebra_fill
                if c_idx in [6, 7, 8]:
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal='right')
            row_idx += 1

        autofit(ws4, len(headers4))

        # =====================================================================
        # SHEET 5: Material-Wise Summary
        # =====================================================================
        ws5 = wb.create_sheet(title='Material-Wise Summary')
        headers5 = [
            'Material Name',
            'Material Category',
            'Total Quantity',
            'Issued Quantity',
            'Available Quantity',
            'Reserved Quantity',
            'UOM',
            'Number of Warehouses',
            'Number of Circles'
        ]
        ws5.append(headers5)
        style_header(ws5, len(headers5))

        mat_summary = {}

        # 1. From materials master
        for mid, m in self.materials_map.items():
            meta = self._get_mat_meta(mid, m.get('materialDescription') or m.get('name'))
            mat_summary[mid] = {
                'name': meta['name'],
                'category': meta['category'],
                'code': mid,
                'uom': meta['uom'],
                'available': 0.0,
                'issued': 0.0,
                'reserved': 0.0,
                'warehouses': set(),
                'circles': set()
            }

        # 2. From balances
        for b in self.balances:
            mid = b.get('matId') or b.get('name')
            if mid not in mat_summary:
                meta = self._get_mat_meta(mid, b.get('materialDescription') or b.get('name'))
                mat_summary[mid] = {
                    'name': meta['name'],
                    'category': meta['category'],
                    'code': mid,
                    'uom': meta['uom'],
                    'available': 0.0,
                    'issued': 0.0,
                    'reserved': 0.0,
                    'warehouses': set(),
                    'circles': set()
                }
            qty = float(b.get('quantity') or 0.0)
            mat_summary[mid]['available'] += qty
            wcode = b.get('warehouseCode') or ''
            if wcode:
                mat_summary[mid]['warehouses'].add(wcode)
                mat_summary[mid]['circles'].add(resolve_circle(wcode, b.get('warehouseName')))

        # 3. From issues
        for it in self.issue_items:
            mid = it.get('matId') or it.get('materialDescription')
            if mid not in mat_summary:
                meta = self._get_mat_meta(mid, it.get('materialDescription'))
                mat_summary[mid] = {
                    'name': meta['name'],
                    'category': meta['category'],
                    'code': mid,
                    'uom': meta['uom'],
                    'available': 0.0,
                    'issued': 0.0,
                    'reserved': 0.0,
                    'warehouses': set(),
                    'circles': set()
                }
            qty = float(it.get('quantity') or it.get('unitCount') or 0.0)
            mat_summary[mid]['issued'] += qty
            wcode = it.get('fromWarehouseCode') or ''
            if wcode:
                mat_summary[mid]['warehouses'].add(wcode)
                mat_summary[mid]['circles'].add(it.get('circle') or resolve_circle(wcode, it.get('fromWarehouseName')))

        row_idx = 2
        for mid, s in sorted(mat_summary.items(), key=lambda x: (x[1]['category'], x[1]['name'])):
            tot = s['available'] + s['issued']
            row_data = [
                s['name'],
                s['category'],
                tot,
                s['issued'],
                s['available'],
                s['reserved'],
                s['uom'],
                len(s['warehouses']),
                len(s['circles'])
            ]
            ws5.append(row_data)
            for c_idx in range(1, len(headers5) + 1):
                cell = ws5.cell(row=row_idx, column=c_idx)
                cell.font = regular_font
                cell.border = thin_border
                if row_idx % 2 == 1:
                    cell.fill = zebra_fill
                if c_idx in [3, 4, 5, 6]:
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal='right')
                if c_idx in [8, 9]:
                    cell.alignment = Alignment(horizontal='center')
            row_idx += 1

        autofit(ws5, len(headers5))

        # =====================================================================
        # SHEET 6: Drum & Serialized Items (with recipient & issue linkage)
        # =====================================================================
        ws6 = wb.create_sheet(title='Drum & Serialized Items')
        headers6 = [
            'Drum Serial Number',
            'Material Name / Description',
            'Material Category',
            'Material Code',
            'Serial Start Length (m)',
            'Serial End Length (m)',
            'Total Length / Unit Count',
            'UOM',
            'Status',
            'Issued To (Person / Vendor Name)',
            'Recipient / Contact Person',
            'Vendor ID / Employee ID',
            'Issue Number',
            'Issue Date',
            'Issued By (User)',
            'Warehouse Code',
            'Warehouse Name',
            'Circle',
            'GRN Number',
            'Created / Received Date'
        ]
        ws6.append(headers6)
        style_header(ws6, len(headers6))

        row_idx = 2
        items_source = self.stock_items if self.stock_items else self.issue_items

        for it in items_source:
            serial = it.get('serialNo') or it.get('drumNumber')
            if not serial:
                continue

            mid = it.get('matId')
            desc = it.get('materialDescription') or it.get('name')
            meta = self._get_mat_meta(mid, desc)
            wcode = it.get('warehouseCode') or it.get('fromWarehouseCode') or ''
            wname = it.get('warehouseName') or it.get('fromWarehouseName') or ''
            circle = resolve_circle(wcode, wname)

            start_len = float(it.get('unitStartLength') or it.get('currentStartLength') or 0.0)
            end_len = float(it.get('unitEndLength') or it.get('currentEndLength') or 0.0)
            count_len = float(it.get('unitCount') or it.get('currentCount') or it.get('quantity') or (end_len - start_len if end_len > start_len else 0.0))

            status_str = (it.get('status') or it.get('itemStatus') or 'AVAILABLE').upper()

            # Link serial with issue metadata
            issue_meta = self.issue_by_serial.get(serial.strip(), {})
            if status_str == 'ISSUED' or issue_meta:
                issued_to = issue_meta.get('issuedTo') or it.get('issuedTo') or it.get('issueeName') or '-'
                recipient_person = issue_meta.get('recipientPerson') or it.get('recipientPerson') or '-'
                vendor_or_emp = issue_meta.get('vendorOrEmpId') or it.get('vendorOrEmpId') or '-'
                issue_num = issue_meta.get('issueNumber') or it.get('issueNumber') or '-'
                issue_dt = format_dt(issue_meta.get('issuedAt') or it.get('issuedAt'))
                issued_by_val = issue_meta.get('issuedBy') or it.get('issuedBy') or '-'
            else:
                issued_to = '-'
                recipient_person = '-'
                vendor_or_emp = '-'
                issue_num = '-'
                issue_dt = '-'
                issued_by_val = '-'

            row_data = [
                serial,
                meta['name'],
                meta['category'],
                meta['code'],
                start_len,
                end_len,
                count_len,
                it.get('unitOfMeasurement') or meta['uom'],
                status_str,
                issued_to,
                recipient_person,
                vendor_or_emp,
                issue_num,
                issue_dt,
                issued_by_val,
                wcode,
                wname,
                circle,
                it.get('grnNumber') or '-',
                format_dt(it.get('createdAt') or it.get('issuedAt'))
            ]
            ws6.append(row_data)

            for c_idx in range(1, len(headers6) + 1):
                cell = ws6.cell(row=row_idx, column=c_idx)
                cell.font = regular_font
                cell.border = thin_border
                if c_idx in [5, 6, 7]:
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal='right')
                if c_idx in [1, 4, 9, 12, 13, 14, 16]:
                    cell.alignment = Alignment(horizontal='center')
                if c_idx == 9:
                    if status_str == 'AVAILABLE':
                        cell.font = Font(name='Calibri', size=10, bold=True, color='16A34A')
                    elif status_str == 'ISSUED':
                        cell.font = Font(name='Calibri', size=10, bold=True, color='0284C7')
            row_idx += 1

        autofit(ws6, len(headers6))

        # Save workbook to memory stream
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
