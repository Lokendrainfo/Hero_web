import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LucideAlertTriangle,
  LucideCamera,
  LucideCheckCircle2,
  LucideRefreshCw,
  LucideSwitchCamera,
  LucideX,
} from 'lucide-react';

export const PmCameraCaptureModal = ({ isOpen, onClose, item, onConfirmCapture }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [facingMode, setFacingMode] = useState('environment');
  const [cameraError, setCameraError] = useState('');
  const [starting, setStarting] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async (mode) => {
    stopStream();
    setCameraError('');
    setStarting(true);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setStarting(false);
      setCameraError(
        'Device camera API is unavailable in this browser context. Please use HTTPS or localhost and allow camera access. File/gallery uploads are disabled.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in browser settings to capture maintenance evidence.'
          : err?.name === 'NotFoundError'
            ? 'No camera device found on this device. A live camera capture is required (file uploads are disabled).'
            : `Unable to start device camera: ${err?.message || 'Unknown error'}`
      );
    } finally {
      setStarting(false);
    }
  }, [stopStream]);

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      setCapturedBlob(null);
      setCameraError('');
      return undefined;
    }

    startCamera(facingMode);
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, startCamera, stopStream]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!isOpen || !item) return null;

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera stream is not ready yet. Please wait a moment and try again.');
      return;
    }

    const maxDim = 1600;
    let targetW = video.videoWidth;
    let targetH = video.videoHeight;
    if (Math.max(targetW, targetH) > maxDim) {
      const scale = maxDim / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, targetW, targetH);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Failed to capture photograph from camera.');
          return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setPreviewUrl(url);
        stopStream();
      },
      'image/jpeg',
      0.85
    );
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setCapturedBlob(null);
    startCamera(facingMode);
  };

  const handleUsePhoto = () => {
    if (!capturedBlob || !item) return;
    const file = new File([capturedBlob], `camera_${item.item_code || item.id}_${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    onConfirmCapture(file, item);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 960 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '680px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideCamera size={17} />
              <strong style={{ fontSize: '0.95rem' }}>Camera Capture — {item.item_code}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {item.description}
            </div>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close camera">
            <LucideX size={18} />
          </button>
        </div>

        <div
          style={{
            background: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            maxHeight: '58vh',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {cameraError ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#fecaca', maxWidth: '460px', fontSize: '0.84rem' }}>
              <LucideAlertTriangle size={28} style={{ margin: '0 auto 10px', display: 'block', color: '#f87171' }} />
              <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{cameraError}</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => startCamera(facingMode)}
              >
                <LucideRefreshCw size={14} /> Retry Camera
              </button>
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Captured preview"
              style={{ maxWidth: '100%', maxHeight: '58vh', objectFit: 'contain' }}
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', maxHeight: '58vh', objectFit: 'contain' }}
            />
          )}

          {starting && !cameraError ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.75)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
              }}
            >
              Starting device camera...
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '14px 18px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Live device camera only · Gallery/file uploads disabled
          </span>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!previewUrl ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                  disabled={starting}
                >
                  <LucideSwitchCamera size={14} /> Switch Camera
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCaptureFrame}
                  disabled={starting || Boolean(cameraError)}
                >
                  <LucideCamera size={14} /> Capture Photo
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={handleRetake}>
                  <LucideRefreshCw size={14} /> Retake Photo
                </button>
                <button type="button" className="btn-primary" onClick={handleUsePhoto}>
                  <LucideCheckCircle2 size={14} /> Use Captured Photo
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

