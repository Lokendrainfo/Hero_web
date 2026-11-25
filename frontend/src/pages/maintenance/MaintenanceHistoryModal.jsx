import React, { useState, useEffect } from 'react';
import {
  LucideX,
  LucideCalendar,
  LucideCheckCircle2,
  LucideAlertCircle,
  LucideClock,
  LucideUser,
  LucideGauge,
  LucideTruck,
  LucideEye,
  LucideFilter
} from 'lucide-react';
import { maintenanceService } from '../../services/maintenanceService';
import { MaintenanceDetailModal } from './MaintenanceDetailModal';

export const MaintenanceHistoryModal = ({ isOpen, onClose, machine, onStartNewMaintenance }) => {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [recordDetail, setRecordDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [freqFilter, setFreqFilter] = useState('ALL');

  useEffect(() => {
    if (isOpen && machine) {
      setLoading(true);
      const params = { machine_id: machine.id };
      if (freqFilter !== 'ALL') {
        params.frequency = freqFilter;
      }
      maintenanceService.getHistory(params)
        .then(res => {
          const list = res.data?.data || res.data || [];
          setHistoryList(Array.isArray(list) ? list : []);
        })
        .catch(err => {
          console.error("Failed to load history:", err);
          setHistoryList([]);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, machine, freqFilter]);

  const handleOpenDetail = (recordId) => {
    setSelectedRecordId(recordId);
    setLoadingDetail(true);
    maintenanceService.getHistoryDetail(recordId)
      .then(res => {
        setRecordDetail(res.data?.data || res.data);
      })
      .catch(err => {
        console.error("Failed to load record details:", err);
      })
      .finally(() => setLoadingDetail(false));
  };

  if (!isOpen || !machine) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-[#12161f] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#161c28]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <LucideTruck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  Maintenance History – {machine.code || `MAC-${machine.id}`}
                </h2>
                <p className="text-xs text-slate-400">
                  {machine.name} • {machine.model_name || 'APOLLO A600 V2'} • {machine.engine_hours || 0} Hours
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onStartNewMaintenance && (
                <button
                  onClick={() => {
                    onClose();
                    onStartNewMaintenance(machine);
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                >
                  + New Check
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
              >
                <LucideX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-[#0d1117] text-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-slate-500 flex items-center gap-1">
                <LucideFilter className="w-3.5 h-3.5" /> Frequency:
              </span>
              {['ALL', 'DAILY', '50_HOURS', '100_HOURS', '250_HOURS', '500_HOURS', '1000_HOURS'].map(f => (
                <button
                  key={f}
                  onClick={() => setFreqFilter(f)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    freqFilter === f
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {f === 'ALL' ? 'All Frequencies' : f.replace('_', ' ')}
                </button>
              ))}
            </div>

            <span className="text-slate-500">
              Total Records: <strong className="text-slate-300">{historyList.length}</strong>
            </span>
          </div>

          {/* History List Table / Cards */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs">Loading machine maintenance logs...</p>
              </div>
            ) : historyList.length === 0 ? (
              <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                <LucideClock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-slate-300 mb-1">No Maintenance Records Found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                  No preventive maintenance has been recorded yet for this machine under the selected frequency.
                </p>
                {onStartNewMaintenance && (
                  <button
                    onClick={() => {
                      onClose();
                      onStartNewMaintenance(machine);
                    }}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-amber-400"
                  >
                    Perform First Maintenance
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {historyList.map(record => (
                  <div
                    key={record.id}
                    onClick={() => handleOpenDetail(record.id)}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700 transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {record.frequency}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-semibold ${
                            record.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {record.status}
                        </span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <LucideCalendar className="w-3 h-3" />
                          {new Date(record.maintenance_date).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <LucideGauge className="w-3.5 h-3.5 text-slate-500" />
                          Reading: <strong className="text-slate-200">{record.hour_meter_reading} hrs</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <LucideUser className="w-3.5 h-3.5 text-slate-500" />
                          By: <strong className="text-slate-200">{record.performed_by_name || 'Technician'}</strong> ({record.performed_by_role || 'Operator'})
                        </span>
                        <span>
                          Checklist Items: <strong className="text-emerald-400">{record.completed_items_count}</strong> / {record.total_items}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className="text-xs text-amber-400 group-hover:underline flex items-center gap-1">
                        <LucideEye className="w-3.5 h-3.5" /> View Checklist
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-[#161c28]">
            <span className="text-xs text-slate-500">
              Showing historical preventive maintenance logs for {machine.code}.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Record Detail Modal */}
      {recordDetail && (
        <MaintenanceDetailModal
          isOpen={true}
          onClose={() => setRecordDetail(null)}
          record={recordDetail}
        />
      )}
    </>
  );
};

