import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { userService } from '../../services/userService';
import { roleService } from '../../services/roleService';
import { vendorService } from '../../services/vendorService';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { roleBadgeClass } from '../../utils/roleBadge';
import { formatDisplayDate, getFormattedDateTime } from '../../utils/dateUtils';
import { UserEditModal } from './components/UserEditModal';
import { UserPermissionsModal } from './components/UserPermissionsModal';
import { AssignVendorModal } from './components/AssignVendorModal';

import {
  LucideArrowLeft,
  LucideEdit3,
  LucideShield,
  LucideUser,
  LucideMail,
  LucidePhone,
  LucideBuilding,
  LucideMapPin,
  LucideCalendar,
  LucideCheckCircle2,
  LucideXCircle,
  LucideKey,
  LucideUsers,
  LucideLayers,
  LucideTrash2,
  LucidePlus,
  LucidePower,
  LucideInfo,
  LucideExternalLink
} from 'lucide-react';

export const UserDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState(null);

  // Modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [assignVendorModalOpen, setAssignVendorModalOpen] = useState(false);

  // System master data for edit/assign modals
  const [systemVendors, setSystemVendors] = useState([]);
  const [allSystemUsers, setAllSystemUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [ilyncRoles, setIlyncRoles] = useState([]);

  // Fetch user data
  const loadUserData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [userRes, vendorRes, roleRes] = await Promise.all([
        userService.getById(id),
        vendorService.getIntegrationsVendors({ size: 100 }).catch(() => vendorService.getVendors({ page: 0, size: 100 }).catch(() => ({ data: [] }))),
        roleService.getRoles().catch(() => ({ data: [] }))
      ]);

      const userData = (userRes && userRes.data && userRes.data.id) ? userRes.data : userRes;
      setUser(userData);

      const vPayload = vendorRes.data?.data || vendorRes.data || vendorRes;
      const vendorList = vPayload.results || vPayload.content || vPayload.vendors || (Array.isArray(vPayload) ? vPayload : []);
      setSystemVendors(vendorList);

      const roleList = Array.isArray(roleRes.data) ? roleRes.data : (roleRes.results || roleRes || []);
      setRoles(roleList);

      // Fetch manager candidates in background
      userService.getAll({ size: 200 }).then(res => {
        const p = res.data || res;
        const list = p.results || (Array.isArray(p) ? p : (p.data?.results || p.data || []));
        setAllSystemUsers(list);
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to load user details:', err);
      setStatusMessage({ type: 'error', text: 'Failed to load user details from server.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadUserData();
    }
  }, [id]);

  const roleOptions = React.useMemo(() => {
    const defaultLocal = ['ADMIN', 'PROJECT_MANAGER', 'ENGINEER', 'SUPERVISOR', 'OPERATOR', 'VENDOR', 'VIEWER', 'ALL_VIEWER'];
    const fetchedLocal = (roles || []).map(r => r.name || r.code).filter(Boolean);
    const fetchedIlync = (ilyncRoles || []).map(r => r.key || r.name || r.code).filter(Boolean);
    return Array.from(new Set([...defaultLocal, ...fetchedLocal, ...fetchedIlync]));
  }, [roles, ilyncRoles]);

  // Handle status toggle
  const handleToggleStatus = async () => {
    if (!user) return;
    const nextStatus = !user.is_active;
    try {
      await userService.updateRole(user.id, { is_active: nextStatus });
      setUser(prev => ({ ...prev, is_active: nextStatus }));
      setStatusMessage({
        type: 'success',
        text: `User account has been ${nextStatus ? 'activated' : 'deactivated'}.`
      });
    } catch (err) {
      console.error('Failed to update status:', err);
      setStatusMessage({ type: 'error', text: 'Failed to update user status.' });
    }
  };

  // Handle removing a vendor assignment
  const handleRemoveVendor = async (vendorId) => {
    if (!user) return;
    try {
      const res = await userService.removeVendor(user.id, vendorId);
      const updatedUser = res.data;
      setUser(prev => ({
        ...prev,
        vendors: prev.vendors ? prev.vendors.filter(v => (v.id !== vendorId && v.external_vendor_id !== vendorId)) : []
      }));
      setStatusMessage({ type: 'success', text: 'Vendor assignment removed successfully.' });
    } catch (err) {
      console.error('Failed to remove vendor:', err);
      setStatusMessage({ type: 'error', text: 'Failed to remove vendor assignment.' });
    }
  };

  if (loading) {
    return <LoadingSpinner title="Loading User Details..." subtitle="Retrieving profile, roles, and vendor scope" />;
  }

  if (!user) {
    return (
      <div style={{ padding: '32px 16px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <div className="app-card" style={{ padding: '40px 24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            User Not Found
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
            The requested user could not be found or has been removed.
          </p>
          <button
            onClick={() => navigate('/users')}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 18px' }}
          >
            <LucideArrowLeft size={16} /> Back to Users
          </button>
        </div>
      </div>
    );
  }

  const assignedVendors = Array.isArray(user.vendors) ? user.vendors : [];
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const directReports = Array.isArray(user.direct_reports) ? user.direct_reports : [];
  const isAdmin = user.is_superuser || (user.role && user.role.toUpperCase() === 'ADMIN');

  // Compute initials
  const displayName = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Top Navigation & Breadcrumb Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('/users')}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 12px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucideArrowLeft size={16} /> Back to Users
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <Link to="/users" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: '500' }}>
              Users
            </Link>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{displayName}</span>
          </div>
        </div>

        {/* Top Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setPermissionsModalOpen(true)}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucideShield size={15} color="#4b5563" /> Permissions
          </button>

          <button
            onClick={() => setEditModalOpen(true)}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px', fontSize: '0.82rem', fontWeight: '600' }}
          >
            <LucideEdit3 size={15} /> Edit User
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '500',
            background: statusMessage.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: statusMessage.type === 'error' ? '#dc2626' : '#047857',
            border: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
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

      {/* Hero Profile Banner Card */}
      <div
        className="app-card"
        style={{
          padding: '24px',
          background: 'var(--bg-surface)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #111827 0%, #374151 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: '700',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              flexShrink: 0
            }}
          >
            {initials || <LucideUser size={30} />}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                {displayName}
              </h1>

              <span className={`badge-pill ${roleBadgeClass(user.role || 'VIEWER')}`} style={{ fontSize: '0.78rem', padding: '3px 10px' }}>
                {user.role || 'VIEWER'}
              </span>

              {user.user_type === 'ADVANCE' ? (
                <span style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>
                  Advance User
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                  Normal User
                </span>
              )}

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: '600',
                  background: user.is_active ? '#ecfdf5' : '#fef2f2',
                  color: user.is_active ? '#047857' : '#dc2626',
                  border: `1px solid ${user.is_active ? '#a7f3d0' : '#fecaca'}`
                }}
              >
                {user.is_active ? <LucideCheckCircle2 size={12} /> : <LucideXCircle size={12} />}
                {user.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <span>@{user.username}</span>
              {user.email && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <LucideMail size={14} /> {user.email}
                </span>
              )}
              {user.phone_number && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <LucidePhone size={14} /> {user.phone_number}
                </span>
              )}
              {(user.external_user_id || user.employee_id) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <LucideKey size={14} /> ID: <code style={{ color: '#047857', fontWeight: '600' }}>{user.external_user_id || user.employee_id}</code>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick status switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleToggleStatus}
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              height: '34px',
              color: user.is_active ? '#dc2626' : '#059669',
              borderColor: user.is_active ? '#fecaca' : '#a7f3d0'
            }}
          >
            <LucidePower size={14} />
            {user.is_active ? 'Deactivate User' : 'Activate User'}
          </button>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* Section 1: User Profile */}
        <div className="app-card" style={{ padding: '20px', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <LucideUser size={18} color="#2563eb" />
            <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              User Profile
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Full Name</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{displayName}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Username</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.username}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Email Address</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.email || '—'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Phone / Mobile</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.phone_number || '—'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Employee ID</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.employee_id || '—'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>External User ID</span>
              <span>
                {user.external_user_id ? (
                  <code style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: '600' }}>
                    {user.external_user_id}
                  </code>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>— (Local HERO User)</span>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>User Type</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {user.user_type === 'ADVANCE' ? 'Advance' : 'Normal'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status</span>
              <span style={{ fontWeight: '600', color: user.is_active ? '#059669' : '#dc2626' }}>
                {user.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Date Joined</span>
              <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                {user.date_joined ? getFormattedDateTime(user.date_joined) : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Role and Access */}
        <div className="app-card" style={{ padding: '20px', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LucideShield size={18} color="#059669" />
              <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Role & Access Scope
              </h2>
            </div>
            <button
              onClick={() => setPermissionsModalOpen(true)}
              className="btn-secondary"
              style={{ fontSize: '0.75rem', height: '28px', padding: '0 8px' }}
            >
              Inspect Permissions
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>HERO Role</span>
              <span className={`badge-pill ${roleBadgeClass(user.role || 'VIEWER')}`} style={{ fontSize: '0.78rem', padding: '2px 10px' }}>
                {user.role || 'VIEWER'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Geographical Access Scope</span>
              <div>
                {user.user_type === 'ADVANCE' ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600' }}>
                    <LucideMapPin size={13} />
                    {user.advance_scope_display || user.advance_scope_type || 'Advance Scope'}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Global / Standard (Normal)</span>
                )}
              </div>
            </div>

            {user.user_type === 'ADVANCE' && (
              <div style={{ background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Selected Circle:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{user.selected_circle_name || user.selected_circle?.name || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Selected District:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{user.selected_district_name || user.selected_district?.name || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Selected Block:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{user.selected_block_name || user.selected_block?.name || '—'}</strong>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reporting Manager</span>
              <div>
                {user.reporting_manager_name ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-subtle)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600' }}>
                    <span>👔</span> {user.reporting_manager_name}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No Manager Assigned</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Direct Reports</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {directReports.length} {directReports.length === 1 ? 'member' : 'members'}
              </span>
            </div>

            {directReports.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                {directReports.map(rep => (
                  <Link
                    key={rep.id}
                    to={`/users/${rep.id}`}
                    style={{
                      textDecoration: 'none',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      color: '#1e293b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>👤</span> {rep.name || rep.username} ({rep.role || 'Member'})
                  </Link>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Inherited Permissions</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {permissions.length} Granted
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Assigned Vendors Scope */}
      <div className="app-card" style={{ padding: '20px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LucideBuilding size={20} color="#059669" />
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Assigned Vendors Scope
            </h2>
            <span style={{ fontSize: '0.8rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 8px', borderRadius: '12px', fontWeight: '700' }}>
              {assignedVendors.length}
            </span>
          </div>

          <button
            onClick={() => setAssignVendorModalOpen(true)}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px', fontSize: '0.8rem', background: '#059669', borderColor: '#059669' }}
          >
            <LucidePlus size={14} /> Assign New Vendor
          </button>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#e0e7ff', border: '1px solid #c7d2fe', padding: '12px 14px', borderRadius: '8px', color: '#3730a3', fontSize: '0.82rem', marginBottom: '16px' }}>
            <LucideInfo size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Universal Vendor Access:</strong> Because this user holds the <strong>ADMIN</strong> role, they automatically have unrestricted operational access across all partner vendors and system data in the platform.
            </div>
          </div>
        )}

        {assignedVendors.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {assignedVendors.map(v => (
              <div
                key={v.id || v.external_vendor_id}
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    {v.name || v.partnerName}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    Code: <code style={{ background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: '3px' }}>{v.code || v.external_vendor_id || v.id}</code>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveVendor(v.id || v.external_vendor_id)}
                  className="btn-danger"
                  style={{ padding: '4px 8px', height: '28px', fontSize: '0.75rem', borderRadius: '6px' }}
                  title="Remove Vendor Access"
                >
                  <LucideTrash2 size={13} /> Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border)', borderRadius: '8px' }}>
            <div style={{ marginBottom: '8px', fontSize: '1.2rem' }}>🏢</div>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>No Vendors Assigned Directly</div>
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem' }}>This user has no specific vendor partners assigned to their scope.</p>
            <button
              onClick={() => setAssignVendorModalOpen(true)}
              className="btn-secondary"
              style={{ fontSize: '0.8rem', height: '32px' }}
            >
              <LucidePlus size={14} /> Assign a Vendor
            </button>
          </div>
        )}
      </div>

      {/* Section 4: Account & System Information */}
      <div className="app-card" style={{ padding: '20px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <LucideLayers size={18} color="#4b5563" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Account & System Information
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              System Database ID
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
              #{user.id}
            </div>
          </div>

          <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              Staff User Status
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: user.is_staff ? '#059669' : 'var(--text-muted)', marginTop: '4px' }}>
              {user.is_staff ? 'Yes (Staff Authorized)' : 'No (Standard User)'}
            </div>
          </div>

          <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              Superuser Status
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: user.is_superuser ? '#2563eb' : 'var(--text-muted)', marginTop: '4px' }}>
              {user.is_superuser ? 'Yes (Superadmin)' : 'No'}
            </div>
          </div>

          <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              Primary Associated Vendor
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
              {user.vendor_name || user.vendor_details?.name || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <UserEditModal
        isOpen={editModalOpen}
        user={user}
        onClose={() => setEditModalOpen(false)}
        onSuccess={(updatedUser, msg) => {
          setUser(prev => ({ ...prev, ...updatedUser }));
          setStatusMessage({ type: 'success', text: msg || 'User details updated successfully!' });
          loadUserData();
        }}
        systemVendors={systemVendors}
        allSystemUsers={allSystemUsers}
        roleOptions={roleOptions}
      />

      <UserPermissionsModal
        isOpen={permissionsModalOpen}
        user={user}
        onClose={() => setPermissionsModalOpen(false)}
      />

      <AssignVendorModal
        isOpen={assignVendorModalOpen}
        user={user}
        onClose={() => setAssignVendorModalOpen(false)}
        onSuccess={(updatedUser, msg) => {
          setStatusMessage({ type: 'success', text: msg || 'Vendor assigned successfully!' });
          loadUserData();
        }}
        systemVendors={systemVendors}
      />
    </div>
  );
};
