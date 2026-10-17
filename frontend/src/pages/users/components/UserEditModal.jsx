import React, { useState, useEffect } from 'react';
import { LucideEdit3, LucideSearch, LucideX, LucideSave } from 'lucide-react';
import { userService } from '../../../services/userService';
import { SearchableSelect } from '../../../components/common/Select';

export const UserEditModal = ({
  isOpen,
  user,
  onClose,
  onSuccess,
  systemVendors = [],
  allSystemUsers = [],
  roleOptions = []
}) => {
  const [masterCircles, setMasterCircles] = useState([]);
  const [editDistricts, setEditDistricts] = useState([]);
  const [editBlocks, setEditBlocks] = useState([]);

  const [vendorSearch, setVendorSearch] = useState('');
  const [managerSearch, setManagerSearch] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    external_user_id: '',
    role: 'VIEWER',
    reporting_manager_id: '',
    vendor_id: '',
    user_type: 'NORMAL',
    advance_scope_type: 'CIRCLE',
    selected_circle_id: '',
    selected_district_id: '',
    selected_block_id: '',
    is_active: true
  });

  const parseList = (res) => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.results)) return res.results;
    if (Array.isArray(res.content)) return res.content;
    if (Array.isArray(res.data?.results)) return res.data.results;
    return [];
  };

  const fetchCircles = async () => {
    try {
      const res = await userService.getCircles();
      setMasterCircles(parseList(res));
    } catch (err) {
      console.error('Failed to fetch circles:', err);
    }
  };

  const fetchDistrictsForEdit = async (circleId) => {
    if (!circleId) {
      setEditDistricts([]);
      setEditBlocks([]);
      return;
    }
    try {
      const res = await userService.getDistricts(circleId);
      setEditDistricts(parseList(res));
    } catch (err) {
      console.error('Failed to fetch districts:', err);
    }
  };

  const fetchBlocksForEdit = async (districtId) => {
    if (!districtId) {
      setEditBlocks([]);
      return;
    }
    try {
      const res = await userService.getBlocks(districtId);
      setEditBlocks(parseList(res));
    } catch (err) {
      console.error('Failed to fetch blocks:', err);
    }
  };

  useEffect(() => {
    if (!isOpen || !user) return;

    fetchCircles();
    setVendorSearch('');
    setManagerSearch('');
    setError(null);

    const currentRole = (user.roles && user.roles.length > 0) ? user.roles[0] : (user.role || 'VIEWER');
    const firstAssignedVendorId = (user.vendors && user.vendors.length > 0)
      ? (user.vendors[0].id || user.vendors[0].external_vendor_id)
      : (user.vendor || user.vendor_id || '');

    const uType = user.user_type || 'NORMAL';
    const scopeType = user.advance_scope_type || 'CIRCLE';
    const cId = user.selected_circle ? (user.selected_circle.id || user.selected_circle) : (user.selected_circle_id || '');
    const dId = user.selected_district ? (user.selected_district.id || user.selected_district) : (user.selected_district_id || '');
    const bId = user.selected_block ? (user.selected_block.id || user.selected_block) : (user.selected_block_id || '');

    let firstName = user.first_name || '';
    let lastName = user.last_name || '';
    if (!firstName && !lastName && user.name) {
      const parts = user.name.trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    setEditForm({
      first_name: firstName,
      last_name: lastName,
      email: user.email || '',
      phone_number: user.phone_number || '',
      external_user_id: user.external_user_id || user.employee_id || '',
      role: currentRole,
      reporting_manager_id: user.reporting_manager_id || (user.reporting_manager && (user.reporting_manager.id || user.reporting_manager)) || '',
      vendor_id: firstAssignedVendorId || '',
      user_type: uType,
      advance_scope_type: scopeType,
      selected_circle_id: cId,
      selected_district_id: dId,
      selected_block_id: bId,
      is_active: user.is_active !== undefined ? user.is_active : true
    });

    if (cId) fetchDistrictsForEdit(cId);
    if (dId) fetchBlocksForEdit(dId);
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const extId = editForm.external_user_id ? editForm.external_user_id.trim() : '';
      const payload = {
        first_name: editForm.first_name ? editForm.first_name.trim() : '',
        last_name: editForm.last_name ? editForm.last_name.trim() : '',
        email: editForm.email && editForm.email.trim() ? editForm.email.trim() : '',
        phone_number: editForm.phone_number && editForm.phone_number.trim() ? editForm.phone_number.trim() : '',
        external_user_id: extId && !['none', 'null', '—', 'n/a', '-'].includes(extId.toLowerCase()) ? extId : null,
        role: editForm.role || 'VIEWER',
        is_active: editForm.is_active !== undefined ? editForm.is_active : true,
        reporting_manager_id: editForm.reporting_manager_id ? Number(editForm.reporting_manager_id) : null,
        vendor_id: editForm.vendor_id ? editForm.vendor_id : null,
        user_type: editForm.user_type || 'NORMAL',
        advance_scope_type: editForm.user_type === 'ADVANCE' ? editForm.advance_scope_type : null,
        selected_circle_id: editForm.user_type === 'ADVANCE' ? editForm.selected_circle_id || null : null,
        selected_district_id: editForm.user_type === 'ADVANCE' && (editForm.advance_scope_type === 'DISTRICT' || editForm.advance_scope_type === 'BLOCK') ? editForm.selected_district_id || null : null,
        selected_block_id: editForm.user_type === 'ADVANCE' && editForm.advance_scope_type === 'BLOCK' ? editForm.selected_block_id || null : null,
      };

      const res = await userService.updateUser(user.id, payload);

      if (editForm.role || editForm.is_active !== undefined) {
        await userService.updateRole(user.id, { role: editForm.role, is_active: editForm.is_active }).catch(() => {});
      }

      if (editForm.vendor_id) {
        await userService.assignVendor(user.id, editForm.vendor_id).catch(() => {});
      }

      const updatedUser = res.data || { ...user, ...payload };
      if (onSuccess) {
        onSuccess(updatedUser, `User ${user.username || ''} updated successfully!`);
      }
      onClose();
    } catch (err) {
      console.error('Failed to update user:', err);
      let errMsg = 'Failed to save user updates.';
      if (err.response?.data) {
        const d = err.response.data;
        if (d.message) {
          errMsg = d.message;
          if (d.errors && typeof d.errors === 'object' && Object.keys(d.errors).length > 0) {
            const fieldErrs = Object.entries(d.errors)
              .map(([f, msgs]) => `${f}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
              .join('; ');
            if (fieldErrs && !errMsg.includes(fieldErrs)) {
              errMsg += ` (${fieldErrs})`;
            }
          }
        } else if (d.detail) {
          errMsg = d.detail;
        } else if (typeof d === 'object') {
          const fieldErrs = Object.entries(d)
            .map(([f, msgs]) => `${f}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
            .join('; ');
          if (fieldErrs) errMsg = fieldErrs;
        }
      } else if (err.message) {
        errMsg = err.message;
      }
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="app-card"
        style={{
          width: '100%',
          maxWidth: '600px',
          padding: '24px',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <LucideEdit3 size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Edit User Profile
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Username: <strong>{user.username}</strong> • ID: <code>{user.id}</code>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="header-icon-btn"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '6px' }}
            title="Close"
          >
            <LucideX size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '0.82rem', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem' }}>
          {/* Names */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>First Name</label>
              <input
                type="text"
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                placeholder="First Name"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Last Name</label>
              <input
                type="text"
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                placeholder="Last Name"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email Address</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              placeholder="user@example.com"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Phone & External User ID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone / Mobile</label>
              <input
                type="text"
                value={editForm.phone_number}
                onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                placeholder="Phone number"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>External User ID</label>
              <input
                type="text"
                value={editForm.external_user_id}
                onChange={(e) => setEditForm({ ...editForm, external_user_id: e.target.value })}
                placeholder="External User ID"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Role & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>HERO Role</label>
              <SearchableSelect
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
              >
                {roleOptions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </SearchableSelect>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Account Status</label>
              <SearchableSelect
                value={editForm.is_active ? 'active' : 'inactive'}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive / Disabled</option>
              </SearchableSelect>
            </div>
          </div>

          {/* User Type & Geographical Access Scope */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>User Type</label>
                <SearchableSelect
                  value={editForm.user_type}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditForm(prev => ({
                      ...prev,
                      user_type: val,
                      advance_scope_type: val === 'ADVANCE' ? 'CIRCLE' : '',
                      selected_circle_id: '',
                      selected_district_id: '',
                      selected_block_id: ''
                    }));
                    if (val === 'ADVANCE') {
                      fetchCircles();
                    }
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="ADVANCE">Advance</option>
                </SearchableSelect>
              </div>

              {editForm.user_type === 'ADVANCE' && (
                <div>
                  <label style={{ display: 'block', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>Access Scope</label>
                  <SearchableSelect
                    value={editForm.advance_scope_type}
                    onChange={(e) => {
                      const scope = e.target.value;
                      setEditForm(prev => ({
                        ...prev,
                        advance_scope_type: scope,
                        selected_district_id: scope === 'CIRCLE' ? '' : prev.selected_district_id,
                        selected_block_id: scope === 'BLOCK' ? prev.selected_block_id : ''
                      }));
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="CIRCLE">Circle</option>
                    <option value="DISTRICT">District</option>
                    <option value="BLOCK">Block</option>
                  </SearchableSelect>
                </div>
              )}
            </div>

            {editForm.user_type === 'ADVANCE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#eff6ff', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', marginTop: '4px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>Circle / State</label>
                  <SearchableSelect
                    value={editForm.selected_circle_id}
                    onChange={(e) => {
                      const cId = e.target.value;
                      setEditForm(prev => ({
                        ...prev,
                        selected_circle_id: cId,
                        selected_district_id: '',
                        selected_block_id: ''
                      }));
                      fetchDistrictsForEdit(cId);
                    }}
                    options={[
                      { value: '', label: '-- Select Circle --' },
                      ...masterCircles.map(c => ({ value: c.id, label: c.name }))
                    ]}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none', background: '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>

                {(editForm.advance_scope_type === 'DISTRICT' || editForm.advance_scope_type === 'BLOCK') && (
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>District</label>
                    <SearchableSelect
                      value={editForm.selected_district_id}
                      disabled={!editForm.selected_circle_id}
                      onChange={(e) => {
                        const dId = e.target.value;
                        setEditForm(prev => ({
                          ...prev,
                          selected_district_id: dId,
                          selected_block_id: ''
                        }));
                        fetchBlocksForEdit(dId);
                      }}
                      options={[
                        { value: '', label: '-- Select District --' },
                        ...editDistricts.map(d => ({ value: d.id, label: d.name }))
                      ]}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none', background: !editForm.selected_circle_id ? '#f3f4f6' : '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {editForm.advance_scope_type === 'BLOCK' && (
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>Block</label>
                    <SearchableSelect
                      value={editForm.selected_block_id}
                      disabled={!editForm.selected_district_id}
                      onChange={(e) => {
                        setEditForm(prev => ({
                          ...prev,
                          selected_block_id: e.target.value
                        }));
                      }}
                      options={[
                        { value: '', label: '-- Select Block --' },
                        ...editBlocks.map(b => ({ value: b.id, label: b.name }))
                      ]}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none', background: !editForm.selected_district_id ? '#f3f4f6' : '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vendor Scope & Reporting Manager Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* Vendor Scope */}
            <div>
              <label style={{ display: 'block', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                🏢 Assign Vendor Scope
              </label>
              <div style={{ position: 'relative', marginBottom: '6px' }}>
                <input
                  type="text"
                  placeholder="Search vendor..."
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 28px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                    fontSize: '0.78rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <LucideSearch size={13} color="#9ca3af" style={{ position: 'absolute', left: '8px', top: '8px' }} />
              </div>
              <div style={{ maxHeight: '130px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                <div
                  onClick={() => setEditForm({ ...editForm, vendor_id: '' })}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: !editForm.vendor_id ? 'var(--bg-subtle)' : 'transparent',
                    fontSize: '0.75rem',
                    color: !editForm.vendor_id ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: !editForm.vendor_id ? '700' : 'normal'
                  }}
                >
                  -- No Vendor Scope --
                </div>
                {systemVendors
                  .filter(v => {
                    if (!vendorSearch.trim()) return true;
                    const q = vendorSearch.toLowerCase();
                    const name = (v.partnerName || v.name || '').toLowerCase();
                    const code = (v.code || v.external_vendor_id || '').toLowerCase();
                    return name.includes(q) || code.includes(q);
                  })
                  .map(v => {
                    const val = v.id || v.external_vendor_id;
                    const isSelected = String(editForm.vendor_id) === String(val);
                    const name = v.partnerName || v.name;
                    return (
                      <div
                        key={val}
                        onClick={() => setEditForm({ ...editForm, vendor_id: val })}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: isSelected ? '#ecfdf5' : 'transparent',
                          border: isSelected ? '1px solid #059669' : '1px solid transparent',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.78rem'
                        }}
                      >
                        <span style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#065f46' : 'var(--text-primary)' }}>
                          {name}
                        </span>
                        {isSelected && <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 'bold' }}>✓</span>}
                      </div>
                    );
                  })
                }
              </div>
            </div>

            {/* Reporting Manager */}
            <div>
              <label style={{ display: 'block', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                👔 Reporting Manager
              </label>
              <div style={{ position: 'relative', marginBottom: '6px' }}>
                <input
                  type="text"
                  placeholder="Search manager..."
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 28px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                    fontSize: '0.78rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <LucideSearch size={13} color="#9ca3af" style={{ position: 'absolute', left: '8px', top: '8px' }} />
              </div>
              <div style={{ maxHeight: '130px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                <div
                  onClick={() => setEditForm({ ...editForm, reporting_manager_id: '' })}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: !editForm.reporting_manager_id ? 'var(--bg-subtle)' : 'transparent',
                    fontSize: '0.75rem',
                    color: !editForm.reporting_manager_id ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: !editForm.reporting_manager_id ? '700' : 'normal'
                  }}
                >
                  -- No Reporting Manager --
                </div>
                {allSystemUsers
                  .filter(mgr => mgr.id !== user?.id)
                  .filter(mgr => {
                    if (!managerSearch.trim()) return true;
                    const q = managerSearch.toLowerCase();
                    const name = (mgr.name || mgr.first_name || mgr.username || '').toLowerCase();
                    const email = (mgr.email || '').toLowerCase();
                    const role = (mgr.role || '').toLowerCase();
                    return name.includes(q) || email.includes(q) || role.includes(q);
                  })
                  .map(mgr => {
                    const isSelected = String(editForm.reporting_manager_id) === String(mgr.id);
                    return (
                      <div
                        key={mgr.id}
                        onClick={() => setEditForm({ ...editForm, reporting_manager_id: mgr.id })}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: isSelected ? '#eff6ff' : 'transparent',
                          border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.78rem'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#1e40af' : 'var(--text-primary)' }}>
                            {mgr.name || mgr.first_name || mgr.username}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {mgr.role || 'User'}
                          </div>
                        </div>
                        {isSelected && <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 'bold' }}>✓</span>}
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.82rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <LucideSave size={14} />
              {submitting ? 'Saving Changes...' : 'Save User Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
