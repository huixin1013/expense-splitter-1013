/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Search,
  Filter,
  History,
  CheckCircle2,
  Trash2,
  FileSpreadsheet,
  Plus,
} from 'lucide-react';
import { Expense, Settlement, AppSettings, ExpenseCategory } from './types';
import { DEFAULT_SETTINGS, getInitialExpenses } from './utils/initialData';
import {
  calculateBalanceSummary,
  normalizePayerId,
  isUserInvolvedInExpense,
  isUserInvolvedInSettlement,
  getExpenseAmountInCurrency,
} from './utils/calculations';
import { Header } from './components/Header';
import { BalanceCard } from './components/BalanceCard';
import { ExpenseItem } from './components/ExpenseItem';
import { AddExpenseModal } from './components/AddExpenseModal';
import { SettleUpModal } from './components/SettleUpModal';
import { ShareSummaryModal } from './components/ShareSummaryModal';
import { SettingsModal } from './components/SettingsModal';
import { ExcelDatabaseModal } from './components/ExcelDatabaseModal';
import { VerifyPasswordModal } from './components/VerifyPasswordModal';
import { FirstTimeSetupModal } from './components/FirstTimeSetupModal';
import { ConfirmDeleteExpenseModal } from './components/ConfirmDeleteExpenseModal';
import { DateRangeFilter, DatePreset } from './components/DateRangeFilter';
import {
  loadExcelDatabase,
  persistToExcel,
  fetchUsersStatus,
  fetchSyncVersion,
  convertDatabaseCurrency,
  setActiveUserBackend,
  fetchExchangeRates,
} from './utils/excelService';
import {
  subscribeExpenses,
  subscribeSettlements,
  subscribeSettings,
  subscribeUsers,
  saveExpenseToFirestore,
  deleteExpenseFromFirestore,
  saveSettlementToFirestore,
  deleteSettlementFromFirestore,
  saveSettingsToFirestore,
  saveUsersToFirestore,
  clearTransactionsInFirestore,
} from './lib/firebase';
import { CATEGORIES } from './utils/categoryMeta';
import { getCurrencyMeta } from './utils/currencyConstants';
import { getConversionRate } from './utils/currencyUtils';
import { UserMember } from './types';

