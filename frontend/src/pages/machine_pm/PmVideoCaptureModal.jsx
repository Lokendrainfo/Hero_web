import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LucideAlertTriangle,
  LucideCheckCircle2,
  LucideSquare,
  LucideRefreshCw,
  LucideSwitchCamera,
  LucideVideo,
  LucideX,
} from 'lucide-react';

export const PmVideoCaptureModal = ({ isOpen, onClose, item, requirement, onConfirmCapture }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const maxDuration = Number(requirement?.max_duration_seconds || 30);

  const [facingMode, setFacingMode] = useState('environment');
  const [cameraError, setCameraError] = useState('');
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = useCallback(() => {
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
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
    setRecording(false);
    setElapsedSec(0);

    if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStarting(false);
      setCameraError(
        'Live device camera / MediaRecorder API is unavailable in this browser context. Please use HTTPS or localhost.'
      );
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access to record maintenance evidence.'
          : err?.name === 'NotFoundError'
            ? 'No camera device found on this device.'
            : `Unable to start camera: ${err?.message || 'Unknown error'}`
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
      setRecordedBlob(null);
      setCameraError('');
      setElapsedSec(0);
      setRecording(false);
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

  const stopRecording = () => {
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setRecording(false);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) {
      setCameraError('Camera stream is not ready.');
      return;
    }

    chunksRef.current = [];
    const preferredTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';

    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      clearTimer();
      const blobType = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: blobType });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setPreviewUrl(url);
      setRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };

    recorder.start(250);
    setRecording(true);
    setElapsedSec(0);
    const startMs = Date.now();
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startMs) / 1000);
      setElapsedSec(sec);
      if (sec >= maxDuration) {
        stopRecording();
      }
    }, 250);
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setRecordedBlob(null);
    setElapsedSec(0);
    startCamera(facingMode);
  };

  const handleUseVideo = () => {
    if (!recordedBlob) return;
    const isMp4 = (recordedBlob.type || '').includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    const file = new File(
      [recordedBlob],
      `video_${item.item_code || item.id}_${requirement?.id || 'clip'}_${Date.now()}.${ext}`,
      { type: isMp4 ? 'video/mp4' : 'video/webm' }
    );
    onConfirmCapture(file, item, requirement, Math.min(elapsedSec || 1, maxDuration));
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 965 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '700px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <LucideVideo size={17} />
              <strong style={{ fontSize: '0.95rem' }}>
                Video Recording — {requirement?.video_name || item.description}
              </strong>
              <span className="badge-pill badge-blue">Max {maxDuration}s</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {requirement?.video_description || item.description}
            </div>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close video recorder">
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
              <button type="button" className="btn-secondary" onClick={() => startCamera(facingMode)}>
                <LucideRefreshCw size={14} /> Retry Camera
              </button>
            </div>
          ) : previewUrl ? (
            <video src={previewUrl} controls playsInline style={{ maxWidth: '100%', maxHeight: '58vh' }} />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: '58vh', objectFit: 'contain' }} />
          )}

          {recording ? (
            <span
              className="badge-pill badge-breakdown"
              style={{ position: 'absolute', top: '12px', left: '12px', fontFamily: 'var(--font-mono)' }}
            >
              REC {elapsedSec}s / {maxDuration}s
            </span>
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
            Live camera recording only · Gallery uploads disabled
          </span>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!previewUrl ? (
              <>
                {!recording ? (
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
                      onClick={startRecording}
                      disabled={starting || Boolean(cameraError)}
                    >
                      <LucideVideo size={14} /> Start Recording
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-danger" onClick={stopRecording}>
                    <LucideSquare size={14} /> Stop Recording ({elapsedSec}s)
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={handleRetake}>
                  <LucideRefreshCw size={14} /> Retake Video
                </button>
                <button type="button" className="btn-primary" onClick={handleUseVideo}>
                  <LucideCheckCircle2 size={14} /> Use Recorded Video
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
