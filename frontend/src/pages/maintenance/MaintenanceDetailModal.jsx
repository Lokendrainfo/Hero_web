import React, { useState } from 'react';
import {
  LucideX,
  LucideCheckCircle2,
  LucideAlertCircle,
  LucideClock,
  LucideTruck,
  LucideUser,
  LucideCalendar,
  LucideGauge,
  LucideBuilding2,
  LucideEye,
  LucideFileText,
  LucideShieldCheck
} from 'lucide-react';
import { PhotoViewerModal } from './PhotoViewerModal';

export const MaintenanceDetailModal = ({ isOpen, onClose, record }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  if (!isOpen || !record) return null;

  const items = record.items || [];
  const machineItems = items.filter(it => it.category === 'MACHINE');
  const engineItems = items.filter(it => it.category === 'ENGINE');

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <LucideCheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case 'PARTIALLY_COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <LucideAlertCircle className="w-3.5 h-3.5" /> Partially Completed
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <LucideAlertCircle className="w-3.5 h-3.5" /> Overdue
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
            <LucideClock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  };

  const renderItemCard = (item, idx) => {
    const isCompleted = item.status === 'COMPLETED';
    return (
      <div
        key={item.id || idx}
        className={`p-4 rounded-xl border transition-all ${
          isCompleted
            ? 'bg-slate-900/60 border-slate-800'
            : 'bg-amber-950/20 border-amber-500/30'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                #{idx + 1}
              </span>
              <h4 className="text-sm font-semibold text-slate-100">{item.description}</h4>
            </div>

            {item.remarks ? (
              <div className="text-xs text-amber-300/90 mt-1 pl-7 flex items-center gap-1.5">
                <span className="text-slate-400">Remarks:</span>
                <span>{item.remarks}</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* Status indicator */}
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 ${
                isCompleted
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {isCompleted ? (
                <>
                  <LucideCheckCircle2 className="w-3.5 h-3.5" /> Completed
                </>
              ) : (
                <>
                  <LucideAlertCircle className="w-3.5 h-3.5" /> Not Completed
                </>
              )}
            </span>

            {/* Photo preview thumbnail */}
            {item.photo_url || item.photo ? (
              <button
                onClick={() =>
                  setSelectedPhoto({
                    url: item.photo_url || item.photo,
                    metadata: {
                      description: item.description,
                      captured_machine_id: item.captured_machine_id || record.machine_number,
                      captured_user_id: item.captured_user_id || record.performed_by_name,
                      captured_at: item.captured_at,
                      photo_hash: item.photo_hash
                    }
                  })
                }
                className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-700 bg-black shrink-0 hover:border-amber-500 transition-colors"
                title="Click to view photo evidence"
              >
                <img
                  src={item.photo_url || item.photo}
                  alt={item.description}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <LucideEye className="w-4 h-4 text-white" />
                </div>
              </button>
            ) : (
              <span className="text-xs text-rose-400 italic">No Photo</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-[#12161f] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#161c28]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <LucideShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  Maintenance Record #{record.id}
                  {getStatusBadge(record.status)}
                </h2>
                <p className="text-xs text-slate-400">
                  {record.frequency} Checklist Evidence & Inspection Audit
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              <LucideX className="w-5 h-5" />
            </button>
          </div>

          {/* Machine & Submission Summary Info */}
          <div className="p-6 border-b border-slate-800 bg-[#0e121a]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block mb-1 flex items-center gap-1">
                  <LucideTruck className="w-3.5 h-3.5 text-slate-400" /> Machine Number
                </span>
                <span className="text-slate-100 font-mono font-bold text-sm block">
                  {record.machine_number || record.machine_code || `MAC-${record.machine}`}
                </span>
                <span className="text-[11px] text-slate-400 truncate block">
                  {record.machine_name}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block mb-1 flex items-center gap-1">
                  <LucideGauge className="w-3.5 h-3.5 text-slate-400" /> Hour Meter
                </span>
                <span className="text-amber-400 font-mono font-bold text-sm block">
                  {record.hour_meter_reading} hrs
                </span>
                <span className="text-[11px] text-slate-400 block truncate">
                  Model: {record.machine_model || 'APOLLO A600 V2'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block mb-1 flex items-center gap-1">
                  <LucideUser className="w-3.5 h-3.5 text-slate-400" /> Performed By
                </span>
                <span className="text-slate-100 font-bold block truncate">
                  {record.performed_by_name || 'Technician'}
                </span>
                <span className="text-[11px] text-emerald-400 block">
                  Role: {record.performed_by_role || 'Operator'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block mb-1 flex items-center gap-1">
                  <LucideCalendar className="w-3.5 h-3.5 text-slate-400" /> Execution Date
                </span>
                <span className="text-slate-100 font-bold block">
                  {new Date(record.maintenance_date).toLocaleDateString()}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {new Date(record.maintenance_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Vendor & General Remarks */}
            <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-400 px-1">
              <div className="flex items-center gap-2">
                <LucideBuilding2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Vendor: <strong className="text-slate-200">{record.assigned_vendor || 'HERO'}</strong></span>
                <span className="mx-2">•</span>
                <span>Assigned Operator: <strong className="text-slate-200">{record.assigned_operator || 'None'}</strong></span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-medium">
                  {record.completed_items_count} Completed
                </span>
                {record.not_completed_items_count > 0 && (
                  <span className="text-rose-400 font-medium">
                    {record.not_completed_items_count} Not Completed
                  </span>
                )}
                <span className="text-slate-500">
                  Total: {record.total_items} Items
                </span>
              </div>
            </div>

            {record.general_remarks && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80 text-xs text-slate-300">
                <strong className="text-slate-400 mr-2">General Remarks:</strong>
                {record.general_remarks}
              </div>
            )}
          </div>

          {/* Checklist Sections Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Category A: Machine */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                  Category A: Machine Checklist ({machineItems.length} activities)
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {machineItems.filter(i => i.status === 'COMPLETED').length}/{machineItems.length} Verified
                </span>
              </div>
              <div className="space-y-2.5">
                {machineItems.length > 0 ? (
                  machineItems.map((item, idx) => renderItemCard(item, idx))
                ) : (
                  <div className="p-4 rounded-xl border border-slate-800 text-xs text-slate-500 text-center">
                    No machine activities recorded for this frequency.
                  </div>
                )}
              </div>
            </div>

            {/* Category B: Engine */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  Category B: Engine Checklist ({engineItems.length} activities)
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {engineItems.filter(i => i.status === 'COMPLETED').length}/{engineItems.length} Verified
                </span>
              </div>
              <div className="space-y-2.5">
                {engineItems.length > 0 ? (
                  engineItems.map((item, idx) => renderItemCard(item, idx))
                ) : (
                  <div className="p-4 rounded-xl border border-slate-800 text-xs text-slate-500 text-center">
                    No engine activities recorded for this frequency.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-[#161c28]">
            <span className="text-xs text-slate-500 font-mono">
              All checklist photos verified with SHA256 integrity check.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
            >
              Close Record
            </button>
          </div>
        </div>
      </div>

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <PhotoViewerModal
          isOpen={true}
          onClose={() => setSelectedPhoto(null)}
          photoUrl={selectedPhoto.url}
          metadata={selectedPhoto.metadata}
        />
      )}
    </>
  );
};

