import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideEye,
  LucideMapPin,
  LucideChevronsUpDown,
  LucideChevronUp,
  Globe,
  LucideCalendar,
  LucideDatabase,
  LucideBuilding2,
  LucideLayoutGrid,
  LucideUsers,
  LucideClock,
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { PageHeader } from '../../components/common/PageHeader';
import { DateField } from '../../components/common/DateField';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { getTodayDateString } from '../../utils/dateUtils';

// Format timestamp strictly as "DD-MM-YY HH:mm:ss" in Indian Standard Time (UTC+05:30)
const formatCapturedTimestamp = (isoString) => {
  if (!isoString) return 'N/A';
  try {
    const str = String(isoString).trim();
    // If already in DD-MM-YY HH:mm:ss or DD-MM-YYYY HH:mm:ss format
    const matched = str.match(/^(\d{2})[-/](\d{2})[-/](\d{2,4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (matched) {
      const [, d, m, y, h = '00', min = '00', s = '00'] = matched;
      const yy = y.length === 4 ? y.slice(-2) : y;
      return `${d}-${m}-${yy} ${h}:${min}:${s}`;
    }

    const d = new Date(isoString);
    if (isNaN(d.getTime())) return str;

    // Convert to IST (UTC+05:30)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + istOffsetMs);

    const pad = (n) => String(n).padStart(2, '0');
    const dd = pad(istDate.getDate());
    const mm = pad(istDate.getMonth() + 1);
    const yy = String(istDate.getFullYear()).slice(-2);
    const h = pad(istDate.getHours());
    const min = pad(istDate.getMinutes());
    const s = pad(istDate.getSeconds());

    return `${dd}-${mm}-${yy} ${h}:${min}:${s}`;
  } catch (e) {
    return String(isoString);
  }
};

// Calculate data freshness (<1h, <6h, <24h, >24h) from lastDepthCapturedAt
const calculateFreshness = (isoTimestamp) => {
  if (!isoTimestamp) {
    return { label: '>24h', bg: '#dc3545', text: '#ffffff', rank: 4 };
  }
  try {
    const captureTime = new Date(isoTimestamp).getTime();
    if (isNaN(captureTime)) {
      return { label: '>24h', bg: '#dc3545', text: '#ffffff', rank: 4 };
    }
    const now = Date.now();
    const diffHours = (now - captureTime) / (1000 * 60 * 60);

    if (diffHours < 1) {
      return { label: '<1h', bg: '#198754', text: '#ffffff', rank: 1 };
    } else if (diffHours < 6) {
      return { label: '<6h', bg: '#0dcaf0', text: '#000000', rank: 2 };
    } else if (diffHours < 24) {
      return { label: '<24h', bg: '#ffc107', text: '#000000', rank: 3 };
    } else {
      return { label: '>24h', bg: '#dc3545', text: '#ffffff', rank: 4 };
    }
  } catch (e) {
    return { label: '>24h', bg: '#dc3545', text: '#ffffff', rank: 4 };
  }
};

// Target URL for user-specific live monitoring map
const getTargetUrl = (userObj) => {
  const target = userObj.map_url || userObj.url;
  if (!target) return '#';
  try {
    const isRel = target.startsWith('/');
    const urlObj = isRel ? new URL(target, window.location.origin) : new URL(target);
    urlObj.searchParams.set('isBharatNetMap', 'true');
    urlObj.searchParams.set('isBharatNet', 'true');
    urlObj.searchParams.set('source', 'bharatnet');
    if (userObj.machineId) {
      urlObj.searchParams.set('machineId', userObj.machineId);
    }
    // In local development on localhost, keep relative path so it loads inside local dev port
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${urlObj.pathname}${urlObj.search}`;
    }
    return isRel ? `${urlObj.pathname}${urlObj.search}` : urlObj.toString();
  } catch (e) {
    if (target.includes('?')) {
      return `${target}&isBharatNetMap=true&isBharatNet=true&source=bharatnet`;
    }
    return `${target}?isBharatNetMap=true&isBharatNet=true&source=bharatnet`;
  }
};

export const BharatNetMapPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Top Filters
  const initialDate = searchParams.get('date') || getTodayDateString();
  const initialCircle = searchParams.get('circle') || 'Rajasthan';
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedState, setSelectedState] = useState(initialCircle);
  const [searchQuery, setSearchQuery] = useState('');

  // Table Sorting State
  const [sortColumn, setSortColumn] = useState('state'); // 'state' | 'district' | 'block' | 'freshness'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // Request & Data State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiResponse, setApiResponse] = useState(null);
  const [lastFetchedTime, setLastFetchedTime] = useState(null);

  // 1. Fetch live API data from GET /api/v1/td-monitoring/
  const fetchMonitoringData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedDate) params.date = selectedDate;
      if (selectedState && selectedState !== 'ALL') params.circle = selectedState;

      const res = await api.get('/td-monitoring/', { params });
      setApiResponse(res);
      setLastFetchedTime(new Date().toLocaleTimeString('en-IN', { hour12: true }));
    } catch (err) {
      console.error('[BharatNetMapPage] Failed to fetch T&D monitoring data:', err);
      const msg = extractErrorMessage(err?.response?.data || err);
      setError(msg || 'Failed to load BharatNet T&D monitoring data.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedState]);

  useEffect(() => {
    fetchMonitoringData();
  }, [fetchMonitoringData]);

  // Available states for filter dropdown
  const availableStates = useMemo(() => {
    const set = new Set(['Rajasthan', 'UPW', 'Punjab', 'Haryana', 'ALL']);
    (apiResponse?.results?.circles || []).forEach((c) => {
      if (c.circle_name) set.add(c.circle_name);
    });
    return Array.from(set);
  }, [apiResponse]);

  // 2. Map API Response strictly into Grouped Blocks
  // results -> circles -> districts -> blocks -> user_urls
  const groupedBlocks = useMemo(() => {
    const list = [];
    const circles = apiResponse?.results?.circles || [];

    circles.forEach((circleObj) => {
      const circleName = circleObj.circle_name || selectedState || 'Rajasthan';
      (circleObj.districts || []).forEach((distObj) => {
        const distName = distObj.district_name || 'N/A';
        (distObj.blocks || []).forEach((blkObj) => {
          const blkName = blkObj.block_name || 'N/A';
          const rawUsers = blkObj.user_urls || [];

          // Map users with all Pragati Patal fields: userName, userId, machineId, depthMeters, state, district, block, lastDepthCapturedAt
          const mappedUsers = rawUsers.map((u) => {
            const freshness = calculateFreshness(u.lastDepthCapturedAt);
            return {
              userName: u.userName || 'N/A',
              userId: u.userId || '',
              machineId: u.machineId || '',
              depthMeters: u.depthMeters != null ? u.depthMeters : null,
              state: u.state || circleName,
              district: u.district || distName,
              block: u.block || blkName,
              lastDepthCapturedAt: u.lastDepthCapturedAt,
              url: u.url,
              map_url: u.map_url,
              freshness,
            };
          });

          // Block freshness is the freshest capture among users in this block
          let bestFreshness = { label: '>24h', bg: '#dc3545', text: '#ffffff', rank: 4 };
          mappedUsers.forEach((u) => {
            if (u.freshness.rank < bestFreshness.rank) {
              bestFreshness = u.freshness;
            }
          });

          list.push({
            id: `${circleName}_${distName}_${blkName}`,
            state: circleName,
            district: distName,
            block: blkName,
            freshness: bestFreshness,
            user_urls: mappedUsers,
          });
        });
      });
    });

    return list;
  }, [apiResponse, selectedState]);

  // 3. Client-side Search Filtering across: State/Circle, District, Block, User Name
  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return groupedBlocks;

    const q = searchQuery.trim().toUpperCase();

    return groupedBlocks
      .map((blk) => {
        const blockMatches =
          blk.state.toUpperCase().includes(q) ||
          blk.district.toUpperCase().includes(q) ||
          blk.block.toUpperCase().includes(q);

        if (blockMatches) {
          return blk; // All users under this block match
        }

        // Filter users within this block matching user name
        const matchingUsers = blk.user_urls.filter((u) =>
          (u.userName || '').toUpperCase().includes(q)
        );

        if (matchingUsers.length > 0) {
          return {
            ...blk,
            user_urls: matchingUsers,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [groupedBlocks, searchQuery]);

  // 4. Sort Table Rows
  const sortedBlocks = useMemo(() => {
    const list = [...filteredBlocks];
    list.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'state') {
        comparison = a.state.localeCompare(b.state);
      } else if (sortColumn === 'district') {
        comparison = a.district.localeCompare(b.district);
      } else if (sortColumn === 'block') {
        comparison = a.block.localeCompare(b.block);
      } else if (sortColumn === 'freshness') {
        comparison = (a.freshness?.rank || 4) - (b.freshness?.rank || 4);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [filteredBlocks, sortColumn, sortDirection]);

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  // 5. Dynamic Summary Metrics
  const summaryMetrics = useMemo(() => {
    const districtsSet = new Set();
    const blocksSet = new Set();
    let totalUsers = 0;

    filteredBlocks.forEach((blk) => {
      districtsSet.add(blk.district);
      blocksSet.add(`${blk.district}_${blk.block}`);
      totalUsers += (blk.user_urls || []).length;
    });

    return {
      state: selectedState || 'Rajasthan',
      date: selectedDate,
      totalRecords: filteredBlocks.length,
      districts: districtsSet.size,
      blocks: blocksSet.size,
      activeUsers: totalUsers,
      lastFetched: lastFetchedTime || 'Just now',
    };
  }, [filteredBlocks, selectedState, selectedDate, lastFetchedTime]);

  const renderSortIndicator = (columnKey) => {
    if (sortColumn !== columnKey) {
      return <LucideChevronsUpDown size={13} style={{ color: '#adb5bd', marginLeft: 4 }} />;
    }
    return sortDirection === 'asc' ? (
      <LucideChevronUp size={13} style={{ color: '#0d6efd', marginLeft: 4 }} />
    ) : (
      <LucideChevronDown size={13} style={{ color: '#0d6efd', marginLeft: 4 }} />
    );
  };

  return (
    <div className="screen-container" style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header with Back to Dashboard */}
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LucideMapPin size={22} color="#5b3cc4" /> BharatNet T&amp;D Monitoring
          </span>
        }
        subtitle="Live Monitoring of Trenching and Ducting Data"
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
              <LucideRefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh Data
            </button>
          </div>
        }
      />

      {/* Filter and Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/map-view')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}
          >
            <LucideArrowLeft size={15} /> Map Modules
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>State:</label>
            <select
              className="form-control"
              value={selectedState}
              onChange={(e) => {
                setSelectedState(e.target.value);
                setSearchParams({ date: selectedDate, circle: e.target.value });
              }}
              style={{
                height: 32,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.84rem',
                fontWeight: 500,
              }}
            >
              {availableStates.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All States / Circles' : s}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Date:</label>
            <DateField
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setSearchParams({ date: e.target.value, circle: selectedState });
                }
              }}
              aria-label="Select Date"
            />
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}
          onClick={fetchMonitoringData}
          disabled={loading}
        >
          <LucideRefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh Data
        </button>
      </div>

      {/* BSNL Pragati Patal Pills Bar */}
      <div className="pragati-pills-bar">
        <div className="pragati-pill">
          <Globe size={15} color="#5b3cc4" />
          <span className="pragati-pill-label">State:</span>
          <span className="pragati-pill-val">{summaryMetrics.state}</span>
        </div>
        <div className="pragati-pill">
          <LucideCalendar size={15} color="#5b3cc4" />
          <span className="pragati-pill-label">Date:</span>
          <span className="pragati-pill-val">{summaryMetrics.date}</span>
        </div>
        <div className="pragati-pill">
          <LucideDatabase size={15} color="#5b3cc4" />
          <span className="pragati-pill-label">Total Records:</span>
          <span className="pragati-pill-val">{summaryMetrics.totalRecords}</span>
        </div>
        <div className="pragati-pill">
          <LucideBuilding2 size={15} color="#5b3cc4" />
          <span className="pragati-pill-label">Districts:</span>
          <span className="pragati-pill-val">{summaryMetrics.districts}</span>
        </div>
        <div className="pragati-pill">
          <LucideLayoutGrid size={15} color="#5b3cc4" />
          <span className="pragati-pill-label">Blocks:</span>
          <span className="pragati-pill-val">{summaryMetrics.blocks}</span>
        </div>
        <div className="pragati-pill">
          <LucideUsers size={15} color="#5b3cc4" />
          <span className="pragati-pill-label">Active Users/URLs:</span>
          <span className="pragati-pill-val">{summaryMetrics.activeUsers}</span>
        </div>
        <div className="pragati-pill">
          <LucideClock size={15} color="#5b3cc4" />
          <span className="pragati-pill-label">Last Fetched:</span>
          <span className="pragati-pill-val">{summaryMetrics.lastFetched}</span>
        </div>
      </div>

      {/* LIVE MONITORING SECTION BANNER */}
      <div
        style={{
          background: '#5b3cc4',
          color: '#ffffff',
          borderRadius: '6px 6px 0 0',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.95rem' }}>
          <LucideMapPin size={18} />
          <span>Live Monitoring of Trenching and Ducting Data</span>
        </div>

        {/* Freshness Chips Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              background: '#198754',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            &lt;1h
          </span>
          <span
            style={{
              background: '#0dcaf0',
              color: '#000000',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            &lt;6h
          </span>
          <span
            style={{
              background: '#ffc107',
              color: '#000000',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            &lt;24h
          </span>
          <span
            style={{
              background: '#dc3545',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            &gt;24h
          </span>
        </div>
      </div>

      {/* SEARCH BOX & TABLE CONTAINER */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            Search monitoring data:
          </span>
          <div style={{ width: 280 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by state, district, block, user..."
              style={{
                width: '100%',
                height: 32,
                padding: '4px 10px',
                fontSize: '0.82rem',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
              }}
            />
          </div>
        </div>

        {/* MAIN TABLE MATCHING REFERENCE SCREENSHOT EXACTLY */}
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <LoadingSpinner
              title="Loading BharatNet T&D Monitoring Data..."
              subtitle="Fetching live records from /api/v1/td-monitoring/"
            />
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ color: '#dc3545', fontWeight: 700, marginBottom: 8 }}>
              Failed to Load Monitoring Data
            </div>
            <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: 16 }}>{error}</p>
            <button type="button" className="btn-primary" onClick={fetchMonitoringData}>
              Try Again
            </button>
          </div>
        ) : sortedBlocks.length === 0 ? (
          <div style={{ padding: '40px 20px' }}>
            <EmptyState
              title="No monitoring data available"
              subtitle={`No trenching or ducting captures reported for ${selectedState} on ${selectedDate}.`}
              actionLabel="Clear Search"
              onAction={() => setSearchQuery('')}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.85rem',
                border: '1px solid #dee2e6',
              }}
            >
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  {/* Column 1: State/Circle */}
                  <th
                    onClick={() => handleSort('state')}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#212529',
                      width: '14%',
                      borderRight: '1px solid #dee2e6',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span>State/Circle</span>
                      {renderSortIndicator('state')}
                    </div>
                  </th>

                  {/* Column 2: District */}
                  <th
                    onClick={() => handleSort('district')}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#212529',
                      width: '14%',
                      borderRight: '1px solid #dee2e6',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span>District</span>
                      {renderSortIndicator('district')}
                    </div>
                  </th>

                  {/* Column 3: Block */}
                  <th
                    onClick={() => handleSort('block')}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#212529',
                      width: '16%',
                      borderRight: '1px solid #dee2e6',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span>Block</span>
                      {renderSortIndicator('block')}
                    </div>
                  </th>

                  {/* Column 4: Data Freshness */}
                  <th
                    onClick={() => handleSort('freshness')}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#212529',
                      width: '14%',
                      borderRight: '1px solid #dee2e6',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span>Data Freshness</span>
                      {renderSortIndicator('freshness')}
                    </div>
                  </th>

                  {/* Column 5: Monitoring Links */}
                  <th
                    style={{
                      padding: '10px 16px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#212529',
                    }}
                  >
                    Monitoring Links
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedBlocks.map((block) => (
                  <tr
                    key={block.id}
                    style={{
                      borderBottom: '1px solid #dee2e6',
                      verticalAlign: 'middle',
                    }}
                  >
                    {/* State/Circle */}
                    <td
                      style={{
                        padding: '12px 14px',
                        fontWeight: 600,
                        color: '#212529',
                        textAlign: 'center',
                        borderRight: '1px solid #dee2e6',
                        textTransform: 'uppercase',
                      }}
                    >
                      {block.state}
                    </td>

                    {/* District */}
                    <td
                      style={{
                        padding: '12px 14px',
                        fontWeight: 600,
                        color: '#212529',
                        textAlign: 'center',
                        borderRight: '1px solid #dee2e6',
                        textTransform: 'uppercase',
                      }}
                    >
                      {block.district}
                    </td>

                    {/* Block */}
                    <td
                      style={{
                        padding: '12px 14px',
                        fontWeight: 600,
                        color: '#212529',
                        textAlign: 'center',
                        borderRight: '1px solid #dee2e6',
                        textTransform: 'uppercase',
                      }}
                    >
                      {block.block}
                    </td>

                    {/* Data Freshness */}
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'center',
                        borderRight: '1px solid #dee2e6',
                      }}
                    >
                      <span
                        style={{
                          background: block.freshness.bg,
                          color: block.freshness.text,
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          display: 'inline-block',
                        }}
                      >
                        {block.freshness.label}
                      </span>
                    </td>

                    {/* MONITORING LINKS CELL */}
                    <td style={{ padding: '8px 16px' }}>
                      {block.user_urls.map((user, idx) => {
                        const isLast = idx === block.user_urls.length - 1;

                        return (
                          <div
                            key={user.userName + (user.userId || idx)}
                            style={{
                              padding: '8px 0',
                              borderBottom: isLast ? 'none' : '1px solid #e9ecef',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 16,
                            }}
                          >
                            <div style={{ fontSize: '0.88rem', color: '#212529' }}>
                              <strong style={{ fontWeight: 700, color: '#000000', fontSize: '0.92rem' }}>
                                {user.userName}
                              </strong>
                              <span style={{ color: '#6c757d', marginLeft: 8 }}>
                                Last Depth Captured at: {formatCapturedTimestamp(user.lastDepthCapturedAt)}
                              </span>
                            </div>

                            {/* Eye/View Button */}
                            <div>
                              <button
                                type="button"
                                title={`Open live monitoring map for ${user.userName}`}
                                onClick={() => {
                                  const targetUrl = getTargetUrl(user);
                                  window.open(targetUrl, '_blank');
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 34,
                                  height: 30,
                                  border: '1px solid #0d6efd',
                                  borderRadius: 4,
                                  background: '#ffffff',
                                  color: '#0d6efd',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#0d6efd';
                                  e.currentTarget.style.color = '#ffffff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.color = '#0d6efd';
                                }}
                              >
                                <LucideEye size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BharatNetMapPage;
