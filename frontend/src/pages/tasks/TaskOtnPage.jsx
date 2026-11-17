import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  LucideNetwork, LucidePlus, LucideFilter, LucideSearch, LucideRefreshCw,
  LucideClock, LucideCheckCircle2, LucideAlertTriangle, LucideServer,
  LucideArrowUpRight, LucideX, LucideLayers, LucideRadio, LucideCalendar,
  LucideDownload, LucideCpu, LucideSliders, LucideMapPin, LucideBuilding2,
  LucideFileText, LucideExternalLink, LucideUploadCloud, LucideImage,
  LucideVideo, LucideCheck, LucideShieldCheck, LucideFileArchive
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { otnService } from '../../services/otnService';

// Controlled Classification Masters strictly matching Java Enums:
// com.netinfra.platform.task.dao.entities.survey.OtnTaskData
const OTN_TYPES = [
  'Linear',
  'Architecture change Involved',
  'No',
  'Ring to Linear',
  'Linear to Ring'
];

const SUB_OTN_TYPES = {
  'Linear': [
    'Low Depth',
    'Route Divert',
    'New GP Add',
    'GP Shifting'
  ],
  'Architecture change Involved': [
    'Heavy congestion of underground utilities',
    'CC Road – Authority not allowing',
    'CC Road – OT/HDD is not feasible',
    'Permission issue from local authority',
    'Local objection on private land',
    'Narrow Road',
    'Hard Rock',
    'Public issue',
    'Permission restriction from the concerned authority',
    'Road Expansion',
    'Other Remarks (Open Text)'
  ],
  'No': [],
  'Ring to Linear': [],
  'Linear to Ring': []
};

