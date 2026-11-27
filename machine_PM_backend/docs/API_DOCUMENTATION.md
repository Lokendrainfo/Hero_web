# HERO Machine Preventive Maintenance API Documentation

Base URL: `http://127.0.0.1:8001` (or gateway path `/api/v1/pm/` & `/api/v1/machine-maintenance/`)

## 1. Architecture & Dual-Database Design

- **`hero_hdd_db` (`hero` router)**: Read-only connection to existing HERO master tables (`machines_machine`, `accounts_user`, `vendors_vendor`, `operators_operator`, `machines_machineassignment`, `machines_dailyentry`, etc.).
- **`machine_pm_db` (`default`)**: Dedicated PM tables (`pm_category`, `pm_frequency`, `pm_checklist_item`, `pm_checklist_section`, `pm_checklist_question`, `pm_checklist_photo_requirement`, `pm_checklist_video_requirement`, `pm_checklist_location_requirement`, `pm_checklist_frequency_schedule`, `pm_machine_assignment`, `pm_role_assignment`, `pm_submission`, `pm_checklist_response`, `pm_photo_attachment` with PostgreSQL `BYTEA`, `pm_video_attachment` with PostgreSQL `BYTEA`, `pm_location_attachment`).

## 2. Authentication & Security

Supported methods on `/api/v1/pm/*` and `/api/v1/machine-maintenance/*`:
1. **JWT Bearer (`Authorization: Bearer <token>`)**: Validated using `SIMPLE_JWT` / `DJANGO_SECRET_KEY`. For mobile operators, the backend derives `user_id` directly from the authenticated JWT identity and rejects spoofed cross-operator `user_id`/`operator_id` query/body overrides with `403 Forbidden`.
2. **Partner API Key (`X-API-Key: <HERO_PM_API_KEY>`)**: Service integration header; when scoped/unscoped, operator authorization and active HERO machine-operator assignments are still validated strictly server-side before returning forms or accepting submissions.

## 3. Standard JSON Envelope

Success:
```json
{
  "success": true,
  "message": "...",
  "data": {},
  "meta": {}
}
```

Error:
```json
{
  "success": false,
  "message": "...",
  "errors": {},
  "status_code": 400
}
```

---

## 4. Admin Web APIs (`/api/v1/pm/`)

### Health Check
- `GET /api/v1/pm/health/` — DB connectivity & service status.

### HERO Machine Master & Dynamic Operator Integration
- `GET /api/v1/pm/machines/` — Lists HERO machines enriched with dynamically resolved `assigned_operator`, `assigned_operator_id`, `assigned_operators`, vendor, and latest `current_hour_meter_reading`. Unassigned machines return `"Not Assigned"`.
- `GET /api/v1/pm/machines/{machine_id}/info/` — Detailed Machine Information card payload including live assigned operator(s), vendor, model/type, and hour meter.

### Category & Frequency Masters
- `GET /api/v1/pm/categories/`, `POST /api/v1/pm/categories/`
- `PATCH /api/v1/pm/categories/{category_id}/`, `DELETE /api/v1/pm/categories/{category_id}/`
- `GET /api/v1/pm/frequencies/`, `POST /api/v1/pm/frequencies/`
- `PATCH /api/v1/pm/frequencies/{frequency_id}/`, `DELETE /api/v1/pm/frequencies/{frequency_id}/`

### Dynamic Activity, Sections, Questions & Evidence Configuration
- `GET /api/v1/pm/checklist-items/`, `POST /api/v1/pm/checklist-items/`
- `PATCH /api/v1/pm/checklist-items/{item_id}/`, `DELETE /api/v1/pm/checklist-items/{item_id}/`
- `POST /api/v1/pm/checklist-items/bulk-upload/`, `GET /api/v1/pm/checklist-items/export/`

Supports:
- Nested **`sections`** (`section_name`, `section_description`, `display_order`, `is_active`, `questions[]`) plus flat **`questions`** compatibility.
- **Question Answer Types**: `YES_NO`, `TEXT`, `NUMBER`, `DROPDOWN`, `RADIO`, `MULTI_SELECT`, `DATE`, `TIME`, `EVIDENCE_ONLY` (**Evidence Only (No Answer)** — skips question prompt/answer validation and enforces configured photo/video/GPS requirements).
- Multiple **`photo_requirements`** (camera-only, mandatory/optional, `capture_timestamp`, `capture_gps`, conditional rules).
- Multiple **`video_requirements`** (camera-only, `min_videos`, `max_videos`, `max_duration_seconds`, max size MB, conditional rules).
- Multiple **`location_requirements` (GPS & Geofencing)**:
  - `is_geofence_required`: `true` / `false` (default `false` -> live device GPS capture only, no boundary block).
  - When `is_geofence_required = true`: supports `geofence_type` (`CIRCLE` or `POLYGON`), `geofence_reference_name`, `geofence_latitude`, `geofence_longitude`, `geofence_radius_meters`, `geofence_polygon` (3+ `{latitude, longitude}` points), and `accuracy_threshold_meters`.
