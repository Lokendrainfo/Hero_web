import React, { useState, useEffect } from 'react';
import {
  LucideShield,
  LucideX,
  LucideBookOpen,
  LucideAlertTriangle,
  LucideCheckCircle2,
  LucideWrench,
  LucideCompass,
  LucideTruck,
  LucideFileText
} from 'lucide-react';
import { maintenanceService } from '../../services/maintenanceService';

export const SafetyGuidelinesModal = ({ isOpen, onClose }) => {
  const [guidelines, setGuidelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PRE_OPERATING');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      maintenanceService.getSafetyGuidelines()
        .then(res => {
          const list = res.data?.data || res.data || [];
          setGuidelines(Array.isArray(list) ? list : []);
          if (list.length > 0 && !activeTab) {
            setActiveTab(list[0].section_key);
          }
        })
        .catch(err => {
          console.error("Failed to load safety guidelines:", err);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentGuideline = guidelines.find(g => g.section_key === activeTab) || guidelines[0];

  const getTabIcon = (key) => {
    switch (key) {
      case 'PRE_OPERATING': return <LucideShield className="w-4 h-4 text-emerald-400" />;
      case 'DRILL_ROD_USES': return <LucideCompass className="w-4 h-4 text-cyan-400" />;
      case 'VISE_CLAMP': return <LucideWrench className="w-4 h-4 text-amber-400" />;
      case 'GEAR_BOX': return <LucideTruck className="w-4 h-4 text-purple-400" />;
      case 'GENERAL_DONTS': return <LucideAlertTriangle className="w-4 h-4 text-rose-400" />;
      default: return <LucideFileText className="w-4 h-4 text-sky-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#12161f] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#161c28]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <LucideShield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Apollo HDD Model A600V2 – Safety Guidelines & SOP
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Digitized SOP
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Standard Operating Procedure, Pre-Operating Checkpoints, and Critical Guidelines
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-[#0d1117] px-6 overflow-x-auto gap-2 py-2">
          {guidelines.map(g => (
            <button
              key={g.section_key}
              onClick={() => setActiveTab(g.section_key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === g.section_key
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {getTabIcon(g.section_key)}
              <span>{g.title}</span>
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs">Loading safety instructions...</p>
            </div>
          ) : currentGuideline ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    {getTabIcon(currentGuideline.section_key)}
                    {currentGuideline.title}
                  </h3>
                  {currentGuideline.subtitle && (
                    <span className="text-xs text-amber-400 font-mono bg-amber-400/10 px-2 py-0.5 rounded">
                      {currentGuideline.subtitle}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line font-sans space-y-2">
                  {currentGuideline.content}
                </div>
              </div>

              {/* Quick Reminders Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex gap-3">
                  <LucideCheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <strong className="text-emerald-400 block mb-0.5">Mandatory Daily Greasing</strong>
                    16 points on Vise Clamp Assy, Guide Rollers, Cylinder Pin & Bushings, and Water Swivels must be greased daily.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 flex gap-3">
                  <LucideAlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <strong className="text-rose-400 block mb-0.5">Critical Operational Limits</strong>
                    Never march machine more than 500 meters at once. Water pump suction hose must be genuine 2" or 3" hose (never 40mm HDPE duct).
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              No guideline details available.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-[#161c28]">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LucideBookOpen className="w-4 h-4 text-amber-400" />
            <span>Document Source: Apollo HDD Model A600V2 Standard Operating Procedure</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};

