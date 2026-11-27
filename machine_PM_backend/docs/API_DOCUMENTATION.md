# Machine Preventive Maintenance Backend — API Documentation

Base URL (local independent server): `http://127.0.0.1:8001/api/v1/pm/`
Frontend configurable env: `VITE_PM_API_BASE_URL=/pm-api/v1` (or direct URL `http://127.0.0.1:8001/api/v1`)

## Authentication

All endpoints (except `/health/`) require a valid **HERO JWT Bearer token**:
```
Authorization: Bearer <access_token>
```
Standard Response Envelope:
```json
{
  "success": true,
  "message": "...",
  "data": {},
  "meta": {}
}
```

---

## Endpoints

### 1. Health Check
- `GET /api/v1/pm/health/` (No auth required)

### 2. Dashboard & Fleet Status
- `GET /api/v1/pm/dashboard/`
  - Query params: `date_from`, `date_to`, `machine_id`, `vendor_id`, `user_id`, `frequency` (`ALL|DAILY|50_HOURS|100_HOURS|250_HOURS|500_HOURS|1000_HOURS`), `status` (`ALL|DUE|OVERDUE|COMPLETED|PENDING`), `search`
  - Returns: `role_info`, `kpis` (`total_machines`, `maintenance_due`, `maintenance_completed`, `pending_maintenance`, `overdue_maintenance`, `total_submissions`), `frequency_completion`, and `machines` status table.

### 3. Frequencies & Role Permissions
- `GET /api/v1/pm/frequencies/`
  - Returns `role_info` (`role`, `roles`, `is_admin`, `can_review`, `allowed_frequencies`) and all frequencies with `can_view` / `can_submit` flags.

