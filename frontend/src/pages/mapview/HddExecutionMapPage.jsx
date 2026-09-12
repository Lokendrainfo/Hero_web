import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideMaximize2,
  LucideMinimize2,
  LucideLayers,
  LucideUser,
  LucideBuilding2,
  LucideMapPin,
  LucideGlobe,
  LucideClock,
  LucideActivity,
  LucideAlertCircle,
  LucideChevronRight,
  LucideChevronLeft,
  LucideCalendar,
  LucideMenu
} from 'lucide-react';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../hooks/useAuth';
import { mapHddExecutionResponse, filterHddExecutionByDate, parseDateToYMD } from '../../utils/mapHddExecutionResponse';
import { PhotoLightbox, formatImageUrl } from '../../components/common/PhotoLightbox';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const HddExecutionMapPage = () => {
  const { executionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { roles, vendors, isAdmin, hasPermission } = useAuth();

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Lightbox State
  const [lightboxPhotos, setLightboxPhotos] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
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

          // Merge any valid child shots and pits into THIS user's execution object ONLY if child belongs to the same user!
          childResults.filter(Boolean).forEach(childNorm => {
            const isSameUser = !childNorm.user || (childNorm.user.toLowerCase().trim() === (normalized.user || '').toLowerCase().trim());
            if (!isSameUser) return;

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
        attributionControl: false
      });

      mapInstanceRef.current = map;
      layerGroupRef.current = L.featureGroup().addTo(map);
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

    const allBounds = [];

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

    // 1. Render Trenches (Pit A to Pit B with route & depth labels)
    (executionData.shots || []).forEach((shot, sIdx) => {
      const cleanShotId = String(shot.id || `shot_${sIdx}`).replace(/[^a-zA-Z0-9]/g, '_');
      window[`__openTrenchLightbox_${cleanShotId}`] = () => {
        if (shot.photos && shot.photos.length > 0) {
          openLightbox(shot.photos, 0);
        }
      };

      if (shot.route && shot.route.length > 1) {
        const line = L.polyline(shot.route, {
          color: '#ef4444',
          weight: 5,
          opacity: 0.95
        }).addTo(layerGroup);

        shot.route.forEach(pt => allBounds.push(pt));

        const popupContent = `
          <div style="font-family: Inter, sans-serif; padding: 6px 4px; width: 230px;">
            <div style="font-weight: 800; color: #dc2626; font-size: 0.9rem; margin-bottom: 6px;">
              🚜 TRENCH ${shot.serialNo || shot.id}
            </div>
            <div style="font-size: 0.8rem; color: #334155; display: flex; flex-direction: column; gap: 4px;">
              <div><strong>Start Pit:</strong> ${shot.startPit?.name || 'N/A'}</div>
              <div><strong>End Pit:</strong> ${shot.endPit?.name || 'N/A'}</div>
              <div><strong>Average Depth:</strong> <span style="color: #2563eb; font-weight: 800; font-size: 0.95rem;">${shot.depth} m</span></div>
              <div><strong>Trench Length:</strong> ${shot.formattedLength}</div>
              <div><strong>Depth Captures:</strong> ${shot.depthReadingsCount} recorded</div>
              <div><strong>Strata:</strong> ${shot.strataType}</div>
            </div>
            ${(shot.photos && shot.photos.length > 0) ? `
              <button
                onclick="window.__openTrenchLightbox_${cleanShotId}()"
                style="margin-top: 8px; width: 100%; padding: 6px 10px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;"
              >
                🎬 View Trench Media (${shot.photos.length})
              </button>
            ` : ''}
          </div>
        `;
        line.bindPopup(popupContent);
      }


    });

    // 2. Render Pit Markers (Clickable Pin & Popup)
    (executionData.pits || []).forEach((pit, pIdx) => {
      const pt = [pit.lat, pit.lng];
      allBounds.push(pt);

      const cleanPitId = String(pit.id || `pit_${pIdx}`).replace(/[^a-zA-Z0-9]/g, '_');
      const pitPhotosList = (pit.photos && pit.photos.length > 0) ? pit.photos : [{
        label: `Pit ${pit.name || pit.id}`,
        title: `Pit ${pit.name || pit.id}`,
        latitude: pit.lat,
        longitude: pit.lng,
        depth: pit.depth,
        capturedAt: pit.diggingTime,
        photoUrl: null
      }];

      window[`__openPitLightbox_${cleanPitId}`] = () => {
        openLightbox(pitPhotosList, 0);
      };

      const pitMediaCount = pit.photos ? pit.photos.length : 0;
      const firstPhotoUrl = (pit.photos && pit.photos[0]) ? pit.photos[0].photoUrl : null;

      const m = L.marker(pt, {
        icon: L.divIcon({
          className: 'gis-pit-marker',
          html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer; user-select: none;">
              <!-- Yellow Teardrop Target Pin -->
              <svg width="30" height="40" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.45));">
                <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#f59e0b" stroke="#ffffff" stroke-width="1.8"/>
                <circle cx="12" cy="11" r="5.5" fill="none" stroke="#ffffff" stroke-width="2.5"/>
                <circle cx="12" cy="11" r="2" fill="#ffffff"/>
              </svg>
            </div>
          `,
          iconSize: [30, 40],
          iconAnchor: [15, 40]
        })
      });

      // Direct pin click opens Pit Photo Lightbox
      m.on('click', () => {
        openLightbox(pitPhotosList, 0);
      });

      const popupHtml = `
        <div style="font-family: Inter, sans-serif; padding: 6px 4px; width: 230px;">
          <div style="font-weight: 800; color: #b45309; font-size: 0.9rem; margin-bottom: 4px;">
            🚜 ${pit.name || pit.id}
          </div>
          <div style="font-size: 0.78rem; color: #334155; margin-bottom: 6px;">
            ${pit.depth ? `Depth: <strong>${pit.depth} m</strong> | ` : ''}${pit.width ? `Width: <strong>${pit.width} m</strong><br/>` : ''}
            Side: <strong>${pit.side}</strong> | Type: <strong>${pit.type}</strong><br/>
            📍 ${pit.lat.toFixed(6)}, ${pit.lng.toFixed(6)}<br/>
            Time: <strong>${pit.diggingTime}</strong>
          </div>
          <div style="text-align: center; cursor: pointer;" onclick="window.__openPitLightbox_${cleanPitId}() && window.__openPitLightbox_${cleanPitId}()">
            ${firstPhotoUrl ? `
              <img src="${firstPhotoUrl}" alt="Pit Media" style="width: 100%; height: 130px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 6px;" />
            ` : ''}
            <button style="width: 100%; padding: 6px 10px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer;">
              📸 View ${pitMediaCount > 0 ? `${pitMediaCount} Pit Photos/Videos` : 'Pit Details'}
            </button>
          </div>
        </div>
      `;

      m.bindPopup(popupHtml, { maxWidth: 260 });
      layerGroup.addLayer(m);
    });

    // 3. Render Individual Depth Points (Clickable Pin & Lightbox Photo Navigation)
    (executionData.depthPoints || []).forEach((dp, idx) => {
      const pt = [dp.lat, dp.lng];
      allBounds.push(pt);

      const dpPhotos = dp.photos || [];
      const dpPhotoObj = dpPhotos[0] || {};
      const imgFullUrl = dpPhotoObj.photoUrl || (dp.photo && (dp.photo.photoUrl || dp.photo.url)) || null;

      let dateStr = 'N/A';
      if (dp.capturedAt) {
        try {
          const d = new Date(dp.capturedAt);
          if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            });
          }
        } catch (e) { }
      }

      const dpId = dp.id || `ASH-DPT${String(dp.pointNo || idx + 1).padStart(8, '0')}`;

      window[`__openDpLightbox_${idx}`] = () => {
        openLightbox(allDepthPhotos, idx);
      };

      const m = L.marker(pt, {
        icon: L.divIcon({
          className: 'gis-dp-marker',
          html: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer; user-select: none;">
                  <div style="background: #ffffff; color: #1e1b4b; border: 1.5px solid #7c3aed; padding: 1px 5px; border-radius: 4px; font-size: 0.68rem; font-weight: 800; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.3); margin-bottom: 2px; line-height: 1.1;">
                    ${dp.depth}m
                  </div>
                  <svg width="18" height="22" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.4)); flex-shrink: 0;">
                    <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#7c3aed"/>
                    <circle cx="12" cy="11" r="5" fill="#ffffff"/>
                    <circle cx="12" cy="11" r="2.5" fill="#6d28d9"/>
                  </svg>
                </div>`,
          iconSize: [50, 42],
          iconAnchor: [25, 42]
        })
      });

      // Direct pin click opens Photo Lightbox at exact depth index
      m.on('click', () => {
        openLightbox(allDepthPhotos, idx);
      });

      const popupHtml = `
        <div style="font-family: Inter, sans-serif; width: 230px; padding: 6px 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 6px; color: #8b5cf6; font-weight: 700; font-size: 0.88rem;">
              <span>📍</span>
              <span style="color: #1e293b; font-weight: 800;">Depth Point</span>
            </div>
            <span style="font-size: 0.7rem; background: #f3e8ff; color: #7c3aed; padding: 2px 6px; border-radius: 4px; font-weight: 800;"># ${dp.pointNo || idx + 1}</span>
          </div>

          <div style="font-size: 0.8rem; color: #334155; margin-bottom: 4px;">
            <strong style="color: #475569;">ID:</strong> ${dpId}
          </div>

          <div style="font-size: 0.85rem; color: #334155; margin-bottom: 4px;">
            <strong style="color: #475569;">Depth:</strong> <span style="font-size: 1.15rem; font-weight: 800; color: #2563eb;">${dp.depth}m</span>
          </div>

          <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 10px;">
            <strong style="color: #475569;">Created:</strong> ${dateStr}
          </div>

          <div style="text-align: center; cursor: pointer;" onclick="window.__openDpLightbox_${idx}() && window.__openDpLightbox_${idx}()">
            ${imgFullUrl ? `
              <img src="${imgFullUrl}" alt="Depth Meter" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" />
            ` : ''}
            <div style="font-size: 0.72rem; color: #2563eb; margin-top: 6px; font-weight: 700;">🔍 Open Depth Photo & Navigation</div>
          </div>
        </div>
      `;

      m.bindPopup(popupHtml, { maxWidth: 260 });
      layerGroup.addLayer(m);
    });

    // 4. Draw Latest Position / Last Pit Marker (Bullseye Pin: Green & Blinking when Actively Ongoing, Red when Work Stopped)
    if (executionData.latestPosition) {
      const lp = executionData.latestPosition;
      const pt = [lp.lat, lp.lng];
      allBounds.push(pt);

      // Extract numeric depth string (e.g. 2.28m or 2.86m)
      const labelMatch = (lp.label || '').match(/\(([\d\.]+m)\)/);
      const depthVal = lp.depth !== undefined ? `${lp.depth}m` : (labelMatch ? labelMatch[1] : '2.28m');

      // Determine work status: Actively Ongoing vs Stopped
      const statusUpper = String(executionData.status || executionData.taskStatus || '').toUpperCase();
      const isOngoing = statusUpper.includes('PROGRESS') ||
                        statusUpper.includes('RUNNING') ||
                        statusUpper.includes('EXECUTION') ||
                        statusUpper.includes('ACTIVE') ||
                        statusUpper.includes('STARTED') ||
                        (executionData.depthPoints && executionData.depthPoints.length > 0 && selectedDate === (executionData.availableDates?.[executionData.availableDates.length - 1]));

      const statusColor = isOngoing ? '#10b981' : '#ef4444';
      const pulseRingColor = isOngoing ? '#34d399' : '#f87171';

      const lpIcon = L.divIcon({
        className: 'gis-latest-pos-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none;">
            ${isOngoing ? `
              <style>
                @keyframes gis-radar-pulse {
                  0% { transform: scale(0.5); opacity: 0.9; }
                  100% { transform: scale(1.8); opacity: 0; }
                }
              </style>
              <!-- Green Blinking Radar Pulse Rings for Actively Ongoing Work -->
              <div style="position: absolute; width: 44px; height: 44px; border: 2px solid ${statusColor}; border-radius: 50%; animation: gis-radar-pulse 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;"></div>
              <div style="position: absolute; width: 28px; height: 28px; border: 2px solid ${pulseRingColor}; border-radius: 50%; animation: gis-radar-pulse 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) 0.45s infinite;"></div>
            ` : ''}

            <!-- Compact Depth Badge -->
            <div style="position: absolute; top: -14px; right: -26px; background: ${statusColor}; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-weight: 800; font-size: 0.72rem; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.35); z-index: 12;">
              ${depthVal}
            </div>

            <!-- Solid Teardrop Pin with Center White Bullseye Circle (Matching User Screenshot) -->
            <div style="position: relative; z-index: 10;">
              <svg width="28" height="36" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.45));">
                <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="${statusColor}" stroke="#ffffff" stroke-width="1.5"/>
                <circle cx="12" cy="11" r="5" fill="none" stroke="#ffffff" stroke-width="2.5"/>
                <circle cx="12" cy="11" r="1.8" fill="#ffffff"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [60, 45],
        iconAnchor: [30, 34]
      });

      const m = L.marker(pt, { icon: lpIcon, zIndexOffset: 1000 });
      m.bindPopup(`<b>Latest Active Position (${isOngoing ? 'Actively Ongoing' : 'Work Stopped'})</b><br/>${lp.label}<br/>📍 ${lp.lat.toFixed(6)}, ${lp.lng.toFixed(6)}`);
      layerGroup.addLayer(m);
    }

    // Preserve map center and zoom level on 3-minute auto-refresh; only fit bounds on initial load
    if (!isInitialFitDoneRef.current) {
      if (allBounds.length > 1) {
        map.fitBounds(allBounds, { padding: [50, 50] });
      } else if (allBounds.length === 1) {
        map.setView(allBounds[0], 14);
      }
      isInitialFitDoneRef.current = true;
    }

    setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.invalidateSize();
        } catch (e) { }
      }
    }, 150);
  }, [executionData, mapType]);

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const fitRouteBounds = () => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const bounds = layerGroupRef.current.getBounds();
    if (bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  if (loading) {
    return <LoadingSpinner title="Loading..." subtitle="Fetching map data & telemetry" />;
  }

  if (error || !executionData) {
    return (
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
          <LucideAlertCircle size={36} color="#dc2626" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#991b1b', margin: 0 }}>Map Execution Load Error</h3>
          <p style={{ fontSize: '0.85rem', color: '#7f1d1d', marginTop: '6px' }}>{error || 'Unable to display requested HDD map execution.'}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
            <button onClick={() => navigate('/map-view')} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }}>
              ← Back to Map View
            </button>
            <button onClick={() => fetchExecutionDetail(true)} style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasGpsData = (executionData.shots && executionData.shots.length > 0) ||
    (executionData.pits && executionData.pits.length > 0) ||
    (executionData.depthPoints && executionData.depthPoints.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', boxSizing: 'border-box' }}>

      {/* Lightbox Modal */}
      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxPhotos(null)}
        />
      )}

      {/* ilync-Live Top Status Bar */}
      <div
        className="app-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          padding: '10px 18px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}
      >
        {/* Left: Back & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate(`/map-view/trenching${selectedDate ? `?date=${selectedDate}` : ''}`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: '700',
              color: '#334155',
              cursor: 'pointer'
            }}
            title="Back to Trenching View"
          >
            <LucideArrowLeft size={16} /> Back
          </button>

          <h2 style={{ fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: '800', margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>ilync-Live</span>
          </h2>
        </div>

        {/* Right: Date Picker | Supervisor (State) | Stats Summary | Live Timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.84rem', color: '#475569' }}>

          {/* Date Picker matching ilync-Live style */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '8px' }}>
            <LucideCalendar size={15} color="#059669" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.82rem',
                fontWeight: '700',
                color: '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          <div style={{ width: '1px', height: '16px', background: '#cbd5e1' }} />

          {/* User & State */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideUser size={16} color="#64748b" />
            <span style={{ fontWeight: '800', color: '#0f172a' }}>{executionData.user || 'Supervisor'}</span>
            <span style={{ color: '#64748b' }}>({executionData.state || executionData.district || 'RAJASTHAN'})</span>
          </div>

          <div style={{ width: '1px', height: '16px', background: '#cbd5e1' }} />

          {/* Date-Specific Execution Statistics Summary */}
          <div style={{ color: '#334155' }}>
            <strong>{executionData.statistics.totalShots}</strong> Trenches, <strong>{executionData.statistics.totalPits}</strong> pits ({executionData.statistics.formattedDistance}), <strong>{executionData.statistics.totalDepthReadings}</strong> depth captures, Depth: <strong>{executionData.statistics.depthRange || 'N/A'}</strong>
          </div>

          <div style={{ width: '1px', height: '16px', background: '#cbd5e1' }} />

          {/* Manual Refresh Button */}
          <button
            onClick={() => fetchExecutionDetail(false)}
            disabled={isRefreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <LucideRefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
            {lastUpdated && (
              <span style={{ color: '#a7f3d0', fontWeight: '600', fontSize: '0.72rem', marginLeft: '4px' }}>
                • Last: {lastUpdated}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Full-Width Interactive GIS Map Container */}
      <div
        ref={wrapperRef}
        style={{
          width: '100%',
          height: isFullscreen ? '100vh' : 'calc(100vh - 160px)',
          minHeight: '600px',
          position: 'relative',
          background: '#ffffff',
          borderRadius: isFullscreen ? '0' : '14px',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
        }}
      >
        {/* Top Left Controls: Map/Satellite Switch */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(6px)',
            borderRadius: '8px',
            padding: '3px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            <button
              onClick={() => setMapType('street')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: '800',
                background: mapType === 'street' ? '#ffffff' : 'transparent',
                color: mapType === 'street' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: mapType === 'street' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              Map
            </button>
            <button
              onClick={() => setMapType('satellite')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: '800',
                background: mapType === 'satellite' ? '#ffffff' : 'transparent',
                color: mapType === 'satellite' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: mapType === 'satellite' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              Satellite
            </button>
          </div>
        </div>

        {/* Top Right Controls: Fit to Route & Fullscreen */}
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button
            onClick={fitRouteBounds}
            style={{
              height: '38px',
              padding: '0 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              color: '#0f172a',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
            title="Fit Map to Trench Bounds"
          >
            <LucideGlobe size={16} color="#059669" /> Fit Route
          </button>

          <button
            onClick={toggleFullscreen}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <LucideMinimize2 size={18} color="#0f172a" /> : <LucideMaximize2 size={18} color="#0f172a" />}
          </button>
        </div>

        {/* Leaflet Map Canvas */}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

        {/* Empty State Banner if no valid GPS data exists for selected date */}
        {!hasGpsData && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #cbd5e1',
            borderRadius: '14px',
            padding: '24px 32px',
            textAlign: 'center',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            maxWidth: '420px'
          }}>
            <LucideAlertCircle size={38} color="#0284c7" style={{ margin: '0 auto 10px auto' }} />
            <div style={{ fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>No HDD/Trench execution data available for this date.</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>No recorded GPS depth coordinates, pits, or trenching data were found for {selectedDate}.</div>
          </div>
        )}
      </div>

    </div>
  );
};
