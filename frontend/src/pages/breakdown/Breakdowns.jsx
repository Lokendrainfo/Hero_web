import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { breakdownService } from '../../services/breakdownService';
import { machineService } from '../../services/machineService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideX,
  LucideWrench,
  LucideClock,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { SearchableSelect } from '../../components/common/Select';
import { DateField } from '../../components/common/DateField';
import '../../styles/screens.css';

const unwrapMachines = (res) => {
  const payload = res?.data && !Array.isArray(res.data) && (res.data.results || res.data.status_counts)
    ? res.data
    : (res?.data && !res.results && !res.status_counts ? res.data : res) || {};
  const list = Array.isArray(payload)
    ? payload
    : (payload.results || (Array.isArray(payload.data) ? payload.data : []) || []);
  return Array.isArray(list) ? list : [];
};

const statusOf = (row) => String(row?.status || '').toUpperCase();

const formatWhen = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const formatMinutes = (mins) => {
  if (mins == null || mins === '') return '—';
  const n = Number(mins);
  if (!Number.isFinite(n)) return '—';
  if (n < 60) return `${Math.round(n)}m`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh ? `${d}d ${rh}h` : `${d}d`;
  }
  return m ? `${h}h ${m}m` : `${h}h`;
};

const keyLabels = (keys, fallback) => {
  if (Array.isArray(keys) && keys.length) {
    return keys.map((k) => k.label || k.code || k).filter(Boolean).join(', ');
  }
  return fallback || '—';
};

const toIso = (localValue) => {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const statusBadge = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'OPEN') return 'badge-breakdown';
  if (s === 'SEEN' || s === 'ACCEPTED') return 'badge-maintenance';
  if (s === 'RESOLVED' || s === 'CLOSED') return 'badge-running';
  return 'badge-idle';
};

const severityBadge = (severity) => {
  const s = String(severity || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'badge-breakdown';
  if (s === 'MEDIUM') return 'badge-maintenance';
  return 'badge-idle';
};

const OEM_STATUSES = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'SEEN', label: 'Seen' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const OPS_STATUSES = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
];

const emptyOemForm = {
  machine_chassis_no: '',
  reason: '',
  reason_key_ids: [],
  severity: 'MEDIUM',
  occurred_at: '',
  ref_id: '',
};

const emptyOpsForm = {
  machine_chassis_no: '',
  note: '',
  reason_key_ids: [],
  started_at: '',
  ref_id: '',
};

const emptyOemClose = {
  resolution_note: '',
  resolution_key_ids: [],
  solved_by: 'INTERNAL',
  resolved_at: '',
};

const emptyOpsClose = {
  close_note: '',
  closed_at: '',
};

const toggleId = (list, id) => (
  list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
);

const pad2 = (n) => String(n).padStart(2, '0');

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${pad2(h)}:${pad2(m)}`;
  const hour12 = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? 'AM' : 'PM';
  return { value, label: `${hour12}:${pad2(m)} ${suffix}` };
});

const nearestSlot = (hhmm) => {
  const [hRaw, mRaw] = String(hhmm || '').split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '09:00';
  const rounded = Math.round((h * 60 + m) / 15) * 15;
  const wrap = ((rounded % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrap / 60))}:${pad2(wrap % 60)}`;
};

const splitDt = (value) => {
  if (!value) return { date: '', time: '' };
  const [date, rest = ''] = String(value).split('T');
  return { date: date.slice(0, 10), time: rest.slice(0, 5) };
};

