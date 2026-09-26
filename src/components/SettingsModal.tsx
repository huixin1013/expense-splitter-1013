import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  RotateCcw,
  Trash2,
  Check,
  FileSpreadsheet,
  UserPlus,
  UserCheck,
  Users,
  Lock,
  Download,
  ArrowRightLeft,
  RefreshCw,
  Globe,
  Calculator,
} from 'lucide-react';
import { AppSettings, UserMember } from '../types';
import { addMemberWithPassword, fetchExchangeRates, triggerUsersExcelDownload } from '../utils/excelService';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, getCurrencyMeta } from '../utils/currencyConstants';
import { generate5DigitMemberId } from '../utils/initialData';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: AppSettings) => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetSampleData: () => void;
  onClearAllData: () => void;
  onOpenExcelDatabase?: () => void;
  onRequestSwitchUser?: (userId: string) => void;
  isDeveloper?: boolean;
  onConvertDatabaseCurrency?: (params: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    newSymbol: string;
    newCode: string;
  }) => Promise<boolean>;
  totalSpent?: number;
}

const CURRENCIES = SUPPORTED_CURRENCIES;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSampleData,
  onClearAllData,
  onOpenExcelDatabase,
  onRequestSwitchUser,
  isDeveloper = false,
  onConvertDatabaseCurrency,
  totalSpent = 0,
}) => {
  const initialMembers: UserMember[] = settings.members && settings.members.length > 0
    ? settings.members
    : [
        { id: 'u_huixin', name: 'HuiXin' },
        { id: 'u_ali', name: 'Ali' },
        { id: 'u_abu', name: 'Abu' },
        { id: 'u_ahmad', name: 'Ahmad' },
      ];

  const [members, setMembers] = useState<UserMember[]>(initialMembers);
  const [mainUserId, setMainUserId] = useState<string>(
    settings.mainUserId || initialMembers[0].id
  );
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('1234');
  const initialUserCur = (settings.userCurrencies && settings.userCurrencies[settings.mainUserId]) || settings.currencyCode || 'MYR';
  const [currencyCode, setCurrencyCode] = useState(initialUserCur);

  // Currency live rates state
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [isDownloadingUsers, setIsDownloadingUsers] = useState(false);
  const [usersDownloadError, setUsersDownloadError] = useState<string | null>(null);

  // Quick live calculator state: user selects what currency equals what currency
  const [calcFromCode, setCalcFromCode] = useState<string>(initialUserCur);
  const [calcToCode, setCalcToCode] = useState<string>(initialUserCur === 'JPY' ? 'MYR' : 'JPY');
  const [calculatorInput, setCalculatorInput] = useState<string>('50');

  const handleDownloadUsers = async () => {
    setIsDownloadingUsers(true);
    setUsersDownloadError(null);
    try {
      await triggerUsersExcelDownload(settings.mainUserId);
    } catch (err: any) {
      setUsersDownloadError(err.message || 'Failed to download users.xlsx');
      alert(err.message || 'Failed to download users.xlsx');
    } finally {
      setIsDownloadingUsers(false);
    }
  };

  // When modal opens, sync local form state from current settings
  useEffect(() => {
    if (isOpen) {
      if (settings.members && settings.members.length > 0) {
        setMembers(settings.members);
      }
      const activeUserId = settings.mainUserId || (settings.members && settings.members[0]?.id) || '10001';
      setMainUserId(activeUserId);
      const userCur = (settings.userCurrencies && settings.userCurrencies[activeUserId]) ||
        localStorage.getItem(`user_currency_${activeUserId}`) ||
        settings.currencyCode ||
        'SGD';
      setCurrencyCode(userCur);
      setCalcFromCode(userCur);
      loadRates(userCur);
    }
  }, [isOpen]);

  const loadRates = async (base: string) => {
    setRatesLoading(true);
    const data = await fetchExchangeRates(base);
    if (data && data.rates) {
      setExchangeRates(data.rates);
    }
    setRatesLoading(false);
  };

  if (!isOpen) return null;

  const selectedCurrency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];
  const calcFromCurrency = CURRENCIES.find(c => c.code === calcFromCode) || CURRENCIES[0];
  const calcToCurrency = CURRENCIES.find(c => c.code === calcToCode) || CURRENCIES[1] || CURRENCIES[0];
  const calcExchangeRate = exchangeRates ? exchangeRates[calcToCode] || 1 : 1;

  const handleSwapCalcCurrencies = () => {
    const nextFrom = calcToCode;
    const nextTo = calcFromCode;
    setCalcFromCode(nextFrom);
    setCalcToCode(nextTo);
    loadRates(nextFrom);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMemberName.trim();
    if (!trimmed) return;

    const res = await addMemberWithPassword(trimmed, newMemberPassword || '1234');
    const newId = res.success && res.member ? res.member.id : generate5DigitMemberId(members);
    const updated = [...members, { id: newId, name: trimmed }];
    setMembers(updated);
    setNewMemberName('');
    setNewMemberPassword('1234');
  };

  const handleRemoveMember = (id: string) => {
    if (members.length <= 2) {
      alert('You must have at least 2 members to split expenses.');
      return;
    }
    if (id === mainUserId) {
      alert('Cannot delete the active main user. Please set another member as main user first.');
      return;
    }
    const updated = members.filter(m => m.id !== id);
    setMembers(updated);
  };

  const handleUpdateMemberName = (id: string, newName: string) => {
    setMembers(members.map(m => m.id === id ? { ...m, name: newName } : m));
  };

  const handleSelectMainUser = (targetId: string) => {
    if (targetId === mainUserId) return;
    if (onRequestSwitchUser) {
      onRequestSwitchUser(targetId);
    } else {
      setMainUserId(targetId);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const curr = selectedCurrency;
    const mainMember = members.find(m => m.id === mainUserId) || members[0];
    const otherMember = members.find(m => m.id !== mainUserId) || members[1] || members[0];

    const updatedUserCurrencies = {
      ...(settings.userCurrencies || {}),
      [mainUserId]: curr.code,
    };

    try {
      localStorage.setItem(`user_currency_${mainUserId}`, curr.code);
    } catch {
      // ignore
    }

    onUpdateSettings({
      ...settings,
      myName: mainMember.name,
      friendName: otherMember.name,
      mainUserId: mainMember.id,
      members,
      currencyCode: curr.code,
      currencySymbol: curr.symbol,
      baseCurrencyCode: curr.code,
      baseCurrencySymbol: curr.symbol,
      userCurrencies: updatedUserCurrencies,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        id="settings-modal-box"
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl h-[88vh] sm:h-[85vh] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">App Settings & Users</h2>
              <p className="text-[11px] text-slate-500">Manage members and active main character</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Main Character Selection */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
            <label className="text-xs font-bold text-emerald-950 block mb-1 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-700" />
              <span>User</span>
            </label>
            <p className="text-[11px] text-emerald-800/80 mb-2.5 leading-relaxed">
              Choose who is the main user. Password is verified when switching users.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectMainUser(m.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between border ${
                    mainUserId === m.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-700 border-emerald-200/70 hover:bg-emerald-100/50'
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  {mainUserId === m.id ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : (
                    <Lock className="w-3 h-3 text-slate-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Members Management: Family & Friends */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>Team</span>
              </label>
              {!isDeveloper && (
                <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-md">
                  View
                </span>
              )}
            </div>

            {/* List of members: Editable if developer, read-only if not */}
            <div className="space-y-1.5 mb-3">
              {members.map(m => {
                const isMain = m.id === mainUserId;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isMain ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    
                    {isDeveloper ? (
                      <input
                        type="text"
                        value={m.name}
                        onChange={e => handleUpdateMemberName(m.id, e.target.value)}
                        className="flex-1 px-2.5 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    ) : (
                      <span className="flex-1 px-2 py-1 text-xs font-bold text-slate-900">
                        {m.name}
                      </span>
                    )}

                    {isMain ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md shrink-0">
                        Main
                      </span>
                    ) : isDeveloper ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                        title={`Remove ${m.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Add member form: ONLY VISIBLE IF DEVELOPER */}
            {isDeveloper && (
              <div className="space-y-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold text-slate-700 block">Add</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Member name..."
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <input
                    type="password"
                    placeholder="Password (default 1234)"
                    value={newMemberPassword}
                    onChange={e => setNewMemberPassword(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddMember}
                  className="w-full mt-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Save Member</span>
                </button>
              </div>
            )}
          </div>

          {/* Currency Showing Selection (Each user can select their own default currency) */}
          <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
            <div>
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>Curr</span>
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Select your default viewing currency for balances & totals.
              </p>
            </div>

            {/* Currency dropdown */}
            <select
              value={currencyCode}
              onChange={e => {
                const code = e.target.value;
                setCurrencyCode(code);
                setCalcFromCode(code);
              }}
              className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            >
              {CURRENCIES.map(curr => (
                <option key={curr.code} value={curr.code}>
                  {curr.flag} {curr.code} - {curr.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions: Reset & Save on the same row */}
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirm('Load sample meal and weekly expenses for HuiXin, Ali, Abu, and Ahmad?')) {
                  onResetSampleData();
                  onClose();
                }
              }}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-98 shadow-sm cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Save</span>
            </button>
          </div>

          {/* Additional Section: Currency Calculator & Live Rate (One Single Row) */}
          <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">Calc</span>
              </div>
              <button
                type="button"
                onClick={() => loadRates(calcFromCode)}
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
                title="Refresh live exchange rates"
              >
                <RefreshCw className={`w-3 h-3 ${ratesLoading ? 'animate-spin' : ''}`} />
                <span>1 {calcFromCode} = {calcExchangeRate ? (calcExchangeRate >= 100 ? calcExchangeRate.toFixed(1) : calcExchangeRate.toFixed(3)) : '...'} {calcToCode}</span>
              </button>
            </div>

            {/* Single Row Calculator: [Select Currency] [Amount] = [Converted Result] */}
            <div className="flex items-center gap-1.5 bg-white p-1.5 border border-slate-200 rounded-xl shadow-2xs">
              {/* Select currency */}
              <select
                value={calcFromCode}
                onChange={e => {
                  const next = e.target.value;
                  setCalcFromCode(next);
                  loadRates(next);
                }}
                className="px-2 py-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none cursor-pointer"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>

              {/* Type in amount */}
              <input
                type="number"
                value={calculatorInput}
                onChange={e => setCalculatorInput(e.target.value)}
                placeholder="100"
                className="w-20 sm:w-24 px-2 py-1.5 text-xs font-extrabold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              <span className="text-slate-400 text-xs font-bold px-0.5">=</span>

              {/* Target currency select + result */}
              <div className="flex-1 flex items-center justify-between min-w-0 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 text-xs">
                <select
                  value={calcToCode}
                  onChange={e => setCalcToCode(e.target.value)}
                  className="bg-transparent font-bold text-emerald-950 text-xs focus:outline-none cursor-pointer"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>

                <span className="font-extrabold text-emerald-700 truncate ml-1 text-xs">
                  {(() => {
                    const num = parseFloat(calculatorInput) || 0;
                    const res = num * calcExchangeRate;
                    return res.toLocaleString(undefined, {
                      minimumFractionDigits: calcToCode === 'JPY' || calcToCode === 'KRW' ? 0 : 2,
                      maximumFractionDigits: calcToCode === 'JPY' || calcToCode === 'KRW' ? 0 : 2,
                    });
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* Excel Database Storage Section */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              File
            </label>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExcelDatabase?.();
              }}
              className="w-full py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold rounded-xl flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Excel Storage: expenses.xlsx</span>
              </div>
              <span className="text-[10px] bg-emerald-200/70 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                Manage
              </span>
            </button>

            {/* Developer-Only users.xlsx download */}
            {isDeveloper && (
              <button
                type="button"
                disabled={isDownloadingUsers}
                onClick={handleDownloadUsers}
                className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold rounded-xl flex items-center justify-between transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Developer Only: users.xlsx</span>
                </div>
                <span className="text-[10px] bg-amber-200/70 text-amber-800 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <Download className={`w-3 h-3 ${isDownloadingUsers ? 'animate-bounce' : ''}`} />
                  {isDownloadingUsers ? 'Downloading...' : 'Download'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

