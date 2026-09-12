import React, { useEffect, useState } from 'react';
import { LucideX, LucideChevronLeft, LucideChevronRight, LucideDownload, LucideCalendar, LucideMapPin, LucideRuler, LucideRefreshCw } from 'lucide-react';
import { taskService } from '../../services/taskService';

export const formatImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://ilync.tech/${url.replace(/^\/+/, '')}`;
};

export const PhotoLightbox = ({ photos = [], initialIndex = 0, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [resolvedUrls, setResolvedUrls] = useState({});
  const [loadingMedia, setLoadingMedia] = useState(false);

  if (!photos || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex] || {};
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

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
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
    } catch (e) {}
  }

  return (
    <div
      onClick={onClose}
      style={{
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
      }}
    >
      {/* Lightbox Header */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1000px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#ffffff',
          padding: '8px 14px',
          background: 'rgba(30, 41, 59, 0.75)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
          <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentPhoto.label || currentPhoto.title || `Media ${currentIndex + 1}`}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            {isVideo ? 'Video' : 'Photo'} {currentIndex + 1} of {photos.length}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {activeUrl && (
            <a
              href={activeUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: 'none',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                textDecoration: 'none'
              }}
            >
              <LucideDownload size={13} /> <span>Download</span>
            </a>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: '700',
              fontSize: '0.8rem'
            }}
          >
            <LucideX size={16} /> Close
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
          maxWidth: '1000px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '12px 0',
          overflow: 'hidden'
        }}
      >
        {photos.length > 1 && (
          <button
            onClick={handlePrev}
            style={{
              position: 'absolute',
              left: '8px',
              zIndex: 10,
              background: 'rgba(15, 23, 42, 0.8)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '50%',
              width: '42px',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            <LucideChevronLeft size={22} />
          </button>
        )}

        {loadingMedia ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
            <LucideRefreshCw size={28} className="animate-spin" />
            <span style={{ fontSize: '0.82rem' }}>Resolving S3 survey media URL...</span>
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
                maxHeight: 'calc(80vh - 110px)',
                maxWidth: '100%',
                borderRadius: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
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
                maxHeight: 'calc(80vh - 110px)',
                maxWidth: '100%',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
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
            padding: '30px',
            background: 'rgba(30, 41, 59, 0.85)',
            borderRadius: '12px',
            color: '#94a3b8',
            border: '1px dashed #475569'
          }}
        >
          Photo/Video unavailable or failed to load.
        </div>

        {photos.length > 1 && (
          <button
            onClick={handleNext}
            style={{
              position: 'absolute',
              right: '8px',
              zIndex: 10,
              background: 'rgba(15, 23, 42, 0.8)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '50%',
              width: '42px',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            <LucideChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Lightbox Footer Info */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1000px',
          background: 'rgba(30, 41, 59, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '10px 16px',
          color: '#cbd5e1',
          fontSize: '0.78rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          boxSizing: 'border-box'
        }}
      >
        {currentPhoto.depth !== undefined && currentPhoto.depth !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', fontWeight: '800', fontSize: '0.85rem' }}>
            <LucideRuler size={14} />
            <span>Depth: {currentPhoto.depth} m</span>
          </div>
        )}

        {formattedTime && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideCalendar size={14} color="#38bdf8" />
            <span>Captured: <strong>{formattedTime}</strong></span>
          </div>
        )}

        {currentPhoto.latitude && currentPhoto.longitude && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideMapPin size={14} color="#34d399" />
            <span>GPS: <strong>{Number(currentPhoto.latitude).toFixed(6)}, {Number(currentPhoto.longitude).toFixed(6)}</strong></span>
          </div>
        )}

        {currentPhoto.remarks && (
          <div style={{ width: '100%', color: '#fef08a', fontStyle: 'italic', marginTop: '2px' }}>
            Remarks: {currentPhoto.remarks}
          </div>
        )}
      </div>
    </div>
  );
};