const nowTime = () => {
  const d = new Date();
  return nearestSlot(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
};

const DateTimeField = ({ value, onChange, datePlaceholder = 'Select date' }) => {
  const { date, time } = splitDt(value);
  const selectedTime = time ? nearestSlot(time) : '';

  return (
    <div className="datetime-field">
      <DateField
        value={date}
        placeholder={datePlaceholder}
        onChange={(e) => {
          const nextDate = e.target.value;
          if (!nextDate) {
            onChange('');
            return;
          }
          onChange(`${nextDate}T${selectedTime || nowTime()}`);
        }}
      />
      <SearchableSelect
        value={selectedTime}
        placeholder="Time"
        onChange={(e) => {
          const nextTime = e.target.value;
          if (!nextTime) return;
          const d = new Date();
          const localDate = date || `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
          onChange(`${localDate}T${nextTime}`);
        }}
      >
        {TIME_SLOTS.map((slot) => (
          <option key={slot.value} value={slot.value}>{slot.label}</option>
        ))}
      </SearchableSelect>
    </div>
  );
};

const StatusPill = ({ status }) => {
  const value = status || '—';
  const open = String(status || '').toUpperCase() === 'OPEN';
  return (
    <span className={`badge-pill ${statusBadge(status)}`}>
      {open ? <span className="status-blink" aria-hidden /> : null}
      {value}
    </span>
  );
};

export const Breakdowns = () => {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('oem');
  const [machines, setMachines] = useState([]);
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({
    reason_keys: [],
    resolution_keys: [],
    severities: [],
    statuses: [],
    solved_by: [],
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [chassis, setChassis] = useState('');
  const [days, setDays] = useState(90);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [oemForm, setOemForm] = useState(emptyOemForm);
  const [opsForm, setOpsForm] = useState(emptyOpsForm);
  const [oemClose, setOemClose] = useState(emptyOemClose);
  const [opsClose, setOpsClose] = useState(emptyOpsClose);
  const [closingRow, setClosingRow] = useState(null);

  const isOem = tab === 'oem';
  const statusChips = isOem ? OEM_STATUSES : OPS_STATUSES;
  const accessibleMachines = useMemo(
    () => machines.filter((m) => String(m.machine_chassis_no || '').trim()),
    [machines]
  );

  const loadMachines = useCallback(() => {
    machineService.getAll({ page_size: 200 })
      .then((res) => setMachines(unwrapMachines(res)))
      .catch(() => setMachines([]));
  }, []);

  const loadOptions = useCallback((kind) => {
    const req = kind === 'oem' ? breakdownService.oemOptions() : breakdownService.opsOptions();
    req.then((data) => {
      setOptions({
        reason_keys: Array.isArray(data?.reason_keys) ? data.reason_keys : [],
        resolution_keys: Array.isArray(data?.resolution_keys) ? data.resolution_keys : [],
        severities: Array.isArray(data?.severities) ? data.severities : [],
        statuses: Array.isArray(data?.statuses) ? data.statuses : [],
        solved_by: Array.isArray(data?.solved_by) ? data.solved_by : [],
      });
    }).catch(() => {
      setOptions({ reason_keys: [], resolution_keys: [], severities: [], statuses: [], solved_by: [] });
    });
  }, []);

  const fetchRows = useCallback(() => {
    setLoading(true);
    setError('');
    const params = { status: 'all', days, limit: chassis ? 200 : 500 };
    if (chassis) params.machine_chassis_no = chassis;
    const req = isOem ? breakdownService.listOem(params) : breakdownService.listOps(params);
    req.then((payload) => {
      setRows(Array.isArray(payload.results) ? payload.results : []);
    }).catch((err) => {
      setRows([]);
      setError(err?.message || 'Could not load tickets.');
    }).finally(() => setLoading(false));
  }, [isOem, chassis, days]);

  useEffect(() => {
    loadMachines();
  }, [loadMachines]);

  useEffect(() => {
    setStatusFilter('ALL');
    setSearch('');
    setDetailRow(null);
    setRows([]);
    setLoading(true);
    loadOptions(tab);
  }, [tab, loadOptions]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const counts = useMemo(() => {
    const next = { ALL: rows.length };
    statusChips.forEach((chip) => {
      if (chip.value === 'ALL') return;
      next[chip.value] = rows.filter((row) => statusOf(row) === chip.value).length;
    });
    return next;
  }, [rows, statusChips]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && statusOf(row) !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.tt_number, row.id, row.reason, row.note, row.ref_id,
        row.machine_chassis_no, row.machine_name, row.model_name,
        row.vendor_name, row.site_name, row.severity,
        keyLabels(row.reason_keys, ''), keyLabels(row.resolution_keys, ''),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  const machineLabel = (rowOrChassis) => {
    const value = typeof rowOrChassis === 'string' ? rowOrChassis : rowOrChassis?.machine_chassis_no;
    const machine = accessibleMachines.find((m) => String(m.machine_chassis_no) === String(value));
    if (machine) {
      return `${machine.model_name || machine.name || 'HDD'} · ${machine.machine_chassis_no}`;
    }
    if (typeof rowOrChassis === 'object' && rowOrChassis) {
      return `${rowOrChassis.machine_name || rowOrChassis.model_name || 'HDD'} · ${rowOrChassis.machine_chassis_no || '—'}`;
    }
    return value || '—';
  };

  const openCreate = () => {
    setError('');
    if (isOem) {
      setOemForm({ ...emptyOemForm, machine_chassis_no: chassis });
    } else {
      setOpsForm({ ...emptyOpsForm, machine_chassis_no: chassis });
    }
    setCreateOpen(true);
  };

  const openClose = (row, event) => {
    event?.stopPropagation();
    setError('');
    setClosingRow(row);
    if (isOem) setOemClose(emptyOemClose);
    else setOpsClose(emptyOpsClose);
    setCloseOpen(true);
  };

  const handleCreate = (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const req = isOem
      ? breakdownService.createOem({
          machine_chassis_no: oemForm.machine_chassis_no,
          reason: oemForm.reason || undefined,
          reason_key_ids: oemForm.reason_key_ids,
          severity: oemForm.severity || undefined,
          occurred_at: toIso(oemForm.occurred_at),
          ref_id: oemForm.ref_id || undefined,
        })
      : breakdownService.createOps({
          machine_chassis_no: opsForm.machine_chassis_no,
          note: opsForm.note || undefined,
          reason_key_ids: opsForm.reason_key_ids,
          started_at: toIso(opsForm.started_at),
          ref_id: opsForm.ref_id || undefined,
        });

    req.then(() => {
      setCreateOpen(false);
      fetchRows();
    }).catch((err) => {
      setError(err?.message || 'Could not create the ticket.');
    }).finally(() => setSubmitting(false));
  };

  const handleClose = (event) => {
    event.preventDefault();
    if (!closingRow) return;
    setSubmitting(true);
    setError('');
    const req = isOem
      ? breakdownService.closeOem({
          breakdown_id: closingRow.id,
          machine_chassis_no: closingRow.machine_chassis_no,
          resolution_note: oemClose.resolution_note || undefined,
          resolution_key_ids: oemClose.resolution_key_ids,
          solved_by: oemClose.solved_by || undefined,
          resolved_at: toIso(oemClose.resolved_at),
        })
      : breakdownService.closeOps({
          ops_stop_id: closingRow.id,
          machine_chassis_no: closingRow.machine_chassis_no,
          close_note: opsClose.close_note,
          closed_at: toIso(opsClose.closed_at),
        });

    req.then(() => {
      setCloseOpen(false);
      setClosingRow(null);
      setDetailRow(null);
      fetchRows();
    }).catch((err) => {
      setError(err?.message || 'Could not close the ticket.');
    }).finally(() => setSubmitting(false));
  };

  const canClose = (row) => {
    const status = statusOf(row);
    return isOem ? status && status !== 'CLOSED' : status === 'OPEN';
  };

  return (
    <div className="screen-container">
      <PageHeader
        title="Breakdown Tickets & Repair History"
        subtitle="OEM breakdowns and internal Ops Stops, scoped to machines you can access"
        actions={
          <>
            <span className={`badge-pill ${isAdmin ? 'badge-neutral' : 'badge-maintenance'}`}>
              {isAdmin ? 'Admin · accessible machines' : 'Vendor scoped'}
            </span>
            <button type="button" className="btn-secondary" onClick={fetchRows}>
              <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </>
        }
      />

      <div className="breakdown-tab-row">
        <div className="seg-tabs" role="tablist" aria-label="Breakdown type">
          <button
            type="button"
            role="tab"
            aria-selected={isOem}
            className={`seg-tab ${isOem ? 'active' : ''}`}
            onClick={() => setTab('oem')}
          >
            OEM
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isOem}
            className={`seg-tab ${!isOem ? 'active' : ''}`}
            onClick={() => setTab('ops')}
          >
            Internal
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate} disabled={!accessibleMachines.length}>
          <LucidePlus size={14} /> {isOem ? 'Report breakdown' : 'Open Ops Stop'}
        </button>
      </div>

      <div className="page-toolbar">
        <div className="input-wrap" style={{ flex: 1, minWidth: 220 }}>
          <LucideSearch size={15} className="input-icon" />
          <input
            type="search"
            placeholder={isOem ? 'Search ticket, reason, chassis, or vendor' : 'Search Ops Stop, reason, chassis, or vendor'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <SearchableSelect value={chassis} onChange={(e) => setChassis(e.target.value)}>
          <option value="">All machines</option>
          {accessibleMachines.map((m) => (
            <option key={m.id || m.machine_chassis_no} value={m.machine_chassis_no}>
              {m.model_name || m.name || 'HDD'} · {m.machine_chassis_no}
              {m.site_name ? ` · ${m.site_name}` : ''}
            </option>
          ))}
        </SearchableSelect>
        <SearchableSelect value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="180">Last 180 days</option>
          <option value="365">Last 365 days</option>
        </SearchableSelect>
      </div>

      <div className="filter-row">
        {statusChips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={`filter-chip ${statusFilter === chip.value ? 'active' : ''}`}
            onClick={() => setStatusFilter(chip.value)}
          >
            {chip.label} {counts[chip.value] ?? 0}
            {chip.value === 'OPEN' && (counts.OPEN || 0) > 0 ? <span className="status-blink" aria-hidden /> : null}
          </button>
        ))}
      </div>

      {error && !createOpen && !closeOpen ? (
        <p className="page-subtitle" style={{ color: 'var(--danger)' }}>{error}</p>
      ) : null}

      {loading ? (
        <div className="empty-state">
          <h3>Loading tickets</h3>
          <p>Fetching {isOem ? 'OEM breakdowns' : 'Ops Stops'} from FiberForce.</p>
        </div>
      ) : !accessibleMachines.length ? (
        <EmptyState
          title="No machines in scope"
          subtitle="Breakdowns are chassis-scoped. Assign machines to this vendor to report or view tickets."
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={isOem ? 'No OEM breakdowns' : 'No Ops Stops'}
          subtitle={search || statusFilter !== 'ALL'
            ? 'Nothing matches this filter or search.'
            : isOem
              ? 'Report a breakdown against a machine you can access.'
              : 'Open an Ops Stop when a machine is held for operational reasons.'}
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Machine</th>
                <th>{isOem ? 'Reason' : 'Stop reason'}</th>
                {isOem ? <th>Severity</th> : null}
                <th>Status</th>
                <th>{isOem ? 'Occurred' : 'Started'}</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const ticket = row.tt_number || (isOem ? `BD-${row.id}` : `OS-${row.id}`);
                const when = isOem ? row.occurred_at : row.started_at;
                const duration = isOem ? row.downtime_minutes : row.duration_minutes;
                return (
                  <tr
                    key={`${tab}-${row.id}-${row.machine_chassis_no}`}
                    onClick={() => setDetailRow(row)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailRow(row); } }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <LucideWrench size={13} /> {ticket}
                      </div>
                      {row.ref_id ? <div className="page-subtitle">{row.ref_id}</div> : null}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.machine_name || row.model_name || 'HDD'}</div>
                      <div className="page-subtitle" style={{ fontFamily: 'var(--font-mono)' }}>{row.machine_chassis_no || '—'}</div>
                    </td>
                    <td>
                      <div>{keyLabels(row.reason_keys, isOem ? row.reason : row.note)}</div>
                      {row.vendor_name ? <div className="page-subtitle">{row.vendor_name}</div> : null}
                    </td>
                    {isOem ? (
                      <td>
                        <span className={`badge-pill ${severityBadge(row.severity)}`}>{row.severity || '—'}</span>
                      </td>
                    ) : null}
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                        <LucideClock size={13} /> {formatWhen(when)}
                      </span>
                    </td>
                    <td>{formatMinutes(duration)}</td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {canClose(row) ? (
                        <button type="button" className="btn-secondary" onClick={(e) => openClose(row, e)}>
                          Close
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)} role="presentation">
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} role="dialog">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{isOem ? 'Report OEM breakdown' : 'Open Ops Stop'}</h3>
              <button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)}><LucideX size={16} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error ? <p className="page-subtitle" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
              <div>
                <label className="field-label">Machine</label>
                <SearchableSelect
                  required
                  value={isOem ? oemForm.machine_chassis_no : opsForm.machine_chassis_no}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isOem) setOemForm((prev) => ({ ...prev, machine_chassis_no: value }));
                    else setOpsForm((prev) => ({ ...prev, machine_chassis_no: value }));
                  }}
                >
                  <option value="">Choose a machine</option>
                  {accessibleMachines.map((m) => (
                    <option key={m.id || m.machine_chassis_no} value={m.machine_chassis_no}>
                      {m.model_name || m.name || 'HDD'} · {m.machine_chassis_no}
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label className="field-label">Reason keys</label>
                <div className="filter-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
                  {options.reason_keys.map((key) => {
                    const selected = (isOem ? oemForm.reason_key_ids : opsForm.reason_key_ids).includes(key.id);
                    return (
                      <button
                        key={key.id}
                        type="button"
                        className={`filter-chip ${selected ? 'active' : ''}`}
                        onClick={() => {
                          if (isOem) setOemForm((prev) => ({ ...prev, reason_key_ids: toggleId(prev.reason_key_ids, key.id) }));
                          else setOpsForm((prev) => ({ ...prev, reason_key_ids: toggleId(prev.reason_key_ids, key.id) }));
                        }}
                      >
                        {key.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="field-label">{isOem ? 'Description' : 'Note'}</label>
                <textarea
                  placeholder={isOem ? 'Free-text details if needed' : 'Why the machine is stopped'}
                  value={isOem ? oemForm.reason : opsForm.note}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isOem) setOemForm((prev) => ({ ...prev, reason: value }));
                    else setOpsForm((prev) => ({ ...prev, note: value }));
                  }}
                />
              </div>

              {isOem ? (
                <div>
                  <label className="field-label">Severity</label>
                  <SearchableSelect
                    value={oemForm.severity}
                    onChange={(e) => setOemForm((prev) => ({ ...prev, severity: e.target.value }))}
                  >
                    {(options.severities.length ? options.severities : [
                      { value: 'LOW', label: 'Low' },
                      { value: 'MEDIUM', label: 'Medium' },
                      { value: 'HIGH', label: 'High' },
                      { value: 'CRITICAL', label: 'Critical' },
                    ]).map((item) => (
                      <option key={item.value} value={item.value}>{item.label || item.value}</option>
                    ))}
                  </SearchableSelect>
                  <p className="page-subtitle" style={{ marginTop: 6 }}>Ignored when reason keys are selected (highest key severity is used).</p>
                </div>
              ) : null}

              <div>
                <label className="field-label">{isOem ? 'Occurred at' : 'Started at'}</label>
                <DateTimeField
                  value={isOem ? oemForm.occurred_at : opsForm.started_at}
                  onChange={(next) => {
                    if (isOem) setOemForm((prev) => ({ ...prev, occurred_at: next }));
                    else setOpsForm((prev) => ({ ...prev, started_at: next }));
                  }}
                  datePlaceholder="Select date"
                />
              </div>
              <div>
                <label className="field-label">Your ticket id</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={isOem ? oemForm.ref_id : opsForm.ref_id}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isOem) setOemForm((prev) => ({ ...prev, ref_id: value }));
                    else setOpsForm((prev) => ({ ...prev, ref_id: value }));
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : (isOem ? 'Create breakdown' : 'Open Ops Stop')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {closeOpen && closingRow && (
        <div className="modal-overlay" onClick={() => setCloseOpen(false)} role="presentation">
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()} role="dialog">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                Close {closingRow.tt_number || (isOem ? `BD-${closingRow.id}` : `OS-${closingRow.id}`)}
              </h3>
              <button type="button" className="btn-ghost" onClick={() => setCloseOpen(false)}><LucideX size={16} /></button>
            </div>
            <form onSubmit={handleClose} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error ? <p className="page-subtitle" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
              <p className="page-subtitle" style={{ margin: 0 }}>{machineLabel(closingRow)}</p>

              {isOem ? (
                <>
                  <div>
                    <label className="field-label">Resolution keys</label>
                    <div className="filter-row" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
                      {options.resolution_keys.map((key) => {
                        const selected = oemClose.resolution_key_ids.includes(key.id);
                        return (
                          <button
                            key={key.id}
                            type="button"
                            className={`filter-chip ${selected ? 'active' : ''}`}
                            onClick={() => setOemClose((prev) => ({ ...prev, resolution_key_ids: toggleId(prev.resolution_key_ids, key.id) }))}
                          >
                            {key.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Resolution note</label>
                    <textarea
                      placeholder="What was done"
                      value={oemClose.resolution_note}
                      onChange={(e) => setOemClose((prev) => ({ ...prev, resolution_note: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Solved by</label>
                    <SearchableSelect
                      value={oemClose.solved_by}
                      onChange={(e) => setOemClose((prev) => ({ ...prev, solved_by: e.target.value }))}
                    >
                      {(options.solved_by.length ? options.solved_by : [
                        { value: 'INTERNAL', label: 'Internal' },
                        { value: 'EXTERNAL', label: 'External' },
                        { value: 'OEM', label: 'OEM' },
                      ]).map((item) => (
                        <option key={item.value} value={item.value}>{item.label || item.value}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                  <div>
                    <label className="field-label">Resolved at</label>
                    <DateTimeField
                      value={oemClose.resolved_at}
                      onChange={(next) => setOemClose((prev) => ({ ...prev, resolved_at: next }))}
                      datePlaceholder="Select date"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="field-label">Close note</label>
                    <textarea
                      required
                      placeholder="Why / how the stop ended"
                      value={opsClose.close_note}
                      onChange={(e) => setOpsClose((prev) => ({ ...prev, close_note: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Closed at</label>
                    <DateTimeField
                      value={opsClose.closed_at}
                      onChange={(next) => setOpsClose((prev) => ({ ...prev, closed_at: next }))}
                      datePlaceholder="Select date"
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={() => setCloseOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Closing…' : 'Close ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailRow && (
        <div className="modal-overlay" onClick={() => setDetailRow(null)} role="presentation">
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} role="dialog">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{detailRow.tt_number || (isOem ? `BD-${detailRow.id}` : `OS-${detailRow.id}`)}</h3>
                <p className="page-subtitle" style={{ margin: '4px 0 0' }}>{machineLabel(detailRow)}</p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setDetailRow(null)}><LucideX size={16} /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatusPill status={detailRow.status} />
                {isOem && detailRow.severity ? (
                  <span className={`badge-pill ${severityBadge(detailRow.severity)}`}>{detailRow.severity}</span>
                ) : null}
              </div>
              <div><strong>Reason:</strong> {keyLabels(detailRow.reason_keys, isOem ? detailRow.reason : detailRow.note)}</div>
              {isOem && detailRow.resolution_note ? <div><strong>Resolution:</strong> {detailRow.resolution_note}</div> : null}
              {isOem && detailRow.resolution_keys?.length ? <div><strong>Resolution keys:</strong> {keyLabels(detailRow.resolution_keys)}</div> : null}
              {!isOem && detailRow.close_note ? <div><strong>Close note:</strong> {detailRow.close_note}</div> : null}
              {detailRow.solved_by ? <div><strong>Solved by:</strong> {detailRow.solved_by}</div> : null}
              {detailRow.ref_id ? <div><strong>Ref:</strong> {detailRow.ref_id}</div> : null}
              <div><strong>{isOem ? 'Occurred' : 'Started'}:</strong> {formatWhen(isOem ? detailRow.occurred_at : detailRow.started_at)}</div>
              <div><strong>Duration:</strong> {formatMinutes(isOem ? detailRow.downtime_minutes : detailRow.duration_minutes)}</div>
              {isOem ? (
                <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                  <div className="page-subtitle">OEM timeline</div>
                  <div>Seen: {formatWhen(detailRow.seen_at)} {detailRow.seen_by ? `· ${detailRow.seen_by}` : ''}</div>
                  <div>Accepted: {formatWhen(detailRow.accepted_at)} {detailRow.accepted_by ? `· ${detailRow.accepted_by}` : ''}</div>
                  <div>Resolved: {formatWhen(detailRow.resolved_at)}</div>
                  <div>Closed by: {detailRow.closed_by || '—'}</div>
                  <div>Time to see: {formatMinutes(detailRow.time_to_see_minutes)}</div>
                  <div>Time to response: {formatMinutes(detailRow.time_to_response_minutes)}</div>
                  <div>Time to restore: {formatMinutes(detailRow.time_to_restore_minutes)}</div>
                </div>
              ) : (
                <div>Closed: {formatWhen(detailRow.closed_at)} {detailRow.closed_by ? `· ${detailRow.closed_by}` : ''}</div>
              )}
              {canClose(detailRow) ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn-primary" onClick={(e) => { setDetailRow(null); openClose(detailRow, e); }}>
                    Close ticket
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
