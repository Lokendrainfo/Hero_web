import React, { useEffect, useState } from 'react';
import {
  LucideAlertTriangle,
  LucideCamera,
  LucideImage,
  LucideLoader2,
  LucideMapPin,
  LucideTruck,
} from 'lucide-react';
import { ilyncAttendanceService } from '../../services/attendanceService';

export const formatDateTimeShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatCoords = (photo) => {
  if (!photo || photo.latitude == null || photo.longitude == null) return null;
  return `${Number(photo.latitude).toFixed(5)}, ${Number(photo.longitude).toFixed(5)}`;
};

export const getGeoVerdictBadgeStyle = (verdict) => {
  const v = String(verdict || '').toUpperCase();
  if (v === 'INSIDE') return 'badge-pill badge-green';
  if (v === 'OUTSIDE') return 'badge-pill badge-breakdown';
  if (v === 'LOW_ACCURACY' || v === 'UNVERIFIED') return 'badge-pill badge-amber';
  return 'badge-pill badge-neutral';
};

export const IlyncSecureImage = ({
  attendanceId,
  photoKey,
  alt = 'Attendance photograph',
  style = {},
  onClick,
}) => {
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(Boolean(attendanceId && photoKey));
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let ownedUrl = '';

    if (!attendanceId || !photoKey) {
      setLoading(false);
      setBlobUrl('');
      setError(false);
      return undefined;
    }

    setLoading(true);
    setError(false);

    ilyncAttendanceService
      .fetchProtectedPhotoBlobUrl(attendanceId, photoKey)
      .then((url) => {
        if (!active) {
          if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        ownedUrl = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (ownedUrl && ownedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(ownedUrl);
      }
    };
  }, [attendanceId, photoKey]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#94a3b8',
          ...style,
        }}
      >
        <LucideLoader2 size={16} className="spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-subtle)',
          color: 'var(--text-muted)',
          ...style,
        }}
        title="Photo unavailable"
      >
        <LucideImage size={16} />
      </div>
    );
  }

  return <img src={blobUrl} alt={alt} style={style} onClick={onClick} />;
};

const PhotoCard = ({ attendanceId, photoObj, label, subtitle, onOpenLightbox }) => {
  const coords = formatCoords(photoObj);
  const accuracy = photoObj?.accuracyMeters != null ? `±${Math.round(photoObj.accuracyMeters)} m` : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
      {photoObj?.photoKey && attendanceId ? (
        <button
          type="button"
          onClick={() => onOpenLightbox && onOpenLightbox(attendanceId, photoObj, label, subtitle)}
          style={{
            position: 'relative',
            width: '104px',
            height: '62px',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid var(--border-strong)',
            background: '#0f172a',
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={`${label}${coords ? ` · ${coords}` : ''}`}
        >
          <IlyncSecureImage
            attendanceId={attendanceId}
            photoKey={photoObj.photoKey}
            alt={label}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          <span
            style={{
              position: 'absolute',
              left: '4px',
              top: '4px',
              fontSize: '0.6rem',
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: '3px',
              background: 'rgba(255,255,255,0.92)',
              color: '#1e293b',
            }}
          >
            {label}
          </span>
          {photoObj.cameraLive ? (
            <span
              style={{
                position: 'absolute',
                right: '4px',
                top: '4px',
                fontSize: '0.58rem',
                fontWeight: 700,
                padding: '1px 4px',
                borderRadius: '3px',
                background: '#dcfce7',
                color: '#166534',
                border: '1px solid #86efac',
              }}
            >
              Live
            </span>
          ) : null}
        </button>
      ) : (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No {label.toLowerCase()} photo</span>
      )}

      {photoObj ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {subtitle ? <strong style={{ color: 'var(--text-primary)' }}>{subtitle}</strong> : null}
          {photoObj.photoCapturedAt ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <LucideCamera size={11} /> {formatDateTimeShort(photoObj.photoCapturedAt)}
            </span>
          ) : null}
          {coords ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)' }}>
              <LucideMapPin size={11} /> {coords} {accuracy ? `(${accuracy})` : ''}
            </span>
          ) : accuracy ? (
            <span style={{ fontFamily: 'var(--font-mono)' }}>GPS {accuracy}</span>
          ) : null}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {photoObj.geoVerdict ? (
              <span className={getGeoVerdictBadgeStyle(photoObj.geoVerdict)} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                {photoObj.geoVerdict}
                {photoObj.distanceFromTaskMeters != null ? ` · ${Math.round(photoObj.distanceFromTaskMeters)} m` : ''}
              </span>
            ) : null}
            {photoObj.mockLocationFlagged ? (
              <span className="badge-pill badge-breakdown" style={{ fontSize: '0.65rem', padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <LucideAlertTriangle size={10} /> Mock GPS
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const IlyncTeamProofCell = ({ record, onOpenLightbox }) => {
  if (!record) return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>;
  if (!record.teamPhoto) {
    return (
      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        {record.personalMark === 'ABSENT' ? 'No photo (Absent)' : '—'}
      </span>
    );
  }
  return (
    <PhotoCard
      attendanceId={record.id}
      photoObj={record.teamPhoto}
      label="Team"
      onOpenLightbox={onOpenLightbox}
    />
  );
};

export const IlyncMachineProofCell = ({ record, onOpenLightbox }) => {
  if (!record || !record.machine) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 500 }}>N/A</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', fontWeight: 600 }}>
        <LucideTruck size={12} /> {record.machine.name || 'Machine'}
      </span>
      {record.machine.photo ? (
        <PhotoCard
          attendanceId={record.id}
          photoObj={record.machine.photo}
          label="Machine"
          onOpenLightbox={onOpenLightbox}
        />
      ) : (
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>No machine photo</span>
      )}
    </div>
  );
};

