import React, { useState, useEffect, useCallback } from 'react';
import {
  LucideFileCheck, LucidePlus, LucideSearch, LucideRefreshCw,
  LucideClock, LucideCheckCircle2, LucideAlertTriangle, LucideXCircle,
  LucideLayers, LucideDownload, LucideX, LucideMapPin, LucideBuilding2,
  LucideFileText, LucideUploadCloud, LucideImage, LucideVideo,
  LucideCheck, LucideShieldCheck, LucideCompass, LucideMap, LucideSend,
  LucideHistory, LucideGitCompare
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ccnService } from '../../services/ccnService';

// Controlled Classification Masters strictly matching Java Enums:
// com.netinfra.platform.task.dao.entities.survey.CcnTaskData
const CCN_SUBTYPE_1 = [
  'Linear',
  'Architecture change Involved'
];

const CCN_SUBTYPE_2 = {
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
    'Hard Rock',
    'Public issue',
    'Permission restriction from the concerned',
    'Road Expansion'
  ]
};

const INITIAL_FORM = {
  ccnId: '',
  subtype1: 'Linear',
  subtype2: 'Low Depth',
  title: '',
  ccnDetails: '',
  remarks: '',
  severity: 'HIGH',
  circle: 'Haryana',
  district: 'Ambala',
  block: '',
  section: '',
  location: '',
  chainage: '',
  chainage_from: '',
  chainage_to: '',
  contractor: '',
  department: 'Change Control Board',
  sLatitude: '',
  sLongitude: '',
  eLatitude: '',
  eLongitude: '',
  startPhoto: null,
  additionalStartPhotos: [],
  walkthroughVideo: null,
  additionalRouteVideos: [],
  endPhoto: null,
  additionalEndPhotos: [],
  additionalEndVideos: [],
  kmlType: 'UPLOADED',
  kmlFile: null,
  kmlFileName: '',
  kmlFileKey: '',
  kmlContent: '',
};

