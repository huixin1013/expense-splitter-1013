import React, { useState, useEffect } from 'react';
import { X, Check, Calculator, Calendar, User, Users, Globe, ChevronDown, Sparkles, RefreshCw } from 'lucide-react';
import { Expense, ExpenseCategory, AppSettings, ExpenseScope } from '../types';
import { CATEGORIES } from '../utils/categoryMeta';
import { getCurrentDateISO } from '../utils/dateUtils';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, getCurrencyMeta } from '../utils/currencyConstants';
import { fetchExchangeRates } from '../utils/excelService';
import { normalizePayerId } from '../utils/calculations';
import { getConversionRate } from '../utils/currencyUtils';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Omit<Expense, 'id' | 'createdAt'>, existingId?: string) => void;
  settings: AppSettings;
  editingExpense?: Expense | null;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  settings,
  editingExpense,
}) => {
  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [{ id: 'u_huixin', name: 'HuiXin' }, { id: 'u_ali', name: 'Ali' }];
  const mainUserId = settings.mainUserId || members[0]?.id || 'u_huixin';
  const allMemberIds = members.map(m => m.id);

  // Standardised currency follows the default currency chosen in Settings
  const standardCurrencyCode = settings.currencyCode || settings.baseCurrencyCode || 'SGD';
  const standardCurrencyMeta = getCurrencyMeta(standardCurrencyCode);
  const standardCurrencySymbol = settings.currencySymbol || settings.baseCurrencySymbol || standardCurrencyMeta.symbol;
  // User's default viewing currency
  const userViewingCode = settings.currencyCode || standardCurrencyCode;

  const [amountStr, setAmountStr] = useState('');
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>(userViewingCode);
  const [date, setDate] = useState(getCurrentDateISO());
  const [category, setCategory] = useState<ExpenseCategory>('meal');
  const [otherDetail, setOtherDetail] = useState('');
  const [expenseScope, setExpenseScope] = useState<ExpenseScope>('shared');
  const [paidBy, setPaidBy] = useState<string>(mainUserId);
  const [splitAmong, setSplitAmong] = useState<string[]>(allMemberIds);
  const [error, setError] = useState<string | null>(null);

  // Live exchange rates state
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  const loadRates = async (base: string) => {
    setRatesLoading(true);
    const data = await fetchExchangeRates(base);
    if (data && data.rates) {
      setRates(data.rates);
    }
    setRatesLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadRates(standardCurrencyCode);
    }
  }, [isOpen, standardCurrencyCode]);

  // Initialize form when opening or editing
  useEffect(() => {
    if (editingExpense) {
      // If editing an existing expense with original currency saved
      if (editingExpense.originalCurrency) {
        setSelectedCurrencyCode(editingExpense.originalCurrency);
        const origVal = editingExpense.originalAmount !== undefined ? editingExpense.originalAmount : editingExpense.amount;
        setAmountStr(origVal.toString());
      } else {
        setSelectedCurrencyCode(userViewingCode);
        setAmountStr(editingExpense.amount.toString());
      }

      setDate(editingExpense.date);
      setCategory(editingExpense.category);
      if (editingExpense.category === 'other') {
        setOtherDetail(editingExpense.title || '');
      } else {
        setOtherDetail('');
      }
      const scope = editingExpense.expenseScope || (editingExpense.splitType === 'personal' ? 'personal' : 'shared');
      setExpenseScope(scope);

      // Map paidBy accurately to known member IDs
      const pb = normalizePayerId(editingExpense.paidBy, mainUserId, members);
      setPaidBy(pb);

      if (editingExpense.splitAmong && editingExpense.splitAmong.length > 0) {
        setSplitAmong(editingExpense.splitAmong.map(id => normalizePayerId(id, mainUserId, members)));
      } else {
        setSplitAmong(scope === 'personal' ? [pb] : allMemberIds);
      }
    } else {
      setSelectedCurrencyCode(userViewingCode);
      setAmountStr('');
      setDate(getCurrentDateISO());
      setCategory('meal');
      setOtherDetail('');
      setExpenseScope('shared');
      setPaidBy(mainUserId);
      setSplitAmong(allMemberIds);
    }
    setError(null);
  }, [editingExpense, isOpen, mainUserId, userViewingCode]);

  if (!isOpen) return null;

  const numAmount = parseFloat(amountStr) || 0;
  const selectedCurrency = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrencyCode) || DEFAULT_CURRENCY;
  const isDifferentFromBase = selectedCurrency.code.toUpperCase() !== standardCurrencyCode.toUpperCase();

  // Rate calculation: 1 standardCurrencyCode = X selectedCurrencyCode
  const rateAgainstBase = isDifferentFromBase
    ? getConversionRate(standardCurrencyCode, selectedCurrency.code, rates)
    : 1.0;

  const standardizedAmount = isDifferentFromBase && rateAgainstBase > 0
    ? Math.round((numAmount / rateAgainstBase) * 100) / 100
    : numAmount;

  const handleToggleMemberSplit = (memberId: string) => {
    if (splitAmong.includes(memberId)) {
      if (splitAmong.length === 1) return; // Must keep at least one participant
      setSplitAmong(splitAmong.filter(id => id !== memberId));
    } else {
      setSplitAmong([...splitAmong, memberId]);
    }
  };

  const activeParticipants = expenseScope === 'personal' ? [paidBy] : splitAmong;
  const originalSharePerPerson = activeParticipants.length > 0 ? numAmount / activeParticipants.length : 0;
  const standardizedSharePerPerson = activeParticipants.length > 0 ? standardizedAmount / activeParticipants.length : 0;
  const payerName = members.find(m => m.id === paidBy)?.name || 'Payer';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (numAmount <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    let finalTitle = '';
    if (category === 'other') {
      if (!otherDetail.trim()) {
        setError('Please fill in what this other expense was for');
        return;
      }
      finalTitle = otherDetail.trim();
    } else {
      finalTitle = CATEGORIES[category]?.label || 'Expense';
    }

    if (expenseScope === 'shared' && splitAmong.length === 0) {
      setError('Please select at least one person to split with');
      return;
    }

    const effectiveParticipants = expenseScope === 'personal' ? [paidBy] : splitAmong;
    const finalStandardizedAmount = Math.round(standardizedAmount * 100) / 100;
    const eachShare = Math.round((finalStandardizedAmount / effectiveParticipants.length) * 100) / 100;

    onSave(
      {
        title: finalTitle,
        amount: finalStandardizedAmount,
        originalAmount: numAmount,
        originalCurrency: selectedCurrency.code,
        originalCurrencySymbol: selectedCurrency.symbol,
        exchangeRate: isDifferentFromBase ? rateAgainstBase : 1.0,
        date: date || getCurrentDateISO(),
        category,
        paidBy,
        splitType: expenseScope === 'personal' ? 'personal' : 'equal',
        expenseScope,
        splitAmong: effectiveParticipants,
        myShare: effectiveParticipants.includes(mainUserId) ? eachShare : 0,
        friendShare: 0,
        notes: category === 'other' ? otherDetail.trim() : undefined,
      },
      editingExpense?.id
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity">
      <div
        id="add-expense-modal-box"
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl h-[88vh] sm:h-[85vh] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {editingExpense ? 'Edit Expense' : 'Add New Expense'}
              </h2>
              <p className="text-[11px] text-slate-500">
                Record shared spending or personal expenses
              </p>
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

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 flex flex-col">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Expense Scope Selector: Shared vs Personal */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Expense Type
            </label>
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setExpenseScope('shared')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  expenseScope === 'shared'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Shared Expense</span>
              </button>
              <button
                type="button"
                onClick={() => setExpenseScope('personal')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  expenseScope === 'personal'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Personal (My Stuff)</span>
              </button>
            </div>
          </div>

          {/* Amount Input with Currency Selection and Live Standardization */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>Amount & Currency</span>
                {ratesLoading && (
                  <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
                )}
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400 font-medium">Standardised to:</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {standardCurrencyCode}
                </span>
              </div>
            </div>

            <div className="flex items-stretch bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white focus-within:border-emerald-500 transition-all overflow-hidden">
              {/* Currency Dropdown */}
              <div className="relative flex items-center border-r border-slate-200 bg-slate-100/90 hover:bg-slate-200/70 transition-colors shrink-0">
                <select
                  value={selectedCurrencyCode}
                  onChange={e => setSelectedCurrencyCode(e.target.value)}
                  className="h-full pl-3 pr-7 py-2.5 bg-transparent text-xs sm:text-sm font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none"
                  title="Select currency added"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 pointer-events-none" />
              </div>

              {/* Number Input */}
              <input
                type="number"
                step="any"
                min="0"
                required
                placeholder={selectedCurrency.code === 'JPY' || selectedCurrency.code === 'KRW' ? '1000' : '100'}
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full px-4 py-2.5 text-2xl font-extrabold text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-300"
                autoFocus={!editingExpense}
              />
            </div>

            {/* Live Exchange Rate Standardization Banner */}
            {isDifferentFromBase && numAmount > 0 && (
              <div className="mt-2 p-2.5 bg-emerald-50/80 border border-emerald-200/90 rounded-xl text-xs space-y-1 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-950 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Standardised App Total:
                  </span>
                  <span className="text-sm font-extrabold text-emerald-700">
                    {standardCurrencySymbol} {standardizedAmount.toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-800/80 flex items-center justify-between pt-0.5 border-t border-emerald-100">
                  <span>Live Exchange Rate:</span>
                  <span className="font-semibold">
                    1 {standardCurrencyCode} = {rateAgainstBase.toFixed(rateAgainstBase >= 100 ? 1 : 4)} {selectedCurrency.code}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 pt-0.5">
                  Excel records your original <strong>{selectedCurrency.code} {numAmount.toLocaleString()}</strong>, while balances are calculated in <strong>{standardCurrencyCode}</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Category Chips */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.values(CATEGORIES).map(cat => {
                const isSelected = category === cat.id;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{cat.label.split('&')[0].trim()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Only shown if user selects 'other': What was this for */}
          {category === 'other' && (
            <div className="animate-in fade-in duration-150">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                What was this for? <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Workshop repair, Medicine, Gift, etc."
                value={otherDetail}
                onChange={e => setOtherDetail(e.target.value)}
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                autoFocus
              />
            </div>
          )}

          {/* Date Picker */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Date of Expense</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* Who Paid Dropdown */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Who paid?
            </label>
            <select
              value={paidBy}
              onChange={e => setPaidBy(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.id === mainUserId ? '(Main User)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Split Among Members (Only for Shared Expenses) */}
          {expenseScope === 'shared' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Split equally among ({splitAmong.length} people)
                </label>
                <button
                  type="button"
                  onClick={() => setSplitAmong(allMemberIds)}
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Select all
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {members.map(m => {
                  const isChecked = splitAmong.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleToggleMemberSplit(m.id)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                        isChecked
                          ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-1 ring-emerald-600'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-bold">{m.name}</span>
                      <span className="text-[11px]">
                        {isChecked
                          ? `✓ ${
                              numAmount > 0
                                ? isDifferentFromBase
                                  ? `${selectedCurrency.symbol}${(numAmount / splitAmong.length).toFixed(selectedCurrency.code === 'JPY' ? 0 : 2)} (≈ ${standardCurrencySymbol}${(standardizedAmount / splitAmong.length).toFixed(2)})`
                                  : `${standardCurrencySymbol}${(standardizedAmount / splitAmong.length).toFixed(2)}`
                                : ''
                            }`
                          : 'Excluded'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Real-time split preview card */}
          {numAmount > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              {expenseScope === 'personal' ? (
                <div>
                  <div className="font-bold text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Personal Expense for {payerName}</span>
                    </span>
                    <span>
                      {selectedCurrency.symbol}{numAmount.toFixed(selectedCurrency.code === 'JPY' ? 0 : 2)} {selectedCurrency.code}
                      {isDifferentFromBase && ` (≈ ${standardCurrencySymbol}${standardizedAmount.toFixed(2)})`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    This is recorded as {payerName}'s personal expense ("My Stuff"). It will <strong>NOT</strong> affect debt balances between friends.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-slate-800 flex justify-between">
                    <span>
                      Total:{' '}
                      {selectedCurrency.symbol}{numAmount.toFixed(selectedCurrency.code === 'JPY' ? 0 : 2)}
                      {isDifferentFromBase && (
                        <span className="text-slate-500 font-normal"> (≈ {standardCurrencySymbol}${standardizedAmount.toFixed(2)})</span>
                      )}
                    </span>
                    <span className="text-emerald-700 font-extrabold">
                      {selectedCurrency.symbol}{originalSharePerPerson.toFixed(selectedCurrency.code === 'JPY' ? 0 : 2)}
                      {isDifferentFromBase && ` (≈ ${standardCurrencySymbol}${standardizedSharePerPerson.toFixed(2)})`} / person
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Paid by <strong>{payerName}</strong>. Split between {activeParticipants.length} people ({activeParticipants.map(id => members.find(m => m.id === id)?.name).filter(Boolean).join(', ')}).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{editingExpense ? 'Save Changes' : expenseScope === 'personal' ? 'Add Personal Expense' : 'Add Shared Expense'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


