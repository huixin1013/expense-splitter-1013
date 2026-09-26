import React, { useState } from 'react';
import { Users, User, Lock, Plus, Trash2, ShieldCheck, Sparkles, AlertCircle, Globe } from 'lucide-react';
import { setupUsersBackend } from '../utils/excelService';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '../utils/currencyConstants';

interface FirstTimeSetupModalProps {
  isOpen: boolean;
  onComplete: (
    mainUserId: string,
    members: Array<{ id: string; name: string }>,
    currencySymbol: string,
    currencyCode?: string
  ) => void;
}

interface MemberInput {
  name: string;
  password: string;
}

export const FirstTimeSetupModal: React.FC<FirstTimeSetupModalProps> = ({
  isOpen,
  onComplete,
}) => {
  const [mainName, setMainName] = useState('HuiXin');
  const [mainPassword, setMainPassword] = useState('1234');
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState(DEFAULT_CURRENCY.code);
  const [members, setMembers] = useState<MemberInput[]>([
    { name: 'Ali', password: '1234' },
    { name: 'Abu', password: '1234' },
    { name: 'Ahmad', password: '1234' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentCurrency = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrencyCode) || DEFAULT_CURRENCY;

  const handleAddMember = () => {
    setMembers([...members, { name: '', password: '1234' }]);
  };

  const handleRemoveMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleMemberChange = (index: number, field: keyof MemberInput, value: string) => {
    const updated = [...members];
    updated[index] = { ...updated[index], [field]: value };
    setMembers(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainName.trim()) {
      setError('Please enter your main user name');
      return;
    }
    if (!mainPassword) {
      setError('Please set a password for the main user');
      return;
    }

    const validMembers = members
      .map(m => ({ name: m.name.trim(), password: m.password.trim() || mainPassword }))
      .filter(m => m.name.length > 0);

    setIsSubmitting(true);
    setError(null);

    const result = await setupUsersBackend({
      mainUser: {
        name: mainName.trim(),
        password: mainPassword,
      },
      members: validMembers,
      currencySymbol: currentCurrency.symbol,
      currencyCode: currentCurrency.code,
    });

    setIsSubmitting(false);

    if (result.success && result.mainUserId && result.members) {
      onComplete(result.mainUserId, result.members, currentCurrency.symbol, currentCurrency.code);
    } else {
      setError(result.error || 'Failed to initialize users database');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs">
              <Sparkles className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">Initial Account Setup</h2>
              <p className="text-xs text-emerald-100/90 font-medium">
                Set up your main user, members & secure passwords
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-slate-800">
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed font-medium">
            Welcome! User accounts and encrypted credentials are saved securely in <span className="font-bold">users.xlsx</span> (visible by developer). You can switch between users anytime using their passwords.
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Main User */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <User className="w-4 h-4 text-emerald-600" />
              <span>Main User Account</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Main Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HuiXin"
                  value={mainName}
                  onChange={e => setMainName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Main Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Password for verification"
                  value={mainPassword}
                  onChange={e => setMainPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-medium"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Display Currency Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>Default Display Currency (Standardized)</span>
              </label>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Default: MYR (RM)
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              The app standardises all expenses to this currency for totals and settlements. You can also pick other currencies when adding individual expenses.
            </p>

            <select
              value={selectedCurrencyCode}
              onChange={e => setSelectedCurrencyCode(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.label} ({c.code})
                </option>
              ))}
            </select>

            {/* Quick popular chips */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[
                { code: 'MYR', label: '🇲🇾 MYR (RM)' },
                { code: 'JPY', label: '🇯🇵 JPY (¥)' },
                { code: 'SGD', label: '🇸🇬 SGD (S$)' },
                { code: 'USD', label: '🇺🇸 USD ($)' },
              ].map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setSelectedCurrencyCode(c.code)}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all truncate ${
                    selectedCurrencyCode === c.code
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Group Members */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>Family Members / Friends</span>
              </div>
              <button
                type="button"
                onClick={handleAddMember}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Member</span>
              </button>
            </div>

            <div className="space-y-2">
              {members.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                  <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder={`Member name (e.g. Ali, Abu)`}
                      value={m.name}
                      onChange={e => handleMemberChange(idx, 'name', e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <input
                      type="password"
                      placeholder="Password (default 1234)"
                      value={m.password}
                      onChange={e => handleMemberChange(idx, 'password', e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white shrink-0 transition-colors"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving to users.xlsx...' : 'Initialize & Save Users'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
