import React from 'react';
import { Trash2, X } from 'lucide-react';
import { Expense, AppSettings } from '../types';
import { CATEGORIES } from '../utils/categoryMeta';
import { formatDisplayDate } from '../utils/dateUtils';
import { normalizePayerId } from '../utils/calculations';

interface ConfirmDeleteExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  settings: AppSettings;
  viewingRate?: number;
  onConfirmDelete: (expenseId: string) => void;
}

export const ConfirmDeleteExpenseModal: React.FC<ConfirmDeleteExpenseModalProps> = ({
  isOpen,
  onClose,
  expense,
  settings,
  viewingRate = 1.0,
  onConfirmDelete,
}) => {
  if (!isOpen || !expense) return null;

  const meta = CATEGORIES[expense.category] || CATEGORIES.other;
  const Icon = meta.icon;
  const sym = settings.currencySymbol || 'SGD';

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [{ id: 'u_huixin', name: 'HuiXin' }, { id: 'u_ali', name: 'Ali' }];
  const mainUserId = settings.mainUserId || members[0]?.id || 'u_huixin';

  const isPersonal = expense.expenseScope === 'personal' || expense.splitType === 'personal';
  const effectivePaidById = normalizePayerId(expense.paidBy, mainUserId, members);
  const payerMember = members.find(m => m.id === effectivePaidById);
  const payerDisplayName = effectivePaidById === mainUserId ? 'You' : (payerMember?.name || expense.paidBy || 'Member');

  const displayAmount = viewingRate && viewingRate !== 1
    ? Math.round(expense.amount * viewingRate * 100) / 100
    : expense.amount;

  const displayTitle = expense.category === 'other'
    ? (expense.notes || expense.title || 'Other Expense')
    : meta.label;

  const handleConfirm = () => {
    onConfirmDelete(expense.id);
    onClose();
  };

  return (
    <div
      id="confirm-delete-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="confirm-delete-modal-card"
        className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Delete Expense</h3>
              <p className="text-[11px] text-slate-500">Confirm expense removal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to delete this expense? This action will update all member debt balances and Excel records.
          </p>

          {/* Expense Snapshot Preview */}
          <div className="p-3.5 bg-rose-50/50 border border-rose-100 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg ${meta.bgLightClass} ${meta.colorClass} border ${meta.borderClass} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {displayTitle}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {formatDisplayDate(expense.date)} • {payerDisplayName} paid
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                {sym} {displayAmount.toFixed(2)}
              </span>
              {isPersonal && (
                <p className="text-[10px] font-semibold text-emerald-700">Personal</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="button"
              id="confirm-delete-expense-btn"
              onClick={handleConfirm}
              className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
