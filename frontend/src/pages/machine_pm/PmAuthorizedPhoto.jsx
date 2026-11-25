import React, { useEffect, useState } from 'react';
import { LucideImage, LucideLoader2 } from 'lucide-react';
import { fetchProtectedPhotoBlobUrl } from '../../services/pmApi';

export const PmAuthorizedPhoto = ({
  viewUrl,
  alt = 'Maintenance photo evidence',
  className = '',
  style = {},
  onClick,
}) => {
  const isDirectClientUrl = Boolean(viewUrl && (viewUrl.startsWith('blob:') || viewUrl.startsWith('data:')));
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(Boolean(viewUrl) && !isDirectClientUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let ownedObjectUrl = '';

    if (!viewUrl || isDirectClientUrl) {
      setLoading(false);
      setError(false);
      setBlobUrl('');
      return undefined;
    }

    setLoading(true);
    setError(false);

    fetchProtectedPhotoBlobUrl(viewUrl)
      .then((url) => {
        if (!active) {
          if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        ownedObjectUrl = url;
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
      if (ownedObjectUrl && ownedObjectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(ownedObjectUrl);
      }
    };
  }, [viewUrl, isDirectClientUrl]);

  // Render caller-owned blob:/data: preview URLs directly without async fetching or revoking them on StrictMode unmount
  if (isDirectClientUrl) {
    return (
      <img
        src={viewUrl}
        alt={alt}
        className={className}
        style={style}
        onClick={onClick}
      />
    );
  }

  if (loading) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-subtle)',
          color: 'var(--text-muted)',
          ...style,
        }}
      >
        <LucideLoader2 size={18} className="spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-subtle)',
          color: 'var(--text-muted)',
          fontSize: '0.75rem',
          ...style,
        }}
      >
        <LucideImage size={18} />
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
    />
  );
};

