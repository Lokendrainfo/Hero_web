import React, { useCallback, useEffect, useState } from 'react';
import { LucideEye, LucideRefreshCw } from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/Select';
import { Pagination } from '../../components/common/Pagination';
import { PmLayoutHeader, PM_FREQUENCY_LABELS } from './PmLayoutHeader';
import { PmAuthorizedPhoto } from './PmAuthorizedPhoto';
import { PmPhotoLightboxModal } from './PmPhotoLightboxModal';

export const PmPhotoGalleryPage = () => {
  const { showToast } = useToast();
  const [roleInfo, setRoleInfo] = useState(null);
  const [machines, setMachines] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [machineId, setMachineId] = useState('ALL');
  const [frequency, setFrequency] = useState('ALL');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ count: 0, total_pages: 1, page_size: 20 });
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    pmService.getFrequencies().then((res) => setRoleInfo(res?.data?.role_info || null)).catch(() => {});
    pmService.getMachines().then((res) => setMachines(res?.data || [])).catch(() => {});
  }, []);

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, page_size: 20 };
      if (machineId !== 'ALL') params.machine_id = machineId;
      if (frequency !== 'ALL') params.frequency = frequency;
      const res = await pmService.getPhotos(params);
      setPhotos(res?.data || []);
      if (res?.meta) setMeta(res.meta);
    } catch (err) {
      showToast(err?.message || 'Failed to load photo evidence.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, machineId, frequency, showToast]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="Photo Evidence Viewer"
        subtitle="Access-controlled maintenance activity photographs with SHA-256 integrity audit"
        roleInfo={roleInfo}
        actions={
          <button type="button" className="btn-secondary" onClick={loadPhotos}>
            <LucideRefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="app-card" style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <SearchableSelect value={machineId} onChange={(e) => { setMachineId(e.target.value); setPage(1); }}>
          <option value="ALL">All Machines</option>
          {machines.map((m) => (
            <option key={m.id} value={String(m.id)}>{m.machine_number} — {m.name}</option>
          ))}
        </SearchableSelect>

        <SearchableSelect value={frequency} onChange={(e) => { setFrequency(e.target.value); setPage(1); }}>
          <option value="ALL">All Frequencies</option>
          {Object.entries(PM_FREQUENCY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </SearchableSelect>
      </div>

      {loading ? (
        <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading photo evidence...</div>
      ) : photos.length === 0 ? (
        <div className="empty-state">
          <h3>No maintenance photo evidence found</h3>
          <p>Submitted activity photographs will appear here for inspection and audit.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {photos.map((p) => (
            <div key={p.id} className="app-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div
                style={{ position: 'relative', height: '160px', background: '#111827', cursor: 'pointer' }}
                onClick={() => setSelectedPhoto(p)}
              >
                <PmAuthorizedPhoto
                  viewUrl={p.view_url}
                  alt={p.checklist_description}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span
                  className="badge-pill badge-role-admin"
                  style={{ position: 'absolute', top: '8px', left: '8px' }}
                >
                  {p.frequency_code}
                </span>
                <span
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: 'rgba(17,24,39,0.75)',
                    color: '#fff',
                    borderRadius: '4px',
                    padding: '4px 6px',
                    fontSize: '0.72rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <LucideEye size={12} /> View
                </span>
              </div>

              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{p.checklist_description}</strong>
                <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  Machine: {p.machine_number}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  By {p.uploaded_by_name} · {new Date(p.captured_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="app-card">
        <Pagination
          currentPage={page}
          totalPages={meta.total_pages || 1}
          totalCount={meta.count || photos.length}
          pageSize={meta.page_size || 20}
          onPageChange={setPage}
        />
      </div>

      <PmPhotoLightboxModal
        isOpen={Boolean(selectedPhoto)}
        onClose={() => setSelectedPhoto(null)}
        photo={selectedPhoto}
      />
    </div>
  );
};

