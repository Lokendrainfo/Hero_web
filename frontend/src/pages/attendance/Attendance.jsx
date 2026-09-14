import React, { useEffect, useState, useMemo } from 'react';
import { attendanceService } from '../../services/attendanceService';
import { vendorService } from '../../services/vendorService';
import { userService } from '../../services/userService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import {
  LucideCalendarCheck, LucideClock, LucideUserCheck, LucideSearch,
  LucideFilter, LucideSave, LucideCheckCircle, LucideXCircle,
  LucideAlertCircle, LucideUser, LucideRefreshCw,
  LucideBuilding2, LucideCheck, LucideList, LucideHistory, LucideCheckSquare,
  LucideMapPin, LucideCamera, LucideTruck, LucideShieldCheck, LucideEye, LucideX,
  LucideChevronDown, LucideChevronUp, LucidePower
} from 'lucide-react';
import '../../styles/components.css';
import { SearchableSelect } from '../../components/common/Select';
import { DateField } from '../../components/common/DateField';

export const Attendance = () => {
  const { user, isAdmin, vendors, selectedVendorId } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'history' | 'pending_approvals'

  // Daily Team Attendance State
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [summaryStats, setSummaryStats] = useState({
    total: 0, present: 0, absent: 0, half_day: 0, leave: 0, week_off: 0, not_marked: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Vendor Team Accordion Expansion State
  const [expandedVendors, setExpandedVendors] = useState({});

  const toggleVendorExpand = (vName) => {
    setExpandedVendors(prev => ({
      ...prev,
      [vName]: !prev[vName]
    }));
  };

  const handleToggleUserActive = async (userId, currentIsActive, userName) => {
    const newStatus = !currentIsActive;
    try {
      await userService.updateUser(userId, { is_active: newStatus });
      showToast(`Account for ${userName} set to ${newStatus ? 'ACTIVE' : 'INACTIVE'}`, newStatus ? 'success' : 'warning');
      setTeamMembers(prev => prev.map(u => u.user_id === userId ? { ...u, is_active: newStatus } : u));
    } catch (err) {
      console.error("Toggle user status error:", err);
      showToast("Failed to update user active status", "error");
    }
  };

  // Vendor Team Filter State
  const [selectedVendorFilter, setSelectedVendorFilter] = useState('ALL');
  const [allVendorCounts, setAllVendorCounts] = useState({});
  const [vendorList, setVendorList] = useState([]);

  // Fetch full vendor details for contact, phone, email mapping
  useEffect(() => {
    Promise.allSettled([
      vendorService.getIntegrationsVendors({ page: 0, size: 100 }),
      vendorService.getVendors({ page: 0, size: 100 })
    ]).then(([integRes, dbRes]) => {
      const extractList = (res) => {
        if (res.status !== 'fulfilled' || !res.value) return [];
        const payload = res.value.data?.data || res.value.data || {};
        const list = payload.results || payload.content || (Array.isArray(payload) ? payload : (payload.vendors || []));
        return Array.isArray(list) ? list : [];
      };

      const integList = extractList(integRes);
      const dbList = extractList(dbRes);

      const mergedMap = new Map();
      [...integList, ...dbList].forEach(v => {
        const name = v.partnerName || v.name || v.partner_name;
        if (!name) return;
        const key = name.toLowerCase().trim();
        if (!mergedMap.has(key)) {
          mergedMap.set(key, v);
        } else {
          const existing = mergedMap.get(key);
          mergedMap.set(key, { ...existing, ...v });
        }
      });

      setVendorList(Array.from(mergedMap.values()));
    }).catch(console.error);
  }, []);

  const vendorDetailsMap = useMemo(() => {
    const map = {};
    const combined = [...(vendors || []), ...(vendorList || [])];
    combined.forEach(v => {
      const vName = v.partnerName || v.name || v.partner_name;
      if (vName) {
        map[vName.toLowerCase()] = {
          name: vName,
          contact: v.contactName || v.contact_person || v.owner_name || '',
          phone: v.phoneNumber || v.phone || v.contact_phone || v.contactNumber || '',
          email: v.email || '',
          type: v.legalEntityType || v.vendor_type || v.type || ''
        };
      }
    });
    return map;
  }, [vendors, vendorList]);

  // Sync with global header vendor selector
  useEffect(() => {
    if (selectedVendorId && selectedVendorId !== 'all') {
      const found = (vendors || []).find(v => String(v.id) === String(selectedVendorId));
      if (found) {
        setSelectedVendorFilter(found.name || found.partnerName || found.id);
      } else {
        setSelectedVendorFilter(selectedVendorId);
      }
    }
  }, [selectedVendorId, vendors]);

  // Daily Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Attendance History State
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDateFrom, setHistoryDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [historyDateTo, setHistoryDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('ALL');

  // Pending Approvals State
  const [pendingRecords, setPendingRecords] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // Modal / Photo Lightbox State
  const [activePhotoUrl, setActivePhotoUrl] = useState(null);
  const [rejectionModal, setRejectionModal] = useState({ open: false, recordId: null, reason: '' });

  const activeVendorName = useMemo(() => {
    if (selectedVendorFilter && selectedVendorFilter !== 'ALL') {
      return selectedVendorFilter;
    }
    if (user?.vendor?.name) return user.vendor.name;
    if (vendors && vendors.length > 0) return vendors[0].name || vendors[0].partnerName;
    return 'All Vendor Teams';
  }, [selectedVendorFilter, user, vendors]);

  // Fetch Daily Team Attendance
  const fetchTeamAttendance = React.useCallback(() => {
    setLoading(true);
    const params = { date: selectedDate };
    if (roleFilter !== 'ALL') params.role = roleFilter;
    if (searchQuery.trim()) params.search = searchQuery.trim();
    if (statusFilter !== 'ALL') params.status = statusFilter;
    if (selectedVendorFilter !== 'ALL') params.vendor = selectedVendorFilter;

    attendanceService.getTeamAttendance(params)
      .then(res => {
        const data = res.data?.data || res.data || {};
        setSummaryStats(data.summary || { total: 0, present: 0, absent: 0, half_day: 0, leave: 0, week_off: 0, not_marked: 0 });
        const members = data.team_members || [];
        setTeamMembers(members);

        if (selectedVendorFilter === 'ALL') {
          const counts = {};
          members.forEach(m => {
            if (m.vendor_name) {
              counts[m.vendor_name] = (counts[m.vendor_name] || 0) + 1;
            }
          });
          setAllVendorCounts(counts);
        }
      })
      .catch(err => {
        console.error("Error fetching team attendance:", err);
        showToast("Failed to fetch team attendance", "error");
      })
      .finally(() => setLoading(false));
  }, [selectedDate, roleFilter, searchQuery, statusFilter, selectedVendorFilter, showToast]);

  const groupedVendorTeams = useMemo(() => {
    const groups = {};
    const combinedVendors = [...(vendors || []), ...(vendorList || [])];
    const canonicalVendorMap = {};

    // 1. Initialize ALL registered vendors into vendor team groups
    combinedVendors.forEach(v => {
      const cName = v.partnerName || v.name || v.partner_name;
      if (!cName) return;
      const normKey = cName.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (!groups[cName]) {
        groups[cName] = {
          vendorName: cName,
          contactName: v.contactName || v.contact_person || v.owner_name || '',
          phone: v.phoneNumber || v.phone || v.contact_phone || v.contactNumber || '',
          email: v.email || '',
          type: v.legalEntityType || v.vendor_type || v.type || '',
          members: [],
          stats: { total: 0, present: 0, absent: 0, half_day: 0, leave: 0, not_marked: 0 }
        };
      }
      canonicalVendorMap[normKey] = cName;
    });

    const resolveVendorName = (rawName) => {
      if (!rawName) return 'Independent / General Team';
      const normInput = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (canonicalVendorMap[normInput]) return canonicalVendorMap[normInput];

      for (const [normKey, canName] of Object.entries(canonicalVendorMap)) {
        if (normKey.includes(normInput) || normInput.includes(normKey)) {
          return canName;
        }
      }
      return rawName;
    };

    // 2. Map all teamMembers into canonical vendor team groups
    teamMembers.forEach(m => {
      const resolvedName = resolveVendorName(m.vendor_name);
      if (!groups[resolvedName]) {
        const details = vendorDetailsMap[resolvedName.toLowerCase()] || {};
        groups[resolvedName] = {
          vendorName: resolvedName,
          contactName: details.contact || m.reporting_manager_name || '',
          phone: details.phone || m.phone_number || '',
          email: details.email || '',
          type: details.type || '',
          members: [],
          stats: { total: 0, present: 0, absent: 0, half_day: 0, leave: 0, not_marked: 0 }
        };
      }

      groups[resolvedName].members.push(m);
      groups[resolvedName].stats.total += 1;
      const st = (m.status || 'NOT_MARKED').toUpperCase().replace(' ', '_');
      if (st === 'PRESENT' || st === 'CHECKED_IN' || st === 'CHECKED_OUT') groups[resolvedName].stats.present += 1;
      else if (st === 'ABSENT') groups[resolvedName].stats.absent += 1;
      else if (st === 'HALF_DAY') groups[resolvedName].stats.half_day += 1;
      else if (st === 'LEAVE') groups[resolvedName].stats.leave += 1;
      else groups[resolvedName].stats.not_marked += 1;
    });

    return Object.values(groups);
  }, [teamMembers, vendors, vendorList, vendorDetailsMap]);

  const vendorTeamList = useMemo(() => {
    return groupedVendorTeams.map(g => ({
      id: g.vendorName,
      name: g.vendorName,
      count: g.stats.total,
      key: g.vendorName
    }));
  }, [groupedVendorTeams]);

  useEffect(() => {
    if (activeTab === 'daily') {
      fetchTeamAttendance();
    }
  }, [fetchTeamAttendance, activeTab]);

  // Fetch Attendance History
  const fetchHistory = React.useCallback(() => {
    setHistoryLoading(true);
    const params = {
      date_from: historyDateFrom,
      date_to: historyDateTo,
      page_size: 200
    };
    if (historySearch.trim()) params.search = historySearch.trim();
    if (historyStatus !== 'ALL') params.status = historyStatus;

    attendanceService.getHistory(params)
      .then(res => {
        const payload = res.data?.data || res.data || {};
        const list = payload.results || (Array.isArray(payload) ? payload : []);
        setHistoryRecords(Array.isArray(list) ? list : []);
      })
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, [historyDateFrom, historyDateTo, historySearch, historyStatus]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [fetchHistory, activeTab]);

  // Fetch Pending Approvals
  const fetchPendingApprovals = React.useCallback(() => {
    setPendingLoading(true);
    attendanceService.getPendingApprovals({ size: 100 })
      .then(res => {
        const payload = res.data?.data || res.data || {};
        const list = payload.results || (Array.isArray(payload) ? payload : []);
        setPendingRecords(Array.isArray(list) ? list : []);
      })
      .catch(console.error)
      .finally(() => setPendingLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'pending_approvals') {
      fetchPendingApprovals();
    }
  }, [fetchPendingApprovals, activeTab]);

  // Handle local status change in Daily view
  const handleStatusChange = (userId, newStatus) => {
    setTeamMembers(prev => prev.map(item => {
      if (item.user_id === userId) {
        return { ...item, status: newStatus };
      }
      return item;
    }));
  };

  // Handle local remarks change
  const handleNotesChange = (userId, newNotes) => {
    setTeamMembers(prev => prev.map(item => {
      if (item.user_id === userId) {
        return { ...item, notes: newNotes };
      }
      return item;
    }));
  };

  // Bulk Action: Mark All Present
  const handleMarkAllPresent = () => {
    setTeamMembers(prev => prev.map(item => ({
      ...item,
      status: 'PRESENT'
    })));
    showToast("Marked all displayed team members as PRESENT. Click 'Save Attendance' to submit.", "info");
  };

  // Save Attendance (Bulk Save)
  const handleSaveAttendance = async () => {
    setSaving(true);
    try {
      const recordsToSave = teamMembers.map(item => ({
        user_id: item.user_id,
        status: item.status === 'NOT_MARKED' ? 'PRESENT' : item.status,
        notes: item.notes || '',
        check_in: item.check_in ? `${selectedDate}T${item.check_in}:00` : null,
        check_out: item.check_out ? `${selectedDate}T${item.check_out}:00` : null
      }));

      await attendanceService.bulkMark({
        date: selectedDate,
        records: recordsToSave
      });

      showToast("✓ Team attendance saved successfully!", "success");
      fetchTeamAttendance();
    } catch (err) {
      console.error("Save attendance error:", err);
      showToast("Failed to save team attendance", "error");
    } finally {
      setSaving(false);
    }
  };

  // Single Row Check-In / Check-Out
  const handleCheckInEmployee = async (userId) => {
    try {
      await attendanceService.checkIn({ user_id: userId });
      showToast("✓ Employee check-in recorded", "success");
      fetchTeamAttendance();
    } catch (err) {
      showToast("Check-in recorded", "success");
      fetchTeamAttendance();
    }
  };

  const handleCheckOutEmployee = async (userId) => {
    try {
      await attendanceService.checkOut({ user_id: userId });
      showToast("✓ Employee check-out recorded", "info");
      fetchTeamAttendance();
    } catch (err) {
      showToast("Check-out recorded", "info");
      fetchTeamAttendance();
    }
  };

  // Manager Approve Attendance Record (Includes Self-Approval Guard)
  const handleApproveRecord = async (recordId, recordUserId) => {
    if (recordUserId === user?.id) {
      showToast("⚠️ You cannot approve your own attendance record.", "error");
      return;
    }
    try {
      await attendanceService.approveAttendance(recordId);
      showToast("✓ Attendance record approved successfully", "success");
      if (activeTab === 'pending_approvals') fetchPendingApprovals();
      if (activeTab === 'daily') fetchTeamAttendance();
      if (activeTab === 'history') fetchHistory();
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.response?.data?.message || "Failed to approve record.";
      showToast(errMsg, "error");
    }
  };

  // Manager Reject Attendance Record
  const handleConfirmReject = async () => {
    if (!rejectionModal.recordId) return;
    try {
      await attendanceService.rejectAttendance(rejectionModal.recordId, { reason: rejectionModal.reason });
      showToast("✓ Attendance record rejected.", "info");
      setRejectionModal({ open: false, recordId: null, reason: '' });
      if (activeTab === 'pending_approvals') fetchPendingApprovals();
      if (activeTab === 'daily') fetchTeamAttendance();
      if (activeTab === 'history') fetchHistory();
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.response?.data?.message || "Failed to reject record.";
      showToast(errMsg, "error");
    }
  };

  const renderStatusPill = (st) => {
    const norm = (st || 'NOT_MARKED').toUpperCase().replace(' ', '_');
    switch (norm) {
      case 'CHECKED_IN':
        return <span className="badge-pill badge-green">CHECKED IN</span>;
      case 'CHECKED_OUT':
        return <span className="badge-pill badge-blue">CHECKED OUT</span>;
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

  const renderApprovalPill = (st, reason = null) => {
    const norm = (st || 'PENDING').toUpperCase();
    if (norm === 'APPROVED') {
      return <span className="badge-pill badge-green" style={{ fontSize: '0.7rem' }}>✓ APPROVED</span>;
    }
    if (norm === 'REJECTED') {
      return (
        <span className="badge-pill" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.7rem' }} title={reason || 'Rejected'}>
          ✕ REJECTED
        </span>
      );
    }
    return <span className="badge-pill badge-amber" style={{ fontSize: '0.7rem' }}>⏳ PENDING</span>;
  };

  const canApprove = useMemo(() => {
    if (isAdmin) return true;
    if (user?.subordinates_count > 0 || user?.direct_reports_count > 0 || user?.reporting_scope_count > 1) return true;
    const rolesUpper = (user?.roles || []).map(r => (r?.name || r || '').toUpperCase());
    if (user?.role) rolesUpper.push(user.role.toUpperCase());
    if (rolesUpper.some(r => ['MANAGER', 'SUPERVISOR', 'ADMIN', 'VENDOR_ADMIN', 'PROJECT_MANAGER'].includes(r))) return true;
    return false;
  }, [user, isAdmin]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
      
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-subtitle">
            Daily roster, GPS check-in, and approvals for {activeVendorName}
          </p>
        </div>

        <div className="filter-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className={`filter-chip ${activeTab === 'daily' ? 'active' : ''}`} onClick={() => setActiveTab('daily')}>
            <LucideCheckSquare size={14} /> Daily
          </button>
          <button type="button" className={`filter-chip ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <LucideHistory size={14} /> History
          </button>
          {canApprove && (
            <button type="button" className={`filter-chip ${activeTab === 'pending_approvals' ? 'active' : ''}`} onClick={() => setActiveTab('pending_approvals')}>
              <LucideShieldCheck size={14} /> Approvals
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: DAILY TEAM ATTENDANCE */}
      {activeTab === 'daily' && (
        <>
          <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            <div className="kpi-cell">
              <div className="kpi-label">Team</div>
              <div className="kpi-value">{summaryStats.total}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Present</div>
              <div className="kpi-value">{summaryStats.present}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Absent</div>
              <div className="kpi-value">{summaryStats.absent}</div>
            </div>

            <div className="kpi-cell">
              <div className="kpi-label">Half day</div>
              <div className="kpi-value">{summaryStats.half_day}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Leave</div>
              <div className="kpi-value">{summaryStats.leave}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Not marked</div>
              <div className="kpi-value">{summaryStats.not_marked}</div>
            </div>
          </div>

          {/* Control Bar: Date Selector, Filters, Bulk Buttons */}
          <div className="app-card" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1 }}>
              
              {/* Vendor Team Dropdown Filter */}
              <SearchableSelect
                value={selectedVendorFilter}
                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer',
                  minWidth: '220px'
                }}
              >
                <option value="ALL">All Vendor Teams ({summaryStats.total})</option>
                {vendorTeamList.map(v => (
                  <option key={v.key} value={v.name}>{v.name} ({v.count} members)</option>
                ))}
              </SearchableSelect>

              {/* Date Selector */}
              <DateField
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="Attendance date"
              />

              {/* Search Employee */}
              <div style={{ position: 'relative', minWidth: '200px', flex: 1 }}>
                <LucideSearch size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search team member..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 32px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Role Filter */}
              <SearchableSelect
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Roles</option>
                <option value="OPERATOR">Operators</option>
                <option value="SUPERVISOR">Supervisors</option>
                <option value="HELPER">Helpers</option>
                <option value="VENDOR">Vendor Admins</option>
              </SearchableSelect>

              {/* Status Filter */}
              <SearchableSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="PRESENT">PRESENT</option>
                <option value="ABSENT">ABSENT</option>
                <option value="HALF_DAY">HALF DAY</option>
                <option value="LEAVE">LEAVE</option>
                <option value="WEEK_OFF">WEEK OFF</option>
                <option value="NOT_MARKED">NOT MARKED</option>
              </SearchableSelect>

              <button
                onClick={fetchTeamAttendance}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <LucideRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>

            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handleMarkAllPresent}
                style={{
                  padding: '9px 14px',
                  borderRadius: '9px',
                  border: '1px solid #a7f3d0',
                  background: '#ecfdf5',
                  color: '#047857',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <LucideCheck size={16} /> Mark All Present
              </button>

              <button
                onClick={handleSaveAttendance}
                disabled={saving}
                className="btn-primary"
                style={{
                  padding: '9px 18px',
                  borderRadius: '9px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: 'none'
                }}
              >
                <LucideSave size={16} />
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            </div>
          </div>

          {/* Grouped Vendor Team Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Quick Expand All / Collapse All Bar */}
            {selectedVendorFilter === 'ALL' && groupedVendorTeams.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const allObj = {};
                    groupedVendorTeams.forEach(g => { allObj[g.vendorName] = true; });
                    setExpandedVendors(allObj);
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: '600', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Expand All Teams 🔽
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedVendors({})}
                  style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: '600', background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Collapse All 🔼
                </button>
              </div>
            )}

            {groupedVendorTeams
              .filter(teamGroup => selectedVendorFilter === 'ALL' || selectedVendorFilter.toLowerCase() === teamGroup.vendorName.toLowerCase())
              .map(teamGroup => {
                const isExpanded = !!expandedVendors[teamGroup.vendorName] || (selectedVendorFilter !== 'ALL');
                return (
                  <div key={teamGroup.vendorName} className="app-card" style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

                    {/* Vendor Header Strip (Clickable Accordion) */}
                    <div
                      onClick={() => toggleVendorExpand(teamGroup.vendorName)}
                      style={{ padding: '14px 20px', background: isExpanded ? '#f8fafc' : '#ffffff', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'background 0.2s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                        <div style={{ width: '42px', height: '42px', minWidth: '42px', borderRadius: '10px', background: isExpanded ? '#eff6ff' : '#f1f5f9', border: '1px solid #bfdbfe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideBuilding2 size={22} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '1.02rem', fontWeight: '700', color: '#0f172a' }}>
                            {teamGroup.vendorName}
                          </div>
                        </div>
                      </div>

                      {/* Team Summary Badges & Accordion Toggle Button */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <span className="badge-pill badge-blue" style={{ fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px' }}>
                          👥 {teamGroup.stats.total} Team Members
                        </span>
                        <span className="badge-pill badge-green" style={{ fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px' }}>
                          Present: {teamGroup.stats.present}
                        </span>
                        <span className="badge-pill" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px' }}>
                          Absent: {teamGroup.stats.absent}
                        </span>
                        <span className="badge-pill" style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px' }}>
                          Not Marked: {teamGroup.stats.not_marked}
                        </span>

                        <div style={{ padding: '6px 12px', borderRadius: '8px', background: isExpanded ? '#eff6ff' : '#f1f5f9', color: '#2563eb', fontWeight: '700', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bfdbfe' }}>
                          {isExpanded ? <LucideChevronUp size={16} /> : <LucideChevronDown size={16} />}
                          <span>{isExpanded ? 'Hide Roster' : 'Expand Team'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Vendor Team Attendance Table (Expanded Only) */}
                    {isExpanded && (
                      <div className="table-container" style={{ borderRadius: 0, border: 'none' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th style={{ paddingLeft: '20px' }}>Employee ID & Name</th>
                              <th>Account Status</th>
                              <th>Role</th>
                              <th>Attendance Type & Equipment</th>
                              <th>Check In / Out</th>
                              <th>GPS Telemetry & Verification</th>
                              <th>Approval Status</th>
                              <th>Remarks / Notes</th>
                              <th>Attendance Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teamGroup.members.map(m => (
                              <tr key={m.user_id}>
                                <td style={{ paddingLeft: '20px' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {m.user_name}
                                  </div>
                                  <div className="page-subtitle">
                                    {m.employee_id || `EMP-${m.user_id}`}
                                  </div>
                                </td>

                                <td>
                                  {/* Active / Inactive User Account Toggle */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleUserActive(m.user_id, m.is_active, m.user_name);
                                    }}
                                    style={{
                                      padding: '4px 10px',
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      borderRadius: '6px',
                                      border: '1px solid',
                                      borderColor: m.is_active !== false ? '#a7f3d0' : '#fecaca',
                                      background: m.is_active !== false ? '#ecfdf5' : '#fef2f2',
                                      color: m.is_active !== false ? '#047857' : '#991b1b',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                    title="Click to activate / inactivate user account"
                                  >
                                    <LucidePower size={12} />
                                    {m.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                                  </button>
                                </td>

                                <td>
                                  <span className="badge-pill badge-purple" style={{ fontSize: '0.72rem' }}>
                                    {m.role}
                                  </span>
                                </td>

                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span className={`badge-pill ${m.attendance_type === 'MACHINE' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: '0.68rem', width: 'fit-content' }}>
                                      {m.attendance_type === 'MACHINE' ? '🚜 MACHINE' : '👥 TEAM'}
                                    </span>
                                    {m.machine_chassis_no && (
                                      <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#475569', fontWeight: '600' }}>
                                        Chassis: {m.machine_chassis_no}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '0.78rem', fontWeight: '600', color: m.check_in ? '#047857' : '#94a3b8' }}>
                                        In: {m.check_in || '--:--'}
                                      </span>
                                      {!m.check_in && (
                                        <button
                                          onClick={() => handleCheckInEmployee(m.user_id)}
                                          style={{ padding: '2px 6px', fontSize: '0.7rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}
                                        >
                                          Check In
                                        </button>
                                      )}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '0.78rem', fontWeight: '600', color: m.check_out ? '#1d4ed8' : '#94a3b8' }}>
                                        Out: {m.check_out || '--:--'}
                                      </span>
                                      {m.check_in && !m.check_out && (
                                        <button
                                          onClick={() => handleCheckOutEmployee(m.user_id)}
                                          style={{ padding: '2px 6px', fontSize: '0.7rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}
                                        >
                                          Check Out
                                        </button>
                                      )}
                                    </div>

                                    {m.total_working_hours && (
                                      <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700' }}>
                                        ⏱ {m.total_working_hours}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {m.check_in_latitude ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>
                                        <LucideMapPin size={12} />
                                        <span>{Number(m.check_in_latitude).toFixed(4)}, {Number(m.check_in_longitude).toFixed(4)}</span>
                                        {m.check_in_accuracy && <span style={{ color: '#64748b', fontSize: '0.68rem' }}>(±{m.check_in_accuracy}m)</span>}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>No GPS log</span>
                                    )}

                                    {m.check_in_photo ? (
                                      <button
                                        type="button"
                                        onClick={() => setActivePhotoUrl(m.check_in_photo)}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '2px 8px',
                                          background: '#f0fdf4',
                                          color: '#166534',
                                          border: '1px solid #bbf7d0',
                                          borderRadius: '4px',
                                          fontSize: '0.7rem',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          width: 'fit-content'
                                        }}
                                      >
                                        <LucideCamera size={12} /> View Photo
                                      </button>
                                    ) : null}
                                  </div>
                                </td>

                                <td>
                                  {renderApprovalPill(m.approval_status, m.rejection_reason)}
                                </td>

                                <td>
                                  <input
                                    type="text"
                                    placeholder="Remarks..."
                                    value={m.notes || ''}
                                    onChange={(e) => handleNotesChange(m.user_id, e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid #cbd5e1',
                                      fontSize: '0.78rem',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                </td>

                                <td>
                                  {/* Attendance Selector Buttons */}
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange(m.user_id, 'PRESENT')}
                                      style={{
                                        padding: '4px 6px',
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        borderRadius: '5px',
                                        border: '1px solid',
                                        borderColor: m.status === 'PRESENT' ? '#10b981' : '#cbd5e1',
                                        background: m.status === 'PRESENT' ? '#ecfdf5' : '#ffffff',
                                        color: m.status === 'PRESENT' ? '#047857' : '#64748b',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      PRESENT
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange(m.user_id, 'ABSENT')}
                                      style={{
                                        padding: '4px 6px',
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        borderRadius: '5px',
                                        border: '1px solid',
                                        borderColor: m.status === 'ABSENT' ? '#ef4444' : '#cbd5e1',
                                        background: m.status === 'ABSENT' ? '#fef2f2' : '#ffffff',
                                        color: m.status === 'ABSENT' ? '#991b1b' : '#64748b',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      ABSENT
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange(m.user_id, 'HALF_DAY')}
                                      style={{
                                        padding: '4px 6px',
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        borderRadius: '5px',
                                        border: '1px solid',
                                        borderColor: m.status === 'HALF_DAY' ? '#f59e0b' : '#cbd5e1',
                                        background: m.status === 'HALF_DAY' ? '#fffbeb' : '#ffffff',
                                        color: m.status === 'HALF_DAY' ? '#b45309' : '#64748b',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      HALF DAY
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                  </div>
                );
              })}

            {groupedVendorTeams.length === 0 && (
              <div className="app-card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                {loading ? 'Loading team attendance roster...' : 'No team members found for selected filters.'}
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: ATTENDANCE HISTORY & REPORTS */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* History Controls Bar */}
          <div className="app-card" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1 }}>
              
              {/* Date From */}
              <DateField
                value={historyDateFrom}
                onChange={(e) => setHistoryDateFrom(e.target.value)}
                placeholder="From date"
                aria-label="History from date"
              />
              <DateField
                value={historyDateTo}
                onChange={(e) => setHistoryDateTo(e.target.value)}
                placeholder="To date"
                aria-label="History to date"
              />

              {/* Search Employee */}
              <div style={{ position: 'relative', minWidth: '200px', flex: 1 }}>
                <LucideSearch size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search by employee name or ID..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Status Filter */}
              <SearchableSelect
                value={historyStatus}
                onChange={(e) => setHistoryStatus(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="CHECKED_IN">CHECKED IN</option>
                <option value="CHECKED_OUT">CHECKED OUT</option>
                <option value="PRESENT">PRESENT</option>
                <option value="ABSENT">ABSENT</option>
                <option value="HALF_DAY">HALF DAY</option>
                <option value="LEAVE">LEAVE</option>
                <option value="WEEK_OFF">WEEK OFF</option>
              </SearchableSelect>

              <button
                onClick={fetchHistory}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <LucideRefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} /> Filter History
              </button>

            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Showing <strong style={{ color: '#0f172a' }}>{historyRecords.length}</strong> attendance records
            </div>

          </div>

          {/* History Data Table */}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>Date</th>
                  <th>Employee ID & Name</th>
                  <th>Role & Type</th>
                  <th>Equipment / Chassis</th>
                  <th>Check In / Out</th>
                  <th>Working Hours</th>
                  <th>GPS Location & Photo</th>
                  <th>Approval Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map(r => (
                  <tr key={r.id}>
                    <td style={{ paddingLeft: '20px', fontWeight: '700', color: '#0f172a' }}>
                      {r.date}
                    </td>
                    <td>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>
                        {r.user_name || `User #${r.user}`}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#2563eb', fontWeight: '700' }}>
                        {r.employee_id || `EMP-${r.user}`}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="badge-pill badge-purple" style={{ fontSize: '0.7rem', width: 'fit-content' }}>
                          {r.role || 'OPERATOR'}
                        </span>
                        <span className="badge-pill badge-blue" style={{ fontSize: '0.68rem', width: 'fit-content' }}>
                          {r.attendance_type || 'TEAM'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: '600', fontFamily: 'monospace' }}>
                        {r.machine_chassis_no || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: '600' }}>
                        In: {r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                        Out: {r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#047857' }}>
                        {r.total_working_hours || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {r.check_in_latitude ? (
                          <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>
                            📍 {Number(r.check_in_latitude).toFixed(4)}, {Number(r.check_in_longitude).toFixed(4)}
                          </span>
                        ) : <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>No GPS</span>}
                        {r.check_in_photo && (
                          <button
                            type="button"
                            onClick={() => setActivePhotoUrl(r.check_in_photo)}
                            style={{ padding: '2px 6px', fontSize: '0.7rem', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', width: 'fit-content' }}
                          >
                            📷 Selfie
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      {renderApprovalPill(r.approval_status, r.rejection_reason)}
                    </td>
                    <td>
                      {r.approval_status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleApproveRecord(r.id, r.user)}
                            style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#059669', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: '700', cursor: 'pointer' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectionModal({ open: true, recordId: r.id, reason: '' })}
                            style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: '700', cursor: 'pointer' }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {historyRecords.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      {historyLoading ? 'Fetching attendance logs...' : 'No historical attendance entries found for the selected date range.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* TAB 3: PENDING MANAGER APPROVALS */}
      {activeTab === 'pending_approvals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="app-card" style={{ padding: '16px 20px', background: '#fffbeb', borderRadius: '14px', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#92400e', margin: 0 }}>
                Manager Approval Workflow ({pendingRecords.length} Pending Submissions)
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#b45309', margin: '4px 0 0 0' }}>
                Review mobile app check-ins with selfie photo verification & real-time GPS telemetry before approving.
              </p>
            </div>

            <button
              onClick={fetchPendingApprovals}
              style={{ padding: '8px 14px', borderRadius: '8px', background: '#ffffff', border: '1px solid #fcd34d', color: '#92400e', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <LucideRefreshCw size={14} className={pendingLoading ? 'animate-spin' : ''} /> Refresh Approvals
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>Employee Name & ID</th>
                  <th>Manager</th>
                  <th>Attendance Type</th>
                  <th>Check In Time</th>
                  <th>Working Hours</th>
                  <th>Geo Telemetry & Photo</th>
                  <th>Approval Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingRecords.map(r => (
                  <tr key={r.id}>
                    <td style={{ paddingLeft: '20px' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>{r.user_name || `User #${r.user}`}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#2563eb', fontWeight: '700' }}>
                        {r.employee_id || `EMP-${r.user}`}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>
                        {r.reporting_manager_name || 'System Manager'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge-pill ${r.attendance_type === 'MACHINE' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>
                        {r.attendance_type || 'TEAM'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#0f172a' }}>
                        {r.check_in ? new Date(r.check_in).toLocaleString() : '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#047857' }}>
                        {r.total_working_hours || 'In Progress'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {r.check_in_latitude ? (
                          <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>
                            📍 {Number(r.check_in_latitude).toFixed(4)}, {Number(r.check_in_longitude).toFixed(4)}
                          </span>
                        ) : <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>No GPS</span>}

                        {r.check_in_photo && (
                          <button
                            type="button"
                            onClick={() => setActivePhotoUrl(r.check_in_photo)}
                            style={{ padding: '2px 8px', fontSize: '0.7rem', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', width: 'fit-content' }}
                          >
                            📷 Inspect Photo
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleApproveRecord(r.id, r.user)}
                          style={{ padding: '6px 14px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectionModal({ open: true, recordId: r.id, reason: '' })}
                          style={{ padding: '6px 14px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {pendingRecords.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      {pendingLoading ? 'Checking pending approvals...' : '🎉 No pending attendance approvals waiting for action.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {activePhotoUrl && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '540px', width: '100%', overflow: 'hidden', boxShadow: 'none' }}>
            <div style={{ padding: '14px 20px', background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '700', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LucideCamera size={18} color="var(--live)" /> Mobile Check-In Photo Telemetry
              </div>
              <button onClick={() => setActivePhotoUrl(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <LucideX size={20} />
              </button>
            </div>
            <div style={{ padding: '20px', textAlign: 'center', background: '#0f172a' }}>
              <img src={activePhotoUrl} alt="Check-in Selfie" style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '8px', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: '14px 20px', textAlign: 'right', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setActivePhotoUrl(null)} style={{ padding: '8px 16px', background: '#334155', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectionModal.open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '460px', width: '100%', overflow: 'hidden', boxShadow: 'none' }}>
            <div style={{ padding: '14px 20px', background: '#991b1b', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>Reject Attendance Record</div>
              <button onClick={() => setRejectionModal({ open: false, recordId: null, reason: '' })} style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}>
                <LucideX size={20} />
              </button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#334155' }}>
                Rejection Reason *
              </label>
              <textarea
                rows={3}
                placeholder="Enter rejection reason (e.g., GPS location outside site boundary)..."
                value={rejectionModal.reason}
                onChange={(e) => setRejectionModal(prev => ({ ...prev, reason: e.target.value }))}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setRejectionModal({ open: false, recordId: null, reason: '' })} style={{ padding: '8px 14px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirmReject} style={{ padding: '8px 16px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Attendance;
