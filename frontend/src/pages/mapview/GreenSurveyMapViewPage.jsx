import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LucidePlay,
  LucidePause,
  LucideVolume2,
  LucideVolumeX,
  LucideMaximize2,
  LucideMinimize2,
  LucideCompass,
  LucideMapPin,
  LucideVideo,
  LucideRefreshCw,
  LucideArrowLeft,
  LucideCheckCircle2,
  LucideClock,
  LucideLayers,
  LucideGlobe,
  LucideChevronRight,
  LucideAlertCircle,
  LucideNavigation,
  LucideImage
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { taskService } from '../../services/taskService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { PhotoLightbox } from '../../components/common/PhotoLightbox';
import './GreenSurveyMapViewPage.css';

// Custom Marker Icons for Leaflet
const createBeaconIcon = () => {
  return L.divIcon({
    className: 'green-live-beacon',
    html: `
      <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(16, 185, 129, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <span style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: #10b981; border: 2.5px solid #ffffff; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

const createPinIcon = (color, label) => {
  return L.divIcon({
    className: 'green-custom-pin',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="background: ${color}; color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.8); box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">
          ${label}
        </div>
        <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${color};"></div>
      </div>
    `,
    iconSize: [60, 32],
    iconAnchor: [30, 32]
  });
};

