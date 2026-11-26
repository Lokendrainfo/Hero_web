import React from 'react';
import { LucideCalendar, LucidePlus, LucideTrash2 } from 'lucide-react';

export const SCHEDULE_FREQUENCY_OPTIONS = [
  { code: 'DAILY', label: 'Daily' },
  { code: 'WEEKLY', label: 'Weekly' },
  { code: 'EVERY_15_DAYS', label: 'Every 15 Days' },
  { code: 'MONTHLY', label: 'Monthly' },
  { code: 'QUARTERLY', label: 'Quarterly' },
  { code: 'YEARLY', label: 'Yearly' },
];

export const WEEKDAY_OPTIONS = [
  { key: 'MONDAY', label: 'Monday', short: 'Mon' },
  { key: 'TUESDAY', label: 'Tuesday', short: 'Tue' },
  { key: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' },
  { key: 'THURSDAY', label: 'Thursday', short: 'Thu' },
  { key: 'FRIDAY', label: 'Friday', short: 'Fri' },
  { key: 'SATURDAY', label: 'Saturday', short: 'Sat' },
  { key: 'SUNDAY', label: 'Sunday', short: 'Sun' },
];

export const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const MAX_DAYS_BY_MONTH = {
  1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
  7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
};

const QUICK_MONTHLY_DATES = [
  { value: 1, label: '1st' },
  { value: 5, label: '5th' },
  { value: 10, label: '10th' },
  { value: 15, label: '15th' },
  { value: 20, label: '20th' },
  { value: 25, label: '25th' },
  { value: 'LAST', label: 'Last day of month' },
];

const ALL_MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export const createDefaultScheduleForFrequency = (freqCode) => {
  const code = String(freqCode || '').toUpperCase();
  if (code === 'DAILY') {
    return {
      frequency_type: 'DAILY',
      schedule_type: 'DAILY_EVERY_DAY',
      is_active: true,
    };
  }
  if (code === 'WEEKLY') {
    return {
      frequency_type: 'WEEKLY',
      schedule_type: 'WEEKLY_DAYS',
      selected_weekdays: ['MONDAY'],
      allow_duplicate_in_same_slot: false,
      is_active: true,
    };
  }
  if (code === 'EVERY_15_DAYS') {
    return {
      frequency_type: 'EVERY_15_DAYS',
      schedule_type: 'TWICE_MONTHLY_DATES',
      start_date: '',
      repeat_interval: 15,
      selected_dates: [1, 16],
      first_date: 1,
      second_date: 16,
      use_last_day_fallback: true,
      allow_duplicate_in_same_slot: false,
      is_active: true,
    };
  }
  if (code === 'MONTHLY') {
    return {
      frequency_type: 'MONTHLY',
      schedule_type: 'MONTHLY_DATES',
      selected_dates: [1],
      use_last_day_fallback: true,
      allow_duplicate_in_same_slot: false,
      is_active: true,
    };
  }
  if (code === 'QUARTERLY') {
    return {
      frequency_type: 'QUARTERLY',
      schedule_type: 'QUARTERLY_DATES',
      quarter_start_month: 1,
      repeat_interval: 3,
      quarter_dates: [15],
      use_last_day_fallback: true,
      allow_duplicate_in_same_slot: false,
      is_active: true,
    };
  }
  if (code === 'YEARLY') {
    return {
      frequency_type: 'YEARLY',
      schedule_type: 'YEARLY_DATES',
      yearly_schedules: [{ month: 1, day: 15 }],
      use_last_day_fallback: true,
      allow_duplicate_in_same_slot: false,
      is_active: true,
    };
  }
  return { frequency_type: code, schedule_type: 'DEFAULT', is_active: true };
};

export const hydrateScheduleFromApi = (freqCode, apiSched) => {
  const base = createDefaultScheduleForFrequency(freqCode);
  if (!apiSched || apiSched.schedule_type === 'DEFAULT') {
    return base;
  }
  const selDates = Array.isArray(apiSched.selected_dates) ? apiSched.selected_dates : base.selected_dates || [];
  if (String(freqCode || '').toUpperCase() === 'DAILY') {
    return base;
  }
  return {
    ...base,
    ...apiSched,
    start_date: apiSched.start_date || '',
    selected_weekdays: Array.isArray(apiSched.selected_weekdays) ? apiSched.selected_weekdays : base.selected_weekdays || [],
    selected_dates: selDates,
    first_date: selDates[0] ?? 1,
    second_date: selDates[1] ?? 16,
    quarter_start_month: apiSched.quarter_start_month ?? 1,
    quarter_dates: Array.isArray(apiSched.quarter_dates) && apiSched.quarter_dates.length > 0 ? apiSched.quarter_dates : selDates,
    repeat_interval: apiSched.repeat_interval ?? base.repeat_interval,
    yearly_schedules:
      Array.isArray(apiSched.yearly_schedules) && apiSched.yearly_schedules.length > 0
        ? apiSched.yearly_schedules
        : base.yearly_schedules || [],
    use_last_day_fallback: apiSched.use_last_day_fallback !== false,
    allow_duplicate_in_same_slot: Boolean(apiSched.allow_duplicate_in_same_slot),
  };
};

export const serializeSchedulePayload = (freqCode, sched) => {
  const s = sched || createDefaultScheduleForFrequency(freqCode);
  const code = String(freqCode || '').toUpperCase();
  if (code === 'DAILY') {
    return {
      frequency_type: 'DAILY',
      schedule_type: 'DAILY_EVERY_DAY',
      repeat_interval: 1,
      is_active: true,
    };
  }
  const common = {
    frequency_type: code,
    schedule_type: s.schedule_type,
    use_last_day_fallback: s.use_last_day_fallback !== false,
    allow_duplicate_in_same_slot: Boolean(s.allow_duplicate_in_same_slot),
    is_active: s.is_active !== false,
  };
  if (code === 'WEEKLY') {
    return { ...common, schedule_type: 'WEEKLY_DAYS', selected_weekdays: s.selected_weekdays || [] };
  }
  if (code === 'EVERY_15_DAYS') {
    if (s.schedule_type === 'INTERVAL_15_DAYS') {
      return {
        ...common,
        schedule_type: 'INTERVAL_15_DAYS',
        start_date: s.start_date || null,
        repeat_interval: Number(s.repeat_interval || 15),
      };
    }
    return {
      ...common,
      schedule_type: 'TWICE_MONTHLY_DATES',
      selected_dates: [
        s.first_date === 'LAST' ? 'LAST' : Number(s.first_date || 1),
        s.second_date === 'LAST' ? 'LAST' : Number(s.second_date || 16),
      ],
    };
  }
  if (code === 'MONTHLY') {
    return { ...common, schedule_type: 'MONTHLY_DATES', selected_dates: s.selected_dates || [] };
  }
  if (code === 'QUARTERLY') {
    return {
      ...common,
      schedule_type: 'QUARTERLY_DATES',
      quarter_start_month: Number(s.quarter_start_month || 1),
      repeat_interval: Number(s.repeat_interval || 3),
      quarter_dates: s.quarter_dates || [],
    };
  }
  if (code === 'YEARLY') {
    return {
      ...common,
      schedule_type: 'YEARLY_DATES',
      yearly_schedules: (s.yearly_schedules || []).map((row) => ({
        month: Number(row.month || 1),
        day: row.day === 'LAST' ? 'LAST' : Number(row.day || 1),
      })),
    };
  }
  return common;
};

export const validateScheduleClient = (freqCode, s) => {
  const code = String(freqCode || '').toUpperCase();
  if (!s) return `Configure schedule for ${code}.`;
  if (code === 'WEEKLY') {
    if (!s.selected_weekdays || s.selected_weekdays.length === 0) {
      return 'Weekly: Select at least one day of the week.';
    }
  } else if (code === 'EVERY_15_DAYS') {
    if (s.schedule_type === 'INTERVAL_15_DAYS') {
      if (!s.start_date) return 'Every 15 Days: Select a Start Date.';
      const iv = Number(s.repeat_interval);
      if (!iv || iv < 1 || iv > 365) return 'Every 15 Days: Repeat Interval must be between 1 and 365 days.';
    } else {
      const d1 = s.first_date === 'LAST' ? 'LAST' : Number(s.first_date);
      const d2 = s.second_date === 'LAST' ? 'LAST' : Number(s.second_date);
      if (!d1 || !d2) return 'Every 15 Days: Select both First Date and Second Date.';
      if (String(d1) === String(d2)) return 'Every 15 Days: First Date and Second Date must be different.';
    }
  } else if (code === 'MONTHLY') {
    if (!s.selected_dates || s.selected_dates.length === 0) {
      return 'Monthly: Select at least one calendar date or Last day of month.';
    }
  } else if (code === 'QUARTERLY') {
    if (!s.quarter_dates || s.quarter_dates.length === 0) {
      return 'Quarterly: Select at least one maintenance date.';
    }
    const qInt = Number(s.repeat_interval || 3);
    if (!qInt || qInt < 1 || qInt > 12) return 'Quarterly: Repeat interval must be between 1 and 12 months.';
  } else if (code === 'YEARLY') {
    if (!s.yearly_schedules || s.yearly_schedules.length === 0) {
      return 'Yearly: Add at least one month & date schedule.';
    }
    const seen = new Set();
    for (let i = 0; i < s.yearly_schedules.length; i += 1) {
      const r = s.yearly_schedules[i];
      const m = Number(r.month);
      if (r.day !== 'LAST') {
        const d = Number(r.day);
        const maxD = MAX_DAYS_BY_MONTH[m] || 31;
        if (d < 1 || d > maxD) {
          const mName = MONTH_OPTIONS.find((x) => x.value === m)?.label || `Month ${m}`;
          return `Yearly schedule #${i + 1}: ${mName} cannot have day ${d}.`;
        }
      }
      const key = `${m}-${r.day}`;
      if (seen.has(key)) return 'Yearly: Duplicate schedule dates are not allowed.';
      seen.add(key);
    }
  }
  return null;
};

const smallInputStyle = {
  height: '32px',
  padding: '0 8px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  fontSize: '0.78rem',
  background: '#fff',
};

const subLabelStyle = {
  fontSize: '0.74rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  display: 'block',
  marginBottom: '4px',
};

const renderDateGrid = (selectedDates = [], onToggleDate) => {
  const selSet = new Set(selectedDates.map((d) => String(d)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {QUICK_MONTHLY_DATES.map((qd) => {
          const active = selSet.has(String(qd.value));
          return (
            <button
              key={`quick-${qd.value}`}
              type="button"
              onClick={() => onToggleDate(qd.value)}
              style={{
                padding: '4px 10px',
                borderRadius: '14px',
                border: active ? '1.5px solid #2563eb' : '1px solid var(--border-strong)',
                background: active ? '#dbeafe' : '#fff',
                color: active ? '#1e40af' : 'var(--text-primary)',
                fontSize: '0.74rem',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {qd.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))', gap: '4px', maxWidth: '480px' }}>
        {ALL_MONTH_DAYS.map((day) => {
          const active = selSet.has(String(day));
          return (
            <button
              key={`day-${day}`}
              type="button"
              onClick={() => onToggleDate(day)}
              style={{
                height: '28px',
                borderRadius: '4px',
                border: active ? '1.5px solid #2563eb' : '1px solid var(--border)',
                background: active ? '#2563eb' : '#fff',
                color: active ? '#fff' : 'var(--text-primary)',
                fontSize: '0.73rem',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const PmFrequencyScheduleEditor = ({ freqCode, freqLabel, schedule, onChange }) => {
  const s = schedule || createDefaultScheduleForFrequency(freqCode);
  const update = (patch) => onChange(freqCode, { ...s, ...patch });

  const toggleDateInList = (field, tok) => {
    const list = Array.isArray(s[field]) ? s[field] : [];
    const normTok = tok === 'LAST' ? 'LAST' : Number(tok);
    const exists = list.some((x) => String(x) === String(normTok));
    const next = exists
      ? list.filter((x) => String(x) !== String(normTok))
      : [...list, normTok].sort((a, b) => (a === 'LAST' ? 99 : b === 'LAST' ? -99 : Number(a) - Number(b)));
    update({ [field]: next });
  };

  const toggleWeekday = (wdKey) => {
    const cur = Array.isArray(s.selected_weekdays) ? s.selected_weekdays : [];
    const exists = cur.includes(wdKey);
    const next = exists ? cur.filter((k) => k !== wdKey) : [...cur, wdKey];
    update({ selected_weekdays: next });
  };

  const quarterMonthsPreview = () => {
    const startM = Number(s.quarter_start_month || 1);
    const step = Math.max(1, Number(s.repeat_interval || 3));
    const names = [];
    for (let k = 0; k < 4; k += 1) {
      const m = ((startM - 1 + k * step) % 12) + 1;
      const lbl = MONTH_OPTIONS.find((x) => x.value === m)?.label;
      if (lbl && !names.includes(lbl)) names.push(lbl);
    }
    return names.join(', ');
  };

  if (freqCode === 'DAILY') {
    return (
      <div
        style={{
          padding: '10px 14px',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius)',
          background: '#f8fafc',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#1e3a8a',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <LucideCalendar size={15} />
        <span>Maintenance is required every calendar day.</span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px',
        border: '1px solid #bfdbfe',
        borderRadius: 'var(--radius)',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#1e3a8a' }}>
          <LucideCalendar size={14} /> {freqLabel} Schedule Configuration
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(s.allow_duplicate_in_same_slot)}
            onChange={(e) => update({ allow_duplicate_in_same_slot: e.target.checked })}
          />
          Allow multiple completions in same scheduled window
        </label>
      </div>

      {/* B. WEEKLY */}
      {freqCode === 'WEEKLY' && (
        <div>
          <label style={subLabelStyle}>Select Days of Week *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {WEEKDAY_OPTIONS.map((wd) => {
              const active = (s.selected_weekdays || []).includes(wd.key);
              return (
                <label
                  key={wd.key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 10px',
                    borderRadius: 'var(--radius)',
                    border: active ? '1.5px solid #2563eb' : '1px solid var(--border-strong)',
                    background: active ? '#dbeafe' : '#fff',
                    fontSize: '0.78rem',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleWeekday(wd.key)}
                  />
                  {wd.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* C. EVERY 15 DAYS */}
      {freqCode === 'EVERY_15_DAYS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            {[
              { value: 'INTERVAL_15_DAYS', label: 'Every 15 days from start date' },
              { value: 'TWICE_MONTHLY_DATES', label: 'Twice per month using selected calendar dates' },
            ].map((opt) => (
              <label key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.79rem', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="every15_schedule_type"
                  checked={s.schedule_type === opt.value}
                  onChange={() => update({ schedule_type: opt.value })}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {s.schedule_type === 'INTERVAL_15_DAYS' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', maxWidth: '460px' }}>
              <div>
                <label style={subLabelStyle}>Start Date *</label>
                <input
                  type="date"
                  value={s.start_date || ''}
                  onChange={(e) => update({ start_date: e.target.value })}
                  style={{ ...smallInputStyle, width: '100%' }}
                />
              </div>
              <div>
                <label style={subLabelStyle}>Repeat Interval (Days) *</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={s.repeat_interval ?? 15}
                  onChange={(e) => update({ repeat_interval: e.target.value })}
                  style={{ ...smallInputStyle, width: '100%' }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', maxWidth: '460px' }}>
                <div>
                  <label style={subLabelStyle}>First Date *</label>
                  <select
                    value={String(s.first_date ?? 1)}
                    onChange={(e) => update({ first_date: e.target.value === 'LAST' ? 'LAST' : Number(e.target.value) })}
                    style={{ ...smallInputStyle, width: '100%' }}
                  >
                    {ALL_MONTH_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value="LAST">Last day of month</option>
                  </select>
                </div>
                <div>
                  <label style={subLabelStyle}>Second Date *</label>
                  <select
                    value={String(s.second_date ?? 16)}
                    onChange={(e) => update({ second_date: e.target.value === 'LAST' ? 'LAST' : Number(e.target.value) })}
                    style={{ ...smallInputStyle, width: '100%' }}
                  >
                    {ALL_MONTH_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value="LAST">Last day of month</option>
                  </select>
                </div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={s.use_last_day_fallback !== false}
                  onChange={(e) => update({ use_last_day_fallback: e.target.checked })}
                />
                Use Last Day of Month if selected date does not exist in shorter months
              </label>
            </div>
          )}
        </div>
      )}

      {/* D. MONTHLY */}
      {freqCode === 'MONTHLY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={subLabelStyle}>Select Maintenance Dates (1–31 or Last Day of Month) *</label>
          {renderDateGrid(s.selected_dates || [], (tok) => toggleDateInList('selected_dates', tok))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={s.use_last_day_fallback !== false}
              onChange={(e) => update({ use_last_day_fallback: e.target.checked })}
            />
            Handle months with fewer than 31 days using Last Day of Month rule
          </label>
        </div>
      )}

      {/* E. QUARTERLY */}
      {freqCode === 'QUARTERLY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', maxWidth: '520px' }}>
            <div>
              <label style={subLabelStyle}>Quarter Start Month *</label>
              <select
                value={Number(s.quarter_start_month || 1)}
                onChange={(e) => update({ quarter_start_month: Number(e.target.value) })}
                style={{ ...smallInputStyle, width: '100%' }}
              >
                {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label style={subLabelStyle}>Repeat Every (Months) *</label>
              <input
                type="number"
                min={1}
                max={12}
                value={s.repeat_interval ?? 3}
                onChange={(e) => update({ repeat_interval: e.target.value })}
                style={{ ...smallInputStyle, width: '100%' }}
              />
            </div>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#1e40af', fontWeight: 600 }}>
            Active Quarter Months: {quarterMonthsPreview()}
          </div>
          <div>
            <label style={subLabelStyle}>Maintenance Dates (Multiple optional dates allowed) *</label>
            {renderDateGrid(s.quarter_dates || [], (tok) => toggleDateInList('quarter_dates', tok))}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={s.use_last_day_fallback !== false}
              onChange={(e) => update({ use_last_day_fallback: e.target.checked })}
            />
            Handle shorter quarter months using Last Day of Month rule
          </label>
        </div>
      )}

      {/* F. YEARLY */}
      {freqCode === 'YEARLY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ ...subLabelStyle, marginBottom: 0 }}>Yearly Schedules (Month &amp; Date) *</label>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.74rem', padding: '4px 9px' }}
              onClick={() => update({ yearly_schedules: [...(s.yearly_schedules || []), { month: 1, day: 1 }] })}
            >
              <LucidePlus size={12} /> + Add Yearly Date
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(s.yearly_schedules || []).map((row, rIdx) => {
              const mNum = Number(row.month || 1);
              const maxD = MAX_DAYS_BY_MONTH[mNum] || 31;
              return (
                <div key={`yr-${rIdx}`} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={mNum}
                    onChange={(e) => {
                      const nextM = Number(e.target.value);
                      const capD = MAX_DAYS_BY_MONTH[nextM] || 31;
                      const curDay = row.day === 'LAST' ? 'LAST' : Math.min(Number(row.day || 1), capD);
                      const nextList = (s.yearly_schedules || []).map((item, idx) =>
                        idx === rIdx ? { month: nextM, day: curDay } : item
                      );
                      update({ yearly_schedules: nextList });
                    }}
                    style={{ ...smallInputStyle, minWidth: '150px' }}
                  >
                    {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select
                    value={String(row.day)}
                    onChange={(e) => {
                      const val = e.target.value === 'LAST' ? 'LAST' : Number(e.target.value);
                      const nextList = (s.yearly_schedules || []).map((item, idx) =>
                        idx === rIdx ? { ...item, day: val } : item
                      );
                      update({ yearly_schedules: nextList });
                    }}
                    style={{ ...smallInputStyle, minWidth: '120px' }}
                  >
                    {Array.from({ length: maxD }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    <option value="LAST">Last day of month</option>
                  </select>
                  {(s.yearly_schedules || []).length > 1 && (
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                      onClick={() => update({ yearly_schedules: (s.yearly_schedules || []).filter((_, idx) => idx !== rIdx) })}
                    >
                      <LucideTrash2 size={12} /> Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={s.use_last_day_fallback !== false}
              onChange={(e) => update({ use_last_day_fallback: e.target.checked })}
            />
            In non-leap years, map Feb 29 schedules to Feb 28 (uncheck to skip until next leap year)
          </label>
        </div>
      )}
    </div>
  );
};