- **Conditional Rules**: `condition_mode` (`ALWAYS` / `CONDITIONAL`), `condition_logic` (`AND` / `OR`), `condition_rules` (`source_question_id`, `operator`, `expected_value`).

### Frequency Schedule, Buffer Days & Duplicate Control
- `GET /api/v1/pm/checklist-items/{item_id}/schedules/`
- `PUT /api/v1/pm/checklist-items/{item_id}/schedules/{frequency_code}/`
- `DELETE /api/v1/pm/checklist-items/{item_id}/schedules/{frequency_code}/`

Rules enforced server-side:
- **Weekly (`WEEKLY`)**: Exactly **1** weekday (`MONDAY`–`SUNDAY`) required in `selected_weekdays`; 0 or multiple weekdays are rejected with `400`.
- **Buffer Days (`buffer_days`, `0..365`)**: Supported on `WEEKLY`, `EVERY_15_DAYS`, `MONTHLY`, `QUARTERLY`, and `YEARLY`. **Disallowed on `DAILY`** (must remain `0` — non-zero values rejected with `400`). Submission eligibility accepts scheduled dates within `[scheduled_date, scheduled_date + buffer_days]` and exposes `completion_deadline_date` + `within_buffer_period`.
- **Multiple Completions (`allow_duplicate_in_same_slot`)**: Defaults to `false` (unchecked). Unless enabled by Admin, only one submission is permitted per machine, activity, and scheduled occurrence (including buffer window — buffer days do not grant extra submissions). Duplicate attempts return `409 Conflict`.

### Assignments, Submissions & Media
- `POST /api/v1/pm/machine-assignments/`, `POST /api/v1/pm/role-assignments/`
- `GET /api/v1/pm/submissions/`, `POST /api/v1/pm/submissions/`, `GET /api/v1/pm/submissions/{submission_id}/`
- `POST /api/v1/pm/submissions/{submission_id}/review/`
- `GET/POST /api/v1/pm/photos/upload/`, `GET /api/v1/pm/photos/{photo_id}/view/`
- `GET/POST /api/v1/pm/videos/upload/`, `GET /api/v1/pm/videos/{video_id}/view/`
- `GET/POST /api/v1/pm/guidelines/`, `PATCH/DELETE /api/v1/pm/guidelines/{id}/`
- `GET /api/v1/pm/reports/dashboard/`

---

## 5. Mobile APK Maintenance APIs (`/api/v1/machine-maintenance/`)

### 1) `GET /api/v1/machine-maintenance/check`
Validates machine, authenticated operator & assignment, frequency/schedule window (including `buffer_days`), and duplicate completion status, returning the complete dynamic form.

- **Query Parameters**:
  - `machine_id` (required): HERO Machine ID, machine number, or chassis number.
  - `frequency` (required): `DAILY | WEEKLY | EVERY_15_DAYS | MONTHLY | QUARTERLY | YEARLY`.
  - `user_id` (optional for JWT, used for API-key integration; alias: `operator_id`).
  - `checklist_item_id` (optional): Filter to a specific activity.
  - `scheduled_date` (optional, `YYYY-MM-DD`): Scheduled occurrence date being checked/submitted.
  - `hour_meter_reading` (optional): Current hour meter check.
- **Response (`200 OK`) Highlights**:
  - `eligible`: boolean; `schedule_status`: `status`, `scheduled_date`, `buffer_days`, `completion_deadline_date`, `within_buffer_period`, `allow_duplicate_in_same_slot`, `already_completed_for_occurrence`, `is_overdue`, `reason`.
  - `machine`: `machine_id`, `machine_number`, `model`, `machine_type`, `vendor_id`, `vendor_name`, `assigned_operator`, `assigned_operator_id`, `assigned_operators`, `current_hour_meter_reading`.
  - `frequency`: `id`, `code`, `frequency_type`, `name`, `interval_hours`, `interval_days`.
  - `maintenance` & `activities[]`: `activity_id`, `item_code`, `activity_name`, `activity_status`, `is_active`, `category_id`, `category`, `category_code`, `frequency_type`, `applicable_schedule`, `original_scheduled_date`, `scheduled_date`, `buffer_days`, `completion_deadline_date`, `allow_duplicate_in_same_slot`, nested `sections[] -> questions[]`, `questions[]` (including `answer_type: "EVIDENCE_ONLY"`, `is_evidence_only`), `photo_requirements[]`, `video_requirements[]`, `gps_configuration` (with `location_validation_rules[]`), and `location_requirements[]`.
  - `has_duplicate`, `duplicate_submission`, `existing_submission`.

