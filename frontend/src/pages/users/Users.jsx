import React, { useEffect, useState } from 'react';
import { userService } from '../../services/userService';
import { roleService } from '../../services/roleService';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import {
  LucideUserCheck, LucideSearch, LucideRefreshCw, LucideShieldCheck,
  LucideCheckCircle2, LucideXCircle, LucideChevronRight, LucideFilter, LucideShield,
  LucideEdit3, LucidePower, LucideX, LucidePlus
} from 'lucide-react';

import { vendorService } from '../../services/vendorService';

export const Users = () => {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [systemVendors, setSystemVendors] = useState([]);
  const [allSystemUsers, setAllSystemUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  const [inspectUser, setInspectUser] = useState(null);
  const [assignModalUser, setAssignModalUser] = useState(null);
  const [selectedVendorToAssign, setSelectedVendorToAssign] = useState('');
  const [vendorSearchInModal, setVendorSearchInModal] = useState('');
  const [vendorSearchInEditModal, setVendorSearchInEditModal] = useState('');
  const [managerSearchInEditModal, setManagerSearchInEditModal] = useState('');

  // Create User State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [vendorSearchInCreateModal, setVendorSearchInCreateModal] = useState('');
  const [managerSearchInCreateModal, setManagerSearchInCreateModal] = useState('');
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
    password: ''
  });

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    external_user_id: '',
    role: 'VIEWER',
    reporting_manager_id: '',
    vendor_id: '',
    is_active: true
  });
  const [statusMessage, setStatusMessage] = useState(null);

  const [pagination, setPagination] = useState({
    page: 0,
    size: 50,
    total: 0,
    total_pages: 1
  });

  const fetchUsers = async (page = pagination.page, size = pagination.size, searchOverride = null) => {
    setLoading(true);
    const querySearch = searchOverride !== null ? searchOverride : search;
    try {
      const [userRes, roleRes, vendorRes, allUsersRes] = await Promise.all([
        userService.getAll({
          page,
          size,
          search: querySearch,
          role: selectedRoleFilter !== 'ALL' ? selectedRoleFilter : ''
        }),
        roleService.getRoles(),
        vendorService.getIntegrationsVendors({ size: 100 }).catch(() => vendorService.getVendors({ page: 0, size: 100 }).catch(() => ({ data: [] }))),
        userService.getAll({ size: 'all' }).catch(() => ({ data: [] }))
      ]);

      const payload = userRes.data || userRes;
      const userList = payload.results || (Array.isArray(payload) ? payload : (payload.data?.results || payload.data || []));
      const roleList = Array.isArray(roleRes.data) ? roleRes.data : (roleRes.results || roleRes || []);
      
      const vPayload = vendorRes.data?.data || vendorRes.data || vendorRes;
      const vendorList = vPayload.results || vPayload.content || vPayload.vendors || (Array.isArray(vPayload) ? vPayload : []);

      const allUsersPayload = allUsersRes.data || allUsersRes;
      const allUsersList = allUsersPayload.results || (Array.isArray(allUsersPayload) ? allUsersPayload : (allUsersPayload.data?.results || allUsersPayload.data || []));

      setUsers(userList);
      setRoles(roleList);
      setSystemVendors(vendorList);
      setAllSystemUsers(allUsersList);

      const totalCount = payload.total !== undefined ? payload.total : (payload.count !== undefined ? payload.count : userList.length);
      const sizeNum = size === 'all' ? totalCount : Number(size);
      const totalPages = payload.total_pages || (sizeNum > 0 ? Math.ceil(totalCount / sizeNum) : 1);

      setPagination({
        page: payload.page !== undefined ? payload.page : page,
        size: size,
        total: totalCount,
        total_pages: totalPages
      });
    } catch (err) {
      console.error("Error fetching users/roles/vendors:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(0, pagination.size);
  }, [selectedRoleFilter]);

  const handleSync = async () => {
    setSyncing(true);
    setStatusMessage(null);
    try {
      const res = await userService.syncIlync();
      setStatusMessage({ type: 'success', text: res.message || 'External users synchronized successfully!' });
      fetchUsers();
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to sync users from external ILYNC portal.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await userService.updateRole(userId, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole, roles: [newRole] } : u));
      if (inspectUser && inspectUser.id === userId) {
        setInspectUser(prev => ({ ...prev, role: newRole, roles: [newRole] }));
      }
      setStatusMessage({ type: 'success', text: `Updated user role to ${newRole}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to update user role.' });
    }
  };

  const handleStatusToggle = async (user) => {
    const nextStatus = !user.is_active;
    try {
      await userService.updateRole(user.id, { is_active: nextStatus });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: nextStatus } : u));
      if (inspectUser && inspectUser.id === user.id) {
        setInspectUser(prev => ({ ...prev, is_active: nextStatus }));
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to update user status.' });
    }
  };

  const handleAssignVendor = async () => {
    if (!assignModalUser || !selectedVendorToAssign) return;
    try {
      const res = await userService.assignVendor(assignModalUser.id, selectedVendorToAssign);
      const updatedUser = res.data;
      setUsers(prev => prev.map(u => u.id === assignModalUser.id ? updatedUser : u));
      setStatusMessage({ type: 'success', text: `Vendor assigned successfully to ${assignModalUser.username}` });
      setAssignModalUser(null);
      setSelectedVendorToAssign('');
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to assign vendor.' });
    }
  };

  const handleRemoveVendor = async (userId, vendorId) => {
    try {
      const res = await userService.removeVendor(userId, vendorId);
      const updatedUser = res.data;
      setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
      setStatusMessage({ type: 'success', text: 'Vendor assignment removed successfully.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to remove vendor assignment.' });
    }
  };

  const handleEditClick = (u) => {
    setEditUser(u);
    setVendorSearchInEditModal('');
    setManagerSearchInEditModal('');
    const currentRole = (u.roles && u.roles.length > 0) ? u.roles[0] : (u.role || 'VIEWER');
    const firstAssignedVendorId = (u.vendors && u.vendors.length > 0) ? (u.vendors[0].id || u.vendors[0].external_vendor_id) : (u.vendor || u.vendor_id || '');

    setEditForm({
      first_name: u.first_name || u.name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      phone_number: u.phone_number || '',
      external_user_id: u.external_user_id || u.employee_id || '',
      role: currentRole,
      reporting_manager_id: u.reporting_manager_id || u.reporting_manager || '',
      vendor_id: firstAssignedVendorId || '',
      is_active: u.is_active !== undefined ? u.is_active : true
    });
  };

  const handleSaveEditUser = async () => {
    if (!editUser) return;
    try {
      const payload = {
        first_name: editForm.first_name,
        email: editForm.email,
        phone_number: editForm.phone_number,
        external_user_id: editForm.external_user_id,
        role: editForm.role,
        is_active: editForm.is_active,
        reporting_manager_id: editForm.reporting_manager_id ? Number(editForm.reporting_manager_id) : null,
        vendor_id: editForm.vendor_id ? editForm.vendor_id : null
      };

      await userService.updateUser(editUser.id, payload);
      
      // Update role & status if changed
      if (editForm.role || editForm.is_active !== undefined) {
        await userService.updateRole(editUser.id, { role: editForm.role, is_active: editForm.is_active });
      }

      // If vendor_id is specified, assign vendor scope as well
      if (editForm.vendor_id) {
        await userService.assignVendor(editUser.id, editForm.vendor_id).catch(() => {});
      }

      await fetchUsers(pagination.page, pagination.size);
      setStatusMessage({ type: 'success', text: `User ${editUser.username} updated successfully!` });
      setEditUser(null);
    } catch (err) {
      console.error("Failed to update user:", err);
      setStatusMessage({ type: 'error', text: 'Failed to save user updates.' });
    }
  };

  const handleCreateUserSubmit = async (e) => {
    if (e) e.preventDefault();
    const rawUsername = createForm.username.trim();
    if (!rawUsername) {
      setStatusMessage({ type: 'error', text: 'Username is required to create a user.' });
      return;
    }

    // Auto-convert spaces in username to underscores
    const sanitizedUsername = rawUsername.replace(/\s+/g, '_');

    setCreating(true);
    setStatusMessage(null);
    try {
      const payload = {
        username: sanitizedUsername,
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        email: createForm.email.trim(),
        phone_number: createForm.phone_number.trim(),
        employee_id: createForm.employee_id.trim(),
        external_user_id: createForm.external_user_id.trim() || createForm.employee_id.trim() || null,
        role: createForm.role || 'VIEWER',
        reporting_manager_id: createForm.reporting_manager_id ? Number(createForm.reporting_manager_id) : null,
        vendor_id: createForm.vendor_id ? (isNaN(Number(createForm.vendor_id)) ? createForm.vendor_id : Number(createForm.vendor_id)) : null,
        password: createForm.password.trim() || undefined
      };

      await userService.createUser(payload);

      await fetchUsers(0, pagination.size);
      setStatusMessage({ type: 'success', text: `User "${sanitizedUsername}" created successfully!` });
      setCreateModalOpen(false);
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
        password: ''
      });
    } catch (err) {
      console.error("Failed to create user:", err);
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
      setStatusMessage({ type: 'error', text: errMsg });
    } finally {
      setCreating(false);
    }
  };

  const roleOptions = React.useMemo(() => {
    const defaultList = ['ADMIN', 'PROJECT_MANAGER', 'ENGINEER', 'SUPERVISOR', 'OPERATOR', 'VENDOR', 'VIEWER', 'ALL_VIEWER'];
    const fetchedList = (roles || []).map(r => r.name || r.code).filter(Boolean);
    return Array.from(new Set([...defaultList, ...fetchedList]));
  }, [roles]);

  const filteredUsers = React.useMemo(() => {
    if (!search || !search.trim()) return users;
    const q = search.toLowerCase().trim();
    return users.filter(u => {
      const fullName = (u.name || `${u.first_name || ''} ${u.last_name || ''}`).toLowerCase();
      const uname = (u.username || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const empId = (u.employee_id || '').toLowerCase();
      const extId = (u.external_user_id || '').toLowerCase();
      const phone = (u.phone_number || '').toLowerCase();
      const vName = (u.vendor_name || u.vendor?.name || '').toLowerCase();
      const role = (u.role || '').toLowerCase();

      return (
        fullName.includes(q) ||
        uname.includes(q) ||
        email.includes(q) ||
        empId.includes(q) ||
        extId.includes(q) ||
        phone.includes(q) ||
        vName.includes(q) ||
        role.includes(q)
      );
    });
  }, [users, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LucideUserCheck size={24} color="#0a2d23" />
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#111827' }}>
              User Management & Access Control
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
            Synchronize external portal identity & assign local HERO RBAC roles
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => {
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
                password: ''
              });
              setVendorSearchInCreateModal('');
              setManagerSearchInCreateModal('');
              setCreateModalOpen(true);
            }}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#059669',
              borderColor: '#059669',
              fontWeight: '600'
            }}
          >
            <LucidePlus size={16} />
            Add New User
          </button>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <LucideRefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing External Users...' : 'Sync External Users'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          fontWeight: '500',
          background: statusMessage.type === 'error' ? '#fef2f2' : '#ecfdf5',
          color: statusMessage.type === 'error' ? '#dc2626' : '#047857',
          border: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : '#a7f3d0'}`
        }}>
          {statusMessage.text}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchUsers(0, pagination.size, search);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 340px' }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              placeholder="Search by name, email, employee ID, or external user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 34px 10px 38px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <LucideSearch size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  fetchUsers(0, pagination.size, '');
                }}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af'
                }}
              >
                <LucideX size={16} />
              </button>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{
              padding: '9px 18px',
              fontSize: '0.82rem',
              fontWeight: '600',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <LucideSearch size={14} /> Search User
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LucideFilter size={15} color="#6b7280" />
          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151' }}>Role:</span>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.82rem',
              outline: 'none',
              background: '#ffffff'
            }}
          >
            <option value="ALL">All Roles</option>
            {roleOptions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Page Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151' }}>Page Size:</span>
          <select
            value={pagination.size}
            onChange={(e) => {
              const newSize = e.target.value;
              fetchUsers(0, newSize);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.82rem',
              outline: 'none',
              background: '#ffffff',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <option value={20}>20 Per Page</option>
            <option value={50}>50 Per Page</option>
            <option value={100}>100 Per Page</option>
            <option value="all">Show All ({pagination.total || users.length} Users)</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="app-card" style={{ padding: '0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ padding: '12px 16px' }}>User Details</th>
              <th style={{ padding: '12px 16px' }}>External User ID</th>
              <th style={{ padding: '12px 16px' }}>HERO Role</th>
              <th style={{ padding: '12px 16px' }}>Reporting Manager</th>
              <th style={{ padding: '12px 16px' }}>Assigned Vendors Scope</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  Loading HERO platform users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  No users found matching your search query.
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => {
                const currentRole = (u.roles && u.roles.length > 0) ? u.roles[0] : (u.role || 'VIEWER');
                const extId = u.external_user_id || u.employee_id || u.id;
                const assignedVendors = Array.isArray(u.vendors) ? u.vendors : [];

                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '600', color: '#111827' }}>{u.name || u.first_name || u.username}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{u.email}</div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <code style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>
                        {extId}
                      </code>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <select
                        value={currentRole}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #0a2d23',
                          background: '#0a2d23',
                          color: '#ffffff',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        {roleOptions.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      {u.reporting_manager_name ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', background: '#f3f4f6', color: '#1f2937', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                          <span>👔</span> {u.reporting_manager_name}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                          No Manager Assigned
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        {currentRole === 'ADMIN' ? (
                          <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                            🌐 All Vendors (Admin)
                          </span>
                        ) : assignedVendors.length > 0 ? (
                          assignedVendors.map(v => (
                            <span key={v.id} style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {v.name}
                              <button
                                onClick={() => handleRemoveVendor(u.id, v.id)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem', padding: '0 2px' }}
                                title="Remove Vendor Access"
                              >
                                ✕
                              </button>
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 6px', borderRadius: '4px' }}>
                            ⚠️ No Vendor Assigned
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => handleStatusToggle(u)}
                        style={{
                          border: 'none',
                          background: u.is_active ? '#ecfdf5' : '#fef2f2',
                          color: u.is_active ? '#047857' : '#dc2626',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {u.is_active ? <LucideCheckCircle2 size={13} /> : <LucideXCircle size={13} />}
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleEditClick(u)}
                          style={{
                            background: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <LucideEdit3 size={13} /> Edit
                        </button>

                        <button
                          onClick={() => setInspectUser(u)}
                          style={{
                            background: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <LucideShield size={13} /> Permissions
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls Bar */}
      {pagination.total > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '12px 16px',
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          fontSize: '0.82rem'
        }}>
          <div style={{ color: '#4b5563', fontWeight: '500' }}>
            Showing <strong>{users.length}</strong> of <strong>{pagination.total}</strong> Total Users
            {pagination.size !== 'all' && (
              <span> (Page <strong>{pagination.page + 1}</strong> of <strong>{pagination.total_pages}</strong>)</span>
            )}
          </div>

          {pagination.size !== 'all' && pagination.total_pages > 1 && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                disabled={pagination.page <= 0}
                onClick={() => fetchUsers(0, pagination.size)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: pagination.page <= 0 ? '#f3f4f6' : '#ffffff',
                  color: pagination.page <= 0 ? '#9ca3af' : '#374151',
                  cursor: pagination.page <= 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                ⏮ First
              </button>

              <button
                disabled={pagination.page <= 0}
                onClick={() => fetchUsers(pagination.page - 1, pagination.size)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: pagination.page <= 0 ? '#f3f4f6' : '#ffffff',
                  color: pagination.page <= 0 ? '#9ca3af' : '#374151',
                  cursor: pagination.page <= 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                ◀ Prev
              </button>

              <span style={{ padding: '0 8px', fontWeight: '700', color: '#0a2d23' }}>
                Page {pagination.page + 1} / {pagination.total_pages}
              </span>

              <button
                disabled={pagination.page >= pagination.total_pages - 1}
                onClick={() => fetchUsers(pagination.page + 1, pagination.size)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: pagination.page >= pagination.total_pages - 1 ? '#f3f4f6' : '#ffffff',
                  color: pagination.page >= pagination.total_pages - 1 ? '#9ca3af' : '#374151',
                  cursor: pagination.page >= pagination.total_pages - 1 ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                Next ▶
              </button>

              <button
                disabled={pagination.page >= pagination.total_pages - 1}
                onClick={() => fetchUsers(pagination.total_pages - 1, pagination.size)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: pagination.page >= pagination.total_pages - 1 ? '#f3f4f6' : '#ffffff',
                  color: pagination.page >= pagination.total_pages - 1 ? '#9ca3af' : '#374151',
                  cursor: pagination.page >= pagination.total_pages - 1 ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                Last ⏭
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inspect User Permissions Modal */}
      {inspectUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="app-card" style={{ width: '100%', maxWidth: '520px', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>
                  {inspectUser.name || inspectUser.username}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  External ID: <code style={{ color: '#047857' }}>{inspectUser.external_user_id || inspectUser.id}</code>
                </div>
              </div>
              <button
                onClick={() => setInspectUser(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: '600', marginBottom: '6px' }}>
                Assigned HERO Role:
              </div>
              <div style={{ display: 'inline-block', background: '#0a2d23', color: '#6ee7b7', padding: '4px 12px', borderRadius: '6px', fontWeight: '700', fontSize: '0.85rem' }}>
                {inspectUser.role || 'VIEWER'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: '600', marginBottom: '8px' }}>
                Inherited Permissions ({inspectUser.permissions?.length || 0}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {inspectUser.permissions && inspectUser.permissions.length > 0 ? (
                  inspectUser.permissions.map(p => (
                    <span key={p} style={{ fontSize: '0.72rem', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px' }}>
                      {p}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>No active permissions assigned.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Vendor Modal */}
      {assignModalUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="app-card" style={{ width: '100%', maxWidth: '440px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111827' }}>
                Assign Vendor Scope to {assignModalUser.name || assignModalUser.username}
              </h3>
              <button onClick={() => setAssignModalUser(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}>
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#111827', marginBottom: '6px' }}>
                Select Vendor from System Registry ({systemVendors.length} Vendors):
              </label>

              {/* Searchable Input Bar */}
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="🔍 Type to search vendor by name, code, contact..."
                  value={vendorSearchInModal}
                  onChange={(e) => setVendorSearchInModal(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 32px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <LucideSearch size={15} color="#9ca3af" style={{ position: 'absolute', left: '10px', top: '9px' }} />
              </div>

              {/* Filtered Scrollable List of Vendors */}
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '8px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                {systemVendors
                  .filter(v => {
                    if (!vendorSearchInModal.trim()) return true;
                    const q = vendorSearchInModal.toLowerCase();
                    const name = (v.partnerName || v.name || '').toLowerCase();
                    const code = (v.code || v.external_vendor_id || v.external_id || v.id || '').toLowerCase();
                    const contact = (v.contactName || v.contact_person || '').toLowerCase();
                    return name.includes(q) || code.includes(q) || contact.includes(q);
                  })
                  .map(v => {
                    const targetVal = v.id || v.external_vendor_id;
                    const isSelected = String(selectedVendorToAssign) === String(targetVal);
                    const name = v.partnerName || v.name;
                    const contact = v.contactName || v.contact_person || 'N/A';
                    const code = v.legalEntityType || v.code || v.external_vendor_id || 'VENDOR';

                    return (
                      <div
                        key={v.id || v.external_vendor_id}
                        onClick={() => setSelectedVendorToAssign(targetVal)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: isSelected ? '#ecfdf5' : '#ffffff',
                          border: isSelected ? '1px solid #059669' : '1px solid #f3f4f6',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.85rem', color: isSelected ? '#065f46' : '#111827' }}>
                            {name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                            Contact: {contact} • <span style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: '3px', fontWeight: '600' }}>{code}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 'bold' }}>✓ Selected</span>
                        )}
                      </div>
                    );
                  })
                }
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setAssignModalUser(null)}
                style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAssignVendor}
                disabled={!selectedVendorToAssign}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Profile Modal */}
      {editUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="app-card" style={{ width: '100%', maxWidth: '560px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideEdit3 size={18} color="#1d4ed8" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>
                  Edit User Profile: {editUser.username}
                </h3>
              </div>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Full Name:</label>
                <input
                  type="text"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Email Address:</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Phone / Mobile:</label>
                  <input
                    type="text"
                    value={editForm.phone_number}
                    onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>External User ID:</label>
                  <input
                    type="text"
                    value={editForm.external_user_id}
                    onChange={(e) => setEditForm({ ...editForm, external_user_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>HERO Role:</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', background: '#fff' }}
                  >
                    {roleOptions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>User Status:</label>
                  <select
                    value={editForm.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', background: '#fff' }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive / Disabled</option>
                  </select>
                </div>
              </div>

              {/* Search & Select Vendor Scope & Reporting Manager */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Search & Select Vendor */}
                <div>
                  <label style={{ display: 'block', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                    🏢 Assign Vendor Scope:
                  </label>
                  <div style={{ position: 'relative', marginBottom: '6px' }}>
                    <input
                      type="text"
                      placeholder="🔍 Search vendor..."
                      value={vendorSearchInEditModal}
                      onChange={(e) => setVendorSearchInEditModal(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 28px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.78rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <LucideSearch size={13} color="#9ca3af" style={{ position: 'absolute', left: '8px', top: '8px' }} />
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                    <div
                      onClick={() => setEditForm({ ...editForm, vendor_id: '' })}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: !editForm.vendor_id ? '#f3f4f6' : '#ffffff',
                        fontSize: '0.75rem',
                        color: !editForm.vendor_id ? '#1f2937' : '#6b7280',
                        fontWeight: !editForm.vendor_id ? '700' : 'normal'
                      }}
                    >
                      -- No Vendor Scope --
                    </div>
                    {systemVendors
                      .filter(v => {
                        if (!vendorSearchInEditModal.trim()) return true;
                        const q = vendorSearchInEditModal.toLowerCase();
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
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: isSelected ? '#ecfdf5' : '#ffffff',
                              border: isSelected ? '1px solid #059669' : '1px solid #f3f4f6',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.78rem'
                            }}
                          >
                            <span style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#065f46' : '#111827' }}>
                              {name}
                            </span>
                            {isSelected && <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 'bold' }}>✓</span>}
                          </div>
                        );
                      })
                    }
                  </div>
                </div>

                {/* Search & Select Reporting Manager */}
                <div>
                  <label style={{ display: 'block', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                    👔 Reporting Manager:
                  </label>
                  <div style={{ position: 'relative', marginBottom: '6px' }}>
                    <input
                      type="text"
                      placeholder="🔍 Search manager..."
                      value={managerSearchInEditModal}
                      onChange={(e) => setManagerSearchInEditModal(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 28px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.78rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <LucideSearch size={13} color="#9ca3af" style={{ position: 'absolute', left: '8px', top: '8px' }} />
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                    <div
                      onClick={() => setEditForm({ ...editForm, reporting_manager_id: '' })}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: !editForm.reporting_manager_id ? '#f3f4f6' : '#ffffff',
                        fontSize: '0.75rem',
                        color: !editForm.reporting_manager_id ? '#1f2937' : '#6b7280',
                        fontWeight: !editForm.reporting_manager_id ? '700' : 'normal'
                      }}
                    >
                      -- No Reporting Manager --
                    </div>
                    {allSystemUsers
                      .filter(mgr => mgr.id !== editUser?.id)
                      .filter(mgr => {
                        if (!managerSearchInEditModal.trim()) return true;
                        const q = managerSearchInEditModal.toLowerCase();
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
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: isSelected ? '#eff6ff' : '#ffffff',
                              border: isSelected ? '1px solid #3b82f6' : '1px solid #f3f4f6',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.78rem'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#1e40af' : '#111827' }}>
                                {mgr.name || mgr.first_name || mgr.username}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
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
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setEditUser(null)}
                style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditUser}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                Save User Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New User Modal */}
      {createModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="app-card" style={{ width: '100%', maxWidth: '600px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: '#ecfdf5', color: '#047857', borderRadius: '50%', padding: '6px', display: 'flex' }}>
                  <LucidePlus size={20} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#111827' }}>
                  Create New User
                </h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Username <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. john_doe or Abhishek Sir"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#6b7280', display: 'block', marginTop: '2px' }}>
                    Spaces will auto-convert to underscores (e.g., Abhishek_Sir)
                  </span>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Password <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 'normal' }}>(Default: 123456)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank for default (123456)"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>First Name</label>
                  <input
                    type="text"
                    placeholder="First Name"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Last Name</label>
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Email Address</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Phone Number</label>
                  <input
                    type="text"
                    placeholder="Mobile / Phone"
                    value={createForm.phone_number}
                    onChange={(e) => setCreateForm({ ...createForm, phone_number: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Employee ID</label>
                  <input
                    type="text"
                    placeholder="EMP001"
                    value={createForm.employee_id}
                    onChange={(e) => setCreateForm({ ...createForm, employee_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>External User ID</label>
                  <input
                    type="text"
                    placeholder="Ext User ID"
                    value={createForm.external_user_id}
                    onChange={(e) => setCreateForm({ ...createForm, external_user_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>HERO Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    {roleOptions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vendor Scope & Reporting Manager Selection */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Search & Select Vendor */}
                <div>
                  <label style={{ display: 'block', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                    🏢 Assign Vendor Scope:
                  </label>
                  <div style={{ position: 'relative', marginBottom: '6px' }}>
                    <input
                      type="text"
                      placeholder="🔍 Search vendor..."
                      value={vendorSearchInCreateModal}
                      onChange={(e) => setVendorSearchInCreateModal(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 28px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.78rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <LucideSearch size={13} color="#9ca3af" style={{ position: 'absolute', left: '8px', top: '8px' }} />
                  </div>
                  <div style={{ maxHeight: '130px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                    <div
                      onClick={() => setCreateForm({ ...createForm, vendor_id: '' })}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: !createForm.vendor_id ? '#f3f4f6' : '#ffffff',
                        fontSize: '0.75rem',
                        color: !createForm.vendor_id ? '#1f2937' : '#6b7280',
                        fontWeight: !createForm.vendor_id ? '700' : 'normal'
                      }}
                    >
                      -- No Vendor Scope --
                    </div>
                    {systemVendors
                      .filter(v => {
                        if (!vendorSearchInCreateModal.trim()) return true;
                        const q = vendorSearchInCreateModal.toLowerCase();
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
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: isSelected ? '#ecfdf5' : '#ffffff',
                              border: isSelected ? '1px solid #059669' : '1px solid #f3f4f6',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.78rem'
                            }}
                          >
                            <span style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#065f46' : '#111827' }}>
                              {name}
                            </span>
                            {isSelected && <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 'bold' }}>✓</span>}
                          </div>
                        );
                      })
                    }
                  </div>
                </div>

                {/* Search & Select Reporting Manager */}
                <div>
                  <label style={{ display: 'block', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                    👔 Reporting Manager:
                  </label>
                  <div style={{ position: 'relative', marginBottom: '6px' }}>
                    <input
                      type="text"
                      placeholder="🔍 Search manager..."
                      value={managerSearchInCreateModal}
                      onChange={(e) => setManagerSearchInCreateModal(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 28px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.78rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <LucideSearch size={13} color="#9ca3af" style={{ position: 'absolute', left: '8px', top: '8px' }} />
                  </div>
                  <div style={{ maxHeight: '130px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '6px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                    <div
                      onClick={() => setCreateForm({ ...createForm, reporting_manager_id: '' })}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: !createForm.reporting_manager_id ? '#f3f4f6' : '#ffffff',
                        fontSize: '0.75rem',
                        color: !createForm.reporting_manager_id ? '#1f2937' : '#6b7280',
                        fontWeight: !createForm.reporting_manager_id ? '700' : 'normal'
                      }}
                    >
                      -- No Reporting Manager --
                    </div>
                    {allSystemUsers
                      .filter(mgr => {
                        if (!managerSearchInCreateModal.trim()) return true;
                        const q = managerSearchInCreateModal.toLowerCase();
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
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: isSelected ? '#eff6ff' : '#ffffff',
                              border: isSelected ? '1px solid #3b82f6' : '1px solid #f3f4f6',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.78rem'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#1e40af' : '#111827' }}>
                                {mgr.name || mgr.first_name || mgr.username}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#059669', borderColor: '#059669' }}
                >
                  <LucidePlus size={16} />
                  {creating ? 'Creating User...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
