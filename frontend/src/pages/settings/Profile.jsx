import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/common/PageHeader';

const Field = ({ label, value }) => (
  <div className="metric-row">
    <span>{label}</span>
    <strong style={{ textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</strong>
  </div>
);

export const Profile = () => {
  const { user, vendor, roles, vendors, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const displayName = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'User';
  const vendorName = vendor?.name || user?.vendor_name || (vendors || [])[0]?.name || '—';

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      showToast('Enter your current and new password', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated', 'success');
      if (refreshProfile) await refreshProfile();
    } catch (err) {
      showToast(err?.message || 'Could not change password', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen-container">
      <PageHeader
        title="Profile"
        subtitle="Account identity, vendor assignment, and password"
      />

      <div className="split-2">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Account</h2>
            <span className={`badge-pill ${user?.is_active === false ? 'badge-offline' : 'badge-running'}`}>
              {user?.is_active === false ? 'Inactive' : 'Active'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: '1rem' }}>
              {(displayName || 'U')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{displayName}</div>
              <div className="page-subtitle">{user?.email || user?.username}</div>
            </div>
          </div>
          <div className="metric-list">
            <Field label="Full name" value={displayName} />
            <Field label="Username" value={user?.username} />
            <Field label="Email" value={user?.email} />
            <Field label="Employee ID" value={user?.employee_id} />
            <Field label="External ID" value={user?.external_user_id || user?.id} />
            <Field label="Phone" value={user?.phone_number} />
            <Field label="Local ID" value={user?.id} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Access</h2>
          </div>
          <div className="metric-list">
            <Field label="Primary role" value={roles?.[0] || user?.role} />
            <Field label="Roles" value={(roles || []).join(', ') || user?.role} />
            <Field label="Vendor" value={vendorName} />
            <Field label="Vendor ID" value={vendor?.id || vendor?.external_vendor_id || '—'} />
            <Field label="Staff" value={user?.is_staff ? 'Yes' : 'No'} />
            <Field label="Superuser" value={user?.is_superuser ? 'Yes' : 'No'} />
            <Field label="Assigned vendors" value={(vendors || []).length} />
          </div>
          {(vendors || []).length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {vendors.map((v) => (
                <span key={v.id || v.external_vendor_id || v.name} className="badge-pill badge-neutral">
                  {v.name || v.code || v.external_vendor_id}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ maxWidth: 520 }}>
        <div className="panel-header">
          <h2 className="panel-title">Change password</h2>
        </div>
        <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: 12 }}>
          <div>
            <label className="field-label" htmlFor="old-password">Current password</label>
            <input
              id="old-password"
              type="password"
              className="field-input"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              className="field-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              className="field-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
