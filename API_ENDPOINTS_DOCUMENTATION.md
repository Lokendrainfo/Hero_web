# HERO WEB REST API DOCUMENTATION

**Base URL (Production)**: `https://hero.pramaanu.co.in/api/v1/`  
**Base URL (Local Dev)**: `http://localhost:8000/api/v1/`  
**Authentication Header**: `Authorization: Bearer <your_access_token>`  
**Content-Type**: `application/json` (or `multipart/form-data` for photo/file uploads)

---

## 1. AUTHENTICATION & PROFILE

### 1.1 User Login
- **Endpoint**: `/api/v1/auth/login/`
- **Method**: `POST`
- **Authentication**: Public
- **Request Payload**:
```json
{
  "username": "9799272429",
  "password": "your_secure_password"
}
```
- **Response Payload (200 OK)**:
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 254,
    "username": "9799272429",
    "email": "vendor@hero.com",
    "first_name": "Papu",
    "last_name": "Ram 2",
    "employee_id": "VND-9799272429",
    "role": "VENDOR",
    "roles": ["VENDOR"],
    "vendor": {
      "id": 14,
      "name": "Naveen Telecom Network 2"
    }
  }
}
```

---

### 1.2 User Profile (`/me/`)
- **Endpoint**: `/api/v1/me/`
- **Method**: `GET`
- **Authentication**: Bearer Token
- **Response Payload (200 OK)**:
```json
{
  "id": 254,
  "username": "9799272429",
  "first_name": "Papu",
  "last_name": "Ram 2",
  "employee_id": "VND-9799272429",
  "phone_number": "9799272429",
  "role": "VENDOR",
  "roles": ["VENDOR"],
  "reporting_manager_id": 1,
  "reporting_manager_name": "ADMIN Sharma",
  "vendor": {
    "id": 14,
    "name": "Naveen Telecom Network 2"
  },
  "is_active": true
}
```

---

## 2. ATTENDANCE & APPROVALS

### 2.1 Employee Check-In
- **Endpoint**: `/api/v1/attendance/check-in/`
- **Method**: `POST`
- **Authentication**: Bearer Token
- **Request Payload**:
```json
{
  "user_id": 254,
  "check_in_latitude": 28.613900,
  "check_in_longitude": 77.209000,
  "check_in_accuracy": 10.5,
  "check_in_photo": "bycrypt//kavckha",
  "location_source": "GPS",
  "attendance_type": "TEAM"
}
```
- **Response Payload (201 Created / 200 OK)**:
```json
{
  "id": 17,
  "user": 254,
  "user_id": 254,
  "user_name": "Papu Ram 2",
  "employee_id": "VND-9799272429",
  "phone_number": "9799272429",
  "role": "VENDOR",
  "reporting_manager_id": 1,
  "reporting_manager_name": "ADMIN Sharma",
  "attendance_type": "TEAM",
  "machine_id": null,
  "machine_chassis_no": null,
  "vendor_id": 14,
  "vendor_name": "Naveen Telecom Network 2",
  "marked_by": 254,
  "status": "CHECKED_IN",
  "check_in": "2026-09-15T07:45:30.468480Z",
  "check_out": null,
  "check_in_latitude": "28.613900",
  "check_in_longitude": "77.209000",
  "check_in_accuracy": 10.5,
  "check_in_photo": "https://hero.pramaanu.co.in/media/checkin_254.jpg",
  "approval_status": "PENDING",
  "approved_by": null,
  "approved_at": null,
  "rejection_reason": null,
  "shift": "DAY"
}
```

---

### 2.2 Employee Check-Out
- **Endpoint**: `/api/v1/attendance/check-out/`
- **Method**: `POST`
- **Authentication**: Bearer Token
- **Request Payload**:
```json
{
  "user_id": 254,
  "check_out_latitude": 28.613900,
  "check_out_longitude": 77.209000,
  "check_out_accuracy": 10.5,
  "check_out_photo": "bycrypt//kavckha"
}
```
- **Response Payload (200 OK)**:
```json
{
  "id": 17,
  "user_id": 254,
  "status": "CHECKED_OUT",
  "check_in": "2026-09-15T07:45:30.468480Z",
  "check_out": "2026-09-15T16:30:00.000000Z",
  "total_working_seconds": 31469,
  "total_working_hours": "08h 44m",
  "approval_status": "PENDING"
}
```

---

### 2.3 Team Attendance Roster
- **Endpoint**: `/api/v1/attendance/team-attendance/`
- **Method**: `GET`
- **Query Parameters**:
  - `date`: `YYYY-MM-DD` (Optional, defaults to today)
  - `vendor`: Vendor name or ID (Optional)
  - `role`: `OPERATOR` | `SUPERVISOR` | `HELPER` | `VENDOR` (Optional)
  - `search`: Search name or employee ID (Optional)
  - `status`: `PRESENT` | `ABSENT` | `CHECKED_IN` | `CHECKED_OUT` (Optional)
- **Response Payload (200 OK)**:
```json
{
  "success": true,
  "data": {
    "date": "2026-09-15",
    "summary": {
      "total": 54,
      "present": 22,
      "absent": 5,
      "half_day": 2,
      "leave": 1,
      "week_off": 0,
      "not_marked": 24
    },
    "team_members": [
      {
        "user_id": 254,
        "employee_id": "VND-9799272429",
        "user_name": "Papu Ram 2",
        "phone_number": "9799272429",
        "role": "VENDOR",
        "vendor_name": "Naveen Telecom Network 2",
        "is_active": true,
        "attendance_id": 17,
        "status": "CHECKED_IN",
        "approval_status": "PENDING",
        "check_in": "07:45",
        "check_out": null,
        "check_in_latitude": 28.6139,
        "check_in_longitude": 77.209,
        "check_in_photo": "https://hero.pramaanu.co.in/media/checkin_254.jpg",
        "total_working_hours": null
      }
    ]
  }
}
```

---

### 2.4 Bulk Mark Team Attendance
- **Endpoint**: `/api/v1/attendance/bulk-mark/`
- **Method**: `POST`
- **Request Payload**:
```json
{
  "date": "2026-09-15",
  "records": [
    {
      "user_id": 254,
      "status": "PRESENT",
      "notes": "On-site Sujangarh work"
    },
    {
      "user_id": 255,
      "status": "ABSENT",
      "notes": "Uninformed leave"
    }
  ]
}
```

---

### 2.5 Pending Manager Approvals
- **Endpoint**: `/api/v1/attendance/pending-approvals/`
- **Method**: `GET`
- **Query Parameters**: `page=0`, `size=20`
- **Response Payload (200 OK)**:
```json
{
  "results": [
    {
      "id": 17,
      "user": 254,
      "user_name": "Papu Ram 2",
      "employee_id": "VND-9799272429",
      "reporting_manager_name": "ADMIN Sharma",
      "attendance_type": "TEAM",
      "check_in": "2026-09-15T07:45:30.468480Z",
      "check_in_latitude": 28.6139,
      "check_in_longitude": 77.2090,
      "check_in_photo": "https://hero.pramaanu.co.in/media/checkin_254.jpg",
      "approval_status": "PENDING"
    }
  ],
  "total": 1,
  "page": 0,
  "size": 20
}
```

---

### 2.6 Manager Approve Attendance
- **Endpoint**: `/api/v1/attendance/{id}/approve/`
- **Method**: `POST`
- **Response Payload (200 OK)**:
```json
{
  "success": true,
  "message": "Attendance record approved successfully.",
  "approval_status": "APPROVED"
}
```

---

### 2.7 Manager Reject Attendance
- **Endpoint**: `/api/v1/attendance/{id}/reject/`
- **Method**: `POST`
- **Request Payload**:
```json
{
  "reason": "GPS location is outside assigned site boundary."
}
```

---

### 2.8 Bulk Export Attendance Report (CSV)
- **Endpoint**: `/api/v1/attendance/export-report/`
- **Method**: `GET`
- **Query Parameters**: `date=2026-09-15`, `date_from=2026-09-01`, `date_to=2026-09-15`, `vendor=Naveen`
- **Response**: Standard CSV File Download (`Content-Type: text/csv`)

---

## 3. MACHINES & FLEET MANAGEMENT

### 3.1 Fetch All Machines
- **Endpoint**: `/api/v1/machines/`
- **Method**: `GET`
- **Query Parameters**: `vendor_id=14`, `status=LIVE`, `search=A600`
- **Response Payload (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 56,
      "code": "MAC-8408",
      "machine_no": "MAC-8408",
      "machine_chassis_no": "600202608408",
      "engine_no": "TPHM106451",
      "model_code": "A600",
      "model_name": "APOLLO A600 V2",
      "vendor_id": 14,
      "vendor_name": "Naveen Telecom Network 2",
      "operator_id": 265,
      "operator_name": "Raj Kumar Singh",
      "is_commissioned": true,
      "current_status": "LIVE"
    }
  ]
}
```

