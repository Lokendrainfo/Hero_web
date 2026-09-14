import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LucideCheck, LucideChevronDown, LucideSearch } from 'lucide-react';

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf(node.props.children);
  return '';
};

const optionsFromChildren = (children) => {
  const list = [];
  const walk = (nodes) => {
    React.Children.forEach(nodes, (child) => {
      if (!child) return;
      if (Array.isArray(child)) {
        walk(child);
        return;
      }
      if (!React.isValidElement(child)) return;
      if (child.type === React.Fragment && child.props?.children) {
        walk(child.props.children);
        return;
      }
      list.push({
        value: child.props?.value === undefined || child.props?.value === null ? '' : String(child.props.value),
        label: textOf(child.props?.children) || String(child.props?.value ?? ''),
        disabled: Boolean(child.props?.disabled)
      });
    });
  };
  walk(children);
  return list;
};

const emitChange = (onChange, value, name, id) => {
  if (!onChange) return;
  onChange({
    target: { value, name, id },
    currentTarget: { value, name, id }
  });
};

export const SearchableSelect = ({
  value,
  onChange,
  children,
  options,
  className = '',
  style,
  disabled = false,
  placeholder = 'Select',
  searchPlaceholder = 'Search…',
  title,
  name,
  id,
  'aria-label': ariaLabel
}) => {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPos, setMenuPos] = useState(null);

  const parsed = useMemo(
    () => (Array.isArray(options) && options.length ? options.map((o) => ({
      value: o.value === undefined || o.value === null ? '' : String(o.value),
      label: String(o.label ?? o.value ?? ''),
      disabled: Boolean(o.disabled)
    })) : optionsFromChildren(children)),
    [children, options]
  );

  const currentValue = value === undefined || value === null ? '' : String(value);
  const selected = parsed.find((o) => o.value === currentValue);
  const selectedLabel = selected?.label || placeholder;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parsed;
    return parsed.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [parsed, query]);

  const placeMenu = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 240);
    const maxH = 280;
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const openUp = spaceBelow < 180 && r.top > spaceBelow;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setMenuPos({
      top: openUp ? undefined : r.bottom + gap,
      bottom: openUp ? window.innerHeight - r.top + gap : undefined,
      left,
      width,
      maxHeight: Math.min(maxH, openUp ? r.top - 12 : spaceBelow)
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    placeMenu();
    const onWin = () => placeMenu();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
      window.clearTimeout(t);
    };
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (e.target?.closest?.('.search-select-menu')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    } else {
      const idx = filtered.findIndex((o) => o.value === currentValue);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, filtered]);

  const pick = (opt) => {
    if (!opt || opt.disabled) return;
    emitChange(onChange, opt.value, name, id);
    setOpen(false);
  };

  const onTriggerKey = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onSearchKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(filtered[activeIndex]);
    }
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
  const rootStyle = {
    width,
    minWidth,
    maxWidth,
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf
  };

  const menu = open && menuPos && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="search-select-menu"
        style={{
          top: menuPos.top,
          bottom: menuPos.bottom,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight
        }}
        role="listbox"
        aria-label={ariaLabel || title || placeholder}
      >
        <div className="search-select-search-wrap">
          <LucideSearch size={14} />
          <input
            ref={searchRef}
            className="search-select-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKey}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        <div className="search-select-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="search-select-empty">No matches</div>
          ) : filtered.map((opt, idx) => {
            const isSelected = opt.value === currentValue;
            const isActive = idx === activeIndex;
            return (
              <button
                key={`${opt.value}-${idx}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={isActive || undefined}
                disabled={opt.disabled}
                className={`search-select-option${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => pick(opt)}
              >
                <span>{opt.label}</span>
                {isSelected ? <LucideCheck size={13} /> : null}
              </button>
            );
          })}
        </div>
      </div>,
      document.body
    )
    : null;

  return (
    <div ref={rootRef} className={`search-select ${className}`.trim()} style={rootStyle}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel || title || selectedLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="search-select-trigger"
        style={triggerStyle}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className={`search-select-label${selected ? '' : ' is-placeholder'}`}>{selectedLabel}</span>
        <LucideChevronDown size={14} className={`search-select-caret${open ? ' is-open' : ''}`} />
      </button>
      {menu}
    </div>
  );
};

export const Select = SearchableSelect;
export default SearchableSelect;
