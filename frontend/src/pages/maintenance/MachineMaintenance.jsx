import React, { useState, useEffect } from 'react';
import {
  LucideWrench,
  LucideCheckCircle2,
  LucideClock,
  LucideAlertTriangle,
  LucideAlertOctagon,
  LucideTruck,
  LucideSearch,
  LucideFilter,
  LucideRefreshCw,
  LucidePlus,
  LucideShield,
  LucideEye,
  LucideCalendar,
  LucideGauge,
  LucideBuilding2,
  LucideUser,
  LucideHistory,
  LucideChevronRight,
  LucideBookOpen
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { maintenanceService } from '../../services/maintenanceService';
import { vendorService } from '../../services/vendorService';
import { MaintenanceFormModal } from './MaintenanceFormModal';
import { MaintenanceHistoryModal } from './MaintenanceHistoryModal';
import { SafetyGuidelinesModal } from './SafetyGuidelinesModal';
import { MaintenanceDetailModal } from './MaintenanceDetailModal';
import '../../styles/screens.css';

const FREQUENCY_DISPLAY_MAP = {
  DAILY: 'Daily',
  '50_HOURS': '50 Hours',
  '100_HOURS': '100 Hours',
  '250_HOURS': '250 Hours',
  '500_HOURS': '500 Hours',
  '1000_HOURS': '1000 Hours',
};

export const MachineMaintenance = () => {
  const { user, isAdmin, vendors } = useAuth();

  // Dashboard Data State
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    total_machines: 0,
    maintenance_due: 0,
    maintenance_completed: 0,
    pending_maintenance: 0,
    overdue_maintenance: 0
  });
  const [roleInfo, setRoleInfo] = useState({
    role: 'OPERATOR',
    is_admin: false,
    allowed_frequencies: ['DAILY', '50_HOURS'],
    allowed_frequency_labels: []
  });
  const [machines, setMachines] = useState([]);
  const [vendorList, setVendorList] = useState([]);

  // Filter States
  const [frequencyFilter, setFrequencyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('all');

  // Modals State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialMachine, setFormInitialMachine] = useState(null);
  const [formInitialFrequency, setFormInitialFrequency] = useState('DAILY');

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTargetMachine, setHistoryTargetMachine] = useState(null);

  const [isSopOpen, setIsSopOpen] = useState(false);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLogDetail, setSelectedLogDetail] = useState(null);

  // Fetch Vendor List for Admin
  useEffect(() => {
    if (isAdmin) {
      vendorService.getVendors({ page: 0, size: 50 })
        .then(res => {
          const list = res.data?.data?.results || res.data?.results || res.data?.content || res.data || [];
          setVendorList(Array.isArray(list) ? list : []);
        })
        .catch(console.error);
    }
  }, [isAdmin]);

  // Fetch Dashboard Data
  const fetchDashboardData = () => {
    setLoading(true);
    const params = {};
    if (frequencyFilter && frequencyFilter !== 'ALL') {
      params.frequency = frequencyFilter;
    }
    if (selectedVendor && selectedVendor !== 'all') {
      params.vendor_id = selectedVendor;
    }
    if (searchQuery) {
      params.search = searchQuery;
    }

    maintenanceService.getDashboard(params)
      .then(res => {
        const payload = res.data?.data || res.data || {};
        if (payload.kpis) setKpis(payload.kpis);
        if (payload.role_info) setRoleInfo(payload.role_info);
        if (Array.isArray(payload.machines)) setMachines(payload.machines);
      })
      .catch(err => {
        console.error("Failed to load maintenance dashboard:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
  }, [frequencyFilter, selectedVendor]);

  // Filter machines locally based on status and search
  const filteredMachines = machines.filter(m => {
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const codeMatch = (m.code || '').toLowerCase().includes(q);
      const nameMatch = (m.name || '').toLowerCase().includes(q);
      const vendorMatch = (m.vendor_name || '').toLowerCase().includes(q);
      const opMatch = (m.operator_name || '').toLowerCase().includes(q);
      return codeMatch || nameMatch || vendorMatch || opMatch;
    }
    return true;
  });

  const handleOpenFormForMachine = (machine, defaultFreq) => {
    setFormInitialMachine(machine);
    const validFreq = defaultFreq || (roleInfo.allowed_frequencies?.[0] || 'DAILY');
    setFormInitialFrequency(validFreq);
    setIsFormOpen(true);
  };

  const handleOpenHistoryForMachine = (machine) => {
    setHistoryTargetMachine(machine);
    setIsHistoryOpen(true);
  };

  const handleViewLastMaintenanceDetail = (lastMaintId) => {
    if (!lastMaintId) return;
    maintenanceService.getHistoryDetail(lastMaintId)
      .then(res => {
        setSelectedLogDetail(res.data?.data || res.data);
        setIsDetailOpen(true);
      })
      .catch(err => {
        console.error("Failed to load log detail:", err);
      });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <LucideCheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'DUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <LucideClock className="w-3 h-3" /> Due Soon
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <LucideAlertOctagon className="w-3 h-3" /> Overdue
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <LucideClock className="w-3 h-3" /> Pending
          </span>
        );
    }
  };

  const roleNameDisplay = (roleInfo.role || 'OPERATOR').replace('_', ' ');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Operations</span>
            <LucideChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-amber-400 font-medium">Machine Maintenance</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <LucideWrench className="w-5 h-5" />
            </div>
            Machine Preventive Maintenance
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Digitized machine preventive maintenance schedules, role-based checklists, and photo audit verification
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsSopOpen(true)}
            className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <LucideBookOpen className="w-4 h-4 text-cyan-400" />
            <span>Safety Guidelines & SOP</span>
          </button>

          <button
            onClick={fetchDashboardData}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition-colors shadow-sm"
            title="Refresh Dashboard"
          >
            <LucideRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            onClick={() => {
              setFormInitialMachine(null);
              setFormInitialFrequency(roleInfo.allowed_frequencies?.[0] || 'DAILY');
              setIsFormOpen(true);
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20"
          >
            <LucidePlus className="w-4 h-4" />
            <span>Perform Maintenance Check</span>
          </button>
        </div>
      </div>

      {/* Role-Based Access Scope Banner */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <LucideShield className="w-4 h-4" />
          </div>
          <div>
            <span className="text-slate-400">Authenticated Role:</span>{' '}
            <strong className="text-slate-100 uppercase">{roleNameDisplay}</strong>
            {roleInfo.is_admin ? (
              <span className="ml-2 text-amber-400 font-semibold">(Admin Access: All Maintenance Frequencies)</span>
            ) : (
              <span className="ml-2 text-slate-300">
                — Assigned Checklists:{' '}
                <strong className="text-emerald-400 font-mono">
                  {roleInfo.allowed_frequencies?.map(f => FREQUENCY_DISPLAY_MAP[f] || f).join(', ')}
                </strong>
              </span>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono">
          Apollo HDD A600V2 Digitize Module v1.0
        </div>
      </div>

      {/* SECTION 3: KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Machines */}
        <div className="p-4 rounded-2xl bg-[#12161f] border border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Total Machines</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <LucideTruck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono">
            {kpis.total_machines}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Active fleet in master</span>
        </div>

        {/* Maintenance Due */}
        <div className="p-4 rounded-2xl bg-[#12161f] border border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-amber-400 mb-2">
            <span className="text-xs font-semibold">Maintenance Due</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <LucideClock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {kpis.maintenance_due}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Require inspection</span>
        </div>

        {/* Maintenance Completed */}
        <div className="p-4 rounded-2xl bg-[#12161f] border border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-xs font-semibold">Completed Checks</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <LucideCheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {kpis.maintenance_completed}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">With photo evidence</span>
        </div>

        {/* Pending Maintenance */}
        <div className="p-4 rounded-2xl bg-[#12161f] border border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-cyan-400 mb-2">
            <span className="text-xs font-semibold">Pending Checks</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <LucideClock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-cyan-400 font-mono">
            {kpis.pending_maintenance}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Scheduled in cycle</span>
        </div>

        {/* Overdue Maintenance */}
        <div className="p-4 rounded-2xl bg-[#12161f] border border-slate-800 shadow-sm relative overflow-hidden group col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-rose-400 mb-2">
            <span className="text-xs font-semibold">Overdue Maintenance</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <LucideAlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">
            {kpis.overdue_maintenance}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Immediate action required</span>
        </div>
      </div>

      {/* FREQUENCY-WISE FILTERS & CONTROLS */}
      <div className="bg-[#12161f] border border-slate-800 rounded-2xl p-4 space-y-4">
        {/* Frequency Tabs (Role-Based) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1.5 shrink-0">
              <LucideFilter className="w-3.5 h-3.5 text-amber-400" />
              Frequency:
            </span>

            {/* Admin has "All Frequencies" option */}
            {roleInfo.is_admin && (
              <button
                onClick={() => setFrequencyFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  frequencyFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                All Frequencies
              </button>
            )}

            {/* Display Allowed Frequencies for User's Role */}
            {roleInfo.allowed_frequencies?.map(freqCode => (
              <button
                key={freqCode}
                onClick={() => setFrequencyFilter(freqCode)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  frequencyFilter === freqCode
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {FREQUENCY_DISPLAY_MAP[freqCode] || freqCode}
              </button>
            ))}
          </div>

          {/* Quick Total Count */}
          <span className="text-xs text-slate-400 shrink-0">
            Showing <strong className="text-slate-200 font-mono">{filteredMachines.length}</strong> of{' '}
            <strong className="text-slate-200 font-mono">{machines.length}</strong> machines
          </span>
        </div>

        {/* Secondary Filter & Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Search Input */}
          <div className="relative">
            <LucideSearch className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search machine, code, operator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#161c28] border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#161c28] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="DUE">Maintenance Due</option>
              <option value="OVERDUE">Overdue</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Vendor Filter (if Admin) */}
          {isAdmin && (
            <div>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className="w-full bg-[#161c28] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Vendors</option>
                {vendorList.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reset Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setFrequencyFilter('ALL');
                setStatusFilter('ALL');
                setSearchQuery('');
                setSelectedVendor('all');
              }}
              className="w-full py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors text-center"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* MACHINE-WISE MAINTENANCE HISTORY & FLEET STATUS TABLE */}
      <div className="bg-[#12161f] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LucideHistory className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Machine-wise Maintenance Status & History
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {filteredMachines.length} Machines Listed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-[#161c28] text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Machine ID & Name</th>
                <th className="py-3 px-4">Model & Hours</th>
                <th className="py-3 px-4">Vendor & Operator</th>
                <th className="py-3 px-4">Last Maintenance</th>
                <th className="py-3 px-4">Next Inspection</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400">
                    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-xs">Loading machine maintenance data...</p>
                  </td>
                </tr>
              ) : filteredMachines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-500">
                    <LucideWrench className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="font-semibold text-slate-400">No machines match the selected filters.</p>
                  </td>
                </tr>
              ) : (
                filteredMachines.map(m => (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Machine ID & Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-100 text-sm">
                          {m.code || `MAC-${m.id}`}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block truncate max-w-xs">
                        {m.name}
                      </span>
                    </td>

                    {/* Model & Hours */}
                    <td className="py-3.5 px-4 font-mono">
                      <span className="text-slate-200 block text-xs">
                        {m.model_name || 'APOLLO A600 V2'}
                      </span>
                      <span className="text-amber-400 font-bold flex items-center gap-1 mt-0.5">
                        <LucideGauge className="w-3 h-3 text-slate-500" />
                        {m.engine_hours} hrs
                      </span>
                    </td>

                    {/* Vendor & Operator */}
                    <td className="py-3.5 px-4 text-xs">
                      <span className="text-slate-200 font-medium block truncate max-w-[160px]">
                        {m.vendor_name || 'HERO / Direct'}
                      </span>
                      <span className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                        <LucideUser className="w-3 h-3 text-slate-500" />
                        {m.operator_name || 'Unassigned'}
                      </span>
                    </td>

                    {/* Last Maintenance */}
                    <td className="py-3.5 px-4">
                      {m.last_maintenance ? (
                        <div
                          onClick={() => handleViewLastMaintenanceDetail(m.last_maintenance.id)}
                          className="cursor-pointer group/last"
                          title="Click to view full checklist and photos"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {m.last_maintenance.frequency}
                            </span>
                            <span className="text-xs text-slate-200 group-hover/last:underline">
                              {m.last_maintenance.date}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 block mt-0.5">
                            By {m.last_maintenance.performed_by} ({m.last_maintenance.hour_meter} hrs)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Never Recorded</span>
                      )}
                    </td>

                    {/* Next Inspection */}
                    <td className="py-3.5 px-4">
                      <span className="text-slate-300 font-medium block text-xs">
                        {m.next_due_label || 'Daily Inspection'}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Site: {m.location_name || 'Operational'}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(m.status)}
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenFormForMachine(m)}
                          className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          title="Start preventive maintenance checklist"
                        >
                          <LucideWrench className="w-3.5 h-3.5" />
                          <span>Check</span>
                        </button>

                        <button
                          onClick={() => handleOpenHistoryForMachine(m)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                          title="View complete maintenance history"
                        >
                          <LucideHistory className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALS */}
      {/* 1. Maintenance Form Modal */}
      {isFormOpen && (
        <MaintenanceFormModal
          isOpen={true}
          onClose={() => setIsFormOpen(false)}
          initialMachine={formInitialMachine}
          initialFrequency={formInitialFrequency}
          allowedFrequencies={roleInfo.allowed_frequencies}
          user={user}
          onSuccess={(newRecord) => {
            fetchDashboardData();
            if (newRecord) {
              setSelectedLogDetail(newRecord);
              setIsDetailOpen(true);
            }
          }}
        />
      )}

      {/* 2. Machine-wise Maintenance History Modal */}
      {isHistoryOpen && (
        <MaintenanceHistoryModal
          isOpen={true}
          onClose={() => setIsHistoryOpen(false)}
          machine={historyTargetMachine}
          onStartNewMaintenance={(m) => handleOpenFormForMachine(m)}
        />
      )}

      {/* 3. Safety Guidelines & SOP Modal */}
      {isSopOpen && (
        <SafetyGuidelinesModal
          isOpen={true}
          onClose={() => setIsSopOpen(false)}
        />
      )}

      {/* 4. Maintenance Detail Modal */}
      {isDetailOpen && (
        <MaintenanceDetailModal
          isOpen={true}
          onClose={() => setIsDetailOpen(false)}
          record={selectedLogDetail}
        />
      )}
    </div>
  );
};

