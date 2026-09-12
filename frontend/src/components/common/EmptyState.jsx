import React from 'react';

export const EmptyState = ({ title = 'Nothing here yet', subtitle, children }) => (
  <div className="empty-state">
    <h3>{title}</h3>
    {subtitle ? <p>{subtitle}</p> : null}
    {children}
  </div>
);
