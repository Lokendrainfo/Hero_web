import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { userService } from '../../services/userService';
import { roleService } from '../../services/roleService';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { SearchableSelect } from '../../components/common/Select';
import { roleBadgeClass } from '../../utils/roleBadge';

import { UserEditModal } from './components/UserEditModal';
import { UserPermissionsModal } from './components/UserPermissionsModal';
import { AssignVendorModal } from './components/AssignVendorModal';
import { CreateUserModal } from './components/CreateUserModal';
import { UserVendorsQuickViewModal } from './components/UserVendorsQuickViewModal';

import {
  LucideUserCheck,
  LucideSearch,
  LucideRefreshCw,
  LucideShield,
  LucideCheckCircle2,
  LucideXCircle,
  LucideChevronRight,
  LucideFilter,
  LucideEdit3,
  LucideX,
  LucidePlus,
  LucideEye,
  LucideBuilding,
  LucideMapPin,
  LucideUsers,
  LucideLayers
} from 'lucide-react';

export const Users = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [ilyncRoles, setIlyncRoles] = useState([]);
  const [systemVendors, setSystemVendors] = useState([]);
  const [allSystemUsers, setAllSystemUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('Internal'); // Internal | External
  const [originCounts, setOriginCounts] = useState({ INTERNAL: 0, EXTERNAL: 0 });

  const [statusMessage, setStatusMessage] = useState(null);

  // Modals state
  const [inspectUser, setInspectUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assignModalUser, setAssignModalUser] = useState(null);
  const [quickViewVendorUser, setQuickViewVendorUser] = useState(null);

  const [pagination, setPagination] = useState({
    page: 0,
    size: 50,
    total: 0,
    total_pages: 1
  });

  const fetchUsers = async (page = pagination.page, size = pagination.size, searchOverride = null, tabOverride = null) => {
    setLoading(true);
    const querySearch = searchOverride !== null ? searchOverride : search;
    const tab = tabOverride || activeTab;
    const origin = tab === 'External' ? 'external' : 'internal';
    try {
      const [userRes, roleRes, vendorRes] = await Promise.all([
        userService.getAll({
          page,
          size,
          search: querySearch,
          role: selectedRoleFilter !== 'ALL' ? selectedRoleFilter : '',
          origin
        }),
        roleService.getRoles().catch(() => ({ data: [] })),
        vendorService.getIntegrationsVendors({ size: 100 }).catch(() => vendorService.getVendors({ page: 0, size: 100 }).catch(() => ({ data: [] })))
      ]);

      const payload = userRes.data || userRes;
      const userList = payload.results || (Array.isArray(payload) ? payload : (payload.data?.results || payload.data || []));
      const roleList = Array.isArray(roleRes.data) ? roleRes.data : (roleRes.results || roleRes || []);

      const vPayload = vendorRes.data?.data || vendorRes.data || vendorRes;
      const vendorList = vPayload.results || vPayload.content || vPayload.vendors || (Array.isArray(vPayload) ? vPayload : []);

      setUsers(userList);
      setRoles(roleList);
      setSystemVendors(vendorList);

      // Fetch manager candidates in background so table is not delayed
      userService.getAll({ size: 200 }).then(res => {
        const p = res.data || res;
        const list = p.results || (Array.isArray(p) ? p : (p.data?.results || p.data || []));
        setAllSystemUsers(list);
      }).catch(() => {});

      const counts = payload.origin_counts || payload.data?.origin_counts || null;
      if (counts) {
        setOriginCounts({
          INTERNAL: counts.INTERNAL ?? counts.internal ?? 0,
          EXTERNAL: counts.EXTERNAL ?? counts.external ?? 0,
        });
      }

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
      console.error('Error fetching users/roles/vendors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(0, pagination.size);
  }, [selectedRoleFilter, activeTab]);

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

  const handleRemoveVendor = async (userId, vendorId) => {
    try {
      const res = await userService.removeVendor(userId, vendorId);
      const updatedUser = res.data;
      setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
      if (quickViewVendorUser && quickViewVendorUser.id === userId) {
        setQuickViewVendorUser(updatedUser);
      }
      setStatusMessage({ type: 'success', text: 'Vendor assignment removed successfully.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to remove vendor assignment.' });
    }
  };

  const roleOptions = useMemo(() => {
    const defaultLocal = ['ADMIN', 'PROJECT_MANAGER', 'ENGINEER', 'SUPERVISOR', 'OPERATOR', 'VENDOR', 'VIEWER', 'ALL_VIEWER'];
    const fetchedLocal = (roles || []).map(r => r.name || r.code).filter(Boolean);
    const fetchedIlync = (ilyncRoles || []).map(r => r.key || r.name || r.code).filter(Boolean);
    return Array.from(new Set([...defaultLocal, ...fetchedLocal, ...fetchedIlync]));
  }, [roles, ilyncRoles]);

  const filteredUsers = useMemo(() => {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}>
              <LucideUserCheck size={22} />
            </div>
            <div>
              <h1 className="page-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: '700' }}>Users Directory</h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {activeTab === 'Internal'
                  ? 'Manage internal users, enterprise access roles, and assigned scopes'
                  : 'Users synchronized from external partner APIs (iLync)'}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeTab === 'Internal' && (
            <button
              onClick={() => setCreateModalOpen(true)}
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
          )}

          {activeTab === 'External' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <LucideRefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing External Users...' : 'Sync External Users'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs Filter Row */}
      <div className="filter-row">
        {[
          { label: 'Internal', count: originCounts.INTERNAL },
          { label: 'External', count: originCounts.EXTERNAL },
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            className={`filter-chip ${activeTab === tab.label ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.label)}
            style={{ cursor: 'pointer', fontWeight: '600', padding: '6px 14px' }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '500',
            background: statusMessage.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: statusMessage.type === 'error' ? '#dc2626' : '#047857',
            border: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
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
                padding: '9px 34px 9px 38px',
                borderRadius: '8px',
                border: '1px solid var(--border-strong)',
                fontSize: '0.84rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <LucideSearch size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '11px' }} />
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
            <LucideSearch size={14} /> Search
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LucideFilter size={15} color="var(--text-muted)" />
          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Role:</span>
          <SearchableSelect
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-strong)',
              fontSize: '0.82rem',
              outline: 'none',
              background: '#ffffff',
              minWidth: '140px'
            }}
          >
            <option value="ALL">All Roles</option>
            {roleOptions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </SearchableSelect>
        </div>

        {/* Page Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Show:</span>
          <SearchableSelect
            value={pagination.size}
            onChange={(e) => {
              const newSize = e.target.value;
              fetchUsers(0, newSize);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-strong)',
              fontSize: '0.82rem',
              outline: 'none',
              background: '#ffffff',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <option value={20}>20 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value="all">All ({pagination.total || users.length})</option>
          </SearchableSelect>
        </div>
      </div>

      {/* Users Table */}
      <div className="table-container" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 16px' }}>User Details</th>
              <th style={{ padding: '12px 14px' }}>External ID</th>
              <th style={{ padding: '12px 14px' }}>HERO Role</th>
              <th style={{ padding: '12px 14px' }}>User Type</th>
              <th style={{ padding: '12px 14px' }}>Access Scope</th>
              <th style={{ padding: '12px 14px' }}>Reporting Manager</th>
              <th style={{ padding: '12px 16px' }}>Assigned Vendors</th>
              <th style={{ padding: '12px 14px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <LucideRefreshCw size={18} className="animate-spin" /> Loading HERO platform users...
                  </div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>👤</div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {search ? `No users matching "${search}"` : 'No users found in this tab'}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>
                    {activeTab === 'Internal'
                      ? 'Use "Add New User" above to create a new internal account.'
                      : 'Click "Sync External Users" to fetch users from external APIs.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => {
                const currentRole = (u.roles && u.roles.length > 0) ? u.roles[0] : (u.role || 'VIEWER');
                const extId = u.external_user_id || u.employee_id || u.id;
                const assignedVendors = Array.isArray(u.vendors) ? u.vendors : [];
                const isAdmin = u.is_superuser || currentRole.toUpperCase() === 'ADMIN';

                const fullName = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                const initials = fullName
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(p => p[0].toUpperCase())
                  .join('');

                return (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/users/${u.id}`)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                      cursor: 'pointer'
                    }}
                    title="Click row to view user details"
                  >
                    {/* User Details */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: '#111827',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            flexShrink: 0
                          }}
                        >
                          {initials || <LucideUserCheck size={16} />}
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: '600',
                              color: 'var(--text-primary)',
                              fontSize: '0.86rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>{fullName}</span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {u.email || `@${u.username}`}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* External ID */}
                    <td style={{ padding: '12px 14px' }}>
                      <code style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: '600' }}>
                        {extId}
                      </code>
                    </td>

                    {/* HERO Role */}
                    <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                      <SearchableSelect
                        value={currentRole}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #111827',
                          background: '#111827',
                          color: '#ffffff',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        {roleOptions.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </SearchableSelect>
                    </td>

                    {/* User Type */}
                    <td style={{ padding: '12px 14px' }}>
                      {u.user_type === 'ADVANCE' ? (
                        <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 7px', borderRadius: '4px', fontWeight: '700' }}>
                          Advance
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', padding: '2px 7px', borderRadius: '4px', fontWeight: '600' }}>
                          Normal
                        </span>
                      )}
                    </td>

                    {/* Access Scope */}
                    <td style={{ padding: '12px 14px' }}>
                      {u.user_type === 'ADVANCE' ? (
                        <div style={{ fontSize: '0.76rem', color: '#1e293b', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '6px' }}>
                          <LucideMapPin size={12} color="#2563eb" />
                          <span>{u.advance_scope_display || u.advance_scope_type || 'Advance'}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Reporting Manager */}
                    <td style={{ padding: '12px 14px' }}>
                      {u.reporting_manager_name ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', background: 'var(--bg-subtle)', color: 'var(--text-primary)', padding: '2px 8px', borderRadius: '6px', fontWeight: '600', border: '1px solid var(--border)' }}>
                          <span>👔</span> {u.reporting_manager_name}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No Manager
                        </span>
                      )}
                    </td>

                    {/* Assigned Vendors Scope - Compact Summary (Requirement 1 & 4) */}
                    <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <span style={{ fontSize: '0.74rem', background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '3px 8px', borderRadius: '4px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🌐 All Vendors (Admin)
                        </span>
                      ) : assignedVendors.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setQuickViewVendorUser(u)}
                          style={{
                            background: '#ecfdf5',
                            color: '#047857',
                            border: '1px solid #a7f3d0',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s ease'
                          }}
                          title="Click to view all assigned vendors"
                        >
                          <LucideBuilding size={13} />
                          <span>{assignedVendors.length} {assignedVendors.length === 1 ? 'Vendor' : 'Vendors'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssignModalUser(u)}
                          style={{
                            fontSize: '0.72rem',
                            color: '#dc2626',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Click to assign vendor"
                        >
                          <span>⚠️ No Vendor Assigned</span>
                        </button>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleStatusToggle(u)}
                        style={{
                          border: 'none',
                          background: u.is_active ? '#ecfdf5' : '#fef2f2',
                          color: u.is_active ? '#047857' : '#dc2626',
                          padding: '3px 9px',
                          borderRadius: '12px',
                          fontSize: '0.74rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: `1px solid ${u.is_active ? '#a7f3d0' : '#fecaca'}`
                        }}
                      >
                        {u.is_active ? <LucideCheckCircle2 size={12} /> : <LucideXCircle size={12} />}
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => navigate(`/users/${u.id}`)}
                          style={{
                            background: '#f3f4f6',
                            color: '#111827',
                            border: '1px solid var(--border)',
                            padding: '4px 9px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="View dedicated user details page"
                        >
                          <LucideEye size={13} /> View
                        </button>

                        <button
                          onClick={() => setEditUser(u)}
                          style={{
                            background: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                            padding: '4px 9px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Edit user details"
                        >
                          <LucideEdit3 size={13} /> Edit
                        </button>

                        <button
                          onClick={() => setInspectUser(u)}
                          style={{
                            background: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            padding: '4px 9px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="View user permissions"
                        >
                          <LucideShield size={13} /> Perms
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '12px 16px',
            background: 'var(--bg-surface)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            fontSize: '0.82rem'
          }}
        >
          <div style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>
            Showing <strong>{filteredUsers.length}</strong> of <strong>{pagination.total}</strong> Total Users
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
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  background: pagination.page <= 0 ? 'var(--bg-subtle)' : '#ffffff',
                  color: pagination.page <= 0 ? 'var(--text-muted)' : 'var(--text-primary)',
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
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  background: pagination.page <= 0 ? 'var(--bg-subtle)' : '#ffffff',
                  color: pagination.page <= 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                  cursor: pagination.page <= 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                ◀ Prev
              </button>

              <span style={{ padding: '0 8px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Page {pagination.page + 1} / {pagination.total_pages}
              </span>

              <button
                disabled={pagination.page >= pagination.total_pages - 1}
                onClick={() => fetchUsers(pagination.page + 1, pagination.size)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  background: pagination.page >= pagination.total_pages - 1 ? 'var(--bg-subtle)' : '#ffffff',
                  color: pagination.page >= pagination.total_pages - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
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
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  background: pagination.page >= pagination.total_pages - 1 ? 'var(--bg-subtle)' : '#ffffff',
                  color: pagination.page >= pagination.total_pages - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
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

      {/* Reusable Modals */}
      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={(newUser, msg) => {
          setStatusMessage({ type: 'success', text: msg || 'User created successfully!' });
          fetchUsers(0, pagination.size);
        }}
        systemVendors={systemVendors}
        allSystemUsers={allSystemUsers}
        roleOptions={roleOptions}
      />

      <UserEditModal
        isOpen={!!editUser}
        user={editUser}
        onClose={() => setEditUser(null)}
        onSuccess={(updatedUser, msg) => {
          setUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
          setStatusMessage({ type: 'success', text: msg || 'User updated successfully!' });
          fetchUsers(pagination.page, pagination.size);
        }}
        systemVendors={systemVendors}
        allSystemUsers={allSystemUsers}
        roleOptions={roleOptions}
      />

      <UserPermissionsModal
        isOpen={!!inspectUser}
        user={inspectUser}
        onClose={() => setInspectUser(null)}
      />

      <AssignVendorModal
        isOpen={!!assignModalUser}
        user={assignModalUser}
        onClose={() => setAssignModalUser(null)}
        onSuccess={(updatedUser, msg) => {
          setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
          setStatusMessage({ type: 'success', text: msg || 'Vendor assigned successfully!' });
          fetchUsers(pagination.page, pagination.size);
        }}
        systemVendors={systemVendors}
      />

      <UserVendorsQuickViewModal
        isOpen={!!quickViewVendorUser}
        user={quickViewVendorUser}
        onClose={() => setQuickViewVendorUser(null)}
        onRemoveVendor={handleRemoveVendor}
        onOpenAssignModal={(u) => setAssignModalUser(u)}
      />
    </div>
  );
};
