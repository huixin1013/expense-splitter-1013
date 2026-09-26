import React from 'react';
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, HandCoins, User } from 'lucide-react';
import { BalanceSummary, AppSettings } from '../types';

interface BalanceCardProps {
  balance: BalanceSummary;
  settings: AppSettings;
  onOpenSettleUp: (memberId?: string) => void;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  balance,
  settings,
  onOpenSettleUp,
}) => {
  const sym = settings.currencySymbol;
  const {
    overallStatus,
    amountToReturn,
    totalPaidByMain,
    totalSpentAllTime,
    totalShared,
    totalPersonalMain,
    mainUserName,
    memberBalances,
  } = balance;

  // Filter to only members the main user owes money to
  const peopleYouOwe = memberBalances?.filter(mb => mb.netBalance < -0.005) || [];

  return (
    <div
      id="balance-card-container"
      className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm relative overflow-hidden space-y-4"
    >
      {/* Top Banner indicating net status for Main User */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
            Bal
          </span>
          
          {overallStatus === 'owe' && (
            <div className="mt-1.5">
              <div className="text-xs font-medium text-rose-700">
                You overall owe others
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 tracking-tight mt-0.5">
                <span className="text-sm font-bold opacity-75 mr-1">{sym}</span>
                {amountToReturn.toFixed(2)}
              </div>
            </div>
          )}

          {overallStatus === 'owed' && (
            <div className="mt-1.5">
              <div className="text-xs font-medium text-emerald-700">
                Others overall owe you
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 tracking-tight mt-0.5">
                <span className="text-sm font-bold opacity-75 mr-1">{sym}</span>
                {amountToReturn.toFixed(2)}
              </div>
            </div>
          )}

          {overallStatus === 'settled' && (
            <div className="mt-1.5">
              <div className="flex items-center gap-1.5 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-bold text-slate-800">All Settled Up!</span>
              </div>
              <div className="text-2xl font-extrabold text-slate-800 tracking-tight mt-0.5">
                <span className="text-sm font-bold opacity-75 mr-1">{sym}</span>
                0.00
              </div>
            </div>
          )}
        </div>

        {/* General Settle Up Button */}
        {amountToReturn > 0 ? (
          <button
            type="button"
            id="settle-up-action-btn"
            onClick={() => onOpenSettleUp()}
            className="shrink-0 mt-1 px-3.5 py-2 rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <HandCoins className="w-3.5 h-3.5 text-emerald-100" />
            <span>Settle Up</span>
          </button>
        ) : (
          <div className="shrink-0 mt-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold flex items-center gap-1 border border-emerald-200/60">
            <span>All Clear</span>
          </div>
        )}
      </div>

      {/* Balances by Person: ONLY shows who I owe money to */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Owed
          </p>
          {peopleYouOwe.length > 0 && (
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/60">
              {peopleYouOwe.length} to pay
            </span>
          )}
        </div>

        {peopleYouOwe.length > 0 ? (
          <div className="space-y-1.5">
            {peopleYouOwe.map(mb => {
              const amountOwed = Math.abs(mb.netBalance);
              return (
                <div
                  key={mb.memberId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-rose-200 text-rose-800 flex items-center justify-center font-bold text-[11px]">
                      {mb.memberName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">{mb.memberName}</span>
                      <p className="text-[11px] text-rose-600 font-semibold">
                        You owe {sym} {amountOwed.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenSettleUp(mb.memberId)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-300 shadow-xs transition-colors flex items-center gap-1 active:scale-95"
                  >
                    <HandCoins className="w-3.5 h-3.5" />
                    <span>Settle</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/60 flex items-center gap-2.5 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-800">Nothing owed to anyone</p>
              <p className="text-[11px] text-slate-500">
                You do not owe money to any member. Everything is settled!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Spending Breakdown Pill Bar */}
      <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-100">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider flex items-center justify-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
            Paid
          </p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">
            <span className="text-[10px] font-bold text-slate-500 mr-0.5">{sym}</span>
            {totalPaidByMain.toFixed(2)}
          </p>
        </div>

        <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-100">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
            Mine
          </p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">
            <span className="text-[10px] font-bold text-slate-500 mr-0.5">{sym}</span>
            {totalPersonalMain.toFixed(2)}
          </p>
        </div>

        <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-100">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
            Full
          </p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">
            <span className="text-[10px] font-bold text-slate-500 mr-0.5">{sym}</span>
            {totalSpentAllTime.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
};