### 2) `POST /api/v1/machine-maintenance/data`
Submits completed maintenance answers, `EVIDENCE_ONLY` evidence captures, live camera photos/videos, and GPS/geofence coordinates in a single atomic PostgreSQL transaction.

- **Request**: `multipart/form-data` (or JSON when pre-uploaded IDs are attached).
  - Scalar fields: `machine_id`, `frequency`, `hour_meter_reading`, `capture_source` (`CAMERA` | `MOBILE_CAMERA` | `WEB_CAMERA`), optional `user_id`/`operator_id` (ignored/verified against JWT when authenticated via Bearer token), `scheduled_date` (`YYYY-MM-DD`), `general_remarks`, `device_id`, `application_version`, `client_request_id`, `gps` (JSON `{latitude, longitude, accuracy_meters, captured_at}`).
  - `responses`: JSON array string of `{ checklist_item_id, status ("COMPLETED"|"NOT_COMPLETED"), remarks, custom_fields: { "<question_id>": answer }, video_durations: { "<video_config_id>": [seconds] }, locations: { "<location_requirement_id>": { latitude, longitude, accuracy_meters, captured_at } } }`. Note: for `EVIDENCE_ONLY` questions, no answer in `custom_fields` is required.
  - Binary files: `photo_<checklist_item_id>_req_<photo_config_id>` (JPEG/PNG/WEBP, max 10 MB) and `video_<checklist_item_id>_req_<video_config_id>_0` (MP4/WEBM/MOV/MKV, max 25 MB).
- **Server-Side Validations & Error Codes**:
  - `401 Unauthorized`: Invalid/missing credentials.
  - `403 Forbidden`: Operator not assigned/authorized for machine/role/frequency, or mismatched Bearer token identity.
  - `404 Not Found`: Unknown machine or frequency.
  - `409 Conflict`: Duplicate submission in the same scheduled occurrence when `allow_duplicate_in_same_slot` is `false` (or repeated `client_request_id`).
  - `400 Bad Request`: Missing mandatory answer (non-`EVIDENCE_ONLY`), missing mandatory/triggered photo or video, video duration exceeded, missing GPS, poor GPS accuracy, coordinates outside configured `CIRCLE`/`POLYGON` geofence, or non-camera `capture_source` / base64 upload attempt.
  - `413 Payload Too Large` / `415 Unsupported Media Type` / `422 Unprocessable Entity`: Size, format, or unknown/inactive config ID errors.
- **Response (`201 Created`)**: Returns `submission_id`, `submission_reference_id`, `submission_number`, `status`, `approval_status`, `machine_id`, `machine_number`, `vendor_id`, `vendor_name`, `assigned_operator`, `assigned_operator_id`, `user_id`, `submitted_by_name`, `submitted_by_role`, `frequency`, `scheduled_date`, `completion_deadline_date`, `buffer_days`, `allow_duplicate_in_same_slot`, `hour_meter_reading`, `gps`, `photos[]` (with `/api/v1/machine-maintenance/photos/{photo_id}`), `videos[]` (with `/api/v1/machine-maintenance/videos/{video_id}`), `locations[]`, and `submitted_at`.

### 3) `GET /api/v1/machine-maintenance/list`
Returns authorized operator context, assigned machines, categories, role assignments, full checklist/section/question/evidence/geofence/schedule configurations (`checklist_items` & `frequency_wise_checklists`), paginated historical submissions (`content[]`), and `page` metadata.

- **Query Filters**: `user_id`, `machine_id`, `frequency`, `category_code`, `status`, `approval_status`, `from_date`, `to_date`, `search`, `page`, `page_size` (1–200).

### 4) `GET /api/v1/machine-maintenance/photos/{photo_id}`
Streams the authorized camera-captured photo binary from `machine_pm_db` (`BYTEA`), or returns JSON photo metadata (including `question_id`, `photo_configuration_id`, `latitude`, `longitude`, `gps_accuracy`, `operator_id`, `sha256_hash`, `image_url`) when `?metadata=true`. Supports optional `?submission_id=` cross-check.

### 5) `GET /api/v1/machine-maintenance/videos/{video_id}`
Streams the authorized camera-captured video binary (`MP4`/`WEBM`/`MOV`/`MKV`) from `machine_pm_db` (`BYTEA`) with HTTP `206 Partial Content` Range support, or returns JSON video metadata (including `question_id`, `video_configuration_id`, `duration_seconds`, `latitude`, `longitude`, `gps_accuracy`, `operator_id`, `sha256_hash`, `video_url`) when `?metadata=true`. Supports optional `?submission_id=` cross-check.
