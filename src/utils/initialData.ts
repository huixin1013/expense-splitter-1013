import { Expense, AppSettings, UserMember } from '../types';
import { toISODate } from './dateUtils';

/**
 * Generates a unique 5-digit numeric string ID (e.g. '10001', '10002', etc.)
 */
export function generate5DigitMemberId(existingMembers?: Array<{ id: string }>): string {
  const existingSet = new Set((existingMembers || []).map(m => String(m.id)));
  
  // Try sequential 5-digit numbers starting at 10001
  for (let i = 10001; i <= 99999; i++) {
    const idStr = String(i);
    if (!existingSet.has(idStr)) {
      return idStr;
    }
  }

  // Fallback random 5-digit
  let candidate = String(10000 + Math.floor(Math.random() * 90000));
  while (existingSet.has(candidate)) {
    candidate = String(10000 + Math.floor(Math.random() * 90000));
  }
  return candidate;
}

export const DEFAULT_MEMBERS: UserMember[] = [
  { id: '10001', name: 'HuiXin' },
  { id: '10002', name: 'Ali' },
  { id: '10003', name: 'Abu' },
  { id: '10004', name: 'Ahmad' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  mainUserId: '10001',
  members: DEFAULT_MEMBERS,
  currencySymbol: 'SGD',
  currencyCode: 'SGD',
  baseCurrencyCode: 'SGD',
  baseCurrencySymbol: 'SGD',
  myName: 'HuiXin',
  friendName: 'Ali',
};

export function getInitialExpenses(): Expense[] {
  return [];
}
