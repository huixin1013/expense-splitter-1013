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
  Shield,
} from 'lucide-react';
import { AppSettings, UserMember } from '../types';
import { addMemberWithPassword, fetchExchangeRates, triggerUsersExcelDownload } from '../utils/excelService';
import { SUPPORTED_CURRENCIES } from '../utils/currencyConstants';
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
  onOpenExcelDatabase,
  onRequestSwitchUser,
  isDeveloper = false,
}) => {
  const initialMembers: UserMember[] =
    settings.members && settings.members.length > 0
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
  const initialUserCur =
    (settings.userCurrencies && settings.userCurrencies[settings.mainUserId]) ||
    settings.currencyCode ||
    'MYR';
  const [currencyCode, setCurrencyCode] = useState(initialUserCur);

  // Currency live rates state
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [isDownloadingUsers, setIsDownloadingUsers] = useState(false);
  const [usersDownloadError, setUsersDownloadError] = useState<string | null>(null);

  // Live calculator state
  const [calcFromCode, setCalcFromCode] = useState<string>(initialUserCur);
  const [calcToCode, setCalcToCode] = useState<string>(
    initialUserCur === 'JPY' ? 'MYR' : 'JPY'
  );
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

  // Sync state from settings when modal opens
  useEffect(() => {
    if (isOpen) {
      if (settings.members && settings.members.length > 0) {
        setMembers(settings.members);
      }
      const activeUserId =
        settings.mainUserId || (settings.members && settings.members[0]?.id) || '10001';
      setMainUserId(activeUserId);
      const userCur =
        (settings.userCurrencies && settings.userCurrencies[activeUserId]) ||
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

  const selectedCurrency =
    CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];
  const calcFromCurrency =
    CURRENCIES.find(c => c.code === calcFromCode) || CURRENCIES[0];
  const calcToCurrency =
    CURRENCIES.find(c => c.code === calcToCode) || CURRENCIES[1] || CURRENCIES[0];
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
    setMembers(members.map(m => (m.id === id ? { ...m, name: newName } : m)));
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
        className="bg-slate-50 w-full max-w-md rounded-t-3xl sm:rounded-2xl h-[88vh] sm:h-[85vh] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Settings</h2>
                {isDeveloper ? (
                  <div className="text-[10px] font-extrabold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full flex items-center gap-1 border border-indigo-200">
                    <Shield className="w-2.5 h-2.5" />
                    Developer
                  </div>
                ) : (
                  <div className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Preferences
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {isDeveloper
                  ? 'Manage main user, team members, currencies & developer files'
                  : 'Customize your active user and currency preferences'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* =========================================================================
              PART 1: Choose who is the main user (For both Normal and Developer user)
             ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Choose Main User
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Select who is currently using the app. Tap another member to switch profile.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {members.map(m => {
                const isCurrentMain = mainUserId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMainUser(m.id)}
                    className={`p-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                      isCurrentMain
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/20'
                        : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:bg-emerald-50/60 hover:border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                          isCurrentMain
                            ? 'bg-emerald-700/60 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">{m.name}</div>
                    </div>
                    {isCurrentMain ? (
                      <div className="flex items-center gap-1 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-md font-bold shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                        Active
                      </div>
                    ) : (
                      <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* =========================================================================
              PART 2 (Developer Only): Team members details (add, edit or delete members)
             ========================================================================= */}
          {isDeveloper && (
            <div className="bg-white rounded-2xl border border-indigo-200/90 p-4 shadow-2xs">
              <div className="flex items-start gap-2.5 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        Team Members Details
                      </h3>
                    </div>
                    <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      {members.length} Members
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Add new members, edit member names, or delete members.
                  </p>
                </div>
              </div>

              {/* Members List with inline editing and delete */}
              <div className="space-y-1.5 mb-3.5">
                {members.map(m => {
                  const isMain = m.id === mainUserId;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors"
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isMain
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </div>

                      <input
                        type="text"
                        value={m.name}
                        onChange={e => handleUpdateMemberName(m.id, e.target.value)}
                        placeholder="Member name"
                        className="flex-1 px-2.5 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />

                      {isMain ? (
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2 py-1 rounded-md shrink-0 border border-indigo-200/50">
                          Main User
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id)}
                          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                          title={`Delete ${m.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add New Member Sub-container */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-indigo-950 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                  Add New Member
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="New member name..."
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-indigo-200/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  />
                  <input
                    type="password"
                    placeholder="4-digit PIN (default 1234)"
                    value={newMemberPassword}
                    onChange={e => setNewMemberPassword(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-indigo-200/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddMember}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Member
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              PART 2 (Normal) / PART 3 (Developer): Choose default viewing currency
             ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Choose Default Viewing Currency
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Select your personal default currency for viewing balances, debts, and totals.
                </p>
              </div>
            </div>

            {/* Currency selector container */}
            <div className="space-y-2">
              <select
                value={currencyCode}
                onChange={e => {
                  const code = e.target.value;
                  setCurrencyCode(code);
                  setCalcFromCode(code);
                }}
                className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                {CURRENCIES.map(curr => (
                  <option key={curr.code} value={curr.code}>
                    {curr.flag} {curr.code} - {curr.label} ({curr.symbol})
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50/60 rounded-xl border border-blue-100 text-xs">
                <div className="text-[11px] text-blue-900 font-medium">
                  Active Display Format:
                </div>
                <div className="font-extrabold text-blue-800 flex items-center gap-1">
                  <div>{selectedCurrency.flag}</div>
                  <div>{selectedCurrency.code}</div>
                  <div className="text-blue-500 font-normal">({selectedCurrency.symbol})</div>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              PART 3 (Normal) / PART 4 (Developer): Calculation rating currency
             ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-emerald-600 shrink-0" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Calculation Rating Currency
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadRates(calcFromCode)}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100"
                    title="Refresh live exchange rates"
                  >
                    <RefreshCw className={`w-3 h-3 ${ratesLoading ? 'animate-spin' : ''}`} />
                    1 {calcFromCode} ={' '}
                    {calcExchangeRate
                      ? calcExchangeRate >= 100
                        ? calcExchangeRate.toFixed(1)
                        : calcExchangeRate.toFixed(3)
                      : '...'}{' '}
                    {calcToCode}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Real-time exchange rate calculation and instant currency converter.
                </p>
              </div>
            </div>

            {/* Quick Live Calculator Box */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-2 border border-slate-200 rounded-xl shadow-2xs">
              {/* Source currency */}
              <select
                value={calcFromCode}
                onChange={e => {
                  const next = e.target.value;
                  setCalcFromCode(next);
                  loadRates(next);
                }}
                className="px-2 py-1.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none cursor-pointer"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>

              {/* Amount input */}
              <input
                type="number"
                value={calculatorInput}
                onChange={e => setCalculatorInput(e.target.value)}
                placeholder="50"
                className="w-18 sm:w-20 px-2 py-1.5 text-xs font-extrabold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              {/* Swap button */}
              <button
                type="button"
                onClick={handleSwapCalcCurrencies}
                className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer transition-colors shrink-0"
                title="Swap currencies"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>

              {/* Target currency select + Converted output */}
              <div className="flex-1 flex items-center justify-between min-w-0 bg-emerald-50 border border-emerald-200/80 rounded-lg px-2 py-1.5 text-xs">
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

                <div className="font-extrabold text-emerald-800 truncate ml-1 text-xs sm:text-sm">
                  {(() => {
                    const num = parseFloat(calculatorInput) || 0;
                    const res = num * calcExchangeRate;
                    return res.toLocaleString(undefined, {
                      minimumFractionDigits:
                        calcToCode === 'JPY' || calcToCode === 'KRW' ? 0 : 2,
                      maximumFractionDigits:
                        calcToCode === 'JPY' || calcToCode === 'KRW' ? 0 : 2,
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              PART 5 (Developer Only): File for developer only: users.xlsx
             ========================================================================= */}
          {isDeveloper && (
            <div className="bg-white rounded-2xl border border-amber-200/90 p-4 shadow-2xs space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      File for Developer Only: users.xlsx
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Download and inspect the credentials workbook containing member IDs, names, and passwords.
                  </p>
                </div>
              </div>

              {/* Developer Download users.xlsx button */}
              <button
                type="button"
                disabled={isDownloadingUsers}
                onClick={handleDownloadUsers}
                className="w-full py-2.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold rounded-xl flex items-center justify-between transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-700 shrink-0" />
                  <div className="text-left">
                    <div className="font-bold">users.xlsx</div>
                    <div className="text-[10px] text-amber-800/80 font-normal">
                      Full users & credentials database export
                    </div>
                  </div>
                </div>
                <div className="text-[10px] bg-amber-200/80 text-amber-900 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 shrink-0">
                  <Download className={`w-3 h-3 ${isDownloadingUsers ? 'animate-bounce' : ''}`} />
                  {isDownloadingUsers ? 'Downloading...' : 'Download'}
                </div>
              </button>

              {usersDownloadError && (
                <p className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                  {usersDownloadError}
                </p>
              )}

              {/* Excel Storage expenses.xlsx manager for developer */}
              {onOpenExcelDatabase && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenExcelDatabase();
                  }}
                  className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <div>Database Storage: expenses.xlsx</div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold">
                    Open Manager →
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Sticky Bottom Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-2.5 shrink-0">
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
            Reset
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-98 shadow-sm cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
