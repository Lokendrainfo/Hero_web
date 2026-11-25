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

## Multi-Database Architecture

- **Primary Database (`default` -> `machine_pm_db`)**: Stores all 10 `pm_*` tables (`pm_frequency_master`, `pm_category_master`, `pm_checklist_master`, `pm_checklist_frequency_mapping`, `pm_role_frequency_mapping`, `pm_submission`, `pm_checklist_response`, `pm_photo_attachment`, `pm_approval_review`, `pm_audit_log`), migrations, and Django session/contenttype metadata.
- **Secondary Database (`hero` -> `hero_hdd_db`, read-only)**: Used exclusively by `apps/hero_integration` (`managed = False` models) to read HERO users, API keys, roles, vendors, and machines.
- **Database Router (`config/db_router.py` -> `HeroPMDatabaseRouter`)**:
  - Routes `pm_maintenance` reads, writes, and migrations exclusively to `default` (`machine_pm_db`).
  - Routes `hero_integration` reads exclusively to `hero` (`hero_hdd_db`).
  - Blocks all write operations and migrations on `hero` (`hero_hdd_db`).
- **Zero Duplication & Application-Level Referential Validation**: PM records store validated HERO `machine_id`, `submitted_by_id`, `uploaded_by_id`, `responded_by_id`, `reviewer_id`, and `actor_id` (validated against `hero` DB before write) instead of cross-database foreign keys.

## Setup, Migration & Verification Procedure

1. **Create the PostgreSQL database `machine_pm_db`** (leaving `hero_hdd_db` untouched):
   ```sql
   CREATE DATABASE machine_pm_db;
   ```

2. **Install dependencies** (if using an isolated virtual environment):
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**:
   Copy `.env.example` to `.env` and configure both database URLs plus `SECRET_KEY` (must match HERO backend):
   ```bash
   cp .env.example .env
   ```
   Required variables:
   - `DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/machine_pm_db`
   - `HERO_DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/hero_hdd_db`

4. **Run PM database migrations (exclusively on `default` -> `machine_pm_db`)**:
   ```bash
   python manage.py migrate --database=default
   ```

5. **Verify migration isolation**:
   Confirm zero migrations are planned or executed against `hero` (`hero_hdd_db`):
   ```bash
   python manage.py migrate --database=hero --plan
   ```
   Expected output: `No planned migration operations.`

6. **Seed Apollo HDD A600V2 SOP Masters into `machine_pm_db`**:
   ```bash
   python manage.py seed_pm_master
   ```
   Optionally pass a custom Excel path:
   ```bash
   python manage.py seed_pm_master --excel "C:\Path\To\Standard Operating Procedure- A600V2.xlsx"
   ```

7. **Run the independent PM backend server**:
   ```bash
   python manage.py runserver 0.0.0.0:8001
   ```
   Production (Gunicorn / Uvicorn):
   ```bash
   gunicorn config.wsgi:application --bind 0.0.0.0:8001 --workers 4
   ```

8. **Verify health**:
   `GET http://127.0.0.1:8001/api/v1/pm/health/`

9. **Run automated tests (isolated dual SQLite test databases)**:
   ```bash
   python -m pytest
   ```

