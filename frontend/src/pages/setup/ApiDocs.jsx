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

      const response = await axios({
        method: selectedEndpoint.method,
        url: resolvedPath,
        params: qParams,
        data: Object.keys(bodyParams).length > 0 ? bodyParams : undefined,
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

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#eab308', marginBottom: '6px', textTransform: 'uppercase' }}>
                    2. Empty Response (200 OK — Unknown Circle or Zero Captures)
                  </div>
                  <pre className="code-pre" style={{ margin: 0 }}>
                    {JSON.stringify(selectedEndpoint.emptyResponse, null, 2)}
                  </pre>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#f87171', marginBottom: '6px', textTransform: 'uppercase' }}>
                    3. Error Response (401 Unauthorized / 403 Forbidden)
                  </div>
                  <pre className="code-pre" style={{ margin: 0 }}>
                    {JSON.stringify(selectedEndpoint.errorResponse, null, 2)}
                  </pre>
                </div>
              </div>
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
