import React, { useState, useEffect, useMemo } from 'react';
import {
  LucideKey,
  LucideEye,
  LucideEyeOff,
  LucideCopy,
  LucideCheck,
  LucideRefreshCw,
  LucideBookOpen,
  LucideSend,
  LucidePlay,
  LucideLink,
  LucideCheckCircle2,
  LucideAlertCircle,
  LucideCode2,
  LucideGlobe,
  LucideShield,
} from 'lucide-react';
import axios from 'axios';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiKeyService } from '../../services/apiKeyService';
import './ApiDocs.css';

const ENDPOINTS_CATALOG = [
  {
    category: 'FLEET',
    items: [
      {
        id: 'list_machines',
        method: 'GET',
        title: 'List machines',
        path: '/api/v1/machines/',
        description: 'Lean fleet list (identity + model + fuel card). For site, partners, and location use Get machine.',
        params: [
          { name: 'vendor_id', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by partner external ID or Hero database ID' },
          { name: 'status', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by live operating status (RUNNING, IDLE, OFFLINE)' },
          { name: 'filter', in: 'query', type: 'string', required: false, default: '', desc: 'Shortcut tab filter (All, Commissioned, Running, Idle)' },
        ],
      },
      {
        id: 'get_machine',
        method: 'GET',
        title: 'Get machine',
        path: '/api/v1/machines/{id}/',
        description: 'Detailed machine record including live telemetry, engine hours, sensors, fuel level, and assigned contractor.',
        params: [
          { name: 'id', in: 'path', type: 'string | number', required: true, default: '600202608397', desc: 'Machine chassis number (e.g. 600202608397) or internal ID' },
        ],
      },
      {
        id: 'machine_status',
        method: 'GET',
        title: 'Machine live telemetry',
        path: '/api/v1/machines/{id}/status/',
        description: 'Real-time telemetry payload directly from FiberForce IoT backbone (RPM, coolant temp, oil pressure, voltage, speed).',
        params: [
          { name: 'id', in: 'path', type: 'string', required: true, default: '600202608397', desc: 'Machine chassis number' },
        ],
      },
      {
        id: 'sync_fiberforce',
        method: 'POST',
        title: 'Online / offline status sync',
        path: '/api/v1/machines/sync-fiberforce/',
        description: 'Trigger on-demand manual synchronization with the FiberForce telemetry server.',
        params: [],
      },
    ],
  },
  {
    category: 'TRACKING & SENSORS',
    items: [
      {
        id: 'live_tracking',
        method: 'GET',
        title: 'Live fleet GPS',
        path: '/api/v1/tracking/',
        description: 'Latest GPS coordinates, heading, speed, and real-time operational status for all active machines in scope.',
        params: [
          { name: 'vendor_id', in: 'query', type: 'string', required: false, default: '', desc: 'Filter tracking points by vendor external ID' },
        ],
      },
      {
        id: 'tracking_history',
        method: 'GET',
        title: 'Route breadcrumbs history',
        path: '/api/v1/tracking/{id}/',
        description: 'Historical GPS coordinate breadcrumb trail with timestamps and operational status.',
        params: [
          { name: 'id', in: 'path', type: 'string', required: true, default: '600202608397', desc: 'Machine chassis number or ID' },
        ],
      },
    ],
  },
  {
    category: 'TASKS & HDD',
    items: [
      {
        id: 'hdd_metrics_daywise',
        method: 'GET',
        title: 'HDD Day-Wise Shot Count & Meters (by Chassis)',
        path: '/api/machines/hdd-metrics',
        description: 'Chassis Number-Wise Day-Wise HDD Shot Count and Shot Meters API. Returns only completed shots with valid start and end times. Excludes in-progress and incomplete shots from daily counts, metre totals, and shots list. Supports date-wise filtering with start_date and end_date.',
        params: [
          { name: 'chassis_number', in: 'query', type: 'string', required: true, default: '600202608401', desc: 'Machine chassis number (e.g. 600202608401) or comma-separated list' },
          { name: 'start_date', in: 'query', type: 'string', required: false, default: '2026-10-01', desc: 'Filter from start date inclusive (YYYY-MM-DD or DD-MM-YYYY)' },
          { name: 'end_date', in: 'query', type: 'string', required: false, default: '2026-10-10', desc: 'Filter up to end date inclusive (YYYY-MM-DD or DD-MM-YYYY)' },
          { name: 'machine_id', in: 'query', type: 'integer', required: false, default: '', desc: 'Filter by specific machine database ID (optional)' },
          { name: 'refresh', in: 'query', type: 'boolean', required: false, default: '', desc: 'Set to "true" to force fresh recalculation from live tasks' },
        ],
        sampleResponse: {
          success: true,
          data: [
            {
              chassis_number: "600202608401",
              date: "2026-10-14",
              hdd_shot_count: 2,
              hdd_shot_meters: 125.5,
              shots: [
                {
                  shot_id: "SHOT001",
                  start_time: "2026-10-14T09:00:00",
                  end_time: "2026-10-14T09:15:00",
                  shot_meters: 60.0
                },
                {
                  shot_id: "SHOT002",
                  start_time: "2026-10-14T09:30:00",
                  end_time: "2026-10-14T09:45:00",
                  shot_meters: 65.5
                }
              ]
            }
          ]
        },
        emptyResponse: {
          success: true,
          data: [],
          message: "No HDD shot records found for chassis '600202608401' between 2026-11-01 and 2026-11-10.",
          total_records: 0
        },
        errorResponse: {
          success: false,
          message: "Invalid chassis number or machine not found: 'INVALID123'",
          data: []
        }
      },
      {
        id: 'hdd_shots_chassis',
        method: 'GET',
        title: 'HDD Shot Count & Meters (by Chassis - Lifetime Total)',
        path: '/api/v1/machines/chassis-hdd-shots/',
        description: 'Machine Chassis Number-Wise HDD Shot Count and Shot Meters API. Returns lifetime cumulative HDD Shot Count, HDD Shot Meters, Machine ID, and Last Updated Date & Time.',
        params: [
          { name: 'chassis_number', in: 'query', type: 'string', required: false, default: '600202608401', desc: 'Machine chassis number (e.g. 600202608401) or comma-separated list. Leave blank to retrieve all machines.' },
          { name: 'refresh', in: 'query', type: 'boolean', required: false, default: '', desc: 'Set to "true" to force fresh recalculation from live tasks' },
        ],

        sampleResponse: {
          success: true,
          data: [
            {
              chassis_number: "600202608401",
              hdd_shot_count: 201,
              hdd_shot_meters: 30044.64,
              machine_id: 6,
              last_updated: "2026-10-10T11:18:40"
            }
          ],
          total_records: 1
        },
        emptyResponse: {
          success: true,
          data: [],
          total_records: 0
        },
        errorResponse: {
          success: false,
          message: "No machine records found matching chassis number(s): INVALID123",
          data: []
        }
      },
      {
        id: 'hdd_shots_chassis_path',
        method: 'GET',
        title: 'Get HDD Shots by Chassis Path',
        path: '/api/v1/machines/chassis-hdd-shots/{chassis_number}/',
        description: 'Retrieve HDD shot count and drilled meters for a specific machine using its chassis number directly in the URL path.',
        params: [
          { name: 'chassis_number', in: 'path', type: 'string', required: true, default: '600202608401', desc: 'Target machine chassis number' },
        ],
        sampleResponse: {
          success: true,
          data: [
            {
              chassis_number: "600202608401",
              hdd_shot_count: 201,
              hdd_shot_meters: 30044.64,
              machine_id: 6,
              last_updated: "2026-10-10T11:18:40"
            }
          ],
          total_records: 1
        },
        emptyResponse: {
          success: true,
          data: [],
          total_records: 0
        },
        errorResponse: {
          success: false,
          message: "No machine records found matching chassis number(s): INVALID123",
          data: []
        }
      },
      {
        id: 'hdd_shots_batch',
        method: 'POST',
        title: 'HDD Shots Batch Query (POST)',
        path: '/api/v1/machines/chassis-hdd-shots/',
        description: 'Batch query machine HDD shot count and meters by sending an array or comma-separated string of chassis numbers in JSON payload.',
        params: [
          { name: 'chassis_number', in: 'body', type: 'string', required: true, default: '600202608401, 600202608397', desc: 'Comma-separated chassis numbers to query' },
        ],
        sampleResponse: {
          success: true,
          data: [
            {
              chassis_number: "600202608401",
              hdd_shot_count: 201,
              hdd_shot_meters: 30044.64,
              machine_id: 6,
              last_updated: "2026-10-10T11:18:40"
            },
            {
              chassis_number: "600202608397",
              hdd_shot_count: 157,
              hdd_shot_meters: 25040.93,
              machine_id: 2,
              last_updated: "2026-10-10T18:38:44"
            }
          ],
          total_records: 2
        }
      },
      {
        id: 'my_tasks',
        method: 'GET',
        title: 'My assigned tasks',
        path: '/api/v1/integrations/tasks/my-tasks/',
        description: 'Optimized high-speed list of authorized HDD, trenching, and ducting tasks for field contractors.',
        params: [
          { name: 'task_type', in: 'query', type: 'string', required: false, default: 'FIBER_TRENCHING_DUCTING_TASK', desc: 'Filter by task type' },
          { name: 'page', in: 'query', type: 'integer', required: false, default: '0', desc: 'Page index (0-indexed)' },
          { name: 'size', in: 'query', type: 'integer', required: false, default: '20', desc: 'Number of tasks per page' },
        ],
      },
      {
        id: 'list_tasks',
        method: 'GET',
        title: 'List tasks hierarchy',
        path: '/api/v1/tasks/',
        description: 'Retrieve contractor tasks with depth, route snapshot, vendor snapshot, and execution progress.',
        params: [
          { name: 'status', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by status (COMPLETED, IN_PROGRESS, CREATED)' },
        ],
      },
    ],
  },
  {
    category: 'ATTENDANCE',
    items: [
      {
        id: 'fleet_attendance',
        method: 'GET',
        title: 'Fleet attendance records',
        path: '/api/v1/attendance/',
        description: 'Retrieve today’s attendance records for operators, technicians, and contractor machinery.',
        params: [
          { name: 'date', in: 'query', type: 'string', required: false, default: '', desc: 'Target date (YYYY-MM-DD)' },
        ],
      },
      {
        id: 'record_attendance',
        method: 'POST',
        title: 'Record shift punch',
        path: '/api/v1/attendance/',
        description: 'Record machine check-in, check-out, or operational punch.',
        params: [
          { name: 'attendance_type', in: 'body', type: 'string', required: true, default: 'MACHINE', desc: 'MACHINE or USER' },
          { name: 'status', in: 'body', type: 'string', required: true, default: 'PRESENT', desc: 'PRESENT, CHECKED_IN, or OPERATING' },
          { name: 'machine_chassis_no', in: 'body', type: 'string', required: true, default: '600202608397', desc: 'Chassis number' },
        ],
      },
    ],
  },
  {
    category: 'METRICS & FUEL',
    items: [
      {
        id: 'dashboard_summary',
        method: 'GET',
        title: 'Dashboard summary KPIs',
        path: '/api/v1/dashboard/summary/',
        description: 'High-level operational summary: total fleet, commissioned count, real-time live running count, and daily bore output.',
        params: [
          { name: 'vendor', in: 'query', type: 'string', required: false, default: '', desc: 'Vendor ID or code filter' },
          { name: 'date', in: 'query', type: 'string', required: false, default: '', desc: 'Date (YYYY-MM-DD)' },
        ],
      },
      {
        id: 'fuel_logs',
        method: 'GET',
        title: 'Fuel consumption logs',
        path: '/api/v1/fuel/',
        description: 'Machine refueling events, fuel consumption rates, sensor percentages, and theft alerts.',
        params: [
          { name: 'machine_id', in: 'query', type: 'string', required: false, default: '', desc: 'Filter logs by machine chassis or ID' },
        ],
      },
    ],
  },
  {
    category: 'ALERTS',
    items: [
      {
        id: 'list_alerts',
        method: 'GET',
        title: 'List alerts',
        path: '/api/v1/alerts/',
        description: 'Retrieve active system alerts (OEM breakdowns, sudden fuel drops, geofence breaches).',
        params: [
          { name: 'is_read', in: 'query', type: 'boolean', required: false, default: 'false', desc: 'Filter by read/unread status' },
          { name: 'severity', in: 'query', type: 'string', required: false, default: '', desc: 'CRITICAL, HIGH, MEDIUM, LOW' },
        ],
      },
    ],
  },
  {
    category: 'REPORTS',
    items: [
      {
        id: 'hdd_shots_report',
        method: 'GET',
        title: 'HDD Shot Report (Shot-wise & Daily Totals)',
        path: '/api/v1/reports/hdd-shots/',
        description: 'Machine-wise and individual shot-wise HDD output in metres mapped to chassis number. Each row represents one shot. Includes individual shot distance, start/end time, daily total metres, daily shot count, and multi-sheet Excel export.',
        params: [
          { name: 'start_date', in: 'query', type: 'string', required: false, default: '2026-10-01', desc: 'Start date in YYYY-MM-DD format (inclusive)' },
          { name: 'end_date', in: 'query', type: 'string', required: false, default: '2026-10-11', desc: 'End date in YYYY-MM-DD format (inclusive)' },
          { name: 'chassis_number', in: 'query', type: 'string', required: false, default: '600202608398', desc: 'Filter by specific machine chassis number' },
          { name: 'machine_id', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by machine ID or code (e.g. MAC-8398)' },
          { name: 'page', in: 'query', type: 'integer', required: false, default: '1', desc: 'Page number for pagination' },
          { name: 'page_size', in: 'query', type: 'integer', required: false, default: '25', desc: 'Items per page (0 for all records)' },
          { name: 'export', in: 'query', type: 'string', required: false, default: '', desc: 'Set to "excel" or "xlsx" to download formatted .xlsx workbook' },
        ],
        sampleResponse: {
          success: true,
          message: 'HDD Shot report generated successfully',
          data: {
            results: [
              {
                date: '2026-10-10',
                machine_id: 'MAC-8398',
                machine_pk: 3,
                machine_name: 'A600 HDD (8398)',
                chassis_number: '600202608398',
                shot_id: '676-PIT16-PIT17',
                shot_number: 145,
                shot_serial: 'HDD-016',
                start_time: '23:08:59',
                end_time: '',
                shot_meters: 122.63,
                daily_total_meters: 220.86,
                daily_shot_count: 2,
                vendor_name: 'HARPAL INFRA DEVELOPMENT'
              }
            ],
            pagination: { page: 1, page_size: 25, total_records: 16, total_pages: 1 },
            summary: { total_shots: 16, total_meters: 3087.87, total_machines: 1 }
          }
        }
      },
    ],
  },
  {
    category: 'T&D MONITORING INTEGRATION',
    items: [
      {
        id: 'td_monitoring',
        method: 'GET',
        title: 'T&D Monitoring API',
        path: '/api/v1/td-monitoring/',
        description: 'Read-only HTTPS GET endpoint for Trenching & Ducting (T&D) monitoring ingestion. Consumed by partner monitoring systems to ingest daily depth captures. Returns the latest depth capture per operator/machine hierarchically grouped by circle, district, and block. Supports HTTP Basic Authentication and secure cryptographic live-view tokens.',
        authType: 'Basic Auth (username:password) or X-Client-Key',
        params: [
          { name: 'circle', in: 'query', type: 'string', required: true, default: 'UPW', desc: 'Circle identifier (case-insensitive, e.g. UPW, RAJASTHAN, HARYANA)' },
          { name: 'date', in: 'query', type: 'string', required: true, default: '2026-10-02', desc: 'Capture date in YYYY-MM-DD format (IST)' },
          { name: 'state', in: 'query', type: 'string', required: false, default: '', desc: 'Alternative alias for circle filter' },
          { name: 'date_from', in: 'query', type: 'string', required: false, default: '', desc: 'Optional start date boundary (YYYY-MM-DD)' },
          { name: 'date_to', in: 'query', type: 'string', required: false, default: '', desc: 'Optional end date boundary (YYYY-MM-DD)' },
        ],
        sampleResponse: {
          status: 'OK',
          message: '3 blocks reported captures on 2026-10-02',
          results: {
            circles: [
              {
                circle_name: 'UPW',
                districts: [
                  {
                    district_name: 'AGRA',
                    blocks: [
                      {
                        block_name: 'BAH',
                        user_urls: [
                          {
                            userName: 'Ram Kumar',
                            lastDepthCapturedAt: '2026-10-02T14:32:07+05:30',
                            url: 'https://hero.pramaanu.co.in/live-view/eyJ0aWQiOiI2YWI1...secure-token',
                            map_url: 'https://hero.pramaanu.co.in/map-view/task_upw_001?userName=Ram+Kumar&block=BAH&district=AGRA&state=UPW&date=2026-10-02&mode=user&isBharatNet=true'
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        },
        emptyResponse: {
          status: 'OK',
          message: '0 blocks reported captures on 2026-10-02',
          results: {
            circles: []
          }
        },
        errorResponse: {
          status: 'ERROR',
          message: 'Invalid or missing Basic authentication credentials'
        }
      },
    ],
  },
  {
    category: 'MACHINE PREVENTIVE MAINTENANCE (MOBILE APK)',
    items: [
      {
        id: 'machine_maintenance_check',
        method: 'GET',
        title: 'Machine Maintenance Check API',
        path: '/api/v1/machine-maintenance/check',
        description: 'Pre-flight eligibility check for Mobile APK. Validates machine ID, user ID and assigned role, maintenance frequency, retrieves current HERO hour-meter reading, checks maintenance due/overdue status, verifies duplicate submissions, and returns user eligibility.',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>)' },
        ],
        params: [
          { name: 'machine_id', in: 'query', type: 'integer | string', required: true, default: '8', desc: 'HERO Machine ID, chassis number (e.g. 600202608403), or machine code (MAC-8403)' },
          { name: 'user_id', in: 'query', type: 'integer', required: true, default: '2', desc: 'HERO User ID performing the maintenance check (required when using X-API-Key)' },
          { name: 'frequency', in: 'query', type: 'string', required: true, default: 'DAILY', desc: 'Maintenance frequency code: DAILY, 50_HOURS, 100_HOURS, 250_HOURS, 500_HOURS, 1000_HOURS' },
          { name: 'hour_meter_reading', in: 'query', type: 'number', required: false, default: '', desc: 'Optional current hour-meter reading override for duplicate/cycle check' },
        ],
        statusCodes: [
          { code: '200 OK', meaning: 'Machine, user, and frequency validated; eligibility & due status returned.' },
          { code: '400 Bad Request', meaning: 'Missing/invalid machine_id, user_id, frequency, or negative hour_meter_reading.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'Non-admin JWT caller attempting to check another user_id.' },
          { code: '404 Not Found', meaning: 'Machine, User, or Frequency not found in HERO master tables.' },
        ],
        sampleResponse: {
          success: true,
          message: 'Machine maintenance eligibility check completed',
          data: {
            eligible: true,
            eligibility_reasons: [],
            checks: {
              machine_valid: true,
              user_valid: true,
              frequency_valid: true,
              role_authorized: true,
              vendor_authorized: true,
              duplicate_submission_exists: false,
            },
            machine: {
              id: 8,
              machine_number: '600202608403',
              name: 'A600 HDD (8403)',
              machine_model: 'APOLLO A600 V2',
              machine_type: 'HDD',
              vendor_name: 'HERO Direct',
              assigned_operator: 'Ravi Kumar',
              engine_hours: 185,
            },
            user: {
              id: 2,
              username: 'admin',
              name: 'Admin',
              primary_role: 'ADMIN',
              allowed_frequencies: ['DAILY', '50_HOURS', '100_HOURS', '250_HOURS', '500_HOURS', '1000_HOURS'],
            },
            frequency: { id: 1, code: 'DAILY', name: 'Daily', interval_hours: null, interval_days: 1 },
            hour_meter: { current_machine_hours: 185, checked_hour_meter: 185.0, last_pm_hour_meter: null },
            maintenance_due_status: 'DUE',
            maintenance_due_message: 'Daily Check Due',
            existing_submission: null,
            duplicate_submission: null,
          },
          meta: {},
        },
        errorResponse: {
          success: false,
          message: "Machine '999999' not found in HERO Machine Master.",
          errors: { detail: "Machine '999999' not found in HERO Machine Master." },
          status_code: 404,
        },
      },
      {
        id: 'machine_maintenance_data',
        method: 'POST',
        isMultipart: true,
        title: 'Machine Maintenance Data Post API',
        path: '/api/v1/machine-maintenance/data',
        description: 'Submit completed preventive maintenance checklist from Mobile APK with mandatory individual photo uploads for every checklist activity. Validates all required items, enforces unique SHA-256 photo per item and remarks for Not Completed items, saves atomically, and returns a unique submission reference ID.',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>)' },
          { name: 'Content-Type', value: 'multipart/form-data', required: true, desc: 'Multipart form payload carrying JSON responses string and per-item image files' },
        ],
        multipartInstructions: [
          'Send the request as multipart/form-data (do NOT manually set boundary in headers; let HTTP client generate it).',
          'Include scalar form fields: machine_id, user_id, frequency, hour_meter_reading, capture_source ("CAMERA"), and optional general_remarks / client_request_id.',
          'Include a JSON-serialized array string in the "responses" field containing each checklist_item_id, status ("COMPLETED" or "NOT_COMPLETED"), and remarks (mandatory when status is "NOT_COMPLETED").',
          'Attach ONE separate camera-captured image file (JPEG, PNG, or WEBP, max 10 MB) per checklist activity using field name "photo_<checklist_item_id>" (e.g. photo_1, photo_2) or specify a custom "photo_field" inside each response object.',
          'Server-side rules reject submissions if any checklist item is missing a photo, if gallery/file uploads are indicated (capture_source="GALLERY" / "FILE_UPLOAD"), if the same photo bytes (SHA-256) are reused across multiple items, or if a duplicate submission already exists for the cycle.',
        ],
        requestBodySchema: {
          machine_id: 'integer | string (required) — HERO Machine ID or chassis number',
          user_id: 'integer (required for X-API-Key) — HERO User ID submitting the checklist',
          frequency: 'string (required) — DAILY | 50_HOURS | 100_HOURS | 250_HOURS | 500_HOURS | 1000_HOURS',
          hour_meter_reading: 'number (required) — Current machine hour-meter reading (>= 0)',
          general_remarks: 'string (optional) — Overall inspection summary',
          client_request_id: 'string (optional) — UUID for duplicate/retry protection',
          responses: [
            {
              checklist_item_id: 16,
              status: 'COMPLETED',
              remarks: 'Greased all points',
              photo_field: 'photo_16',
            },
          ],
          'photo_<checklist_item_id>': 'file (required per item) — Image binary (JPEG/PNG/WEBP, max 10 MB)',
        },
        params: [
          { name: 'machine_id', in: 'body', type: 'integer | string', required: true, default: '8', desc: 'HERO Machine ID or chassis number' },
          { name: 'user_id', in: 'body', type: 'integer', required: true, default: '2', desc: 'HERO User ID performing the maintenance' },
          { name: 'frequency', in: 'body', type: 'string', required: true, default: '50_HOURS', desc: 'Maintenance frequency code (e.g. DAILY, 50_HOURS, 100_HOURS)' },
          { name: 'hour_meter_reading', in: 'body', type: 'number', required: true, default: '185.5', desc: 'Current hour-meter reading captured on site' },
          { name: 'general_remarks', in: 'body', type: 'string', required: false, default: 'Routine check completed via mobile APK', desc: 'Overall maintenance remarks' },
          { name: 'responses', in: 'body', type: 'json-string', required: true, default: '[{"checklist_item_id": 16, "status": "COMPLETED", "remarks": "Checked OK"}, {"checklist_item_id": 17, "status": "COMPLETED", "remarks": "Greased"}, {"checklist_item_id": 18, "status": "COMPLETED", "remarks": "Verified"}]', desc: 'JSON array string of checklist responses' },
        ],
        statusCodes: [
          { code: '201 Created', meaning: 'Submission, responses, and all individual photos saved; submission_reference_id returned.' },
          { code: '400 Bad Request', meaning: 'Missing/invalid photo, reused photo hash, missing checklist items, or missing remarks for NOT_COMPLETED.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'User role not authorized for requested frequency or machine vendor.' },
          { code: '409 Conflict', meaning: 'Duplicate submission already recorded for this machine, frequency, and day/reading.' },
        ],
        sampleResponse: {
          success: true,
          message: 'Maintenance submission PM-20261125-0001 saved successfully',
          data: {
            submission_id: 12,
            submission_reference_id: 'PM-20261125-0001',
            submission_number: 'PM-20261125-0001',
            status: 'COMPLETED',
            approval_status: 'PENDING_REVIEW',
            machine_id: 8,
            machine_number: '600202608403',
            user_id: 2,
            submitted_by_name: 'Admin',
            submitted_by_role: 'ADMIN',
            frequency: '50_HOURS',
            hour_meter_reading: 185.5,
            total_items: 3,
            completed_items_count: 3,
            not_completed_items_count: 0,
            photo_count: 3,
            submitted_at: '2026-11-25T11:20:00+05:30',
          },
          meta: {},
        },
        errorResponse: {
          success: false,
          message: "Photo evidence is mandatory for checklist activity 'Roller Guides – Greasing'. Cannot mark as Completed without its own photograph.",
          errors: {
            photos: "Photo evidence is mandatory for checklist activity 'Roller Guides – Greasing'. Cannot mark as Completed without its own photograph.",
          },
          status_code: 400,
        },
      },
      {
        id: 'machine_maintenance_list',
        method: 'GET',
        title: 'Machine Maintenance List API',
        path: '/api/v1/machine-maintenance/list',
        description: 'Retrieves maintenance checklist master records grouped by Machine and Engine categories and maintenance frequencies, along with assigned role mappings, SOP remarks, special instructions, and safety guidelines. Supports filtering by machine_id, frequency, and user_role.',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>)' },
        ],
        params: [
          { name: 'machine_id', in: 'query', type: 'integer | string', required: false, default: '8', desc: 'Optional HERO machine ID or chassis number to include machine context' },
          { name: 'frequency', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by frequency code (DAILY, 50_HOURS, 100_HOURS, 250_HOURS, 500_HOURS, 1000_HOURS)' },
          { name: 'user_role', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by assigned role (OPERATOR, FIELD_ENGINEER, AREA_MANAGER, ADMIN)' },
          { name: 'category', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by category (MACHINE or ENGINE)' },
          { name: 'include_safety_guidelines', in: 'query', type: 'boolean', required: false, default: 'true', desc: 'Include General Safety Guidelines sections (true/false)' },
        ],
        statusCodes: [
          { code: '200 OK', meaning: 'Checklist master, categories, role assignments, and frequency-wise items returned.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'Requested machine_id belongs to an unauthorized vendor.' },
          { code: '404 Not Found', meaning: 'Requested machine_id not found.' },
        ],
        sampleResponse: {
          success: true,
          message: 'Machine maintenance checklist master retrieved successfully',
          data: {
            filters_applied: { machine_id: '8', frequency: 'ALL', user_role: 'OPERATOR', category: 'ALL' },
            categories: [
              { id: 1, code: 'MACHINE', name: 'Machine', is_checkable: true },
              { id: 2, code: 'ENGINE', name: 'Engine', is_checkable: true },
              { id: 3, code: 'GENERAL_SAFETY_GUIDELINES', name: 'General Safety Guidelines', is_checkable: false },
            ],
            role_assignments: [
              { role_code: 'OPERATOR', role_name: 'Operator', frequencies: ['DAILY', '50_HOURS'] },
            ],
            total_checklist_items: 12,
            checklist_items: [
              {
                id: 4,
                checklist_item_id: 4,
                item_code: 'SOP-MCH-004',
                category_code: 'MACHINE',
                category_name: 'Machine',
                description: 'Fuel tank – Fill',
                frequencies: ['DAILY'],
                assigned_roles: [{ role_code: 'OPERATOR', role_name: 'Operator' }],
                remarks: '',
                special_instructions: 'Check level of fuel in the tank before starting work.',
                service_interval: 'Daily',
                requires_photo: true,
              },
            ],
            frequency_wise_checklists: [],
            safety_guidelines: [],
          },
          meta: {},
        },
        errorResponse: {
          success: false,
          message: 'Invalid or inactive API key.',
          errors: { detail: 'Invalid or inactive API key.' },
          status_code: 401,
        },
      },
    ],
  },
];

export const ApiDocs = () => {
  const { hasPermission, isAdmin } = useAuth();

  if (!isAdmin && !hasPermission('api_docs.view')) {
    return <Navigate to="/dashboard" replace />;
  }

  const [apiKeyData, setApiKeyData] = useState(null);
  const [revealKey, setRevealKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);
  const [copiedEndpointUrl, setCopiedEndpointUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('https://your.app/hooks/vehicleiq');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [revealSecret, setRevealSecret] = useState(false);

  // Endpoint Selection & Playground
  const [selectedEndpointId, setSelectedEndpointId] = useState('list_machines');
  const [codeTab, setCodeTab] = useState('curl');
  const [paramValues, setParamValues] = useState({});
  const [pgMultipartFiles, setPgMultipartFiles] = useState([{ fieldName: 'photo_16', file: null }]);
  const [pgLoading, setPgLoading] = useState(false);
  const [pgResponse, setPgResponse] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Calculate Base URL
  const baseUrl = useMemo(() => {
    return window.location.origin;
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Fetch API key on load
  useEffect(() => {
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    try {
      const res = await apiKeyService.getApiKey();
      if (res?.data) {
        setApiKeyData(res.data);
        if (res.data.webhook_url) setWebhookUrl(res.data.webhook_url);
        if (res.data.webhook_enabled !== undefined) setWebhookEnabled(res.data.webhook_enabled);
        if (res.data.webhook_secret) setWebhookSecret(res.data.webhook_secret);
      }
    } catch (err) {
      console.error('Failed to load API key:', err);
    }
  };

  const handleRotateKey = async () => {
    if (!window.confirm('Are you sure you want to rotate your API key? Any systems using the old key will stop working immediately.')) {
      return;
    }
    try {
      const res = await apiKeyService.rotateApiKey();
      if (res?.data) {
        setApiKeyData(res.data);
        setRevealKey(true);
        showToast('API key rotated successfully. New key is now active.');
      }
    } catch (err) {
      showToast('Failed to rotate API key.');
    }
  };

  const handleToggleKey = async () => {
    try {
      const res = await apiKeyService.toggleApiKey();
      if (res?.data) {
        setApiKeyData(res.data);
        showToast(`API key ${res.data.is_active ? 'enabled' : 'disabled'} successfully.`);
      }
    } catch (err) {
      showToast('Failed to toggle API key state.');
    }
  };

  const handleSaveWebhook = async () => {
    try {
      const res = await apiKeyService.saveWebhook(webhookUrl, webhookEnabled);
      if (res?.data) {
        setApiKeyData(res.data);
        showToast('Webhook configuration saved.');
      }
    } catch (err) {
      showToast('Failed to save webhook settings.');
    }
  };

  const handleRotateSecret = async () => {
    try {
      const res = await apiKeyService.rotateWebhookSecret();
      if (res?.data) {
        setApiKeyData(res.data);
        setWebhookSecret(res.data.webhook_secret);
        setRevealSecret(true);
        showToast('Webhook signing secret rotated.');
      }
    } catch (err) {
      showToast('Failed to rotate webhook secret.');
    }
  };

  const handleTestWebhook = async () => {
    try {
      const res = await apiKeyService.testWebhook(webhookUrl);
      showToast(res?.message || 'Test webhook delivered successfully!');
    } catch (err) {
      showToast('Test webhook failed to reach destination.');
    }
  };

  // Find currently selected endpoint
  const selectedEndpoint = useMemo(() => {
    for (const group of ENDPOINTS_CATALOG) {
      const match = group.items.find((item) => item.id === selectedEndpointId);
      if (match) return match;
    }
    return ENDPOINTS_CATALOG[0].items[0];
  }, [selectedEndpointId]);

  // Reset param values when endpoint changes
  useEffect(() => {
    if (selectedEndpoint?.params) {
      const defaults = {};
      selectedEndpoint.params.forEach((p) => {
        defaults[p.name] = p.default || '';
      });
      setParamValues(defaults);
      setPgResponse(null);
    }
  }, [selectedEndpoint]);

  // Construct dynamic full URL for selected endpoint
  const currentEndpointUrl = useMemo(() => {
    let p = selectedEndpoint.path;
    Object.keys(paramValues).forEach((key) => {
      if (p.includes(`{${key}}`)) {
        p = p.replace(`{${key}}`, encodeURIComponent(paramValues[key] || ''));
      }
    });
    const queryParams = selectedEndpoint.params
      ?.filter((item) => item.in === 'query' && paramValues[item.name])
      .map((item) => `${encodeURIComponent(item.name)}=${encodeURIComponent(paramValues[item.name])}`)
      .join('&');

    const fullPath = queryParams ? `${p}?${queryParams}` : p;
    return `${baseUrl}${fullPath}`;
  }, [selectedEndpoint, paramValues, baseUrl]);

  // Execute Request via Live Playground
  const handleExecutePlayground = async () => {
    setPgLoading(true);
    setPgResponse(null);
    const startTime = performance.now();
    const token = apiKeyData?.key || 'hero_live_partner_key';

    try {
      let resolvedPath = selectedEndpoint.path;
      Object.keys(paramValues).forEach((key) => {
        if (resolvedPath.includes(`{${key}}`)) {
          resolvedPath = resolvedPath.replace(`{${key}}`, paramValues[key] || '');
        }
      });

      const qParams = {};
      selectedEndpoint.params
        ?.filter((item) => item.in === 'query' && paramValues[item.name])
        .forEach((item) => {
          qParams[item.name] = paramValues[item.name];
        });

      const bodyParams = {};
      selectedEndpoint.params
        ?.filter((item) => item.in === 'body' && paramValues[item.name])
        .forEach((item) => {
          bodyParams[item.name] = paramValues[item.name];
        });

      const isTD = selectedEndpoint.id === 'td_monitoring' || selectedEndpoint.id === 'bharatnet_td_monitoring';
      const headers = isTD
        ? {
            'Authorization': 'Basic ' + btoa('bharatnet_service:BharatNet@2026!Secure'),
            'Accept': 'application/json',
          }
        : {
            'X-API-Key': token,
          };

      let requestData = Object.keys(bodyParams).length > 0 ? bodyParams : undefined;
      if (selectedEndpoint.isMultipart) {
        const fd = new FormData();
        Object.entries(bodyParams).forEach(([k, v]) => {
          fd.append(k, v);
        });
        pgMultipartFiles.forEach((entry) => {
          if (entry.fieldName && entry.file) {
            fd.append(entry.fieldName.trim(), entry.file);
          }
        });
        requestData = fd;
        headers['Content-Type'] = 'multipart/form-data';
      }

      const response = await axios({
        method: selectedEndpoint.method,
        url: resolvedPath,
        params: qParams,
        data: requestData,
        headers,
      });

      const elapsed = Math.round(performance.now() - startTime);
      setPgResponse({
        status: response.status,
        statusText: response.statusText || 'OK',
        latency: elapsed,
        data: response.data,
      });
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      setPgResponse({
        status: err.response?.status || 500,
        statusText: err.response?.statusText || 'Error',
        latency: elapsed,
        data: err.response?.data || { error: err.message },
      });
    } finally {
      setPgLoading(false);
    }
  };

  // Generate Code Snippets
  const codeSnippet = useMemo(() => {
    const key = apiKeyData?.key || 'hero_live_your_key_here';
    const url = currentEndpointUrl;
    const isTD = selectedEndpoint.id === 'td_monitoring' || selectedEndpoint.id === 'bharatnet_td_monitoring';

    if (codeTab === 'curl') {
      if (isTD) {
        return `curl -X GET "${url}" \\\n  -u "td_service_user:your_service_password" \\\n  -H "Accept: application/json"`;
      }
      if (selectedEndpoint.isMultipart) {
        return `curl -X POST "${url}" \\\n  -H "X-API-Key: ${key}" \\\n  -F "machine_id=${paramValues.machine_id || '8'}" \\\n  -F "user_id=${paramValues.user_id || '2'}" \\\n  -F "frequency=${paramValues.frequency || '50_HOURS'}" \\\n  -F "hour_meter_reading=${paramValues.hour_meter_reading || '185.5'}" \\\n  -F "general_remarks=${paramValues.general_remarks || 'Routine check'}" \\\n  -F 'responses=${paramValues.responses || '[{"checklist_item_id":16,"status":"COMPLETED","remarks":"OK"}]'}' \\\n  -F "photo_16=@/path/to/photo_16.jpg"`;
      }
      if (selectedEndpoint.method === 'GET') {
        return `curl -X GET "${url}" \\\n  -H "X-API-Key: ${key}" \\\n  -H "Content-Type: application/json"`;
      } else {
        const bodyObj = {};
        selectedEndpoint.params?.filter((p) => p.in === 'body').forEach((p) => {
          bodyObj[p.name] = paramValues[p.name] || p.default;
        });
        const bodyStr = JSON.stringify(bodyObj, null, 2).replace(/"/g, '\\"');
        return `curl -X POST "${url}" \\\n  -H "X-API-Key: ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d "${bodyStr}"`;
      }
    } else if (codeTab === 'js') {
      if (isTD) {
        return `// HTTP Basic Authentication for T&D Monitoring
const authHeader = "Basic " + btoa("td_service_user:your_service_password");
const response = await fetch("${url}", {
  method: "GET",
  headers: {
    "Authorization": authHeader,
    "Accept": "application/json"
  }
});
const data = await response.json();
console.log(data);`;
      }
      if (selectedEndpoint.isMultipart) {
        return `const formData = new FormData();
formData.append("machine_id", "${paramValues.machine_id || '8'}");
formData.append("user_id", "${paramValues.user_id || '2'}");
formData.append("frequency", "${paramValues.frequency || '50_HOURS'}");
formData.append("hour_meter_reading", "${paramValues.hour_meter_reading || '185.5'}");
formData.append("responses", JSON.stringify([
  { checklist_item_id: 16, status: "COMPLETED", remarks: "Checked OK" }
]));
formData.append("photo_16", fileInput16.files[0]); // One unique photo per checklist_item_id

const response = await fetch("${url}", {
  method: "POST",
  headers: { "X-API-Key": "${key}" },
  body: formData
});
const data = await response.json();
console.log(data);`;
      }
      return `const response = await fetch("${url}", {
  method: "${selectedEndpoint.method}",
  headers: {
    "X-API-Key": "${key}",
    "Content-Type": "application/json"
  }${selectedEndpoint.method !== 'GET' ? ',\n  body: JSON.stringify({...})' : ''}
});
const data = await response.json();
console.log(data);`;
    } else if (codeTab === 'python') {
      if (isTD) {
        return `import requests
from requests.auth import HTTPBasicAuth

url = "${url}"
auth = HTTPBasicAuth("td_service_user", "your_service_password")

response = requests.get(url, auth=auth, headers={"Accept": "application/json"})
print(f"Status: {response.status_code}")
print(response.json())`;
      }
      if (selectedEndpoint.isMultipart) {
        return `import json
import requests

url = "${url}"
headers = {"X-API-Key": "${key}"}
data = {
    "machine_id": "${paramValues.machine_id || '8'}",
    "user_id": "${paramValues.user_id || '2'}",
    "frequency": "${paramValues.frequency || '50_HOURS'}",
    "hour_meter_reading": "${paramValues.hour_meter_reading || '185.5'}",
    "responses": json.dumps([
        {"checklist_item_id": 16, "status": "COMPLETED", "remarks": "Checked OK"}
    ]),
}
files = {
    "photo_16": ("photo_16.jpg", open("photo_16.jpg", "rb"), "image/jpeg"),
}

response = requests.post(url, headers=headers, data=data, files=files)
print(response.status_code)
print(response.json())`;
      }
      return `import requests

url = "${url}"
headers = {
    "X-API-Key": "${key}",
    "Content-Type": "application/json"
}

response = requests.${selectedEndpoint.method.toLowerCase()}(url, headers=headers)
print(response.status_code)
print(response.json())`;
    }
    return '';
  }, [codeTab, selectedEndpoint, currentEndpointUrl, apiKeyData, paramValues]);

  return (
    <div className="api-docs-container">
      {/* Header & Subtitle */}
      <div className="api-docs-header">
        <div className="api-docs-category">Setup</div>
        <h1 className="api-docs-title">External API</h1>
        <p className="api-docs-subtitle">
          Partner integration — chassis-keyed, API-key auth, live playground
        </p>
      </div>

      {/* Base URL Card */}
      <div className="base-url-card">
        <div className="base-url-left">
          <span className="base-url-label">Base URL</span>
          <span className="base-url-text">{baseUrl}</span>
        </div>
        <div className="base-url-right">
          <span className="header-spec-badge">Header: X-API-Key: &lt;key&gt;</span>
          <button
            type="button"
            className="btn-copy-url"
            onClick={() => {
              navigator.clipboard.writeText(baseUrl);
              setCopiedBaseUrl(true);
              setTimeout(() => setCopiedBaseUrl(false), 2000);
            }}
          >
            {copiedBaseUrl ? <LucideCheck size={14} color="#059669" /> : <LucideCopy size={14} />}
            {copiedBaseUrl ? 'Copied' : 'Copy URL'}
          </button>
        </div>
      </div>

      {/* Top 2 Configuration Cards */}
      <div className="api-config-grid">
        {/* Left: API Key Card */}
        <div className="config-card">
          <div>
            <div className="config-card-header">
              <div>
                <h2 className="config-card-title">API key</h2>
                <p className="config-card-desc">Reveal anytime with the eye icon — copy when visible</p>
              </div>
              <span className={`status-pill ${apiKeyData?.is_active ? 'active' : 'disabled'}`}>
                {apiKeyData?.is_active ? <LucideShield size={12} /> : <LucideAlertCircle size={12} />}
                {apiKeyData?.is_active ? 'Active' : 'Disabled'}
              </span>
            </div>

            <div className="field-group">
              <label className="field-label">API Key</label>
              <div className="input-with-actions">
                <input
                  type="text"
                  readOnly
                  className="key-input"
                  value={
                    revealKey
                      ? apiKeyData?.key || 'hero_live_SZtfFK_ylDL8DzNDpeRnGxCj00ZJ2eNwUWJnHYDUl14'
                      : apiKeyData?.masked_key || 'hero_live_••••••••••••QCek'
                  }
                />
                <button
                  type="button"
                  className="key-icon-btn"
                  title={revealKey ? 'Hide Key' : 'Reveal Key'}
                  onClick={() => setRevealKey(!revealKey)}
                >
                  {revealKey ? <LucideEyeOff size={16} /> : <LucideEye size={16} />}
                </button>
                <button
                  type="button"
                  className="key-icon-btn"
                  title="Copy Key"
                  onClick={() => {
                    const k = apiKeyData?.key || '';
                    if (k) {
                      navigator.clipboard.writeText(k);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                      showToast('API key copied to clipboard.');
                    }
                  }}
                >
                  {copiedKey ? <LucideCheck size={16} color="#059669" /> : <LucideCopy size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div className="card-actions">
            <button type="button" className="btn-action-secondary" onClick={handleRotateKey}>
              <LucideRefreshCw size={14} /> Rotate
            </button>
            <button
              type="button"
              className={apiKeyData?.is_active ? 'btn-action-danger' : 'btn-action-primary green'}
              onClick={handleToggleKey}
            >
              {apiKeyData?.is_active ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        {/* Right: Alert Webhook Card */}
        <div className="config-card">
          <div>
            <div className="config-card-header">
              <div>
                <h2 className="config-card-title">Alert webhook</h2>
                <p className="config-card-desc">Live POST when alerts are created</p>
              </div>
              <button
                type="button"
                className="link-btn"
                onClick={() => setSelectedEndpointId('list_alerts')}
              >
                <LucideBookOpen size={13} /> Integration docs
              </button>
            </div>

            <div className="field-group">
              <div className="input-with-actions">
                <span style={{ padding: '0 10px', color: '#9ca3af' }}>
                  <LucideLink size={15} />
                </span>
                <input
                  type="text"
                  className="key-input"
                  placeholder="https://your.app/hooks/vehicleiq"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={webhookEnabled}
                  onChange={(e) => setWebhookEnabled(e.target.checked)}
                />
                <span>Enable live pushes</span>
              </label>

              <label className="field-label">Webhook Signing Secret</label>
              <div className="secret-text">
                {webhookSecret ? (
                  <span className="secret-code">
                    {revealSecret ? webhookSecret : '••••••••••••••••••••••••••••••••'}
                  </span>
                ) : (
                  'No secret yet — click Rotate secret'
                )}
                {webhookSecret && (
                  <button
                    type="button"
                    className="key-icon-btn"
                    style={{ display: 'inline-flex', verticalAlign: 'middle', padding: '0 6px' }}
                    onClick={() => setRevealSecret(!revealSecret)}
                  >
                    {revealSecret ? <LucideEyeOff size={13} /> : <LucideEye size={13} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card-actions">
            <button type="button" className="btn-action-primary green" onClick={handleSaveWebhook}>
              Save
            </button>
            <button type="button" className="btn-action-secondary" onClick={handleRotateSecret}>
              Rotate secret
            </button>
            <button type="button" className="btn-action-secondary" onClick={handleTestWebhook}>
              <LucideSend size={13} /> Send test
            </button>
          </div>
        </div>
      </div>

      {/* Split Endpoints & Documentation / Playground */}
      <div className="endpoints-split-container">
        {/* Left: Endpoints Navigation Sidebar */}
        <div className="endpoints-sidebar">
          <div className="endpoints-sidebar-header">
            <LucideBookOpen size={16} /> Endpoints
          </div>
          <div className="endpoints-nav-list">
            {ENDPOINTS_CATALOG.map((group) => (
              <div key={group.category}>
                <div className="endpoint-category-title">
                  {group.category} ({group.items.length})
                </div>
                {group.items.map((item) => {
                  const isSelected = item.id === selectedEndpoint.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`endpoint-nav-item ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedEndpointId(item.id)}
                    >
                      <span className={`method-badge ${item.method.toLowerCase()}`}>
                        {item.method}
                      </span>
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Endpoint Documentation & Interactive Playground */}
        <div className="endpoint-detail-content">
          <div className="endpoint-detail-header">
            <div className="endpoint-title-row">
              <span className={`method-badge ${selectedEndpoint.method.toLowerCase()}`}>
                {selectedEndpoint.method}
              </span>
              <h2 className="endpoint-title">{selectedEndpoint.title}</h2>
            </div>
            <button
              type="button"
              className="btn-copy-url"
              onClick={() => {
                navigator.clipboard.writeText(currentEndpointUrl);
                setCopiedEndpointUrl(true);
                setTimeout(() => setCopiedEndpointUrl(false), 2000);
              }}
            >
              {copiedEndpointUrl ? <LucideCheck size={14} color="#059669" /> : <LucideCopy size={14} />}
              {copiedEndpointUrl ? 'Copied' : 'Copy URL'}
            </button>
          </div>

          <p className="endpoint-desc">{selectedEndpoint.description}</p>

          {/* Full Path Box */}
          <div className="endpoint-url-bar">
            <span className="endpoint-url-text">{currentEndpointUrl}</span>
          </div>

          {/* Authentication Headers Section */}
          <div className="section-subtitle-row" style={{ marginTop: 14 }}>
            <h3 className="section-h3">Required Authentication Headers</h3>
            <p className="section-hint">Accepted authentication credentials</p>
          </div>
          <table className="params-table">
            <thead>
              <tr>
                <th>Header</th>
                <th>Format</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {(selectedEndpoint.authHeaders || [
                { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key from above (or Authorization: Bearer <jwt_token>)' },
              ]).map((h) => (
                <tr key={h.name}>
                  <td className="param-name">{h.name}</td>
                  <td className="param-type">{h.value}</td>
                  <td>{h.required ? <span className="param-badge-req">Required</span> : <span className="param-badge-opt">Optional</span>}</td>
                  <td>{h.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Multipart Upload Instructions */}
          {selectedEndpoint.multipartInstructions && (
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', marginBottom: '16px', fontSize: '12.5px', color: '#78350f' }}>
              <strong style={{ display: 'block', marginBottom: '6px' }}>Multipart Photo Upload Instructions (Mandatory Individual Evidence)</strong>
              <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {selectedEndpoint.multipartInstructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Request Body Schema */}
          {selectedEndpoint.requestBodySchema && (
            <div className="code-box-container" style={{ marginBottom: '16px' }}>
              <div className="code-box-header">
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc' }}>
                  Request Body Schema ({selectedEndpoint.isMultipart ? 'multipart/form-data' : 'application/json'})
                </div>
              </div>
              <pre className="code-pre" style={{ margin: 0 }}>
                {JSON.stringify(selectedEndpoint.requestBodySchema, null, 2)}
              </pre>
            </div>
          )}

          {/* Query / Request Fields Table */}
          <div className="section-subtitle-row">
            <h3 className="section-h3">Query / request fields</h3>
            <p className="section-hint">Fields and what they mean</p>
          </div>

          {selectedEndpoint.params && selectedEndpoint.params.length > 0 ? (
            <table className="params-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>In</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {selectedEndpoint.params.map((p) => (
                  <tr key={p.name}>
                    <td className="param-name">{p.name}</td>
                    <td className="param-type">{p.in}</td>
                    <td className="param-type">{p.type}</td>
                    <td>
                      {p.required ? (
                        <span className="param-badge-req">Required</span>
                      ) : (
                        <span className="param-badge-opt">Optional</span>
                      )}
                    </td>
                    <td>{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>No request parameters required.</p>
          )}

          {/* Code Examples Box */}
          <div className="code-box-container">
            <div className="code-box-header">
              <div className="code-tabs">
                <button
                  type="button"
                  className={`code-tab-btn ${codeTab === 'curl' ? 'active' : ''}`}
                  onClick={() => setCodeTab('curl')}
                >
                  cURL
                </button>
                <button
                  type="button"
                  className={`code-tab-btn ${codeTab === 'js' ? 'active' : ''}`}
                  onClick={() => setCodeTab('js')}
                >
                  JavaScript
                </button>
                <button
                  type="button"
                  className={`code-tab-btn ${codeTab === 'python' ? 'active' : ''}`}
                  onClick={() => setCodeTab('python')}
                >
                  Python
                </button>
              </div>
              <button
                type="button"
                className="btn-code-copy"
                onClick={() => {
                  navigator.clipboard.writeText(codeSnippet);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
              >
                {copiedCode ? <LucideCheck size={13} color="#38bdf8" /> : <LucideCopy size={13} />}
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="code-pre">{codeSnippet}</pre>
          </div>

          {/* Response Schema & Examples (Schema A / Empty / Error) */}
          {selectedEndpoint.sampleResponse && (
            <div className="code-box-container" style={{ marginTop: '20px' }}>
              <div className="code-box-header">
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc' }}>
                  Response Schema (Schema A) & Examples
                </div>
              </div>
              <div style={{ padding: '16px', background: '#0f172a', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#38bdf8', marginBottom: '6px', textTransform: 'uppercase' }}>
                    1. Success Response (200 OK — Hierarchy & Latest Captures)
                  </div>
                  <pre className="code-pre" style={{ margin: 0, maxHeight: '240px', overflowY: 'auto' }}>
                    {JSON.stringify(selectedEndpoint.sampleResponse, null, 2)}
                  </pre>
                </div>

                {selectedEndpoint.emptyResponse && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#eab308', marginBottom: '6px', textTransform: 'uppercase' }}>
                      2. Empty Response (200 OK — Zero Captures)
                    </div>
                    <pre className="code-pre" style={{ margin: 0 }}>
                      {JSON.stringify(selectedEndpoint.emptyResponse, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedEndpoint.errorResponse && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#f87171', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Error Response (4xx)
                    </div>
                    <pre className="code-pre" style={{ margin: 0 }}>
                      {JSON.stringify(selectedEndpoint.errorResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HTTP Status Codes */}
          {selectedEndpoint.statusCodes && (
            <div style={{ marginTop: '18px' }}>
              <div className="section-subtitle-row">
                <h3 className="section-h3">HTTP Status Codes</h3>
                <p className="section-hint">Expected response codes</p>
              </div>
              <table className="params-table">
                <thead>
                  <tr>
                    <th>Status Code</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEndpoint.statusCodes.map((sc) => (
                    <tr key={sc.code}>
                      <td className="param-name">{sc.code}</td>
                      <td>{sc.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Live Playground ("Try It") */}
          <div className="playground-box">
            <div className="section-subtitle-row" style={{ marginTop: 0 }}>
              <h3 className="section-h3">Live Playground</h3>
              <p className="section-hint">Test request directly against your HERO environment</p>
            </div>

            {selectedEndpoint.params && selectedEndpoint.params.length > 0 && (
              <div className="playground-inputs-grid">
                {selectedEndpoint.params.map((p) => (
                  <div key={p.name} className="pg-input-item">
                    <label className="pg-label">
                      {p.name} {p.required && <span style={{ color: '#dc2626' }}>*</span>}
                    </label>
                    <input
                      type="text"
                      className="pg-input"
                      placeholder={p.default || `e.g. ${p.name}`}
                      value={paramValues[p.name] !== undefined ? paramValues[p.name] : ''}
                      onChange={(e) =>
                        setParamValues({
                          ...paramValues,
                          [p.name]: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedEndpoint.isMultipart && (
              <div style={{ marginTop: '12px', padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '12.5px', color: '#111827' }}>Multipart Photo Attachments (photo_&lt;checklist_item_id&gt;)</strong>
                  <button
                    type="button"
                    className="btn-action-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setPgMultipartFiles((prev) => [...prev, { fieldName: `photo_${16 + prev.length}`, file: null }])}
                  >
                    + Add Photo Field
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pgMultipartFiles.map((entry, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        className="pg-input"
                        style={{ maxWidth: '170px' }}
                        placeholder="photo_16"
                        value={entry.fieldName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPgMultipartFiles((prev) => prev.map((it, i) => (i === idx ? { ...it, fieldName: val } : it)));
                        }}
                      />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setPgMultipartFiles((prev) => prev.map((it, i) => (i === idx ? { ...it, file } : it)));
                        }}
                      />
                      {pgMultipartFiles.length > 1 && (
                        <button
                          type="button"
                          className="btn-action-danger"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => setPgMultipartFiles((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pg-actions-row">
              <button
                type="button"
                className="btn-send-request"
                disabled={pgLoading}
                onClick={handleExecutePlayground}
              >
                {pgLoading ? (
                  <>
                    <LucideRefreshCw size={14} className="spin-animation" /> Executing...
                  </>
                ) : (
                  <>
                    <LucidePlay size={14} fill="#ffffff" /> Send Request
                  </>
                )}
              </button>
            </div>

            {/* Response Viewer */}
            {pgResponse && (
              <div className="response-container">
                <div className="response-header">
                  <div className="response-meta">
                    <span
                      className={`status-badge ${
                        pgResponse.status >= 200 && pgResponse.status < 300 ? 'ok' : 'err'
                      }`}
                    >
                      {pgResponse.status} {pgResponse.statusText}
                    </span>
                    <span className="latency-badge">{pgResponse.latency} ms</span>
                  </div>
                  <button
                    type="button"
                    className="btn-code-copy"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(pgResponse.data, null, 2));
                      setCopiedResponse(true);
                      setTimeout(() => setCopiedResponse(false), 2000);
                    }}
                  >
                    {copiedResponse ? <LucideCheck size={13} color="#38bdf8" /> : <LucideCopy size={13} />}
                    {copiedResponse ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="response-pre">
                  {JSON.stringify(pgResponse.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="toast-notice">
          <LucideCheckCircle2 size={16} color="#34d399" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};

export default ApiDocs;
