import React, { useEffect, useState } from 'react';
import {
  LucideX,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCalendar,
  LucideMapPin,
  LucideRuler,
  LucideRefreshCw,
  LucideFileText,
  LucideMaximize2,
  LucideMinimize2,
  LucideCompass,
  LucideCrosshair
} from 'lucide-react';
import { taskService } from '../../services/taskService';

export const formatImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://ilync.tech/${url.replace(/^\/+/, '')}`;
};

export const isMongoHexId = (val) => typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val.trim());

export const formatAccuracyM = (acc) => {
  if (acc === undefined || acc === null || acc === '' || acc === 'N/A' || acc === 'null') {
    return 'Not available';
  }
  if (typeof acc === 'string') {
    const clean = acc.replace(/m$/i, '').trim();
    const num = parseFloat(clean);
    if (!isNaN(num) && isFinite(num)) {
      return `${num.toFixed(2)} m`;
    }
    return acc;
  }
  const num = Number(acc);
  if (!isNaN(num) && isFinite(num)) {
    return `${num.toFixed(2)} m`;
  }
  return 'Not available';
};

export const PhotoLightbox = ({
  photos = [],
  initialIndex = 0,
  onClose,
  taskId = '',
  taskCode = '',
  taskName = '',
  ring = '',
  ringId = '',
  onNavigate,
  defaultExpanded = false
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [resolvedUrls, setResolvedUrls] = useState({});
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!photos || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex] || {};

  // Candidate task codes in priority order: NEVER show a 24-char hex mongo id
  const candidateCodes = [
    currentPhoto.taskCode,
    taskCode,
    currentPhoto.taskId,
    taskId,
    currentPhoto.task_id,
    currentPhoto.task_code,
  ];
  const activeTaskId = candidateCodes.find(c => c && typeof c === 'string' && !isMongoHexId(c)) || '';

  const candidateNames = [
    currentPhoto.segmentName,
    currentPhoto.segment_name,
    currentPhoto.taskName,
    currentPhoto.task_name,
    currentPhoto.displayName,
    taskName,
  ];
  const activeTaskName = candidateNames.find(n => n && typeof n === 'string' && !isMongoHexId(n) && !n.toUpperCase().endsWith('-BOQ') && !n.toUpperCase().endsWith('-BLOCK')) || '';

  const candidateRings = [
    currentPhoto.ring,
    currentPhoto.ringId,
    currentPhoto.ringCode,
    currentPhoto.ringName,
    ring,
    ringId,
  ];
  const rawRing = candidateRings.find(r => r && typeof r === 'string' && !isMongoHexId(r)) || '';
  let activeRing = '';
  if (rawRing) {
    const trimmed = String(rawRing).trim();
    if (trimmed.toLowerCase().startsWith('ring')) {
      activeRing = trimmed;
    } else if (/^r\d+/i.test(trimmed)) {
      activeRing = trimmed.toUpperCase();
    } else {
      activeRing = `R${trimmed}`;
    }
  }

  // Determine if this photo specifically belongs to a PIT
  const isPitPhoto = Boolean(
    currentPhoto.isPitPhoto ||
    currentPhoto.parentType === 'PIT' ||
    (currentPhoto.label && /pit/i.test(currentPhoto.label)) ||
    (currentPhoto.title && /pit/i.test(currentPhoto.title)) ||
    (currentPhoto.key && /pit/i.test(currentPhoto.key)) ||
    currentPhoto.pitSide
  );

  const formatSideDisplay = (val) => {
    if (!val) return '';
    const s = String(val).trim();
    const lower = s.toLowerCase();
    if (lower.includes('lhs') || lower === 'left' || lower.startsWith('left')) {
      return 'Left (LHS)';
    }
    if (lower.includes('rhs') || lower === 'right' || lower.startsWith('right')) {
      return 'Right (RHS)';
    }
    if (lower.includes('center') || lower.includes('centre')) {
      return 'Center';
    }
    return s;
  };

  const rawSide = currentPhoto.side || currentPhoto.pitSide || currentPhoto.pitSideOfTheRoad || currentPhoto.sideOfTheRoad || currentPhoto.roadSide || '';
  const activePitSide = isPitPhoto ? formatSideDisplay(rawSide || 'Left (LHS)') : null;

  const rawUrl = currentPhoto.photoUrl || currentPhoto.url || currentPhoto.src || currentPhoto.key || '';

  const isAbsolute = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
  const activeUrl = isAbsolute ? rawUrl : (resolvedUrls[rawUrl] || resolvedUrls[currentPhoto.key] || '');

  const isVideo = Boolean(
    currentPhoto.isVideo ||
    (currentPhoto.key && currentPhoto.key.includes('video')) ||
    (currentPhoto.label && currentPhoto.label.toLowerCase().includes('video')) ||
    (activeUrl && activeUrl.match(/\.(mp4|mov|webm|ogg)($|\?)/i))
  );

  // On-demand S3 presigned URL resolution if photo URL is a raw survey key
  useEffect(() => {
    if (!rawUrl || isAbsolute || activeUrl) return;

    let isMounted = true;
    setLoadingMedia(true);
    const cleanKey = String(rawUrl).replace(/^\/+/, '');

    taskService.getSurveyPhotoUrls([cleanKey])
      .then(res => {
        if (!isMounted) return;
        const map = res?.data?.data || res?.data || res || {};
        const presigned = map[cleanKey] || map[rawUrl] || map[`/${cleanKey}`];
        if (presigned) {
          setResolvedUrls(prev => ({ ...prev, [rawUrl]: presigned, [cleanKey]: presigned }));
        }
      })
      .catch(err => {
        console.error('[PhotoLightbox] On-demand photo resolution failed:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingMedia(false);
      });

    return () => { isMounted = false; };
  }, [currentIndex, rawUrl, isAbsolute, activeUrl]);

  useEffect(() => {
    if (initialIndex !== undefined && initialIndex >= 0 && initialIndex < photos.length) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, photos.length]);

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => {
      const nextIdx = prev > 0 ? prev - 1 : photos.length - 1;
      if (onNavigate) onNavigate(nextIdx);
      return nextIdx;
    });
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => {
      const nextIdx = prev < photos.length - 1 ? prev + 1 : 0;
      if (onNavigate) onNavigate(nextIdx);
      return nextIdx;
    });
  };

  let formattedTime = null;
  if (currentPhoto.capturedAt) {
    try {
      const d = new Date(currentPhoto.capturedAt);
      if (!isNaN(d.getTime())) {
        formattedTime = d.toLocaleString('en-US', {
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

  const rawAccuracy = currentPhoto.accuracy ??
    currentPhoto.gpsAccuracy ??
    currentPhoto.gps_accuracy ??
    currentPhoto.accuracyMeters ??
    currentPhoto.accuracy_meters ??
    currentPhoto.photo?.accuracy ??
    currentPhoto.photo?.gpsAccuracy ??
    currentPhoto.photo?.gps_accuracy ??
    currentPhoto.photo?.accuracyMeters ??
    currentPhoto.photo?.accuracy_meters ??
    currentPhoto.metadata?.accuracy ??
    null;

  const formattedAccuracy = formatAccuracyM(rawAccuracy);

  // Floating side panel styles vs Expanded full screen styles
  const containerStyle = isExpanded
    ? {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.94)',
      backdropFilter: 'blur(8px)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px',
      boxSizing: 'border-box',
      maxWidth: '100vw',
      maxHeight: '100vh',
      overflow: 'hidden'
    }
    : {
      position: 'fixed',
      top: '76px',
      right: '16px',
      bottom: '16px',
      width: 'min(480px, calc(100vw - 32px))',
      maxHeight: 'calc(100vh - 92px)',
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(16px)',
      borderRadius: '16px',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '12px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    };

  return (
    <div
      onClick={isExpanded ? onClose : undefined}
      style={containerStyle}
    >
      {/* Lightbox Header */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isExpanded ? '1000px' : '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#ffffff',
          padding: '8px 12px',
          background: 'rgba(30, 41, 59, 0.85)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxSizing: 'border-box',
          gap: '8px'
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '700', fontSize: isExpanded ? '0.95rem' : '0.88rem', color: '#f8fafc' }}>
              {currentPhoto.label || currentPhoto.title || `Media ${currentIndex + 1}`}
            </span>
            {activeTaskId && (
              <span style={{
                background: 'rgba(59, 130, 246, 0.22)',
                border: '1px solid rgba(96, 165, 250, 0.45)',
                color: '#93c5fd',
                fontSize: '0.68rem',
                fontWeight: '700',
                padding: '1px 6px',
                borderRadius: '5px',
                letterSpacing: '0.02em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}>
                <LucideFileText size={10} /> {activeTaskId.startsWith('TASK-') ? activeTaskId : `Task: ${activeTaskId}`}
              </span>
            )}
            {activeTaskName && activeTaskName !== activeTaskId && (
              <span style={{
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                color: '#6ee7b7',
                fontSize: '0.68rem',
                fontWeight: '600',
                padding: '1px 6px',
                borderRadius: '5px',
                maxWidth: '220px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }} title={activeTaskName}>
                {activeTaskName}
              </span>
            )}
            {activeRing && (
              <span style={{
                background: 'rgba(20, 184, 166, 0.2)',
                border: '1px solid rgba(45, 212, 191, 0.4)',
                color: '#5eead4',
                fontSize: '0.68rem',
                fontWeight: '700',
                padding: '1px 6px',
                borderRadius: '5px',
                letterSpacing: '0.02em',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                {activeRing}
              </span>
            )}
            {isPitPhoto && activePitSide && (
              <span style={{
                background: activePitSide.toUpperCase().includes('LHS') ? 'rgba(59, 130, 246, 0.25)' : 'rgba(249, 115, 22, 0.25)',
                border: `1px solid ${activePitSide.toUpperCase().includes('LHS') ? 'rgba(96, 165, 250, 0.5)' : 'rgba(251, 146, 60, 0.5)'}`,
                color: activePitSide.toUpperCase().includes('LHS') ? '#93c5fd' : '#fdba74',
                fontSize: '0.68rem',
                fontWeight: '700',
                padding: '1px 7px',
                borderRadius: '5px',
                letterSpacing: '0.02em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <LucideCompass size={11} /> {activePitSide}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
            {isVideo ? 'Video' : 'Photo'} {currentIndex + 1} of {photos.length}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            title={isExpanded ? 'Collapse to floating side panel' : 'Expand to full screen'}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 9px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {isExpanded ? <LucideMinimize2 size={13} /> : <LucideMaximize2 size={13} />}
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: '700',
              fontSize: '0.78rem'
            }}
          >
            <LucideX size={15} /> Close
          </button>
        </div>
      </div>

      {/* Main Stage (Image or Video) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          flex: 1,
          width: '100%',
          maxWidth: isExpanded ? '1000px' : '100%',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '8px 0',
          overflow: 'hidden'
        }}
      >
        {photos.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            style={{
              position: 'absolute',
              left: '6px',
              zIndex: 10,
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            <LucideChevronLeft size={20} />
          </button>
        )}

        {loadingMedia ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
            <LucideRefreshCw size={26} className="animate-spin" />
            <span style={{ fontSize: '0.8rem' }}>Resolving media URL...</span>
          </div>
        ) : activeUrl ? (
          isVideo ? (
            <video
              src={activeUrl}
              controls
              playsInline
              autoPlay
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: '100%',
                maxHeight: isExpanded ? 'min(62vh, 520px)' : '100%',
                maxWidth: '100%',
                objectFit: 'contain',
                borderRadius: '8px',
                background: '#000000'
              }}
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : (
            <img
              src={activeUrl}
              alt={currentPhoto.label || 'Survey Inspection Photo'}
              referrerPolicy="no-referrer"
              style={{
                maxHeight: '100%',
                maxWidth: '100%',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: '10px',
                boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
              onError={(e) => {
                if (e.target.getAttribute('crossorigin')) {
                  e.target.removeAttribute('crossorigin');
                  e.target.src = activeUrl;
                  return;
                }
                e.target.style.display = 'none';
                if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
              }}
            />
          )
        ) : null}

        <div
          style={{
            display: (!activeUrl && !loadingMedia) ? 'flex' : 'none',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'rgba(30, 41, 59, 0.85)',
            borderRadius: '12px',
            color: '#94a3b8',
            border: '1px dashed #475569',
            fontSize: '0.82rem'
          }}
        >
          Photo/Video unavailable or failed to load.
        </div>

        {photos.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            style={{
              position: 'absolute',
              right: '6px',
              zIndex: 10,
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            <LucideChevronRight size={20} />
          </button>
        )}
      </div>

      {/* Lightbox Footer Info */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isExpanded ? '1000px' : '100%',
          background: 'rgba(30, 41, 59, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '8px 12px',
          color: '#cbd5e1',
          fontSize: '0.74rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          boxSizing: 'border-box'
        }}
      >
        {(activeTaskId || activeTaskName || activeRing) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#e2e8f0', fontSize: '0.75rem', flexWrap: 'wrap' }}>
            <LucideFileText size={13} color="#60a5fa" />
            <span>
              <span style={{ color: '#94a3b8' }}>Task: </span>
              {activeTaskName && <strong style={{ color: '#38bdf8' }}>{activeTaskName}</strong>}
              {activeTaskName && activeTaskId ? ' (' : ''}
              {activeTaskId && <strong style={{ color: '#93c5fd' }}>{activeTaskId}</strong>}
              {activeTaskName && activeTaskId ? ')' : ''}
              {activeRing && <span style={{ marginLeft: '6px', color: '#e9d5ff', fontWeight: '600' }}>· Ring: {activeRing}</span>}
            </span>
          </div>
        )}

        {currentPhoto.depth !== undefined && currentPhoto.depth !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#60a5fa', fontWeight: '800', fontSize: '0.8rem' }}>
            <LucideRuler size={13} />
            <span>Depth: {currentPhoto.depth} m</span>
          </div>
        )}

        {isPitPhoto && activePitSide && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            color: activePitSide.toUpperCase().includes('LHS') ? '#38bdf8' : '#fb923c',
            fontWeight: '800',
            fontSize: '0.8rem',
            background: 'rgba(255, 255, 255, 0.06)',
            padding: '2px 8px',
            borderRadius: '5px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <LucideCompass size={13} />
            <span>Side: {activePitSide}</span>
          </div>
        )}

        {formattedTime && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <LucideCalendar size={13} color="#38bdf8" />
            <span>Captured: <strong>{formattedTime}</strong></span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
          {currentPhoto.latitude && currentPhoto.longitude && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <LucideMapPin size={13} color="#34d399" />
              <span>GPS: <strong>{Number(currentPhoto.latitude).toFixed(6)}, {Number(currentPhoto.longitude).toFixed(6)}</strong></span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="GPS Accuracy">
            <LucideCrosshair size={13} color="#a78bfa" />
            <span>
              Accuracy:{' '}
              {formattedAccuracy !== 'Not available' ? (
                <strong style={{ color: '#c084fc' }}>{formattedAccuracy}</strong>
              ) : (
                <span style={{ color: '#94a3b8' }}>Not available</span>
              )}
            </span>
          </div>
        </div>

        {currentPhoto.remarks && (
          <div style={{ width: '100%', color: '#fef08a', fontStyle: 'italic', marginTop: '2px', fontSize: '0.72rem' }}>
            Remarks: {currentPhoto.remarks}
          </div>
        )}
      </div>
    </div>
  );
};
