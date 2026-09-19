import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideMaximize2,
  LucideMinimize2,
  LucideGlobe,
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { mapHddExecutionResponse, filterHddExecutionByDate, parseDateToYMD, parseAnyDate } from '../../utils/mapHddExecutionResponse';
import { PhotoLightbox, formatImageUrl } from '../../components/common/PhotoLightbox';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { DateField } from '../../components/common/DateField';
import { formatDepthM } from '../../utils/formatters';
import {
  applyGisZoomLabels,
  depthDotSize,
  depthLabelStep,
  depthPointIcon,
  depthSampleStep,
  gisPopupHtml,
  pitIcon,
  pitPopupHtml,
  resolvePitRole,
} from '../../utils/gisMapMarkers';

const GisExecutionMap3D = lazy(() => import('../../components/maps/GisExecutionMap3D'));

class Map3dBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[Gis3D]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="gis-map3d-loading">
          3D view could not start. Switch back to 2D.
          {this.state.error?.message ? ` (${this.state.error.message})` : ''}
        </div>
      );
    }
    return this.props.children;
  }
}

export const HddExecutionMapPage = () => {
  const { executionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { roles, isAdmin, hasPermission } = useAuth();

  const isVendorAccount = !isAdmin && (roles || []).some(r => (r || '').toUpperCase() === 'VENDOR') && !hasPermission('mapview.view');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Execution Data State
  const [rawExecutionData, setRawExecutionData] = useState(null);
  const [executionData, setExecutionData] = useState(null);

  // Date Filter State
  const dateParam = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(dateParam || '');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Map & GIS state
  const [mapType, setMapType] = useState('satellite'); // Default to Satellite view
  const [viewMode, setViewMode] = useState('2d');
  const [fitNonce, setFitNonce] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Lightbox State
  const [lightboxPhotos, setLightboxPhotos] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const depthLayerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const wrapperRef = useRef(null);

  // Batch resolve S3 Presigned URLs via POST /api/survey/photo-urls
  const resolvePhotoUrlsForExecution = async (normalized) => {
    if (!normalized) return normalized;

    const keysSet = new Set();

    (normalized.pits || []).forEach(pit => {
      (pit.photos || []).forEach(ph => {
        if (ph.key) keysSet.add(ph.key);
      });
    });

    (normalized.shots || []).forEach(trench => {
      (trench.photos || []).forEach(ph => {
        if (ph.key) keysSet.add(ph.key);
      });
    });

    (normalized.depthPoints || []).forEach(dp => {
      (dp.photos || []).forEach(ph => {
        if (ph.key) keysSet.add(ph.key);
      });
    });

    const keysArray = Array.from(keysSet);
    if (keysArray.length === 0) return normalized;

    try {
      const res = await taskService.getSurveyPhotoUrls(keysArray);
      const urlMap = res?.data?.data || res?.data || res || {};

      const applyPresignedUrl = (mediaObj) => {
        if (!mediaObj || !mediaObj.key) return;
        const cleanK = String(mediaObj.key).replace(/^\/+/, '');
        const resolved = urlMap[mediaObj.key] || urlMap[cleanK] || urlMap[`/${cleanK}`];
        if (resolved) {
          mediaObj.photoUrl = resolved;
          mediaObj.url = resolved;
          mediaObj.src = resolved;
        } else if (mediaObj.photoUrl) {
          mediaObj.photoUrl = formatImageUrl(mediaObj.photoUrl);
        }
      };

      (normalized.pits || []).forEach(pit => (pit.photos || []).forEach(applyPresignedUrl));
      (normalized.shots || []).forEach(trench => (trench.photos || []).forEach(applyPresignedUrl));
      (normalized.depthPoints || []).forEach(dp => (dp.photos || []).forEach(applyPresignedUrl));
    } catch (err) {
      console.error('[HddExecutionMapPage] Error batch resolving photo URLs:', err);
    }

    return normalized;
  };

  const resolveExecutionData = async (targetId, maxDepth = 3) => {
    if (!targetId || maxDepth <= 0) return null;

    try {
      const [taskRes, execRes] = await Promise.all([
        taskService.getTaskDetail(targetId).catch(() => null),
        taskService.getTaskExecution(targetId).catch(execErr => {
          console.log(`[HddExecutionMapPage] Execution endpoint response for ${targetId}:`, execErr);
          return null;
        })
      ]);

      const taskData = taskRes?.data?.data || taskRes?.data || null;
      if (!taskData) return null;

      const execData = execRes?.data?.data || execRes?.data || null;
      let normalized = mapHddExecutionResponse(taskData, execData);
      if (!normalized) return null;

      // If root task already has pits or trenches, return it immediately
      if ((normalized.shots && normalized.shots.length > 0) || (normalized.pits && normalized.pits.length > 0)) {
        return normalized;
      }

      // Check if child tasks under this task have telemetry, and aggregate them into THIS user's task
      try {
        let children = taskData.children;
        if (!Array.isArray(children) || children.length === 0) {
          const childrenRes = await taskService.getTaskChildren(targetId);
          children = childrenRes?.data?.data || childrenRes?.data || [];
        }

        if (Array.isArray(children) && children.length > 0) {
          const childResults = await Promise.all(
            children.map(child => {
              const childId = child.id || child._id || child.taskId;
              return childId ? resolveExecutionData(childId, maxDepth - 1) : Promise.resolve(null);
            })
          );

          // Merge any valid child shots, pits, and depth points into execution object
          childResults.filter(Boolean).forEach(childNorm => {
            if (childNorm.shots && childNorm.shots.length > 0) {
              normalized.shots = [...(normalized.shots || []), ...childNorm.shots];
            }
            if (childNorm.pits && childNorm.pits.length > 0) {
              normalized.pits = [...(normalized.pits || []), ...childNorm.pits];
            }
            if (childNorm.depthPoints && childNorm.depthPoints.length > 0) {
              normalized.depthPoints = [...(normalized.depthPoints || []), ...childNorm.depthPoints];
            }
            if (childNorm.availableDates && childNorm.availableDates.length > 0) {
              const mergedDates = new Set([...(normalized.availableDates || []), ...childNorm.availableDates]);
              normalized.availableDates = Array.from(mergedDates).sort();
            }
            if (childNorm.updatedAt) {
              const dNorm = parseAnyDate(normalized.updatedAt);
              const dChild = parseAnyDate(childNorm.updatedAt);
              const tNorm = dNorm ? dNorm.getTime() : 0;
              const tChild = dChild ? dChild.getTime() : 0;
              if (tChild > tNorm) {
                normalized.updatedAt = childNorm.updatedAt;
                normalized.lastModified = childNorm.lastModified || normalized.lastModified;
              }
            }
          });
        }
      } catch (childErr) {
        console.log(`[HddExecutionMapPage] getTaskChildren error for ${targetId}:`, childErr);
      }

      return normalized;
    } catch (err) {
      console.error(`[HddExecutionMapPage] Error resolving target ${targetId}:`, err);
      return null;
    }
  };

  // Auto Refresh & Data State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isInitialFitDoneRef = useRef(false);

  const fetchExecutionDetail = async (isInitial = false) => {
    if (!executionId) return;
    if (isInitial || !rawExecutionData) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    const cleanId = String(executionId).replace('_route_', '').split('_')[0];

    try {
      const rawResult = await resolveExecutionData(cleanId);
      if (!rawResult) {
        setError(`Execution ID "${executionId}" not found.`);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      setRawExecutionData(rawResult);

      // Determine initial date if not set via query param
      let activeDate = dateParam || selectedDate;
      if (!activeDate && rawResult.availableDates && rawResult.availableDates.length > 0) {
        // Default to latest available execution date
        activeDate = rawResult.availableDates[rawResult.availableDates.length - 1];
      }
      if (!activeDate) {
        activeDate = new Date().toISOString().split('T')[0];
      }

      setSelectedDate(activeDate);

      // Filter raw result by activeDate
      const dateFiltered = filterHddExecutionByDate(rawResult, activeDate);
      const fullyResolved = await resolvePhotoUrlsForExecution(dateFiltered);
      setExecutionData(fullyResolved);

      const now = new Date();
      setLastUpdated(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase());
    } catch (err) {
      console.error('[HddExecutionMapPage] Error loading execution detail:', err);
      setError(err?.message || 'Failed to load HDD map execution data.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    isInitialFitDoneRef.current = false;
    fetchExecutionDetail(true);
  }, [executionId]);

  // Handle Date Change
  const handleDateChange = async (newDate) => {
    setSelectedDate(newDate);
    isInitialFitDoneRef.current = false;
    if (newDate) {
      setSearchParams({ date: newDate }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }

    if (rawExecutionData) {
      setLoading(true);
      try {
        const dateFiltered = filterHddExecutionByDate(rawExecutionData, newDate);
        const fullyResolved = await resolvePhotoUrlsForExecution(dateFiltered);
        setExecutionData(fullyResolved);
      } catch (err) {
        console.error('[HddExecutionMapPage] Error filtering date:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  // Leaflet Cleanup on Unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) { }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const openLightbox = (photos, index = 0) => {
    if (!photos || photos.length === 0) return;
    setLightboxPhotos(photos);
    setLightboxIndex(index);
  };

  // Leaflet Map Initialization & Rendering
  useEffect(() => {
    if (viewMode !== '2d') {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (e) { /* ignore */ }
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
        depthLayerRef.current = null;
        tileLayerRef.current = null;
        isInitialFitDoneRef.current = false;
      }
      return;
    }
    if (!mapContainerRef.current || !executionData) return;

    if (mapInstanceRef.current) {
      try {
        const container = mapInstanceRef.current.getContainer();
        if (!container || !document.body.contains(container)) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      } catch (e) {
        mapInstanceRef.current = null;
      }
    }

    if (!mapInstanceRef.current) {
      const defaultCenter = [29.841128, 73.536244];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        maxZoom: 20,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
      layerGroupRef.current = L.featureGroup().addTo(map);
      depthLayerRef.current = L.featureGroup().addTo(map);
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    // Handle Tile Layers (Street vs Satellite)
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    if (mapType === 'satellite') {
      tileLayerRef.current = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      }).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      }).addTo(map);
    }

    // Clear previous markers & polylines
    layerGroup.clearLayers();

    if (!depthLayerRef.current) {
      depthLayerRef.current = L.featureGroup().addTo(map);
    }

    const allBounds = [];
    const frameBounds = [];

    // Build complete list of all depth photos for sequential lightbox navigation
    const allDepthPhotos = (executionData.depthPoints || []).map((dp, idx) => {
      const dpPhotos = dp.photos || [];
      const photoObj = dpPhotos[0] || {};
      const imgUrl = photoObj.photoUrl || (dp.photo && (dp.photo.photoUrl || dp.photo.url)) || photoObj.key || null;
      const dpId = dp.id || `ASH-DPT${String(dp.pointNo || idx + 1).padStart(8, '0')}`;

      return {
        id: dpId,
        key: photoObj.key || imgUrl,
        photoUrl: imgUrl,
        url: imgUrl,
        src: imgUrl,
        label: `Depth Point ${dpId}`,
        title: `Depth Point ${dpId}`,
        depth: dp.depth,
        capturedAt: dp.capturedAt,
        latitude: dp.lat,
        longitude: dp.lng,
        pointNo: dp.pointNo || idx + 1
      };
    });

    const startPitIds = new Set();
    const endPitIds = new Set();
    (executionData.shots || []).forEach((shot) => {
      if (shot.startPit?.id) startPitIds.add(shot.startPit.id);
      if (shot.startPit?.name) startPitIds.add(shot.startPit.name);
      if (shot.endPit?.id) endPitIds.add(shot.endPit.id);
      if (shot.endPit?.name) endPitIds.add(shot.endPit.name);
    });

    const statusUpper = String(executionData.status || executionData.taskStatus || '').toUpperCase();
    const isOngoing = statusUpper.includes('PROGRESS') ||
      statusUpper.includes('RUNNING') ||
      statusUpper.includes('EXECUTION') ||
      statusUpper.includes('ACTIVE') ||
      statusUpper.includes('STARTED') ||
      (executionData.depthPoints?.length > 0 && selectedDate === executionData.availableDates?.[executionData.availableDates.length - 1]);

    // 1. Trench path — soft halo so the chain reads on satellite
    (executionData.shots || []).forEach((shot, sIdx) => {
      const cleanShotId = String(shot.id || `shot_${sIdx}`).replace(/[^a-zA-Z0-9]/g, '_');
      window[`__openTrenchLightbox_${cleanShotId}`] = () => {
        if (shot.photos && shot.photos.length > 0) {
          openLightbox(shot.photos, 0);
        }
      };

      if (shot.route && shot.route.length > 1) {
        L.polyline(shot.route, {
          color: '#ffffff',
          weight: 8,
          opacity: 0.62,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        }).addTo(layerGroup);

        const line = L.polyline(shot.route, {
          color: '#5b21b6',
          weight: 3,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(layerGroup);

        shot.route.forEach((pt) => {
          allBounds.push(pt);
          frameBounds.push(pt);
        });

        const popupContent = gisPopupHtml({
          eyebrow: 'Trench',
          title: shot.serialNo || shot.id || 'Trench',
          rows: [
            ['Start', shot.startPit?.name || '—'],
            ['End', shot.endPit?.name || '—'],
            ['Avg depth', formatDepthM(shot.depth)],
            ['Length', shot.formattedLength],
            ['Captures', shot.depthReadingsCount],
            ['Strata', shot.strataType],
          ],
          actionLabel: shot.photos?.length ? `View media (${shot.photos.length})` : '',
        });

        line.bindPopup(popupContent, { maxWidth: 260, className: 'gis-popup' });
        if (shot.photos?.length) {
          line.on('popupopen', (e) => {
            const btn = e.popup.getElement()?.querySelector('.gis-popup-btn');
            if (btn) btn.onclick = () => window[`__openTrenchLightbox_${cleanShotId}`]();
          });
        }
      }
    });

    // 2. Pits — all pits rendered uniformly with standard pit pin marker & hover tooltip
    const pits = executionData.pits || [];

    pits.forEach((pit) => {
      const pt = [pit.lat, pit.lng];
      allBounds.push(pt);
      frameBounds.push(pt);

      const pitPhotosList = (pit.photos && pit.photos.length > 0) ? pit.photos : [];
      const pitName = pit.name || pit.id || 'Pit';
      const depthStr = pit.depth != null ? formatDepthM(pit.depth) : '';

      const tooltipText = [depthStr, pitName].filter(Boolean).join(' · ');

      const m = L.marker(pt, {
        icon: pitIcon({ role: 'mid', name: pitName, depth: pit.depth, showLabel: false }),
        zIndexOffset: 450
      });

      m.bindTooltip(tooltipText, {
        direction: 'top',
        offset: [0, -28],
        className: 'gis-tip',
        opacity: 1
      });

      if (pitPhotosList.length > 0) {
        m.on('click', () => openLightbox(pitPhotosList, 0));
      } else {
        m.bindPopup(gisPopupHtml({
          eyebrow: 'Pit',
          title: pitName,
          rows: [
            ['Depth', pit.depth != null ? formatDepthM(pit.depth) : '—'],
            ['Width', pit.width != null ? `${Number(pit.width).toFixed(2)}m` : '—'],
            ['Side', pit.side],
            ['Type', pit.type],
            ['Time', pit.diggingTime],
          ],
        }), { maxWidth: 260, className: 'gis-popup' });
      }

      layerGroup.addLayer(m);
    });

    // 3. Depth captures — sample + scale with zoom so pins do not stack
    const depthPoints = executionData.depthPoints || [];
    depthPoints.forEach((dp) => {
      if (dp.lat != null && dp.lng != null) allBounds.push([dp.lat, dp.lng]);
    });

    const paintDepths = () => {
      const depthLayer = depthLayerRef.current;
      if (!depthLayer || !mapInstanceRef.current) return;
      depthLayer.clearLayers();
      const map = mapInstanceRef.current;
      const z = map.getZoom();
      const lastIdx = depthPoints.length - 1;
      const step = depthSampleStep(z, depthPoints.length);

      // Pixel-based collision detection to ensure depth badges never overlap on screen
      const MIN_BADGE_DIST_PX = 75;
      const labeledIndices = new Set();
      const placedPositions = [];

      const canPlaceBadge = (pt) => {
        for (const pos of placedPositions) {
          const dx = pt.x - pos.x;
          const dy = pt.y - pos.y;
          if (Math.hypot(dx, dy) < MIN_BADGE_DIST_PX) {
            return false;
          }
        }
        return true;
      };

      // 1. Always prioritize live/last point depth badge
      if (lastIdx >= 0) {
        const dpLast = depthPoints[lastIdx];
        if (dpLast && dpLast.lat != null && dpLast.lng != null) {
          try {
            const pt = map.latLngToContainerPoint([dpLast.lat, dpLast.lng]);
            labeledIndices.add(lastIdx);
            placedPositions.push(pt);
          } catch (e) { }
        }
      }

      // 2. Prioritize start point depth badge
      if (depthPoints.length > 1) {
        const dpFirst = depthPoints[0];
        if (dpFirst && dpFirst.lat != null && dpFirst.lng != null) {
          try {
            const pt = map.latLngToContainerPoint([dpFirst.lat, dpFirst.lng]);
            if (canPlaceBadge(pt)) {
              labeledIndices.add(0);
              placedPositions.push(pt);
            }
          } catch (e) { }
        }
      }

      // 3. Sample intermediate depth points with screen pixel collision check
      depthPoints.forEach((dp, idx) => {
        if (idx === 0 || idx === lastIdx) return;
        if (dp.lat == null || dp.lng == null) return;
        if (idx % step !== 0) return;

        try {
          const pt = map.latLngToContainerPoint([dp.lat, dp.lng]);
          if (canPlaceBadge(pt)) {
            labeledIndices.add(idx);
            placedPositions.push(pt);
          }
        } catch (e) { }
      });

      // Render markers
      depthPoints.forEach((dp, idx) => {
        const isLast = idx === lastIdx;
        const isKey = idx === 0 || isLast;
        if (!isKey && idx % step !== 0) return;

        // Last depth capture always shows static green depth badge; intermediate depth pins reveal dark tooltip on cursor hover
        const showLabel = isLast;

        let dateStr = '';
        if (dp.capturedAt) {
          try {
            const d = new Date(dp.capturedAt);
            if (!isNaN(d.getTime())) {
              const day = d.getDate();
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
              const monthName = months[d.getMonth()];
              let hours = d.getHours();
              const minutes = String(d.getMinutes()).padStart(2, '0');
              const ampm = hours >= 12 ? 'pm' : 'am';
              hours = hours % 12 || 12;
              dateStr = `${day} ${monthName}, ${hours}:${minutes} ${ampm}`;
            }
          } catch (e) { /* ignore */ }
        }

        const size = depthDotSize(z);
        const m = L.marker([dp.lat, dp.lng], {
          icon: depthPointIcon({
            depth: dp.depth,
            size,
            showLabel,
            isKey,
            isLive: isLast,
            side: idx % 2 === 0 ? 'right' : 'left',
          }),
          zIndexOffset: isLast ? 600 : 200,
        });

        const tooltipText = [
          formatDepthM(dp.depth),
          dateStr
        ].filter(Boolean).join(' · ');

        m.bindTooltip(tooltipText, {
          direction: 'top',
          offset: [0, -26],
          className: 'gis-tip',
          opacity: 1,
        });

        if (allDepthPhotos.length > 0) {
          m.on('click', () => openLightbox(allDepthPhotos, idx));
        }

        depthLayer.addLayer(m);
      });

      applyGisZoomLabels(mapInstanceRef.current);
    };

    if (map.__gisPaintDepths) {
      map.off('zoomend', map.__gisPaintDepths);
    }
    map.__gisPaintDepths = paintDepths;
    map.on('zoomend', paintDepths);
    paintDepths();

    // Frame the trench on first load — overview, then zoom in for depths
    if (!isInitialFitDoneRef.current) {
      const fit = frameBounds.length ? frameBounds : allBounds;
      if (fit.length > 1) {
        map.fitBounds(fit, { padding: [80, 96], maxZoom: 16, animate: false });
      } else if (fit.length === 1) {
        map.setView(fit[0], 16);
      }
      isInitialFitDoneRef.current = true;
      paintDepths();
    }

    setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.invalidateSize();
        } catch (e) { }
      }
    }, 150);
  }, [executionData, mapType, selectedDate, viewMode]);

  const closeMap = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/map-view/trenching');
  };

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const fitRouteBounds = () => {
    if (viewMode === '3d') {
      setFitNonce((n) => n + 1);
      return;
    }
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const groups = [layerGroupRef.current, depthLayerRef.current].filter(Boolean);
    const bounds = groups.reduce((acc, group) => {
      const next = group.getBounds();
      if (!next.isValid()) return acc;
      return acc ? acc.extend(next) : next;
    }, null);
    if (bounds?.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [80, 96], maxZoom: 16 });
    }
  };

  if (loading) {
    return <LoadingSpinner title="Loading..." subtitle="Fetching map data & telemetry" />;
  }

  if (error || !executionData) {
    return (
      <div className="screen-container">
        <EmptyState
          title="Map could not load"
          subtitle={error || 'Unable to display this HDD execution.'}
        >
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" className="btn-secondary" onClick={closeMap}>Close</button>
            <button type="button" className="btn-primary" onClick={() => fetchExecutionDetail(true)}>Retry</button>
          </div>
        </EmptyState>
      </div>
    );
  }

  const hasGpsData = (executionData.shots && executionData.shots.length > 0) ||
    (executionData.pits && executionData.pits.length > 0) ||
    (executionData.depthPoints && executionData.depthPoints.length > 0);

  return (
    <div className="map-viewer-page">

      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxPhotos(null)}
        />
      )}

      <div className="map-viewer-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button type="button" className="btn-secondary" onClick={closeMap} title="Close map">
            <LucideArrowLeft size={16} /> Close
          </button>
          <div style={{ minWidth: 0 }}>
            <div className="page-title" style={{ fontSize: '0.9375rem' }}>Execution map</div>
            <div className="page-subtitle" style={{ marginTop: 0 }}>
              {executionData.user || 'Supervisor'} · {executionData.district || executionData.state || '—'}
            </div>
          </div>
        </div>

        <div className="map-viewer-toolbar-meta">
          <DateField
            required
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            aria-label="Execution date"
          />
          <span className="map-viewer-toolbar-stats">
            {executionData.statistics.totalShots} trenches
            {' · '}
            {executionData.statistics.totalPits} pits
            {' · '}
            {executionData.statistics.formattedDistance}
            {' · '}
            {executionData.statistics.totalDepthReadings} depths
            {executionData.statistics.depthRange ? ` · ${executionData.statistics.depthRange}` : ''}
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchExecutionDetail(false)}
            disabled={isRefreshing}
          >
            <LucideRefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Main Full-Width Interactive GIS Map Container */}
      <div
        ref={wrapperRef}
        className="map-viewer-canvas"
      >
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 400, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="gis-map-chip">
            <button type="button" className={mapType === 'street' ? 'is-active' : ''} onClick={() => setMapType('street')}>
              Map
            </button>
            <button type="button" className={mapType === 'satellite' ? 'is-active' : ''} onClick={() => setMapType('satellite')}>
              Satellite
            </button>
          </div>
        </div>

        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 400, display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 'min(520px, calc(100% - 180px))' }}>
          {viewMode === '3d' && (
            <div className="gis-map-note">
              Some points overlap in 3D for a clearer view. Switch to 2D for full detail.
            </div>
          )}
          <div className="gis-map-chip">
            <button type="button" className={viewMode === '2d' ? 'is-active' : ''} onClick={() => setViewMode('2d')}>
              2D
            </button>
            <button type="button" className={viewMode === '3d' ? 'is-active' : ''} onClick={() => setViewMode('3d')}>
              3D
            </button>
          </div>
          <button type="button" className="gis-map-icon-btn" onClick={fitRouteBounds} title="Fit to trench">
            <LucideGlobe size={15} /> Fit route
          </button>
          <button type="button" className="gis-map-icon-btn" onClick={toggleFullscreen} title="Toggle fullscreen" style={{ width: 36, padding: 0, justifyContent: 'center' }}>
            {isFullscreen ? <LucideMinimize2 size={16} /> : <LucideMaximize2 size={16} />}
          </button>
        </div>

        {viewMode === '3d' ? (
          <Map3dBoundary>
            <Suspense fallback={<div className="gis-map3d-loading">Loading 3D view…</div>}>
              <GisExecutionMap3D
                executionData={executionData}
                mapType={mapType}
                fitNonce={fitNonce}
                onOpenLightbox={openLightbox}
              />
            </Suspense>
          </Map3dBoundary>
        ) : (
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
        )}



        {/* Empty State Banner if no valid GPS data exists for selected date */}
        {!hasGpsData && (
          <div className="gis-empty-overlay">
            <EmptyState
              title="No execution on this date"
              subtitle={`No pits, trenches, or depth points for ${selectedDate || 'the selected day'}.`}
            />
          </div>
        )}
      </div>

    </div>
  );
};
