import * as xlsxModule from 'xlsx';
import type { WorkBook, WorkSheet } from 'xlsx';
import ExcelJS from 'exceljs';
import { Expense, Settlement, AppSettings, UserMember, ExpenseCategory } from '../types';
import { calculateBalanceSummary, calculateAllIndividualMemberFinancials, normalizePayerId, IndividualMemberFinancials } from './calculations';
import { CATEGORIES } from './categoryMeta';
import { DEFAULT_MEMBERS } from './initialData';
import { getCurrencyMeta, SUPPORTED_CURRENCIES } from './currencyConstants';
import { getConversionRate } from './currencyUtils';

const XLSX = (xlsxModule as any).default || xlsxModule;

export interface ExcelDatabasePayload {
  expenses: Expense[];
  settlements: Settlement[];
  settings: AppSettings;
}

export interface UserExcelRecord {
  id: string;
  name: string;
  role: 'main' | 'member';
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastModified: string;
}

/**
 * Builds the independent "Members" worksheet where each member has their own
 * individual metrics, spending stats, and balances.
 */
export function buildMembersWorksheet(
  memberStats: IndividualMemberFinancials[],
  settings: AppSettings
): WorkSheet {
  const currencySymbol = settings.currencySymbol || 'SGD';

  const memberRows = memberStats.map(m => ({
    'Member ID': m.memberId,
    'Name': m.memberName,
    'Role': m.role === 'main' ? 'Main User' : 'Member',
    'Expenses Logged': m.expensesCount,
    'Total Paid': Number(m.totalPaid.toFixed(2)),
    'Personal Items (Paid)': Number(m.personalPaid.toFixed(2)),
    'Shared Items (Paid)': Number(m.sharedPaid.toFixed(2)),
    'Fair Share of Shared': Number(m.fairShare.toFixed(2)),
    'Settlements Paid': Number(m.settlementsPaid.toFixed(2)),
    'Settlements Received': Number(m.settlementsReceived.toFixed(2)),
    'Net Balance': Number(m.netBalance.toFixed(2)),
    'Status': m.statusText,
    'Action Needed': m.actionText,
  }));

  const ws = XLSX.utils.json_to_sheet(memberRows);
  ws['!cols'] = [
    { wch: 14 }, // Member ID
    { wch: 20 }, // Name
    { wch: 14 }, // Role
    { wch: 16 }, // Expenses Logged
    { wch: 14 }, // Total Paid
    { wch: 22 }, // Personal Items
    { wch: 20 }, // Shared Items
    { wch: 22 }, // Fair Share
    { wch: 18 }, // Settlements Paid
    { wch: 22 }, // Settlements Received
    { wch: 14 }, // Net Balance
    { wch: 32 }, // Status
    { wch: 36 }, // Action Needed
  ];
  return ws;
}

/**
 * Builds the independent "Summary" worksheet where financial totals, metrics,
 * and pairwise debt breakdowns are saved independently for EACH member inside the same tab.
 */