---

### 3.2 Create Machine
- **Endpoint**: `/api/v1/machines/`
- **Method**: `POST`
- **Request Payload**:
```json
{
  "code": "MAC-8409",
  "name": "APOLLO A600 V2",
  "serial_number": "600202608409",
  "engine_no": "TPHM106452",
  "vendor": 14,
  "operator": 265,
  "is_commissioned": true
}
```

---

## 4. REFUEL & DIESEL LOGS

### 4.1 Fetch Refuel Entries
- **Endpoint**: `/api/v1/refuel/`
- **Method**: `GET`
- **Query Parameters**: `machine_id=56`, `vendor_id=14`
- **Response Payload (200 OK)**:
```json
[
  {
    "id": 37,
    "machine": 56,
    "machine_code": "MAC-8408",
    "machine_name": "A600 HDD (8408)",
    "performed_by": 265,
    "performed_by_name": "Raj Kumar Singh",
    "quantity_liters": "60.00",
    "price_per_liter": "95.00",
    "total_cost": "5700.00",
    "meter_reading": "1190.00",
    "refuel_date": "2026-09-10T00:41:53.436604Z",
    "notes": "Field refueling at Sujangarh-SITE"
  }
]
```

---

### 4.2 Create Refuel Entry
- **Endpoint**: `/api/v1/refuel/`
- **Method**: `POST`
- **Request Payload**:
```json
{
  "machine": 56,
  "quantity_liters": 60.0,
  "price_per_liter": 95.0,
  "total_cost": 5700.0,
  "meter_reading": 1190.0,
  "notes": "Field refueling at Sujangarh-SITE"
}
```

