import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { LucideAlertCircle, LucideRefreshCw } from 'lucide-react';

// Safely extract payload from signed token for instant direct redirection
const parseTokenPayload = (t) => {
  if (!t || typeof t !== 'string') return null;
  try {
    const rawEncoded = t.split(':')[0];
    let b64 = rawEncoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const jsonStr = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonStr);
    if (parsed && (parsed.tid || parsed.taskId)) {
      return {
        tid: parsed.tid || parsed.taskId,
        m: parsed.m || parsed.machineId,
        u: parsed.u || parsed.userId,
        d: parsed.d || parsed.date,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const BharatNetLiveViewPage = () => {
  const { token } = useParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError('Live view token is missing.');
      return;
    }

    // 1. Instant direct redirection to our execution map if token payload contains task ID
    const parsed = parseTokenPayload(token);
    if (parsed && parsed.tid) {
      const query = new URLSearchParams({
        userId: parsed.u || '',
        date: parsed.d || '',
        mode: 'user',
        isBharatNetMap: 'true',
        isBharatNet: 'true',
        source: 'bharatnet'
      }).toString();
      window.location.replace(`/map-view/${parsed.tid}?${query}`);
      return;
    }

    // 2. Fallback: fetch live-view endpoint and redirect to our execution map
    axios
      .get(`/api/v1/live-view/${token}/`)
      .catch(() => axios.get(`/api/v1/bharatnet/live-view/${token}/`))
      .then((res) => {
        const d = res?.data?.data || res?.data;
        if (d && (d.taskId || d.id)) {
          const targetId = d.taskId || d.id;
          const query = new URLSearchParams({
            userId: d.userId || '',
            userName: d.userName || d.userId || '',
            block: d.block || '',
            district: d.district || '',
            state: d.circle || '',
            date: d.date || '',
            mode: 'user',
            isBharatNetMap: 'true',
            isBharatNet: 'true',
            source: 'bharatnet'
          }).toString();
          window.location.replace(`/map-view/${targetId}?${query}`);
          return;
        }
        setError('No execution map found for this live view session.');
      })
      .catch((err) => {
        const msg = err.response?.data?.message || 'Invalid or expired live view session.';
        setError(msg);
      });
  }, [token]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px' }}>
        <div style={{ maxWidth: '440px', background: '#ffffff', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid #fee2e2', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#dc2626' }}>
            <LucideAlertCircle size={30} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#991b1b', margin: 0 }}>
            Session Expired or Unauthorized
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', lineHeight: '1.5' }}>
            {error}
          </p>
          <div style={{ marginTop: '20px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.75rem', color: '#94a3b8' }}>
            BharatNet Phase-3 T&D Monitoring Security Gateway
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <LucideRefreshCw size={36} color="#0f766e" className="animate-spin" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.1rem', color: '#0f172a', fontWeight: '700', margin: 0 }}>
          Opening Live View...
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '6px' }}>
          Redirecting directly to execution map
        </p>
      </div>
    </div>
  );
};

export default BharatNetLiveViewPage;
