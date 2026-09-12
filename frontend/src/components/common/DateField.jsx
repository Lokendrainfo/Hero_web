import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LucideCalendar, LucideChevronLeft, LucideChevronRight } from 'lucide-react';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');
const toYMD = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const toYM = (y, m) => `${y}-${pad(m)}`;

const parseValue = (value, mode) => {
  if (!value) return null;
  const parts = String(value).split('-').map(Number);
  if (!parts[0] || !parts[1]) return null;
  return {
    y: parts[0],
    m: parts[1],
    d: mode === 'month' ? 1 : (parts[2] || 1),
  };
};

const todayParts = () => {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
};

const monthGrid = (y, m) => {
  const first = new Date(y, m - 1, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(y, m - 1, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    return {
      y: dt.getFullYear(),
      m: dt.getMonth() + 1,
      d: dt.getDate(),
      inMonth: dt.getMonth() === m - 1,
    };
  });
};

const formatDisplay = (value, mode, placeholder) => {
  const parsed = parseValue(value, mode);
  if (!parsed) return placeholder;
  if (mode === 'month') return `${MONTHS_FULL[parsed.m - 1]} ${parsed.y}`;
  return `${parsed.d} ${MONTHS[parsed.m - 1]} ${parsed.y}`;
};

const emitChange = (onChange, value, name, id) => {
  if (!onChange) return;
  onChange({
    target: { value, name, id },
    currentTarget: { value, name, id },
  });
};

export const DateField = ({
  value = '',
  onChange,
  mode = 'date',
  placeholder,
  className = '',
  style,
  disabled = false,
  required = false,
  name,
  id,
  'aria-label': ariaLabel,
}) => {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const selected = useMemo(() => parseValue(value, mode), [value, mode]);
  const today = todayParts();
  const [cursor, setCursor] = useState(() => selected || today);

  useEffect(() => {
    if (open) setCursor(selected || todayParts());
  }, [open, selected]);

  const placeMenu = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 292;
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const openUp = spaceBelow < 320 && r.top > spaceBelow;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setMenuPos({
      top: openUp ? undefined : r.bottom + gap,
      bottom: openUp ? window.innerHeight - r.top + gap : undefined,
      left,
      width,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    placeMenu();
    const onWin = () => placeMenu();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('.date-field-menu')) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pickDay = (cell) => {
    emitChange(onChange, toYMD(cell.y, cell.m, cell.d), name, id);
    setOpen(false);
  };

  const pickMonth = (m) => {
    emitChange(onChange, toYM(cursor.y, m), name, id);
    setOpen(false);
  };

  const jumpToday = () => {
    const t = todayParts();
    emitChange(onChange, mode === 'month' ? toYM(t.y, t.m) : toYMD(t.y, t.m, t.d), name, id);
    setOpen(false);
  };

  const clearValue = () => {
    emitChange(onChange, '', name, id);
    setOpen(false);
  };

  const shiftCursor = (delta) => {
    setCursor((prev) => {
      if (mode === 'month') return { ...prev, y: prev.y + delta };
      const dt = new Date(prev.y, prev.m - 1 + delta, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: 1 };
    });
  };

  const {
    width,
    minWidth,
    maxWidth,
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    ...triggerStyle
  } = style || {};

  const label = formatDisplay(value, mode, placeholder || (mode === 'month' ? 'Select month' : 'Select date'));
  const cells = monthGrid(cursor.y, cursor.m);

  const menu = open && menuPos && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="date-field-menu"
        style={{ top: menuPos.top, bottom: menuPos.bottom, left: menuPos.left, width: menuPos.width }}
        role="dialog"
        aria-label={ariaLabel || placeholder || 'Choose date'}
      >
        <div className="date-field-nav">
          <button type="button" className="date-field-nav-btn" onClick={() => shiftCursor(-1)} aria-label="Previous">
            <LucideChevronLeft size={16} />
          </button>
          <div className="date-field-nav-label">
            {mode === 'month' ? cursor.y : `${MONTHS_FULL[cursor.m - 1]} ${cursor.y}`}
          </div>
          <button type="button" className="date-field-nav-btn" onClick={() => shiftCursor(1)} aria-label="Next">
            <LucideChevronRight size={16} />
          </button>
        </div>

        {mode === 'month' ? (
          <div className="date-field-months">
            {MONTHS.map((labelText, idx) => {
              const m = idx + 1;
              const isSelected = selected && selected.y === cursor.y && selected.m === m;
              const isToday = today.y === cursor.y && today.m === m;
              return (
                <button
                  key={labelText}
                  type="button"
                  className={`date-field-month${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  onClick={() => pickMonth(m)}
                >
                  {labelText}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="date-field-weekdays">
              {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="date-field-grid">
              {cells.map((cell) => {
                const key = toYMD(cell.y, cell.m, cell.d);
                const isSelected = selected && selected.y === cell.y && selected.m === cell.m && selected.d === cell.d;
                const isToday = today.y === cell.y && today.m === cell.m && today.d === cell.d;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`date-field-day${cell.inMonth ? '' : ' is-outside'}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                    onClick={() => pickDay(cell)}
                  >
                    {cell.d}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="date-field-footer">
          <button type="button" className="date-field-link" onClick={jumpToday}>
            {mode === 'month' ? 'This month' : 'Today'}
          </button>
          {!required && (
            <button type="button" className="date-field-link" onClick={clearValue}>
              Clear
            </button>
          )}
        </div>
      </div>,
      document.body
    )
    : null;

  return (
    <div
      ref={rootRef}
      className={`date-field ${className}`.trim()}
      style={{ width, minWidth, maxWidth, flex, flexGrow, flexShrink, flexBasis, alignSelf }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="date-field-trigger"
        style={triggerStyle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || placeholder || (mode === 'month' ? 'Select month' : 'Select date')}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <LucideCalendar size={14} />
        <span className={`date-field-value${value ? '' : ' is-placeholder'}`}>{label}</span>
      </button>
      {menu}
      {required && (
        <input
          tabIndex={-1}
          required
          value={value || ''}
          onChange={() => {}}
          className="date-field-required"
          aria-hidden="true"
        />
      )}
    </div>
  );
};