---

### 4.3 Fetch Fuel Logs (Consolidated Analytics)
- **Endpoint**: `/api/v1/fuel/`
- **Method**: `GET`
- **Response Payload (200 OK)**:
```json
[
  {
    "id": 1,
    "machine": 56,
    "machine_name": "MAC-8408",
    "machine_no": "MAC-8408",
    "machine_details": {
      "id": 56,
      "code": "MAC-8408",
      "name": "A600 HDD (8408)",
      "model_name": "A600 HDD (8408)",
      "chassis_number": "600202608408"
    },
    "liters": "60.00",
    "cost": "5700.00",
    "fuel_date": "2026-09-10",
    "remarks": "Field refueling at Sujangarh-SITE"
  }
]
```

---

## 5. MAINTENANCE & BREAKDOWNS

### 5.1 Fetch Preventive Maintenance Records
- **Endpoint**: `/api/v1/maintenance/`
- **Method**: `GET`
- **Response Payload (200 OK)**:
```json
{
  "results": [
    {
      "id": 1,
      "machine": 56,
      "machine_code": "MAC-8408",
      "machine_name": "A600 HDD (8408)",
      "service_type": "500 Hours Engine Service",
      "last_service_hours": 1190,
      "next_service_hours": 1690,
      "hours_remaining": 500,
      "status": "DUE_SOON",
      "assigned_technician_name": "Amit Sharma",
      "vendor_name": "Naveen Telecom Network 2"
    }
  ]
}
```

---