### 4. Checklist Retrieval
- `GET /api/v1/pm/checklist/?frequency=<CODE>`
  - Enforces role access (HTTP `403` if user's role is not permitted for the requested frequency).
  - Returns `frequency`, `items`, `categories` (`MACHINE`, `ENGINE`), `as_required_reference_items`, and `safety_guidelines`.

### 5. Safety Guidelines
- `GET /api/v1/pm/safety-guidelines/`
  - Returns the 5 Apollo HDD A600V2 SOP safety sections (`PRE_OPERATING`, `DRILL_ROD_USES`, `VISE_CLAMP`, `GEAR_BOX`, `GENERAL_DONTS`).

### 6. Machine Master & Hour Meter (HERO Integration)
- `GET /api/v1/pm/machines/` — List authorized HERO machines with vendor, assigned operator, assignment details, and current `engine_hours`.
- `GET /api/v1/pm/machines/<machine_id>/validate/` — Validate machine access and return full machine + latest PM info.
- `GET /api/v1/pm/machines/<machine_id>/hour-meter/` — Return HERO `engine_hours` and last PM hour-meter reading.

### 7. Mandatory Individual Photo Evidence
- `POST /api/v1/pm/photos/upload/` (`multipart/form-data`)
  - Fields: `file` (JPEG/PNG/WEBP, max 10MB), `machine_id`, `checklist_item_id`, `frequency`, optional `captured_at`, `latitude`, `longitude`.
  - Validates image integrity via Pillow, computes SHA-256 hash, blocks duplicate/shared photos across activities.
  - Returns `201` with `id`, `sha256_hash`, `view_url`, and metadata.
- `GET /api/v1/pm/photos/` — Paginated gallery of bound photo evidence (filters: `machine_id`, `frequency`, `submission_id`, `user_id`).
- `GET /api/v1/pm/photos/<photo_id>/view/` — Access-controlled binary image streaming (requires Bearer token + machine authorization).

### 8. Maintenance Submission
- `POST /api/v1/pm/submissions/`
  - Supports `application/json` (referencing uploaded `photo_id` per item) or `multipart/form-data` (`responses` JSON string + `photo_<checklist_item_id>` files).
  - Body:
    ```json
    {
      "machine_id": 8,
      "frequency": "DAILY",
      "hour_meter_reading": 185.5,
      "general_remarks": "All daily points greased",
      "client_request_id": "optional-uuid",
      "responses": [
        {
          "checklist_item_id": 1,
          "status": "COMPLETED",
          "remarks": "OK",
          "photo_id": 101
        }
      ]
    }
    ```
  - Server-side checks: role access (`403`), machine access (`403`), duplicate submission (`409`), missing checklist items (`400`), missing/reused photo (`400`), missing remarks for `NOT_COMPLETED` (`400`).

### 9. Maintenance History, Pending, Overdue & Reports
- `GET /api/v1/pm/submissions/` — Filterable paginated submission history (`date_from`, `date_to`, `machine_id`, `vendor_id`, `user_id`, `frequency`, `status`, `approval_status`, `search`).
- `GET /api/v1/pm/submissions/<submission_id>/` — Full submission detail including all checklist responses, photo metadata/URLs, and approval reviews.
- `GET /api/v1/pm/history/machine/<machine_id>/` — Machine-wise maintenance history.
- `GET /api/v1/pm/history/user/` & `/api/v1/pm/history/user/<user_id>/` — User-wise maintenance history.
- `GET /api/v1/pm/pending/` — Due & pending machines.
- `GET /api/v1/pm/overdue/` — Overdue machines.
- `GET /api/v1/pm/reports/` — Aggregated compliance & vendor/user summary (`?export=csv` downloads CSV report).

### 10. Approval / Review & Audit Logs
- `POST /api/v1/pm/submissions/<submission_id>/review/` (`AREA_MANAGER` or `ADMIN` only)
  - Body: `{"action": "APPROVED" | "REJECTED" | "CHANGES_REQUESTED", "remarks": "..."}`
- `GET /api/v1/pm/audit-logs/` — Paginated immutable audit trail.

### 11. Admin Configuration (`ADMIN` / `SUPER_ADMIN` only)
- `GET/POST/PATCH/DELETE /api/v1/pm/admin/categories/`
- `GET/POST/PATCH/DELETE /api/v1/pm/admin/frequencies/`
- `GET/POST/PATCH/DELETE /api/v1/pm/admin/checklist-items/`
- `GET/POST/PATCH/DELETE /api/v1/pm/admin/frequency-mappings/`
- `GET/POST/PATCH/DELETE /api/v1/pm/admin/role-mappings/`



---

## Mobile APK Integration APIs (`X-API-Key` & `Bearer JWT`)

### 1. Machine Maintenance Check API
- `GET /api/v1/machine-maintenance/check`
- Query params: `machine_id` (required), `user_id` (required with `X-API-Key`, alias `operator_id`), `frequency` (required: `DAILY | WEEKLY | EVERY_15_DAYS | MONTHLY | QUARTERLY | YEARLY`), `activity_id` (optional), `hour_meter_reading` (optional)
- Validates machine, user, role, vendor, frequency schedule, hour meter, cycle due/overdue status, and duplicate submission, and returns the complete dynamic form from Admin Configuration (`maintenance`, `activities` with nested `sections -> questions`, flat `questions`, `photo_requirements`, `video_requirements`, and `gps_configuration`).

### 2. Machine Maintenance Data Post API
- `POST /api/v1/machine-maintenance/data` (`multipart/form-data`)
- Fields: `machine_id`, `user_id` (or `operator_id`), `frequency`, `hour_meter_reading`, `scheduled_date` (optional), `general_remarks` (optional), `device_id` (optional), `application_version` (optional), `gps` (optional JSON), `responses` (JSON array string with `checklist_item_id`, `status`, `remarks`, `custom_fields`, `video_durations`, `locations`), plus `photo_<cid>_req_<pid>` / `photo_<cid>` image files and `video_<cid>_req_<vid>_0` video files.
- Validates mandatory & conditional questions, photos, videos (duration/counts/format/size), and GPS rules server-side; stores binaries in `machine_pm_db` BYTEA with immutable configuration snapshots; returns `201` with `submission_reference_id` (or `400/401/403/404/409/413/415/422`).

### 3. Machine Maintenance List API
- `GET /api/v1/machine-maintenance/list`
- Query params: `machine_id`, `vendor_id`, `operator_id` (alias `user_id`), `frequency`, `maintenance_status` (`PENDING | COMPLETED | OVERDUE | DUE`), `from_date`, `to_date`, `page`, `page_size`, `user_role`, `category`, `include_safety_guidelines`.
- Returns paginated maintenance activities and submission records (`content` + `page`) along with checklist master items, categories, role assignments, and safety guidelines.

### 4. Machine Maintenance Photo Retrieval API
- `GET /api/v1/machine-maintenance/photos/{photo_id}`
- Query params: `submission_id` (optional ownership check), `metadata=true` (optional JSON metadata instead of binary stream).
- Streams authorized photo binary from PostgreSQL BYTEA (`pm_photo_attachment`) with proper `Content-Type` and access control (`401/403/404`).

### 5. Machine Maintenance Video Retrieval API
- `GET /api/v1/machine-maintenance/videos/{video_id}`
- Query params: `submission_id` (optional ownership check), `metadata=true` (optional JSON metadata instead of binary stream).
- Streams authorized video binary from PostgreSQL BYTEA (`pm_video_attachment`) with HTTP `Range` (`206 Partial Content`) support and access control (`401/403/404`).
