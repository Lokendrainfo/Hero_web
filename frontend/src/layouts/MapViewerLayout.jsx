import React from 'react';
import { Outlet } from 'react-router-dom';

export const MapViewerLayout = () => (
  <div className="map-viewer-shell">
    <Outlet />
  </div>
);