### 5.2 Fetch Breakdown Reports
- **Endpoint**: `/api/v1/breakdowns/` or `/api/v1/breakdown/`
- **Method**: `GET`
- **Response Payload (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "machine": 56,
      "machine_code": "MAC-8408",
      "chassis_no": "600202608408",
      "issue_type": "HYDRAULIC_LEAK",
      "severity": "CRITICAL",
      "status": "OPEN",
      "reported_by_name": "Raj Kumar Singh",
      "description": "Hydraulic hose pressure drop detected during drilling.",
      "reported_at": "2026-09-15T08:00:00Z"
    }
  ]
}
```

---

### 5.3 Report Breakdown Issue
- **Endpoint**: `/api/v1/breakdowns/`
- **Method**: `POST`
- **Request Payload**:
```json
{
  "machine": 56,
  "issue_type": "HYDRAULIC_LEAK",
  "severity": "HIGH",
  "description": "Main pump pressure leaking.",
  "location": "Sujangarh Site"
}
```

---

## 6. EXPENSES

### 6.1 Fetch Expenses
- **Endpoint**: `/api/v1/expenses/`
- **Method**: `GET`
- **Response Payload (200 OK)**:
```json
[
  {
    "id": 1,
    "title": "Diesel Fuel Tank Refill",
    "amount": "15000.00",
    "category_name": "Fuel & Lubricants",
    "vendor_name": "Naveen Telecom Network 2",
    "status": "APPROVED",
    "date": "2026-09-14"
  }
]
```

---

### 6.2 Submit Expense Claim
- **Endpoint**: `/api/v1/expenses/`
- **Method**: `POST`
- **Request Payload**:
```json
{
  "title": "Machine Hydraulic Oil Top-up",
  "amount": 3500.0,
  "category": 2,
  "vendor": 14,
  "receipt_photo": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "notes": "Emergency purchase at Sujangarh"
}
```

---

## 7. LIVE TRACKING & TELEMETRY

### 7.1 Real-Time Machine Telemetry Vector
- **Endpoint**: `/api/v1/tracking/locations/`
- **Method**: `GET`
- **Response Payload (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 56,
      "machine_id": 56,
      "chassis_number": "600202608408",
      "name": "APOLLO A600 V2",
      "model": "A600",
      "vendor_name": "Naveen Telecom Network 2",
      "operator_name": "Raj Kumar Singh",
      "is_online": true,
      "status": "LIVE",
      "latitude": 28.6142,
      "longitude": 77.2095,
      "speed_kmph": 14.2,
      "fuel_level": 78.5,
      "fuel_percentage": 78.5,
      "engine_hours": 1190.5,
      "last_updated": "2026-09-15T13:56:00Z"
    }
  ]
}
```

---

## 8. ALERTS & NOTIFICATIONS

### 8.1 Fetch Alerts Feed
- **Endpoint**: `/api/v1/alerts/`
- **Method**: `GET`
- **Response Payload (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "machine_chassis_no": "600202608408",
      "alert_title": "Low Fuel Warning",
      "message": "Fuel level reached 18% on APOLLO A600 V2",
      "severity": "WARNING",
      "alert_type": "LOW_FUEL",
      "created_at": "2026-09-15T10:15:00Z",
      "is_read": false
    }
  ]
}
```

---

## 9. STOCK & INVENTORY

### 9.1 Search Inventory Balance
- **Endpoint**: `/api/v1/stock/balance/search/`
- **Method**: `GET`
- **Query Parameters**: `q=Hydraulic`
- **Response Payload (200 OK)**:
```json
[
  {
    "id": 1,
    "item_code": "SP-HYD-01",
    "item_name": "Hydraulic Filter Cartridge",
    "quantity": 15,
    "unit": "Pcs",
    "warehouse": "Central Yard"
  }
]
```

---

## 10. TASKS & EXECUTION

### 10.1 Fetch User Assigned Tasks
- **Endpoint**: `/api/v1/tasks/`
- **Method**: `GET`
- **Response Payload (200 OK)**:
```json
[
  {
    "id": 12,
    "title": "Sujangarh HDD Cable Laying",
    "assigned_to_name": "Papu Ram 2",
    "status": "IN_PROGRESS",
    "due_date": "2026-09-20"
  }
]
```
