import React, { useEffect, useState, useMemo } from 'react';
import { roleService } from '../../services/roleService';
import { useAuth } from '../../hooks/useAuth';
import { roleBadgeClass } from '../../utils/roleBadge';
import {
  LucideShieldCheck, LucidePlus, LucideEdit, LucideTrash2, LucideUsers,
  LucideCheck, LucideAlertCircle, LucideShield, LucideLock, LucideExternalLink,
  LucideRefreshCw, LucideCopy, LucideSearch, LucidePower, LucideChevronDown, LucideChevronRight,
  LucideGlobe, LucideLayers, LucideBuilding, LucideUserCheck, LucideCheckCircle, LucideXCircle
} from 'lucide-react';

const DATA_SCOPES = [
  { code: 'ALL_DATA', label: 'All System Data (Unrestricted)', desc: 'Full access to records across all vendors, regions, and users' },
  { code: 'OWN_DATA', label: 'Own Data Only', desc: 'Access restricted strictly to records created by or owned by the logged-in user' },
  { code: 'OWN_VENDOR', label: 'Own Vendor Fleet & Team', desc: 'Access isolated to records belonging to user assigned vendors' },
  { code: 'OWN_TEAM', label: 'Own Direct Team Roster', desc: 'Access limited to assigned team members and operators' },
  { code: 'OWN_TASKS', label: 'Assigned Work Tasks', desc: 'Access restricted to work tasks directly assigned to operator/user' },
  { code: 'OWN_GEOGRAPHY', label: 'Assigned Geography (Circle/District/Block)', desc: 'Access scoped to assigned Circle, District, or Block geography' },
  { code: 'REPORTING_HIERARCHY', label: 'Reporting Hierarchy (Direct & Subordinates)', desc: 'Access scoped recursively to user and all direct/indirect reporting subordinates' },
];

