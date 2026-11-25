import React from 'react';
import { LucideX, LucideDownload, LucideCalendar, LucideUser, LucideTruck, LucideHash } from 'lucide-react';

export const PhotoViewerModal = ({ isOpen, onClose, photoUrl, metadata = {} }) => {
  if (!isOpen || !photoUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative max-w-4xl w-full bg-[#12161f] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#161c28]">
          <div className="flex items-center gap-3">
            <span className="text-xs px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold uppercase">
              Photo Evidence
            </span>
            <span className="text-sm font-semibold text-slate-200 truncate max-w-md">
              {metadata.description || 'Checklist Item Evidence'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Download Photo"
            >
              <LucideDownload className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <LucideX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div className="flex-1 flex items-center justify-center p-4 bg-[#0a0d14] overflow-hidden min-h-[350px]">
          <img
            src={photoUrl}
            alt={metadata.description || 'Maintenance Evidence'}
            className="max-h-[62vh] max-w-full object-contain rounded-lg shadow-lg border border-slate-800"
          />
        </div>

        {/* Metadata Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-[#141923] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500 flex items-center gap-1 mb-0.5">
              <LucideTruck className="w-3.5 h-3.5 text-slate-400" /> Machine ID:
            </span>
            <span className="text-slate-200 font-mono font-medium">{metadata.captured_machine_id || metadata.machine_code || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500 flex items-center gap-1 mb-0.5">
              <LucideUser className="w-3.5 h-3.5 text-slate-400" /> Captured By:
            </span>
            <span className="text-slate-200 font-medium">{metadata.captured_user_id || metadata.performed_by || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500 flex items-center gap-1 mb-0.5">
              <LucideCalendar className="w-3.5 h-3.5 text-slate-400" /> Timestamp:
            </span>
            <span className="text-slate-200 font-mono">{metadata.captured_at ? new Date(metadata.captured_at).toLocaleString() : '-'}</span>
          </div>
          <div>
            <span className="text-slate-500 flex items-center gap-1 mb-0.5">
              <LucideHash className="w-3.5 h-3.5 text-slate-400" /> SHA256 Hash:
            </span>
            <span className="text-slate-400 font-mono truncate block" title={metadata.photo_hash || ''}>
              {metadata.photo_hash ? `${metadata.photo_hash.substring(0, 12)}...` : 'Verified'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

