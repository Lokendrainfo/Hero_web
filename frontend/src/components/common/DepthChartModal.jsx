import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LucideX, LucideImage, LucideLayers } from 'lucide-react';

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDateDMY = (dateVal) => {
  if (!dateVal) return '';
  try {
    const s = String(dateVal).split('T')[0];
    const parts = s.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    const dObj = new Date(dateVal);
    if (!isNaN(dObj.getTime())) {
      const d = String(dObj.getDate()).padStart(2, '0');
      const m = String(dObj.getMonth() + 1).padStart(2, '0');
      const y = dObj.getFullYear();
      return `${d}/${m}/${y}`;
    }
  } catch (e) { /* ignore */ }
  return String(dateVal);
};

const calculateYAxisTicks = (maxDepth) => {
  const safeMax = Math.max(maxDepth, 0.5);
  const rawStep = safeMax / 4;
  let step = Math.ceil(rawStep * 20) / 20; // nearest 0.05
  if (step * 4 < safeMax) {
    step = Math.ceil(rawStep * 10) / 10;
  }
  const maxBound = Number((step * 4).toFixed(2));
  const ticks = [
    0,
    Number((-step).toFixed(2)),
    Number((-step * 2).toFixed(2)),
    Number((-step * 3).toFixed(2)),
    Number((-maxBound).toFixed(2)),
  ];
  return { ticks, maxBound, step };
};

