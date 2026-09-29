import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  LucideMapPin, LucideCamera, LucideCameraOff, LucideTruck, LucideShieldCheck, LucideEye, LucideX,
  LucideChevronDown, LucideChevronUp, LucidePower, LucideDownload, LucideExternalLink,
  LucideWrench, LucideAlertTriangle
} from 'lucide-react';
import '../../styles/components.css';
import { SearchableSelect } from '../../components/common/Select';
import { DateField } from '../../components/common/DateField';
import { getTodayDateString, getLocalDateString, formatISTTime, formatDisplayDate } from '../../utils/dateUtils';

export const Attendance = () => {
  const navigate = useNavigate();
  const { user, isAdmin, vendors, selectedVendorId, roles } = useAuth();
  const isVendorUser = !isAdmin && (user?.role === 'VENDOR' || String(user?.role || '').toUpperCase().includes('VENDOR') || (roles || []).some(r => String(r || '').toUpperCase().includes('VENDOR')));
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'history' | 'pending_approvals'

  // Daily Team Attendance State
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const [teamMembers, setTeamMembers] = useState([]);
  const [assignedMachines, setAssignedMachines] = useState([]);
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
      const found = (vendors || []).find(v =>
        String(v.id) === String(selectedVendorId) ||
        String(v.external_vendor_id) === String(selectedVendorId) ||
        String(v.code) === String(selectedVendorId)
      );
      if (found) {
        setSelectedVendorFilter(found.name || found.partnerName || found.id);
      } else {
        setSelectedVendorFilter(selectedVendorId);
      }
    } else if (selectedVendorId === 'all') {
      setSelectedVendorFilter('ALL');
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
    return getLocalDateString(d);
  });
  const [historyDateTo, setHistoryDateTo] = useState(() => getTodayDateString());
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('ALL');

  // Pending Approvals State
  const [pendingRecords, setPendingRecords] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // Modal / Photo Lightbox State
  const [photoModal, setPhotoModal] = useState({
    open: false,
    url: null,
    type: 'CHECK_IN',
    title: 'Mobile Check-In Photo Telemetry',
    userName: '',
    employeeId: '',
    vendorName: '',
    date: '',
    time: '',
    lat: null,
    lng: null,
    accuracy: null
  });
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(true);
  const [rejectionModal, setRejectionModal] = useState({ open: false, recordId: null, reason: '' });

  const normalizeHeroPhotoUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const clean = rawUrl.trim();
    if (!clean || clean === 'NO_PHOTO_ATTACHED' || clean === 'null' || clean === 'undefined') return null;

    // 1. Full HTTP / HTTPS URL
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && clean.startsWith('http://')) {
        return clean.replace(/^http:\/\//i, 'https://');
      }
      return clean;
    }

    // 2. Formatted Base64 Data URL
    if (clean.startsWith('data:image/')) {
      return clean;
    }

    // 3. Raw Base64 string without data:image prefix
    if (clean.length > 100 && !clean.startsWith('/')) {
      return `data:image/jpeg;base64,${clean}`;
    }

    // 4. Relative server path (e.g. /media/attendance/photos/...)
    const formattedPath = clean.startsWith('/') ? clean : `/${clean}`;
    const backendHost = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
      ? 'http://localhost:8000'
      : (window.location.origin);
    return `${backendHost}${formattedPath}`;
  };

  const openPhotoModal = (url, type = 'CHECK_IN', telemetry = {}) => {
    setPhotoLoadError(false);
    setPhotoLoading(true);
    setPhotoModal({
      open: true,
      url: normalizeHeroPhotoUrl(url),
      type: type,
      title: type === 'CHECK_OUT' ? 'Mobile Check-Out Photo Telemetry' : 'Mobile Check-In Photo Telemetry',
      userName: telemetry.userName || '',
      employeeId: telemetry.employeeId || '',
      vendorName: telemetry.vendorName || '',
      date: telemetry.date || '',
      time: telemetry.time || '',
      lat: telemetry.lat || null,
      lng: telemetry.lng || null,
      accuracy: telemetry.accuracy || null
    });
  };

  // Download Bulk Attendance Report (CSV)
  const [downloadingReport, setDownloadingReport] = useState(false);

  const handleBulkDownloadReport = async () => {
    setDownloadingReport(true);
    try {
      const params = {};
      if (activeTab === 'daily') {
        params.date = selectedDate;
        if (roleFilter && roleFilter !== 'ALL') params.role = roleFilter;
        if (searchQuery && searchQuery.trim()) params.search = searchQuery.trim();
        if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;
      } else if (activeTab === 'history') {
        if (historyDateFrom) params.date_from = historyDateFrom;
        if (historyDateTo) params.date_to = historyDateTo;
        if (historyRoleFilter && historyRoleFilter !== 'ALL') params.role = historyRoleFilter;
        if (historySearchQuery && historySearchQuery.trim()) params.search = historySearchQuery.trim();
        if (historyStatusFilter && historyStatusFilter !== 'ALL') params.status = historyStatusFilter;
      }
      if (selectedVendorFilter && selectedVendorFilter !== 'ALL') {
        params.vendor = selectedVendorFilter;
      }

      const responseData = await attendanceService.exportReport(params);

      let blob;
      if (responseData instanceof Blob) {
        blob = responseData;
      } else if (responseData && responseData.data instanceof Blob) {
        blob = responseData.data;
      } else {
        blob = new Blob([responseData], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateLabel = activeTab === 'history' && (historyDateFrom || historyDateTo)
        ? `${historyDateFrom || 'Start'}_to_${historyDateTo || 'End'}`
        : (selectedDate || 'Export');
      const fileName = `Attendance_Report_${dateLabel}.xlsx`;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("✓ Bulk attendance report downloaded successfully!", "success");
    } catch (err) {
      console.error("Download report error:", err);
      showToast("Failed to download attendance report", "error");
    } finally {
      setDownloadingReport(false);
    }
  };

  const activeVendorName = useMemo(() => {
    if (selectedVendorFilter && selectedVendorFilter !== 'ALL') {
      const found = (vendors || []).find(v =>
        String(v.id) === String(selectedVendorFilter) ||
        String(v.external_vendor_id) === String(selectedVendorFilter) ||
        v.name === selectedVendorFilter ||
        v.partnerName === selectedVendorFilter
      );
      return found?.partnerName || found?.name || selectedVendorFilter;
    }
    if (user?.vendor?.name) return user.vendor.name;
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
        setAssignedMachines(data.assigned_machines || []);

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
          machines: [],
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

    const seenMemberKeys = new Set();
    teamMembers.forEach(m => {
      if (!m) return;
      const memKey = `${m.vendor_name || ''}_${m.user_id || m.employee_id || ''}_${m.user_name || ''}_${m.phone_number || ''}`.trim().toLowerCase();
      if (memKey && seenMemberKeys.has(memKey)) return;
      if (memKey) seenMemberKeys.add(memKey);

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
          machines: [],
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

    // 3. Map assigned machines into vendor groups
    const seenMachineChassis = new Set();
    assignedMachines.forEach(mac => {
      if (!mac) return;
      const chassisKey = String(mac.chassis_no || mac.machine_no || mac.code || mac.machine_id || '').trim();
      if (chassisKey) {
        if (seenMachineChassis.has(chassisKey)) {
          // Machine already assigned to its primary vendor; prevent duplicate vendor cards
          return;
        }
        seenMachineChassis.add(chassisKey);
      }
      const resolvedName = resolveVendorName(mac.vendor_name);
      if (!groups[resolvedName]) {
        const details = vendorDetailsMap[resolvedName.toLowerCase()] || {};
        groups[resolvedName] = {
          vendorName: resolvedName,
          contactName: details.contact || '',
          phone: details.phone || '',
          email: details.email || '',
          type: details.type || '',
          members: [],
          machines: [],
          stats: { total: 0, present: 0, absent: 0, half_day: 0, leave: 0, not_marked: 0 }
        };
      }
      if (!groups[resolvedName].machines) groups[resolvedName].machines = [];
      groups[resolvedName].machines.push(mac);
    });

    // Filter vendor team groups: keep groups that have members OR machines
    const groupList = Object.values(groups);
    return groupList.filter(g => (g.members && g.members.length > 0) || (g.machines && g.machines.length > 0));
  }, [teamMembers, assignedMachines, vendors, vendorList, vendorDetailsMap]);

  const vendorTeamList = useMemo(() => {
    return groupedVendorTeams.map(g => ({
      id: g.vendorName,
      name: g.vendorName,
      count: g.stats.total,
      key: g.vendorName
    }));
  }, [groupedVendorTeams]);

  const activeSummaryStats = useMemo(() => {
    if (summaryStats && summaryStats.total > 0) {
      return summaryStats;
    }

    let filtered = groupedVendorTeams;
    if (selectedVendorFilter && selectedVendorFilter !== 'ALL') {
      const filt = String(selectedVendorFilter || '').toLowerCase();
      filtered = groupedVendorTeams.filter(g => {
        const vName = String(g.vendorName || '').toLowerCase();
        return vName.includes(filt) || filt.includes(vName);
      });
    }

    const res = { total: 0, present: 0, absent: 0, half_day: 0, leave: 0, not_marked: 0 };
    const listToSum = (filtered && filtered.length > 0) ? filtered : (groupedVendorTeams || []);
    listToSum.forEach(g => {
      res.total += (g.stats?.total || 0);
      res.present += (g.stats?.present || 0);
      res.absent += (g.stats?.absent || 0);
      res.half_day += (g.stats?.half_day || 0);
      res.leave += (g.stats?.leave || 0);
      res.not_marked += (g.stats?.not_marked || 0);
    });
    return res;
  }, [groupedVendorTeams, selectedVendorFilter, summaryStats]);

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
      page_size: 200,
      size: 200
    };
    if (historySearch.trim()) params.search = historySearch.trim();
    if (historyStatus !== 'ALL') params.status = historyStatus;
    if (selectedVendorFilter && selectedVendorFilter !== 'ALL') {
      params.vendor = selectedVendorFilter;
    }

    attendanceService.getHistory(params)
      .then(res => {
        const payload = res?.data?.data || res?.data || res || {};
        const list = payload.results || (Array.isArray(payload) ? payload : []);
        setHistoryRecords(Array.isArray(list) ? list : []);
      })
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, [historyDateFrom, historyDateTo, historySearch, historyStatus, selectedVendorFilter]);

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
        const payload = res?.data?.data || res?.data || res || {};
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
    let lat = null;
    let lng = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 3000, enableHighAccuracy: true });
        });
        if (pos && pos.coords) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch (e) {
        console.warn("Geolocation position capture warning:", e);
      }
    }

    try {
      const recordsToSave = teamMembers.map(item => ({
        user_id: item.user_id,
        external_user_id: item.external_user_id || null,
        status: item.status === 'NOT_MARKED' ? 'PRESENT' : item.status,
        notes: item.notes || '',
        phone_number: item.phone_number || '',
        email: item.email || '',
        user_name: item.user_name || '',
        vendor_id: item.vendor_id || null,
        check_in_latitude: lat,
        check_in_longitude: lng,
        latitude: lat,
        longitude: lng,
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
      const errMsg = err?.message || err?.detail || err?.response?.data?.detail || err?.response?.data?.message || "Failed to save team attendance.";
      showToast(`⚠️ ${errMsg}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // Single Row Check-In / Check-Out
  const handleCheckInEmployee = async (userId, externalUserId = null, vendorId = null) => {
    let lat = null;
    let lng = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 4000, enableHighAccuracy: true });
        });
        if (pos && pos.coords) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch (e) {
        console.warn("Geolocation position capture warning:", e);
      }
    }

    try {
      await attendanceService.checkIn({
        user_id: userId,
        external_user_id: externalUserId,
        vendor_id: vendorId,
        latitude: lat,
        longitude: lng,
        check_in_latitude: lat,
        check_in_longitude: lng
      });
      showToast("✓ Employee check-in recorded with location & time", "success");
      fetchTeamAttendance();
    } catch (err) {
      console.error("Check-in error:", err);
      const resData = err.response?.data;
      const errMsg = resData?.detail || resData?.message || resData?.error || (resData?.errors && (typeof resData.errors === 'string' ? resData.errors : (resData.errors.detail || JSON.stringify(resData.errors)))) || "Failed to record check-in.";
      showToast(`⚠️ ${errMsg}`, "error");
    }
  };

  const handleCheckOutEmployee = async (userId, externalUserId = null, vendorId = null) => {
    let lat = null;
    let lng = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 4000, enableHighAccuracy: true });
        });
        if (pos && pos.coords) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch (e) {
        console.warn("Geolocation position capture warning:", e);
      }
    }

    try {
      await attendanceService.checkOut({
        user_id: userId,
        external_user_id: externalUserId,
        vendor_id: vendorId,
        latitude: lat,
        longitude: lng,
        check_out_latitude: lat,
        check_out_longitude: lng
      });
      showToast("✓ Employee check-out recorded", "info");
      fetchTeamAttendance();
    } catch (err) {
      console.error("Check-out error:", err);
      const resData = err.response?.data;
      const errMsg = resData?.detail || resData?.message || resData?.error || (resData?.errors && (typeof resData.errors === 'string' ? resData.errors : (resData.errors.detail || JSON.stringify(resData.errors)))) || "Failed to record check-out.";
      showToast(`⚠️ ${errMsg}`, "error");
    }
  };

  const handleCheckInMachine = async (mac) => {
    let lat = null;
    let lng = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 4000, enableHighAccuracy: true });
        });
        if (pos && pos.coords) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch (e) {
        console.warn("Geolocation position capture warning:", e);
      }
    }

    try {
      await attendanceService.machineCheckIn({
        machine_id: mac.machine_id,
        machine_chassis_no: mac.chassis_no || mac.machine_no,
        latitude: lat,
        longitude: lng,
        check_in_latitude: lat,
        check_in_longitude: lng
      });
      showToast(`✓ Machine Check-In recorded for ${mac.name || mac.chassis_no}`, "success");
      fetchTeamAttendance();
    } catch (err) {
      console.error("Machine check-in error:", err);
      const errMsg = err.response?.data?.detail || err.response?.data?.message || "Failed to record machine check-in.";
      showToast(`⚠️ ${errMsg}`, "error");
    }
  };

  const handleCheckOutMachine = async (mac) => {
    let lat = null;
    let lng = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 4000, enableHighAccuracy: true });
        });
        if (pos && pos.coords) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch (e) {
        console.warn("Geolocation position capture warning:", e);
      }
    }

    try {
      await attendanceService.machineCheckOut({
        machine_id: mac.machine_id,
        machine_chassis_no: mac.chassis_no || mac.machine_no,
        latitude: lat,
        longitude: lng,
        check_out_latitude: lat,
        check_out_longitude: lng
      });
      showToast(`✓ Machine Check-Out recorded for ${mac.name || mac.chassis_no}`, "info");
      fetchTeamAttendance();
    } catch (err) {
      console.error("Machine check-out error:", err);
      const errMsg = err.response?.data?.detail || err.response?.data?.message || "Failed to record machine check-out.";
      showToast(`⚠️ ${errMsg}`, "error");
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
            {selectedVendorFilter === 'ALL'
              ? 'Daily roster, GPS check-in, and approvals across all vendor teams'
              : `Daily roster, GPS check-in, and approvals for ${activeVendorName}`}
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
              <div className="kpi-label">Team members</div>
              <div className="kpi-value">{activeSummaryStats.total}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Present</div>
              <div className="kpi-value">{activeSummaryStats.present}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Absent</div>
              <div className="kpi-value">{activeSummaryStats.absent}</div>
            </div>

            <div className="kpi-cell">
              <div className="kpi-label">Half day</div>
              <div className="kpi-value">{activeSummaryStats.half_day}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Leave</div>
              <div className="kpi-value">{activeSummaryStats.leave}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-label">Not marked</div>
              <div className="kpi-value">{activeSummaryStats.not_marked}</div>
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
                <option value="ALL">All Vendor Teams ({activeSummaryStats.total})</option>
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
                type="button"
                onClick={handleBulkDownloadReport}
                disabled={downloadingReport}
                style={{
                  padding: '9px 14px',
                  borderRadius: '9px',
                  border: '1px solid #bfdbfe',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <LucideDownload size={16} className={downloadingReport ? 'animate-spin' : ''} />
                {downloadingReport ? 'Downloading...' : 'Bulk Download Report'}
              </button>

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
              .filter(teamGroup => selectedVendorFilter === 'ALL' || selectedVendorFilter.trim().toLowerCase() === teamGroup.vendorName.trim().toLowerCase())
              .map(teamGroup => {
                const isExpanded = expandedVendors[teamGroup.vendorName] !== undefined
                  ? !!expandedVendors[teamGroup.vendorName]
                  : true;
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
                      <>
                        {teamGroup.members && teamGroup.members.length > 0 && (
                          <div className="table-container" style={{ borderRadius: 0, border: 'none' }}>
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th style={{ paddingLeft: '20px' }}>Employee ID & Name</th>
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
                                      <span className="badge-pill badge-purple" style={{ fontSize: '0.72rem' }}>
                                        {m.role}
                                      </span>
                                    </td>

                                    <td>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span className={`badge-pill ${m.attendance_type === 'MACHINE' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: '0.68rem', width: 'fit-content' }}>
                                          {m.attendance_type === 'MACHINE' ? '🚜 MACHINE' : '👥 TEAM'}
                                        </span>
                                        {(m.machine_chassis_no || m.assigned_machine?.chassis_no) && (
                                          <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#475569', fontWeight: '600' }}>
                                            Chassis: {m.machine_chassis_no || m.assigned_machine?.chassis_no}
                                            {m.assigned_machine?.name ? ` (${m.assigned_machine.name})` : ''}
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
                                              onClick={() => handleCheckInEmployee(m.user_id, m.external_user_id, m.vendor_id)}
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
                                              onClick={() => handleCheckOutEmployee(m.user_id, m.external_user_id, m.vendor_id)}
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

                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                          <button
                                            type="button"
                                            onClick={() => openPhotoModal(m.check_in_photo, 'CHECK_IN')}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '3px 8px',
                                              background: m.check_in_photo ? '#f0fdf4' : '#f8fafc',
                                              color: m.check_in_photo ? '#166534' : '#64748b',
                                              border: `1px solid ${m.check_in_photo ? '#bbf7d0' : '#cbd5e1'}`,
                                              borderRadius: '6px',
                                              fontSize: '0.7rem',
                                              fontWeight: '700',
                                              cursor: 'pointer',
                                              width: 'fit-content'
                                            }}
                                          >
                                            <LucideCamera size={12} /> Check-In Photo
                                          </button>

                                          {m.check_out_photo && (
                                            <button
                                              type="button"
                                              onClick={() => openPhotoModal(m.check_out_photo, 'CHECK_OUT')}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '3px 8px',
                                                background: '#eff6ff',
                                                color: '#1d4ed8',
                                                border: '1px solid #bfdbfe',
                                                borderRadius: '6px',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                width: 'fit-content'
                                              }}
                                            >
                                              <LucideCamera size={12} /> Check-Out Photo
                                            </button>
                                          )}
                                        </div>
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

                        {/* Machine Attendance Section */}
                        {teamGroup.machines && teamGroup.machines.length > 0 && (() => {
                          const hasNotWorking = teamGroup.machines.some((m) => {
                            const state = m.working_state
                              || (m.status === 'NOT_WORKING' ? 'NOT_WORKING' : null);
                            return state === 'NOT_WORKING' || m.open_oem || m.open_ops;
                          });
                          const notWorkingCount = teamGroup.machines.filter((m) => {
                            const state = m.working_state
                              || (m.status === 'NOT_WORKING' ? 'NOT_WORKING' : null);
                            return state === 'NOT_WORKING' || m.open_oem || m.open_ops;
                          }).length;

                          return (
                            <div style={{
                              background: hasNotWorking ? '#fef2f2' : '#f8fafc',
                              borderTop: `1px solid ${hasNotWorking ? '#fecaca' : '#e2e8f0'}`,
                              padding: '16px 20px',
                            }}>
                              <div style={{
                                fontSize: '0.88rem',
                                fontWeight: '700',
                                color: hasNotWorking ? '#991b1b' : '#334155',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexWrap: 'wrap',
                              }}>
                                <LucideTruck size={18} style={{ color: hasNotWorking ? '#dc2626' : '#d97706' }} />
                                <span>Assigned Machines & Equipment Attendance ({teamGroup.machines.length}) &bull; <strong style={{ color: hasNotWorking ? '#7f1d1d' : '#1e293b' }}>{teamGroup.vendorName}</strong></span>
                                {hasNotWorking && (
                                  <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: '#b91c1c',
                                    background: '#fee2e2',
                                    border: '1px solid #fecaca',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                  }}>
                                    {notWorkingCount} not working
                                  </span>
                                )}
                              </div>
                              <div className="table-container" style={{
                                borderRadius: '10px',
                                border: `1px solid ${hasNotWorking ? '#fecaca' : '#cbd5e1'}`,
                                background: '#ffffff',
                              }}>
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th style={{ paddingLeft: '16px' }}>Machine / Model</th>
                                      <th>Chassis / Machine No</th>
                                      <th>Operator</th>
                                      <th>Check-In / Out</th>
                                      <th>Telemetry / Photos</th>
                                      <th>Working status</th>
                                      <th>Issue / Reason</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {teamGroup.machines.map(mac => {
                                      const workingState = mac.working_state
                                        || (mac.status === 'NOT_WORKING' ? 'NOT_WORKING'
                                          : (['CHECKED_IN', 'PRESENT', 'OPERATING', 'CHECKED_OUT', 'WORKING'].includes(mac.status) ? 'WORKING' : 'NOT_MARKED'));
                                      const isWorking = workingState === 'WORKING';
                                      const isNotWorking = workingState === 'NOT_WORKING';
                                      const issueKind = mac.issue_kind;
                                      const issueReason = mac.issue_reason || mac.notes || '';
                                      const issueTicket = mac.issue_ticket;
                                      const attStatus = mac.attendance_status || (isNotWorking ? null : mac.status);

                                      return (
                                        <tr key={mac.machine_id || mac.chassis_no || mac.machine_no}>
                                          <td style={{ paddingLeft: '16px' }}>
                                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{mac.name}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{mac.code}</div>
                                          </td>
                                          <td>
                                            <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.8rem', color: '#1e293b' }}>
                                              {mac.chassis_no || mac.machine_no}
                                            </span>
                                          </td>
                                          <td>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#475569' }}>
                                              👤 {mac.operator_name || 'Unassigned'}
                                            </span>
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '600', color: mac.check_in ? '#047857' : '#94a3b8' }}>
                                                  In: {mac.check_in || '--:--'}
                                                </span>
                                                {!mac.check_in && !isNotWorking && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleCheckInMachine(mac)}
                                                    style={{ padding: '2px 6px', fontSize: '0.7rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}
                                                  >
                                                    Check In
                                                  </button>
                                                )}
                                              </div>

                                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '600', color: mac.check_out ? '#1d4ed8' : '#94a3b8' }}>
                                                  Out: {mac.check_out || '--:--'}
                                                </span>
                                                {mac.check_in && !mac.check_out && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleCheckOutMachine(mac)}
                                                    style={{ padding: '2px 6px', fontSize: '0.7rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}
                                                  >
                                                    Check Out
                                                  </button>
                                                )}
                                              </div>

                                              {mac.total_working_hours && (
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700' }}>
                                                  ⏱ {mac.total_working_hours}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              {mac.check_in_latitude ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>
                                                  <LucideMapPin size={12} />
                                                  <span>{Number(mac.check_in_latitude).toFixed(4)}, {Number(mac.check_in_longitude).toFixed(4)}</span>
                                                  {mac.check_in_accuracy && <span style={{ color: '#64748b', fontSize: '0.68rem' }}>(±{mac.check_in_accuracy}m)</span>}
                                                </div>
                                              ) : (
                                                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>No GPS log</span>
                                              )}

                                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                <button
                                                  type="button"
                                                  onClick={() => openPhotoModal(mac.check_in_photo, 'CHECK_IN')}
                                                  style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '3px 8px',
                                                    background: mac.check_in_photo ? '#f0fdf4' : '#f8fafc',
                                                    color: mac.check_in_photo ? '#166534' : '#64748b',
                                                    border: `1px solid ${mac.check_in_photo ? '#bbf7d0' : '#cbd5e1'}`,
                                                    borderRadius: '6px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    width: 'fit-content'
                                                  }}
                                                >
                                                  <LucideCamera size={12} /> Check-In Photo
                                                </button>

                                                {mac.check_out_photo && (
                                                  <button
                                                    type="button"
                                                    onClick={() => openPhotoModal(mac.check_out_photo, 'CHECK_OUT')}
                                                    style={{
                                                      display: 'inline-flex',
                                                      alignItems: 'center',
                                                      gap: '4px',
                                                      padding: '3px 8px',
                                                      background: '#eff6ff',
                                                      color: '#1d4ed8',
                                                      border: '1px solid #bfdbfe',
                                                      borderRadius: '6px',
                                                      fontSize: '0.7rem',
                                                      fontWeight: '700',
                                                      cursor: 'pointer',
                                                      width: 'fit-content'
                                                    }}
                                                  >
                                                    <LucideCamera size={12} /> Check-Out Photo
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                                              {isWorking && (
                                                <span className="badge-pill badge-green" style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                                                  Working
                                                </span>
                                              )}
                                              {isNotWorking && (
                                                <span className="badge-pill badge-amber" style={{ fontSize: '0.72rem', fontWeight: '700', background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}>
                                                  Not Working
                                                </span>
                                              )}
                                              {!isWorking && !isNotWorking && (
                                                <span className="badge-pill badge-amber" style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                                                  Not marked
                                                </span>
                                              )}
                                              {attStatus && attStatus !== 'NOT_MARKED' && (
                                                <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                                                  Attendance: {attStatus.replace(/_/g, ' ')}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td style={{ minWidth: 180, maxWidth: 280 }}>
                                            {isNotWorking ? (
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                  <span
                                                    className="badge-pill"
                                                    style={{
                                                      fontSize: '0.68rem',
                                                      fontWeight: 700,
                                                      background: issueKind === 'OEM' ? '#fff7ed' : '#eff6ff',
                                                      color: issueKind === 'OEM' ? '#c2410c' : '#1d4ed8',
                                                      border: `1px solid ${issueKind === 'OEM' ? '#fed7aa' : '#bfdbfe'}`,
                                                    }}
                                                  >
                                                    {issueKind === 'OEM' ? (
                                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <LucideWrench size={11} /> OEM Breakdown
                                                      </span>
                                                    ) : (
                                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <LucideAlertTriangle size={11} /> Ops Stop
                                                      </span>
                                                    )}
                                                  </span>
                                                  {issueTicket && (
                                                    <button
                                                      type="button"
                                                      onClick={() => navigate('/breakdown')}
                                                      style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        color: '#0369a1',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 3,
                                                      }}
                                                    >
                                                      {issueTicket} <LucideExternalLink size={11} />
                                                    </button>
                                                  )}
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600, lineHeight: 1.35 }}>
                                                  {issueReason || 'No reason provided'}
                                                </div>
                                                {mac.issue_severity && (
                                                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                    Severity: {String(mac.issue_severity).toUpperCase()}
                                                  </div>
                                                )}
                                              </div>
                                            ) : isWorking ? (
                                              <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600 }}>
                                                Machine attendance marked
                                              </span>
                                            ) : (
                                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                No attendance or open issue
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={handleBulkDownloadReport}
                disabled={downloadingReport}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: '1px solid #bfdbfe',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <LucideDownload size={14} className={downloadingReport ? 'animate-spin' : ''} />
                {downloadingReport ? 'Exporting...' : 'Export CSV'}
              </button>

              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Showing <strong style={{ color: '#0f172a' }}>{historyRecords.length}</strong> attendance records
              </div>
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
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => openPhotoModal(r.check_in_photo, 'CHECK_IN')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              background: r.check_in_photo ? '#f0fdf4' : '#f8fafc',
                              color: r.check_in_photo ? '#166534' : '#64748b',
                              border: `1px solid ${r.check_in_photo ? '#bbf7d0' : '#cbd5e1'}`,
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              width: 'fit-content'
                            }}
                          >
                            <LucideCamera size={12} /> Check-In Photo
                          </button>
                          {r.check_out_photo && (
                            <button
                              type="button"
                              onClick={() => openPhotoModal(r.check_out_photo, 'CHECK_OUT')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                width: 'fit-content'
                              }}
                            >
                              <LucideCamera size={12} /> Check-Out Photo
                            </button>
                          )}
                        </div>
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
                  <th style={{ paddingLeft: '20px' }}>Employee & Vendor</th>
                  <th>Attendance Date</th>
                  <th>Check-In / Out (IST)</th>
                  <th>Working Hours</th>
                  <th>Selfie Photo & GPS Telemetry</th>
                  <th>Manager</th>
                  <th>Approval Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingRecords.map(r => {
                  const checkInTele = {
                    userName: r.user_name || `User #${r.user}`,
                    employeeId: r.employee_id || `EMP-${r.user}`,
                    vendorName: r.vendor_name || 'Vendor',
                    date: formatDisplayDate(r.date || r.created_at),
                    time: formatISTTime(r.check_in),
                    lat: r.check_in_latitude,
                    lng: r.check_in_longitude,
                    accuracy: r.check_in_accuracy
                  };

                  const checkOutTele = {
                    userName: r.user_name || `User #${r.user}`,
                    employeeId: r.employee_id || `EMP-${r.user}`,
                    vendorName: r.vendor_name || 'Vendor',
                    date: formatDisplayDate(r.date || r.created_at),
                    time: formatISTTime(r.check_out),
                    lat: r.check_out_latitude || r.check_in_latitude,
                    lng: r.check_out_longitude || r.check_in_longitude,
                    accuracy: r.check_out_accuracy
                  };

                  return (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.88rem' }}>
                            {r.user_name || `User #${r.user}`}
                          </span>
                          <span className={`badge-pill ${r.attendance_type === 'MACHINE' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                            {r.attendance_type || 'TEAM'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#2563eb', fontWeight: '700' }}>
                            {r.employee_id || `EMP-${r.user}`}
                          </span>
                          {r.vendor_name && (
                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <LucideBuilding2 size={11} /> {r.vendor_name}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '700', color: '#1e293b', fontSize: '0.82rem' }}>
                          <LucideCalendarCheck size={14} color="#0284c7" />
                          {formatDisplayDate(r.date || r.created_at)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '19px', marginTop: '2px' }}>
                          Shift: {r.shift || 'DAY'}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: '600', color: '#047857' }}>
                            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }}></span>
                            <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '700', minWidth: '26px' }}>IN:</span>
                            <span>{r.check_in ? formatISTTime(r.check_in) : '—'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: '600', color: r.check_out ? '#b91c1c' : '#d97706' }}>
                            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: r.check_out ? '#ef4444' : '#f59e0b' }}></span>
                            <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '700', minWidth: '26px' }}>OUT:</span>
                            <span>{r.check_out ? formatISTTime(r.check_out) : '⏳ In Progress'}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: r.total_working_hours ? '#ecfdf5' : '#fffbeb',
                          border: `1px solid ${r.total_working_hours ? '#a7f3d0' : '#fde68a'}`,
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          color: r.total_working_hours ? '#065f46' : '#92400e'
                        }}>
                          {r.total_working_hours || 'In Progress'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {r.check_in_photo && (
                              <div
                                onClick={() => openPhotoModal(r.check_in_photo, 'CHECK_IN', checkInTele)}
                                title="Click to view Check-In Selfie photo"
                                style={{
                                  position: 'relative',
                                  cursor: 'pointer',
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  border: '2px solid #10b981',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                                  flexShrink: 0
                                }}
                              >
                                <img
                                  src={normalizeHeroPhotoUrl(r.check_in_photo)}
                                  alt="Check-In"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    if (e.target.parentElement) {
                                      e.target.parentElement.style.background = '#dcfce7';
                                      e.target.parentElement.style.display = 'flex';
                                      e.target.parentElement.style.alignItems = 'center';
                                      e.target.parentElement.style.justifyContent = 'center';
                                      e.target.parentElement.innerHTML = '<span style="font-size:10px;font-weight:800;color:#166534">IN</span>';
                                    }
                                  }}
                                />
                                <span style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  background: 'rgba(16, 185, 129, 0.9)',
                                  color: '#ffffff',
                                  fontSize: '8px',
                                  fontWeight: '800',
                                  textAlign: 'center',
                                  lineHeight: '12px'
                                }}>
                                  IN
                                </span>
                              </div>
                            )}

                            {r.check_out_photo && (
                              <div
                                onClick={() => openPhotoModal(r.check_out_photo, 'CHECK_OUT', checkOutTele)}
                                title="Click to view Check-Out Selfie photo"
                                style={{
                                  position: 'relative',
                                  cursor: 'pointer',
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  border: '2px solid #3b82f6',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                                  flexShrink: 0
                                }}
                              >
                                <img
                                  src={normalizeHeroPhotoUrl(r.check_out_photo)}
                                  alt="Check-Out"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    if (e.target.parentElement) {
                                      e.target.parentElement.style.background = '#dbeafe';
                                      e.target.parentElement.style.display = 'flex';
                                      e.target.parentElement.style.alignItems = 'center';
                                      e.target.parentElement.style.justifyContent = 'center';
                                      e.target.parentElement.innerHTML = '<span style="font-size:10px;font-weight:800;color:#1e40af">OUT</span>';
                                    }
                                  }}
                                />
                                <span style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  background: 'rgba(59, 130, 246, 0.9)',
                                  color: '#ffffff',
                                  fontSize: '8px',
                                  fontWeight: '800',
                                  textAlign: 'center',
                                  lineHeight: '12px'
                                }}>
                                  OUT
                                </span>
                              </div>
                            )}

                            {!r.check_in_photo && !r.check_out_photo && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                background: '#f8fafc',
                                color: '#94a3b8',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: '600'
                              }}>
                                <LucideCameraOff size={12} /> No Photo
                              </span>
                            )}
                          </div>

                          <div>
                            {r.check_in_latitude ? (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${r.check_in_latitude},${r.check_in_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open GPS in Google Maps"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.72rem',
                                  color: '#047857',
                                  fontWeight: '600',
                                  textDecoration: 'none',
                                  background: '#ecfdf5',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #a7f3d0'
                                }}
                              >
                                <LucideMapPin size={11} /> {Number(r.check_in_latitude).toFixed(4)}, {Number(r.check_in_longitude).toFixed(4)}
                                <LucideExternalLink size={9} style={{ opacity: 0.7 }} />
                              </a>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <LucideMapPin size={11} /> No GPS
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>
                          {r.reporting_manager_name || 'System Manager'}
                        </span>
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
                  );
                })}

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
      {photoModal.open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '580px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
            <div style={{ padding: '14px 20px', background: '#f8fafc', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: '700', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LucideCamera size={18} color="#059669" /> {photoModal.title}
              </div>
              <button
                onClick={() => setPhotoModal({ open: false, url: null, type: 'CHECK_IN', title: '', userName: '', employeeId: '', vendorName: '', date: '', time: '', lat: null, lng: null, accuracy: null })}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <LucideX size={20} />
              </button>
            </div>

            {/* Telemetry metadata sub-banner */}
            {(photoModal.userName || photoModal.date || photoModal.time || photoModal.lat) && (
              <div style={{
                padding: '10px 20px',
                background: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px 20px',
                fontSize: '0.78rem',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>EMPLOYEE</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>{photoModal.userName || 'Employee'}</span>
                  {photoModal.employeeId && (
                    <span style={{ marginLeft: '4px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#2563eb', fontWeight: '700' }}>
                      ({photoModal.employeeId})
                    </span>
                  )}
                </div>

                {photoModal.vendorName && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>VENDOR</span>
                    <span style={{ fontWeight: '600', color: '#334155' }}>{photoModal.vendorName}</span>
                  </div>
                )}

                {photoModal.date && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>DATE</span>
                    <span style={{ fontWeight: '600', color: '#334155' }}>📅 {photoModal.date}</span>
                  </div>
                )}

                {photoModal.time && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>TIME (IST)</span>
                    <span style={{ fontWeight: '700', color: photoModal.type === 'CHECK_OUT' ? '#b91c1c' : '#047857' }}>
                      🕒 {photoModal.time}
                    </span>
                  </div>
                )}

                {photoModal.lat && photoModal.lng && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>GPS</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${photoModal.lat},${photoModal.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        color: '#0284c7',
                        fontWeight: '700',
                        textDecoration: 'none',
                        fontSize: '0.75rem'
                      }}
                    >
                      📍 {Number(photoModal.lat).toFixed(4)}, {Number(photoModal.lng).toFixed(4)}
                      <LucideExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>
            )}

            <div style={{ padding: '24px 20px', textAlign: 'center', background: '#0f172a', minHeight: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              {!photoModal.url ? (
                <div style={{ padding: '32px 20px', background: '#1e293b', borderRadius: '10px', color: '#f8fafc', width: '100%' }}>
                  <LucideCamera size={48} style={{ color: '#64748b', marginBottom: '12px' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '8px' }}>
                    {photoModal.type === 'CHECK_OUT' ? 'No check-out photo available' : 'No check-in photo available'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', maxWidth: '380px', margin: '0 auto' }}>
                    No selfie photo file was submitted with this attendance entry.
                  </div>
                </div>
              ) : photoLoadError ? (
                <div style={{ padding: '24px 20px', background: '#1e293b', borderRadius: '10px', color: '#f8fafc', width: '100%' }}>
                  <LucideAlertCircle size={44} style={{ color: '#ef4444', marginBottom: '12px' }} />
                  <div style={{ fontSize: '1.02rem', fontWeight: '700', marginBottom: '8px', color: '#fca5a5' }}>
                    Unable to load photo file
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', maxWidth: '400px', margin: '0 auto 14px auto', lineHeight: '1.4' }}>
                    The attendance selfie photo could not be fetched from storage. The file may be missing or restricted.
                  </div>
                  <div style={{ wordBreak: 'break-all', fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace', background: '#0f172a', padding: '8px 12px', borderRadius: '6px', marginBottom: '14px', border: '1px solid #334155' }}>
                    {photoModal.url}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <a
                      href={photoModal.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 14px', background: '#2563eb', color: '#ffffff', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700', textDecoration: 'none' }}
                    >
                      <LucideExternalLink size={14} /> Open Direct Photo Link
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {photoLoading && (
                    <div style={{ padding: '40px 20px', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <LucideRefreshCw size={28} className="animate-spin" style={{ color: '#38bdf8' }} />
                      <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>Loading selfie photo...</span>
                    </div>
                  )}
                  <img
                    src={photoModal.url}
                    alt={photoModal.type === 'CHECK_OUT' ? 'Check-Out Selfie' : 'Check-In Selfie'}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '420px',
                      borderRadius: '8px',
                      objectFit: 'contain',
                      display: photoLoading ? 'none' : 'block'
                    }}
                    onLoad={() => setPhotoLoading(false)}
                    onError={(e) => {
                      const currentSrc = e.target.src || '';
                      const retried = e.target.getAttribute('data-retried');

                      if (!retried && currentSrc.includes('hero.pramaanu.co.in')) {
                        e.target.setAttribute('data-retried', 'true');
                        const relPath = currentSrc.replace(/^https?:\/\/[^\/]+/, '');
                        if (relPath && relPath !== currentSrc) {
                          e.target.src = relPath;
                          return;
                        }
                      }
                      setPhotoLoading(false);
                      setPhotoLoadError(true);
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {photoModal.url ? (
                  <a
                    href={photoModal.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', fontWeight: '600', textDecoration: 'none' }}
                  >
                    <LucideExternalLink size={13} /> View Full Resolution
                  </a>
                ) : 'No Media Attached'}
              </div>
              <button
                onClick={() => setPhotoModal({ open: false, url: null, type: 'CHECK_IN', title: '', userName: '', employeeId: '', vendorName: '', date: '', time: '', lat: null, lng: null, accuracy: null })}
                style={{ padding: '8px 18px', background: '#334155', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
              >
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
