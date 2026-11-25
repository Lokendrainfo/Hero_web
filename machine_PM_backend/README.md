# HERO Machine Preventive Maintenance Backend (`machine_PM_backend`)

Independent Django 4.2 + DRF preventive maintenance backend for the **Apollo HDD Model A600V2** fleet, integrated directly with the existing HERO database (`hero_hdd_db`), JWT authentication, RBAC roles, and Machine Master without duplicating user or machine tables.

## Architecture Highlights

- **Independent Runtime**: Runs on port `8001` (`PM_BACKEND_PORT=8001`) without starting or modifying the existing HERO backend.
- **Zero Duplication**: Reads HERO `authentication_user`, `roles_role`, `roles_userrole`, `vendors_vendor`, `vendors_herovendorassignment`, `machines_machine`, and `machine_shift_machineshiftrequest` as unmanaged Django models (`managed = False`).
- **Isolated PM Schema (`pm_*` tables)**: Uses Django `app_label = 'pm_maintenance'` and `pm_*` table prefixes so migrations never collide with HERO tables.
- **Role-Based Frequency Enforcement**:
  - `OPERATOR`: `DAILY`, `50_HOURS`
  - `FIELD_ENGINEER`: `100_HOURS`, `250_HOURS`
  - `AREA_MANAGER`: `500_HOURS`, `1000_HOURS` (plus submission review/approval)
  - `ADMIN` / `SUPER_ADMIN`: All 6 frequencies + Admin Configuration + Approval/Review
- **Mandatory Individual Photo Evidence**:
  - Every checklist activity requires its own separate image upload (`JPEG`, `PNG`, `WEBP`, validated via Pillow + size check).
  - SHA-256 deduplication prevents reusing one photograph across multiple activities.
  - Activities marked `NOT_COMPLETED` require both a photograph and explanatory remarks.
  - Photos are served through access-controlled API endpoints (`GET /api/v1/pm/photos/<id>/view/`).

## Directory Structure

```
machine_PM_backend/
├── .env.example
├── .env
├── manage.py
├── pytest.ini
├── requirements.txt
├── README.md
├── docs/
│   └── API_DOCUMENTATION.md
├── config/
│   ├── urls.py
│   ├── wsgi.py
│   ├── asgi.py
│   └── settings/
│       ├── base.py
│       ├── development.py
│       ├── production.py
│       └── testing.py
└── apps/
    ├── common/                 # Standardized responses, pagination, exception handler
    ├── hero_integration/       # Unmanaged HERO models, JWT auth, RBAC & vendor isolation
    └── maintenance/            # PM models, SOP seeder, services, serializers, views, tests
```

## Setup & Startup Instructions

1. **Install dependencies** (if using an isolated virtual environment):
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment**:
   Copy `.env.example` to `.env` and ensure `SECRET_KEY` and `DATABASE_URL` match your HERO backend so HERO JWT Bearer tokens authenticate seamlessly:
   ```bash
   cp .env.example .env
   ```

3. **Run PM database migrations**:
   ```bash
   python manage.py migrate pm_maintenance
   ```

4. **Seed Apollo HDD A600V2 SOP Masters**:
   ```bash
   python manage.py seed_pm_master
   ```
   Optionally pass a custom Excel path:
   ```bash
   python manage.py seed_pm_master --excel "C:\Path\To\Standard Operating Procedure- A600V2.xlsx"
   ```

5. **Run the independent PM backend server**:
   ```bash
   python manage.py runserver 0.0.0.0:8001
   ```
   Production (Gunicorn / Uvicorn):
   ```bash
   gunicorn config.wsgi:application --bind 0.0.0.0:8001 --workers 4
   ```

6. **Verify health**:
   `GET http://127.0.0.1:8001/api/v1/pm/health/`

7. **Run automated tests**:
   ```bash
   python -m pytest
   ```

