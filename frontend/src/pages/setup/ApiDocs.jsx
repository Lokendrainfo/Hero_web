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
import { PM_API_BASE_URL } from '../../services/pmApi';
import './ApiDocs.css';

const PM_GATEWAY_PREFIX = (PM_API_BASE_URL || '/pm-api/v1').replace(/\/+$/, '');

const resolveEndpointPath = (rawPath, paramValues = {}) => {
  let resolved = rawPath;
  Object.keys(paramValues).forEach((key) => {
    if (resolved.includes(`{${key}}`)) {
      resolved = resolved.replace(`{${key}}`, encodeURIComponent(paramValues[key] || ''));
    }
  });
  // Normalize repeated slashes without touching protocol prefix
  resolved = resolved.replace(/([^:]\/)\/+/g, '$1');
  if (resolved.startsWith('/pm-api/v1')) {
    const suffix = resolved.slice('/pm-api/v1'.length);
    const normalizedSuffix = suffix.startsWith('/machine-maintenance/')
      ? suffix.replace(/\/+$/, '')
      : suffix;
    return `${PM_GATEWAY_PREFIX}${normalizedSuffix}`;
  }
  return resolved;
};

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
        path: '/pm-api/v1/machine-maintenance/check',
        description: 'Pre-flight eligibility check and dynamic maintenance form fetch for Mobile APK. Validates machine ID, authenticated operator identity & assignment, frequency/schedule window (including configurable Buffer Days and single-weekday Weekly rules), duplicate occurrence locks, and returns the complete Admin-configured maintenance activity details, category, nested sections & multiple questions (including EVIDENCE_ONLY / Evidence Only), conditional photo/video rules, and per-GPS geofence configuration from machine_pm_db.',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>; JWT derives user_id server-side)' },
        ],
        params: [
          { name: 'machine_id', in: 'query', type: 'integer | string', required: true, default: '8', desc: 'HERO Machine ID, chassis number, or machine code' },
          { name: 'user_id', in: 'query', type: 'integer', required: true, default: '2', desc: 'HERO User/Operator ID (required for X-API-Key; derived/verified automatically for Bearer JWT; alias: operator_id)' },
          { name: 'frequency', in: 'query', type: 'string', required: true, default: 'WEEKLY', desc: 'Maintenance frequency code configured by Admin: DAILY, WEEKLY, EVERY_15_DAYS, MONTHLY, QUARTERLY, YEARLY' },
          { name: 'activity_id', in: 'query', type: 'integer | string', required: false, default: '', desc: 'Optional Maintenance Activity ID (checklist_item_id) or item_code to narrow form to one activity' },
          { name: 'scheduled_date', in: 'query', type: 'string (YYYY-MM-DD)', required: false, default: '', desc: 'Optional scheduled occurrence date being checked (supports submission within scheduled_date + buffer_days)' },
          { name: 'hour_meter_reading', in: 'query', type: 'number', required: false, default: '', desc: 'Optional current hour-meter reading override for duplicate/cycle check' },
        ],
        validationRules: [
          'Machine ID must exist in HERO Machine Master (hero_hdd_db); assigned_operator is resolved live from active HERO assignments (or "Not Assigned").',
          'Operator must exist, be active, and be assigned/authorized for the machine, role, and frequency.',
          'Weekly frequency permits exactly ONE selected weekday; Buffer Days (0-365) apply to Weekly, Every 15 Days, Monthly, Quarterly, and Yearly (always 0 / disallowed on Daily).',
          'Questions with answer_type "EVIDENCE_ONLY" (is_evidence_only: true) skip answer text/options and enforce only configured Photo/Video/GPS requirements.',
          'Each GPS requirement independently configures is_geofence_required (false = Live GPS capture only; true = Circle or Polygon boundary enforcement).',
        ],
        statusCodes: [
          { code: '200 OK', meaning: 'Machine, operator, and frequency validated; eligibility, buffer window, schedule status, and complete dynamic form returned.' },
          { code: '400 Bad Request', meaning: 'Missing/invalid machine_id, user_id, frequency, scheduled_date, or negative hour_meter_reading.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'Operator is not assigned to the machine/role/frequency or Bearer token mismatches user_id.' },
          { code: '404 Not Found', meaning: 'Machine, User, Frequency, or requested Activity not found.' },
        ],
        sampleResponse: {
          success: true,
          message: 'Machine maintenance form and eligibility check completed',
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
              machine_id: 8,
              machine_number: '600202608403',
              code: 'MAC-8403',
              name: 'A600 HDD (8403)',
              machine_model: 'APOLLO A600 V2',
              machine_type: 'HDD',
              vendor_id: 1,
              vendor_name: 'HERO Direct',
              assigned_operator: 'Assigned Operator Name',
              assigned_operator_id: 2,
              assigned_operators: [{ id: 2, name: 'Assigned Operator Name', username: 'op_alpha', is_primary: true }],
              site_name: 'Operational Site',
              location_name: 'Jaipur, RJ',
              engine_hours: 185,
              current_hour_meter_reading: 185.0,
            },
            user: {
              id: 2,
              username: 'op_alpha',
              name: 'Assigned Operator Name',
              primary_role: 'OPERATOR',
              roles: ['OPERATOR'],
              allowed_frequencies: ['DAILY', 'WEEKLY'],
            },
            frequency: { id: 2, code: 'WEEKLY', frequency_type: 'WEEKLY', name: 'Weekly', interval_hours: null, interval_days: 7 },
            hour_meter: { current_machine_hours: 185, checked_hour_meter: 185.0, last_pm_hour_meter: null },
            schedule_status: {
              status: 'DUE_WITHIN_BUFFER',
              scheduled_date: '2026-11-23',
              buffer_days: 3,
              completion_deadline_date: '2026-11-26',
              within_buffer_period: true,
              allow_duplicate_in_same_slot: false,
              already_completed_for_occurrence: false,
              is_overdue: false,
            },
            maintenance_due_status: 'DUE',
            maintenance_due_message: 'Weekly Check Due',
            maintenance: {
              activity_id: 16,
              checklist_item_id: 16,
              item_code: 'PM-ACT-001',
              activity_name: 'Hydraulic Oil Check',
              activity_status: 'ACTIVE',
              is_active: true,
              description: 'Check hydraulic oil level and inspect leakage.',
              category_id: 1,
              category: 'Machine',
              category_code: 'MACHINE',
              frequency: 'WEEKLY',
              frequency_type: 'WEEKLY',
              frequency_name: 'Weekly',
              applicable_schedule: {
                frequency_code: 'WEEKLY',
                schedule_type: 'WEEKLY_DAYS',
                selected_weekdays: ['MONDAY'],
                schedule_summary: 'Every Monday (+3d buffer)',
                buffer_days: 3,
                allow_duplicate_in_same_slot: false,
                is_active: true,
              },
              original_scheduled_date: '2026-11-23',
              scheduled_date: '2026-11-23',
              buffer_days: 3,
              completion_deadline_date: '2026-11-26',
              allow_duplicate_in_same_slot: false,
              maintenance_due_date: '2026-11-26',
              next_due_date: '2026-11-30',
              is_mandatory: true,
              total_activities: 1,
            },
            activities: [
              {
                activity_id: 16,
                checklist_item_id: 16,
                item_code: 'PM-ACT-001',
                activity_name: 'Hydraulic Oil Check',
                activity_status: 'ACTIVE',
                is_active: true,
                category_id: 1,
                category: 'Machine',
                category_code: 'MACHINE',
                frequency: 'WEEKLY',
                frequency_type: 'WEEKLY',
                original_scheduled_date: '2026-11-23',
                scheduled_date: '2026-11-23',
                buffer_days: 3,
                completion_deadline_date: '2026-11-26',
                allow_duplicate_in_same_slot: false,
                sections: [
                  {
                    id: 1,
                    section_name: 'Engine Oil Inspection',
                    section_description: 'Verify oil level and sight glass',
                    display_order: 1,
                    is_active: true,
                    questions: [
                      {
                        id: 101,
                        question_id: 101,
                        section_id: 1,
                        question_name: 'Is Hydraulic Oil Level OK?',
                        answer_type: 'YES_NO',
                        is_evidence_only: false,
                        is_mandatory: true,
                        required: true,
                      },
                      {
                        id: 102,
                        question_id: 102,
                        section_id: 1,
                        question_name: '',
                        answer_type: 'EVIDENCE_ONLY',
                        is_evidence_only: true,
                        is_mandatory: false,
                        required: false,
                      },
                    ],
                  },
                ],
              },
            ],
            questions: [
              {
                id: 101,
                question_id: 101,
                checklist_item_id: 16,
                section_id: 1,
                section_name: 'Engine Oil Inspection',
                section_display_order: 1,
                field_name: 'is_hydraulic_oil_level_ok',
                name: 'Is Hydraulic Oil Level OK?',
                question_name: 'Is Hydraulic Oil Level OK?',
                description: 'Check sight glass level',
                answer_type: 'YES_NO',
                is_evidence_only: false,
                options: [],
                answer_options: [],
                is_mandatory: true,
                required: true,
                display_order: 1,
                is_active: true,
                condition_mode: 'ALWAYS',
                condition_logic: 'AND',
                condition_rules: [],
              },
            ],
            photo_requirements: [
              {
                id: 201,
                photo_config_id: 201,
                checklist_item_id: 16,
                question_id: 101,
                name: 'Hydraulic Level Photo',
                photo_name: 'Hydraulic Level Photo',
                description: 'Sight glass photo when level is OK',
                trigger_question_id: 101,
                trigger_answer: 'Yes',
                trigger: { question_id: 101, operator: 'EQUALS', answer: 'Yes' },
                is_mandatory: true,
                required: true,
                display_order: 1,
                condition_mode: 'CONDITIONAL',
                condition_logic: 'AND',
                condition_rules: [{ source_question_id: 101, operator: 'EQUALS', expected_value: 'Yes' }],
              },
            ],
            video_requirements: [
              {
                id: 301,
                video_config_id: 301,
                checklist_item_id: 16,
                question_id: 102,
                name: 'Hydraulic Seal Evidence Clip',
                video_name: 'Hydraulic Seal Evidence Clip',
                description: 'Evidence-only walkaround clip (optional or conditional)',
                trigger_question_id: 101,
                trigger_answer: 'No',
                trigger: { question_id: 101, operator: 'EQUALS', answer: 'No' },
                is_mandatory: true,
                required: true,
                max_duration_seconds: 30,
                min_videos: 1,
                max_videos: 1,
                display_order: 1,
                condition_mode: 'CONDITIONAL',
                condition_logic: 'AND',
                condition_rules: [{ source_question_id: 101, operator: 'EQUALS', expected_value: 'No' }],
              },
            ],
            gps_configuration: {
              required: true,
              gps_required: true,
              latitude_required: true,
              longitude_required: true,
              accuracy_required: true,
              accuracy_threshold_meters: 50.0,
              gps_capture_mandatory: true,
              location_validation_rules: [
                {
                  location_requirement_id: 401,
                  question_id: 101,
                  location_name: 'Machine Yard GPS',
                  capture_rule: 'HIGH_ACCURACY',
                  capture_latitude: true,
                  capture_longitude: true,
                  accuracy_threshold_meters: 50.0,
                  capture_timestamp: true,
                  is_geofence_required: true,
                  geofence_type: 'CIRCLE',
                  geofence_reference_name: 'Jaipur North Yard',
                  geofence_latitude: 28.613939,
                  geofence_longitude: 77.209021,
                  geofence_radius_meters: 150.0,
                  geofence_polygon: [],
                  is_mandatory: true,
                  condition_mode: 'ALWAYS',
                },
              ],
              location_requirements: [],
            },
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
        path: '/pm-api/v1/machine-maintenance/data',
        description: 'Submit the complete dynamic preventive maintenance form from Mobile APK in a single atomic transaction. Derives authenticated operator identity from Bearer JWT (never trusting spoofed mobile IDs), validates active operator-machine assignment, frequency window & Buffer Days, allow_duplicate_in_same_slot enforcement, dynamic question answers (skipping answers for EVIDENCE_ONLY items), conditional photo/video evidence, video duration/counts/formats, and per-GPS geofence boundaries (Circle/Polygon), storing binaries in machine_pm_db PostgreSQL BYTEA alongside immutable historical configuration snapshots.',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>)' },
          { name: 'Content-Type', value: 'multipart/form-data', required: true, desc: 'Multipart form payload carrying JSON responses string and camera-captured photo/video binary files' },
        ],
        multipartInstructions: [
          'Send the request as multipart/form-data (let the HTTP client set the multipart boundary).',
          'Include scalar fields: machine_id, frequency, hour_meter_reading, capture_source ("CAMERA"), optional user_id (ignored/validated against JWT when using Bearer token), scheduled_date, general_remarks, device_id, application_version, gps (JSON), and client_request_id.',
          'Include a JSON-serialized array string in "responses" with checklist_item_id, status ("COMPLETED" or "NOT_COMPLETED"), remarks, custom_fields (answers keyed by question_id; omit answer for EVIDENCE_ONLY questions), video_durations, and locations (GPS captures keyed by location_requirement_id).',
          'Attach camera-captured photos (JPEG/PNG/WEBP, max 10 MB) as "photo_<checklist_item_id>_req_<photo_config_id>" (or "photo_<checklist_item_id>" for single-photo activities).',
          'Attach camera-recorded videos (MP4/WEBM/MOV/MKV, max 25 MB, within configured max_duration_seconds) as "video_<checklist_item_id>_req_<video_config_id>_0".',
          'Base64 image/video strings inside JSON and non-camera capture_source values (e.g. GALLERY) are rejected.',
        ],
        validationRules: [
          'When authenticated via Bearer JWT, operator identity is derived server-side from the token and must match active HERO machine-operator assignment.',
          'All mandatory visible non-EVIDENCE_ONLY questions must be answered; EVIDENCE_ONLY items validate configured mandatory/conditional photo, video, and GPS requirements without requiring a text/option answer.',
          'Schedule window honours configured Buffer Days (0-365 on non-Daily frequencies); Buffer Days never grant extra submission slots when allow_duplicate_in_same_slot is false (duplicates return 409).',
          'Conditional photos, videos, and GPS requirements are evaluated server-side from selected answers; geofenced GPS rules (CIRCLE or POLYGON) reject out-of-bounds coordinates with 400.',
          'Video size > allowed limit returns 413; unsupported photo/video MIME or extension returns 415; unknown/inactive config IDs return 422.',
        ],
        requestBodySchema: {
          machine_id: 'integer | string (required) — HERO Machine ID or chassis number',
          user_id: 'integer (required for X-API-Key; derived from JWT for Bearer auth; alias: operator_id) — HERO Operator/User ID',
          frequency: 'string (required) — DAILY | WEEKLY | EVERY_15_DAYS | MONTHLY | QUARTERLY | YEARLY',
          hour_meter_reading: 'number (required, >= 0) — Current hour-meter reading',
          scheduled_date: 'string (optional, YYYY-MM-DD) — Original scheduled maintenance date (accepted within +buffer_days)',
          general_remarks: 'string (optional; aliases: remarks, operator_remarks)',
          device_id: 'string (optional) — Mobile device identifier',
          application_version: 'string (optional) — Mobile APK version',
          capture_source: 'string (optional, default CAMERA) — Must be CAMERA | MOBILE_CAMERA | WEB_CAMERA',
          gps: {
            latitude: 'number (optional/conditional)',
            longitude: 'number (optional/conditional)',
            accuracy_meters: 'number (optional)',
            captured_at: 'ISO-8601 datetime (optional)',
          },
          responses: [
            {
              checklist_item_id: 16,
              status: 'COMPLETED',
              remarks: 'Checked OK',
              custom_fields: { '101': 'Yes' },
              video_durations: { '301': [12.5] },
              locations: {
                '401': { latitude: 28.613939, longitude: 77.209021, accuracy_meters: 12.0, captured_at: '2026-11-26T10:15:00Z' },
              },
            },
          ],
          'photo_<checklist_item_id>_req_<photo_config_id>': 'file (conditional/required) — Image binary (JPEG/PNG/WEBP)',
          'video_<checklist_item_id>_req_<video_config_id>_0': 'file (conditional/required) — Video binary (MP4/WEBM/MOV/MKV)',
        },
        params: [
          { name: 'machine_id', in: 'body', type: 'integer | string', required: true, default: '8', desc: 'HERO Machine ID or chassis number' },
          { name: 'user_id', in: 'body', type: 'integer', required: true, default: '2', desc: 'HERO User/Operator ID performing the maintenance' },
          { name: 'frequency', in: 'body', type: 'string', required: true, default: 'WEEKLY', desc: 'Maintenance frequency code' },
          { name: 'scheduled_date', in: 'body', type: 'string (YYYY-MM-DD)', required: false, default: '', desc: 'Scheduled occurrence date (supported within buffer window)' },
          { name: 'hour_meter_reading', in: 'body', type: 'number', required: true, default: '185.5', desc: 'Current hour-meter reading captured on site' },
          { name: 'general_remarks', in: 'body', type: 'string', required: false, default: 'Routine check completed via mobile APK', desc: 'Overall maintenance remarks' },
          { name: 'responses', in: 'body', type: 'json-string', required: true, default: '[{"checklist_item_id": 16, "status": "COMPLETED", "remarks": "Checked OK", "custom_fields": {"101": "Yes"}}]', desc: 'JSON array string of activity responses, dynamic question answers (omit answer for EVIDENCE_ONLY), video durations, and GPS locations' },
        ],
        statusCodes: [
          { code: '201 Created', meaning: 'Complete submission, question answers, photos, videos, GPS/geofence verification, and snapshots saved atomically.' },
          { code: '400 Bad Request', meaning: 'Missing mandatory answer/photo/video/GPS, outside configured geofence, invalid accuracy/duration, or non-camera capture_source.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'Operator not assigned/authorized for the machine, role, or frequency, or spoofed user_id mismatch.' },
          { code: '404 Not Found', meaning: 'Machine or frequency not found.' },
          { code: '409 Conflict', meaning: 'Duplicate submission already recorded for this machine, frequency, and scheduled occurrence (when multiple completions disabled).' },
          { code: '413 Payload Too Large', meaning: 'Uploaded photo or video exceeds configured maximum size.' },
          { code: '415 Unsupported Media Type', meaning: 'Unsupported photo or video file format / MIME type.' },
          { code: '422 Unprocessable Entity', meaning: 'Unknown/inactive activity ID, question ID, photo/video requirement ID, or GPS configuration ID.' },
          { code: '500 Internal Server Error', meaning: 'Unexpected server error (logged securely; no internal traces exposed).' },
        ],
        sampleResponse: {
          success: true,
          message: 'Maintenance submission PM-20261126-0001 saved successfully',
          data: {
            submission_id: 12,
            submission_reference_id: 'PM-20261126-0001',
            submission_number: 'PM-20261126-0001',
            status: 'COMPLETED',
            approval_status: 'PENDING_REVIEW',
            machine_id: 8,
            machine_number: '600202608403',
            vendor_id: 1,
            vendor_name: 'HERO Direct',
            assigned_operator: 'Assigned Operator Name',
            assigned_operator_id: 2,
            user_id: 2,
            submitted_by_name: 'Assigned Operator Name',
            submitted_by_role: 'OPERATOR',
            frequency: 'WEEKLY',
            scheduled_date: '2026-11-23',
            completion_deadline_date: '2026-11-26',
            buffer_days: 3,
            allow_duplicate_in_same_slot: false,
            gps: { latitude: 28.613939, longitude: 77.209021, accuracy_meters: 12.0, captured_at: '2026-11-26T10:15:00+05:30' },
            hour_meter_reading: 185.5,
            total_items: 1,
            completed_items_count: 1,
            not_completed_items_count: 0,
            photo_count: 1,
            video_count: 0,
            location_count: 1,
            photos: [
              {
                photo_id: 45,
                checklist_response_id: 88,
                checklist_item_id: 16,
                photo_requirement_id: 201,
                requirement_name: 'Hydraulic Level Photo',
                item_code: 'PM-ACT-001',
                photo_filename: 'hyd_ok.jpg',
                mime_type: 'image/jpeg',
                file_size: 48210,
                image_hash: 'e3b0c44298fc1c149afbf4c8996fb924...',
                photo_url: '/pm-api/v1/machine-maintenance/photos/45',
              },
            ],
            videos: [],
            locations: [
              {
                location_id: 19,
                checklist_response_id: 88,
                checklist_item_id: 16,
                location_requirement_id: 401,
                requirement_name: 'Machine Yard GPS',
                latitude: 28.613939,
                longitude: 77.209021,
                accuracy_meters: 12.0,
                captured_at: '2026-11-26T10:15:00+05:30',
              },
            ],
            submitted_at: '2026-11-26T11:20:00+05:30',
          },
          meta: {},
        },
        errorResponse: {
          success: false,
          message: "Mandatory photo 'Hydraulic Level Photo' is missing for checklist activity 'Hydraulic Oil Check'.",
          errors: {
            photos: "Mandatory photo 'Hydraulic Level Photo' is missing for checklist activity 'Hydraulic Oil Check'.",
          },
          status_code: 400,
        },
      },
      {
        id: 'machine_maintenance_list',
        method: 'GET',
        title: 'Machine Maintenance List API',
        path: '/pm-api/v1/machine-maintenance/list',
        description: 'Returns authenticated operator context, authorized HERO machines with live assigned operator identity, paginated maintenance schedules & submission records (content + page metadata), plus complete checklist master configurations (categories, sections, questions including EVIDENCE_ONLY, photo/video/GPS geofence requirements, Buffer Days & duplicate settings, role assignments, and safety guidelines).',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>)' },
        ],
        params: [
          { name: 'machine_id', in: 'query', type: 'integer | string', required: false, default: '', desc: 'Filter by HERO machine ID, chassis number, or code' },
          { name: 'vendor_id', in: 'query', type: 'integer | string', required: false, default: '', desc: 'Filter by HERO vendor ID or code' },
          { name: 'operator_id', in: 'query', type: 'integer', required: false, default: '', desc: 'Filter by operator/user ID (alias: user_id; enforced from JWT when Bearer token used)' },
          { name: 'frequency', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by frequency code (DAILY, WEEKLY, EVERY_15_DAYS, MONTHLY, QUARTERLY, YEARLY)' },
          { name: 'maintenance_status', in: 'query', type: 'string', required: false, default: '', desc: 'Filter by status: PENDING, COMPLETED, OVERDUE, DUE' },
          { name: 'from_date', in: 'query', type: 'string (YYYY-MM-DD)', required: false, default: '', desc: 'Filter from submission/schedule date' },
          { name: 'to_date', in: 'query', type: 'string (YYYY-MM-DD)', required: false, default: '', desc: 'Filter up to submission/schedule date' },
          { name: 'page', in: 'query', type: 'integer', required: false, default: '1', desc: 'Page number (1-based)' },
          { name: 'page_size', in: 'query', type: 'integer', required: false, default: '20', desc: 'Records per page (1-200)' },
          { name: 'user_role', in: 'query', type: 'string', required: false, default: '', desc: 'Optional role filter (OPERATOR, FIELD_ENGINEER, AREA_MANAGER, ADMIN)' },
        ],
        validationRules: [
          'For operator logins, only machines actively assigned to that authenticated operator in HERO are returned.',
          'Maintenance status (PENDING, COMPLETED, OVERDUE, DUE) honours configured Buffer Days and actual MaintenanceSubmission records in machine_pm_db.',
          'from_date and to_date must be valid YYYY-MM-DD dates with from_date <= to_date.',
          'All records respect machine vendor and operator isolation for the authenticated caller.',
        ],
        statusCodes: [
          { code: '200 OK', meaning: 'Authorized operator context, paginated maintenance list, and complete checklist/evidence/schedule configuration returned.' },
          { code: '400 Bad Request', meaning: 'Invalid date range, page, or page_size parameter.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'Requested machine_id or vendor_id is unauthorized for caller.' },
          { code: '404 Not Found', meaning: 'Requested machine_id not found.' },
        ],
        sampleResponse: {
          success: true,
          message: 'Machine maintenance list retrieved successfully',
          data: {
            authenticated_operator: {
              id: 2,
              username: 'op_alpha',
              name: 'Assigned Operator Name',
              primary_role: 'OPERATOR',
              assigned_machine_count: 1,
            },
            filters_applied: {
              machine_id: '8',
              vendor_id: null,
              operator_id: null,
              frequency: 'WEEKLY',
              maintenance_status: 'ALL',
              from_date: null,
              to_date: null,
              user_role: 'ALL',
              category: 'ALL',
            },
            content: [
              {
                machine_id: 8,
                machine_number: '600202608403',
                machine_name: 'A600 HDD (8403)',
                machine_model: 'APOLLO A600 V2',
                vendor: 'HERO Direct',
                vendor_id: 1,
                assigned_operator: 'Assigned Operator Name',
                activity_id: 16,
                checklist_item_id: 16,
                item_code: 'PM-ACT-001',
                activity_name: 'Hydraulic Oil Check',
                description: 'Check hydraulic oil level and inspect leakage.',
                frequency: 'WEEKLY',
                frequency_name: 'Weekly',
                scheduled_date: '2026-11-23',
                due_date: '2026-11-26',
                last_maintenance_date: '2026-11-26',
                next_due_date: '2026-11-30',
                submission_id: 12,
                submission_number: 'PM-20261126-0001',
                submission_date: '2026-11-26',
                submitted_at: '2026-11-26T11:20:00+05:30',
                operator: 'Assigned Operator Name',
                operator_id: 2,
                hour_meter_reading: 185.5,
                completion_status: 'COMPLETED',
                approval_status: 'PENDING_REVIEW',
                remarks: 'Checked OK',
                maintenance_status: 'COMPLETED',
              },
            ],
            page: {
              size: 20,
              number: 1,
              totalElements: 1,
              totalPages: 1,
            },
            total_checklist_items: 1,
            checklist_items: [
              {
                id: 16,
                checklist_item_id: 16,
                activity_id: 16,
                item_code: 'PM-ACT-001',
                activity_name: 'Hydraulic Oil Check',
                activity_status: 'ACTIVE',
                is_active: true,
                category_id: 1,
                category_code: 'MACHINE',
                category_name: 'Machine',
                sections: [],
                photo_requirements: [],
                video_requirements: [],
                location_requirements: [],
              },
            ],
            frequency_wise_checklists: [],
            safety_guidelines: [],
          },
          meta: {
            count: 1,
            total_pages: 1,
            current_page: 1,
            page_size: 20,
          },
        },
        errorResponse: {
          success: false,
          message: 'from_date cannot be after to_date.',
          errors: { from_date: 'from_date cannot be after to_date.' },
          status_code: 400,
        },
      },
      {
        id: 'machine_maintenance_photo_get',
        method: 'GET',
        isBinaryResponse: true,
        title: 'Machine Maintenance Photo Retrieval API',
        path: '/pm-api/v1/machine-maintenance/photos/{photo_id}',
        description: 'Securely streams an authenticated maintenance photograph directly from PostgreSQL BYTEA storage (machine_pm_db.pm_photo_attachment.photo_data), or returns full authorized photo metadata JSON when ?metadata=true is passed. Optionally verifies ?submission_id= ownership. Never exposes filesystem paths or public permanent URLs.',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>)' },
        ],
        params: [
          { name: 'photo_id', in: 'path', type: 'integer', required: true, default: '1', desc: 'ID of the maintenance photo attachment stored in machine_pm_db' },
          { name: 'submission_id', in: 'query', type: 'integer', required: false, default: '', desc: 'Optional submission ID to verify that the photo belongs to the requested maintenance submission' },
          { name: 'metadata', in: 'query', type: 'boolean', required: false, default: '', desc: 'Set true to return JSON metadata instead of streaming binary image bytes' },
        ],
        validationRules: [
          'Caller must be authenticated and authorized for the photo machine/vendor (or uploader).',
          'When submission_id is supplied, photo must belong to that submission (otherwise returns 404).',
          'Returns Content-Type matching stored image (image/jpeg, image/png, image/webp) with X-Content-Type-Options: nosniff.',
        ],
        statusCodes: [
          { code: '200 OK', meaning: 'Binary image streamed (default) or JSON metadata returned (?metadata=true).' },
          { code: '400 Bad Request', meaning: 'Non-integer submission_id query parameter.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'Caller is not authorized to view photographs for this machine/vendor.' },
          { code: '404 Not Found', meaning: 'Photo ID not found or does not belong to the requested submission_id.' },
        ],
        sampleResponse: {
          note: 'Default returns binary image bytes (image/jpeg, image/png, or image/webp). With ?metadata=true returns JSON:',
          success: true,
          message: 'Maintenance photo metadata retrieved successfully',
          data: {
            photo_id: 45,
            submission_id: 12,
            submission_number: 'PM-20261126-0001',
            machine_id: 8,
            maintenance_activity_id: 16,
            item_code: 'PM-ACT-001',
            question_id: 101,
            photo_configuration_id: 201,
            photo_name: 'Hydraulic Level Photo',
            photo_description: 'Sight glass photo when level is OK',
            capture_timestamp: '2026-11-26T10:15:00+05:30',
            latitude: 28.613939,
            longitude: 77.209021,
            gps_accuracy: 12.0,
            operator_id: 2,
            content_type: 'image/jpeg',
            file_size: 48210,
            sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb924...',
            image_url: '/pm-api/v1/machine-maintenance/photos/45',
          },
          meta: {},
        },
        errorResponse: {
          success: false,
          message: 'You are not authorized to view this photograph.',
          errors: { detail: 'You are not authorized to view this photograph.' },
          status_code: 403,
        },
      },
      {
        id: 'machine_maintenance_video_get',
        method: 'GET',
        isBinaryResponse: true,
        title: 'Machine Maintenance Video Retrieval API',
        path: '/pm-api/v1/machine-maintenance/videos/{video_id}',
        description: 'Dedicated authenticated endpoint to securely stream maintenance video evidence from machine_pm_db PostgreSQL BYTEA with HTTP Byte-Range (206 Partial Content) support, or return video metadata JSON when ?metadata=true. Large video binaries are never embedded in JSON.',
        authHeaders: [
          { name: 'X-API-Key', value: '<your_hero_api_key>', required: true, desc: 'Partner/APK API key (or Authorization: Bearer <jwt_token>)' },
          { name: 'Range', value: 'bytes=0-1048575', required: false, desc: 'Optional HTTP Range header for progressive video streaming' },
        ],
        params: [
          { name: 'video_id', in: 'path', type: 'integer', required: true, default: '1', desc: 'ID of the maintenance video attachment stored in machine_pm_db' },
          { name: 'submission_id', in: 'query', type: 'integer', required: false, default: '', desc: 'Optional submission ID to verify that the video belongs to the requested submission' },
          { name: 'metadata', in: 'query', type: 'boolean', required: false, default: '', desc: 'Set true to return JSON metadata instead of streaming video bytes' },
        ],
        validationRules: [
          'Caller must be authenticated and authorized for the video machine/vendor (or uploader).',
          'Supports HTTP Range requests returning 206 Partial Content with Accept-Ranges: bytes.',
          'When submission_id is supplied, verifies video belongs to that submission.',
        ],
        statusCodes: [
          { code: '200 OK', meaning: 'Full video stream returned (or JSON metadata when ?metadata=true).' },
          { code: '206 Partial Content', meaning: 'Byte-range video chunk returned for seekable playback.' },
          { code: '401 Unauthorized', meaning: 'Missing or invalid X-API-Key / Bearer token.' },
          { code: '403 Forbidden', meaning: 'Caller is not authorized to view videos for this machine/vendor.' },
          { code: '404 Not Found', meaning: 'Video ID not found or does not belong to requested submission_id.' },
        ],
        sampleResponse: {
          note: 'Default streams video/mp4 or video/webm bytes with Accept-Ranges: bytes. With ?metadata=true returns JSON:',
          success: true,
          message: 'Maintenance video metadata retrieved successfully',
          data: {
            video_id: 9,
            submission_id: 12,
            submission_number: 'PM-20261126-0001',
            machine_id: 8,
            maintenance_activity_id: 16,
            item_code: 'PM-ACT-001',
            question_id: 101,
            video_configuration_id: 301,
            video_name: 'Hydraulic Leakage Video',
            video_description: 'Record leak clip when oil level is No',
            duration_seconds: 12.5,
            capture_timestamp: '2026-11-26T10:15:30+05:30',
            latitude: 28.613939,
            longitude: 77.209021,
            gps_accuracy: 12.0,
            operator_id: 2,
            content_type: 'video/mp4',
            file_size: 412890,
            sha256_hash: '9f86d081884c7d659a2feaa0c55ad015...',
            video_url: '/pm-api/v1/machine-maintenance/videos/9',
          },
          meta: {},
        },
        errorResponse: {
          success: false,
          message: 'You are not authorized to view this video.',
          errors: { detail: 'You are not authorized to view this video.' },
          status_code: 403,
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
  const [pgAuthMode, setPgAuthMode] = useState('auto');
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
    const p = resolveEndpointPath(selectedEndpoint.path, paramValues);
    const queryParams = selectedEndpoint.params
      ?.filter((item) => item.in === 'query' && paramValues[item.name])
      .map((item) => `${encodeURIComponent(item.name)}=${encodeURIComponent(paramValues[item.name])}`)
      .join('&');

    const fullPath = queryParams ? `${p}?${queryParams}` : p;
    if (/^https?:\/\//i.test(fullPath)) return fullPath;
    return `${baseUrl}${fullPath}`;
  }, [selectedEndpoint, paramValues, baseUrl]);

  // Execute Request via Live Playground
  const handleExecutePlayground = async () => {
    setPgLoading(true);
    setPgResponse(null);
    const startTime = performance.now();
    const activeApiKey = apiKeyData?.is_active && apiKeyData?.key ? apiKeyData.key : '';
    const bearerToken = localStorage.getItem('access_token') || '';

    try {
      const resolvedPath = resolveEndpointPath(selectedEndpoint.path, paramValues);

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
      let headers = {};
      if (isTD) {
        headers = {
          'Authorization': 'Basic ' + btoa('bharatnet_service:BharatNet@2026!Secure'),
          'Accept': 'application/json',
        };
      } else if (pgAuthMode === 'jwt' && bearerToken) {
        headers = { Authorization: `Bearer ${bearerToken}` };
      } else if (pgAuthMode === 'api_key') {
        headers = { 'X-API-Key': activeApiKey || apiKeyData?.key || 'hero_live_partner_key' };
      } else if (pgAuthMode === 'none') {
        headers = {};
      } else {
        // 'auto': preserve JWT Bearer when active API key is unavailable; prefer active API key otherwise
        if (activeApiKey) {
          headers = { 'X-API-Key': activeApiKey };
        } else if (bearerToken) {
          headers = { Authorization: `Bearer ${bearerToken}` };
        } else {
          headers = { 'X-API-Key': 'hero_live_partner_key' };
        }
      }

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
      }

      const wantsMeta = ['1', 'true', 'yes'].includes(String(qParams.metadata || qParams.meta || '').toLowerCase());
      const expectBinary = Boolean(selectedEndpoint.isBinaryResponse && !wantsMeta);

      const response = await axios({
        method: selectedEndpoint.method,
        url: resolvedPath,
        params: qParams,
        data: requestData,
        headers,
        responseType: expectBinary ? 'blob' : 'json',
      });

      const elapsed = Math.round(performance.now() - startTime);
      let respPayload = response.data;
      let imagePreviewUrl = null;
      let videoPreviewUrl = null;
      if (expectBinary && response.data instanceof Blob) {
        const mimeType = response.headers?.['content-type'] || response.data.type || '';
        const blobUrl = URL.createObjectURL(response.data);
        if (mimeType.startsWith('video/')) {
          videoPreviewUrl = blobUrl;
        } else {
          imagePreviewUrl = blobUrl;
        }
        respPayload = {
          content_type: mimeType,
          byte_size: response.data.size,
          source: 'machine_pm_db (PostgreSQL BYTEA)',
        };
      }
      setPgResponse({
        status: response.status,
        statusText: response.statusText || 'OK',
        latency: elapsed,
        data: respPayload,
        imagePreviewUrl,
        videoPreviewUrl,
      });
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      let errPayload = err.response?.data || { error: err.message };
      if (errPayload instanceof Blob) {
        try {
          const text = await errPayload.text();
          errPayload = JSON.parse(text);
        } catch (_) {
          errPayload = { error: err.message, status: err.response?.status };
        }
      }
      setPgResponse({
        status: err.response?.status || 500,
        statusText: err.response?.statusText || 'Error',
        latency: elapsed,
        data: errPayload,
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
        const defaultResponses = '[{"checklist_item_id":16,"status":"COMPLETED","remarks":"OK","custom_fields":{"101":"Yes"}}]';
        return `curl -X POST "${url}" \\\n  -H "X-API-Key: ${key}" \\\n  -F "machine_id=${paramValues.machine_id || '8'}" \\\n  -F "user_id=${paramValues.user_id || '2'}" \\\n  -F "frequency=${paramValues.frequency || 'WEEKLY'}" \\\n  -F "hour_meter_reading=${paramValues.hour_meter_reading || '185.5'}" \\\n  -F "capture_source=CAMERA" \\\n  -F "general_remarks=${paramValues.general_remarks || 'Routine check'}" \\\n  -F 'responses=${paramValues.responses || defaultResponses}' \\\n  -F "photo_16_req_201=@/path/to/photo.jpg"`;
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
formData.append("frequency", "${paramValues.frequency || 'WEEKLY'}");
formData.append("hour_meter_reading", "${paramValues.hour_meter_reading || '185.5'}");
formData.append("capture_source", "CAMERA");
formData.append("responses", JSON.stringify([
  { checklist_item_id: 16, status: "COMPLETED", remarks: "Checked OK", custom_fields: { "101": "Yes" } }
]));
formData.append("photo_16_req_201", photoInput.files[0]); // Or photo_16 for single-photo activity

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
    "frequency": "${paramValues.frequency || 'WEEKLY'}",
    "hour_meter_reading": "${paramValues.hour_meter_reading || '185.5'}",
    "capture_source": "CAMERA",
    "responses": json.dumps([
        {"checklist_item_id": 16, "status": "COMPLETED", "remarks": "Checked OK", "custom_fields": {"101": "Yes"}}
    ]),
}
files = {
    "photo_16_req_201": ("photo.jpg", open("photo.jpg", "rb"), "image/jpeg"),
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
              <strong style={{ display: 'block', marginBottom: '6px' }}>Multipart Photo & Video Upload Instructions</strong>
              <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {selectedEndpoint.multipartInstructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Validation Rules */}
          {selectedEndpoint.validationRules && selectedEndpoint.validationRules.length > 0 && (
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f0f9ff', border: '1px solid #bae6fd', marginBottom: '16px', fontSize: '12.5px', color: '#0c4a6e' }}>
              <strong style={{ display: 'block', marginBottom: '6px' }}>Validation & Security Rules</strong>
              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {selectedEndpoint.validationRules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
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
              <div>
                <h3 className="section-h3">Live Playground</h3>
                <p className="section-hint">Test request directly against your HERO environment</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="pg-auth-mode" className="pg-label" style={{ margin: 0 }}>Auth:</label>
                <select
                  id="pg-auth-mode"
                  className="pg-input"
                  style={{ width: 'auto', minWidth: '175px', padding: '5px 8px', fontSize: '12px' }}
                  value={pgAuthMode}
                  onChange={(e) => setPgAuthMode(e.target.value)}
                >
                  <option value="auto">Auto (API Key / Bearer)</option>
                  <option value="jwt">Bearer JWT (Session)</option>
                  <option value="api_key">Partner X-API-Key</option>
                  <option value="none">No Auth (Test 401)</option>
                </select>
              </div>
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
                  <strong style={{ fontSize: '12.5px', color: '#111827' }}>Multipart Media Attachments (photo_&lt;cid&gt;_req_&lt;pid&gt; / video_&lt;cid&gt;_req_&lt;vid&gt;_0)</strong>
                  <button
                    type="button"
                    className="btn-action-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setPgMultipartFiles((prev) => [...prev, { fieldName: `photo_${16 + prev.length}`, file: null }])}
                  >
                    + Add Media Field
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pgMultipartFiles.map((entry, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        className="pg-input"
                        style={{ maxWidth: '210px' }}
                        placeholder="photo_16_req_201"
                        value={entry.fieldName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPgMultipartFiles((prev) => prev.map((it, i) => (i === idx ? { ...it, fieldName: val } : it)));
                        }}
                      />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-matroska"
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
                {pgResponse.imagePreviewUrl && (
                  <div style={{ padding: '12px', background: '#0f172a', borderBottom: '1px solid #1e293b', textAlign: 'center' }}>
                    <img
                      src={pgResponse.imagePreviewUrl}
                      alt="Retrieved maintenance photo binary"
                      style={{ maxWidth: '100%', maxHeight: '280px', borderRadius: '6px', objectFit: 'contain' }}
                    />
                  </div>
                )}
                {pgResponse.videoPreviewUrl && (
                  <div style={{ padding: '12px', background: '#0f172a', borderBottom: '1px solid #1e293b', textAlign: 'center' }}>
                    <video
                      src={pgResponse.videoPreviewUrl}
                      controls
                      style={{ maxWidth: '100%', maxHeight: '280px', borderRadius: '6px' }}
                    />
                  </div>
                )}
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
