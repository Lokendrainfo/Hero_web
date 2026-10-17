import React, { useState, useEffect } from 'react';
import { LucidePlus, LucideSearch, LucideX } from 'lucide-react';
import { userService } from '../../../services/userService';
import { SearchableSelect } from '../../../components/common/Select';

export const CreateUserModal = ({
  isOpen,
  onClose,
  onSuccess,
  systemVendors = [],
  allSystemUsers = [],
  roleOptions = []
}) => {
  const [masterCircles, setMasterCircles] = useState([]);
  const [createDistricts, setCreateDistricts] = useState([]);
  const [createBlocks, setCreateBlocks] = useState([]);

  const [vendorSearch, setVendorSearch] = useState('');
  const [managerSearch, setManagerSearch] = useState('');

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const [createForm, setCreateForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    employee_id: '',
    external_user_id: '',
    role: 'VIEWER',
    reporting_manager_id: '',
    vendor_id: '',
    password: '',
    user_type: 'NORMAL',
    advance_scope_type: 'CIRCLE',
    selected_circle_id: '',
    selected_district_id: '',
    selected_block_id: ''
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

  const fetchDistrictsForCreate = async (circleId) => {
    if (!circleId) {
      setCreateDistricts([]);
      setCreateBlocks([]);
      return;
    }
    try {
      const res = await userService.getDistricts(circleId);
      setCreateDistricts(parseList(res));
    } catch (err) {
      console.error('Failed to fetch districts:', err);
    }
  };

  const fetchBlocksForCreate = async (districtId) => {
    if (!districtId) {
      setCreateBlocks([]);
      return;
    }
    try {
      const res = await userService.getBlocks(districtId);
      setCreateBlocks(parseList(res));
    } catch (err) {
      console.error('Failed to fetch blocks:', err);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchCircles();
    setError(null);
    setVendorSearch('');
    setManagerSearch('');
    setCreateForm({
      username: '',
      first_name: '',
      last_name: '',
      email: '',
      phone_number: '',
      employee_id: '',
      external_user_id: '',
      role: 'VIEWER',
      reporting_manager_id: '',
      vendor_id: '',
      password: '',
      user_type: 'NORMAL',
      advance_scope_type: 'CIRCLE',
      selected_circle_id: '',
      selected_district_id: '',
      selected_block_id: ''
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const rawUsername = createForm.username.trim();
    if (!rawUsername) {
      setError('Username is required to create a user.');
      return;
    }

    const sanitizedUsername = rawUsername.replace(/\s+/g, '_');
    setCreating(true);
    setError(null);

    try {
      const payload = {
        username: sanitizedUsername,
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        email: createForm.email.trim(),
        phone_number: createForm.phone_number.trim(),
        employee_id: createForm.employee_id.trim(),
        external_user_id: createForm.external_user_id.trim() || null,
        role: createForm.role || 'VIEWER',
        reporting_manager_id: createForm.reporting_manager_id ? Number(createForm.reporting_manager_id) : null,
        vendor_id: createForm.vendor_id ? (isNaN(Number(createForm.vendor_id)) ? createForm.vendor_id : Number(createForm.vendor_id)) : null,
        password: createForm.password.trim() || undefined,
        user_type: createForm.user_type || 'NORMAL',
        advance_scope_type: createForm.user_type === 'ADVANCE' ? createForm.advance_scope_type : null,
        selected_circle_id: createForm.user_type === 'ADVANCE' ? createForm.selected_circle_id || null : null,
        selected_district_id: createForm.user_type === 'ADVANCE' && (createForm.advance_scope_type === 'DISTRICT' || createForm.advance_scope_type === 'BLOCK') ? createForm.selected_district_id || null : null,
        selected_block_id: createForm.user_type === 'ADVANCE' && createForm.advance_scope_type === 'BLOCK' ? createForm.selected_block_id || null : null,
      };

      const res = await userService.createUser(payload);
      if (onSuccess) {
        onSuccess(res.data, `User "${sanitizedUsername}" created successfully!`);
      }
      onClose();
    } catch (err) {
      console.error('Failed to create user:', err);
      const resData = err?.response?.data || err;
      let errMsg = 'Failed to create new user.';
      if (resData) {
        if (resData.errors && typeof resData.errors === 'object' && Object.keys(resData.errors).length > 0) {
          errMsg = Object.entries(resData.errors)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : v)}`)
            .join(' | ');
        } else if (resData.message) {
          errMsg = typeof resData.message === 'string' ? resData.message : JSON.stringify(resData.message);
        } else if (resData.detail) {
          errMsg = typeof resData.detail === 'string' ? resData.detail : JSON.stringify(resData.detail);
        } else if (typeof resData === 'object') {
          const filteredEntries = Object.entries(resData).filter(([k]) => k !== 'status_code' && k !== 'success');
          if (filteredEntries.length > 0) {
            errMsg = filteredEntries
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : v)}`)
              .join(' | ');
          }
        }
      }
      setError(errMsg);
    } finally {
      setCreating(false);
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
          maxWidth: '640px',
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
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <LucidePlus size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Add New User
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Create a new internal platform user with role and scope assignments
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem' }}>
          {/* Username & Password */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Username <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. john_doe"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
                Spaces will auto-convert to underscores
              </span>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Password <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Default: 123456)</span>
              </label>
              <input
                type="password"
                placeholder="Leave blank for default (123456)"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* First & Last Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>First Name</label>
              <input
                type="text"
                placeholder="First Name"
                value={createForm.first_name}
                onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Last Name</label>
              <input
                type="text"
                placeholder="Last Name"
                value={createForm.last_name}
                onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Email & Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email Address</label>
              <input
                type="email"
                placeholder="email@example.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone Number</label>
              <input
                type="text"
                placeholder="Mobile / Phone"
                value={createForm.phone_number}
                onChange={(e) => setCreateForm({ ...createForm, phone_number: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Employee ID, External User ID, HERO Role */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Employee ID</label>
              <input
                type="text"
                placeholder="EMP001"
                value={createForm.employee_id}
                onChange={(e) => setCreateForm({ ...createForm, employee_id: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>External User ID</label>
              <input
                type="text"
                placeholder="Ext ID"
                value={createForm.external_user_id}
                onChange={(e) => setCreateForm({ ...createForm, external_user_id: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>HERO Role</label>
              <SearchableSelect
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
              >
                {roleOptions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </SearchableSelect>
            </div>
          </div>

          {/* User Type & Geographical Access Scope */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  User Type <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <SearchableSelect
                  value={createForm.user_type}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCreateForm(prev => ({
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

              {createForm.user_type === 'ADVANCE' && (
                <div>
                  <label style={{ display: 'block', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Access Scope <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <SearchableSelect
                    value={createForm.advance_scope_type}
                    onChange={(e) => {
                      const scope = e.target.value;
                      setCreateForm(prev => ({
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

            {createForm.user_type === 'ADVANCE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#eff6ff', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', marginTop: '4px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>
                    Circle / State <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <SearchableSelect
                    value={createForm.selected_circle_id}
                    onChange={(e) => {
                      const cId = e.target.value;
                      setCreateForm(prev => ({
                        ...prev,
                        selected_circle_id: cId,
                        selected_district_id: '',
                        selected_block_id: ''
                      }));
                      fetchDistrictsForCreate(cId);
                    }}
                    options={[
                      { value: '', label: '-- Select Circle --' },
                      ...masterCircles.map(c => ({ value: c.id, label: c.name }))
                    ]}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none', background: '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                </div>

                {(createForm.advance_scope_type === 'DISTRICT' || createForm.advance_scope_type === 'BLOCK') && (
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>
                      District <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <SearchableSelect
                      value={createForm.selected_district_id}
                      disabled={!createForm.selected_circle_id}
                      onChange={(e) => {
                        const dId = e.target.value;
                        setCreateForm(prev => ({
                          ...prev,
                          selected_district_id: dId,
                          selected_block_id: ''
                        }));
                        fetchBlocksForCreate(dId);
                      }}
                      options={[
                        { value: '', label: '-- Select District --' },
                        ...createDistricts.map(d => ({ value: d.id, label: d.name }))
                      ]}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none', background: !createForm.selected_circle_id ? '#f3f4f6' : '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {createForm.advance_scope_type === 'BLOCK' && (
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>
                      Block <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <SearchableSelect
                      value={createForm.selected_block_id}
                      disabled={!createForm.selected_district_id}
                      onChange={(e) => {
                        setCreateForm(prev => ({
                          ...prev,
                          selected_block_id: e.target.value
                        }));
                      }}
                      options={[
                        { value: '', label: '-- Select Block --' },
                        ...createBlocks.map(b => ({ value: b.id, label: b.name }))
                      ]}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none', background: !createForm.selected_district_id ? '#f3f4f6' : '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
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
                  onClick={() => setCreateForm({ ...createForm, vendor_id: '' })}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: !createForm.vendor_id ? 'var(--bg-subtle)' : 'transparent',
                    fontSize: '0.75rem',
                    color: !createForm.vendor_id ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: !createForm.vendor_id ? '700' : 'normal'
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
                    const isSelected = String(createForm.vendor_id) === String(val);
                    const name = v.partnerName || v.name;
                    return (
                      <div
                        key={val}
                        onClick={() => setCreateForm({ ...createForm, vendor_id: val })}
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
                  onClick={() => setCreateForm({ ...createForm, reporting_manager_id: '' })}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: !createForm.reporting_manager_id ? 'var(--bg-subtle)' : 'transparent',
                    fontSize: '0.75rem',
                    color: !createForm.reporting_manager_id ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: !createForm.reporting_manager_id ? '700' : 'normal'
                  }}
                >
                  -- No Reporting Manager --
                </div>
                {allSystemUsers
                  .filter(mgr => {
                    if (!managerSearch.trim()) return true;
                    const q = managerSearch.toLowerCase();
                    const name = (mgr.name || mgr.first_name || mgr.username || '').toLowerCase();
                    const email = (mgr.email || '').toLowerCase();
                    const role = (mgr.role || '').toLowerCase();
                    return name.includes(q) || email.includes(q) || role.includes(q);
                  })
                  .map(mgr => {
                    const isSelected = String(createForm.reporting_manager_id) === String(mgr.id);
                    return (
                      <div
                        key={mgr.id}
                        onClick={() => setCreateForm({ ...createForm, reporting_manager_id: mgr.id })}
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

          {/* Footer Actions */}
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
              disabled={creating}
              className="btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#059669', borderColor: '#059669' }}
            >
              <LucidePlus size={16} />
              {creating ? 'Creating User...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