const getStatusBadgeStyle = (status) => {
  const s = String(status || '').toUpperCase();
  switch (s) {
    case 'APPROVED':
      return { bg: '#dcfce7', color: '#15803d', border: '#86efac', label: 'Approved' };
    case 'PENDING_APPROVAL':
    case 'SUBMITTED':
      return { bg: '#fef9c3', color: '#a16207', border: '#fde047', label: 'Pending Approval' };
    case 'REJECTED':
      return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', label: 'Rejected' };
    case 'DRAFT':
      return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: 'Draft' };
    case 'RESOLVED':
      return { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc', label: 'Resolved' };
    case 'ESCALATED':
      return { bg: '#fae8ff', color: '#86198f', border: '#f0abfc', label: 'Escalated' };
    default:
      return { bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd', label: s || 'Open' };
  }
};

const getSeverityBadgeStyle = (severity) => {
  const s = String(severity || '').toUpperCase();
  switch (s) {
    case 'CRITICAL':
      return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    case 'HIGH':
      return { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' };
    case 'MEDIUM':
      return { bg: '#fefce8', color: '#ca8a04', border: '#fef08a' };
    default:
      return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
  }
};

export const TaskCcnPage = () => {
  const [ccnList, setCcnList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
  const [activeTab, setActiveTab] = useState('ALL');
  const [subtype1Filter, setSubtype1Filter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');

  // Modals
  const [selectedCcn, setSelectedCcn] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [actionRemarks, setActionRemarks] = useState('');
  const [approvedNotes, setApprovedNotes] = useState('');

  const [formData, setFormData] = useState(INITIAL_FORM);
  const { showToast } = useToast();

  const loadCcnRecords = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeTab !== 'ALL') params.status = activeTab;
      if (subtype1Filter !== 'ALL') params.subtype1 = subtype1Filter;
      if (severityFilter !== 'ALL') params.severity = severityFilter;
      if (sourceFilter !== 'ALL') params.source = sourceFilter;
      if (search.trim()) params.search = search.trim();

      const res = await ccnService.getAll(params);
      const data = res?.results || res?.data?.results || res?.data || (Array.isArray(res) ? res : []);
      setCcnList(data);
      if (res?.metrics) {
        setMetrics(res.metrics);
      }
    } catch (err) {
      console.error('Failed to load CCN records:', err);
      showToast('Could not load CCN records from server', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, subtype1Filter, severityFilter, sourceFilter, search, showToast]);

  useEffect(() => {
    loadCcnRecords();
  }, [loadCcnRecords]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      showToast('Connecting to NetInfra / iLync API for CCN tasks (read-only)...', 'info');
      const res = await ccnService.syncExternal();
      const msg = res?.message || res?.data?.message || 'Sync completed.';
      if (res?.success === false) {
        showToast(msg, 'warning');
      } else {
        showToast(`✓ ${msg}`, 'success');
      }
      loadCcnRecords();
    } catch (err) {
      console.error('NetInfra CCN sync error:', err);
      showToast('NetInfra synchronization failed. Showing local HERO records.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = () => {
    const url = ccnService.exportCsvUrl();
    window.open(url, '_blank');
    showToast('Exporting CCN register to CSV...', 'info');
  };

  const handleSubtype1Change = (newSt1) => {
    const options = CCN_SUBTYPE_2[newSt1] || [];
    setFormData(prev => ({
      ...prev,
      subtype1: newSt1,
      subtype2: options.length > 0 ? options[0] : ''
    }));
  };

  const captureGps = (target) => {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported by this browser', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        if (target === 'start') {
          setFormData(prev => ({ ...prev, sLatitude: lat, sLongitude: lng }));
        } else {
          setFormData(prev => ({ ...prev, eLatitude: lat, eLongitude: lng }));
        }
        showToast(`✓ Captured ${target} GPS coordinates (${lat}, ${lng})`, 'success');
      },
      () => showToast('Unable to retrieve GPS position', 'error')
    );
  };

  const handleFileUpload = async (e, fieldType, maxLimit = null) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    try {
      setUploading(true);
      for (const file of files) {
        const uploadForm = new FormData();
        uploadForm.append('file', file);
        if (formData.sLatitude) uploadForm.append('latitude', formData.sLatitude);
        if (formData.sLongitude) uploadForm.append('longitude', formData.sLongitude);

        const res = await ccnService.uploadMedia(uploadForm);
        const photoObj = res?.photo || res?.data || res?.data?.photo;
        if (!photoObj) continue;

        if (fieldType === 'startPhoto') {
          setFormData(prev => ({ ...prev, startPhoto: photoObj }));
        } else if (fieldType === 'endPhoto') {
          setFormData(prev => ({ ...prev, endPhoto: photoObj }));
        } else if (fieldType === 'walkthroughVideo') {
          setFormData(prev => ({ ...prev, walkthroughVideo: photoObj }));
        } else if (fieldType === 'kmlFile') {
          setFormData(prev => ({
            ...prev,
            kmlFile: photoObj,
            kmlFileName: photoObj.fileName || file.name,
            kmlFileKey: photoObj.key || '',
            kmlContent: res?.kmlContent || prev.kmlContent
          }));
        } else if (fieldType === 'additionalStartPhotos') {
          setFormData(prev => ({
            ...prev,
            additionalStartPhotos: [...prev.additionalStartPhotos, photoObj].slice(0, maxLimit || 4)
          }));
        } else if (fieldType === 'additionalRouteVideos') {
          setFormData(prev => ({
            ...prev,
            additionalRouteVideos: [...prev.additionalRouteVideos, photoObj].slice(0, maxLimit || 4)
          }));
        } else if (fieldType === 'additionalEndPhotos') {
          setFormData(prev => ({
            ...prev,
            additionalEndPhotos: [...prev.additionalEndPhotos, photoObj].slice(0, maxLimit || 10)
          }));
        } else if (fieldType === 'additionalEndVideos') {
          setFormData(prev => ({
            ...prev,
            additionalEndVideos: [...prev.additionalEndVideos, photoObj].slice(0, maxLimit || 2)
          }));
        }
      }
      showToast(`✓ Uploaded ${files.length} file(s)`, 'success');
    } catch (err) {
      console.error('Upload error:', err);
      showToast('File upload failed', 'error');
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const handleCreateSubmit = async (actionType = 'submit') => {
    const isDraft = actionType === 'draft';
    if (!isDraft && !formData.ccnDetails.trim()) {
      showToast('Please enter CCN details before submitting for approval', 'error');
      return;
    }
    if (formData.ccnDetails.length > 6000) {
      showToast('CCN Details cannot exceed 6,000 characters', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ccnId: formData.ccnId || undefined,
        subtype1: formData.subtype1,
        subtype2: formData.subtype2,
        title: formData.title || `CCN ${formData.subtype1}: ${formData.subtype2 || 'Change Notice'}`,
        ccnDetails: formData.ccnDetails,
        description: formData.ccnDetails,
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
        sLatitude: formData.sLatitude ? parseFloat(formData.sLatitude) : null,
        sLongitude: formData.sLongitude ? parseFloat(formData.sLongitude) : null,
        eLatitude: formData.eLatitude ? parseFloat(formData.eLatitude) : null,
        eLongitude: formData.eLongitude ? parseFloat(formData.eLongitude) : null,
        startPhoto: formData.startPhoto,
        additionalStartPhotos: formData.additionalStartPhotos,
        walkthroughVideo: formData.walkthroughVideo,
        additionalRouteVideos: formData.additionalRouteVideos,
        endPhoto: formData.endPhoto,
        additionalEndPhotos: formData.additionalEndPhotos,
        additionalEndVideos: formData.additionalEndVideos,
        kmlType: formData.kmlType,
        kmlFile: formData.kmlFile,
        kmlFileName: formData.kmlFileName,
        kmlFileKey: formData.kmlFileKey,
        kmlContent: formData.kmlContent,
        action: isDraft ? 'draft' : 'submit'
      };

      await ccnService.create(payload);
      showToast(isDraft ? '✓ CCN saved as draft' : '✓ CCN submitted for approval', 'success');
      setIsCreateOpen(false);
      setFormData(INITIAL_FORM);
      loadCcnRecords();
    } catch (err) {
      console.error('Failed to save CCN:', err);
      showToast('Failed to save CCN record', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDraft = async (ccn) => {
    try {
      const res = await ccnService.submit(ccn.id, { remarks: 'Submitted for Change Control Board review.' });
      showToast(`✓ CCN ${ccn.ccnId || ccn.ccn_id} submitted for approval`, 'success');
      const updated = res?.data || res;
      setSelectedCcn(updated);
      loadCcnRecords();
    } catch (err) {
      showToast('Failed to submit CCN draft', 'error');
    }
  };

  const handleApprove = async () => {
    if (!selectedCcn) return;
    try {
      const proposed = selectedCcn.proposedCcn || {};
      const approvedPayload = {
        remarks: actionRemarks || 'Approved by Change Control Board.',
        approvedCcn: {
          ...proposed,
          ccnDetails: approvedNotes.trim() || proposed.ccnDetails || selectedCcn.ccn_details || '',
          status: 'APPROVED',
          remarks: actionRemarks || 'Approved by Change Control Board.'
        }
      };
      const res = await ccnService.approve(selectedCcn.id, approvedPayload);
      showToast(`✓ CCN ${selectedCcn.ccnId || selectedCcn.ccn_id} Approved (Dual-State Recorded)`, 'success');
      setSelectedCcn(res?.data || res);
      setIsApproveOpen(false);
      setActionRemarks('');
      setApprovedNotes('');
      loadCcnRecords();
    } catch (err) {
      showToast('Approval failed', 'error');
    }
  };

  const handleReject = async () => {
    if (!selectedCcn) return;
    if (!actionRemarks.trim()) {
      showToast('Rejection remarks are mandatory', 'error');
      return;
    }
    try {
      const res = await ccnService.reject(selectedCcn.id, { remarks: actionRemarks.trim() });
      showToast(`CCN ${selectedCcn.ccnId || selectedCcn.ccn_id} Rejected`, 'warning');
      setSelectedCcn(res?.data || res);
      setIsRejectOpen(false);
      setActionRemarks('');
      loadCcnRecords();
    } catch (err) {
      showToast('Rejection failed', 'error');
    }
  };

  const statusTabs = [
    { id: 'ALL', label: 'All CCNs', count: metrics.total },
    { id: 'DRAFT', label: 'Drafts', count: metrics.drafts },
    { id: 'PENDING_APPROVAL', label: 'Pending Approval', count: metrics.pending_approval },
    { id: 'APPROVED', label: 'Approved', count: metrics.approved },
    { id: 'REJECTED', label: 'Rejected', count: metrics.rejected },
    { id: 'RESOLVED', label: 'Resolved', count: metrics.resolved },
  ];

  const renderPhotoThumb = (item, idx, label) => {
    if (!item || !item.url) return null;
    const isVideo = (item.mimeType || '').startsWith('video') || /\.(mp4|mov|webm)$/i.test(item.fileName || item.url);
    return (
      <div
        key={idx}
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '8px',
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{label}</div>
        {isVideo ? (
          <video src={item.url} controls style={{ width: '100%', height: '110px', borderRadius: '6px', background: '#000' }} />
        ) : (
          <a href={item.url} target="_blank" rel="noreferrer">
            <img
              src={item.url}
              alt={item.fileName || label}
              style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </a>
        )}
        <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.fileName || item.key || 'Attachment'}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #2563eb, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}>
              <LucideFileCheck size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                Change Control Notice (CCN) Register
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
                CcnTaskData dual-state lifecycle (Proposed vs Approved), Route Evidence & KML alignment
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
              borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff',
              color: '#334155', fontWeight: 600, fontSize: '13px', cursor: syncing ? 'not-allowed' : 'pointer'
            }}
          >
            <LucideRefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing NetInfra...' : 'Sync NetInfra (Read-Only)'}
          </button>

          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
              borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff',
              color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
            }}
          >
            <LucideDownload size={15} /> Export CSV
          </button>

          <button
            onClick={() => { setFormData(INITIAL_FORM); setIsCreateOpen(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
              borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
              color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37,99,235,0.28)'
            }}
          >
            <LucidePlus size={16} /> Raise CCN
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '14px', marginBottom: '22px' }}>
        {[
          { label: 'Total CCNs', value: metrics.total, sub: `HERO: ${metrics.source_hero} | NetInfra: ${metrics.source_netinfra}`, icon: LucideLayers, accent: '#2563eb', bg: '#eff6ff' },
          { label: 'Pending Approval', value: metrics.pending_approval, sub: 'Awaiting CCB review', icon: LucideClock, accent: '#d97706', bg: '#fffbeb' },
          { label: 'Approved CCNs', value: metrics.approved, sub: 'Dual-state signed off', icon: LucideCheckCircle2, accent: '#16a34a', bg: '#f0fdf4' },
          { label: 'Drafts', value: metrics.drafts, sub: 'Not yet submitted', icon: LucideFileText, accent: '#475569', bg: '#f8fafc' },
          { label: 'Rejected', value: metrics.rejected, sub: 'Returned with remarks', icon: LucideXCircle, accent: '#dc2626', bg: '#fef2f2' },
          { label: 'Critical Priority', value: metrics.critical, sub: 'Immediate escalation', icon: LucideAlertTriangle, accent: '#9333ea', bg: '#faf5ff' },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>{card.label}</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: card.bg, color: card.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={17} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Status Tabs & Filters Card */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 16px 0', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {statusTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                  background: 'transparent',
                  color: active ? '#2563eb' : '#64748b',
                  fontWeight: active ? 700 : 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: '11px',
                  padding: '1px 7px',
                  borderRadius: '99px',
                  background: active ? '#dbeafe' : '#f1f5f9',
                  color: active ? '#1d4ed8' : '#64748b'
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <LucideSearch size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search CCN ID, title, district, chainage, KML filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px 9px 36px', borderRadius: '9px',
                border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff', outline: 'none'
              }}
            />
          </div>

          <select
            value={subtype1Filter}
            onChange={(e) => setSubtype1Filter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
          >
            <option value="ALL">All Subtype 1</option>
            {CCN_SUBTYPE_1.map(st => <option key={st} value={st}>{st}</option>)}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
          >
            <option value="ALL">All Sources</option>
            <option value="HERO">HERO Web</option>
            <option value="NetInfra">NetInfra / iLync</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 16px' }}>CCN ID & Source</th>
                <th style={{ padding: '12px 16px' }}>Title & Classification</th>
                <th style={{ padding: '12px 16px' }}>Location & Chainage</th>
                <th style={{ padding: '12px 16px' }}>KML Route</th>
                <th style={{ padding: '12px 16px' }}>Severity</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    Loading CCN register...
                  </td>
                </tr>
              ) : ccnList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    No Change Control Notices match the active filters.
                  </td>
                </tr>
              ) : ccnList.map((item) => {
                const st = getStatusBadgeStyle(item.status);
                const sev = getSeverityBadgeStyle(item.severity);
                const isNetInfra = item.source_system !== 'HERO';
                return (
                  <tr
                    key={item.id}
                    onClick={() => { setSelectedCcn(item); setDetailTab('overview'); }}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                  >
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, color: '#1e40af', fontFamily: 'monospace', fontSize: '13px' }}>
                        {item.ccnId || item.ccn_id}
                      </div>
                      <span style={{
                        display: 'inline-block', marginTop: '4px', fontSize: '10px', fontWeight: 700,
                        padding: '2px 7px', borderRadius: '6px',
                        background: isNetInfra ? '#e0e7ff' : '#ecfdf5',
                        color: isNetInfra ? '#3730a3' : '#047857'
                      }}>
                        {isNetInfra ? 'NetInfra Sync' : 'HERO Native'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', verticalAlign: 'top', maxWidth: '300px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{item.title}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>
                          {item.subtype1}
                        </span>
                        {item.subtype2 && (
                          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: '#f1f5f9', color: '#475569' }}>
                            {item.subtype2}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>
                        {[item.district, item.block].filter(Boolean).join(' • ') || '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {item.chainage || item.section || item.location || '—'}
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      {item.kmlFileName || item.kml_file_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0f766e', fontSize: '12px', fontWeight: 600 }}>
                          <LucideMap size={14} />
                          <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.kmlFileName || item.kml_file_name}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>No KML</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px',
                        background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`
                      }}>
                        {item.severity}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '99px',
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`
                      }}>
                        {st.label}
                      </span>
                      {item.approvedCcn && (
                        <div style={{ fontSize: '10px', color: '#15803d', marginTop: '4px', fontWeight: 600 }}>
                          ✓ Dual-State Approved
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedCcn(item); setDetailTab('overview'); }}
                        style={{
                          padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                          background: '#fff', color: '#1e293b', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE CCN MODAL */}
      {isCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '880px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(15,23,42,0.28)' }}>
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Raise Change Control Notice (CCN)</h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>Aligned with CcnTaskData schema (proposedCcn + Route Evidence + KML)</p>
              </div>
              <button onClick={() => setIsCreateOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Section 1: Classification & Details */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>1. Classification & CCN Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Subtype 1 *</label>
                    <select
                      value={formData.subtype1}
                      onChange={(e) => handleSubtype1Change(e.target.value)}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      {CCN_SUBTYPE_1.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Subtype 2 *</label>
                    <select
                      value={formData.subtype2}
                      onChange={(e) => setFormData(prev => ({ ...prev, subtype2: e.target.value }))}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      {(CCN_SUBTYPE_2[formData.subtype1] || []).map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Severity</label>
                    <select
                      value={formData.severity}
                      onChange={(e) => setFormData(prev => ({ ...prev, severity: e.target.value }))}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Custom CCN ID (Optional)</label>
                    <input
                      type="text"
                      placeholder="Auto-generated e.g. CCN-2026-106"
                      value={formData.ccnId}
                      onChange={(e) => setFormData(prev => ({ ...prev, ccnId: e.target.value }))}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>CCN Title</label>
                  <input
                    type="text"
                    placeholder="Concise title describing the change control notice"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>CCN Details (Justification & Scope Change) *</label>
                    <span style={{ fontSize: '11px', color: formData.ccnDetails.length > 6000 ? '#dc2626' : '#64748b' }}>
                      {formData.ccnDetails.length} / 6,000 chars
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    maxLength={6000}
                    placeholder="Enter complete technical justification, BoQ variance, or route diversion details..."
                    value={formData.ccnDetails}
                    onChange={(e) => setFormData(prev => ({ ...prev, ccnDetails: e.target.value }))}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Submitter Remarks</label>
                  <input
                    type="text"
                    placeholder="Optional notes for reviewer"
                    value={formData.remarks}
                    onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Section 2: Geography & Stretch */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>2. Geography, Stakeholders & Chainage</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {[
                    { key: 'district', label: 'District', ph: 'e.g. Ambala' },
                    { key: 'block', label: 'Block', ph: 'e.g. Saha' },
                    { key: 'section', label: 'Section / GP Link', ph: 'e.g. PoP to GP Kesri' },
                    { key: 'location', label: 'Landmark / Location', ph: 'e.g. Canal Crossing' },
                    { key: 'chainage_from', label: 'Chainage From', ph: 'e.g. 04+100' },
                    { key: 'chainage_to', label: 'Chainage To', ph: 'e.g. 04+350' },
                    { key: 'contractor', label: 'Contractor / Vendor', ph: 'Vendor name' },
                    { key: 'department', label: 'Concerned Dept', ph: 'e.g. PWD / NHAI' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>{f.label}</label>
                      <input
                        type="text"
                        placeholder={f.ph}
                        value={formData[f.key]}
                        onChange={(e) => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Stretch Coordinates */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>3. Stretch GPS Coordinates (S-Point & E-Point)</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => captureGps('start')} style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '7px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>
                      Capture Start GPS
                    </button>
                    <button type="button" onClick={() => captureGps('end')} style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '7px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>
                      Capture End GPS
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {[
                    { key: 'sLatitude', label: 'Start Lat (sLatitude)' },
                    { key: 'sLongitude', label: 'Start Lng (sLongitude)' },
                    { key: 'eLatitude', label: 'End Lat (eLatitude)' },
                    { key: 'eLongitude', label: 'End Lng (eLongitude)' },
                  ].map(c => (
                    <div key={c.key}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>{c.label}</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0.000000"
                        value={formData[c.key]}
                        onChange={(e) => setFormData(prev => ({ ...prev, [c.key]: e.target.value }))}
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 4: Route Evidence Media */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>4. Route Evidence Media {uploading && <span style={{ fontSize: '12px', color: '#d97706' }}>(Uploading...)</span>}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
                  {[
                    { field: 'startPhoto', label: 'Start Point Photo (1)', accept: 'image/*', multi: false, count: formData.startPhoto ? 1 : 0 },
                    { field: 'additionalStartPhotos', label: 'Additional Start Photos (up to 4)', accept: 'image/*', multi: true, limit: 4, count: formData.additionalStartPhotos.length },
                    { field: 'walkthroughVideo', label: 'Walkthrough Video (1, up to 5m)', accept: 'video/*', multi: false, count: formData.walkthroughVideo ? 1 : 0 },
                    { field: 'additionalRouteVideos', label: 'Additional Route Videos (up to 4)', accept: 'video/*', multi: true, limit: 4, count: formData.additionalRouteVideos.length },
                    { field: 'endPhoto', label: 'End Point Photo (1)', accept: 'image/*', multi: false, count: formData.endPhoto ? 1 : 0 },
                    { field: 'additionalEndPhotos', label: 'Additional End Photos (up to 10)', accept: 'image/*', multi: true, limit: 10, count: formData.additionalEndPhotos.length },
                    { field: 'additionalEndVideos', label: 'Additional End Videos (up to 2)', accept: 'video/*', multi: true, limit: 2, count: formData.additionalEndVideos.length },
                  ].map(m => (
                    <div key={m.field} style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                        {m.label} {m.count > 0 && <span style={{ color: '#16a34a' }}>({m.count} uploaded)</span>}
                      </div>
                      <input
                        type="file"
                        accept={m.accept}
                        multiple={m.multi}
                        onChange={(e) => handleFileUpload(e, m.field, m.limit)}
                        style={{ fontSize: '11px', width: '100%' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 5: KML Route File */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>5. KML Route File</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>KML Source Type</label>
                    <select
                      value={formData.kmlType}
                      onChange={(e) => setFormData(prev => ({ ...prev, kmlType: e.target.value }))}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="UPLOADED">UPLOADED</option>
                      <option value="GENERATED">GENERATED</option>
                    </select>
                  </div>
                  <div style={{ background: '#f0fdfa', border: '1px dashed #5eead4', borderRadius: '10px', padding: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f766e', marginBottom: '4px' }}>
                      Upload KML Route File (.kml) {formData.kmlFileName && `— ✓ ${formData.kmlFileName}`}
                    </div>
                    <input
                      type="file"
                      accept=".kml,application/vnd.google-earth.kml+xml"
                      onChange={(e) => handleFileUpload(e, 'kmlFile')}
                      style={{ fontSize: '12px', width: '100%' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                style={{ padding: '10px 16px', borderRadius: '9px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || uploading}
                onClick={() => handleCreateSubmit('draft')}
                style={{ padding: '10px 18px', borderRadius: '9px', border: '1px solid #94a3b8', background: '#f1f5f9', color: '#1e293b', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={submitting || uploading}
                onClick={() => handleCreateSubmit('submit')}
                style={{ padding: '10px 20px', borderRadius: '9px', border: 'none', background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                {submitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSPECT & DUAL-STATE REVIEW MODAL */}
      {selectedCcn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '940px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(15,23,42,0.28)' }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '15px', color: '#1d4ed8' }}>
                    {selectedCcn.ccnId || selectedCcn.ccn_id}
                  </span>
                  {(() => {
                    const st = getStatusBadgeStyle(selectedCcn.status);
                    return (
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                        {st.label}
                      </span>
                    );
                  })()}
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#eff6ff', color: '#1d4ed8' }}>
                    {selectedCcn.subtype1}
                  </span>
                  {selectedCcn.subtype2 && (
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#e2e8f0', color: '#334155' }}>
                      {selectedCcn.subtype2}
                    </span>
                  )}
                </div>
                <h2 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{selectedCcn.title}</h2>
              </div>

              <button onClick={() => setSelectedCcn(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <LucideX size={20} />
              </button>
            </div>

            {/* Workflow Action Banner */}
            {(selectedCcn.status === 'DRAFT' || selectedCcn.status === 'REJECTED' || selectedCcn.status === 'PENDING_APPROVAL' || selectedCcn.status === 'SUBMITTED') && (
              <div style={{ padding: '12px 24px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>
                  {selectedCcn.status === 'DRAFT' || selectedCcn.status === 'REJECTED'
                    ? 'This CCN is editable/ready to submit for Change Control Board review.'
                    : 'Pending reviewer sign-off. Approving preserves proposedCcn and records approvedCcn.'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(selectedCcn.status === 'DRAFT' || selectedCcn.status === 'REJECTED') && (
                    <button
                      onClick={() => handleSubmitDraft(selectedCcn)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                    >
                      <LucideSend size={13} /> Submit for Approval
                    </button>
                  )}
                  {(selectedCcn.status === 'PENDING_APPROVAL' || selectedCcn.status === 'SUBMITTED') && (
                    <>
                      <button
                        onClick={() => {
                          setApprovedNotes(selectedCcn.proposedCcn?.ccnDetails || selectedCcn.ccn_details || '');
                          setActionRemarks('');
                          setIsApproveOpen(true);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                      >
                        <LucideCheck size={14} /> Approve CCN
                      </button>
                      <button
                        onClick={() => { setActionRemarks(''); setIsRejectOpen(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                      >
                        <LucideXCircle size={14} /> Reject CCN
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Detail Sub-Tabs */}
            <div style={{ display: 'flex', gap: '4px', padding: '0 24px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
              {[
                { id: 'overview', label: 'Overview', icon: LucideFileText },
                { id: 'kml', label: 'Coordinates & KML', icon: LucideMap },
                { id: 'media', label: 'Route Evidence', icon: LucideImage },
                { id: 'comparison', label: 'Proposed vs Approved', icon: LucideGitCompare },
                { id: 'history', label: 'Approval History', icon: LucideHistory },
              ].map(t => {
                const Icon = t.icon;
                const active = detailTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setDetailTab(t.id)}
                    style={{
                      padding: '12px 14px', border: 'none', borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                      background: 'transparent', color: active ? '#2563eb' : '#64748b', fontWeight: active ? 700 : 600,
                      fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Detail Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {detailTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px' }}>CCN Details</div>
                    <div style={{ fontSize: '13px', color: '#0f172a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {selectedCcn.ccnDetails || selectedCcn.ccn_details || selectedCcn.description || 'No detailed justification recorded.'}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {[
                      { label: 'District / Block', value: [selectedCcn.district, selectedCcn.block].filter(Boolean).join(' / ') || '—' },
                      { label: 'Section / Route', value: selectedCcn.section || '—' },
                      { label: 'Location / Landmark', value: selectedCcn.location || '—' },
                      { label: 'Chainage', value: selectedCcn.chainage || '—' },
                      { label: 'Contractor', value: selectedCcn.contractor || selectedCcn.vendor_name || '—' },
                      { label: 'Department', value: selectedCcn.department || '—' },
                      { label: 'Logged Date', value: selectedCcn.logged_date || '—' },
                      { label: 'Source System', value: selectedCcn.source_system || 'HERO' },
                    ].map((row, idx) => (
                      <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{row.label}</div>
                        <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, marginTop: '3px' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>

                  {selectedCcn.remarks && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Latest Remarks</div>
                      <div style={{ fontSize: '13px', color: '#78350f' }}>{selectedCcn.remarks}</div>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'kml' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#f8fafc' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginBottom: '8px' }}>Start Point Coordinates</div>
                      <div style={{ fontSize: '13px', fontFamily: 'monospace' }}>sLatitude: {selectedCcn.sLatitude ?? selectedCcn.s_latitude ?? '—'}</div>
                      <div style={{ fontSize: '13px', fontFamily: 'monospace', marginTop: '4px' }}>sLongitude: {selectedCcn.sLongitude ?? selectedCcn.s_longitude ?? '—'}</div>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#f8fafc' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginBottom: '8px' }}>End Point Coordinates</div>
                      <div style={{ fontSize: '13px', fontFamily: 'monospace' }}>eLatitude: {selectedCcn.eLatitude ?? selectedCcn.e_latitude ?? '—'}</div>
                      <div style={{ fontSize: '13px', fontFamily: 'monospace', marginTop: '4px' }}>eLongitude: {selectedCcn.eLongitude ?? selectedCcn.e_longitude ?? '—'}</div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>KML Route File</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Type: <b>{selectedCcn.kmlType || selectedCcn.kml_type || 'UPLOADED'}</b> • File: <b>{selectedCcn.kmlFileName || selectedCcn.kml_file_name || 'None'}</b>
                        </div>
                      </div>
                      {selectedCcn.kml_file?.url && (
                        <a
                          href={selectedCcn.kml_file.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ padding: '7px 12px', borderRadius: '8px', background: '#0f766e', color: '#fff', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                        >
                          Download KML
                        </a>
                      )}
                    </div>
                    {selectedCcn.kml_content ? (
                      <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '12px', borderRadius: '8px', fontSize: '11px', overflowX: 'auto', maxHeight: '220px' }}>
                        {selectedCcn.kml_content}
                      </pre>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>No inline KML XML preview captured for this record.</div>
                    )}
                  </div>
                </div>
              )}

              {detailTab === 'media' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                  {renderPhotoThumb(selectedCcn.start_photo, 'start', 'Start Photo')}
                  {(selectedCcn.additional_start_photos || []).map((p, i) => renderPhotoThumb(p, `as-${i}`, `Start Photo +${i + 1}`))}
                  {renderPhotoThumb(selectedCcn.walkthrough_video, 'walk', 'Walkthrough Video')}
                  {(selectedCcn.additional_route_videos || []).map((v, i) => renderPhotoThumb(v, `rv-${i}`, `Route Video +${i + 1}`))}
                  {renderPhotoThumb(selectedCcn.end_photo, 'end', 'End Photo')}
                  {(selectedCcn.additional_end_photos || []).map((p, i) => renderPhotoThumb(p, `ae-${i}`, `End Photo +${i + 1}`))}
                  {(selectedCcn.additional_end_videos || []).map((v, i) => renderPhotoThumb(v, `ev-${i}`, `End Video +${i + 1}`))}
                  {!selectedCcn.start_photo?.url && !selectedCcn.end_photo?.url && !selectedCcn.walkthrough_video?.url &&
                    (selectedCcn.additional_start_photos || []).length === 0 && (selectedCcn.additional_end_photos || []).length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      No route evidence photos or videos attached yet.
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'comparison' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {/* Proposed CCN */}
                  <div style={{ border: '1px solid #bfdbfe', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: '#eff6ff', padding: '12px 16px', fontWeight: 800, fontSize: '13px', color: '#1e40af', borderBottom: '1px solid #bfdbfe' }}>
                      proposedCcn (Immutable Submitter Payload)
                    </div>
                    <div style={{ padding: '14px 16px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><b>CCN ID:</b> {selectedCcn.proposedCcn?.ccnId || selectedCcn.ccn_id}</div>
                      <div><b>Subtype 1:</b> {selectedCcn.proposedCcn?.subtype1 || selectedCcn.subtype1}</div>
                      <div><b>Subtype 2:</b> {selectedCcn.proposedCcn?.subtype2 || selectedCcn.subtype2 || '—'}</div>
                      <div><b>Coordinates:</b> ({selectedCcn.proposedCcn?.sLatitude ?? '—'}, {selectedCcn.proposedCcn?.sLongitude ?? '—'}) → ({selectedCcn.proposedCcn?.eLatitude ?? '—'}, {selectedCcn.proposedCcn?.eLongitude ?? '—'})</div>
                      <div><b>KML:</b> {selectedCcn.proposedCcn?.kmlFileName || '—'} ({selectedCcn.proposedCcn?.kmlType || 'UPLOADED'})</div>
                      <div>
                        <b>Details:</b>
                        <div style={{ marginTop: '4px', padding: '8px', background: '#f8fafc', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                          {selectedCcn.proposedCcn?.ccnDetails || selectedCcn.proposedCcn?.description || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Approved CCN */}
                  <div style={{ border: '1px solid #bbf7d0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: '#f0fdf4', padding: '12px 16px', fontWeight: 800, fontSize: '13px', color: '#15803d', borderBottom: '1px solid #bbf7d0' }}>
                      approvedCcn (Reviewer Signed-Off State)
                    </div>
                    {selectedCcn.approvedCcn ? (
                      <div style={{ padding: '14px 16px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div><b>CCN ID:</b> {selectedCcn.approvedCcn.ccnId || selectedCcn.ccn_id}</div>
                        <div><b>Subtype 1:</b> {selectedCcn.approvedCcn.subtype1 || selectedCcn.subtype1}</div>
                        <div><b>Subtype 2:</b> {selectedCcn.approvedCcn.subtype2 || selectedCcn.subtype2 || '—'}</div>
                        <div><b>Status:</b> {selectedCcn.approvedCcn.status || 'APPROVED'}</div>
                        <div><b>Reviewer Remarks:</b> {selectedCcn.approvedCcn.remarks || '—'}</div>
                        <div>
                          <b>Approved Scope / Details:</b>
                          <div style={{ marginTop: '4px', padding: '8px', background: '#f0fdf4', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                            {selectedCcn.approvedCcn.ccnDetails || selectedCcn.approvedCcn.description || '—'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        Pending approval. Once approved by reviewer, the signed-off payload will populate here while keeping proposedCcn intact.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {detailTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(selectedCcn.approvalHistory || selectedCcn.approval_history || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>No audit entries yet.</div>
                  ) : (selectedCcn.approvalHistory || selectedCcn.approval_history || []).map((entry, idx) => (
                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{entry.action}</div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{entry.remarks || '—'}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '11px', color: '#64748b' }}>
                        <div style={{ fontWeight: 700 }}>{entry.user || 'System'}</div>
                        <div>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* APPROVE MODAL */}
      {isApproveOpen && selectedCcn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '520px', padding: '22px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#15803d' }}>Approve CCN ({selectedCcn.ccnId || selectedCcn.ccn_id})</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Approving creates the reviewer-signed <code>approvedCcn</code> while preserving the original <code>proposedCcn</code> untouched.
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Approved Scope / Technical Notes</label>
              <textarea
                rows={3}
                value={approvedNotes}
                onChange={(e) => setApprovedNotes(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Reviewer Approval Remarks</label>
              <input
                type="text"
                placeholder="e.g. Approved with BoQ adjustment..."
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setIsApproveOpen(false)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleApprove} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Confirm Approval</button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {isRejectOpen && selectedCcn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '480px', padding: '22px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#b91c1c' }}>Reject CCN ({selectedCcn.ccnId || selectedCcn.ccn_id})</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b' }}>
              Provide mandatory rejection reason. Original <code>proposedCcn</code> will be preserved for audit.
            </p>
            <textarea
              rows={3}
              placeholder="Enter mandatory rejection reason..."
              value={actionRemarks}
              onChange={(e) => setActionRemarks(e.target.value)}
              style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '13px', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setIsRejectOpen(false)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleReject} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCcnPage;
