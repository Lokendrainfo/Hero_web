import React, { useEffect, useState } from 'react';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const BarChart = ({ items = [], maxValue, animate = true }) => {
  const rows = items.filter((i) => i && i.label != null);
  const max = maxValue || Math.max(1, ...rows.map((i) => Number(i.value) || 0));
  const [progress, setProgress] = useState(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) {
      setProgress(1);
      return undefined;
    }
    setProgress(0);
    let frame;
    let start;
    const duration = 650;
    const tick = (ts) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setProgress(easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, rows.map((r) => `${r.label}:${r.value}`).join('|')]);

  return (
    <div className="bar-chart">
      {rows.map((item) => {
        const value = Number(item.value) || 0;
        const displayValue = Math.round(value * progress);
        const pct = Math.min(100, Math.round((value / max) * 100 * progress));
        return (
          <div key={item.label} className="bar-chart-row">
            <div className="bar-chart-label">{item.label}</div>
            <div className="bar-chart-track">
              <div
                className="bar-chart-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="bar-chart-value">{displayValue}</div>
          </div>
        );
      })}
      {rows.length === 0 ? <p className="page-subtitle">No data for this period</p> : null}
    </div>
  );
};
