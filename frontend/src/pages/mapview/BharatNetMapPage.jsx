import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideMapPin,
  LucideRadio,
  LucideSearch,
  LucideExternalLink,
  LucideCheckCircle2,
  LucideAlertTriangle,
  LucideFilter
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { PageHeader } from '../../components/common/PageHeader';
import { DateField } from '../../components/common/DateField';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { getTodayDateString } from '../../utils/dateUtils';

const formatCaptureTime = (isoString) => {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
  } catch (e) {
    return isoString;
  }
};

export const BharatNetMapPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters State
  const initialDate = searchParams.get('date') || getTodayDateString();
  const initialCircle = searchParams.get('circle') || '';
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedCircle, setSelectedCircle] = useState(initialCircle);
  const [districtFilter, setDistrictFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Data & Request State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiResponse, setApiResponse] = useState(null);
  const [selectedRecordKey, setSelectedRecordKey] = useState(null);

  // Leaflet Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());

  // 1. Fetch BharatNet T&D Monitoring Data (ONLY on this map page)
  const fetchMonitoringData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedDate) params.date = selectedDate;
      if (selectedCircle && selectedCircle !== 'ALL') params.circle = selectedCircle;

      const res = await api.get('/td-monitoring/', { params });
      setApiResponse(res);
    } catch (err) {
      console.error('[BharatNetMapPage] Failed to fetch T&D monitoring data:', err);
      const msg = extractErrorMessage(err?.response?.data || err);
      setError(msg || 'Failed to load BharatNet T&D monitoring data. Please check network or credentials.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedCircle]);

  useEffect(() => {
    fetchMonitoringData();
  }, [fetchMonitoringData]);

  // 2. Flatten and filter records from the API response structure
  // API Structure: results.circles[] -> districts[] -> blocks[] -> user_urls[]
  const allRecords = useMemo(() => {
    const list = [];
    const circles = apiResponse?.results?.circles || [];
    circles.forEach((circleObj) => {
      const circleName = circleObj.circle_name || 'UPW';
      (circleObj.districts || []).forEach((distObj) => {
        const distName = distObj.district_name || 'OTHER';
        (distObj.blocks || []).forEach((blkObj) => {
          const blkName = blkObj.block_name || 'OTHER';
          (blkObj.user_urls || []).forEach((rec, idx) => {
            const key = `${rec.machineId || 'M'}_${rec.userId || 'U'}_${rec.block || blkName}_${idx}`;
            list.push({
              ...rec,
              key,
              circle: rec.state || circleName,
              district: rec.district || distName,
              block: rec.block || blkName,
            });
          });
        });
      });
    });
    return list;
  }, [apiResponse]);

  // Filtered records based on District, Block, and Search (user/machine)
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      if (districtFilter && !rec.district.toUpperCase().includes(districtFilter.toUpperCase())) {
        return false;
      }
      if (blockFilter && !rec.block.toUpperCase().includes(blockFilter.toUpperCase())) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toUpperCase();
        const matchesUser = (rec.userName || '').toUpperCase().includes(q);
        const matchesUserId = (rec.userId || '').toUpperCase().includes(q);
        const matchesMachine = (rec.machineId || '').toUpperCase().includes(q);
        const matchesBlock = (rec.block || '').toUpperCase().includes(q);
        if (!matchesUser && !matchesUserId && !matchesMachine && !matchesBlock) {
          return false;
        }
      }
      return true;
    });
  }, [allRecords, districtFilter, blockFilter, searchQuery]);

  // Available districts and blocks for filter dropdowns
  const availableDistricts = useMemo(() => {
    const set = new Set();
    allRecords.forEach((r) => r.district && set.add(r.district));
    return Array.from(set).sort();
  }, [allRecords]);

  const availableBlocks = useMemo(() => {
    const set = new Set();
    allRecords.forEach((r) => {
      if (!districtFilter || r.district.toUpperCase() === districtFilter.toUpperCase()) {
        if (r.block) set.add(r.block);
      }
    });
    return Array.from(set).sort();
  }, [allRecords, districtFilter]);

  // Available circles from response
  const availableCircles = useMemo(() => {
    const set = new Set(['ALL', 'UPW', 'RAJASTHAN', 'HARYANA']);
    (apiResponse?.results?.circles || []).forEach((c) => c.circle_name && set.add(c.circle_name));
    return Array.from(set);
  }, [apiResponse]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = filteredRecords.length;
    if (total === 0) return { total: 0, compliant: 0, avgDepth: 0, blocksCount: 0 };
    const compliant = filteredRecords.filter((r) => (Number(r.depthMeters) || 0) >= 1.65).length;
    const sumDepth = filteredRecords.reduce((s, r) => s + (Number(r.depthMeters) || 0), 0);
    const avgDepth = (sumDepth / total).toFixed(2);
    const uniqueBlocks = new Set(filteredRecords.map((r) => `${r.district}_${r.block}`)).size;
    return {
      total,
      compliant,
      avgDepth,
      blocksCount: uniqueBlocks,
    };
  }, [filteredRecords]);

  // 3. Initialize & Update Leaflet Map with markers
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([27.0, 78.0], 7);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      try {
        marker.remove();
      } catch (e) {
        // ignore
      }
    });
    markersRef.current.clear();

    const bounds = [];

    // Helper for marker colors based on depth
    filteredRecords.forEach((rec) => {
      const lat = parseFloat(rec.latitude);
      const lng = parseFloat(rec.longitude);

      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
        return;
      }

      bounds.push([lat, lng]);

      const depth = parseFloat(rec.depthMeters) || 0;
      const markerColor = depth >= 1.65 ? '#10b981' : depth >= 1.2 ? '#f59e0b' : '#ef4444';

      const iconHtml = `
        <div style="
          background: ${markerColor};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 11px;
          border: 2px solid white;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          transform: translate(-50%, -50%);
        ">
          ${depth > 0 ? depth.toFixed(1) + 'm' : 'T&D'}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'bharatnet-marker-icon',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.5; color: #1e293b; min-width: 220px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #0f172a;">${rec.userName || 'Operator'}</strong>
            <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: ${markerColor}20; color: ${markerColor}; font-weight: 700;">
              ${rec.depthMeters != null ? rec.depthMeters + ' m' : '—'}
            </span>
          </div>
          <div style="margin-bottom: 4px;"><strong>User ID:</strong> ${rec.userId || '—'}</div>
          <div style="margin-bottom: 4px;"><strong>Machine ID:</strong> ${rec.machineId || '—'}</div>
          <div style="margin-bottom: 4px;"><strong>Circle:</strong> ${rec.circle || '—'}</div>
          <div style="margin-bottom: 4px;"><strong>District:</strong> ${rec.district || '—'}</div>
          <div style="margin-bottom: 4px;"><strong>Block:</strong> ${rec.block || '—'}</div>
          <div style="margin-bottom: 6px;"><strong>Last Capture:</strong> ${formatCaptureTime(rec.lastDepthCapturedAt)}</div>
          <div style="margin-top: 8px; pt: 6px; border-top: 1px solid #f1f5f9;">
            <a href="${rec.map_url || rec.url}" target="_blank" rel="noopener noreferrer" style="
              display: block;
              text-align: center;
              background: #0284c7;
              color: white;
              padding: 6px 10px;
              border-radius: 4px;
              text-decoration: none;
              font-weight: 600;
              font-size: 11px;
            ">
              Open Full Execution Map
            </a>
          </div>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(popupHtml);

      marker.on('click', () => {
        setSelectedRecordKey(rec.key);
      });

      markersRef.current.set(rec.key, marker);
    });

    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch (e) {
        // ignore bounds fit error
      }
    }
  }, [filteredRecords]);

  // Center on marker when clicking record in list
  const handleSelectRecord = (rec) => {
    setSelectedRecordKey(rec.key);
    const marker = markersRef.current.get(rec.key);
    if (marker && mapInstanceRef.current) {
      const latLng = marker.getLatLng();
      mapInstanceRef.current.setView(latLng, 14, { animate: true });
      marker.openPopup();
    }
  };

  return (
    <div className="screen-container">
      {/* 1. Header with Back to Dashboard Button */}
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LucideRadio size={22} color="#10b981" /> BharatNet T&amp;D Monitoring
          </span>
        }
        subtitle="Live Trenching &amp; Ducting Monitoring GIS Map"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              onClick={() => navigate('/dashboard')}
            >
              <LucideArrowLeft size={15} /> Back to Dashboard
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              onClick={fetchMonitoringData}
              disabled={loading}
            >
              <LucideRefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      {/* 2. Filters Bar */}
      <section className="panel" style={{ padding: '14px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Date Filter */}
          <div style={{ minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              Capture Date
            </label>
            <DateField
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setSearchParams({ date: e.target.value, circle: selectedCircle });
                }
              }}
              aria-label="Capture Date"
            />
          </div>

          {/* Circle / State Filter */}
          <div style={{ minWidth: 140 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              Circle / State
            </label>
            <select
              className="form-control"
              value={selectedCircle}
              onChange={(e) => {
                setSelectedCircle(e.target.value);
                setDistrictFilter('');
                setBlockFilter('');
              }}
              style={{
                height: 38,
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            >
              <option value="">All Circles</option>
              {availableCircles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* District Filter */}
          {availableDistricts.length > 0 && (
            <div style={{ minWidth: 140 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                District
              </label>
              <select
                className="form-control"
                value={districtFilter}
                onChange={(e) => {
                  setDistrictFilter(e.target.value);
                  setBlockFilter('');
                }}
                style={{
                  height: 38,
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">All Districts</option>
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Block Filter */}
          {availableBlocks.length > 0 && (
            <div style={{ minWidth: 140 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                Block
              </label>
              <select
                className="form-control"
                value={blockFilter}
                onChange={(e) => setBlockFilter(e.target.value)}
                style={{
                  height: 38,
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">All Blocks</option>
                {availableBlocks.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* Operator / Machine Search */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              Search Operator / Machine
            </label>
            <div style={{ position: 'relative' }}>
              <LucideSearch size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by name, ID, or machine..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: 38,
                  paddingLeft: 30,
                  paddingRight: 10,
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Summary KPIs Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div className="panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideMapPin size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Captures</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.total}</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideCheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Standard Depth (≥ 1.65m)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#16a34a' }}>{metrics.compliant}</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideFilter size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Average Depth</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.avgDepth} m</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideRadio size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Blocks</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.blocksCount}</div>
          </div>
        </div>
      </div>

      {/* 4. Main Content Area */}
      {loading ? (
        <div className="panel" style={{ minHeight: 450, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner title="Loading BharatNet T&D Monitoring Data..." subtitle="Fetching authoritative depth and trenching records" />
        </div>
      ) : error ? (
        <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ color: '#ef4444', marginBottom: 12 }}>
            <LucideAlertTriangle size={36} style={{ margin: '0 auto' }} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Unable to Load BharatNet Data</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 480, margin: '0 auto 16px' }}>{error}</p>
          <button type="button" className="btn-primary" onClick={fetchMonitoringData}>
            Retry Request
          </button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="panel" style={{ padding: 48 }}>
          <EmptyState
            title="No BharatNet monitoring records found"
            subtitle={`No trenching or depth captures reported on ${selectedDate} for the selected circle/filters.`}
            actionLabel="Reset Filters"
            onAction={() => {
              setSelectedCircle('');
              setDistrictFilter('');
              setBlockFilter('');
              setSearchQuery('');
            }}
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '16px', minHeight: 560 }}>
          {/* Map Container */}
          <div className="panel" style={{ padding: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div
              ref={mapContainerRef}
              style={{
                width: '100%',
                flex: 1,
                minHeight: 540,
                background: '#e2e8f0',
                zIndex: 1
              }}
            />
          </div>

          {/* Records Sidebar List */}
          <div className="panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 600 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '0.88rem' }}>Monitoring Records</strong>
              <span className="badge-pill badge-running">{filteredRecords.length} records</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {filteredRecords.map((rec) => {
                const isSelected = selectedRecordKey === rec.key;
                const depth = parseFloat(rec.depthMeters) || 0;
                const badgeColor = depth >= 1.65 ? '#16a34a' : depth >= 1.2 ? '#d97706' : '#dc2626';

                return (
                  <div
                    key={rec.key}
                    onClick={() => handleSelectRecord(rec)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: isSelected ? 'var(--bg-subtle, #f1f5f9)' : 'transparent',
                      border: isSelected ? '1px solid #0284c7' : '1px solid transparent',
                      cursor: 'pointer',
                      marginBottom: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {rec.userName || 'Operator'}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: badgeColor,
                          background: `${badgeColor}15`,
                          padding: '2px 6px',
                          borderRadius: 4
                        }}
                      >
                        {rec.depthMeters != null ? `${rec.depthMeters} m` : '—'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span>M/C: <strong>{rec.machineId || '—'}</strong></span>
                      <span>•</span>
                      <span>Block: <strong>{rec.block || '—'}</strong></span>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      Capture: {formatCaptureTime(rec.lastDepthCapturedAt)}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <a
                        href={rec.map_url || rec.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          color: '#0284c7',
                          textDecoration: 'none',
                          fontWeight: 600
                        }}
                      >
                        Map View <LucideExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BharatNetMapPage;
