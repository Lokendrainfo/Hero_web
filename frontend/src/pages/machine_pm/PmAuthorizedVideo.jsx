import React, { useEffect, useState } from 'react';
import { LucideLoader2, LucideVideo } from 'lucide-react';
import { fetchProtectedPhotoBlobUrl } from '../../services/pmApi';

export const PmAuthorizedVideo = ({
  viewUrl,
  style = {},
}) => {
  const isDirectClientUrl = Boolean(viewUrl && (viewUrl.startsWith('blob:') || viewUrl.startsWith('data:')));
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(Boolean(viewUrl) && !isDirectClientUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let ownedUrl = '';

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
  }, [viewUrl, isDirectClientUrl]);

  if (isDirectClientUrl) {
    return <video src={viewUrl} controls playsInline style={style} />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: '#0f172a', color: '#94a3b8', borderRadius: '6px', ...style }}>
        <LucideLoader2 size={16} className="spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px', background: 'var(--bg-subtle)', color: 'var(--text-muted)', borderRadius: '6px', fontSize: '0.75rem', ...style }}>
        <LucideVideo size={16} /> Video unavailable
      </div>
    );
  }

  return <video src={blobUrl} controls playsInline style={style} />;
};