export function buildSummaryWorksheet(
  payload: ExcelDatabasePayload,
  memberStats: IndividualMemberFinancials[]
): WorkSheet {
  const { expenses, settlements, settings } = payload;
  const currencySymbol = settings.currencySymbol || 'SGD';
  const currencyCode = settings.currencyCode || 'SGD';

  const totalSpentAll = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalShared = expenses
    .filter(e => e.expenseScope !== 'personal' && e.splitType !== 'personal')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalPersonal = totalSpentAll - totalShared;
  const totalSettlementsAmount = settlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const rows: Array<{ 'Key / Metric': string; 'Value / Breakdown': string; 'Details': string }> = [];

  // 1. Group Global Overview
  rows.push({ 'Key / Metric': '=== GLOBAL GROUP FINANCIAL OVERVIEW ===', 'Value / Breakdown': '', 'Details': '' });
  rows.push({ 'Key / Metric': 'Group Total Spending (All Time)', 'Value / Breakdown': `${currencySymbol}${totalSpentAll.toFixed(2)}`, 'Details': `${expenses.length} total expense transactions recorded` });
  rows.push({ 'Key / Metric': 'Total Shared Group Expenses', 'Value / Breakdown': `${currencySymbol}${totalShared.toFixed(2)}`, 'Details': 'Split among participating group members' });
  rows.push({ 'Key / Metric': 'Total Personal Spending (My Stuff)', 'Value / Breakdown': `${currencySymbol}${totalPersonal.toFixed(2)}`, 'Details': 'Individual private expenses' });
  rows.push({ 'Key / Metric': 'Total Settlements Transacted', 'Value / Breakdown': `${currencySymbol}${totalSettlementsAmount.toFixed(2)}`, 'Details': `${settlements.length} settlement payments` });
  rows.push({ 'Key / Metric': 'Active Currency Symbol', 'Value / Breakdown': currencySymbol, 'Details': 'Display symbol' });
  rows.push({ 'Key / Metric': 'Active Currency Code', 'Value / Breakdown': currencyCode, 'Details': 'ISO currency code' });
  rows.push({ 'Key / Metric': 'Base Currency Code', 'Value / Breakdown': settings.baseCurrencyCode || 'SGD', 'Details': 'Base storage currency code' });
  rows.push({ 'Key / Metric': 'Base Currency Symbol', 'Value / Breakdown': settings.baseCurrencySymbol || 'SGD', 'Details': 'Base storage currency symbol' });
  rows.push({ 'Key / Metric': 'User Currencies JSON', 'Value / Breakdown': JSON.stringify(settings.userCurrencies || {}), 'Details': 'Per-member default currency preferences' });
  rows.push({ 'Key / Metric': 'Total Registered Members', 'Value / Breakdown': String(memberStats.length), 'Details': '5-digit numeric IDs assigned' });
  rows.push({ 'Key / Metric': 'Last Updated At', 'Value / Breakdown': new Date().toISOString(), 'Details': 'UTC Timestamp' });
  rows.push({ 'Key / Metric': 'Storage Engine', 'Value / Breakdown': 'Excel (.xlsx) Database File', 'Details': 'Direct spreadsheet persistence' });

  // 2. Member Summary Matrix
  rows.push({ 'Key / Metric': '', 'Value / Breakdown': '', 'Details': '' });
  rows.push({ 'Key / Metric': '=== INDEPENDENT FINANCIAL SUMMARY FOR EACH MEMBER ===', 'Value / Breakdown': '', 'Details': '' });

  for (const m of memberStats) {
    const roleLabel = m.role === 'main' ? 'Main User' : 'Member';
    rows.push({
      'Key / Metric': `Member: ${m.memberId} - ${m.memberName} (${roleLabel})`,
      'Value / Breakdown': `Net Balance: ${m.netBalance >= 0 ? '+' : ''}${currencySymbol}${m.netBalance.toFixed(2)}`,
      'Details': m.actionText,
    });
  }

  // 3. Detailed Breakdown for EACH Member inside the same tab
  for (const m of memberStats) {
    const roleLabel = m.role === 'main' ? 'Main User' : 'Member';
    rows.push({ 'Key / Metric': '', 'Value / Breakdown': '', 'Details': '' });
    rows.push({
      'Key / Metric': `>>> DETAILED SUMMARY: ${m.memberId} - ${m.memberName} (${roleLabel}) <<<`,
      'Value / Breakdown': '',
      'Details': '',
    });
    rows.push({ 'Key / Metric': '  Member ID', 'Value / Breakdown': m.memberId, 'Details': 'Unique 5-digit ID' });
    rows.push({ 'Key / Metric': '  Member Name', 'Value / Breakdown': m.memberName, 'Details': '' });
    rows.push({ 'Key / Metric': '  Account Role', 'Value / Breakdown': roleLabel, 'Details': '' });
    rows.push({ 'Key / Metric': '  Total Expenses Logged/Paid', 'Value / Breakdown': String(m.expensesCount), 'Details': 'Transactions paid out-of-pocket' });
    rows.push({ 'Key / Metric': '  Total Amount Paid (All Time)', 'Value / Breakdown': `${currencySymbol}${m.totalPaid.toFixed(2)}`, 'Details': 'Shared + Personal combined' });
    rows.push({ 'Key / Metric': '  Personal Items Paid', 'Value / Breakdown': `${currencySymbol}${m.personalPaid.toFixed(2)}`, 'Details': '100% individual spending' });
    rows.push({ 'Key / Metric': '  Shared Items Paid', 'Value / Breakdown': `${currencySymbol}${m.sharedPaid.toFixed(2)}`, 'Details': 'Group expenses paid by this member' });
    rows.push({ 'Key / Metric': '  Fair Share of Shared (Consumed)', 'Value / Breakdown': `${currencySymbol}${m.fairShare.toFixed(2)}`, 'Details': 'This member\'s calculated portion' });
    rows.push({ 'Key / Metric': '  Settlements Paid Out', 'Value / Breakdown': `${currencySymbol}${m.settlementsPaid.toFixed(2)}`, 'Details': 'Repayments made to others' });
    rows.push({ 'Key / Metric': '  Settlements Received', 'Value / Breakdown': `${currencySymbol}${m.settlementsReceived.toFixed(2)}`, 'Details': 'Repayments received from others' });
    rows.push({
      'Key / Metric': '  Net Balance with Group',
      'Value / Breakdown': `${m.netBalance >= 0 ? '+' : ''}${currencySymbol}${m.netBalance.toFixed(2)}`,
      'Details': m.netBalance >= 0 ? 'Positive: Group owes this member' : 'Negative: This member owes group',
    });
    rows.push({ 'Key / Metric': '  Settlement Status', 'Value / Breakdown': m.statusText, 'Details': '' });
    rows.push({ 'Key / Metric': '  Action Required', 'Value / Breakdown': m.actionText, 'Details': '' });

    // Pairwise debts
    if (m.pairwiseBreakdown.length > 0) {
      rows.push({ 'Key / Metric': '  --- Pairwise Debts with Each Member ---', 'Value / Breakdown': '', 'Details': '' });
      for (const pair of m.pairwiseBreakdown) {
        let pairText = `Settled (${currencySymbol}0.00)`;
        let pairDetail = 'No outstanding balance';
        if (pair.net > 0.005) {
          pairText = `Owed ${currencySymbol}${pair.net.toFixed(2)} (To Receive)`;
          pairDetail = `${pair.targetMemberName} owes ${m.memberName} ${currencySymbol}${pair.net.toFixed(2)}`;
        } else if (pair.net < -0.005) {
          pairText = `Owes ${currencySymbol}${Math.abs(pair.net).toFixed(2)} (To Pay)`;
          pairDetail = `${m.memberName} owes ${pair.targetMemberName} ${currencySymbol}${Math.abs(pair.net).toFixed(2)}`;
        }
        rows.push({
          'Key / Metric': `    With ${pair.targetMemberName} (${pair.targetMemberId})`,
          'Value / Breakdown': pairText,
          'Details': pairDetail,
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 48 }, // Key / Metric
    { wch: 40 }, // Value / Breakdown
    { wch: 52 }, // Details
  ];
  return ws;
}

/**
 * Converts expenses, settlements, and settings into a structured XLSX workbook for expenses.xlsx.
 * Contains 2 worksheets:
 * 1. Expenses
 * 2. Settlements
 * (Members and Summary sheets are stored exclusively in users.xlsx)
 */
export function buildExcelWorkbook(payload: ExcelDatabasePayload): WorkBook {
  const { expenses, settlements, settings } = payload;

  const wb = XLSX.utils.book_new();

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : DEFAULT_MEMBERS;
  const mainUserId = settings.mainUserId || members[0]?.id || '10001';

  const getMemberName = (id: string) => {
    const normId = normalizePayerId(id, mainUserId, members);
    const found = members.find(m => m.id === normId);
    return found ? found.name : id;
  };

  // 1. Expenses Sheet (Exact 10 columns matching Download Template)
  const expenseRows = expenses.map(exp => {
    const normPayerId = normalizePayerId(exp.paidBy, mainUserId, members);
    const payerName = getMemberName(normPayerId);
    const splitIds = (exp.splitAmong && exp.splitAmong.length > 0 ? exp.splitAmong : members.map(m => m.id))
      .map(id => normalizePayerId(id, mainUserId, members));
    const splitNames = splitIds.map(getMemberName).join(', ');
    const expDate = exp.date || (exp.createdAt ? new Date(exp.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    return {
      'Created Date': expDate,
      'Category': exp.category,
      'Scope': exp.expenseScope || (exp.splitType === 'personal' ? 'personal' : 'shared'),
      'Original Amount': exp.originalAmount !== undefined ? Number(exp.originalAmount.toFixed(2)) : Number(exp.amount.toFixed(2)),
      'Original Currency': exp.originalCurrency || settings.currencyCode || 'SGD',
      'Paid By': payerName,
      'Paid By ID (Auto - Do Not Edit)': normPayerId,
      'Split Among': splitNames,
      'Split Among ID (Auto - Do Not Edit)': splitIds.join(','),
      'Notes (Optional - Saved only if Category is other)': exp.category === 'other' ? (exp.notes || '') : '',
    };
  });

  const expensesWs = XLSX.utils.json_to_sheet(expenseRows);
  expensesWs['!cols'] = [
    { wch: 18 }, // Created Date
    { wch: 16 }, // Category
    { wch: 14 }, // Scope
    { wch: 18 }, // Original Amount
    { wch: 18 }, // Original Currency
    { wch: 18 }, // Paid By
    { wch: 30 }, // Paid By ID (Auto - Do Not Edit)
    { wch: 30 }, // Split Among
    { wch: 34 }, // Split Among ID (Auto - Do Not Edit)
    { wch: 44 }, // Notes (Optional - Saved only if Category is other)
  ];
  expensesWs['!autofilter'] = { ref: 'A1:J1' };
  XLSX.utils.book_append_sheet(wb, expensesWs, 'Expenses');

  // 2. Settlements Sheet (Exact columns matching template)
  const settlementRows = settlements.map(set => {
    const normPayerId = normalizePayerId(set.paidBy, mainUserId, members);
    const normReceiverId = normalizePayerId(set.paidTo || mainUserId, mainUserId, members);
    return {
      'Payment Date': set.date,
      'Amount': Number(set.amount.toFixed(2)),
      'Paid By': getMemberName(normPayerId),
      'Paid By ID (Auto - Do Not Edit)': normPayerId,
      'Paid To': getMemberName(normReceiverId),
      'Paid To ID (Auto - Do Not Edit)': normReceiverId,
      'Notes': set.notes || '',
      'Created Date': set.createdAt ? new Date(set.createdAt).toISOString() : new Date().toISOString(),
    };
  });

  const settlementsWs = XLSX.utils.json_to_sheet(settlementRows);
  settlementsWs['!cols'] = [
    { wch: 16 }, // Payment Date
    { wch: 14 }, // Amount
    { wch: 18 }, // Paid By
    { wch: 30 }, // Paid By ID (Auto - Do Not Edit)
    { wch: 18 }, // Paid To
    { wch: 30 }, // Paid To ID (Auto - Do Not Edit)
    { wch: 28 }, // Notes
    { wch: 22 }, // Created Date
  ];
  settlementsWs['!autofilter'] = { ref: 'A1:H1' };
  XLSX.utils.book_append_sheet(wb, settlementsWs, 'Settlements');

  // 3. Users Sheet (Ensures team members and roles are perfectly restored on re-upload)
  const userRows: any[][] = [['Name', 'Member ID', 'Role']];
  for (const m of members) {
    userRows.push([m.name, m.id, m.id === mainUserId ? 'Main User' : 'Member']);
  }
  const usersWs = XLSX.utils.aoa_to_sheet(userRows);
  usersWs['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 16 }];
  usersWs['!autofilter'] = { ref: 'A1:C1' };
  XLSX.utils.book_append_sheet(wb, usersWs, 'Users');

  // 4. Reference_Data Sheet
  const categoryList = [
    { code: 'meal', name: 'Meals & Dining', desc: 'Dining, lunch, dinner, drinks, cafe' },
    { code: 'groceries', name: 'Groceries', desc: 'Supermarket, food ingredients, daily produce' },
    { code: 'transport', name: 'Transport & Rides', desc: 'Grab, taxi, fuel, tolls, train, bus' },
    { code: 'entertainment', name: 'Entertainment', desc: 'Outings, movies, tickets, attractions' },
    { code: 'daily', name: 'Daily Supplies', desc: 'Household essentials, toiletries' },
    { code: 'utilities', name: 'Bills & Utilities', desc: 'WiFi, mobile, electricity, shared bills' },
    { code: 'other', name: 'Other Expense', desc: 'Miscellaneous items (specify in notes)' },
  ];
  const scopeList = ['shared', 'personal'];
  const currencyList = SUPPORTED_CURRENCIES;
  const splitCombinations = generateSplitAmongCombinations(members);

  const maxLen = Math.max(
    categoryList.length,
    scopeList.length,
    currencyList.length,
    splitCombinations.length
  );

  const refRows: any[][] = [
    ['Category Code', 'Category Name', 'Description', 'Scope', 'Currency Code', 'Currency Name', 'Symbol', 'Split Among Option', 'Split Among IDs']
  ];

  for (let i = 0; i < maxLen; i++) {
    const cat = categoryList[i];
    const sc = scopeList[i];
    const cur = currencyList[i];
    const comb = splitCombinations[i];
    refRows.push([
      cat ? cat.code : '',
      cat ? cat.name : '',
      cat ? cat.desc : '',
      sc || '',
      cur ? cur.code : '',
      cur ? cur.label : '',
      cur ? cur.symbol : '',
      comb ? comb.option : '',
      comb ? comb.ids : '',
    ]);
  }
  const refWs = XLSX.utils.aoa_to_sheet(refRows);
  refWs['!cols'] = [
    { wch: 16 }, { wch: 20 }, { wch: 32 }, { wch: 14 },
    { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 28 }
  ];
  refWs['!autofilter'] = { ref: 'A1:I1' };
  XLSX.utils.book_append_sheet(wb, refWs, 'Reference_Data');

  // 5. Summary Sheet
  const memberStats = calculateAllIndividualMemberFinancials(expenses, settlements, settings);
  const summaryWs = buildSummaryWorksheet(payload, memberStats);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  return wb;
}

/**
 * Builds the users.xlsx workbook containing:
 * 1. Users (credentials, password hashes, salts)
 * 2. Members (independent member profile and financial metrics for each member)
 * 3. Summary (independent summary for each member inside the same tab)
 */
export function buildUsersExcelWorkbook(
  users: UserExcelRecord[],
  payload: ExcelDatabasePayload
): WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Users Sheet (Developer Only)
  const userData = users.map(u => ({
    'User ID': u.id,
    'Name': u.name,
    'Role': u.role === 'main' ? 'Main User' : 'Member',
    'Password Hash': u.passwordHash,
    'Salt': u.salt,
    'Created At': u.createdAt,
    'Last Modified': u.lastModified,
  }));
  const usersWs = XLSX.utils.json_to_sheet(userData);
  usersWs['!cols'] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 66 },
    { wch: 34 },
    { wch: 26 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, usersWs, 'Users');

  // Align settings members with users
  const userMembers: UserMember[] = users.map(u => ({ id: u.id, name: u.name }));
  const mainU = users.find(u => u.role === 'main') || users[0];
  const alignedSettings: AppSettings = {
    ...payload.settings,
    members: userMembers,
    mainUserId: payload.settings.mainUserId || mainU?.id || '10001',
    myName: mainU?.name || 'HuiXin',
  };

  const memberStats = calculateAllIndividualMemberFinancials(
    payload.expenses,
    payload.settlements,
    alignedSettings
  );

  // 2. Independent Members Sheet in users.xlsx
  const membersWs = buildMembersWorksheet(memberStats, alignedSettings);
  XLSX.utils.book_append_sheet(wb, membersWs, 'Members');

  // 3. Independent Summary Sheet in users.xlsx (each member inside same tab)
  const summaryWs = buildSummaryWorksheet({ ...payload, settings: alignedSettings }, memberStats);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  return wb;
}

export interface SplitAmongOption {
  option: string;
  ids: string;
}

/**
 * Generates options for Split Among supporting:
 * - "All Members"
 * - 1 member (each member individually)
 * - 2 members (all pairwise combinations)
 * - 3 members (groups of three)
 * - up to all members
 */
export function generateSplitAmongCombinations(members: UserMember[]): SplitAmongOption[] {
  const result: SplitAmongOption[] = [];

  // 1. "All Members" option
  result.push({
    option: 'All Members',
    ids: 'ALL',
  });

  // 2. Single member options (1 member)
  for (const m of members) {
    result.push({
      option: m.name,
      ids: m.id,
    });
  }

  // Combinations helper for 2, 3, etc. members
  function getCombinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [head, ...tail] = arr;
    const withHead = getCombinations(tail, k - 1).map(c => [head, ...c]);
    const withoutHead = getCombinations(tail, k);
    return [...withHead, ...withoutHead];
  }

  for (let k = 2; k <= Math.min(members.length, 6); k++) {
    if (k === members.length && members.length > 1) {
      const allNames = members.map(m => m.name).join(', ');
      const allIds = members.map(m => m.id).join(',');
      if (!result.some(r => r.option === allNames)) {
        result.push({
          option: allNames,
          ids: allIds,
        });
      }
      continue;
    }

    const combos = getCombinations(members, k);
    for (const group of combos) {
      const optionName = group.map(m => m.name).join(', ');
      const optionIds = group.map(m => m.id).join(',');
      if (!result.some(r => r.option === optionName)) {
        result.push({
          option: optionName,
          ids: optionIds,
        });
      }
    }
  }

  return result;
}

/**
 * Builds a user-friendly, structured Excel template with exactly 10 columns in Expenses:
 * [Created Date, Category, Scope, Original Amount, Original Currency, Paid By, Paid By ID (Auto - Do Not Edit), Split Among, Split Among ID (Auto - Do Not Edit), Notes (Optional - Saved only if Category is other)]
 * - No background fill in data rows (plain text color only, red text on the two ID fields).
 * - Split among options support 1 member, 2 members, 3 members, or all members.
 */
export function buildBlankExcelTemplate(settings: AppSettings): WorkBook {
  const wb = XLSX.utils.book_new();

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : DEFAULT_MEMBERS;
  const mainUserId = settings.mainUserId || members[0]?.id || '10001';
  const mainMember = members.find(m => m.id === mainUserId) || members[0];
  const activeCurrency = settings.currencyCode || 'MYR';
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Expenses Sheet (Exactly the 10 requested columns)
  const headerCols = [
    'Created Date',
    'Category',
    'Scope',
    'Original Amount',
    'Original Currency',
    'Paid By',
    'Paid By ID (Auto - Do Not Edit)',
    'Split Among',
    'Split Among ID (Auto - Do Not Edit)',
    'Notes (Optional - Saved only if Category is other)',
  ];

  // Only ONE example row (Row 2) - no background fill
  const expenseRows: any[][] = [
    headerCols,
    [
      todayStr,
      'meal',
      'shared',
      50.00,
      activeCurrency,
      mainMember.name,
      { t: 's', f: 'IFERROR(VLOOKUP(F2, Users!$A$2:$B$50, 2, FALSE), "")', v: mainMember.id },
      'All Members',
      { t: 's', f: 'IFERROR(VLOOKUP(H2, Reference_Data!$H$2:$I$150, 2, FALSE), IF(H2="All Members", "ALL", ""))', v: 'ALL' },
      '',
    ],
  ];

  // Blank rows for user entry (rows 3 to 30) - no fill
  for (let r = 3; r <= 30; r++) {
    expenseRows.push([
      '',
      '',
      'shared',
      '',
      activeCurrency,
      '',
      { t: 's', f: `IFERROR(VLOOKUP(F${r}, Users!$A$2:$B$50, 2, FALSE), "")`, v: '' },
      'All Members',
      { t: 's', f: `IFERROR(VLOOKUP(H${r}, Reference_Data!$H$2:$I$150, 2, FALSE), IF(H${r}="All Members", "ALL", ""))`, v: 'ALL' },
      '',
    ]);
  }

  const expensesWs = XLSX.utils.aoa_to_sheet(expenseRows);
  expensesWs['!cols'] = [
    { wch: 18 }, // Created Date
    { wch: 16 }, // Category
    { wch: 14 }, // Scope
    { wch: 18 }, // Original Amount
    { wch: 18 }, // Original Currency
    { wch: 18 }, // Paid By
    { wch: 30 }, // Paid By ID (Auto - Do Not Edit)
    { wch: 30 }, // Split Among
    { wch: 34 }, // Split Among ID (Auto - Do Not Edit)
    { wch: 44 }, // Notes (Optional - Saved only if Category is other)
  ];
  expensesWs['!autofilter'] = { ref: 'A1:J1' };
  XLSX.utils.book_append_sheet(wb, expensesWs, 'Expenses');

  // 2. Users Sheet (Database table for VLOOKUP and filter reference)
  const userRows: any[][] = [['Name', 'Member ID', 'Role']];
  for (const m of members) {
    userRows.push([m.name, m.id, m.id === mainUserId ? 'Main User' : 'Member']);
  }
  const usersWs = XLSX.utils.aoa_to_sheet(userRows);
  usersWs['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }];
  usersWs['!autofilter'] = { ref: 'A1:C1' };
  XLSX.utils.book_append_sheet(wb, usersWs, 'Users');

  // 3. Reference_Data Sheet (Without split type column)
  const categoryList = [
    { code: 'meal', name: 'Meals & Dining', desc: 'Dining, lunch, dinner, drinks, cafe' },
    { code: 'groceries', name: 'Groceries', desc: 'Supermarket, food ingredients, daily produce' },
    { code: 'transport', name: 'Transport & Rides', desc: 'Grab, taxi, fuel, tolls, train, bus' },
    { code: 'entertainment', name: 'Entertainment', desc: 'Outings, movies, tickets, attractions' },
    { code: 'daily', name: 'Daily Supplies', desc: 'Household essentials, toiletries' },
    { code: 'utilities', name: 'Bills & Utilities', desc: 'WiFi, mobile, electricity, shared bills' },
    { code: 'other', name: 'Other Expense', desc: 'Miscellaneous items (specify in notes)' },
  ];
  const scopeList = ['shared', 'personal'];
  const currencyList = SUPPORTED_CURRENCIES;
  const splitCombinations = generateSplitAmongCombinations(members);

  const maxLen = Math.max(
    categoryList.length,
    scopeList.length,
    currencyList.length,
    splitCombinations.length
  );

  const refRows: any[][] = [
    ['Category Code', 'Category Name', 'Description', 'Scope', 'Currency Code', 'Currency Name', 'Symbol', 'Split Among Option', 'Split Among IDs']
  ];

  for (let i = 0; i < maxLen; i++) {
    const cat = categoryList[i];
    const sc = scopeList[i];
    const cur = currencyList[i];
    const comb = splitCombinations[i];
    refRows.push([
      cat ? cat.code : '',
      cat ? cat.name : '',
      cat ? cat.desc : '',
      sc || '',
      cur ? cur.code : '',
      cur ? cur.label : '',
      cur ? cur.symbol : '',
      comb ? comb.option : '',
      comb ? comb.ids : '',
    ]);
  }
  const refWs = XLSX.utils.aoa_to_sheet(refRows);
  refWs['!cols'] = [
    { wch: 16 }, { wch: 20 }, { wch: 32 }, { wch: 14 },
    { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 28 }
  ];
  refWs['!autofilter'] = { ref: 'A1:I1' };
  XLSX.utils.book_append_sheet(wb, refWs, 'Reference_Data');

  // 4. Settlements Sheet (Clean template for repayments)
  const settlementsWs = XLSX.utils.aoa_to_sheet([
    ['Payment Date', 'Amount', 'Paid By', 'Paid By ID (Auto - Do Not Edit)', 'Paid To', 'Paid To ID (Auto - Do Not Edit)', 'Notes', 'Created Date'],
  ]);
  settlementsWs['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 28 },
    { wch: 16 }, { wch: 28 }, { wch: 25 }, { wch: 22 },
  ];
  settlementsWs['!autofilter'] = { ref: 'A1:H1' };
  XLSX.utils.book_append_sheet(wb, settlementsWs, 'Settlements');

  return wb;
}

/**
 * Builds a user-friendly, high-fidelity Excel template with ExcelJS:
 * - Exactly 10 columns: Created Date, Category, Scope, Original Amount, Currency, Paid By, Paid By ID, Split Among, Split Among ID, Notes
 * - No background fill in data rows (plain text color only, red text on the two ID fields)
 * - Headers keep uniform dark header background
 * - Split Among supports 1 member, 2 members, 3 members, or all members
 */
export async function generateBlankExcelTemplateBuffer(settings: AppSettings): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Friend Expense Splitter';
  wb.created = new Date();

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : DEFAULT_MEMBERS;
  const mainUserId = settings.mainUserId || members[0]?.id || '10001';
  const mainMember = members.find(m => m.id === mainUserId) || members[0];
  const activeCurrency = settings.currencyCode || 'MYR';
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Expenses Sheet (The 10-column user entry sheet - Date and Split Type removed)
  const expWs = wb.addWorksheet('Expenses', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  expWs.columns = [
    { header: 'Created Date', key: 'createdDate', width: 18 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Scope', key: 'scope', width: 14 },
    { header: 'Original Amount', key: 'origAmount', width: 18 },
    { header: 'Original Currency', key: 'origCurrency', width: 18 },
    { header: 'Paid By', key: 'paidBy', width: 18 },
    { header: 'Paid By ID (Auto - Do Not Edit)', key: 'paidById', width: 30 },
    { header: 'Split Among', key: 'splitAmong', width: 30 },
    { header: 'Split Among ID (Auto - Do Not Edit)', key: 'splitAmongId', width: 34 },
    { header: 'Notes (Optional - Saved only if Category is other)', key: 'notes', width: 44 },
  ];

  expWs.autoFilter = { from: 'A1', to: 'J1' };

  // Style Header Row (Uniform dark slate background, no changing color)
  const expHeaderRow = expWs.getRow(1);
  expHeaderRow.height = 28;
  expHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // Slate-800
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // 2. Users Sheet (Database table for lookups)
  const usersWs = wb.addWorksheet('Users');
  usersWs.columns = [
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Member ID', key: 'id', width: 18 },
    { header: 'Role', key: 'role', width: 16 },
  ];
  usersWs.autoFilter = { from: 'A1', to: 'C1' };

  const usersHeaderRow = usersWs.getRow(1);
  usersHeaderRow.height = 24;
  usersHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  for (const m of members) {
    const isMain = m.id === mainUserId;
    const r = usersWs.addRow({
      name: m.name,
      id: m.id,
      role: isMain ? 'Main User' : 'Member',
    });
    r.getCell('name').alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell('id').alignment = { vertical: 'middle', horizontal: 'center' };
    r.getCell('role').alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // 3. Reference_Data Sheet (Reference tables for dropdown filters & combinations)
  const refWs = wb.addWorksheet('Reference_Data');
  refWs.columns = [
    { header: 'Category Code', key: 'catCode', width: 16 },
    { header: 'Category Name', key: 'catName', width: 20 },
    { header: 'Description', key: 'catDesc', width: 32 },
    { header: 'Scope', key: 'scope', width: 14 },
    { header: 'Currency Code', key: 'currCode', width: 16 },
    { header: 'Currency Name', key: 'currName', width: 22 },
    { header: 'Symbol', key: 'currSymbol', width: 12 },
    { header: 'Split Among Option', key: 'splitOption', width: 28 },
    { header: 'Split Among IDs', key: 'splitIds', width: 28 },
  ];
  refWs.autoFilter = { from: 'A1', to: 'I1' };

  const refHeaderRow = refWs.getRow(1);
  refHeaderRow.height = 24;
  refHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const categoryList = [
    { code: 'meal', name: 'Meals & Dining', desc: 'Dining, lunch, dinner, drinks, cafe' },
    { code: 'groceries', name: 'Groceries', desc: 'Supermarket, food ingredients, daily produce' },
    { code: 'transport', name: 'Transport & Rides', desc: 'Grab, taxi, fuel, tolls, train, bus' },
    { code: 'entertainment', name: 'Entertainment', desc: 'Outings, movies, tickets, attractions' },
    { code: 'daily', name: 'Daily Supplies', desc: 'Household essentials, toiletries' },
    { code: 'utilities', name: 'Bills & Utilities', desc: 'WiFi, mobile, electricity, shared bills' },
    { code: 'other', name: 'Other Expense', desc: 'Miscellaneous items (specify in notes)' },
  ];
  const scopeList = ['shared', 'personal'];
  const currencyList = SUPPORTED_CURRENCIES;
  const splitCombinations = generateSplitAmongCombinations(members);

  const maxLen = Math.max(
    categoryList.length,
    scopeList.length,
    currencyList.length,
    splitCombinations.length
  );

  for (let i = 0; i < maxLen; i++) {
    const cat = categoryList[i];
    const sc = scopeList[i];
    const cur = currencyList[i];
    const comb = splitCombinations[i];

    refWs.addRow({
      catCode: cat ? cat.code : '',
      catName: cat ? cat.name : '',
      catDesc: cat ? cat.desc : '',
      scope: sc || '',
      currCode: cur ? cur.code : '',
      currName: cur ? cur.label : '',
      currSymbol: cur ? cur.symbol : '',
      splitOption: comb ? comb.option : '',
      splitIds: comb ? comb.ids : '',
    });
  }

  // Ranges for Dropdown Validation
  const userRange = `Users!$A$2:$A$${members.length + 1}`;
  const categoryRange = `Reference_Data!$A$2:$A$${categoryList.length + 1}`;
  const currencyRange = `Reference_Data!$E$2:$E$${currencyList.length + 1}`;
  const splitAmongRange = `Reference_Data!$H$2:$H$${splitCombinations.length + 1}`;

  // EXACTLY ONE EXAMPLE ROW (Row 2) - NO background fill (plain text color only, red text on ID columns)
  const sampleRow = expWs.addRow({
    createdDate: todayStr,
    category: 'meal',
    scope: 'shared',
    origAmount: 50.00,
    origCurrency: activeCurrency,
    paidBy: mainMember.name,
    splitAmong: 'All Members',
    notes: '',
  });

  sampleRow.getCell('paidById').value = {
    formula: 'IFERROR(VLOOKUP(F2, Users!$A$2:$B$50, 2, FALSE), "")',
    result: mainMember.id,
  };
  sampleRow.getCell('splitAmongId').value = {
    formula: 'IFERROR(VLOOKUP(H2, Reference_Data!$H$2:$I$150, 2, FALSE), IF(H2="All Members", "ALL", ""))',
    result: 'ALL',
  };
  sampleRow.getCell('origAmount').numFmt = '#,##0.00';

  // Apply Plain Text styling (NO background fill for any cell)
  sampleRow.height = 22;
  sampleRow.eachCell((cell, colNumber) => {
    cell.alignment = { vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };

    if (colNumber === 7 || colNumber === 9) {
      // Red text color to advise user not to edit
      cell.font = {
        bold: true,
        color: { argb: 'FFDC2626' }, // Red-600
        size: 10.5,
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else {
      cell.font = {
        color: { argb: 'FF0F172A' },
        size: 10.5,
      };
    }
  });

  // Clean Blank Rows (rows 3 to 60) for user to enter data (NO background fill)
  for (let r = 3; r <= 60; r++) {
    const blankRow = expWs.addRow({
      createdDate: '',
      category: '',
      scope: 'shared',
      origAmount: '',
      origCurrency: activeCurrency,
      paidBy: '',
      splitAmong: 'All Members',
      notes: '',
    });

    blankRow.height = 20;

    // Formulas for auto-updating IDs with Red text color and NO fill
    const paidByIdCell = blankRow.getCell('paidById');
    paidByIdCell.value = {
      formula: `IFERROR(VLOOKUP(F${r}, Users!$A$2:$B$50, 2, FALSE), "")`,
    };
    paidByIdCell.font = { color: { argb: 'FFDC2626' }, bold: true };
    paidByIdCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const splitAmongIdCell = blankRow.getCell('splitAmongId');
    splitAmongIdCell.value = {
      formula: `IFERROR(VLOOKUP(H${r}, Reference_Data!$H$2:$I$150, 2, FALSE), IF(H${r}="All Members", "ALL", ""))`,
    };
    splitAmongIdCell.font = { color: { argb: 'FFDC2626' }, bold: true };
    splitAmongIdCell.alignment = { vertical: 'middle', horizontal: 'center' };

    blankRow.getCell('origAmount').numFmt = '#,##0.00';
  }

  // Set Data Validation on rows 2 through 60
  for (let r = 2; r <= 60; r++) {
    expWs.getCell(`B${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [categoryRange],
    };

    expWs.getCell(`C${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"shared,personal"'],
    };

    expWs.getCell(`E${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [currencyRange],
    };

    expWs.getCell(`F${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [userRange],
    };

    // Split Among dropdown with 1 member, 2 members, 3 members, or all members
    expWs.getCell(`H${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [splitAmongRange],
    };
  }

  // 4. Settlements Sheet
  const setWs = wb.addWorksheet('Settlements', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  setWs.columns = [
    { header: 'Payment Date', key: 'date', width: 16 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Paid By', key: 'paidBy', width: 18 },
    { header: 'Paid By ID (Auto - Do Not Edit)', key: 'paidById', width: 28 },
    { header: 'Paid To', key: 'paidTo', width: 18 },
    { header: 'Paid To ID (Auto - Do Not Edit)', key: 'paidToId', width: 28 },
    { header: 'Notes', key: 'notes', width: 28 },
    { header: 'Created Date', key: 'createdDate', width: 22 },
  ];
  setWs.autoFilter = { from: 'A1', to: 'H1' };

  const setHeaderRow = setWs.getRow(1);
  setHeaderRow.height = 28;
  setHeaderRow.eachCell((cell) => {
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  });

  for (let r = 2; r <= 30; r++) {
    const blankSetRow = setWs.addRow({
      date: '',
      amount: '',
      paidBy: '',
      paidTo: '',
      notes: '',
      createdDate: '',
    });
    blankSetRow.getCell('paidById').value = {
      formula: `IFERROR(VLOOKUP(C${r}, Users!$A$2:$B$50, 2, FALSE), "")`,
    };
    blankSetRow.getCell('paidToId').value = {
      formula: `IFERROR(VLOOKUP(E${r}, Users!$A$2:$B$50, 2, FALSE), "")`,
    };
    blankSetRow.getCell('amount').numFmt = '#,##0.00';

    setWs.getCell(`C${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [userRange],
    };
    setWs.getCell(`E${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [userRange],
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Parses an XLSX workbook into typed expenses, settlements, members, and settings.
 * Strict row validation:
 * - Only saves rows where ALL required columns have values (Created Date, Category, Scope, Original Amount, Currency, Paid By, Split Among).
 * - Notes is optional; only saved if category is 'other', otherwise ignored.
 * - Auto-resolves member IDs from users table.
 */
export function parseExcelWorkbook(wb: WorkBook, defaultSettings: AppSettings): ExcelDatabasePayload {
  const expenses: Expense[] = [];
  const settlements: Settlement[] = [];
  const settings: AppSettings = { ...defaultSettings };
  const loadedMembers: UserMember[] = [];

  // Parse Members sheet if present
  if (wb.SheetNames.includes('Members')) {
    const ws = wb.Sheets['Members'];
    const rows = (XLSX.utils.sheet_to_json(ws) as Record<string, any>[]) || [];
    for (const r of rows) {
      const id = String(r['Member ID'] || r['User ID'] || r['ID'] || '').trim();
      const name = String(r['Name'] || r['Member Name'] || '').trim();
      const roleStr = String(r['Role'] || r['Is Main User'] || '').toUpperCase();
      const isMain = roleStr === 'YES' || roleStr.includes('MAIN');
      if (id && name) {
        loadedMembers.push({ id, name });
        if (isMain) {
          settings.mainUserId = id;
        }
      }
    }
  } else if (wb.SheetNames.includes('Users')) {
    // Also read from Users reference sheet if present
    const ws = wb.Sheets['Users'];
    const rows = (XLSX.utils.sheet_to_json(ws) as Record<string, any>[]) || [];
    for (const r of rows) {
      const id = String(r['Member ID'] || r['User ID'] || r['ID'] || '').trim();
      const name = String(r['Name'] || r['Member Name'] || '').trim();
      const roleStr = String(r['Role'] || '').toUpperCase();
      const isMain = roleStr.includes('MAIN');
      if (id && name) {
        loadedMembers.push({ id, name });
        if (isMain) {
          settings.mainUserId = id;
        }
      }
    }
  }

  if (loadedMembers.length > 0) {
    settings.members = loadedMembers;
  } else if (!settings.members || settings.members.length === 0) {
    settings.members = DEFAULT_MEMBERS;
  }

  // Parse Summary or Settings & Summary
  const summarySheetName = wb.SheetNames.find(s => s === 'Summary' || s === 'Settings & Summary');
  if (summarySheetName) {
    const summaryWs = wb.Sheets[summarySheetName];
    const rows = (XLSX.utils.sheet_to_json(summaryWs) as Record<string, any>[]) || [];
    for (const r of rows) {
      const key = String(r['Key / Metric'] || r['Key'] || '').trim();
      const val = String(r['Value / Breakdown'] || r['Value'] || '').trim();
      if (key === 'Main User ID' && val) settings.mainUserId = val;
      if (key === 'Active Currency Symbol' || key === 'Currency Symbol') {
        if (val) settings.currencySymbol = val;
      }
      if (key === 'Base Currency Code' && val) settings.baseCurrencyCode = val;
      if (key === 'Base Currency Symbol' && val) settings.baseCurrencySymbol = val;
      if (key === 'User Currencies JSON' && val) {
        try {
          const parsedUserCurs = JSON.parse(val);
          if (parsedUserCurs && typeof parsedUserCurs === 'object') {
            settings.userCurrencies = parsedUserCurs;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // Ensure mainUserId is valid
  if (!settings.members.some(m => m.id === settings.mainUserId)) {
    settings.mainUserId = settings.members[0].id;
  }

  // Preserve the user's default currency selected in settings
  const preferredUserId = defaultSettings.mainUserId || settings.mainUserId;
  const userDefaultCurrency =
    (defaultSettings.userCurrencies && defaultSettings.userCurrencies[preferredUserId]) ||
    defaultSettings.currencyCode ||
    'SGD';
  const userDefaultMeta = getCurrencyMeta(userDefaultCurrency);

  settings.currencyCode = userDefaultCurrency;
  settings.currencySymbol = userDefaultMeta.symbol;
  settings.userCurrencies = {
    ...(settings.userCurrencies || {}),
    ...(defaultSettings.userCurrencies || {}),
    [preferredUserId]: userDefaultCurrency,
  };

  const mainUserId = settings.mainUserId;
  const targetCurrency = userDefaultCurrency;

  // Parse Expenses
  if (wb.SheetNames.includes('Expenses')) {
    const ws = wb.Sheets['Expenses'];
    const rows = (XLSX.utils.sheet_to_json(ws) as Record<string, any>[]) || [];
    for (const r of rows) {
      // 1. Created Date validation: required non-empty
      const rawCreated = r['Created Date'] !== undefined && r['Created Date'] !== null ? r['Created Date'] : r['Date'];
      if (rawCreated === undefined || rawCreated === null || String(rawCreated).trim() === '') {
        continue; // Skip row: missing required Created Date
      }

      let createdAt = Date.now();
      let date = new Date().toISOString().split('T')[0];
      if (typeof rawCreated === 'number') {
        const parsedCreated = new Date(Math.round((rawCreated - 25569) * 86400 * 1000));
        if (!isNaN(parsedCreated.getTime())) {
          createdAt = parsedCreated.getTime();
          date = parsedCreated.toISOString().split('T')[0];
        }
      } else {
        const parsedCreated = new Date(String(rawCreated).trim());
        if (!isNaN(parsedCreated.getTime())) {
          createdAt = parsedCreated.getTime();
          date = parsedCreated.toISOString().split('T')[0];
        } else if (String(rawCreated).trim().match(/^\d{4}-\d{2}-\d{2}$/)) {
          date = String(rawCreated).trim();
          createdAt = new Date(date).getTime();
        }
      }

      // 2. Category validation: required non-empty
      const rawCategoryStr = String(r['Category'] || '').trim().toLowerCase();
      if (!rawCategoryStr) {
        continue; // Skip row: missing required Category
      }
      const category: ExpenseCategory = ['meal', 'groceries', 'transport', 'entertainment', 'daily', 'utilities', 'other'].includes(rawCategoryStr as any)
        ? (rawCategoryStr as ExpenseCategory)
        : 'meal';

      // 3. Scope validation: required non-empty
      const rawScope = String(r['Scope'] || '').trim().toLowerCase();
      if (!rawScope) {
        continue; // Skip row: missing required Scope
      }
      const scope: 'shared' | 'personal' = rawScope === 'personal' ? 'personal' : 'shared';
      const splitType: any = scope === 'personal' ? 'personal' : 'equal';

      // 4. Original Amount validation: required number > 0
      const rawOrigAmount = r['Original Amount'] !== undefined && r['Original Amount'] !== ''
        ? Number(r['Original Amount'])
        : (r['Amount'] !== undefined && r['Amount'] !== '' ? Number(r['Amount']) : undefined);
      if (rawOrigAmount === undefined || isNaN(rawOrigAmount) || rawOrigAmount <= 0) {
        continue; // Skip row: missing or invalid required Original Amount
      }
      const originalAmount = rawOrigAmount;

      // 5. Original Currency validation: required non-empty
      const rawCurrency = String(r['Original Currency'] || '').trim().toUpperCase();
      if (!rawCurrency) {
        continue; // Skip row: missing required Currency
      }
      const originalCurrency = rawCurrency;
      const currencyMeta = getCurrencyMeta(originalCurrency);
      const originalCurrencySymbol = r['Original Symbol'] ? String(r['Original Symbol']).trim() : currencyMeta.symbol;

      // 6. Paid By validation: required non-empty
      const rawPaidByName = String(r['Paid By'] || '').trim();
      let rawPaidById = String(
        r['Paid By ID (Auto - Do Not Edit)'] ||
        r['Paid By ID'] ||
        r['Paid By Code'] ||
        ''
      ).trim();
      if (rawPaidById.startsWith('=') || rawPaidById.includes('#')) {
        rawPaidById = '';
      }
      if (!rawPaidByName && !rawPaidById) {
        continue; // Skip row: missing required Paid By
      }

      let payerMember = settings.members.find(m => m.id === rawPaidById);
      if (!payerMember && rawPaidByName) {
        payerMember = settings.members.find(m => m.name.toLowerCase() === rawPaidByName.toLowerCase());
      }
      const paidBy = payerMember ? payerMember.id : normalizePayerId(rawPaidById || rawPaidByName, mainUserId, settings.members);
      if (!paidBy) {
        continue; // Skip row: could not determine Paid By member
      }

      // 7. Split Among validation: required non-empty
      const rawSplitAmong = String(r['Split Among'] || '').trim();
      let rawSplitAmongId = String(
        r['Split Among ID (Auto - Do Not Edit)'] ||
        r['Split Among ID'] ||
        r['Split Among IDs'] ||
        ''
      ).trim();
      if (rawSplitAmongId.startsWith('=') || rawSplitAmongId.includes('#')) {
        rawSplitAmongId = '';
      }
      if (!rawSplitAmong && !rawSplitAmongId && scope !== 'personal') {
        continue; // Skip row: missing required Split Among
      }

      let splitAmong: string[] = [];
      if (scope === 'personal') {
        splitAmong = [paidBy];
      } else if (!rawSplitAmong || rawSplitAmong.toLowerCase() === 'all members' || rawSplitAmongId.toUpperCase() === 'ALL') {
        splitAmong = settings.members.map(m => m.id);
      } else if (rawSplitAmongId) {
        splitAmong = rawSplitAmongId
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(id => {
            const found = settings.members.find(m => m.id === id || m.name.toLowerCase() === id.toLowerCase());
            return found ? found.id : normalizePayerId(id, mainUserId, settings.members);
          });
      } else if (rawSplitAmong) {
        splitAmong = rawSplitAmong
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(name => {
            const found = settings.members.find(m => m.name.toLowerCase() === name.toLowerCase() || m.id === name);
            return found ? found.id : normalizePayerId(name, mainUserId, settings.members);
          });
      }
      if (!splitAmong || splitAmong.length === 0) {
        continue; // Skip row: empty split members
      }

      // 8. Notes: OPTIONAL, but ONLY saved if category is 'other', otherwise ignored
      const rawNotes = r['Notes (Optional - Saved only if Category is other)'] !== undefined
        ? r['Notes (Optional - Saved only if Category is other)']
        : (r['Notes (Optional - Only for Others)'] !== undefined
          ? r['Notes (Optional - Only for Others)']
          : (r['Notes'] !== undefined ? r['Notes'] : r['Title']));
      let notes: string | undefined = undefined;
      if (category === 'other' && rawNotes && String(rawNotes).trim() !== '') {
        notes = String(rawNotes).trim();
      }
      const title = category === 'other'
        ? (notes || 'Other Expense')
        : (CATEGORIES[category]?.label || 'Expense');

      // 9. ID: auto-generated by system if not provided
      const id = r['ID'] && String(r['ID']).trim()
        ? String(r['ID']).trim()
        : `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 10. Exchange Rate & Total Amount: auto-calculated
      let exchangeRate: number = 1.0;
      let amount: number = originalAmount;

      if (originalCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
        exchangeRate = 1.0;
        amount = originalAmount;
      } else {
        const rawRate = r['Exchange Rate'];
        if (rawRate !== undefined && rawRate !== null && rawRate !== '' && !isNaN(Number(rawRate)) && Number(rawRate) > 0) {
          exchangeRate = Number(rawRate);
        } else {
          exchangeRate = getConversionRate(originalCurrency, targetCurrency);
        }
        const isZeroDecimal = targetCurrency === 'JPY' || targetCurrency === 'KRW';
        const converted = originalAmount * exchangeRate;
        amount = isZeroDecimal ? Math.round(converted) : Number(converted.toFixed(2));
      }

      expenses.push({
        id,
        title,
        amount: amount || originalAmount,
        date,
        category,
        paidBy,
        splitType,
        expenseScope: scope,
        splitAmong,
        myShare: scope === 'personal' ? (paidBy === mainUserId ? (amount || originalAmount) : 0) : (amount || originalAmount) / (splitAmong.length || 1),
        friendShare: 0,
        notes,
        createdAt: isNaN(createdAt) ? Date.now() : createdAt,
        originalAmount,
        originalCurrency,
        originalCurrencySymbol,
        exchangeRate,
      });
    }
  }

  // Parse Settlements
  if (wb.SheetNames.includes('Settlements')) {
    const ws = wb.Sheets['Settlements'];
    const rows = (XLSX.utils.sheet_to_json(ws) as Record<string, any>[]) || [];
    for (const r of rows) {
      const id = String(r['ID'] || `set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      const amount = Number(r['Amount'] || 0);
      if (isNaN(amount) || amount <= 0) continue;

      let date = String(r['Payment Date'] || r['Date'] || '').trim();
      if (typeof r['Payment Date'] === 'number') {
        const parsedDate = new Date(Math.round((r['Payment Date'] - 25569) * 86400 * 1000));
        if (!isNaN(parsedDate.getTime())) date = parsedDate.toISOString().split('T')[0];
      }
      if (!date || date === 'undefined') {
        date = new Date().toISOString().split('T')[0];
      }

      const rawPaidById = String(
        r['Paid By ID (Auto - Do Not Edit)'] ||
        r['Paid By ID'] ||
        r['Paid By Code'] ||
        ''
      ).trim();
      const rawPaidByName = String(r['Paid By'] || '').trim();
      let payerMember = settings.members.find(m => m.id === rawPaidById);
      if (!payerMember && rawPaidByName) {
        payerMember = settings.members.find(m => m.name.toLowerCase() === rawPaidByName.toLowerCase());
      }
      const paidBy = payerMember ? payerMember.id : normalizePayerId(rawPaidById || rawPaidByName, mainUserId, settings.members);

      const rawPaidToId = String(
        r['Paid To ID (Auto - Do Not Edit)'] ||
        r['Paid To ID'] ||
        ''
      ).trim();
      const rawPaidToName = String(r['Paid To'] || '').trim();
      let receiverMember = settings.members.find(m => m.id === rawPaidToId);
      if (!receiverMember && rawPaidToName) {
        receiverMember = settings.members.find(m => m.name.toLowerCase() === rawPaidToName.toLowerCase());
      }
      let paidTo = receiverMember ? receiverMember.id : normalizePayerId(rawPaidToId || rawPaidToName, mainUserId, settings.members);

      if (!paidTo || paidTo === paidBy) {
        paidTo = paidBy === mainUserId
          ? (settings.members.find(m => m.id !== mainUserId)?.id || '10002')
          : mainUserId;
      }

      const notes = r['Notes'] ? String(r['Notes']).trim() : undefined;
      let createdAt = Date.now();
      if (r['Created Date']) {
        if (typeof r['Created Date'] === 'number') {
          const parsedCreated = new Date(Math.round((r['Created Date'] - 25569) * 86400 * 1000));
          if (!isNaN(parsedCreated.getTime())) createdAt = parsedCreated.getTime();
        } else {
          const parsedCreated = new Date(r['Created Date']).getTime();
          if (!isNaN(parsedCreated)) createdAt = parsedCreated;
        }
      }

      settlements.push({
        id,
        amount,
        date,
        paidBy,
        paidTo,
        notes,
        createdAt: isNaN(createdAt) ? Date.now() : createdAt,
      });
    }
  }

  return { expenses, settlements, settings };
}

