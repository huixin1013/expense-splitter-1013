import React, { useState } from 'react';
import { X, Copy, Check, Share2 } from 'lucide-react';
import { BalanceSummary, AppSettings, Expense } from '../types';

interface ShareSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: BalanceSummary;
  settings: AppSettings;
  recentExpenses: Expense[];
  viewingRate?: number;
}

export const ShareSummaryModal: React.FC<ShareSummaryModalProps> = ({
  isOpen,
  onClose,
  balance,
  settings,
  recentExpenses,
  viewingRate = 1.0,
}) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const sym = settings.currencySymbol;
  const mainUserName = balance.mainUserName || settings.myName || 'Main User';

  const memberLines = balance.memberBalances && balance.memberBalances.length > 0
    ? balance.memberBalances.map(mb => {
        if (mb.netBalance > 0.005) {
          return `• ${mb.memberName} owes ${mainUserName}: ${sym}${mb.netBalance.toFixed(2)}`;
        } else if (mb.netBalance < -0.005) {
          return `• ${mainUserName} owes ${mb.memberName}: ${sym}${Math.abs(mb.netBalance).toFixed(2)}`;
        } else {
          return `• ${mb.memberName}: Settled up (${sym}0.00)`;
        }
      }).join('\n')
    : `All settled up! (${sym}0.00)`;

  let overallLine = '';
  if (balance.overallStatus === 'owed') {
    overallLine = `👉 Overall: Others owe ${mainUserName} a total of ${sym}${balance.amountToReturn.toFixed(2)}`;
  } else if (balance.overallStatus === 'owe') {
    overallLine = `👉 Overall: ${mainUserName} owes others a total of ${sym}${balance.amountToReturn.toFixed(2)}`;
  } else {
    overallLine = `👉 Overall: All settled up! (${sym}0.00)`;
  }

  const members = settings.members || [];
  const expenseLines = recentExpenses.slice(0, 5).map(e => {
    let payer = e.paidBy;
    const found = members.find(m => m.id === e.paidBy);
    if (found) payer = found.name;
    else if (e.paidBy === 'me') payer = mainUserName;
    const convertedAmt = viewingRate && viewingRate !== 1 ? Math.round(e.amount * viewingRate * 100) / 100 : e.amount;
    return `• ${e.title} - ${sym}${convertedAmt.toFixed(2)} (${payer} paid)`;
  }).join('\n');

  const fullText = `💸 Expense & Debt Summary for ${mainUserName}

${overallLine}

👥 Member Balances:
${memberLines}

📝 Recent Records:
${expenseLines || 'No recent expenses'}

Generated via Expense Splitter`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Share Spending Summary</h2>
              <p className="text-[11px] text-slate-500">Send breakdown to {settings.friendName}</p>
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

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600">
            Copy this formatted message to send on WhatsApp, Telegram, or Messages:
          </p>

          <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
            {fullText}
          </pre>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Text Summary</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