export const TaskOtnPage = () => {
  const [otnList, setOtnList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [metrics, setMetrics] = useState({
    total: 0,
    drafts: 0,
    pending_approval: 0,
    approved: 0,
    rejected: 0,
    critical: 0,
    in_resolution: 0,
    resolved: 0,
    source_hero: 0,
    source_netinfra: 0,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, RESOLVED
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL'); // ALL, HERO, NetInfra
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Modals
  const [selectedOtn, setSelectedOtn] = useState(null);
  const [detailTab, setDetailTab] = useState('overview'); // overview, location, media, comparison, history
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [actionRemarks, setActionRemarks] = useState('');

  const { showToast } = useToast();

  // Create Form State with Java OtnTaskData alignment
  const [formData, setFormData] = useState({
    otnId: '',
    otnType: 'Linear',
    subOtnType: 'Low Depth',
    otherRemarks: '',
    title: '',
    description: '',
    remarks: '',
    severity: 'High',
    circle: 'Haryana',
    district: 'Ambala',
    block: '',
    section: '',
    location: '',
    chainage: '',
    chainage_from: '',
    chainage_to: '',
    contractor: '',
    department: '',
    latitude: '',
    longitude: '',
    sLatitude: '',
    sLongitude: '',
    eLatitude: '',
    eLongitude: '',
    startPhoto: null,
    endPhoto: null,
    walkthroughVideo: null,
    photos: [],
    additionalPhotos: [],
    additionalVideos: [],
    ieName: '',
    iePhoneNumber: '',
    iePhotoNeeded: false,
    iePhoto: null,
    shpFiles: [],
  });

  const loadOtnRecords = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeTab !== 'ALL') params.status = activeTab;
      if (typeFilter !== 'ALL') params.otn_type = typeFilter;
      if (severityFilter !== 'ALL') params.severity = severityFilter;
      if (sourceFilter !== 'ALL') params.source = sourceFilter;
      if (search.trim()) params.search = search.trim();

      const res = await otnService.getAll(params);
      const data = res?.results || res?.data?.results || res?.data || (Array.isArray(res) ? res : []);
      setOtnList(data);
      if (res?.metrics) {
        setMetrics(res.metrics);
      }
    } catch (err) {
      console.error('Failed to load OTN records:', err);
      showToast('Could not load OTN records from server', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, typeFilter, severityFilter, sourceFilter, search, showToast]);

  useEffect(() => {
    loadOtnRecords();
  }, [loadOtnRecords]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      showToast('Connecting to NetInfra / iLync API for OTN tasks...', 'info');
      const res = await otnService.syncExternal();
      const msg = res?.message || res?.data?.message || 'Sync completed successfully.';
      showToast(`✓ ${msg}`, 'success');
      loadOtnRecords();
    } catch (err) {
      console.error('NetInfra OTN sync error:', err);
      showToast('NetInfra synchronization failed. Using local HERO records.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = () => {
    const url = otnService.exportCsvUrl();
    window.open(url, '_blank');
    showToast('Exporting complete OTN register to CSV...', 'info');
  };

  const handleTypeChange = (newType) => {
    const available = SUB_OTN_TYPES[newType] || [];
    setFormData(prev => ({
      ...prev,
      otnType: newType,
      subOtnType: available.length > 0 ? available[0] : '',
      otherRemarks: ''
    }));
  };

  const handleFileUpload = async (e, fieldType, isMultiple = false) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    try {
      setUploading(true);
      for (const file of files) {
        const uploadForm = new FormData();
        uploadForm.append('file', file);
        if (formData.latitude) uploadForm.append('latitude', formData.latitude);
        if (formData.longitude) uploadForm.append('longitude', formData.longitude);

        const res = await otnService.uploadMedia(uploadForm);
        const photoObj = res?.photo || res?.data || res?.data?.photo;
        if (!photoObj) continue;

        if (fieldType === 'startPhoto') {
          setFormData(prev => ({ ...prev, startPhoto: photoObj }));
        } else if (fieldType === 'endPhoto') {
          setFormData(prev => ({ ...prev, endPhoto: photoObj }));
        } else if (fieldType === 'walkthroughVideo') {
          setFormData(prev => ({ ...prev, walkthroughVideo: photoObj }));
        } else if (fieldType === 'iePhoto') {
          setFormData(prev => ({ ...prev, iePhoto: photoObj }));
        } else if (fieldType === 'photos') {
          setFormData(prev => ({ ...prev, photos: [...prev.photos, photoObj] }));
        } else if (fieldType === 'additionalPhotos') {
          setFormData(prev => ({ ...prev, additionalPhotos: [...prev.additionalPhotos, photoObj] }));
        } else if (fieldType === 'additionalVideos') {
          setFormData(prev => ({ ...prev, additionalVideos: [...prev.additionalVideos, photoObj] }));
        } else if (fieldType === 'shpFiles') {
          setFormData(prev => ({ ...prev, shpFiles: [...prev.shpFiles, photoObj.key || photoObj.fileName] }));
        }
      }
      showToast(`✓ Uploaded ${files.length} file(s) successfully`, 'success');
    } catch (err) {
      console.error('File upload failed:', err);
      showToast('File upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const handleCreateSubmit = async (actionType = 'submit') => {
    const isDraft = actionType === 'draft';
    const subTypeFinal = formData.subOtnType === 'Other Remarks (Open Text)'
      ? (formData.otherRemarks ? `Other Remarks: ${formData.otherRemarks}` : 'Other Remarks')
      : formData.subOtnType;

    if (!isDraft) {
      if (!formData.description && !formData.remarks) {
        showToast('Please provide a description or remarks for the OTN stretch obstacle', 'error');
        return;
      }
      if (formData.iePhotoNeeded && !formData.iePhoto) {
        showToast('Independent Engineer photo is required when IE Photo Needed is Yes', 'error');
        return;
      }
    }

    try {
      const payload = {
        otnId: formData.otnId || undefined,
        otnType: formData.otnType,
        subOtnType: subTypeFinal,
        title: formData.title || `OTN ${formData.otnType}: ${subTypeFinal || 'Obstacle'}`,
        description: formData.description,
        remarks: formData.remarks,
        severity: formData.severity.toUpperCase(),
        status: isDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        circle: formData.circle,
        district: formData.district,
        block: formData.block || 'Central',
        section: formData.section,
        location: formData.location,
        chainage: formData.chainage || (formData.chainage_from && formData.chainage_to ? `CH ${formData.chainage_from} to ${formData.chainage_to}` : ''),
        chainage_from: formData.chainage_from,
        chainage_to: formData.chainage_to,
        contractor: formData.contractor,
        department: formData.department,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        sLatitude: formData.sLatitude ? parseFloat(formData.sLatitude) : null,
        sLongitude: formData.sLongitude ? parseFloat(formData.sLongitude) : null,
        eLatitude: formData.eLatitude ? parseFloat(formData.eLatitude) : null,
        eLongitude: formData.eLongitude ? parseFloat(formData.eLongitude) : null,
        startPhoto: formData.startPhoto,
        endPhoto: formData.endPhoto,
        walkthroughVideo: formData.walkthroughVideo,
        photos: formData.photos,
        additionalPhotos: formData.additionalPhotos,
        additionalVideos: formData.additionalVideos,
        ieName: formData.ieName,
        iePhoneNumber: formData.iePhoneNumber,
        iePhotoNeeded: formData.iePhotoNeeded,
        iePhoto: formData.iePhoto,
        shpFiles: formData.shpFiles,
        action: isDraft ? 'draft' : 'submit'
      };

      await otnService.create(payload);
      showToast(isDraft ? '✓ OTN draft saved successfully' : '✓ OTN task submitted for approval', 'success');
      setIsCreateOpen(false);
      resetForm();
      loadOtnRecords();
    } catch (err) {
      console.error('Failed to save OTN:', err);
      showToast('Error saving OTN record', 'error');
    }
  };

  const handleApprove = async () => {
    if (!selectedOtn) return;
    try {
      const res = await otnService.approve(selectedOtn.id, {
        remarks: actionRemarks || 'Approved by nodal review.'
      });
      showToast(`✓ OTN ${selectedOtn.otnId || selectedOtn.otn_id} Approved`, 'success');
      setIsApproveOpen(false);
      setActionRemarks('');
      setSelectedOtn(res.data?.data || null);
      loadOtnRecords();
    } catch (err) {
      console.error('Approval failed:', err);
      showToast('Approval action failed', 'error');
    }
  };

  const handleReject = async () => {
    if (!selectedOtn) return;
    if (!actionRemarks.trim()) {
      showToast('Rejection reason is required', 'error');
      return;
    }
    try {
      const res = await otnService.reject(selectedOtn.id, {
        remarks: actionRemarks
      });
      showToast(`OTN rejected`, 'info');
      setIsRejectOpen(false);
      setActionRemarks('');
      setSelectedOtn(res.data?.data || null);
      loadOtnRecords();
    } catch (err) {
      console.error('Rejection failed:', err);
      showToast('Rejection action failed', 'error');
    }
  };

  const handleDraftSubmit = async (item) => {
    try {
      const res = await otnService.submit(item.id, { remarks: 'Submitted for reviewer approval.' });
      showToast(`✓ OTN ${item.otnId || item.otn_id} submitted for approval`, 'success');
      if (selectedOtn && selectedOtn.id === item.id) {
        setSelectedOtn(res.data?.data || null);
      }
      loadOtnRecords();
    } catch (err) {
      console.error('Submission failed:', err);
      showToast(err.response?.data?.message || 'Submission failed', 'error');
    }
  };

  const handleResolve = async (item) => {
    try {
      await otnService.update(item.id, { status: 'RESOLVED' });
      showToast(`✓ Marked OTN ${item.otnId || item.otn_id} as Resolved`, 'success');
      setSelectedOtn(null);
      loadOtnRecords();
    } catch (err) {
      console.error('Failed to resolve:', err);
      showToast('Failed to update OTN status', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      otnId: '',
      otnType: 'Linear',
      subOtnType: 'Low Depth',
      otherRemarks: '',
      title: '',
      description: '',
      remarks: '',
      severity: 'High',
      circle: 'Haryana',
      district: 'Ambala',
      block: '',
      section: '',
      location: '',
      chainage: '',
      chainage_from: '',
      chainage_to: '',
      contractor: '',
      department: '',
      latitude: '',
      longitude: '',
      sLatitude: '',
      sLongitude: '',
      eLatitude: '',
      eLongitude: '',
      startPhoto: null,
      endPhoto: null,
      walkthroughVideo: null,
      photos: [],
      additionalPhotos: [],
      additionalVideos: [],
      ieName: '',
      iePhoneNumber: '',
      iePhotoNeeded: false,
      iePhoto: null,
      shpFiles: [],
    });
  };

  const getSeverityBadge = (severity) => {
    const s = (severity || 'LOW').toUpperCase();
    const map = {
      CRITICAL: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
      HIGH: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
      MEDIUM: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
      LOW: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' }
    };
    const style = map[s] || map.LOW;
    return (
      <span style={{
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '0.72rem',
        fontWeight: '600',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        display: 'inline-block'
      }}>
        {severity}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const s = (status || 'DRAFT').toUpperCase();
    const map = {
      DRAFT: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
      SUBMITTED: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
      PENDING_APPROVAL: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
      APPROVED: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', dot: '#10b981' },
      REJECTED: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#ef4444' },
      IN_PROGRESS: { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      IN_REVIEW: { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
      ESCALATED: { bg: '#fff1f2', color: '#be123c', border: '#fecdd3', dot: '#f43f5e' },
      RESOLVED: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', dot: '#22c55e' },
      OPEN: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b' }
    };
    const style = map[s] || map.DRAFT;
    const label = s === 'PENDING_APPROVAL' ? 'Pending Review' : s.replace('_', ' ');

    return (
      <span style={{
        padding: '3px 10px',
        borderRadius: '20px',
        fontSize: '0.72rem',
        fontWeight: '600',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: style.dot }}></span>
        {label}
      </span>
    );
  };

  const getSourceBadge = (source) => {
    const isNetInfra = (source || '').toUpperCase().includes('NET') || (source || '').toUpperCase().includes('ILYNC');
    if (isNetInfra) {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '0.70rem',
          fontWeight: '600',
          background: '#f5f3ff',
          color: '#6d28d9',
          border: '1px solid #ddd6fe',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#8b5cf6' }}></span>
          NetInfra
        </span>
      );
    }
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.70rem',
        fontWeight: '600',
        background: '#ecfdf5',
        color: '#047857',
        border: '1px solid #a7f3d0',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span>
        HERO Web
      </span>
    );
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* 1. Header with Title & Action Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>
              Optical Transport Network (OTN) Tasks
            </h1>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: '#e0e7ff', color: '#3730a3', fontWeight: '600' }}>
              OtnTaskData v2
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            Raised on site against stretches of approved BoQ plans under NetInfra dual-state lifecycle.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: syncing ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <LucideRefreshCw size={14} className={syncing ? 'animate-spin' : ''} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing...' : 'Sync NetInfra'}
          </button>

          <button
            onClick={handleExport}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <LucideDownload size={14} />
            Export Register
          </button>

          <button
            onClick={() => { resetForm(); setIsCreateOpen(true); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
            }}
          >
            <LucidePlus size={16} />
            Log New OTN Task
          </button>
        </div>
      </div>

      {/* 2. KPI Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>Total OTN Tasks</span>
            <LucideLayers size={18} color="#64748b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#0f172a', marginTop: '6px' }}>{metrics.total || 0}</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>HERO: {metrics.source_hero || 0} | NetInfra: {metrics.source_netinfra || 0}</div>
        </div>

        <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#2563eb' }}>Pending Review</span>
            <LucideClock size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#1e40af', marginTop: '6px' }}>{metrics.pending_approval || metrics.submitted || 0}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Awaiting BoQ review</div>
        </div>

        <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#059669' }}>Approved</span>
            <LucideShieldCheck size={18} color="#059669" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#047857', marginTop: '6px' }}>{metrics.approved || 0}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Dual-state confirmed</div>
        </div>

        <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Drafts</span>
            <LucideFileText size={18} color="#475569" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#334155', marginTop: '6px' }}>{metrics.drafts || 0}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Saved locally</div>
        </div>

        <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#dc2626' }}>Critical / Escalated</span>
            <LucideAlertTriangle size={18} color="#dc2626" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#b91c1c', marginTop: '6px' }}>{metrics.critical || 0}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Immediate attention</div>
        </div>

        <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#16a34a' }}>Resolved</span>
            <LucideCheckCircle2 size={18} color="#16a34a" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#15803d', marginTop: '6px' }}>{metrics.resolved || 0}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Cleared stretches</div>
        </div>
      </div>

      {/* 3. Status Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {[
          { key: 'ALL', label: 'All OTN Tasks', count: metrics.total },
          { key: 'DRAFT', label: 'Drafts', count: metrics.drafts },
          { key: 'PENDING_APPROVAL', label: 'Pending Review', count: metrics.pending_approval || metrics.submitted },
          { key: 'APPROVED', label: 'Approved', count: metrics.approved },
          { key: 'REJECTED', label: 'Rejected', count: metrics.rejected },
          { key: 'IN_PROGRESS', label: 'In Progress', count: metrics.in_resolution },
          { key: 'RESOLVED', label: 'Resolved', count: metrics.resolved },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'transparent',
              fontSize: '0.83rem',
              fontWeight: activeTab === tab.key ? '700' : '500',
              color: activeTab === tab.key ? '#2563eb' : '#64748b',
              borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                fontSize: '0.70rem',
                padding: '2px 6px',
                borderRadius: '10px',
                background: activeTab === tab.key ? '#dbeafe' : '#f1f5f9',
                color: activeTab === tab.key ? '#1d4ed8' : '#64748b'
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 4. Filter Toolbar */}
      <div style={{ background: '#ffffff', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <LucideSearch size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by OTN ID, obstacle, location, IE name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#64748b' }}>Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
          >
            <option value="ALL">All Types</option>
            {OTN_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#64748b' }}>Source:</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
          >
            <option value="ALL">All Sources</option>
            <option value="HERO">HERO Web</option>
            <option value="NetInfra">NetInfra</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#64748b' }}>Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {(search || typeFilter !== 'ALL' || sourceFilter !== 'ALL' || severityFilter !== 'ALL') && (
          <button
            onClick={() => { setSearch(''); setTypeFilter('ALL'); setSourceFilter('ALL'); setSeverityFilter('ALL'); }}
            style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: '0.78rem', cursor: 'pointer' }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* 5. Main OTN Register Table */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <LucideRefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
            <div>Loading OTN Register...</div>
          </div>
        ) : otnList.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <LucideNetwork size={36} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', color: '#1e293b' }}>No OTN Records Found</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#64748b' }}>
              No stretch obstacles matching the current criteria were found in the database.
            </p>
            <button
              onClick={() => { resetForm(); setIsCreateOpen(true); }}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              + Log New OTN Task
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>
                  <th style={{ padding: '12px 16px' }}>OTN ID</th>
                  <th style={{ padding: '12px 16px' }}>Classification</th>
                  <th style={{ padding: '12px 16px' }}>Location / Section</th>
                  <th style={{ padding: '12px 16px' }}>Chainage / Coordinates</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Source</th>
                  <th style={{ padding: '12px 16px' }}>Dual-State</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {otnList.map((item) => {
                  const oId = item.otnId || item.otn_id || `OTN-${item.id}`;
                  const oType = item.otn_type || item.otnType || 'Linear';
                  const subType = item.sub_otn_type || item.subOtnType || '—';
                  const hasApproved = !!(item.approvedOtn || item.approved_otn);
                  const isDraft = (item.status || '').toUpperCase() === 'DRAFT';
                  const isPending = ['PENDING_APPROVAL', 'SUBMITTED'].includes((item.status || '').toUpperCase());

                  return (
                    <tr
                      key={item.id}
                      onClick={() => { setSelectedOtn(item); setDetailTab('overview'); }}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{oId}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.logged_date || '—'}</div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '600', color: '#1e293b' }}>{oType}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{subType}</div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '500', color: '#1e293b' }}>{item.district || '—'} / {item.block || '—'}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.location || item.section || '—'}</div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '500', color: '#334155' }}>{item.chainage || '—'}</div>
                        <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                          {item.latitude ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}` : 'No GPS'}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {getStatusBadge(item.status)}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {getSourceBadge(item.source_system)}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {hasApproved ? (
                          <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <LucideCheck size={12} /> Approved State
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Proposed only
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {isDraft && (
                            <button
                              onClick={() => handleDraftSubmit(item)}
                              title="Submit for Approval"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #bfdbfe',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                fontSize: '0.72rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              Submit
                            </button>
                          )}

                          {isPending && (
                            <button
                              onClick={() => { setSelectedOtn(item); setDetailTab('comparison'); }}
                              title="Review OTN"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #bbf7d0',
                                background: '#f0fdf4',
                                color: '#15803d',
                                fontSize: '0.72rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              Review
                            </button>
                          )}

                          <button
                            onClick={() => { setSelectedOtn(item); setDetailTab('overview'); }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#334155',
                              fontSize: '0.72rem',
                              cursor: 'pointer'
                            }}
                          >
                            Inspect
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 6. CREATE / LOG NEW OTN TASK MODAL (Sections A-E) */}
      {/* ============================================================== */}
      {isCreateOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '14px', width: '100%', maxWidth: '840px',
            maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            padding: '24px', boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: '700', color: '#0f172a' }}>
                  Log New OTN Task (OtnTaskData)
                </h2>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                  Raised on site against an approved BoQ plan stretch with proposed OTN details.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <LucideX size={20} />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateSubmit('submit'); }}>
              
              {/* SECTION A – OTN Information */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '12px' }}>
                  Section A – OTN Task Information
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                      OTN ID (Auto or Custom)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. OTN-2026-106"
                      value={formData.otnId}
                      onChange={(e) => setFormData({ ...formData, otnId: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                      Severity
                    </label>
                    <select
                      value={formData.severity}
                      onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', background: '#fff' }}
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                      OTN Type (Controlled Master) *
                    </label>
                    <select
                      value={formData.otnType}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', background: '#fff' }}
                    >
                      {OTN_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                      Sub-OTN Type (Dynamic Dependency) *
                    </label>
                    <select
                      value={formData.subOtnType}
                      onChange={(e) => setFormData({ ...formData, subOtnType: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', background: '#fff' }}
                    >
                      {(SUB_OTN_TYPES[formData.otnType] || []).map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                      {(SUB_OTN_TYPES[formData.otnType] || []).length === 0 && (
                        <option value="">No sub-types available</option>
                      )}
                    </select>
                  </div>
                </div>

                {formData.subOtnType === 'Other Remarks (Open Text)' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                      Other Remarks Specification *
                    </label>
                    <input
                      type="text"
                      placeholder="Specify obstacle subtype..."
                      value={formData.otherRemarks}
                      onChange={(e) => setFormData({ ...formData, otherRemarks: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                    Obstacle Title / Summary
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BoQ Stretch Obstacle between PoP Saha and GP Kesri"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                    Description of Obstacle *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Provide full description of the stretch bottleneck..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                    Remarks & Mitigation Note
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Proposed mitigation steps, duct encasement, authority coordination..."
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              {/* SECTION B – Location Information */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '12px' }}>
                  Section B – Location & Coordinates
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>District</label>
                    <input
                      type="text"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Block</label>
                    <input
                      type="text"
                      placeholder="e.g. Saha"
                      value={formData.block}
                      onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Location / Section</label>
                    <input
                      type="text"
                      placeholder="e.g. BoQ Stretch PoP Kesri"
                      value={formData.section}
                      onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Point Latitude</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 30.2512"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Point Longitude</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 77.0145"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Stretch Coordinates */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Start Lat (sLatitude)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="30.2505"
                      value={formData.sLatitude}
                      onChange={(e) => setFormData({ ...formData, sLatitude: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Start Lng (sLongitude)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="77.0140"
                      value={formData.sLongitude}
                      onChange={(e) => setFormData({ ...formData, sLongitude: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>End Lat (eLatitude)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="30.2520"
                      value={formData.eLatitude}
                      onChange={(e) => setFormData({ ...formData, eLatitude: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>End Lng (eLongitude)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="77.0150"
                      value={formData.eLongitude}
                      onChange={(e) => setFormData({ ...formData, eLongitude: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Chainage</label>
                    <input
                      type="text"
                      placeholder="e.g. CH 04+100 to 04+350"
                      value={formData.chainage}
                      onChange={(e) => setFormData({ ...formData, chainage: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>Department / Agency</label>
                    <input
                      type="text"
                      placeholder="e.g. BSNL, GAIL, PWD"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION C – Media Upload (SurveyPhoto) */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '12px' }}>
                  Section C – Evidence & Media Upload (SurveyPhoto)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  {/* Start Photo */}
                  <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Start Photo</div>
                    {formData.startPhoto ? (
                      <div style={{ position: 'relative' }}>
                        <img src={formData.startPhoto.url} alt="Start" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px' }} />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, startPhoto: null })}
                          style={{ position: 'absolute', top: 4, right: 4, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label style={{ cursor: 'pointer', display: 'block' }}>
                        <LucideUploadCloud size={24} color="#94a3b8" style={{ margin: '0 auto 4px' }} />
                        <span style={{ fontSize: '0.70rem', color: '#2563eb' }}>Upload Start Photo</span>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'startPhoto')} />
                      </label>
                    )}
                  </div>

                  {/* End Photo */}
                  <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>End Photo</div>
                    {formData.endPhoto ? (
                      <div style={{ position: 'relative' }}>
                        <img src={formData.endPhoto.url} alt="End" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px' }} />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, endPhoto: null })}
                          style={{ position: 'absolute', top: 4, right: 4, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label style={{ cursor: 'pointer', display: 'block' }}>
                        <LucideUploadCloud size={24} color="#94a3b8" style={{ margin: '0 auto 4px' }} />
                        <span style={{ fontSize: '0.70rem', color: '#2563eb' }}>Upload End Photo</span>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'endPhoto')} />
                      </label>
                    )}
                  </div>

                  {/* Walkthrough Video */}
                  <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Walkthrough Video</div>
                    {formData.walkthroughVideo ? (
                      <div style={{ fontSize: '0.72rem', color: '#047857', padding: '10px' }}>
                        <LucideVideo size={20} style={{ margin: '0 auto 4px' }} />
                        <div>{formData.walkthroughVideo.fileName}</div>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, walkthroughVideo: null })}
                          style={{ color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.70rem', marginTop: '4px' }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label style={{ cursor: 'pointer', display: 'block' }}>
                        <LucideVideo size={24} color="#94a3b8" style={{ margin: '0 auto 4px' }} />
                        <span style={{ fontSize: '0.70rem', color: '#2563eb' }}>Upload Video (≤5 min)</span>
                        <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'walkthroughVideo')} />
                      </label>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: '#f8fafc', fontSize: '0.75rem', fontWeight: '600', color: '#334155',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                  }}>
                    <LucideImage size={14} /> + Add More Photos (up to 10)
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'additionalPhotos', true)} />
                  </label>

                  <label style={{
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: '#f8fafc', fontSize: '0.75rem', fontWeight: '600', color: '#334155',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                  }}>
                    <LucideVideo size={14} /> + Add Additional Video (up to 2)
                    <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'additionalVideos', true)} />
                  </label>
                </div>

                {formData.additionalPhotos.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {formData.additionalPhotos.map((p, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 60, height: 60 }}>
                        <img src={p.url} alt={`Add ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, additionalPhotos: formData.additionalPhotos.filter((_, i) => i !== idx) })}
                          style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION D – Independent Engineer Details */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '12px' }}>
                  Section D – Independent Engineer (IE) Details
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>IE Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Col. R. K. Sharma"
                      value={formData.ieName}
                      onChange={(e) => setFormData({ ...formData, ieName: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '3px' }}>IE Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 9876543210"
                      value={formData.iePhoneNumber}
                      onChange={(e) => setFormData({ ...formData, iePhoneNumber: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.80rem', fontWeight: '600', color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.iePhotoNeeded}
                      onChange={(e) => setFormData({ ...formData, iePhotoNeeded: e.target.checked })}
                    />
                    IE Photo Needed
                  </label>

                  {formData.iePhotoNeeded && (
                    <div style={{ flex: 1 }}>
                      {formData.iePhoto ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', padding: '4px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                          <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>✓ IE Photo Uploaded</span>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, iePhoto: null })}
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.72rem' }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label style={{
                          padding: '6px 12px', borderRadius: '8px', border: '1px solid #fecaca',
                          background: '#fef2f2', fontSize: '0.75rem', fontWeight: '600', color: '#991b1b',
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}>
                          <LucideUploadCloud size={14} /> Upload Mandatory IE Photo *
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'iePhoto')} />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION E – Supporting Documents (SHP files) */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '12px' }}>
                  Section E – Supporting Documents & SHP Files
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{
                    padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: '#f8fafc', fontSize: '0.78rem', fontWeight: '600', color: '#334155',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                  }}>
                    <LucideFileArchive size={16} /> Upload SHP / Survey Files
                    <input type="file" multiple style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'shpFiles', true)} />
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Supports .shp, .dbf, .shx, or zip archives</span>
                </div>

                {formData.shpFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {formData.shpFiles.map((f, i) => (
                      <span key={i} style={{ fontSize: '0.72rem', background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', color: '#334155', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {typeof f === 'string' ? f.split('/').pop() : f.fileName}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, shpFiles: formData.shpFiles.filter((_, idx) => idx !== i) })}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleCreateSubmit('draft')}
                  disabled={uploading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #94a3b8',
                    background: '#f1f5f9',
                    color: '#334155',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: uploading ? 'not-allowed' : 'pointer'
                  }}
                >
                  Save as Draft
                </button>

                <button
                  type="submit"
                  disabled={uploading}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                  }}
                >
                  {uploading ? 'Uploading...' : 'Submit for Approval'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 7. OTN DETAILS & REVIEW MODAL (INSPECT SCREEN) */}
      {/* ============================================================== */}
      {selectedOtn && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '14px', width: '100%', maxWidth: '860px',
            maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            padding: '24px', boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a' }}>
                    {selectedOtn.otnId || selectedOtn.otn_id}
                  </h2>
                  {getStatusBadge(selectedOtn.status)}
                  {getSourceBadge(selectedOtn.source_system)}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  {selectedOtn.title}
                </div>
              </div>

              <button
                onClick={() => setSelectedOtn(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <LucideX size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #e2e8f0', marginBottom: '18px' }}>
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'location', label: 'Location & GPS' },
                { key: 'media', label: 'Evidence & Media' },
                { key: 'comparison', label: 'Approval Comparison (Dual-State)' },
                { key: 'history', label: 'Approval History' }
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setDetailTab(t.key)}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '0.80rem',
                    fontWeight: detailTab === t.key ? '700' : '500',
                    color: detailTab === t.key ? '#2563eb' : '#64748b',
                    borderBottom: detailTab === t.key ? '2px solid #2563eb' : '2px solid transparent',
                    cursor: 'pointer'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB CONTENT: 1. OVERVIEW */}
            {detailTab === 'overview' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Classification</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b' }}>
                      {selectedOtn.otn_type || selectedOtn.otnType || 'Linear'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                      Sub-type: {selectedOtn.sub_otn_type || selectedOtn.subOtnType || '—'}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Severity</div>
                    <div style={{ marginTop: '2px' }}>{getSeverityBadge(selectedOtn.severity)}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Obstacle Description</div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '0.82rem', color: '#1e293b', lineHeight: '1.4' }}>
                    {selectedOtn.description || 'No description provided.'}
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Remarks / Mitigation Plan</div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '0.82rem', color: '#1e293b', lineHeight: '1.4' }}>
                    {selectedOtn.remarks || selectedOtn.mitigation || 'No remarks provided.'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '0.78rem' }}>
                  <div><span style={{ color: '#64748b' }}>Contractor:</span> <span style={{ fontWeight: '600' }}>{selectedOtn.contractor || '—'}</span></div>
                  <div><span style={{ color: '#64748b' }}>Department:</span> <span style={{ fontWeight: '600' }}>{selectedOtn.department || '—'}</span></div>
                  <div><span style={{ color: '#64748b' }}>Logged Date:</span> <span style={{ fontWeight: '600' }}>{selectedOtn.logged_date || '—'}</span></div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 2. LOCATION & GPS */}
            {detailTab === 'location' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>District & Block</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b' }}>
                      {selectedOtn.district || '—'} / {selectedOtn.block || '—'}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Location / Section</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b' }}>
                      {selectedOtn.location || selectedOtn.section || '—'}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Chainage</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b' }}>
                      {selectedOtn.chainage || '—'}
                    </div>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Point & Stretch GPS Coordinates</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '0.78rem' }}>
                    <div>
                      <div style={{ color: '#64748b' }}>Obstacle Point:</div>
                      <div style={{ fontWeight: '600' }}>
                        {selectedOtn.latitude ? `${selectedOtn.latitude}, ${selectedOtn.longitude}` : 'No Point GPS'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b' }}>Start Point (sLatitude):</div>
                      <div style={{ fontWeight: '600' }}>
                        {selectedOtn.s_latitude || selectedOtn.sLatitude ? `${selectedOtn.s_latitude || selectedOtn.sLatitude}, ${selectedOtn.s_longitude || selectedOtn.sLongitude}` : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b' }}>End Point (eLatitude):</div>
                      <div style={{ fontWeight: '600' }}>
                        {selectedOtn.e_latitude || selectedOtn.eLatitude ? `${selectedOtn.e_latitude || selectedOtn.eLatitude}, ${selectedOtn.e_longitude || selectedOtn.eLongitude}` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 3. EVIDENCE & MEDIA */}
            {detailTab === 'media' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  {/* Start Photo */}
                  <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>Start Photo</div>
                    {selectedOtn.start_photo?.url || (typeof selectedOtn.start_photo === 'string' && selectedOtn.start_photo) ? (
                      <img
                        src={selectedOtn.start_photo.url || selectedOtn.start_photo}
                        alt="Start Point"
                        style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                        onClick={() => window.open(selectedOtn.start_photo.url || selectedOtn.start_photo, '_blank')}
                      />
                    ) : (
                      <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.72rem' }}>No Photo</div>
                    )}
                  </div>

                  {/* End Photo */}
                  <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>End Photo</div>
                    {selectedOtn.end_photo?.url || (typeof selectedOtn.end_photo === 'string' && selectedOtn.end_photo) ? (
                      <img
                        src={selectedOtn.end_photo.url || selectedOtn.end_photo}
                        alt="End Point"
                        style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                        onClick={() => window.open(selectedOtn.end_photo.url || selectedOtn.end_photo, '_blank')}
                      />
                    ) : (
                      <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.72rem' }}>No Photo</div>
                    )}
                  </div>

                  {/* IE Photo */}
                  <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                      IE Photo {selectedOtn.ie_name ? `(${selectedOtn.ie_name})` : ''}
                    </div>
                    {selectedOtn.ie_photo?.url || (typeof selectedOtn.ie_photo === 'string' && selectedOtn.ie_photo) ? (
                      <img
                        src={selectedOtn.ie_photo.url || selectedOtn.ie_photo}
                        alt="IE"
                        style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                        onClick={() => window.open(selectedOtn.ie_photo.url || selectedOtn.ie_photo, '_blank')}
                      />
                    ) : (
                      <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.72rem' }}>
                        {selectedOtn.ie_photo_needed ? 'Required (Not uploaded)' : 'Not needed'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional Photos Gallery */}
                {Array.isArray(selectedOtn.additional_photos) && selectedOtn.additional_photos.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                      Additional Photos ({selectedOtn.additional_photos.length})
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {selectedOtn.additional_photos.map((p, idx) => {
                        const url = p.url || (typeof p === 'string' ? p : '');
                        return (
                          <img
                            key={idx}
                            src={url}
                            alt={`Evidence ${idx}`}
                            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                            onClick={() => window.open(url, '_blank')}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 4. DUAL-STATE APPROVAL COMPARISON */}
            {detailTab === 'comparison' && (
              <div>
                <div style={{ fontSize: '0.80rem', color: '#64748b', marginBottom: '14px' }}>
                  Dual-state representation: Submitter data is preserved in <strong>proposedOtn</strong>, reviewer version in <strong>approvedOtn</strong>.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* Proposed OTN Card */}
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e40af' }}>1. Proposed OTN Task</span>
                      <span style={{ fontSize: '0.70rem', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '6px' }}>Submitter Version</span>
                    </div>

                    {selectedOtn.proposedOtn || selectedOtn.proposed_otn ? (
                      (() => {
                        const prop = selectedOtn.proposedOtn || selectedOtn.proposed_otn;
                        return (
                          <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div><span style={{ color: '#64748b' }}>Type:</span> <strong>{prop.otnType || '—'}</strong></div>
                            <div><span style={{ color: '#64748b' }}>Sub-type:</span> <strong>{prop.subOtnType || '—'}</strong></div>
                            <div><span style={{ color: '#64748b' }}>Status:</span> <strong>{prop.status || '—'}</strong></div>
                            <div><span style={{ color: '#64748b' }}>Description:</span> <p style={{ margin: '2px 0 0', color: '#334155' }}>{prop.description || '—'}</p></div>
                            <div><span style={{ color: '#64748b' }}>Remarks:</span> <p style={{ margin: '2px 0 0', color: '#334155' }}>{prop.remarks || '—'}</p></div>
                            <div><span style={{ color: '#64748b' }}>Start GPS:</span> {prop.sLatitude ? `${prop.sLatitude}, ${prop.sLongitude}` : '—'}</div>
                            <div><span style={{ color: '#64748b' }}>End GPS:</span> {prop.eLatitude ? `${prop.eLatitude}, ${prop.eLongitude}` : '—'}</div>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No proposed snapshot recorded</div>
                    )}
                  </div>

                  {/* Approved OTN Card */}
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#047857' }}>2. Approved OTN Task</span>
                      <span style={{ fontSize: '0.70rem', background: '#dcfce7', color: '#047857', padding: '2px 6px', borderRadius: '6px' }}>Reviewer Version</span>
                    </div>

                    {selectedOtn.approvedOtn || selectedOtn.approved_otn ? (
                      (() => {
                        const app = selectedOtn.approvedOtn || selectedOtn.approved_otn;
                        return (
                          <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div><span style={{ color: '#64748b' }}>Type:</span> <strong>{app.otnType || '—'}</strong></div>
                            <div><span style={{ color: '#64748b' }}>Sub-type:</span> <strong>{app.subOtnType || '—'}</strong></div>
                            <div><span style={{ color: '#64748b' }}>Approved Status:</span> <strong>{app.status || 'APPROVED'}</strong></div>
                            <div><span style={{ color: '#64748b' }}>Reviewer Remarks:</span> <p style={{ margin: '2px 0 0', color: '#047857', fontWeight: '600' }}>{app.remarks || '—'}</p></div>
                            <div><span style={{ color: '#64748b' }}>Approved Start GPS:</span> {app.sLatitude ? `${app.sLatitude}, ${app.sLongitude}` : '—'}</div>
                            <div><span style={{ color: '#64748b' }}>Approved End GPS:</span> {app.eLatitude ? `${app.eLatitude}, ${app.eLongitude}` : '—'}</div>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ padding: '24px 12px', textAlign: 'center', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        <LucideClock size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />
                        <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#475569' }}>Pending Review</div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                          Reviewer has not yet approved or adjusted this record.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 5. APPROVAL HISTORY */}
            {detailTab === 'history' && (
              <div>
                <div style={{ fontSize: '0.80rem', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
                  Workflow Audit Trail
                </div>

                {Array.isArray(selectedOtn.approvalHistory || selectedOtn.approval_history) &&
                (selectedOtn.approvalHistory || selectedOtn.approval_history).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(selectedOtn.approvalHistory || selectedOtn.approval_history).map((entry, idx) => (
                      <div key={idx} style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #2563eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e293b' }}>
                            {entry.action}
                          </span>
                          <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                          By: <strong>{entry.user || 'System'}</strong> | Status: {entry.status}
                        </div>
                        {entry.remarks && (
                          <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '4px', fontStyle: 'italic' }}>
                            "{entry.remarks}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.78rem', padding: '16px', textAlign: 'center' }}>
                    No audit records logged.
                  </div>
                )}
              </div>
            )}

            {/* Inspect Modal Footer Workflow Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid #e2e8f0', marginTop: '20px' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Source: <strong>{selectedOtn.source_system}</strong>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {(selectedOtn.status || '').toUpperCase() === 'DRAFT' && (
                  <button
                    onClick={() => handleDraftSubmit(selectedOtn)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none',
                      background: '#2563eb', color: '#fff', fontSize: '0.80rem', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    Submit for Approval
                  </button>
                )}

                {['PENDING_APPROVAL', 'SUBMITTED'].includes((selectedOtn.status || '').toUpperCase()) && (
                  <>
                    <button
                      onClick={() => setIsRejectOpen(true)}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', border: '1px solid #fecaca',
                        background: '#fef2f2', color: '#b91c1c', fontSize: '0.80rem', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      Reject
                    </button>

                    <button
                      onClick={() => setIsApproveOpen(true)}
                      style={{
                        padding: '8px 18px', borderRadius: '8px', border: 'none',
                        background: '#059669', color: '#fff', fontSize: '0.80rem', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      Approve OTN Task
                    </button>
                  </>
                )}

                {(selectedOtn.status || '').toUpperCase() === 'APPROVED' && (
                  <button
                    onClick={() => handleResolve(selectedOtn)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none',
                      background: '#15803d', color: '#fff', fontSize: '0.80rem', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    Mark as Resolved
                  </button>
                )}

                <button
                  onClick={() => setSelectedOtn(null)}
                  style={{
                    padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: '#fff', color: '#475569', fontSize: '0.80rem', cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 8. APPROVE DIALOG */}
      {/* ============================================================== */}
      {isApproveOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '16px'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#047857' }}>
              Approve OTN Task Submission
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.80rem', color: '#64748b' }}>
              Submitting approval will populate approvedOtn and set status to APPROVED while preserving the original submission in proposedOtn.
            </p>

            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
              Reviewer Approval Remarks / Conditions
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Approved with condition of maintaining Western shoulder alignment."
              value={actionRemarks}
              onChange={(e) => setActionRemarks(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '16px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsApproveOpen(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.80rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#059669', color: '#fff', fontSize: '0.80rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 9. REJECT DIALOG */}
      {/* ============================================================== */}
      {isRejectOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '16px'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#b91c1c' }}>
              Reject OTN Task Submission
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.80rem', color: '#64748b' }}>
              Please provide the reason for rejection. The original submission will be preserved and returned to the submitter.
            </p>

            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
              Rejection Reason *
            </label>
            <textarea
              rows={3}
              placeholder="e.g. BoQ plan deviation not justified. Resubmit with joint inspection notes."
              value={actionRemarks}
              onChange={(e) => setActionRemarks(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '16px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsRejectOpen(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.80rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#b91c1c', color: '#fff', fontSize: '0.80rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TaskOtnPage;
