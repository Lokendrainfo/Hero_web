import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LucideCamera,
  LucideCheckCircle2,
  LucideEye,
  LucideRefreshCw,
  LucideSend,
  LucideXCircle,
} from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/Select';
import { PmLayoutHeader, PM_FREQUENCY_LABELS } from './PmLayoutHeader';
import { PmAuthorizedPhoto } from './PmAuthorizedPhoto';
import { PmCameraCaptureModal } from './PmCameraCaptureModal';
import { PmPhotoLightboxModal } from './PmPhotoLightboxModal';
import { PmSubmissionDetailModal } from './PmSubmissionDetailModal';

const genRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `pm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getPhotoStateKey = (item) => String(item?.item_code || item?.id || '');

export const PmFormPage = () => {
  const { machineId: routeMachineId, frequency: routeFreq } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const [roleInfo, setRoleInfo] = useState(null);
  const [machines, setMachines] = useState([]);
  const [allowedFrequencies, setAllowedFrequencies] = useState([]);

  const [selectedMachineId, setSelectedMachineId] = useState(
    routeMachineId && routeMachineId !== 'select' ? String(routeMachineId) : ''
  );
  const [machineDetail, setMachineDetail] = useState(null);
  const [selectedFreq, setSelectedFreq] = useState(routeFreq || '');
  const [hourMeter, setHourMeter] = useState('');
  const [generalRemarks, setGeneralRemarks] = useState('');

  const [checklist, setChecklist] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  // Per-item completion status and remarks keyed by item.id
  const [responsesMap, setResponsesMap] = useState({});
  // Independent per-item camera capture state keyed by unique item_code (e.g. "SOP-MCH-004") / fallback item.id
  const [capturedPhotos, setCapturedPhotos] = useState({});
  const objectUrlsRef = useRef(new Set());
  const [cameraTargetItem, setCameraTargetItem] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState(null);
  const [clientRequestId] = useState(genRequestId);

  const revokeAllObjectUrls = () => {
    objectUrlsRef.current.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // ignore
      }
    });
    objectUrlsRef.current.clear();
  };

  useEffect(() => () => revokeAllObjectUrls(), []);

  useEffect(() => {
    let active = true;
    Promise.all([pmService.getMachines(), pmService.getFrequencies()])
      .then(([mRes, fRes]) => {
        if (!active) return;
        setMachines(mRes?.data || []);
        const fData = fRes?.data || {};
        setRoleInfo(fData.role_info || null);
        const submittable = (fData.frequencies || []).filter((f) => f.can_submit);
        setAllowedFrequencies(submittable);
        if (!routeFreq && submittable.length > 0) {
          setSelectedFreq((prev) => prev || submittable[0].code);
        }
      })
      .catch((err) => showToastRef.current(err?.message || 'Failed to initialize maintenance form.', 'error'));
    return () => {
      active = false;
    };
  }, [routeFreq]);

  // Fetch & validate selected HERO machine
  useEffect(() => {
    if (!selectedMachineId) {
      setMachineDetail(null);
      return undefined;
    }
    let active = true;
    pmService.validateMachine(selectedMachineId)
      .then((res) => {
        if (!active) return;
        const d = res?.data || null;
        setMachineDetail(d);
        if (d && d.engine_hours !== undefined && d.engine_hours !== null) {
          setHourMeter(String(d.engine_hours));
        }
      })
      .catch((err) => {
        if (!active) return;
        setMachineDetail(null);
        showToastRef.current(err?.message || 'Failed to validate selected machine.', 'error');
      });
    return () => {
      active = false;
    };
  }, [selectedMachineId]);

  // Fetch role-authorized checklist ONLY when frequency changes (never re-run on toast changes)
  useEffect(() => {
    if (!selectedFreq) {
      setChecklist(null);
      return undefined;
    }
    let active = true;
    setLoadingChecklist(true);
    pmService.getChecklist(selectedFreq)
      .then((res) => {
        if (!active) return;
        const data = res?.data || null;
        setChecklist(data);
        setResponsesMap((prev) => {
          const initMap = {};
          (data?.items || []).forEach((it) => {
            initMap[it.id] = prev[it.id] || {
              status: 'COMPLETED',
              remarks: '',
            };
          });
          return initMap;
        });
      })
      .catch((err) => {
        if (!active) return;
        setChecklist(null);
        showToastRef.current(err?.message || 'Not authorized for this maintenance frequency.', 'error');
      })
      .finally(() => {
        if (active) setLoadingChecklist(false);
      });
    return () => {
      active = false;
    };
  }, [selectedFreq]);

  const updateItemState = (itemId, patch) => {
    setResponsesMap((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { status: 'COMPLETED', remarks: '' }), ...patch },
    }));
  };

  const handleCameraPhotoCaptured = (capturedItem, file) => {
    const target = capturedItem || cameraTargetItem;
    if (!file || !target) return;
    if (!selectedMachineId) {
      showToastRef.current('Please select a machine before capturing photos.', 'error');
      return;
    }

    const photoKey = getPhotoStateKey(target);
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);

    // Replace only this checklist item's captured image; preserve all other items' captures
    setCapturedPhotos((prev) => {
      const prevUrl = prev[photoKey]?.previewUrl;
      if (prevUrl && prevUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prevUrl);
        objectUrlsRef.current.delete(prevUrl);
      }
      return {
        ...prev,
        [photoKey]: {
          checklistItemId: target.id,
          itemCode: target.item_code,
          file,
          previewUrl,
          capturedAt: new Date().toISOString(),
          captureSource: 'CAMERA',
        },
      };
    });

    setCameraTargetItem(null);
    showToastRef.current(`Camera photo captured for "${target.description}"`, 'success');
  };

  const itemsList = checklist?.items || [];
  const photosUploadedCount = useMemo(
    () => itemsList.filter((it) => Boolean(capturedPhotos[getPhotoStateKey(it)]?.file)).length,
    [itemsList, capturedPhotos]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMachineId) {
      showToastRef.current('Please select a machine.', 'error');
      return;
    }
    if (!selectedFreq) {
      showToastRef.current('Please select a maintenance frequency.', 'error');
      return;
    }
    if (hourMeter === '' || Number(hourMeter) < 0 || Number.isNaN(Number(hourMeter))) {
      showToastRef.current('Please enter a valid machine hour-meter reading.', 'error');
      return;
    }

    // Validate every checklist item has its own captured camera photo + remarks if NOT_COMPLETED
    for (const item of itemsList) {
      const st = responsesMap[item.id] || { status: 'COMPLETED', remarks: '' };
      const cap = capturedPhotos[getPhotoStateKey(item)];
      if (!cap || !cap.file) {
        showToastRef.current(`Mandatory camera photo missing for: ${item.description}`, 'error');
        return;
      }
      if (st.status === 'NOT_COMPLETED' && !(st.remarks || '').trim()) {
        showToastRef.current(`Explanatory remarks required for Not Completed item: ${item.description}`, 'error');
        return;
      }
    }

    const fd = new FormData();
    fd.append('machine_id', String(Number(selectedMachineId)));
    fd.append('frequency', selectedFreq);
    fd.append('hour_meter_reading', String(Number(hourMeter)));
    fd.append('general_remarks', generalRemarks.trim());
    fd.append('client_request_id', clientRequestId);
    fd.append('capture_source', 'CAMERA');

    const responseMeta = itemsList.map((item) => {
      const st = responsesMap[item.id] || { status: 'COMPLETED', remarks: '' };
      const cap = capturedPhotos[getPhotoStateKey(item)];
      fd.append(`photo_${item.id}`, cap.file);
      return {
        checklist_item_id: item.id,
        status: st.status,
        remarks: (st.remarks || '').trim(),
        captured_at: cap.capturedAt || new Date().toISOString(),
        capture_source: 'CAMERA',
      };
    });
    fd.append('responses', JSON.stringify(responseMeta));

    try {
      setSubmitting(true);
      const res = await pmService.postMaintenanceData(fd);
      const createdId = res?.data?.submission_id;
      showToastRef.current(`Maintenance submitted: ${res?.data?.submission_number}`, 'success');
      if (createdId) {
        const detailRes = await pmService.getSubmissionDetail(createdId);
        setSubmittedRecord(detailRes?.data || null);
      }
      setCapturedPhotos({});
      revokeAllObjectUrls();
    } catch (err) {
      showToastRef.current(err?.message || 'Maintenance submission failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openCapturedPreview = (item, capturedPhoto) => {
    setPreviewPhoto({
      view_url: capturedPhoto.previewUrl,
      checklist_description: item.description,
      frequency_code: selectedFreq,
      machine_number: machineDetail?.machine_number || selectedMachineId,
      uploaded_by_name: 'Device Camera Capture',
      captured_at: capturedPhoto.capturedAt,
      sha256_hash: 'Calculated on submission',
    });
  };

  const openCameraForItem = (item) => {
    if (!selectedMachineId) {
      showToastRef.current('Please select a machine before capturing photos.', 'error');
      return;
    }
    setCameraTargetItem(item);
  };

  const renderActivityCard = (item, idx) => {
    const state = responsesMap[item.id] || { status: 'COMPLETED', remarks: '' };
    const capturedPhoto = capturedPhotos[getPhotoStateKey(item)] || null;
    const isNotCompleted = state.status === 'NOT_COMPLETED';
    const hasPhoto = Boolean(capturedPhoto?.file && capturedPhoto?.previewUrl);

    return (
      <div
        key={item.id}
        style={{
          padding: '14px',
          border: isNotCompleted ? '1px solid #fca5a5' : '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: isNotCompleted ? '#fef2f2' : 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="badge-pill badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>
                #{idx + 1} · {item.item_code}
              </span>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{item.description}</strong>
            </div>
            {item.remarks || item.special_instructions ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                SOP Note: {item.remarks || item.special_instructions}
              </div>
            ) : null}
          </div>

          <div className="seg-tabs">
            <button
              type="button"
              className={`seg-tab${state.status === 'COMPLETED' ? ' is-active' : ''}`}
              onClick={() => updateItemState(item.id, { status: 'COMPLETED' })}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: state.status === 'COMPLETED' ? '#047857' : 'transparent',
                color: state.status === 'COMPLETED' ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              <LucideCheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Completed
            </button>
            <button
              type="button"
              className={`seg-tab${isNotCompleted ? ' is-active' : ''}`}
              onClick={() => updateItemState(item.id, { status: 'NOT_COMPLETED' })}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: isNotCompleted ? '#dc2626' : 'transparent',
                color: isNotCompleted ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              <LucideXCircle size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Not Completed
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
              Activity Remarks {isNotCompleted ? <span style={{ color: 'var(--danger)' }}>* (Mandatory)</span> : '(Optional)'}
            </label>
            <input
              type="text"
              placeholder={isNotCompleted ? 'Explain why activity was not completed...' : 'Observations or readings...'}
              value={state.remarks || ''}
              onChange={(e) => updateItemState(item.id, { remarks: e.target.value })}
              style={{
                width: '100%',
                height: '36px',
                padding: '0 10px',
                border: isNotCompleted && !(state.remarks || '').trim() ? '1px solid var(--danger)' : '1px solid var(--border-strong)',
                borderRadius: 'var(--radius)',
                fontSize: '0.8125rem',
                background: '#fff',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {hasPhoto ? (
              <button
                type="button"
                onClick={() => openCapturedPreview(item, capturedPhoto)}
                style={{
                  position: 'relative',
                  height: '64px',
                  minWidth: '64px',
                  maxWidth: '112px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid #16a34a',
                  background: '#0f172a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: 0,
                  cursor: 'pointer',
                }}
                title="Click to view captured photo"
              >
                <PmAuthorizedPhoto
                  viewUrl={capturedPhoto.previewUrl}
                  alt={item.description}
                  style={{ height: '64px', width: 'auto', maxWidth: '112px', objectFit: 'contain', display: 'block' }}
                />
              </button>
            ) : null}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {hasPhoto ? (
                <>
                  <span className="badge-pill badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <LucideCheckCircle2 size={12} /> Photo Captured
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={submitting}
                    onClick={() => openCapturedPreview(item, capturedPhoto)}
                    style={{ fontSize: '0.78rem' }}
                  >
                    <LucideEye size={14} />
                    <span>View Photo</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={submitting}
                    onClick={() => openCameraForItem(item)}
                    style={{ fontSize: '0.78rem' }}
                  >
                    <LucideRefreshCw size={14} />
                    <span>Retake Photo</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={submitting}
                    onClick={() => openCameraForItem(item)}
                    style={{ fontSize: '0.78rem' }}
                  >
                    <LucideCamera size={14} />
                    <span>Camera Capture</span>
                  </button>
                  <span className="badge-pill badge-breakdown">Photo Required *</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const machineItems = checklist?.categories?.MACHINE || [];
  const engineItems = checklist?.categories?.ENGINE || [];

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="Perform Preventive Maintenance"
        subtitle="Capture individual photographic evidence for every checklist activity"
        roleInfo={roleInfo}
      />

      {allowedFrequencies.length === 0 ? (
        <div className="empty-state">
          <h3>No Maintenance Checklists Assigned to Your Role</h3>
          <p>Contact an Administrator if you need Operator, Field Engineer, or Area Manager checklist permissions.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Machine, Frequency & Hour-Meter Card */}
          <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Select HERO Machine *
                </label>
                <SearchableSelect
                  value={selectedMachineId}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  placeholder="Choose Machine..."
                >
                  <option value="">-- Select Machine --</option>
                  {machines.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.machine_number} — {m.name} ({m.vendor_name})
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Maintenance Frequency *
                </label>
                <SearchableSelect
                  value={selectedFreq}
                  onChange={(e) => setSelectedFreq(e.target.value)}
                  placeholder="Choose Frequency..."
                >
                  {allowedFrequencies.map((f) => (
                    <option key={f.code} value={f.code}>
                      {PM_FREQUENCY_LABELS[f.code] || f.name} ({f.checklist_item_count} items)
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Current Hour-Meter Reading (hrs) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={hourMeter}
                  onChange={(e) => setHourMeter(e.target.value)}
                  placeholder="e.g. 245.5"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 10px',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            {machineDetail ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: '10px',
                  padding: '10px 12px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  fontSize: '0.78rem',
                }}
              >
                <div><span style={{ color: 'var(--text-muted)' }}>Machine ID / Number:</span><br /><strong style={{ fontFamily: 'var(--font-mono)' }}>{machineDetail.id} / {machineDetail.machine_number}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Model & Type:</span><br /><strong>{machineDetail.machine_model} ({machineDetail.machine_type})</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Vendor:</span><br /><strong>{machineDetail.vendor_name}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Assigned Operator:</span><br /><strong>{machineDetail.assigned_operator}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Site / Assignment:</span><br /><strong>{machineDetail.site_name || machineDetail.location_name || 'Operational'}</strong></div>
              </div>
            ) : null}
          </div>

          {/* Mandatory Photo Policy Notice */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              fontSize: '0.8rem',
              color: '#92400e',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>
              <strong>Mandatory Camera Policy:</strong> Every checklist activity requires its own photograph captured directly via device camera. Gallery selection and file uploads are disabled.
            </span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              Photos Captured: {photosUploadedCount} / {itemsList.length}
            </strong>
          </div>

          {loadingChecklist ? (
            <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading checklist activities...
            </div>
          ) : checklist ? (
            <>
              <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>
                  Category 1: Machine Checklist ({machineItems.length} activities)
                </h3>
                {machineItems.map((it, idx) => renderActivityCard(it, idx))}
                {machineItems.length === 0 ? <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No Machine activities for this frequency.</div> : null}
              </div>

              <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>
                  Category 2: Engine Checklist ({engineItems.length} activities)
                </h3>
                {engineItems.map((it, idx) => renderActivityCard(it, machineItems.length + idx))}
                {engineItems.length === 0 ? <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No Engine activities for this frequency.</div> : null}
              </div>

              <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                    General Maintenance Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={generalRemarks}
                    onChange={(e) => setGeneralRemarks(e.target.value)}
                    placeholder="Overall inspection notes, observations, or follow-up requirements..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.8125rem',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {photosUploadedCount === itemsList.length && itemsList.length > 0
                      ? 'All mandatory camera photos captured. Ready to submit.'
                      : `Capture ${itemsList.length - photosUploadedCount} remaining camera photo(s) to enable submission.`}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => navigate('/operations/machine-maintenance')}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submitting || !selectedMachineId || itemsList.length === 0}
                    >
                      <LucideSend size={14} />
                      {submitting ? 'Submitting...' : 'Submit Maintenance Checklist'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </form>
      )}

      <PmCameraCaptureModal
        isOpen={Boolean(cameraTargetItem)}
        onClose={() => setCameraTargetItem(null)}
        item={cameraTargetItem}
        onConfirmCapture={(file, capturedItem) => handleCameraPhotoCaptured(capturedItem || cameraTargetItem, file)}
      />

      <PmPhotoLightboxModal
        isOpen={Boolean(previewPhoto)}
        onClose={() => setPreviewPhoto(null)}
        photo={previewPhoto}
      />

      <PmSubmissionDetailModal
        isOpen={Boolean(submittedRecord)}
        onClose={() => {
          setSubmittedRecord(null);
          navigate('/operations/machine-maintenance/history');
        }}
        submission={submittedRecord}
      />
    </div>
  );
};

