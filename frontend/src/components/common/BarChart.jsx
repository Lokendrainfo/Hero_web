import React from 'react';

export const BarChart = ({ items = [], maxValue }) => {
  const rows = items.filter((i) => i && i.label != null);
  const max = maxValue || Math.max(1, ...rows.map((i) => Number(i.value) || 0));

  return (
    <div className="bar-chart">
      {rows.map((item) => {
        const value = Number(item.value) || 0;
        const pct = Math.min(100, Math.round((value / max) * 100));
        return (
          <div key={item.label} className="bar-chart-row">
            <div className="bar-chart-label">{item.label}</div>
            <div className="bar-chart-track">
              <div className="bar-chart-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="bar-chart-value">{value}</div>
          </div>
        );
      })}
      {rows.length === 0 ? <p className="page-subtitle">No data for this period</p> : null}
    </div>
  );
};
