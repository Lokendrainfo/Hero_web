import React, { useEffect, useState, useMemo } from 'react';
import { userService } from '../../services/userService';
import { vendorService } from '../../services/vendorService';
import { attendanceService } from '../../services/attendanceService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideUsers, LucideShield, LucideMail, LucidePhone,
  LucideRefreshCw, LucideSearch, LucideBuilding2, LucideCalendar,
  LucideX, LucideClock, LucideUserCheck, LucideExternalLink, LucideUser
} from 'lucide-react';
import '../../styles/components.css';
import { SearchableSelect } from '../../components/common/Select';
import { DateField } from '../../components/common/DateField';
import { roleBadgeClass } from '../../utils/roleBadge';

export const Team = () => {
  const { user, isAdmin, vendors } = useAuth();
  const [users, setUsers] = useState([]);
  const [vendorList, setVendorList] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [todayAttendanceMap, setTodayAttendanceMap] = useState({});

  // Employee Attendance History Drawer/Modal State
  const [selectedEmployeeForAttendance, setSelectedEmployeeForAttendance] = useState(null);
  const [employeeAttendanceHistory, setEmployeeAttendanceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Fetch vendors for admin dropdown filter
  useEffect(() => {
    if (isAdmin) {
      vendorService.getVendors({ page: 0, size: 50 })
        .then(res => {
          const list = res.data?.data?.results || res.data?.results || res.data?.data || res.data?.content || res.data || [];
          setVendorList(Array.isArray(list) ? list : []);
        })
        .catch(console.error);
    }
  }, [isAdmin]);

  const fetchUsersAndAttendance = React.useCallback(() => {
    setLoading(true);
    const params = { page: 0, size: 200 };
    if (isAdmin && selectedVendor && selectedVendor !== 'all') {
      params.vendor_id = selectedVendor;
    }
    if (search.trim()) {
      params.search = search.trim();
    }

    // Fetch Users
    const usersPromise = userService.getUsers(params);

    // Fetch Today's Attendance
    const todayStr = new Date().toISOString().split('T')[0];
    const attParams = { date: todayStr };
    if (isAdmin && selectedVendor && selectedVendor !== 'all') {
      attParams.vendor_id = selectedVendor;
    }
    const attPromise = attendanceService.getTeamAttendance(attParams);

    Promise.all([usersPromise, attPromise])
      .then(([usersRes, attRes]) => {
        const payload = usersRes.data?.data || usersRes.data || {};
        const list = payload.results || payload.content || (Array.isArray(payload) ? payload : []);
        setUsers(Array.isArray(list) ? list : []);

        const attData = attRes.data?.data || attRes.data || {};
        const teamMembersAtt = attData.team_members || [];
        const attMap = {};
        teamMembersAtt.forEach(item => {
          attMap[item.user_id] = item;
        });
        setTodayAttendanceMap(attMap);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAdmin, selectedVendor, search]);

  useEffect(() => {
    fetchUsersAndAttendance();
  }, [fetchUsersAndAttendance]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsersAndAttendance();
  };

  const openEmployeeAttendanceHistory = (employee) => {
    setSelectedEmployeeForAttendance(employee);
    fetchEmployeeHistory(employee.id, historyMonth);
  };

  const fetchEmployeeHistory = (userId, yearMonthStr) => {
    setHistoryLoading(true);
    const [year, month] = yearMonthStr.split('-');
    const startDate = `${yearMonthStr}-01`;
    // Calculate end of month
    const lastDay = new Date(parseInt(year), int(month), 0).getDate();
    const endDate = `${yearMonthStr}-${String(lastDay).padStart(2, '0')}`;

    attendanceService.getAll({ user_id: userId, date_from: startDate, date_to: endDate, page_size: 100 })
      .then(res => {
        const payload = res.data?.data || res.data || {};
        const list = payload.results || (Array.isArray(payload) ? payload : []);
        setEmployeeAttendanceHistory(Array.isArray(list) ? list : []);
      })
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (selectedEmployeeForAttendance) {
      fetchEmployeeHistory(selectedEmployeeForAttendance.id, historyMonth);
    }
  }, [historyMonth]);

  const activeVendorName = useMemo(() => {
    if (user?.vendor?.name) return user.vendor.name;
    if (vendors && vendors.length > 0) return vendors[0].name || vendors[0].partnerName;
    return 'Your Vendor Account';
  }, [user, vendors]);

  const renderAttendanceBadge = (statusStr) => {
    const st = (statusStr || 'NOT_MARKED').toUpperCase().replace(' ', '_');
    switch (st) {
      case 'PRESENT':
        return <span className="badge-pill badge-green">PRESENT</span>;
      case 'ABSENT':
        return <span className="badge-pill" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>ABSENT</span>;
      case 'HALF_DAY':
        return <span className="badge-pill badge-amber">HALF DAY</span>;
      case 'LEAVE':
        return <span className="badge-pill badge-purple">LEAVE</span>;
      case 'WEEK_OFF':
        return <span className="badge-pill badge-blue">WEEK OFF</span>;
      case 'NOT_MARKED':
      default:
        return <span className="badge-pill" style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>NOT MARKED</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontFamily: 'inherit', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Vendor Team Directory
            </h1>
            {isAdmin ? (
              <span className="badge-pill badge-role-admin">
                Admin master view
              </span>
            ) : (
              <span className="badge-pill badge-role-vendor">
                {activeVendorName}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px', margin: 0 }}>
            {isAdmin
              ? 'Master list of system team members across all vendor organizations'
              : `Active team members, site supervisors, operators, and staff belonging to ${activeVendorName}`
            }
          </p>
        </div>

        <button
          onClick={fetchUsersAndAttendance}
          style={{
            padding: '9px 16px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
            fontWeight: '600',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <LucideRefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh Directory
        </button>
      </div>

      {/* Control Bar: Search + Vendor Dropdown Filter (Admin Only) */}
      <div className="app-card" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <form onSubmit={handleSearchSubmit} style={{ flex: '1', minWidth: '280px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search team by name, employee ID, phone, designation or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.85rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <LucideSearch size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
        </form>

        {/* Admin Vendor Selection Dropdown (Only shown for Admin users per Section 2) */}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '6px 12px' }}>
            <LucideBuilding2 size={16} color="#111827" />
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#334155' }}>Filter Vendor:</span>
            <SearchableSelect
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.85rem',
                fontWeight: '600',
                color: '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Vendors (Master List)</option>
              {vendorList.map(v => (
                <option key={v.id || v.external_vendor_id} value={v.id || v.external_vendor_id}>
                  {v.partnerName || v.name}
                </option>
              ))}
            </SearchableSelect>
          </div>
        )}
      </div>

      {/* Team Data Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '20px' }}>Employee ID</th>
              <th>Employee Name</th>
              <th>Contact Phone</th>
              <th>Role</th>
              <th>Designation</th>
              <th>Vendor</th>
              <th>Reporting Manager</th>
              <th>Status</th>
              <th>Attendance Today</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const attItem = todayAttendanceMap[u.id];
              const attStatus = attItem ? attItem.status : 'NOT_MARKED';
              const empVendor = !isAdmin ? activeVendorName : (u.vendor?.name || u.vendor_name || 'N/A');

              return (
                <tr key={u.id}>
                  <td style={{ paddingLeft: '20px', fontFamily: 'monospace', fontWeight: '700', color: '#2563eb' }}>
                    {u.employee_id || u.external_user_id || `EMP-${u.id}`}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {u.first_name ? `${u.first_name} ${u.last_name || ''}` : u.username}
                    </div>
                    {u.email && <div className="page-subtitle">{u.email}</div>}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem', color: '#334155' }}>
                      {u.phone_number || '—'}
                    </div>
                  </td>
                  <td>
                    <span className={`badge-pill ${roleBadgeClass(u.role || (u.roles && u.roles[0]?.name) || 'OPERATOR')}`}>
                      {u.role || (u.roles && u.roles[0]?.name) || 'OPERATOR'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                      {u.designation || 'Field Staff'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#0f172a' }}>
                      {empVendor}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                      {u.reporting_manager_name || (u.reporting_manager ? (u.reporting_manager.first_name || u.reporting_manager.username) : '—')}
                    </span>
                  </td>
                  <td>
                    <span className="badge-pill badge-running">
                      Active
                    </span>
                  </td>
                  <td>
                    {renderAttendanceBadge(attStatus)}
                  </td>
                  <td>
                    <button
                      onClick={() => openEmployeeAttendanceHistory(u)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #10b981',
                        background: '#ecfdf5',
                        color: '#047857',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <LucideCalendar size={13} />
                      Attendance
                    </button>
                  </td>
                </tr>
              );
            })}

            {users.length === 0 && (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  {loading ? 'Loading vendor team members...' : 'No team members found for your vendor.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Employee Monthly Attendance Drawer / Modal (Section 14) */}
      {selectedEmployeeForAttendance && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '650px' }}>
            <div style={{ padding: '18px 22px', background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--live)', fontWeight: '600', textTransform: 'uppercase' }}>Employee Attendance Log</div>
                <h3 style={{ fontSize: '1.1rem', fontFamily: 'inherit', fontWeight: '700', margin: '2px 0 0', color: 'var(--text-primary)' }}>
                  {selectedEmployeeForAttendance.first_name ? `${selectedEmployeeForAttendance.first_name} ${selectedEmployeeForAttendance.last_name || ''}` : selectedEmployeeForAttendance.username} ({selectedEmployeeForAttendance.employee_id || `EMP-${selectedEmployeeForAttendance.id}`})
                </h3>
              </div>
              <button
                onClick={() => setSelectedEmployeeForAttendance(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <LucideX size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Month Selector */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Month</label>
                <DateField
                  mode="month"
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(e.target.value)}
                  aria-label="Attendance month"
                />
              </div>

              {/* History Table */}
              <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeAttendanceHistory.map(rec => (
                      <tr key={rec.id}>
                        <td><strong>{rec.date}</strong></td>
                        <td>{rec.check_in ? new Date(rec.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td>{rec.check_out ? new Date(rec.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td>{renderAttendanceBadge(rec.status)}</td>
                        <td>{rec.notes || '—'}</td>
                      </tr>
                    ))}
                    {employeeAttendanceHistory.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                          {historyLoading ? 'Fetching attendance records...' : 'No attendance logs recorded for selected month.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setSelectedEmployeeForAttendance(null)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontWeight: '600',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Team;
