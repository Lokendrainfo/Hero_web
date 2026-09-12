import React, { useEffect, useState } from 'react';
import { roleService } from '../../services/roleService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideShieldCheck, LucidePlus, LucideEdit, LucideTrash2, LucideUsers,
  LucideCheck, LucideAlertCircle, LucideShield, LucideLock, LucideExternalLink, LucideRefreshCw
} from 'lucide-react';

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
  const [selectedPermIds, setSelectedPermIds] = useState([]);
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
    setSelectedPermIds([]);
    setModalOpen(true);
  };

  const handleOpenEditModal = (role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || '');
    const currentPermIds = (role.permissions_details || []).map(p => p.id);
    setSelectedPermIds(currentPermIds);
    setModalOpen(true);
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

  const groupedPermissions = permissions.reduce((acc, p) => {
    const cat = p.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LucideShieldCheck size={24} color="#0a2d23" />
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: '#111827' }}>
              Roles & Permissions Configuration
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
            Define local HERO access roles and inspect external enterprise portal roles
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <LucidePlus size={16} /> Create Custom Role
        </button>
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

      {/* Tabs Bar */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e5e7eb', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('LOCAL')}
          style={{
            padding: '8px 16px',
            fontSize: '0.85rem',
            fontWeight: '700',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'LOCAL' ? '3px solid #0a2d23' : '3px solid transparent',
            color: activeTab === 'LOCAL' ? '#0a2d23' : '#6b7280',
            cursor: 'pointer'
          }}
        >
          Local HERO Roles ({roles.length})
        </button>

        <button
          onClick={() => setActiveTab('ILYNC')}
          style={{
            padding: '8px 16px',
            fontSize: '0.85rem',
            fontWeight: '700',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'ILYNC' ? '3px solid #0a2d23' : '3px solid transparent',
            color: activeTab === 'ILYNC' ? '#0a2d23' : '#6b7280',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <LucideExternalLink size={14} /> External ILYNC Enterprise Roles ({ilyncRoles.length})
        </button>
      </div>

      {/* Local HERO Roles View */}
      {activeTab === 'LOCAL' && (
        loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Fetching HERO roles and permission mappings...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
            width: '100%'
          }}>
            {roles.map(r => (
              <div key={r.id} className="app-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.68rem', background: '#0a2d23', color: '#6ee7b7', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>
                        {r.code || r.name}
                      </span>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginTop: '6px' }}>
                        {r.name}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {r.is_system ? (
                        <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <LucideLock size={10} /> System Critical
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', background: '#f3f4f6', color: '#4b5563', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                          Custom
                        </span>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '8px', minHeight: '36px' }}>
                    {r.description || 'Custom role with configured permission set.'}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', padding: '8px 12px', background: '#f9fafb', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.78rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LucideUsers size={14} color="#0a2d23" />
                      <strong>{r.user_count || 0}</strong> user(s) assigned
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LucideShield size={14} color="#2563eb" />
                      <strong>{(r.permission_codes || r.permissions_details || []).length}</strong> permissions
                    </div>
                  </div>

                  {/* Permissions tags sample */}
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '80px', overflowY: 'auto' }}>
                    {(r.permission_codes || (r.permissions_details || []).map(p => p.code)).map(code => (
                      <span key={code} style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px' }}>
                        {code}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                  <button
                    onClick={() => handleOpenEditModal(r)}
                    style={{
                      background: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <LucideEdit size={14} /> Edit Permissions
                  </button>

                  {!r.is_system && (
                    <button
                      onClick={() => handleDeleteRole(r)}
                      style={{
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <LucideTrash2 size={14} /> Delete
                    </button>
                  )}
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
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <form
            onSubmit={handleSaveRole}
            className="app-card"
            style={{ width: '100%', maxWidth: '640px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827' }}>
                {editingRole ? `Edit Role: ${editingRole.name}` : 'Create New Custom Role'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <LucideEdit size={14} color="#059669" />
                  Role Name (Editable)
                </label>
                <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Click field below to edit name</span>
              </div>
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                required
                placeholder="e.g. SITE_SUPERVISOR or AUDITOR"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  color: '#111827',
                  fontWeight: '600'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                Description
              </label>
              <textarea
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of privileges granted by this role..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#111827', marginBottom: '10px' }}>
                Assign Module Permissions ({selectedPermIds.length} selected):
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '340px', overflowY: 'auto', paddingRight: '6px' }}>
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', background: '#fafafa' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0a2d23', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {category}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                      {perms.map(p => {
                        const isChecked = selectedPermIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '0.78rem',
                              color: isChecked ? '#111827' : '#4b5563',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              background: isChecked ? '#e0f2fe' : 'transparent'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePermission(p.id)}
                            />
                            <span>{p.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '8px 20px', fontSize: '0.82rem' }}
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
