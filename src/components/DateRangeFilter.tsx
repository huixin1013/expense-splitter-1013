import React, { useState } from 'react';
import { Calendar, CalendarRange, X, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react';
import { toISODate, getWeekStartAndEnd } from '../utils/dateUtils';

export type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_30_days' | 'this_week' | 'custom';

interface DateRangeFilterProps {
  preset: DatePreset;
  startDate: string;
  endDate: string;
  onSelectPreset: (preset: DatePreset, start?: string, end?: string) => void;
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
  onClearDateRange: () => void;
}

export const PRESET_OPTIONS: Array<{ id: DatePreset; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'this_month', label: 'This' },
  { id: 'last_month', label: 'Last' },
  { id: 'last_30_days', label: '30d' },
  { id: 'this_week', label: 'Week' },
  { id: 'custom', label: 'Pick' },
];

export function computeDateRangeForPreset(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toISODate(start), end: toISODate(end) };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toISODate(start), end: toISODate(end) };
  }
  if (preset === 'last_30_days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start: toISODate(start), end: toISODate(now) };
  }
  if (preset === 'this_week') {
    const { start, end } = getWeekStartAndEnd(now);
    return { start: toISODate(start), end: toISODate(end) };
  }
  return { start: '', end: '' };
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  preset,
  startDate,
  endDate,
  onSelectPreset,
  onChangeStartDate,
  onChangeEndDate,
  onClearDateRange,
}) => {
  const [showCustomInputs, setShowCustomInputs] = useState(preset === 'custom');

  const handlePresetClick = (optionId: DatePreset) => {
    if (optionId === 'all') {
      setShowCustomInputs(false);
      onSelectPreset('all', '', '');
      return;
    }

    if (optionId === 'custom') {
      setShowCustomInputs(true);
      onSelectPreset('custom', startDate, endDate);
      return;
    }

    setShowCustomInputs(false);
    const range = computeDateRangeForPreset(optionId);
    onSelectPreset(optionId, range.start, range.end);
  };

  const isFilterActive = preset !== 'all' || Boolean(startDate) || Boolean(endDate);

  // Format readable range label if active
  const formatFriendlyDate = (isoStr: string) => {
    if (!isoStr) return '';
    try {
      const [y, m, d] = isoStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-slate-100">
      {/* Header with Preset Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
          <span>Date</span>
        </div>

        {isFilterActive && (
          <button
            type="button"
            onClick={onClearDateRange}
            className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 bg-rose-50 hover:bg-rose-100/80 px-2 py-0.5 rounded-lg border border-rose-200/70 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Clr</span>
          </button>
        )}
      </div>

      {/* Preset Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {PRESET_OPTIONS.map(opt => {
          const isSelected = preset === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handlePresetClick(opt.id)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          );
        })}

        {/* Toggle Custom button if not custom preset */}
        {preset !== 'custom' && (
          <button
            type="button"
            onClick={() => setShowCustomInputs(!showCustomInputs)}
            className={`shrink-0 px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 border border-slate-200 ${
              showCustomInputs ? 'bg-slate-200 text-slate-800' : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
            title="Toggle exact date inputs"
          >
            <span>Exact Dates</span>
            {showCustomInputs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Active Range Summary Chip (if active) */}
      {isFilterActive && (startDate || endDate) && !showCustomInputs && (
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs">
          <div className="flex items-center gap-1.5 text-emerald-950 font-medium truncate">
            <Calendar className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="font-bold text-emerald-800">
              {startDate ? formatFriendlyDate(startDate) : 'Start'}
              {' → '}
              {endDate ? formatFriendlyDate(endDate) : 'Present'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowCustomInputs(true)}
            className="text-[10px] font-bold text-emerald-700 hover:underline shrink-0 ml-2"
          >
            Edit
          </button>
        </div>
      )}

      {/* Custom Date Inputs Box */}
      {(showCustomInputs || preset === 'custom') && (
        <div className="p-2.5 bg-slate-50/90 border border-slate-200/90 rounded-xl space-y-2 animate-in fade-in duration-150">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                From (Start Date)
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    onChangeStartDate(e.target.value);
                    if (preset !== 'custom') onSelectPreset('custom', e.target.value, endDate);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                To (End Date)
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    onChangeEndDate(e.target.value);
                    if (preset !== 'custom') onSelectPreset('custom', startDate, e.target.value);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>Filter expenses within this date window</span>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  onChangeStartDate('');
                  onChangeEndDate('');
                  onSelectPreset('all', '', '');
                }}
                className="text-slate-400 hover:text-slate-600 underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
