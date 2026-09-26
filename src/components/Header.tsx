import React from 'react';
import { Settings, Share2, User, Plus, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { AppSettings } from '../types';

interface HeaderProps {
  settings: AppSettings;
  onOpenSettings: () => void;
  onOpenShare: () => void;
  onOpenAddExpense?: () => void;
  onOpenExcelDatabase?: () => void;
  onSwitchMainUser?: (userId: string) => void;
  isDeveloper?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onOpenSettings,
  onOpenShare,
  onOpenAddExpense,
  onOpenExcelDatabase,
  onSwitchMainUser,
  isDeveloper = false,
}) => {
  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [{ id: 'u_huixin', name: 'HuiXin' }, { id: 'u_ali', name: 'Ali' }];

  const mainUserId = settings.mainUserId || members[0]?.id || 'u_huixin';
  const mainUser = members.find(m => m.id === mainUserId) || members[0];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Main User Display & Quick Switcher */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm relative">
            <User className="w-4 h-4 text-emerald-100" />
            {isDeveloper && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" title="Developer" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-base font-extrabold text-slate-900 tracking-tight leading-none">
                {mainUser.name}
              </span>
              {isDeveloper && (
                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                  Dev
                </span>
              )}
              {onSwitchMainUser && members.length > 1 && (
                <div className="relative inline-block">
                  <select
                    value={mainUserId}
                    onChange={e => onSwitchMainUser(e.target.value)}
                    aria-label="Switch active main user"
                    title="Switch active user view"
                    className="appearance-none pl-2 pr-5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-md border border-emerald-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.id === mainUserId ? '(Main)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 text-emerald-700 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Active User • Expense Splitter
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {onOpenExcelDatabase && (
            <button
              type="button"
              id="excel-storage-btn"
              onClick={onOpenExcelDatabase}
              aria-label="Excel Database storage"
              title="Excel Database (expenses.xlsx)"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 active:scale-95 transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            id="share-summary-btn"
            onClick={onOpenShare}
            aria-label="Share spending summary"
            title="Share spending summary"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            id="app-settings-btn"
            onClick={onOpenSettings}
            aria-label="App settings and manage users"
            title="Settings & Users"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
