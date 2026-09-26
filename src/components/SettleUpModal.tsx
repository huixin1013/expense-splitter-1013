import React, { useState, useEffect } from 'react';
import { X, Check, HandCoins, Calendar, ChevronDown, Sparkles, RefreshCw, CheckCircle2, User, Users } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BalanceSummary, AppSettings } from '../types';
import { getCurrentDateISO } from '../utils/dateUtils';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '../utils/currencyConstants';
import { fetchExchangeRates } from '../utils/excelService';
import { getConversionRate } from '../utils/currencyUtils';

interface SettleUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: BalanceSummary;
  settings: AppSettings;
  defaultMemberId?: string;
  onRecordSettlement: (amount: number, paidBy: string, paidTo: string, date: string, notes?: string) => void;
}

export const SettleUpModal: React.FC<SettleUpModalProps> = ({
  isOpen,
  onClose,
  balance,
  settings,
  defaultMemberId,
  onRecordSettlement,
}) => {
  // Database base currency
  const databaseBaseCode = settings.baseCurrencyCode || 'SGD';
  const databaseBaseSymbol = settings.baseCurrencySymbol || 'SGD';

  // Active viewing currency
  const userViewingCode = settings.currencyCode || 'SGD';
  const userViewingSymbol = settings.currencySymbol || 'SGD';

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [{ id: 'u_huixin', name: 'HuiXin' }, { id: 'u_ali', name: 'Ali' }];
  const mainUserId = settings.mainUserId || members[0]?.id || 'u_huixin';
  const otherMembers = members.filter(m => m.id !== mainUserId);

  // Target member to settle with
  const initialTargetId = defaultMemberId && defaultMemberId !== mainUserId
    ? defaultMemberId
    : otherMembers[0]?.id || members[0]?.id;

  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(initialTargetId);
  const targetMember = members.find(m => m.id === selectedPartnerId) || otherMembers[0] || members[0];
  const targetBalance = balance.memberBalances?.find(b => b.memberId === selectedPartnerId);

  // Direction: 'they_pay_main' or 'main_pays_them'
  // If partner owes main user, default is partner pays main user
  const partnerOwesMain = targetBalance ? targetBalance.netBalance > 0 : true;
  const [direction, setDirection] = useState<'they_pay_main' | 'main_pays_them'>(
    partnerOwesMain ? 'they_pay_main' : 'main_pays_them'
  );

  const suggestedAmount = targetBalance ? Math.abs(targetBalance.netBalance) : 0;
  const [amountStr, setAmountStr] = useState(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '');
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>(userViewingCode);
  const [paymentDate, setPaymentDate] = useState(getCurrentDateISO());
  const [notes, setNotes] = useState('');
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

  // Load exchange rates once when modal opens or base currency changes
  useEffect(() => {
    if (isOpen) {
      loadRates(databaseBaseCode);
      setSelectedCurrencyCode(userViewingCode);
      setError(null);
    }
  }, [isOpen, databaseBaseCode, userViewingCode]);

  // Initialize partner selection, direction, and amount when modal opens or defaultMemberId changes
  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setPaymentDate(getCurrentDateISO());

      let targetId = '';
      if (defaultMemberId && defaultMemberId !== mainUserId && members.some(m => m.id === defaultMemberId)) {
        targetId = defaultMemberId;
      } else {
        const memberWithDebt = otherMembers.find(m => {
          const b = balance.memberBalances?.find(item => item.memberId === m.id);
          return b && Math.abs(b.netBalance) > 0.005;
        });
        targetId = memberWithDebt?.id || otherMembers[0]?.id || members[0]?.id || '';
      }

      setSelectedPartnerId(targetId);

      const b = balance.memberBalances?.find(item => item.memberId === targetId);
      if (b) {
        const owes = b.netBalance > 0;
        setDirection(owes ? 'they_pay_main' : 'main_pays_them');
        const amt = Math.abs(b.netBalance);
        setAmountStr(amt > 0 ? amt.toFixed(userViewingCode === 'JPY' || userViewingCode === 'KRW' ? 0 : 2) : '');
      } else {
        setAmountStr('');
      }
    }
  }, [isOpen, defaultMemberId, mainUserId]);

  // Synchronize direction and amount when user switches partner manually
  const handlePartnerChange = (newId: string) => {
    setSelectedPartnerId(newId);
    const b = balance.memberBalances?.find(item => item.memberId === newId);
    if (b) {
      const owes = b.netBalance > 0;
      setDirection(owes ? 'they_pay_main' : 'main_pays_them');
      const amt = Math.abs(b.netBalance);
      setAmountStr(amt > 0 ? amt.toFixed(selectedCurrencyCode === 'JPY' || selectedCurrencyCode === 'KRW' ? 0 : 2) : '');
    } else {
      setAmountStr('');
    }
  };

  if (!isOpen) return null;

  const numAmount = parseFloat(amountStr) || 0;
  const selectedCurrency = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrencyCode) || DEFAULT_CURRENCY;
  const isDifferentFromBase = selectedCurrency.code.toUpperCase() !== databaseBaseCode.toUpperCase();

  // Rate calculation: 1 databaseBaseCode = X selectedCurrencyCode
  const rateAgainstBase = isDifferentFromBase
    ? getConversionRate(databaseBaseCode, selectedCurrency.code, rates)
    : 1.0;

  const standardizedAmount = isDifferentFromBase && rateAgainstBase > 0
    ? Math.round((numAmount / rateAgainstBase) * 100) / 100
    : numAmount;

  const payerId = direction === 'they_pay_main' ? selectedPartnerId : mainUserId;
  const receiverId = direction === 'they_pay_main' ? mainUserId : selectedPartnerId;
  const payerName = members.find(m => m.id === payerId)?.name || 'Payer';
  const receiverName = members.find(m => m.id === receiverId)?.name || 'Receiver';

  const handleApplyFullBalance = () => {
    if (suggestedAmount <= 0) return;
    // suggestedAmount is currently in viewing currency
    // if selectedCurrency differs from viewing currency:
    const viewingToSelectedRate = getConversionRate(userViewingCode, selectedCurrency.code, rates);
    if (selectedCurrency.code !== userViewingCode && viewingToSelectedRate > 0) {
      const foreignAmount = suggestedAmount * viewingToSelectedRate;
      const formatted = selectedCurrency.code === 'JPY' || selectedCurrency.code === 'KRW'
        ? Math.round(foreignAmount).toString()
        : foreignAmount.toFixed(2);
      setAmountStr(formatted);
    } else {
      const formatted = selectedCurrency.code === 'JPY' || selectedCurrency.code === 'KRW'
        ? Math.round(suggestedAmount).toString()
        : suggestedAmount.toFixed(2);
      setAmountStr(formatted);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setError('Please enter a valid payment amount greater than 0');
      return;
    }

    const finalStandardizedAmount = Math.round(standardizedAmount * 100) / 100;
    if (finalStandardizedAmount <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }

    let settlementNote = notes.trim();
    if (isDifferentFromBase) {
      const currencyNote = `Paid ${selectedCurrency.symbol}${numAmount.toFixed(selectedCurrency.code === 'JPY' ? 0 : 2)} ${selectedCurrency.code} (Rate: 1 ${databaseBaseCode} = ${rateAgainstBase.toFixed(rateAgainstBase >= 100 ? 1 : 4)} ${selectedCurrency.code})`;
      settlementNote = settlementNote ? `${settlementNote} • ${currencyNote}` : currencyNote;
    }

    onRecordSettlement(
      finalStandardizedAmount,
      payerId,
      receiverId,
      paymentDate || getCurrentDateISO(),
      settlementNote || undefined
    );

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity">
      <div
        id="settle-up-modal-box"
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <HandCoins className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Settle Up Balances</h2>
              <p className="text-[11px] text-slate-500">Record reimbursement or return payment</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Select Member to settle with */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Settle with Member
            </label>
            <select
              value={selectedPartnerId}
              onChange={e => handlePartnerChange(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {otherMembers.map(m => {
                const b = balance.memberBalances?.find(item => item.memberId === m.id);
                const desc = b
                  ? b.netBalance > 0
                    ? `(owes you ${userViewingSymbol}${b.netBalance.toFixed(2)})`
                    : b.netBalance < 0
                    ? `(you owe ${userViewingSymbol}${Math.abs(b.netBalance).toFixed(2)})`
                    : '(settled)'
                  : '';
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} {desc}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Payment Direction Toggle */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Payment Direction
            </label>
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setDirection('they_pay_main')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  direction === 'they_pay_main'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span className="truncate">{targetMember.name} paid {balance.mainUserName}</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection('main_pays_them')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  direction === 'main_pays_them'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span className="truncate">{balance.mainUserName} paid {targetMember.name}</span>
              </button>
            </div>
          </div>

          {/* Amount Input with Currency Selection and Live Standardization (Styled same as Add Expense) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>Amount & Currency</span>
                {ratesLoading && (
                  <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
                )}
              </label>
              <div className="flex items-center gap-1.5">
                {suggestedAmount > 0 && (
                  <button
                    type="button"
                    onClick={handleApplyFullBalance}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 transition-colors cursor-pointer"
                  >
                    Pay full ({userViewingSymbol}{suggestedAmount.toFixed(2)})
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-medium">Standardised:</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    {databaseBaseCode}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-stretch bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white focus-within:border-emerald-500 transition-all overflow-hidden">
              {/* Currency Dropdown */}
              <div className="relative flex items-center border-r border-slate-200 bg-slate-100/90 hover:bg-slate-200/70 transition-colors shrink-0">
                <select
                  value={selectedCurrencyCode}
                  onChange={e => setSelectedCurrencyCode(e.target.value)}
                  className="h-full pl-3 pr-7 py-2.5 bg-transparent text-xs sm:text-sm font-extrabold text-slate-800 focus:outline-none cursor-pointer appearance-none"
                  title="Select settlement currency"
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
                step={selectedCurrency.code === 'JPY' || selectedCurrency.code === 'KRW' ? '1' : '0.01'}
                min="0.01"
                required
                placeholder={selectedCurrency.code === 'JPY' || selectedCurrency.code === 'KRW' ? '1000' : '0.00'}
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full px-4 py-2.5 text-2xl font-extrabold text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-300"
                autoFocus
              />
            </div>

            {/* Live Exchange Rate Standardization Banner */}
            {isDifferentFromBase && numAmount > 0 && (
              <div className="mt-2 p-2.5 bg-emerald-50/80 border border-emerald-200/90 rounded-xl text-xs space-y-1 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-950 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Standardised Settlement Total:
                  </span>
                  <span className="text-sm font-extrabold text-emerald-700">
                    {databaseBaseSymbol} {standardizedAmount.toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-800/80 flex items-center justify-between pt-0.5 border-t border-emerald-100">
                  <span>Live Exchange Rate:</span>
                  <span className="font-semibold">
                    1 {databaseBaseCode} = {rateAgainstBase.toFixed(rateAgainstBase >= 100 ? 1 : 4)} {selectedCurrency.code}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 pt-0.5">
                  You are paying in <strong>{selectedCurrency.code} {numAmount.toLocaleString()}</strong>, which settles <strong>{databaseBaseSymbol}{standardizedAmount.toFixed(2)}</strong> of balance.
                </p>
              </div>
            )}
          </div>

          {/* Payment Date */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Payment Date</span>
            </label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="w-full px-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* Optional Note */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Lunch return, Settle balance, Bank transfer"
              className="w-full px-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-medium"
            />
          </div>

          {/* Settlement Preview Summary Card */}
          {numAmount > 0 && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs text-emerald-950 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-medium">
                  <strong>{payerName}</strong> pays{' '}
                  <span className="font-bold text-emerald-700">
                    {selectedCurrency.symbol}{numAmount.toFixed(selectedCurrency.code === 'JPY' ? 0 : 2)} {selectedCurrency.code}
                  </span>
                  {isDifferentFromBase && (
                    <span className="text-slate-600"> (settles {databaseBaseSymbol}{standardizedAmount.toFixed(2)})</span>
                  )}{' '}
                  to <strong>{receiverName}</strong> on <strong>{paymentDate}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Confirm Settlement</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