const createNodeIcon = (type, sequence, code) => {
  const isGP = type === 'GP';
  const bg = isGP ? '#0284c7' : '#d97706';
  return L.divIcon({
    className: 'green-node-marker',
    html: `
      <div style="width: 22px; height: 22px; border-radius: 50%; background: ${bg}; color: #ffffff; font-size: 9px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35);" title="${code || type}">
        ${sequence !== undefined ? sequence : (isGP ? 'GP' : 'J')}
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
};

export const GreenSurveyMapViewPage = () => {
  const { hasPermission, isAdmin } = useAuth();
  const hasAccess = isAdmin || hasPermission('mapview.green_field') || hasPermission('green_field.view') || hasPermission('mapview.green_survey');

  const { taskId: paramTaskId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Active query parameters
  const queryTaskId = paramTaskId || searchParams.get('taskId') || searchParams.get('task_id') || '';
  const initialDistrict = searchParams.get('district') || 'ALL';
  const initialBlock = searchParams.get('block') || 'ALL';

  // Component State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Survey Data State
  const [taskList, setTaskList] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [summaryStats, setSummaryStats] = useState(null);
  const [allDistricts, setAllDistricts] = useState([]);
  const [allBlocks, setAllBlocks] = useState([]);

  // Filters State
  const [selectedDistrict, setSelectedDistrict] = useState(initialDistrict);
  const [selectedBlock, setSelectedBlock] = useState(initialBlock);

  // Map & GIS State
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const polylineLayerRef = useRef(null);
  const nodesLayerRef = useRef(null);
  const beaconMarkerRef = useRef(null);
  const [mapType, setMapType] = useState('satellite');
  const [followBeacon, setFollowBeacon] = useState(false);

  // Video Player State
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1.0);
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);

  // Lightbox State for Survey Photos
  const [lightboxPhotos, setLightboxPhotos] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // 1. Fetch Green Survey Map & Video Data
  const fetchGreenData = useCallback(async (overrideParams = {}, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const activeTid = overrideParams.taskId !== undefined ? overrideParams.taskId : queryTaskId;
      const activeDist = overrideParams.district !== undefined ? overrideParams.district : selectedDistrict;
      const activeBlk = overrideParams.block !== undefined ? overrideParams.block : selectedBlock;

      const params = {};
      if (activeTid) {
        params.taskId = activeTid;
      }
      if (activeDist && activeDist !== 'ALL') {
        params.district = activeDist;
      }
      if (activeBlk && activeBlk !== 'ALL') {
        params.block = activeBlk;
      }
      if (isRefresh) {
        params.refresh = 'true';
      }

      const res = await taskService.getGreenSurveyMapData(params);
      const data = res?.data?.data || res?.data || res || {};

      const tasks = Array.isArray(data.tasks) ? data.tasks : (data.selectedTask ? [data.selectedTask] : []);
      setTaskList(tasks);
      setSummaryStats(data.summary || null);

      if (Array.isArray(data.districts) && data.districts.length > 0) {
        setAllDistricts(data.districts);
      }
      if (Array.isArray(data.blocks) && data.blocks.length > 0) {
        setAllBlocks(data.blocks);
      }

      if (data.selectedTask) {
        setSelectedTask(data.selectedTask);
        if (data.selectedTask.district && (activeDist === 'ALL' || !activeDist)) {
          setSelectedDistrict(data.selectedTask.district);
        }
        if (data.selectedTask.block && (activeBlk === 'ALL' || !activeBlk)) {
          setSelectedBlock(data.selectedTask.block);
        }
      } else if (tasks.length > 0) {
        setSelectedTask(tasks[0]);
      } else {
        setSelectedTask(null);
      }
    } catch (err) {
      console.error('[GreenSurveyMapViewPage] Error loading green survey data:', err);
      setError(err?.message || 'Failed to load Green Survey map & video data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryTaskId, selectedDistrict, selectedBlock]);

  // Initial load
  useEffect(() => {
    if (hasAccess) {
      fetchGreenData();
    }
  }, [hasAccess]);

  // Filter change handlers
  const handleDistrictChange = (newDist) => {
    setSelectedDistrict(newDist);
    setSelectedBlock('ALL');
    fetchGreenData({ district: newDist, block: 'ALL', taskId: '' });
  };

  const handleBlockChange = (newBlk) => {
    setSelectedBlock(newBlk);
    fetchGreenData({ district: selectedDistrict, block: newBlk, taskId: '' });
  };

  const handleTaskChange = (newTaskId) => {
    const matched = taskList.find(t => String(t.id) === String(newTaskId));
    if (matched) {
      setSelectedTask(matched);
      setSearchParams({ taskId: matched.id });
      // Fetch full details and video manifests for the newly selected task
      fetchGreenData({ taskId: matched.id, district: selectedDistrict, block: selectedBlock });
    }
  };

  // Derived video chunks & active manifest
  const activeVideo = useMemo(() => {
    if (!selectedTask || !selectedTask.videos || selectedTask.videos.length === 0) return null;
    return selectedTask.videos[0];
  }, [selectedTask]);

  const activeChunks = useMemo(() => {
    if (!activeVideo || !activeVideo.chunks) return [];
    return activeVideo.chunks.filter(c => c && (c.s3Key || c.url));
  }, [activeVideo]);

  const streamUrl = useMemo(() => {
    if (!activeVideo || !activeVideo.manifestKey) return null;
    return `/api/v1/integrations/tasks/green-survey-video-stream/?manifest=${encodeURIComponent(activeVideo.manifestKey)}`;
  }, [activeVideo]);

  // Reset chunk index when selected task changes
  useEffect(() => {
    setActiveChunkIndex(0);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [selectedTask?.id]);

  // 2. Initialize and Maintain Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter = [28.07, 76.44];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

      polylineLayerRef.current = L.featureGroup().addTo(map);
      nodesLayerRef.current = L.featureGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Tile Layer switch (Satellite vs Street)
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const tileUrl = mapType === 'satellite'
      ? 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      : 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

    tileLayerRef.current = L.tileLayer(tileUrl, {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20
    }).addTo(map);

    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }, [mapType, loading]);

  // 3. Render Route Polyline, Nodes, Start/End Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedTask) return;
    const map = mapInstanceRef.current;
    const polyGroup = polylineLayerRef.current;
    const nodesGroup = nodesLayerRef.current;

    if (polyGroup) polyGroup.clearLayers();
    if (nodesGroup) nodesGroup.clearLayers();

    if (beaconMarkerRef.current) {
      map.removeLayer(beaconMarkerRef.current);
      beaconMarkerRef.current = null;
    }

    const pathCoords = (selectedTask.path || []).map(p => [p.lat, p.lng]);
    const bounds = [...pathCoords];

    // Survey Polyline
    if (pathCoords.length > 1) {
      // Background glow
      L.polyline(pathCoords, {
        color: '#059669',
        weight: 7,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(polyGroup);

      // Core route line
      L.polyline(pathCoords, {
        color: '#10b981',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(polyGroup);
    }

    // Start Pin Marker
    if (selectedTask.startCoord && selectedTask.startCoord.lat && selectedTask.startCoord.lng) {
      const startPt = [selectedTask.startCoord.lat, selectedTask.startCoord.lng];
      const startMarker = L.marker(startPt, {
        icon: createPinIcon('#059669', 'START'),
        zIndexOffset: 600
      }).bindPopup(`
        <div style="font-size: 12px; font-weight: 600;">
          <div style="color: #059669; font-weight: 700; margin-bottom: 2px;">SURVEY START POINT</div>
          <div>Task: ${selectedTask.taskCode}</div>
          <div>Lat: ${selectedTask.startCoord.lat.toFixed(6)}</div>
          <div>Lng: ${selectedTask.startCoord.lng.toFixed(6)}</div>
        </div>
      `);
      nodesGroup.addLayer(startMarker);
      bounds.push(startPt);
    }

    // End Pin Marker
    if (selectedTask.endCoord && selectedTask.endCoord.lat && selectedTask.endCoord.lng) {
      const endPt = [selectedTask.endCoord.lat, selectedTask.endCoord.lng];
      const endMarker = L.marker(endPt, {
        icon: createPinIcon('#dc2626', 'END'),
        zIndexOffset: 600
      }).bindPopup(`
        <div style="font-size: 12px; font-weight: 600;">
          <div style="color: #dc2626; font-weight: 700; margin-bottom: 2px;">SURVEY END POINT</div>
          <div>Task: ${selectedTask.taskCode}</div>
          <div>Lat: ${selectedTask.endCoord.lat.toFixed(6)}</div>
          <div>Lng: ${selectedTask.endCoord.lng.toFixed(6)}</div>
        </div>
      `);
      nodesGroup.addLayer(endMarker);
      bounds.push(endPt);
    }

    // GP & Joint Nodes
    (selectedTask.nodes || []).forEach(node => {
      if (node.lat != null && node.lng != null) {
        const pt = [node.lat, node.lng];
        const m = L.marker(pt, {
          icon: createNodeIcon(node.type, node.sequence, node.code),
          zIndexOffset: 500
        }).bindPopup(`
          <div style="font-size: 12px; font-weight: 600;">
            <div style="color: #0284c7; font-weight: 700; margin-bottom: 2px;">${node.type || 'NODE'} ${node.code || ''}</div>
            <div>Name: ${node.name || '—'}</div>
            <div>Sequence: #${node.sequence}</div>
            <div>Lat: ${Number(node.lat).toFixed(6)} · Lng: ${Number(node.lng).toFixed(6)}</div>
          </div>
        `);
        nodesGroup.addLayer(m);
        bounds.push(pt);
      }
    });

    // Create Synchronized Beacon Marker at Start
    const initialBeaconCoord = pathCoords.length > 0 ? pathCoords[0] : (bounds.length > 0 ? bounds[0] : null);
    if (initialBeaconCoord) {
      beaconMarkerRef.current = L.marker(initialBeaconCoord, {
        icon: createBeaconIcon(),
        zIndexOffset: 1000
      }).addTo(map);
    }

    // Fit map bounds to whole survey route
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 17 });
    }
  }, [selectedTask, loading]);

  // 4. Video Time Update & Synchronized Map Marker Tracking
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    const dur = videoRef.current.duration || duration || 1;
    const totalBytes = activeVideo?.totalBytes || (activeChunks[activeChunks.length - 1]?.byteEnd || 1);

    // Synchronize active chunk button indicator based on current playback byte offset
    if (dur > 0 && activeChunks.length > 0 && totalBytes > 0) {
      const curByte = (cur / dur) * totalBytes;
      const idx = activeChunks.findIndex(c => (c.byteStart || 0) <= curByte && curByte < (c.byteEnd || Infinity));
      if (idx !== -1 && idx !== activeChunkIndex) {
        setActiveChunkIndex(idx);
      }
    }

    const path = selectedTask?.path || [];
    if (path.length === 0) return;

    let targetCoord = null;

    // Priority 1: Match using Manifest syncPoints and gpsTrack
    if (activeVideo && activeVideo.syncPoints && activeVideo.syncPoints.length > 0 && activeVideo.gpsTrack && activeVideo.gpsTrack.length > 0) {
      const elapsedMs = Math.round(cur * 1000);
      const syncPts = activeVideo.syncPoints;
      let bestSync = syncPts[0];
      let minDiff = Math.abs((bestSync.elapsedMs || 0) - elapsedMs);
      for (let i = 1; i < syncPts.length; i++) {
        const diff = Math.abs((syncPts[i].elapsedMs || 0) - elapsedMs);
        if (diff < minDiff) {
          minDiff = diff;
          bestSync = syncPts[i];
        }
      }

      if (bestSync && bestSync.utc) {
        const track = activeVideo.gpsTrack;
        let bestGps = track[0];
        let minGpsDiff = Math.abs((bestGps.utc || 0) - bestSync.utc);
        for (let i = 1; i < track.length; i++) {
          const diff = Math.abs((track[i].utc || 0) - bestSync.utc);
          if (diff < minGpsDiff) {
            minGpsDiff = diff;
            bestGps = track[i];
          }
        }
        if (bestGps && bestGps.lat != null && bestGps.lng != null) {
          targetCoord = [bestGps.lat, bestGps.lng];
        }
      }
    }

    // Priority 2: Proportional interpolation along survey route path
    if (!targetCoord) {
      const progressFrac = Math.max(0, Math.min(1, cur / dur));
      const targetIdx = Math.round(progressFrac * (path.length - 1));
      const pt = path[targetIdx];
      if (pt) targetCoord = [pt.lat, pt.lng];
    }

    // Update beacon marker on the map smoothly
    if (targetCoord && beaconMarkerRef.current) {
      beaconMarkerRef.current.setLatLng(targetCoord);
      if (followBeacon && mapInstanceRef.current) {
        mapInstanceRef.current.panTo(targetCoord, { animate: true, duration: 0.25 });
      }
    }
  };

  // Video Control Handlers
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(err => {
            console.warn('[Green Video] Play attempt rejected:', err);
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
            }
          });
      }
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    videoRef.current.muted = next;
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const handleChunkSelect = (chunkIdx) => {
    if (chunkIdx < 0 || chunkIdx >= activeChunks.length) return;
    setActiveChunkIndex(chunkIdx);
    const chunk = activeChunks[chunkIdx];
    const dur = duration || (videoRef.current ? videoRef.current.duration : 0);
    const totalBytes = activeVideo?.totalBytes || (activeChunks[activeChunks.length - 1]?.byteEnd || 1);

    if (chunk && videoRef.current && dur > 0 && totalBytes > 0) {
      const frac = (chunk.byteStart || 0) / totalBytes;
      const targetSec = frac * dur;
      videoRef.current.currentTime = targetSec;
      setCurrentTime(targetSec);
      videoRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  const fitRouteBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || !selectedTask) return;
    const pathCoords = (selectedTask.path || []).map(p => [p.lat, p.lng]);
    if (pathCoords.length > 0) {
      map.fitBounds(L.latLngBounds(pathCoords), { padding: [50, 50], maxZoom: 17, animate: true });
    }
  };

  const formatSeconds = (sec) => {
    if (isNaN(sec) || sec == null) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Distinct list of blocks for current district
  const availableBlocksForDistrict = useMemo(() => {
    if (selectedDistrict === 'ALL' || !selectedDistrict) {
      return allBlocks;
    }
    const set = new Set();
    taskList.forEach(t => {
      if (t.district === selectedDistrict && t.block) set.add(t.block);
    });
    return Array.from(set).sort();
  }, [selectedDistrict, allBlocks, taskList]);

  // Current progress calculation for telemetry display
  const progressPercent = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return Math.min(100, Math.round((currentTime / duration) * 100));
  }, [currentTime, duration]);

  const coveredDistanceKm = useMemo(() => {
    const totalKm = selectedTask?.lengthKm || 0;
    return (totalKm * (progressPercent / 100)).toFixed(2);
  }, [selectedTask?.lengthKm, progressPercent]);

  if (!hasAccess) {
    return (
      <div className="green-survey-page" style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <EmptyState
          icon={LucideCompass}
          title="Access Restricted"
          subtitle="You do not have permission to view Green Field Survey data. Please contact your system administrator to assign the 'mapview.green_field' permission."
          actionText="Back to Tasks"
          onAction={() => navigate('/tasks')}
        />
      </div>
    );
  }

  return (
    <div className="green-survey-page">
      {/* Photo Lightbox */}
      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          taskId={selectedTask?.taskCode || ''}
          taskCode={selectedTask?.taskCode || ''}
          taskName={selectedTask?.displayName || ''}
          onClose={() => setLightboxPhotos(null)}
          onNavigate={(newIdx) => setLightboxIndex(newIdx)}
        />
      )}

      {/* Top Header & Toolbar */}
      <div className="page-header green-survey-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/tasks')}
            title="Back to Tasks"
          >
            <LucideArrowLeft size={16} /> Tasks
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#059669' }}>🌱</span> Green Survey Map View
              </h1>
              <span className="badge-pill badge-green" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                LIVE SURVEY VIDEO
              </span>
            </div>
            <p className="page-subtitle">
              NetInfra Green V2 route inspection with synchronized survey playback
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchGreenData({}, true)}
            disabled={refreshing || loading}
          >
            <LucideRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="app-card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px' }}>
        {/* District Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>District:</span>
          <select
            className="select"
            value={selectedDistrict}
            onChange={(e) => handleDistrictChange(e.target.value)}
            style={{ minWidth: 140, height: 32, fontSize: '0.8rem' }}
          >
            <option value="ALL">All Districts ({allDistricts.length})</option>
            {allDistricts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Block Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Block:</span>
          <select
            className="select"
            value={selectedBlock}
            onChange={(e) => handleBlockChange(e.target.value)}
            style={{ minWidth: 140, height: 32, fontSize: '0.8rem' }}
          >
            <option value="ALL">All Blocks</option>
            {availableBlocksForDistrict.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Survey Task Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 260px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Survey Task:</span>
          <select
            className="select"
            value={selectedTask?.id || ''}
            onChange={(e) => handleTaskChange(e.target.value)}
            style={{ width: '100%', height: 32, fontSize: '0.8rem' }}
          >
            {taskList.map(t => (
              <option key={t.id} value={t.id}>
                {t.taskCode} — {t.displayName || t.taskName} ({t.lengthKm} km){t.hasVideo ? ' 🎥' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="green-survey-kpi-strip">
        <div className="green-kpi-card">
          <span className="green-kpi-label">Survey Tasks</span>
          <span className="green-kpi-value">{summaryStats?.totalTasks ?? taskList.length}</span>
        </div>
        <div className="green-kpi-card">
          <span className="green-kpi-label">Total Distance</span>
          <span className="green-kpi-value">
            {summaryStats?.totalDistanceKm != null ? `${summaryStats.totalDistanceKm} km` : '—'}
          </span>
        </div>
        <div className="green-kpi-card">
          <span className="green-kpi-label">Videos Available</span>
          <span className="green-kpi-value" style={{ color: '#059669' }}>
            {summaryStats?.videoTasksCount ?? taskList.filter(t => t.hasVideo).length}
          </span>
        </div>
        <div className="green-kpi-card">
          <span className="green-kpi-label">Selected Route</span>
          <span className="green-kpi-value" style={{ fontSize: '1rem', color: '#0284c7' }}>
            {selectedTask ? `${selectedTask.lengthKm} km` : '—'}
          </span>
        </div>
      </div>

      {/* Main Responsive Split-Screen Container */}
      {loading && !selectedTask ? (
        <LoadingSpinner title="Loading Green Survey Map & Video" subtitle="Connecting to survey stream…" />
      ) : error && !selectedTask ? (
        <EmptyState title="Could not load Green Survey" subtitle={error}>
          <button type="button" className="btn-primary" onClick={() => fetchGreenData({}, true)}>
            <LucideRefreshCw size={14} /> Try Again
          </button>
        </EmptyState>
      ) : !selectedTask ? (
        <EmptyState
          title="No Green Survey Tasks Found"
          subtitle="No tasks match the selected district or block filter."
        />
      ) : (
        <div className="green-survey-split-layout">
          {/* Left Column: Leaflet Interactive Map */}
          <div className="green-map-col">
            <div ref={mapContainerRef} className="green-map-canvas" />

            {/* Top Left Controls: Street / Satellite Toggle */}
            <div className="green-map-overlay-top-left">
              <div className="green-map-chip">
                <button
                  type="button"
                  className={mapType === 'street' ? 'is-active' : ''}
                  onClick={() => setMapType('street')}
                >
                  Map
                </button>
                <button
                  type="button"
                  className={mapType === 'satellite' ? 'is-active' : ''}
                  onClick={() => setMapType('satellite')}
                >
                  Satellite
                </button>
              </div>
            </div>

            {/* Top Right Controls: Fit Route, Follow Beacon */}
            <div className="green-map-overlay-top-right">
              <button
                type="button"
                className={`green-map-btn${followBeacon ? ' is-active' : ''}`}
                onClick={() => setFollowBeacon(prev => !prev)}
                title="Auto-center map on video marker position"
              >
                <LucideNavigation size={13} />
                {followBeacon ? 'Tracking On' : 'Track Marker'}
              </button>

              <button
                type="button"
                className="green-map-btn"
                onClick={fitRouteBounds}
                title="Fit map to complete survey route"
              >
                <LucideGlobe size={13} /> Fit Route
              </button>
            </div>
          </div>

          {/* Right Column: Survey Video Player & Telemetry HUD */}
          <div className="green-video-col">
            <div className="green-video-card">
              {/* Card Header */}
              <div className="green-video-card-header">
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-main)' }}>
                    {selectedTask.displayName || selectedTask.taskName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Code: <strong>{selectedTask.taskCode}</strong> · Block: <strong>{selectedTask.block || '—'}</strong> · District: <strong>{selectedTask.district || '—'}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="badge-pill badge-green" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    {selectedTask.lengthKm} KM
                  </span>
                  {selectedTask.videos && selectedTask.videos.length > 0 && (
                    <span className="badge-pill badge-neutral" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                      {activeChunks.length} Chunks
                    </span>
                  )}
                </div>
              </div>

              {/* Video Player Display */}
              <div className="green-player-wrapper">
                {streamUrl ? (
                  <video
                    ref={videoRef}
                    key={streamUrl}
                    src={streamUrl}
                    className="green-survey-video-element"
                    playsInline
                    preload="auto"
                    muted={isMuted}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        setDuration(videoRef.current.duration);
                        videoRef.current.playbackRate = playbackRate;
                        videoRef.current.muted = isMuted;
                        videoRef.current.volume = volume;
                      }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={handleVideoEnded}
                    onClick={togglePlay}
                  />
                ) : (
                  <div className="green-video-empty-state">
                    <LucideVideo size={40} color="#64748b" />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#cbd5e1' }}>
                      Survey Video Unavailable
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', maxWidth: 280 }}>
                      No live survey video was recorded for this segment task. The map displays the full recorded geographical path.
                    </div>
                  </div>
                )}
              </div>

              {/* Video Controls Bar (Only when video stream is available) */}
              {streamUrl && (
                <div className="green-video-controls-bar">
                  {/* Seek Bar */}
                  <div className="green-seek-bar-row">
                    <span className="green-time-display">{formatSeconds(currentTime)}</span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      value={currentTime}
                      onChange={handleSeek}
                      className="green-seek-slider"
                      aria-label="Seek video playback"
                    />
                    <span className="green-time-display">{formatSeconds(duration)}</span>
                  </div>

                  {/* Buttons Row */}
                  <div className="green-controls-buttons-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Play / Pause */}
                      <button
                        id="green-play-btn"
                        type="button"
                        className="green-ctrl-btn play-btn"
                        onClick={togglePlay}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? <LucidePause size={14} /> : <LucidePlay size={14} />}
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>

                      {/* Speed Presets */}
                      {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          className={`green-ctrl-btn${playbackRate === rate ? ' is-active' : ''}`}
                          onClick={() => handleSpeedChange(rate)}
                          style={{
                            background: playbackRate === rate ? '#059669' : undefined,
                            borderColor: playbackRate === rate ? '#10b981' : undefined
                          }}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Volume & Mute */}
                      <button type="button" className="green-ctrl-btn" onClick={toggleMute} title="Mute/Unmute">
                        {isMuted || volume === 0 ? <LucideVolumeX size={14} /> : <LucideVolume2 size={14} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        style={{ width: 60, accentColor: '#10b981', cursor: 'pointer' }}
                        aria-label="Volume"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Multi-Chunk Playlist Strip */}
              {activeChunks.length > 1 && (
                <div className="green-chunks-strip">
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, paddingRight: 4 }}>
                    PARTS:
                  </span>
                  {activeChunks.map((chunk, idx) => (
                    <button
                      key={chunk.s3Key || idx}
                      type="button"
                      className={`green-chunk-btn${activeChunkIndex === idx ? ' is-active' : ''}`}
                      onClick={() => handleChunkSelect(idx)}
                    >
                      Part {idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Live Survey Telemetry HUD */}
              <div className="green-telemetry-hud">
                <div className="green-hud-item">
                  <span className="green-hud-label">Route Progress</span>
                  <span className="green-hud-value" style={{ color: '#059669' }}>
                    {coveredDistanceKm} / {selectedTask.lengthKm} km ({progressPercent}%)
                  </span>
                </div>

                <div className="green-hud-item">
                  <span className="green-hud-label">GPS Telemetry</span>
                  <span className="green-hud-value">
                    {beaconMarkerRef.current
                      ? `${beaconMarkerRef.current.getLatLng().lat.toFixed(5)}, ${beaconMarkerRef.current.getLatLng().lng.toFixed(5)}`
                      : (selectedTask.startCoord ? `${selectedTask.startCoord.lat.toFixed(5)}, ${selectedTask.startCoord.lng.toFixed(5)}` : '—')
                    }
                  </span>
                </div>

                <div className="green-hud-item">
                  <span className="green-hud-label">Survey Nodes</span>
                  <span className="green-hud-value">
                    {(selectedTask.nodes || []).length} GPs / Joints
                  </span>
                </div>

                <div className="green-hud-item">
                  <span className="green-hud-label">Terrain / Road</span>
                  <span className="green-hud-value" style={{ textTransform: 'capitalize' }}>
                    {activeVideo?.routeType ? activeVideo.routeType.replace('_', ' ').toLowerCase() : 'Village road'}
                  </span>
                </div>
              </div>

              {/* Survey Photos Strip (if available) */}
              {selectedTask.photos && selectedTask.photos.length > 0 && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideImage size={13} /> SURVEY PHOTOS ({selectedTask.photos.length})
                  </div>
                  <div className="green-photos-strip">
                    {selectedTask.photos.map((p, pIdx) => (
                      <img
                        key={p.key || pIdx}
                        src={p.url || p.photoPath}
                        alt={p.label || 'Survey point'}
                        className="green-photo-thumb"
                        title={p.label}
                        onClick={() => {
                          const formatted = selectedTask.photos.map(ph => ({
                            photoUrl: ph.url || ph.photoPath,
                            label: ph.label,
                            latitude: ph.lat,
                            longitude: ph.lng
                          }));
                          setLightboxPhotos(formatted);
                          setLightboxIndex(pIdx);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GreenSurveyMapViewPage;
