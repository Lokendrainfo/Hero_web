import React, { useState } from 'react';
import {
  LucideX, LucideCheckCircle, LucideXCircle, LucideFileText,
  LucideTruck, LucideCalendar, LucideMapPin, LucideDollarSign,
  LucideClock, LucideUser, LucideShieldCheck, LucideUpload,
  LucideArrowRight, LucideInfo, LucideAlertTriangle, LucideLock,
  LucideExternalLink, LucidePaperclip
} from 'lucide-react';
import { machineShiftService } from '../../services/machineShiftService';
import { useToast } from '../../context/ToastContext';

export const MachineShiftDetailModal = ({
  request,
  onClose,
  onUpdated,
  currentUser,
  isAdmin,
  isScm,
  isShifter
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'audit'

  // Sub-dialog states
  const [dialogAction, setDialogAction] = useState(null); // 'approve' | 'reject' | 'invoice' | 'confirm' | 'start' | 'update_shifter' | 'mark_shifted' | 'cancel'
  const [submitting, setSubmitting] = useState(false);
  const [formRemarks, setFormRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Invoice Form State
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    invoice_amount: '',
    invoice_file: null
  });

  // Shifter Form State
  const [shifterForm, setShifterForm] = useState({
    shifting_date: request?.shifting_date || new Date().toISOString().split('T')[0],
    shifting_mode: request?.shifting_mode || request?.mode_of_shifting || 'Own-HDD',
    shifting_contact_person: request?.shifting_contact_person || '',
    shifting_expense_amount: request?.shifting_expense_amount || '0.00',
    shifting_status: request?.shifting_status || 'IN_PROGRESS',
    machine_picture: null
  });

  if (!request) return null;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING_SHIFTING':
        return <span className="badge-pill badge-amber">Pending SCM Approval</span>;
      case 'APPROVED_BY_SCM':
        return <span className="badge-pill badge-blue">Approved by SCM</span>;
      case 'IN_PROGRESS':
        return <span className="badge-pill badge-purple">In Progress</span>;
      case 'SHIFTED':
        return <span className="badge-pill badge-blue">Shifted</span>;
      case 'CONFIRMED':
        return <span className="badge-pill badge-green">Confirmed & Locked</span>;
      case 'REJECTED':
        return <span className="badge-pill badge-breakdown">Rejected</span>;
      case 'CANCELLED':
        return <span className="badge-pill badge-neutral">Cancelled</span>;
      default:
        return <span className="badge-pill badge-neutral">{status}</span>;
    }
  };

  // Action Handlers
  const handleApprove = async () => {
    try {
      setSubmitting(true);
      await machineShiftService.scmApprove(request.id, formRemarks);
      showToast('Machine Shift Request approved successfully.', 'success');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Approval failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      showToast('Please provide a reason for rejection.', 'error');
      return;
    }
    try {
      setSubmitting(true);
      await machineShiftService.scmReject(request.id, rejectionReason, formRemarks);
      showToast('Machine Shift Request rejected.', 'info');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Rejection failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceForm.invoice_file) {
      showToast('Please select an invoice file (PDF or Image).', 'error');
      return;
    }
    if (!invoiceForm.invoice_number.trim()) {
      showToast('Invoice Number is required.', 'error');
      return;
    }
    if (!invoiceForm.invoice_amount || Number(invoiceForm.invoice_amount) < 0) {
      showToast('Please enter a valid invoice amount.', 'error');
      return;
    }
    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('invoice_file', invoiceForm.invoice_file);
      fd.append('invoice_number', invoiceForm.invoice_number.trim());
      fd.append('invoice_date', invoiceForm.invoice_date);
      fd.append('invoice_amount', invoiceForm.invoice_amount);
      if (formRemarks) fd.append('remarks', formRemarks);

      await machineShiftService.attachInvoice(request.id, fd);
      showToast('Invoice attached successfully.', 'success');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Failed to attach invoice.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      await machineShiftService.confirmShifting(request.id, formRemarks);
      showToast('Shifting confirmed and request locked.', 'success');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Confirmation failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartShifting = async () => {
    try {
      setSubmitting(true);
      await machineShiftService.startShifting(request.id);
      showToast('Shifting marked In Progress.', 'success');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Failed to start shifting.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShifterUpdate = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const fd = new FormData();
      if (shifterForm.shifting_date) fd.append('shifting_date', shifterForm.shifting_date);
      if (shifterForm.shifting_mode) fd.append('shifting_mode', shifterForm.shifting_mode);
      if (shifterForm.shifting_contact_person) fd.append('shifting_contact_person', shifterForm.shifting_contact_person);
      if (shifterForm.shifting_status) fd.append('shifting_status', shifterForm.shifting_status);
      if (shifterForm.shifting_expense_amount !== undefined) fd.append('shifting_expense_amount', shifterForm.shifting_expense_amount);
      if (shifterForm.machine_picture) fd.append('machine_picture', shifterForm.machine_picture);
      if (formRemarks) fd.append('remarks', formRemarks);

      await machineShiftService.shifterUpdate(request.id, fd);
      showToast('Shifting details updated.', 'success');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Failed to update shifting details.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkShifted = async (e) => {
    e.preventDefault();
    if (!shifterForm.shifting_contact_person.trim()) {
      showToast('Contact person is required.', 'error');
      return;
    }
    if (!shifterForm.machine_picture && !request.machine_picture) {
      showToast('Machine Picture is mandatory before marking as SHIFTED.', 'error');
      return;
    }
    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('shifting_date', shifterForm.shifting_date);
      fd.append('shifting_mode', shifterForm.shifting_mode);
      fd.append('shifting_contact_person', shifterForm.shifting_contact_person);
      fd.append('shifting_expense_amount', shifterForm.shifting_expense_amount || '0.00');
      if (shifterForm.machine_picture) {
        fd.append('machine_picture', shifterForm.machine_picture);
      }
      if (formRemarks) fd.append('remarks', formRemarks);

      await machineShiftService.markShifted(request.id, fd);
      showToast('Request marked as SHIFTED successfully.', 'success');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Failed to mark as shifted.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    try {
      setSubmitting(true);
      await machineShiftService.cancelRequest(request.id, formRemarks);
      showToast('Request cancelled.', 'info');
      setDialogAction(null);
      onUpdated();
    } catch (err) {
      showToast(err?.message || err?.detail || 'Failed to cancel request.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isConfirmed = request.status === 'CONFIRMED';
  const isRejected = request.status === 'REJECTED';
  const isCancelled = request.status === 'CANCELLED';
  const canCancel = !isConfirmed && request.status !== 'SHIFTED' && (isAdmin || request.created_by === currentUser?.id);

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {request.request_id}
            </span>
            {getStatusBadge(request.status)}
            {isConfirmed && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                <LucideLock size={13} /> Locked
              </span>
            )}
          </div>
          <button type="button" className="header-icon-btn" onClick={onClose} aria-label="Close">
            <LucideX size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="tab-bar" style={{ padding: '0 20px', background: 'var(--bg-surface)' }}>
          <button
            type="button"
            className={`tab-item ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
            style={activeTab === 'details' ? { borderBottomColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          >
            Overview & Details
          </button>
          <button
            type="button"
            className={`tab-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
            style={activeTab === 'audit' ? { borderBottomColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          >
            Audit Trail ({request.audit_logs?.length || 0})
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {activeTab === 'details' && (
            <>
              {/* Rejection Alert if rejected */}
              {isRejected && (
                <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius)', display: 'flex', gap: '10px' }}>
                  <LucideAlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#ef4444', fontSize: '0.85rem' }}>Request Rejected by SCM ({request.rejected_by_name || 'SCM'})</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>{request.rejection_reason}</div>
                  </div>
                </div>
              )}

              {/* Grid Layout: 6 Structured Blocks */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>

                {/* 1. REQUEST DETAILS */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--bg-surface)' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                    1. Request Details
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '8px', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Vendor:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{request.vendor_name} ({request.vendor_code || 'VND'})</strong>

                    <span style={{ color: 'var(--text-muted)' }}>Machine:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{request.machine_name} [{request.machine_chassis_no || request.machine_code}]</strong>

                    <span style={{ color: 'var(--text-muted)' }}>Reason:</span>
                    <span>{request.reason_name}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Required Date:</span>
                    <span>{request.required_date}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Shift Mode:</span>
                    <span>{request.mode_of_shifting === 'OWN_HDD' ? 'Own-HDD' : 'By Truck'}</span>
                  </div>
                </div>

                {/* 2. SYSTEM METADATA */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--bg-surface)' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                    2. System Metadata
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '8px', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Created By:</span>
                    <span>{request.created_by_name || 'System'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Created Date:</span>
                    <span>{request.created_at ? new Date(request.created_at).toLocaleString() : '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Last Updated:</span>
                    <span>{request.updated_at ? new Date(request.updated_at).toLocaleString() : '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Current Status:</span>
                    <span>{getStatusBadge(request.status)}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Assigned Shifter:</span>
                    <span>{request.assigned_shifter_name || 'Unassigned'}</span>
                  </div>
                </div>

                {/* 3. A POINT (ORIGIN) */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--bg-surface)' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideMapPin size={14} style={{ color: '#3b82f6' }} /> Origin (A Point)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '8px', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Point Name:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{request.a_point_name}</strong>

                    <span style={{ color: 'var(--text-muted)' }}>Latitude:</span>
                    <span>{request.a_point_latitude ?? '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Longitude:</span>
                    <span>{request.a_point_longitude ?? '—'}</span>
                  </div>
                </div>

                {/* 4. B POINT (DESTINATION) */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--bg-surface)' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideMapPin size={14} style={{ color: '#10b981' }} /> Destination (B Point)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '8px', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Point Name:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{request.b_point_name}</strong>

                    <span style={{ color: 'var(--text-muted)' }}>Latitude:</span>
                    <span>{request.b_point_latitude ?? '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Longitude:</span>
                    <span>{request.b_point_longitude ?? '—'}</span>
                  </div>
                </div>

                {/* 5. SHIFTING EXECUTION DETAILS */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--bg-surface)' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideTruck size={14} style={{ color: 'var(--accent)' }} /> Shifting Execution
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '8px', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Shifting Date:</span>
                    <span>{request.shifting_date || 'Pending'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Shifting Mode:</span>
                    <span>{request.shifting_mode || '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Contact Person:</span>
                    <span>{request.shifting_contact_person || '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Shifting Status:</span>
                    <span style={{ fontWeight: 600 }}>{request.shifting_status || 'PENDING'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Expense Amount:</span>
                    <strong style={{ color: '#10b981' }}>₹{Number(request.shifting_expense_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>

                    <span style={{ color: 'var(--text-muted)' }}>Machine Picture:</span>
                    <div>
                      {request.machine_picture_url ? (
                        <a href={request.machine_picture_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                          <LucidePaperclip size={13} /> View Machine Picture <LucideExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not uploaded yet</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 6. SCM APPROVAL & INVOICE */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--bg-surface)' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LucideShieldCheck size={14} style={{ color: '#8b5cf6' }} /> SCM & Invoice Confirmation
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '8px', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>SCM Approval:</span>
                    <span>
                      {request.scm_approved_at ? (
                        <span style={{ color: '#10b981', fontWeight: 600 }}>Approved by {request.scm_approved_by_name || 'SCM'} ({new Date(request.scm_approved_at).toLocaleDateString()})</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                      )}
                    </span>

                    <span style={{ color: 'var(--text-muted)' }}>Invoice No:</span>
                    <span>{request.invoice_number || '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Invoice Date:</span>
                    <span>{request.invoice_date || '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Invoice Amount:</span>
                    <span>{request.invoice_amount ? `₹${Number(request.invoice_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</span>

                    <span style={{ color: 'var(--text-muted)' }}>Invoice Document:</span>
                    <div>
                      {request.invoice_file_url ? (
                        <a href={request.invoice_file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                          <LucidePaperclip size={13} /> View Invoice File <LucideExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No invoice attached</span>
                      )}
                    </div>

                    <span style={{ color: 'var(--text-muted)' }}>Confirmation:</span>
                    <span>
                      {request.confirmed_at ? (
                        <span style={{ color: '#10b981', fontWeight: 600 }}>Confirmed by {request.confirmed_by_name || 'SCM'} on {new Date(request.confirmed_at).toLocaleDateString()}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Pending final confirmation</span>
                      )}
                    </span>
                  </div>
                </div>

              </div>
            </>
          )}

          {/* AUDIT TRAIL TAB */}
          {activeTab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {request.audit_logs && request.audit_logs.length > 0 ? (
                request.audit_logs.map((log, idx) => (
                  <div key={log.id || idx} style={{ display: 'flex', gap: '14px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <LucideClock size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{log.action}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                        Performed by <strong style={{ color: 'var(--text-primary)' }}>{log.performed_by_name}</strong>
                        {log.previous_status && log.new_status && (
                          <span> (Status changed from <code style={{ fontSize: '0.75rem' }}>{log.previous_status}</code> → <code style={{ fontSize: '0.75rem' }}>{log.new_status}</code>)</span>
                        )}
                      </div>
                      {log.remarks && (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                          "{log.remarks}"
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No audit trail recorded yet.
                </div>
              )}
            </div>
          )}

          {/* Sub-Dialog Area for interactive role actions */}
          {dialogAction && (
            <div style={{ marginTop: '10px', padding: '16px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              
              {/* SCM APPROVE DIALOG */}
              {dialogAction === 'approve' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Approve Machine Shift Request</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Are you sure you want to approve request <strong>{request.request_id}</strong>? The shifting team will be authorized to begin relocation.
                  </p>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Optional Remarks</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      placeholder="e.g. Approved for execution, site clearance verified"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction(null)} disabled={submitting}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={handleApprove} disabled={submitting}>
                      {submitting ? 'Approving...' : 'Confirm Approval'}
                    </button>
                  </div>
                </div>
              )}

              {/* SCM REJECT DIALOG */}
              {dialogAction === 'reject' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9375rem', color: '#ef4444' }}>Reject Machine Shift Request</h4>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                      Rejection Reason <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                      rows={3}
                      className="form-control"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Specify the reason why this shift request is rejected..."
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction(null)} disabled={submitting}>Cancel</button>
                    <button type="button" className="btn btn-danger" onClick={handleReject} disabled={submitting}>
                      {submitting ? 'Rejecting...' : 'Reject Request'}
                    </button>
                  </div>
                </div>
              )}

              {/* SCM ATTACH INVOICE DIALOG */}
              {dialogAction === 'invoice' && (
                <form onSubmit={handleAttachInvoice}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Attach Shifting Invoice</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Invoice Number *</label>
                      <input
                        type="text"
                        required
                        className="form-control"
                        value={invoiceForm.invoice_number}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                        placeholder="e.g. INV-2026-0042"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Invoice Date *</label>
                      <input
                        type="date"
                        required
                        className="form-control"
                        value={invoiceForm.invoice_date}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Invoice Amount (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        className="form-control"
                        value={invoiceForm.invoice_amount}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Invoice File (PDF/Image) *</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        required
                        className="form-control"
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_file: e.target.files[0] })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction(null)} disabled={submitting}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? 'Uploading...' : 'Save & Attach Invoice'}
                    </button>
                  </div>
                </form>
              )}

              {/* SCM CONFIRM SHIFTING DIALOG */}
              {dialogAction === 'confirm' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Confirm Shifting (Final Lock)</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Confirm that machine shifting is fully completed with verified machine picture, shifting expenses, and invoices.
                    <strong> Once confirmed, this record will be locked permanently.</strong>
                  </p>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Optional Remarks</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      placeholder="e.g. Final inspection verified on site by SCM"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction(null)} disabled={submitting}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={submitting}>
                      {submitting ? 'Confirming...' : 'Confirm & Lock Shifting'}
                    </button>
                  </div>
                </div>
              )}

              {/* SHIFTER UPDATE / MARK SHIFTED DIALOG */}
              {(dialogAction === 'update_shifter' || dialogAction === 'mark_shifted') && (
                <form onSubmit={dialogAction === 'mark_shifted' ? handleMarkShifted : handleShifterUpdate}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                    {dialogAction === 'mark_shifted' ? 'Mark Machine as Shifted' : 'Update Shifting Execution Details'}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Shifting Date *</label>
                      <input
                        type="date"
                        required
                        className="form-control"
                        value={shifterForm.shifting_date}
                        onChange={(e) => setShifterForm({ ...shifterForm, shifting_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Shifting Mode *</label>
                      <input
                        type="text"
                        required
                        className="form-control"
                        value={shifterForm.shifting_mode}
                        onChange={(e) => setShifterForm({ ...shifterForm, shifting_mode: e.target.value })}
                        placeholder="e.g. Own-HDD, Lowbed Trailer"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Contact Person *</label>
                      <input
                        type="text"
                        required
                        className="form-control"
                        value={shifterForm.shifting_contact_person}
                        onChange={(e) => setShifterForm({ ...shifterForm, shifting_contact_person: e.target.value })}
                        placeholder="e.g. Ramesh Driver (9876543210)"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Shifting Expense Amount (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        className="form-control"
                        value={shifterForm.shifting_expense_amount}
                        onChange={(e) => setShifterForm({ ...shifterForm, shifting_expense_amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        Machine Picture {dialogAction === 'mark_shifted' && !request.machine_picture ? '(Mandatory) *' : '(Optional)'}
                      </label>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp"
                        required={dialogAction === 'mark_shifted' && !request.machine_picture}
                        className="form-control"
                        onChange={(e) => setShifterForm({ ...shifterForm, machine_picture: e.target.files[0] })}
                      />
                      {request.machine_picture_url && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          Existing picture: <a href={request.machine_picture_url} target="_blank" rel="noopener noreferrer">View Current Photo</a>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction(null)} disabled={submitting}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? 'Saving...' : (dialogAction === 'mark_shifted' ? 'Confirm Shifted' : 'Update Details')}
                    </button>
                  </div>
                </form>
              )}

              {/* CANCEL REQUEST DIALOG */}
              {dialogAction === 'cancel' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9375rem', color: '#ef4444' }}>Cancel Shift Request</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    Are you sure you want to cancel this request? This action cannot be reversed.
                  </p>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Optional Remarks</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      placeholder="e.g. Project scope changed, shift cancelled"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction(null)} disabled={submitting}>Keep Request</button>
                    <button type="button" className="btn btn-danger" onClick={handleCancelRequest} disabled={submitting}>
                      {submitting ? 'Cancelling...' : 'Cancel Request'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Modal Action Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {canCancel && !dialogAction && (
              <button type="button" className="btn btn-secondary" style={{ color: '#ef4444' }} onClick={() => setDialogAction('cancel')}>
                Cancel Request
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* SCM Actions */}
            {(isScm || isAdmin) && !isConfirmed && !isCancelled && !isRejected && (
              <>
                {request.status === 'PENDING_SHIFTING' && (
                  <>
                    <button type="button" className="btn btn-secondary" style={{ color: '#ef4444' }} onClick={() => setDialogAction('reject')}>
                      Reject
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setDialogAction('approve')}>
                      Approve (OK)
                    </button>
                  </>
                )}

                {request.status === 'SHIFTED' && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction('invoice')}>
                      Attach Invoice
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setDialogAction('confirm')}>
                      Confirm Shifting
                    </button>
                  </>
                )}
              </>
            )}

            {/* Shifter Actions */}
            {(isShifter || isAdmin) && !isConfirmed && !isCancelled && !isRejected && (
              <>
                {request.status === 'APPROVED_BY_SCM' && (
                  <button type="button" className="btn btn-primary" onClick={handleStartShifting} disabled={submitting}>
                    Start Shifting
                  </button>
                )}

                {request.status === 'IN_PROGRESS' && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setDialogAction('update_shifter')}>
                      Update Details
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setDialogAction('mark_shifted')}>
                      Mark as Shifted
                    </button>
                  </>
                )}
              </>
            )}

            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
