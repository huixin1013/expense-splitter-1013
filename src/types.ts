export type ExpenseCategory =
  | 'meal'
  | 'groceries'
  | 'transport'
  | 'entertainment'
  | 'daily'
  | 'utilities'
  | 'other';

export interface UserMember {
  id: string;
  name: string;
}

export type ExpenseScope = 'shared' | 'personal';

export type SplitType = 'equal' | 'personal' | 'custom' | 'full_me' | 'full_friend';

export interface Expense {
  id: string;
  title: string;
  amount: number; // Standardized amount in settings display currency
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  paidBy: string; // Member ID (e.g. 'u_huixin', 'u_ali', etc., or 'me'/'friend' for legacy)
  splitType: SplitType;
  expenseScope?: ExpenseScope; // 'shared' or 'personal'
  splitAmong?: string[]; // Member IDs who split this expense (if shared; defaults to all members)
  myShare?: number; // legacy share
  friendShare?: number; // legacy share
  notes?: string;
  createdAt: number;
  // Multi-currency tracking
  originalAmount?: number; // The amount entered in the original currency
  originalCurrency?: string; // e.g. 'JPY', 'USD', 'MYR'
  originalCurrencySymbol?: string; // e.g. '¥', '$', 'RM'
  exchangeRate?: number; // Exchange rate used to convert original to standard
}

export interface Settlement {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  paidBy: string; // Member ID who paid
  paidTo?: string; // Member ID who received
  notes?: string;
  createdAt: number;
}

export interface AppSettings {
  mainUserId: string; // ID of active main user
  members: UserMember[]; // All friends & family members
  currencySymbol: string;
  currencyCode: string;
  baseCurrencyCode?: string; // Canonical currency in which amounts are stored in database (defaults to 'SGD')
  baseCurrencySymbol?: string;
  userCurrencies?: Record<string, string>; // Individual currency preferences by userId
  myName?: string; // fallback
  friendName?: string; // fallback
}

export interface MemberBalanceDetail {
  memberId: string;
  memberName: string;
  netBalance: number; // positive: they owe main user; negative: main user owes them
  theyOweYou: number;
  youOweThem: number;
}

export interface BalanceSummary {
  mainUserId: string;
  mainUserName: string;
  totalSpentAllTime: number;
  totalShared: number;
  totalPersonalMain: number; // Main user's personal spending ("My Stuff")
  totalPaidByMain: number;
  totalMainShare: number;
  netBalance: number; // positive: others owe main user; negative: main user owes others
  overallStatus: 'owed' | 'owe' | 'settled';
  amountToReturn: number;
  memberBalances: MemberBalanceDetail[];
  // Legacy fields for backward compatibility
  whoOwesWhom?: 'friend_owes_me' | 'me_owes_friend' | 'settled';
  totalPaidByMe?: number;
  totalPaidByFriend?: number;
  totalPersonalMe?: number;
  totalPersonalFriend?: number;
}