export const DepthChartModal = ({
  isOpen,
  onClose,
  shot,
  executionData,
  selectedDate,
  onOpenLightbox,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const modalRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const chartData = useMemo(() => {
    if (!shot) return { points: [], totalDistance: 0, maxDepth: 0, createdDate: '' };

    // 1. Gather points for this shot
    let rawPoints = [];
    if (Array.isArray(shot.depthReadings) && shot.depthReadings.length > 0) {
      rawPoints = shot.depthReadings;
    } else if (Array.isArray(shot.depthCapture) && shot.depthCapture.length > 0) {
      rawPoints = shot.depthCapture.map((dp, idx) => ({
        id: dp.id || `dp_${idx}`,
        pointNo: idx + 1,
        lat: parseFloat(dp.latitude || 0),
        lng: parseFloat(dp.longitude || 0),
        depth: parseFloat(dp.depth || 0),
        capturedAt: dp.capturedAt || dp.createdAt,
        photos: dp.depthoMeterImage ? [dp.depthoMeterImage] : (dp.photos || []),
      }));
    } else if (Array.isArray(executionData?.depthPoints) && executionData.depthPoints.length > 0) {
      const allDps = executionData.depthPoints;
      const matched = allDps.filter((dp) => {
        if (dp.shotId && (dp.shotId === shot.id || dp.shotId === shot.serialNo)) return true;
        if (Array.isArray(shot.route) && shot.route.length > 0) {
          return shot.route.some(
            (coord) => haversineMeters(dp.lat, dp.lng, coord[0], coord[1]) < 25
          );
        }
        return false;
      });
      if (matched.length > 0) {
        rawPoints = matched;
      } else if (executionData.shots?.length === 1 || !shot.route?.length) {
        rawPoints = allDps;
      }
    }

    // Fallback: If route coordinates exist without separate depth point records
    if (rawPoints.length === 0 && Array.isArray(shot.route) && shot.route.length > 0) {
      rawPoints = shot.route.map((coord, idx) => ({
        id: `route_${idx}`,
        pointNo: idx + 1,
        lat: coord[0],
        lng: coord[1],
        depth: Number(shot.depth) || 2.0,
        capturedAt: shot.executionDate || shot.startTime,
      }));
    }

    const validPoints = rawPoints.filter(
      (p) => !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0
    );

    // 2. Compute cumulative X distance along trench
    let cumulativeDist = 0;
    const startPit = shot.startPit;
    if (startPit && startPit.lat != null && startPit.lng != null && validPoints.length > 0) {
      const d0 = haversineMeters(startPit.lat, startPit.lng, validPoints[0].lat, validPoints[0].lng);
      if (d0 > 0.5 && d0 < 500) {
        cumulativeDist = d0;
      }
    }

    let maxD = 0;
    const points = validPoints.map((pt, idx) => {
      if (idx > 0) {
        const prev = validPoints[idx - 1];
        const step = haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng);
        cumulativeDist += step;
      }
      const dVal = Math.abs(Number(pt.depth) || 0);
      if (dVal > maxD) maxD = dVal;

      return {
        ...pt,
        pointIdx: idx + 1,
        xDistance: Number(cumulativeDist.toFixed(2)),
        depth: dVal,
        displayDepth: dVal.toFixed(2),
      };
    });

    const totalDist = points.length > 0
      ? points[points.length - 1].xDistance
      : (shot.lengthMeters || 0);

    // Date
    const rawDate = shot.executionDate ||
      selectedDate ||
      executionData?.selectedDate ||
      (points[0]?.capturedAt) ||
      shot.startTime ||
      shot.endTime ||
      executionData?.createdAt;
    const createdDate = formatDateDMY(rawDate) || '18/11/2026';

    return {
      points,
      totalDistance: Number(totalDist.toFixed(1)),
      maxDepth: Number(maxD.toFixed(2)),
      createdDate,
    };
  }, [shot, executionData, selectedDate]);

  if (!isOpen || !shot) return null;

  const { points, totalDistance, maxDepth, createdDate } = chartData;
  const trenchTitle = shot.serialNo || shot.id || shot.name || 'Trench';

  // SVG Chart Geometry
  const svgWidth = 760;
  const svgHeight = 310;
  const margin = { top: 30, right: 35, bottom: 45, left: 65 };
  const chartWidth = svgWidth - margin.left - margin.right;
  const chartHeight = svgHeight - margin.top - margin.bottom;

  const { ticks: yTicks, maxBound } = calculateYAxisTicks(maxDepth);

  const minX = points.length > 0 ? points[0].xDistance : 0;
  const maxX = points.length > 0 ? points[points.length - 1].xDistance : 100;
  const xSpan = maxX > minX ? maxX - minX : 10;

  const scaleX = (x) => margin.left + ((x - minX) / xSpan) * chartWidth;
  const scaleY = (depthVal) => {
    // depthVal is 0 or negative e.g. -2.35
    const absD = Math.abs(depthVal);
    const fraction = maxBound > 0 ? absD / maxBound : 0;
    return margin.top + fraction * chartHeight;
  };

  const depthPolylinePoints = points
    .map((pt) => `${scaleX(pt.xDistance)},${scaleY(-pt.depth)}`)
    .join(' ');

  // Should we thin out X tick numbers if there are many points?
  const showAllXTicks = points.length <= 18;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '860px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          padding: '24px 28px',
          position: 'relative',
          fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Depth Chart
            </h2>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>
              Trench: <span style={{ color: '#334155', fontWeight: 600 }}>{trenchTitle}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#f1f5f9',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e2e8f0';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.color = '#475569';
            }}
          >
            <LucideX size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Legend Centered at Top of Graph */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px', margin: '6px 0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: '#2563eb' }}>
            <span style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px', display: 'inline-block' }} />
            <span>Elevation</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>
            <span style={{ width: '10px', height: '10px', background: '#000000', borderRadius: '2px', display: 'inline-block' }} />
            <span>Depth</span>
          </div>
        </div>

        {/* Chart Body */}
        {points.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            No physical depth points recorded along this trench path.
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{ width: '100%', height: 'auto', minWidth: '680px', display: 'block', overflow: 'visible' }}
            >
              {/* Y Axis Label (Rotated 90 deg) */}
              <text
                transform={`rotate(-90)`}
                x={-(margin.top + chartHeight / 2)}
                y={18}
                textAnchor="middle"
                fill="#64748b"
                fontSize="12"
                fontWeight="500"
              >
                Depth / Elevation (m)
              </text>

              {/* X Axis Label (Centered at Bottom) */}
              <text
                x={margin.left + chartWidth / 2}
                y={svgHeight - 6}
                textAnchor="middle"
                fill="#475569"
                fontSize="12"
                fontWeight="500"
              >
                Total X Distance (m)
              </text>

              {/* Y Axis Grid Lines & Ticks */}
              {yTicks.map((tickVal) => {
                const yPos = scaleY(tickVal);
                return (
                  <g key={`y-tick-${tickVal}`}>
                    <line
                      x1={margin.left}
                      y1={yPos}
                      x2={svgWidth - margin.right}
                      y2={yPos}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                      strokeDasharray="2,3"
                    />
                    <text
                      x={margin.left - 8}
                      y={yPos + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#64748b"
                      fontFamily="Inter, monospace"
                      fontWeight="400"
                    >
                      {tickVal === 0 ? '0' : tickVal}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Grid Lines & Distance Ticks */}
              {points.map((pt, idx) => {
                const xPos = scaleX(pt.xDistance);
                const showLabel = showAllXTicks || idx === 0 || idx === points.length - 1 || idx % 2 === 0;

                return (
                  <g key={`x-tick-${idx}`}>
                    <line
                      x1={xPos}
                      y1={margin.top}
                      x2={xPos}
                      y2={margin.top + chartHeight}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                      strokeDasharray="2,3"
                    />
                    {showLabel && (
                      <text
                        x={xPos}
                        y={margin.top + chartHeight + 16}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#64748b"
                        fontFamily="Inter, monospace"
                      >
                        {pt.xDistance}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Series 1: Elevation Line (Blue, at Y = 0) */}
              <line
                x1={scaleX(minX)}
                y1={scaleY(0)}
                x2={scaleX(maxX)}
                y2={scaleY(0)}
                stroke="#3b82f6"
                strokeWidth="2"
              />

              {/* Series 2: Depth Polyline (Black, connecting -depth) */}
              {points.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#000000"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={depthPolylinePoints}
                />
              )}

              {/* Series 1: Elevation Dots (Blue) along Y = 0 */}
              {points.map((pt, idx) => {
                const cx = scaleX(pt.xDistance);
                const cy = scaleY(0);
                const isHovered = hoveredPoint?.idx === idx && hoveredPoint?.series === 'elevation';

                return (
                  <circle
                    key={`elev-dot-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6 : 4}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                    onMouseEnter={() => setHoveredPoint({ ...pt, idx, series: 'elevation', cx, cy })}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                );
              })}

              {/* Series 2: Depth Dots (Black) at -depth */}
              {points.map((pt, idx) => {
                const cx = scaleX(pt.xDistance);
                const cy = scaleY(-pt.depth);
                const isHovered = hoveredPoint?.idx === idx && hoveredPoint?.series === 'depth';

                return (
                  <circle
                    key={`depth-dot-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6.5 : 4.5}
                    fill="#000000"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                    onMouseEnter={() => setHoveredPoint({ ...pt, idx, series: 'depth', cx, cy })}
                    onMouseLeave={() => setHoveredPoint(null)}
                    onClick={() => {
                      if (pt.photos && pt.photos.length > 0 && typeof onOpenLightbox === 'function') {
                        onOpenLightbox(pt.photos, 0);
                      }
                    }}
                  />
                );
              })}
            </svg>

            {/* Interactive Point Hover Tooltip */}
            {hoveredPoint && (
              <div
                style={{
                  position: 'absolute',
                  left: `${(hoveredPoint.cx / svgWidth) * 100}%`,
                  top: `${(hoveredPoint.cy / svgHeight) * 100}%`,
                  transform: 'translate(-50%, -125%)',
                  background: '#0f172a',
                  color: '#ffffff',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  zIndex: 10,
                }}
              >
                <div style={{ fontWeight: 700, color: '#38bdf8' }}>Point #{hoveredPoint.pointIdx}</div>
                <div>Distance: <b>{hoveredPoint.xDistance}m</b></div>
                <div>Depth: <b>{hoveredPoint.displayDepth}m</b></div>
                <div>Elevation: <b>0.00m</b></div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer (Exact Match to Screenshot 1) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid #f1f5f9',
            fontSize: '13px',
            color: '#475569',
            fontWeight: 500,
          }}
        >
          {/* Left summary values */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              Total Distance: <span style={{ color: '#0f172a', fontWeight: 600 }}>{totalDistance}m</span>
            </div>
            <div>
              Max Depth: <span style={{ color: '#0f172a', fontWeight: 600 }}>{maxDepth.toFixed(2)}m</span>
            </div>
            <div>
              Data Points: <span style={{ color: '#0f172a', fontWeight: 600 }}>{points.length}</span>
            </div>
          </div>

          {/* Right creation date */}
          <div>
            Created: <span style={{ color: '#0f172a', fontWeight: 600 }}>{createdDate}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepthChartModal;

