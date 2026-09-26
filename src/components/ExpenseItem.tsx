import React, { useMemo } from 'react';
import { Trash2, Edit3, Users } from 'lucide-react';
import { Expense, AppSettings, MemberBalanceDetail } from '../types';
import { CATEGORIES } from '../utils/categoryMeta';
import { formatDisplayDate } from '../utils/dateUtils';
import { normalizePayerId } from '../utils/calculations';
import { getConversionRate } from '../utils/currencyUtils';

interface ExpenseItemProps {
  expense: Expense;
  settings: AppSettings;
  viewingRate?: number;
  rates?: Record<string, number> | null;
  memberBalances?: MemberBalanceDetail[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

export const ExpenseItem: React.FC<ExpenseItemProps> = ({
  expense,
  settings,
  viewingRate = 1.0,
  rates,
  memberBalances,
  onEdit,
  onDelete,
}) => {
  const meta = CATEGORIES[expense.category] || CATEGORIES.other;
  const Icon = meta.icon;
  const sym = settings.currencySymbol || 'SGD';
  const userCur = settings.currencyCode || 'SGD';
  const isJpyOrKrw = userCur === 'JPY' || userCur === 'KRW';

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [{ id: 'u_huixin', name: 'HuiXin' }, { id: 'u_ali', name: 'Ali' }];
  const mainUserId = settings.mainUserId || members[0]?.id || 'u_huixin';

  const isPersonal = expense.expenseScope === 'personal' || expense.splitType === 'personal';
  
  // Resolve payer accurately matching members
  const effectivePaidById = normalizePayerId(expense.paidBy, mainUserId, members);
  const payerMember = members.find(m => m.id === effectivePaidById);
  const isPaidByMain = effectivePaidById === mainUserId;
  const payerDisplayName = isPaidByMain ? 'You' : (payerMember?.name || expense.paidBy || 'Friend');

  // Multiplied by live exchange rate for dynamic viewing conversion
  const displayAmount = useMemo(() => {
    if (expense.originalCurrency && expense.originalAmount !== undefined) {
      if (expense.originalCurrency.toUpperCase() === userCur.toUpperCase()) {
        return Number(expense.originalAmount);
      }
      const directRate = getConversionRate(expense.originalCurrency, userCur, rates);
      if (directRate > 0) {
        return Math.round(Number(expense.originalAmount) * directRate * 100) / 100;
      }
    }
    return viewingRate && viewingRate !== 1
      ? Math.round(expense.amount * viewingRate * 100) / 100
      : expense.amount;
  }, [expense.originalCurrency, expense.originalAmount, expense.amount, userCur, rates, viewingRate]);

  // Compute multi-user impact in viewing currency
  const rawParticipants = expense.splitAmong && expense.splitAmong.length > 0
    ? expense.splitAmong
    : members.map(m => m.id);
  const participants = rawParticipants.map(id => normalizePayerId(id, mainUserId, members));
  const splitCount = participants.length > 0 ? participants.length : 1;
  const eachShare = Math.round((displayAmount / splitCount) * 100) / 100;
  const mainParticipated = participants.includes(mainUserId);

  let impactText = '';
  let impactColor = 'text-slate-500';
  let isSettled = false;

  const formatAmountText = (val: number) => {
    return isJpyOrKrw ? Math.round(val).toLocaleString() : val.toFixed(2);
  };

  if (isPersonal) {
    impactText = isPaidByMain ? 'Personal' : `${payerDisplayName}'s personal`;
    impactColor = 'text-slate-500';
    isSettled = false;
  } else if (isPaidByMain) {
    const otherParticipants = participants.filter(id => id !== mainUserId);
    const totalOthersOweInitial = displayAmount - (mainParticipated ? eachShare : 0);

    if (otherParticipants.length === 0 || totalOthersOweInitial <= 0) {
      impactText = 'Covered by you';
      impactColor = 'text-slate-500';
      isSettled = true;
    } else if (memberBalances && memberBalances.length > 0) {
      // Calculate how much is still remaining to be received from other participants of this expense
      const stillOwedToMain = otherParticipants.reduce((sum, pId) => {
        const mb = memberBalances.find(m => m.memberId === pId);
        if (!mb) return sum + eachShare;
        const pendingFromMember = Math.max(0, Math.min(eachShare, mb.theyOweYou));
        return sum + pendingFromMember;
      }, 0);

      if (stillOwedToMain <= 0.005) {
        impactText = 'Settled (Received)';
        impactColor = 'text-emerald-600 font-semibold';
        isSettled = true;
      } else {
        impactText = `+${sym} ${formatAmountText(stillOwedToMain)} to receive`;
        impactColor = 'text-emerald-600 font-semibold';
        isSettled = false;
      }
    } else {
      impactText = `+${sym} ${formatAmountText(totalOthersOweInitial)} to receive`;
      impactColor = 'text-emerald-600 font-semibold';
      isSettled = false;
    }
  } else {
    if (mainParticipated) {
      const payerBal = memberBalances?.find(mb => mb.memberId === effectivePaidById);
      if (payerBal) {
        if (payerBal.youOweThem <= 0.005) {
          impactText = 'Settled';
          impactColor = 'text-emerald-600 font-semibold';
          isSettled = true;
        } else {
          const remainingOwed = Math.min(eachShare, payerBal.youOweThem);
          impactText = `You owe ${sym} ${formatAmountText(remainingOwed)}`;
          impactColor = 'text-rose-600 font-semibold';
          isSettled = false;
        }
      } else {
        impactText = `You owe ${sym} ${formatAmountText(eachShare)}`;
        impactColor = 'text-rose-600 font-semibold';
        isSettled = false;
      }
    } else {
      impactText = 'Not involved';
      impactColor = 'text-slate-400';
      isSettled = false;
    }
  }

  // Display title: for other category, show what it was for (notes); for others, show category label
  const displayTitle = expense.category === 'other'
    ? (expense.notes || expense.title || 'Other Expense')
    : meta.label;

  // Check if original currency was different from current viewing currency
  const showOriginalBadge = !!(
    expense.originalCurrency &&
    expense.originalAmount !== undefined &&
    (expense.originalCurrency.toUpperCase() !== userCur.toUpperCase() ||
     Math.abs(Number(expense.originalAmount) - displayAmount) > 0.05)
  );

  return (
    <div
      id={`expense-item-${expense.id}`}
      className="bg-white rounded-xl p-3 border border-slate-200/80 hover:border-slate-300 transition-all shadow-2xs"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Icon and Details */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl ${meta.bgLightClass} ${meta.colorClass} border ${meta.borderClass} flex items-center justify-center shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {displayTitle}
              </h3>
              {isPersonal && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  Personal
                </span>
              )}
              {showOriginalBadge && (
                <span
                  className="text-[9px] font-bold text-emerald-800 bg-emerald-50/90 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1"
                  title={`Added in ${expense.originalCurrency}: ${expense.originalCurrencySymbol || ''}${expense.originalAmount}`}
                >
                  <span className="text-[8px] text-emerald-600 uppercase font-semibold">Added:</span>
                  <span>
                    {expense.originalCurrencySymbol || ''}
                    {Number(expense.originalAmount).toFixed(expense.originalCurrency === 'JPY' || expense.originalCurrency === 'KRW' ? 0 : 2)}
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 truncate">
              <span>{formatDisplayDate(expense.date)}</span>
              <span>•</span>
              <span className={isPaidByMain ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                {isPaidByMain ? 'You paid' : `${payerDisplayName} paid`}
              </span>
              {!isPersonal && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-0.5">
                    <Users className="w-3 h-3 text-slate-400 inline" />
                    {splitCount}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Amount & Balance Impact */}
        <div className="text-right shrink-0">
          <div className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center justify-end gap-1">
            <span className="text-[11px] font-bold text-slate-500">{sym}</span>
            <span>{formatAmountText(displayAmount)}</span>
          </div>
          <div className={`text-[10px] sm:text-[11px] ${impactColor} mt-0.5`}>
            {impactText}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span className="text-[10px] text-slate-400 font-medium">
          {expense.category === 'other' ? 'Category: Others' : meta.label}
        </span>

        {!isSettled ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(expense)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors flex items-center gap-1 text-[11px]"
              title="Edit expense"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(expense.id)}
              className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors flex items-center gap-1 text-[11px]"
              title="Delete expense"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        ) : (
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            Settled
          </span>
        )}
      </div>
    </div>
  );
};