export const Roles = () => {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('LOCAL'); // 'LOCAL' or 'ILYNC'
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [ilyncRoles, setIlyncRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ilyncLoading, setIlyncLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  
  // Form State
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleIsActive, setRoleIsActive] = useState(true);
  const [roleDataScope, setRoleDataScope] = useState('ALL_DATA');
  const [selectedPermIds, setSelectedPermIds] = useState([]);
  const [permSearchQuery, setPermSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [statusMessage, setStatusMessage] = useState(null);

  const fetchRolesAndPermissions = async () => {
    setLoading(true);
    try {
      const [roleRes, permRes] = await Promise.all([
        roleService.getRoles(),
        roleService.getPermissions()
      ]);
      const roleList = Array.isArray(roleRes.data) ? roleRes.data : (roleRes.results || roleRes || []);
      const permList = Array.isArray(permRes.data) ? permRes.data : (permRes.results || permRes || []);
      
      setRoles(roleList);
      setPermissions(permList);
    } catch (err) {
      console.error("Error fetching roles/permissions:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIlyncRoles = async () => {
    setIlyncLoading(true);
    try {
      const res = await roleService.getIlyncRoles();
      const list = Array.isArray(res.data) ? res.data : (res.results || res || []);
      setIlyncRoles(list);
    } catch (err) {
      console.error("Error fetching ILYNC enterprise roles:", err);
    } finally {
      setIlyncLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesAndPermissions();
    fetchIlyncRoles();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setRoleIsActive(true);
    setRoleDataScope('ALL_DATA');
    setSelectedPermIds([]);
    setPermSearchQuery('');
    setCollapsedCategories({});
    setModalOpen(true);
  };

  const handleOpenEditModal = (role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || '');
    setRoleIsActive(role.is_active !== undefined ? role.is_active : true);
    setRoleDataScope(role.data_scope || 'ALL_DATA');
    const currentPermIds = (role.permissions_details || []).map(p => p.id);
    setSelectedPermIds(currentPermIds);
    setPermSearchQuery('');
    setCollapsedCategories({});
    setModalOpen(true);
  };

  const handleDuplicateRole = async (role) => {
    try {
      const res = await roleService.duplicateRole(role.id, {
        name: `Copy of ${role.name}`,
        code: `COPY_${role.code}`
      });
      setStatusMessage({ type: 'success', text: res.message || `Role '${role.name}' duplicated successfully.` });
      fetchRolesAndPermissions();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to duplicate role.';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleToggleActive = async (role) => {
    try {
      const res = await roleService.toggleRoleActive(role.id);
      setStatusMessage({ type: 'success', text: res.message || `Role status updated.` });
      fetchRolesAndPermissions();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to toggle status.';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleTogglePermission = (permId) => {
    setSelectedPermIds(prev => 
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    );
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const payload = {
        name: roleName,
        description: roleDescription,
        is_active: roleIsActive,
        data_scope: roleDataScope,
        permission_ids: selectedPermIds
      };

      if (editingRole) {
        await roleService.updateRole(editingRole.id, payload);
        setStatusMessage({ type: 'success', text: `Role '${roleName}' updated successfully.` });
      } else {
        await roleService.createRole(payload);
        setStatusMessage({ type: 'success', text: `New role '${roleName}' created successfully.` });
      }
      setModalOpen(false);
      fetchRolesAndPermissions();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to save role.';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteRole = async (role) => {
    if (role.is_system) {
      setStatusMessage({ type: 'error', text: `System-critical role '${role.name}' cannot be deleted.` });
      return;
    }
    if (role.user_count > 0) {
      setStatusMessage({ type: 'error', text: `Cannot delete role '${role.name}' because ${role.user_count} user(s) are assigned to it.` });
      return;
    }

    if (window.confirm(`Are you sure you want to delete role '${role.name}'?`)) {
      try {
        await roleService.deleteRole(role.id);
        setStatusMessage({ type: 'success', text: `Role '${role.name}' deleted.` });
        fetchRolesAndPermissions();
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Failed to delete role.';
        setStatusMessage({ type: 'error', text: msg });
      }
    }
  };

  // Filter & Group Permissions
  const filteredPermissions = useMemo(() => {
    if (!permSearchQuery.trim()) return permissions;
    const q = permSearchQuery.toLowerCase();
    return permissions.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }, [permissions, permSearchQuery]);

  const groupedPermissions = useMemo(() => {
    return filteredPermissions.reduce((acc, p) => {
      const cat = p.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});
  }, [filteredPermissions]);

  const handleSelectAll = () => {
    const allFilteredIds = filteredPermissions.map(p => p.id);
    setSelectedPermIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
  };

  const handleDeselectAll = () => {
    const allFilteredIds = new Set(filteredPermissions.map(p => p.id));
    setSelectedPermIds(prev => prev.filter(id => !allFilteredIds.has(id)));
  };

  const handleToggleCategory = (perms) => {
    const catIds = perms.map(p => p.id);
    const allChecked = catIds.every(id => selectedPermIds.includes(id));
    if (allChecked) {
      setSelectedPermIds(prev => prev.filter(id => !catIds.includes(id)));
    } else {
      setSelectedPermIds(prev => Array.from(new Set([...prev, ...catIds])));
    }
  };

  const toggleCategoryCollapse = (cat) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Role & RBAC Access Control</h1>
          <p className="page-subtitle">Manage system role permissions, data scopes, active statuses, and enterprise access privileges</p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <LucidePlus size={16} /> Create Role
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: statusMessage.type === 'error' ? '#fef2f2' : '#ecfdf5',
          color: statusMessage.type === 'error' ? '#dc2626' : '#047857',
          border: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : '#a7f3d0'}`
        }}>
          {statusMessage.type === 'error' ? <LucideAlertCircle size={16} /> : <LucideCheckCircle size={16} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-item ${activeTab === 'LOCAL' ? 'active' : ''}`}
          onClick={() => setActiveTab('LOCAL')}
        >
          <LucideShield size={14} /> System Roles ({roles.length})
        </button>
        <button
          type="button"
          className={`tab-item ${activeTab === 'ILYNC' ? 'active' : ''}`}
          onClick={() => setActiveTab('ILYNC')}
        >
          <LucideExternalLink size={14} /> ILYNC Enterprise Roles ({ilyncRoles.length})
        </button>
      </div>

      {/* Local HERO Roles View */}
      {activeTab === 'LOCAL' && (
        loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Fetching HERO roles, data scopes, and permission matrix...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '16px',
            width: '100%'
          }}>
            {roles.map(r => (
              <div key={r.id} className="app-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: r.is_active === false ? 0.7 : 1 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`badge-pill ${roleBadgeClass(r.code || r.name)}`}>
                          {r.code || r.name}
                        </span>
                        {r.is_active === false ? (
                          <span className="badge-pill badge-neutral" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            <LucideXCircle size={10} /> Inactive
                          </span>
                        ) : (
                          <span className="badge-pill badge-emerald" style={{ background: '#dcfce7', color: '#15803d' }}>
                            <LucideCheckCircle size={10} /> Active
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginTop: '6px' }}>
                        {r.name}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {r.is_system ? (
                        <span className="badge-pill badge-amber">
                          <LucideLock size={10} /> System
                        </span>
                      ) : (
                        <span className="badge-pill badge-neutral">Custom</span>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '8px', minHeight: '36px' }}>
                    {r.description || 'Custom role with configured permission set.'}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.76rem', color: '#334155' }}>
                      <LucideGlobe size={13} color="#2563eb" />
                      <span>Data Scope: <strong style={{ color: '#0f172a' }}>{r.data_scope || 'ALL_DATA'}</strong></span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 10px', background: '#f8fafc', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.76rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <LucideUsers size={13} color="#0f172a" />
                        <strong>{r.user_count || 0}</strong> assigned user(s)
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <LucideShield size={13} color="#16a34a" />
                        <strong>{(r.permission_codes || r.permissions_details || []).length}</strong> permissions
                      </div>
                    </div>
                  </div>

                  {/* Permissions tags preview */}
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '76px', overflowY: 'auto' }}>
                    {(r.permission_codes || (r.permissions_details || []).map(p => p.code)).map(code => (
                      <span key={code} className="badge-pill badge-neutral" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                        {code}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => handleToggleActive(r)}
                    style={{
                      background: r.is_active ? '#fef2f2' : '#f0fdf4',
                      color: r.is_active ? '#b91c1c' : '#15803d',
                      border: `1px solid ${r.is_active ? '#fecaca' : '#bbf7d0'}`,
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={r.is_active ? "Deactivate role" : "Activate role"}
                  >
                    <LucidePower size={13} /> {r.is_active ? 'Deactivate' : 'Activate'}
                  </button>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleDuplicateRole(r)}
                      style={{
                        background: '#f8fafc',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Duplicate role"
                    >
                      <LucideCopy size={13} /> Duplicate
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(r)}
                      style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <LucideEdit size={13} /> Edit Role
                    </button>

                    {!r.is_system && (
                      <button
                        onClick={() => handleDeleteRole(r)}
                        style={{
                          background: '#fff1f2',
                          color: '#e11d48',
                          border: '1px solid #fecdd3',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                        title="Delete custom role"
                      >
                        <LucideTrash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* External ILYNC Enterprise Roles View */}
      {activeTab === 'ILYNC' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>
              Fetched live from external portal (<code style={{ color: '#047857' }}>dev.ilync.tech/api/enterprise/roles</code>). External roles determine identity level in ILYNC.
            </span>
            <button
              onClick={fetchIlyncRoles}
              style={{ padding: '6px 12px', fontSize: '0.78rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LucideRefreshCw size={13} className={ilyncLoading ? 'animate-spin' : ''} /> Refresh ILYNC Roles
            </button>
          </div>

          {ilyncLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              Fetching external ILYNC enterprise roles...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {ilyncRoles.map(ir => (
                <div key={ir.id} className="app-card" style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>
                      {ir.key}
                    </span>
                    {ir.isSystem && (
                      <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px' }}>
                        System
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', marginTop: '6px' }}>
                    {ir.name}
                  </h3>

                  <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '4px' }}>
                    {ir.description || 'Enterprise role in external ILYNC portal.'}
                  </p>

                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', marginBottom: '4px' }}>
                      External Privileges ({(ir.privileges || []).length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                      {(ir.privileges || []).map(p => (
                        <span key={p} style={{ fontSize: '0.65rem', background: '#f3f4f6', color: '#4b5563', padding: '1px 5px', borderRadius: '3px' }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Role Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <form
            onSubmit={handleSaveRole}
            className="app-card"
            style={{
              width: '100%',
              maxWidth: '860px',
              padding: '24px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '12px',
              background: '#ffffff',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              boxSizing: 'border-box'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                  {editingRole ? `Edit Role: ${editingRole.name}` : 'Create New Custom Role'}
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px', margin: 0 }}>
                  Configure role name, active state, data scope access, and module permissions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content Body */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', marginBottom: '16px' }}>
              {/* Inputs Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <LucideEdit size={14} color="#0284c7" /> Role Name
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    required
                    placeholder="e.g. REGIONAL_SUPERVISOR"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                      fontWeight: '600',
                      color: '#0f172a'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <LucideGlobe size={14} color="#16a34a" /> Data Scope Access
                  </label>
                  <select
                    value={roleDataScope}
                    onChange={(e) => setRoleDataScope(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                      fontWeight: '600',
                      color: '#0f172a',
                      background: '#ffffff'
                    }}
                  >
                    {DATA_SCOPES.map(ds => (
                      <option key={ds.code} value={ds.code}>{ds.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                  Description
                </label>
                <textarea
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  rows={2}
                  placeholder="Brief summary of duties and permissions granted by this role..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', color: '#0f172a' }}>
                  <input
                    type="checkbox"
                    checked={roleIsActive}
                    onChange={(e) => setRoleIsActive(e.target.checked)}
                  />
                  Role Active Status
                </label>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  (Inactive roles cannot be assigned to new users and will block logged-in privileges)
                </span>
              </div>

              {/* Permission Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#0f172a' }}>
                    Assign Module Permissions ({selectedPermIds.length} of {permissions.length} selected):
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '4px', border: '1px solid #10b981', background: '#ecfdf5', color: '#047857', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Select All Filtered
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Deselect All Filtered
                    </button>
                  </div>
                </div>

                {/* Permission Search Input */}
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <LucideSearch size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={permSearchQuery}
                    onChange={(e) => setPermSearchQuery(e.target.value)}
                    placeholder="Search permissions by code, name, or module category..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Module Cards List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.entries(groupedPermissions).map(([category, perms]) => {
                    const catIds = perms.map(p => p.id);
                    const isCatAllSelected = catIds.every(id => selectedPermIds.includes(id));
                    const selectedCountInCat = catIds.filter(id => selectedPermIds.includes(id)).length;
                    
                    // If user is searching, expand category automatically; otherwise check collapsedCategories state (default collapsed)
                    const isSearching = !!permSearchQuery.trim();
                    const isCollapsed = isSearching ? false : (collapsedCategories[category] !== false);

                    return (
                      <div key={category} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
                        <div
                          style={{
                            display: 'flex',
                            justify: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            background: selectedCountInCat > 0 ? '#f0f9ff' : '#f8fafc',
                            borderBottom: isCollapsed ? 'none' : '1px solid #e2e8f0',
                            borderRadius: isCollapsed ? '8px' : '8px 8px 0 0',
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                          onClick={() => toggleCategoryCollapse(category)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isCollapsed ? <LucideChevronRight size={16} color="#64748b" /> : <LucideChevronDown size={16} color="#0284c7" />}
                            <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {category}
                            </span>
                            <span style={{
                              fontSize: '0.74rem',
                              background: selectedCountInCat > 0 ? '#bae6fd' : '#e2e8f0',
                              color: selectedCountInCat > 0 ? '#0369a1' : '#334155',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontWeight: '700'
                            }}>
                              {selectedCountInCat} of {perms.length} selected
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCategory(perms);
                            }}
                            style={{ fontSize: '0.74rem', color: isCatAllSelected ? '#e11d48' : '#0284c7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                          >
                            {isCatAllSelected ? 'Deselect Category' : 'Select Category'}
                          </button>
                        </div>

                        {!isCollapsed && (
                          <div style={{
                            padding: '14px 16px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                            gap: '10px',
                            background: '#fafafa',
                            borderRadius: '0 0 8px 8px'
                          }}>
                            {perms.map(p => {
                              const isChecked = selectedPermIds.includes(p.id);
                              return (
                                <label
                                  key={p.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    fontSize: '0.8rem',
                                    color: isChecked ? '#0f172a' : '#475569',
                                    cursor: 'pointer',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: isChecked ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                    background: isChecked ? '#eff6ff' : '#ffffff',
                                    boxSizing: 'border-box',
                                    lineHeight: '1.3'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleTogglePermission(p.id)}
                                    style={{ width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }}
                                  />
                                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                    <span style={{ fontWeight: isChecked ? '600' : '500', color: isChecked ? '#1e40af' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {p.name}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{p.code}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', cursor: 'pointer', fontWeight: '500' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '8px 24px', fontSize: '0.82rem', fontWeight: '600' }}
              >
                Save Role & Permissions
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