export default function App() {
  // Clean up any stale localStorage immediately on mount
  useEffect(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  }, []);

  // Initialize state directly from defaults and load fresh from live database
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  // Active view tab: 'overview' | 'history'
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

  // Modals state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [isSettleUpOpen, setIsSettleUpOpen] = useState(false);
  const [settleDefaultMemberId, setSettleDefaultMemberId] = useState<string | undefined>(undefined);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isFirstTimeSetupOpen, setIsFirstTimeSetupOpen] = useState(false);
  const [isVerifyPasswordOpen, setIsVerifyPasswordOpen] = useState(false);
  const [pendingSwitchUser, setPendingSwitchUser] = useState<UserMember | null>(null);
  const [developerUserId, setDeveloperUserId] = useState<string | null>(null);

  // Live exchange rates state
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  // Fetch exchange rates whenever the viewing currency or base currency changes
  const activeCurrencyCode = settings.currencyCode || settings.baseCurrencyCode || 'SGD';
  const baseCurrencyCode = settings.baseCurrencyCode || 'SGD';
  useEffect(() => {
    fetchExchangeRates(activeCurrencyCode).then(data => {
      if (data && data.rates) {
        setRates(data.rates);
      }
    });
  }, [activeCurrencyCode]);

  // Compute viewing conversion rate from baseCurrencyCode to user's active viewing currency (settings.currencyCode)
  const viewingRate = useMemo(() => {
    return getConversionRate(baseCurrencyCode, activeCurrencyCode, rates);
  }, [baseCurrencyCode, activeCurrencyCode, rates]);

  // Excel database connection & sync state
  const [isBackendConnected, setIsBackendConnected] = useState(true);
  const [isSyncingExcel, setIsSyncingExcel] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Search & Filters in History tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | 'all'>('all');
  const [selectedPayer, setSelectedPayer] = useState<string | 'all'>('all');
  const [selectedScope, setSelectedScope] = useState<'all' | 'shared' | 'personal'>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Overview quick filter
  const [overviewFilter, setOverviewFilter] = useState<'all' | 'shared' | 'personal'>('all');

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [
        { id: 'u_huixin', name: 'HuiXin' },
        { id: 'u_ali', name: 'Ali' },
        { id: 'u_abu', name: 'Abu' },
        { id: 'u_ahmad', name: 'Ahmad' },
      ];
  const mainUserId = settings.mainUserId || members[0]?.id || 'u_huixin';
  const mainUser = members.find(m => m.id === mainUserId) || members[0];

  // First main registered user is designated as Developer
  const isDeveloper = developerUserId ? mainUserId === developerUserId : (mainUserId === members[0]?.id);

  // Expenses that involve the active main user (user paid or is in the split)
  const userExpenses = useMemo(() => {
    return expenses.filter(e => isUserInvolvedInExpense(e, mainUserId, members));
  }, [expenses, mainUserId, members]);

  // Settlements that involve the active main user (user paid or received)
  const userSettlements = useMemo(() => {
    return settlements.filter(s => isUserInvolvedInSettlement(s, mainUserId, members));
  }, [settlements, mainUserId, members]);

  // Total recorded spending in current currency for expenses user is involved with
  const totalSpent = useMemo(() => {
    return userExpenses.reduce(
      (sum, e) => sum + getExpenseAmountInCurrency(e, activeCurrencyCode, baseCurrencyCode, rates, viewingRate),
      0
    );
  }, [userExpenses, activeCurrencyCode, baseCurrencyCode, rates, viewingRate]);

  // Convert database currency across all expenses and settlements
  const handleConvertDatabaseCurrency = async (params: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    newSymbol: string;
    newCode: string;
  }): Promise<boolean> => {
    try {
      setIsSyncingExcel(true);
      const res = await convertDatabaseCurrency(params);
      if (res.success && res.updatedData) {
        setExpenses(res.updatedData.expenses);
        setSettlements(res.updatedData.settlements);
        setSettings(res.updatedData.settings);
        setIsSyncingExcel(false);
        return true;
      } else {
        alert(res.error || 'Failed to convert database currency');
        setIsSyncingExcel(false);
        return false;
      }
    } catch (err: any) {
      alert(err.message || 'Error converting database currency');
      setIsSyncingExcel(false);
      return false;
    }
  };

  // Check if first-time setup is needed on initial load
  useEffect(() => {
    fetchUsersStatus().then(status => {
      if (status) {
        if (!status.configured) {
          setIsFirstTimeSetupOpen(true);
        } else if (status.configured && status.members && status.members.length > 0) {
          setSettings(prev => {
            const isCurrentValid = prev.mainUserId && status.members.some(m => m.id === prev.mainUserId);
            const activeId = isCurrentValid ? prev.mainUserId : (status.mainUserId || status.members[0].id);
            const activeMember = status.members.find(m => m.id === activeId) || status.members[0];
            return {
              ...prev,
              members: status.members,
              mainUserId: activeId,
              myName: activeMember.name,
            };
          });
        }
        if (status.developerUserId) {
          setDeveloperUserId(status.developerUserId);
        }
      }
    });
  }, []);

  // Real-time Firebase Firestore synchronization across all devices
  useEffect(() => {
    let isMounted = true;
    let hasReceivedCloudExpenses = false;
    let hasReceivedCloudSettlements = false;

    // 1. Subscribe to real-time Expenses directly from database
    const unsubscribeExpenses = subscribeExpenses((cloudExpenses) => {
      if (!isMounted) return;
      hasReceivedCloudExpenses = true;
      setExpenses(cloudExpenses || []);
      setInitialLoaded(true);
    });

    // 2. Subscribe to real-time Settlements directly from database
    const unsubscribeSettlements = subscribeSettlements((cloudSettlements) => {
      if (!isMounted) return;
      hasReceivedCloudSettlements = true;
      setSettlements(cloudSettlements || []);
    });

    // 3. Subscribe to real-time Settings directly from database
    const unsubscribeSettings = subscribeSettings((cloudSettings) => {
      if (!isMounted) return;
      if (cloudSettings) {
        setSettings(prev => {
          const membersList = cloudSettings.members || prev.members || [];
          const isCurrentValid = prev.mainUserId && membersList.some(m => m.id === prev.mainUserId);
          const activeId = isCurrentValid ? prev.mainUserId : (cloudSettings.mainUserId || membersList[0]?.id || prev.mainUserId);
          const activeMember = membersList.find(m => m.id === activeId);

          const userCurrencies = {
            ...(cloudSettings.userCurrencies || {}),
            ...(prev.userCurrencies || {}),
          };
          const userCurCode =
            userCurrencies[activeId] ||
            prev.currencyCode ||
            cloudSettings.currencyCode ||
            'SGD';
          const userCurMeta = getCurrencyMeta(userCurCode);

          return {
            ...cloudSettings,
            mainUserId: activeId,
            myName: activeMember ? activeMember.name : cloudSettings.myName,
            currencyCode: userCurCode,
            currencySymbol: userCurMeta.symbol,
            userCurrencies: {
              ...userCurrencies,
              [activeId]: userCurCode,
            },
          };
        });
      }
    });

    // 4. Subscribe to real-time Users / Members directly from database
    const unsubscribeUsers = subscribeUsers((cloudUsers) => {
      if (!isMounted) return;
      if (cloudUsers && cloudUsers.length > 0) {
        setSettings(prev => {
          const userMembers: UserMember[] = cloudUsers.map(u => ({ id: u.id, name: u.name }));
          const isCurrentValid = prev.mainUserId && userMembers.some(m => m.id === prev.mainUserId);
          const activeId = isCurrentValid ? prev.mainUserId : (prev.mainUserId || userMembers[0]?.id || 'u_me');
          const activeMember = userMembers.find(m => m.id === activeId);
          return {
            ...prev,
            members: userMembers,
            mainUserId: activeId,
            myName: activeMember ? activeMember.name : prev.myName,
          };
        });
      }
    });

    // Initial load from backend Excel database only as secondary fallback if Firestore has no data
    loadExcelDatabase(DEFAULT_SETTINGS).then(result => {
      if (!isMounted) return;
      setIsBackendConnected(result.isBackendConnected);
      if (result.payload) {
        if (!hasReceivedCloudExpenses && result.payload.expenses && result.payload.expenses.length > 0) {
          setExpenses(prev => (prev.length === 0 ? result.payload.expenses : prev));
        }
        if (!hasReceivedCloudSettlements && result.payload.settlements && result.payload.settlements.length > 0) {
          setSettlements(prev => (prev.length === 0 ? result.payload.settlements : prev));
        }
      }
      setInitialLoaded(true);
    });

    return () => {
      isMounted = false;
      unsubscribeExpenses();
      unsubscribeSettlements();
      unsubscribeSettings();
      unsubscribeUsers();
    };
  }, []);

  // Helper to persist explicit user mutations to backend Excel backup without overwriting during page load
  const syncExcelBackup = (newExpenses: Expense[], newSettlements: Settlement[], newSettings: AppSettings) => {
    setIsSyncingExcel(true);
    persistToExcel({ expenses: newExpenses, settlements: newSettlements, settings: newSettings })
      .then(result => {
        setIsBackendConnected(result.backendSynced);
        setIsSyncingExcel(false);
      })
      .catch(err => {
        console.warn('Excel backup notice:', err);
        setIsSyncingExcel(false);
      });
  };

  // Financial calculations
  const balanceSummary = useMemo(() => {
    return calculateBalanceSummary(expenses, settlements, settings, viewingRate, rates);
  }, [expenses, settlements, settings, viewingRate, rates]);

  // Switch active main user with password verification
  const handleRequestSwitchUser = (userId: string) => {
    if (userId === settings.mainUserId) return;
    const member = members.find(m => m.id === userId);
    if (!member) return;
    setPendingSwitchUser(member);
    setIsVerifyPasswordOpen(true);
  };

  const handleConfirmedSwitchUser = (userId: string) => {
    const member = members.find(m => m.id === userId);
    if (!member) return;

    // Load individual user's selected default currency
    const userCurCode = (settings.userCurrencies && settings.userCurrencies[userId]) ||
      settings.currencyCode || 'MYR';
    const userCurMeta = getCurrencyMeta(userCurCode);

    setSettings(prev => {
      const updated = {
        ...prev,
        mainUserId: userId,
        myName: member.name,
        currencyCode: userCurCode,
        currencySymbol: userCurMeta.symbol,
      };
      persistToExcel({ expenses, settlements, settings: updated }).catch(() => {});
      return updated;
    });
    setActiveUserBackend(userId).catch(() => {});
    setIsVerifyPasswordOpen(false);
    setIsSettingsOpen(false);
    setPendingSwitchUser(null);
  };

  const handleSwitchMainUser = (userId: string) => {
    handleRequestSwitchUser(userId);
  };

  const handleFirstTimeSetupComplete = (
    newMainId: string,
    newMembers: Array<{ id: string; name: string }>,
    currencySym: string
  ) => {
    setIsFirstTimeSetupOpen(false);
    const mainM = newMembers.find(m => m.id === newMainId) || newMembers[0];
    setSettings(prev => ({
      ...prev,
      mainUserId: newMainId,
      myName: mainM.name,
      members: newMembers,
      currencySymbol: currencySym,
      currencyCode: currencySym === 'RM' ? 'MYR' : 'USD',
    }));
    loadExcelDatabase(DEFAULT_SETTINGS).then(result => {
      if (result.payload.expenses) setExpenses(result.payload.expenses);
      if (result.payload.settlements) setSettlements(result.payload.settlements);
    });
  };

  // Filtered expenses for History tab
  const filteredExpenses = useMemo(() => {
    return userExpenses
      .filter(exp => {
        const isPersonal = exp.expenseScope === 'personal' || exp.splitType === 'personal';
        if (selectedScope === 'shared' && isPersonal) return false;
        if (selectedScope === 'personal' && !isPersonal) return false;
        if (selectedCategory !== 'all' && exp.category !== selectedCategory) return false;
        if (selectedPayer !== 'all') {
          let effectivePayerId = exp.paidBy;
          if (effectivePayerId === 'me') effectivePayerId = mainUserId;
          else if (effectivePayerId === 'friend') {
            effectivePayerId = members.find(m => m.id !== mainUserId)?.id || 'u_ali';
          }
          if (effectivePayerId !== selectedPayer) return false;
        }
        if (startDate) {
          const expDate = exp.date ? exp.date.split('T')[0] : '';
          if (expDate < startDate) return false;
        }
        if (endDate) {
          const expDate = exp.date ? exp.date.split('T')[0] : '';
          if (expDate > endDate) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return exp.title.toLowerCase().includes(q) || (exp.notes && exp.notes.toLowerCase().includes(q));
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);
  }, [userExpenses, selectedScope, selectedCategory, selectedPayer, searchQuery, startDate, endDate, mainUserId, members]);

  // Filter expenses to only the recent two months (Last 2 calendar months)
  const recentTwoMonthsExpenses = useMemo(() => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const cutoffDate = twoMonthsAgo.toISOString().split('T')[0];
    const cutoffTime = twoMonthsAgo.getTime();

    return userExpenses
      .filter(exp => {
        const expDate = exp.date ? exp.date.split('T')[0] : '';
        if (expDate) {
          return expDate >= cutoffDate;
        }
        return (exp.createdAt || 0) >= cutoffTime;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);
  }, [userExpenses]);

  // Total amount of currently filtered expenses
  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce(
      (sum, e) => sum + getExpenseAmountInCurrency(e, activeCurrencyCode, baseCurrencyCode, rates, viewingRate),
      0
    );
  }, [filteredExpenses, activeCurrencyCode, baseCurrencyCode, rates, viewingRate]);

  // Reload and Import handlers for Excel database
  const handleReloadFromExcel = async () => {
    const result = await loadExcelDatabase(settings);
    setIsBackendConnected(result.isBackendConnected);
    setExpenses(result.payload.expenses);
    setSettlements(result.payload.settlements);
    if (result.payload.settings) setSettings(result.payload.settings);
  };

  const handleDataImported = (data: {
    expenses: Expense[];
    settlements: Settlement[];
    settings: AppSettings;
  }) => {
    setExpenses(data.expenses);
    setSettlements(data.settlements);
    setSettings(prev => {
      const activeId = prev.mainUserId || data.settings.mainUserId;
      const userDefaultCurrency =
        (prev.userCurrencies && prev.userCurrencies[activeId]) ||
        prev.currencyCode ||
        'SGD';
      const userDefaultMeta = getCurrencyMeta(userDefaultCurrency);

      return {
        ...data.settings,
        mainUserId: activeId,
        currencyCode: userDefaultCurrency,
        currencySymbol: userDefaultMeta.symbol,
        userCurrencies: {
          ...(data.settings.userCurrencies || {}),
          ...(prev.userCurrencies || {}),
          [activeId]: userDefaultCurrency,
        },
      };
    });
  };

  // Handlers
  const handleSaveExpense = (
    expenseData: Omit<Expense, 'id' | 'createdAt'>,
    existingId?: string
  ) => {
    let nextExpenses: Expense[] = [];
    if (existingId) {
      // Update
      const existing = expenses.find(item => item.id === existingId);
      const updatedExpense: Expense = {
        ...expenseData,
        id: existingId,
        createdAt: existing?.createdAt || Date.now(),
      };
      nextExpenses = expenses.map(item => item.id === existingId ? updatedExpense : item);
      setExpenses(nextExpenses);
      saveExpenseToFirestore(updatedExpense).catch(err => console.warn('Firestore expense update:', err));
    } else {
      // Create
      const newExpense: Expense = {
        ...expenseData,
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
      };
      nextExpenses = [newExpense, ...expenses];
      setExpenses(nextExpenses);
      saveExpenseToFirestore(newExpense).catch(err => console.warn('Firestore expense create:', err));
    }
    syncExcelBackup(nextExpenses, settlements, settings);
    setEditingExpense(null);
  };

  const handleDeleteExpense = (id: string) => {
    const target = expenses.find(e => e.id === id);
    if (target) {
      setDeletingExpense(target);
    }
  };

  const handleConfirmedDeleteExpense = (id: string) => {
    const nextExpenses = expenses.filter(e => e.id !== id);
    setExpenses(nextExpenses);
    deleteExpenseFromFirestore(id).catch(err => console.warn('Firestore expense delete:', err));
    syncExcelBackup(nextExpenses, settlements, settings);
    setDeletingExpense(null);
  };

  const handleRecordSettlement = (
    amount: number,
    paidBy: string,
    paidTo: string,
    date: string,
    notes?: string
  ) => {
    const newSettlement: Settlement = {
      id: `settle-${Date.now()}`,
      date: date || new Date().toISOString().split('T')[0],
      amount,
      paidBy,
      paidTo,
      notes,
      createdAt: Date.now(),
    };
    const nextSettlements = [newSettlement, ...settlements];
    setSettlements(nextSettlements);
    saveSettlementToFirestore(newSettlement).catch(err => console.warn('Firestore settlement save:', err));
    syncExcelBackup(expenses, nextSettlements, settings);
  };

  const handleDeleteSettlement = (id: string) => {
    const nextSettlements = settlements.filter(s => s.id !== id);
    setSettlements(nextSettlements);
    deleteSettlementFromFirestore(id).catch(err => console.warn('Firestore settlement delete:', err));
    syncExcelBackup(expenses, nextSettlements, settings);
  };

  const handleResetSampleData = () => {
    const initialExps = getInitialExpenses();
    setExpenses(initialExps);
    setSettlements([]);
    setSettings(DEFAULT_SETTINGS);
    saveSettingsToFirestore(DEFAULT_SETTINGS).catch(() => {});
    syncExcelBackup(initialExps, [], DEFAULT_SETTINGS);
  };

  const handleClearAllData = () => {
    setExpenses([]);
    setSettlements([]);
    clearTransactionsInFirestore().catch(err => console.warn('Firestore clear error:', err));
    syncExcelBackup([], [], settings);
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettingsToFirestore(newSettings).catch(err => console.warn('Firestore settings update:', err));
    syncExcelBackup(expenses, settlements, newSettings);
  };

  const sym = settings.currencySymbol;

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center selection:bg-emerald-100">
      {/* Mobile Phone Device Container */}
      <div className="w-full max-w-md bg-slate-50 min-h-screen flex flex-col shadow-2xl relative border-x border-slate-200/80">
        {/* Top App Header */}
        <Header
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenShare={() => setIsShareOpen(true)}
          onOpenAddExpense={() => {
            setEditingExpense(null);
            setIsAddExpenseOpen(true);
          }}
          onOpenExcelDatabase={() => setIsExcelModalOpen(true)}
          onSwitchMainUser={handleSwitchMainUser}
          isDeveloper={isDeveloper}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 pb-24 space-y-4 overflow-y-auto">
          {/* View 1: Overview & Settlement */}
          {activeTab === 'overview' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Excel Storage & Firebase Live Pill */}
              <div
                id="excel-db-status-bar"
                className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-emerald-50/95 to-teal-50/95 border border-emerald-200/90 rounded-xl text-xs shadow-2xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-950 truncate text-[11px]">
                      <span>Firebase & Excel Live</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                      <span className="text-[10px] font-medium text-emerald-700">
                        {isSyncingExcel ? 'Saving...' : 'Real-time multi-user'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsExcelModalOpen(true)}
                  className="text-[10px] font-bold text-emerald-800 bg-white hover:bg-emerald-100/80 border border-emerald-200 px-2 py-1 rounded-lg transition-colors shrink-0 shadow-2xs flex items-center gap-1"
                >
                  Excel / Sync
                </button>
              </div>

              {/* Central Who Owes Whom Card */}
              <BalanceCard
                balance={balanceSummary}
                settings={settings}
                onOpenSettleUp={memberId => {
                  setSettleDefaultMemberId(memberId);
                  setIsSettleUpOpen(true);
                }}
              />

              {/* Recent Expenses Preview Section (Last 2 Months) */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Past
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    All ({userExpenses.length})
                  </button>
                </div>

                {/* Scope filter buttons for recent list */}
                <div className="flex items-center gap-1.5 mb-3">
                  <button
                    type="button"
                    onClick={() => setOverviewFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      overviewFilter === 'all'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({recentTwoMonthsExpenses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewFilter('shared')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      overviewFilter === 'shared'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Team ({recentTwoMonthsExpenses.filter(e => e.expenseScope !== 'personal' && e.splitType !== 'personal').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewFilter('personal')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      overviewFilter === 'personal'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Mine ({recentTwoMonthsExpenses.filter(e => e.expenseScope === 'personal' || e.splitType === 'personal').length})
                  </button>
                </div>

                {recentTwoMonthsExpenses.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-medium text-slate-600">No expenses in last 2 months</p>
                    <button
                      type="button"
                      onClick={() => setIsAddExpenseOpen(true)}
                      className="mt-3 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-700"
                    >
                      + Add First Meal / Expense
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentTwoMonthsExpenses
                      .filter(exp => {
                        const isPers = exp.expenseScope === 'personal' || exp.splitType === 'personal';
                        if (overviewFilter === 'shared') return !isPers;
                        if (overviewFilter === 'personal') return isPers;
                        return true;
                      })
                      .map(expense => (
                        <ExpenseItem
                          key={expense.id}
                          expense={expense}
                          settings={settings}
                          viewingRate={viewingRate}
                          rates={rates}
                          memberBalances={balanceSummary.memberBalances}
                          onEdit={exp => {
                            setEditingExpense(exp);
                            setIsAddExpenseOpen(true);
                          }}
                          onDelete={handleDeleteExpense}
                        />
                      ))}
                  </div>
                )}
              </div>

              {/* Past Settlement Repayments Log (if any involving this user) */}
              {userSettlements.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Paid
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {userSettlements.map(set => {
                      const payerId = normalizePayerId(set.paidBy, mainUserId, members);
                      const payer = members.find(m => m.id === payerId)?.name || (set.paidBy === 'me' ? mainUser.name : set.paidBy);
                      const receiverId = normalizePayerId(set.paidTo, mainUserId, members);
                      const receiver = members.find(m => m.id === receiverId)?.name || (set.paidTo === 'friend' ? 'Friend' : (set.paidTo || mainUser.name));

                      return (
                        <div
                          key={set.id}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-800">
                              {payer} repaid {receiver}{' '}
                              <span className="font-bold text-emerald-700">{sym}{set.amount.toFixed(2)}</span>
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {set.date} {set.notes ? `• ${set.notes}` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View 2: All Expenses History & Search */}
          {activeTab === 'history' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Search & Filter Header */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm space-y-2.5">
                {/* Search input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search meal, ride, groceries..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0 mr-1 flex items-center gap-0.5">
                    <Filter className="w-3 h-3" /> Filter:
                  </span>

                  {/* Scope Filter */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope('all')}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      selectedScope === 'all'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedScope('shared')}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      selectedScope === 'shared'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Team
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedScope('personal')}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      selectedScope === 'personal'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Mine
                  </button>

                  <span className="text-slate-300">|</span>

                  {/* Payer Filter for All Members */}
                  <button
                    type="button"
                    onClick={() => setSelectedPayer('all')}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      selectedPayer === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All
                  </button>

                  {members.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedPayer(selectedPayer === m.id ? 'all' : m.id)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        selectedPayer === m.id
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m.id === mainUserId ? `You (${m.name})` : m.name}
                    </button>
                  ))}

                  <span className="text-slate-300">|</span>

                  {/* Category Filter */}
                  {Object.values(CATEGORIES).slice(0, 4).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCategory(selectedCategory === c.id ? 'all' : c.id)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        selectedCategory === c.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {c.label.split('&')[0].trim()}
                    </button>
                  ))}
                </div>

                {/* Date Range Filter */}
                <DateRangeFilter
                  preset={datePreset}
                  startDate={startDate}
                  endDate={endDate}
                  onSelectPreset={(newPreset, start, end) => {
                    setDatePreset(newPreset);
                    if (start !== undefined) setStartDate(start);
                    if (end !== undefined) setEndDate(end);
                  }}
                  onChangeStartDate={setStartDate}
                  onChangeEndDate={setEndDate}
                  onClearDateRange={() => {
                    setDatePreset('all');
                    setStartDate('');
                    setEndDate('');
                  }}
                />
              </div>

              {/* Filtered List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>
                      Showing <strong className="text-slate-800 font-bold">{filteredExpenses.length}</strong> expense{filteredExpenses.length === 1 ? '' : 's'}
                    </span>
                    {filteredExpenses.length > 0 && (
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80 text-[11px]">
                        Total: {sym}{filteredTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {(selectedScope !== 'all' ||
                    selectedCategory !== 'all' ||
                    selectedPayer !== 'all' ||
                    searchQuery ||
                    datePreset !== 'all' ||
                    startDate ||
                    endDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScope('all');
                        setSelectedCategory('all');
                        setSelectedPayer('all');
                        setSearchQuery('');
                        setDatePreset('all');
                        setStartDate('');
                        setEndDate('');
                      }}
                      className="text-emerald-700 font-bold hover:underline shrink-0 text-[11px]"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>

                {filteredExpenses.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-400">
                    <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-700">No matching expenses found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search terms or filters</p>
                  </div>
                ) : (
                  filteredExpenses.map(expense => (
                    <ExpenseItem
                      key={expense.id}
                      expense={expense}
                      settings={settings}
                      viewingRate={viewingRate}
                      rates={rates}
                      memberBalances={balanceSummary.memberBalances}
                      onEdit={exp => {
                        setEditingExpense(exp);
                        setIsAddExpenseOpen(true);
                      }}
                      onDelete={handleDeleteExpense}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Phone Tab Navigation Bar - center green Add Expense button */}
        <nav className="fixed bottom-0 max-w-md w-full bg-white/95 backdrop-blur-md border-t border-slate-200/90 py-1.5 px-4 z-30 flex items-center justify-between shadow-lg">
          <button
            type="button"
            id="tab-overview"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all ${
              activeTab === 'overview'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px]">Home</span>
          </button>

          {/* Center Green Add Expense Button */}
          <div className="flex-1 flex justify-center -translate-y-3.5">
            <button
              type="button"
              id="bottom-nav-add-expense-btn"
              onClick={() => {
                setEditingExpense(null);
                setIsAddExpenseOpen(true);
              }}
              aria-label="Add new expense"
              className="w-13 h-13 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex flex-col items-center justify-center shadow-lg shadow-emerald-600/35 border-4 border-slate-50 transition-all cursor-pointer group"
            >
              <Plus className="w-6 h-6 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
              <span className="text-[9px] font-bold tracking-tight -mt-1">Add</span>
            </button>
          </div>

          <button
            type="button"
            id="tab-history"
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all ${
              activeTab === 'history'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-400 hover:text-slate-600 font-medium'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px]">Logs</span>
          </button>
        </nav>

        {/* Modals */}
        <AddExpenseModal
          isOpen={isAddExpenseOpen}
          onClose={() => {
            setIsAddExpenseOpen(false);
            setEditingExpense(null);
          }}
          onSave={handleSaveExpense}
          settings={settings}
          editingExpense={editingExpense}
        />

        <SettleUpModal
          isOpen={isSettleUpOpen}
          onClose={() => {
            setIsSettleUpOpen(false);
            setSettleDefaultMemberId(undefined);
          }}
          balance={balanceSummary}
          settings={settings}
          defaultMemberId={settleDefaultMemberId}
          onRecordSettlement={handleRecordSettlement}
        />

        <ShareSummaryModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          balance={balanceSummary}
          settings={settings}
          recentExpenses={userExpenses}
          viewingRate={viewingRate}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onResetSampleData={handleResetSampleData}
          onClearAllData={handleClearAllData}
          onOpenExcelDatabase={() => setIsExcelModalOpen(true)}
          onRequestSwitchUser={handleRequestSwitchUser}
          isDeveloper={isDeveloper}
          onConvertDatabaseCurrency={handleConvertDatabaseCurrency}
          totalSpent={totalSpent}
        />

        <ExcelDatabaseModal
          isOpen={isExcelModalOpen}
          onClose={() => setIsExcelModalOpen(false)}
          expenses={expenses}
          settlements={settlements}
          settings={settings}
          onDataImported={handleDataImported}
          onReloadFromBackend={handleReloadFromExcel}
          onClearAllData={handleClearAllData}
          isBackendConnected={isBackendConnected}
          isDeveloper={isDeveloper}
        />

        <VerifyPasswordModal
          isOpen={isVerifyPasswordOpen}
          targetUser={pendingSwitchUser}
          onClose={() => {
            setIsVerifyPasswordOpen(false);
            setPendingSwitchUser(null);
          }}
          onVerified={handleConfirmedSwitchUser}
        />

        <FirstTimeSetupModal
          isOpen={isFirstTimeSetupOpen}
          onComplete={handleFirstTimeSetupComplete}
        />

        <ConfirmDeleteExpenseModal
          isOpen={!!deletingExpense}
          onClose={() => setDeletingExpense(null)}
          expense={deletingExpense}
          settings={settings}
          viewingRate={viewingRate}
          onConfirmDelete={handleConfirmedDeleteExpense}
        />
      </div>
    </div>
  );
}
