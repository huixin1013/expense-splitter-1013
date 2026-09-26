import * as xlsxModule from 'xlsx';
import type { WorkBook, WorkSheet } from 'xlsx';
import { Expense, Settlement, AppSettings, UserMember, ExpenseCategory } from '../types';
import { calculateBalanceSummary, calculateAllIndividualMemberFinancials, normalizePayerId, IndividualMemberFinancials } from './calculations';
import { CATEGORIES } from './categoryMeta';
import { DEFAULT_MEMBERS } from './initialData';

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

  // 1. Expenses Sheet (No Title column, Notes only for 'other' category)
  const expenseRows = expenses.map(exp => {
    const normPayerId = normalizePayerId(exp.paidBy, mainUserId, members);
    const payerName = getMemberName(normPayerId);
    const splitIds = (exp.splitAmong && exp.splitAmong.length > 0 ? exp.splitAmong : members.map(m => m.id))
      .map(id => normalizePayerId(id, mainUserId, members));
    const splitNames = splitIds.map(getMemberName).join(', ');

    return {
      'ID': exp.id,
      'Date': exp.date,
      'Category': exp.category,
      'Scope': exp.expenseScope || (exp.splitType === 'personal' ? 'personal' : 'shared'),
      'Original Amount': exp.originalAmount !== undefined ? Number(exp.originalAmount.toFixed(2)) : Number(exp.amount.toFixed(2)),
      'Original Currency': exp.originalCurrency || settings.currencyCode,
      'Original Symbol': exp.originalCurrencySymbol || settings.currencySymbol,
      'Exchange Rate': exp.exchangeRate !== undefined ? Number(exp.exchangeRate.toFixed(4)) : 1.0,
      'Total Amount': Number(exp.amount.toFixed(2)),
      'Paid By': payerName,
      'Paid By ID': normPayerId,
      'Split Among': splitNames,
      'Split Among IDs': splitIds.join(','),
      'Split Type': exp.splitType || 'equal',
      'Notes': exp.category === 'other' ? (exp.notes || '') : '',
      'Created Date': new Date(exp.createdAt).toISOString(),
    };
  });

  const expensesWs = XLSX.utils.json_to_sheet(expenseRows);
  expensesWs['!cols'] = [
    { wch: 16 }, // ID
    { wch: 12 }, // Date
    { wch: 14 }, // Category
    { wch: 12 }, // Scope
    { wch: 15 }, // Original Amount
    { wch: 16 }, // Original Currency
    { wch: 15 }, // Original Symbol
    { wch: 14 }, // Exchange Rate
    { wch: 16 }, // Total Amount
    { wch: 16 }, // Paid By
    { wch: 14 }, // Paid By ID
    { wch: 26 }, // Split Among
    { wch: 20 }, // Split Among IDs
    { wch: 14 }, // Split Type
    { wch: 28 }, // Notes
    { wch: 22 }, // Created Date
  ];
  XLSX.utils.book_append_sheet(wb, expensesWs, 'Expenses');

  // 2. Settlements Sheet
  const settlementRows = settlements.map(set => {
    const normPayerId = normalizePayerId(set.paidBy, mainUserId, members);
    const normReceiverId = normalizePayerId(set.paidTo || mainUserId, mainUserId, members);
    return {
      'ID': set.id,
      'Payment Date': set.date,
      'Amount': Number(set.amount.toFixed(2)),
      'Paid By': getMemberName(normPayerId),
      'Paid By ID': normPayerId,
      'Paid To': getMemberName(normReceiverId),
      'Paid To ID': normReceiverId,
      'Notes': set.notes || '',
      'Created Date': new Date(set.createdAt).toISOString(),
    };
  });

  const settlementsWs = XLSX.utils.json_to_sheet(settlementRows);
  settlementsWs['!cols'] = [
    { wch: 16 },
    { wch: 14 }, // Payment Date
    { wch: 14 }, // Amount
    { wch: 16 }, // Paid By
    { wch: 14 }, // Paid By ID
    { wch: 16 }, // Paid To
    { wch: 14 }, // Paid To ID
    { wch: 25 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, settlementsWs, 'Settlements');

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

/**
 * Builds a clean, empty Excel template with all header columns defined and no data rows.
 */
export function buildBlankExcelTemplate(settings: AppSettings): WorkBook {
  const wb = XLSX.utils.book_new();

  const members = settings.members && settings.members.length > 0
    ? settings.members
    : DEFAULT_MEMBERS;
  const mainUserId = settings.mainUserId || members[0]?.id || '10001';

  // 1. Expenses Sheet (Empty with exact column headers)
  const expensesWs = XLSX.utils.aoa_to_sheet([
    ['ID', 'Date', 'Category', 'Scope', 'Original Amount', 'Original Currency', 'Original Symbol', 'Exchange Rate', 'Total Amount', 'Paid By', 'Paid By ID', 'Split Among', 'Split Among IDs', 'Split Type', 'Notes', 'Created Date'],
  ]);
  expensesWs['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 26 },
    { wch: 20 }, { wch: 14 }, { wch: 28 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, expensesWs, 'Expenses');

  // 2. Settlements Sheet (Empty with exact column headers)
  const settlementsWs = XLSX.utils.aoa_to_sheet([
    ['ID', 'Payment Date', 'Amount', 'Paid By', 'Paid By ID', 'Paid To', 'Paid To ID', 'Notes', 'Created Date'],
  ]);
  settlementsWs['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 25 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, settlementsWs, 'Settlements');

  return wb;
}

/**
 * Parses an XLSX workbook into typed expenses, settlements, members, and settings
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
      if (key === 'Active Currency Code' || key === 'Currency Code') {
        if (val) settings.currencyCode = val;
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

  const mainUserId = settings.mainUserId;

  // Parse Expenses
  if (wb.SheetNames.includes('Expenses')) {
    const ws = wb.Sheets['Expenses'];
    const rows = (XLSX.utils.sheet_to_json(ws) as Record<string, any>[]) || [];
    for (const r of rows) {
      const id = String(r['ID'] || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      const rawCategory = (String(r['Category'] || 'meal').toLowerCase().trim()) as any;
      const category: ExpenseCategory = ['meal', 'groceries', 'transport', 'entertainment', 'daily', 'utilities', 'other'].includes(rawCategory)
        ? rawCategory
        : 'meal';
      const rawNotes = r['Notes'] ? String(r['Notes']).trim() : undefined;
      // Notes is only retained if category is 'other'
      const notes = category === 'other' ? (rawNotes || (r['Title'] ? String(r['Title']).trim() : undefined)) : undefined;

      // Title is derived from category label or notes if other
      const title = category === 'other'
        ? (notes || (r['Title'] ? String(r['Title']).trim() : 'Other Expense'))
        : (CATEGORIES[category]?.label || 'Expense');

      const amount = Number(r['Total Amount'] || r['Amount'] || 0);
      const date = String(r['Date'] || new Date().toISOString().split('T')[0]).trim();

      // Determine paidBy
      const rawPaidById = String(r['Paid By ID'] || r['Paid By Code'] || '').trim();
      const rawPaidByName = String(r['Paid By'] || '').trim();
      const paidBy = normalizePayerId(rawPaidById || rawPaidByName, mainUserId, settings.members);

      // Determine scope & splitType
      const rawScope = String(r['Scope'] || '').toLowerCase();
      const rawSplit = String(r['Split Type'] || '').toLowerCase();
      const scope: 'shared' | 'personal' = rawScope === 'personal' || rawSplit === 'personal' ? 'personal' : 'shared';
      const splitType: any = rawSplit || (scope === 'personal' ? 'personal' : 'equal');

      // Split Among
      let splitAmong: string[] | undefined = undefined;
      const rawSplitAmongIds = String(r['Split Among IDs'] || '').trim();
      const rawSplitAmongNames = String(r['Split Among'] || '').trim();
      if (rawSplitAmongIds) {
        splitAmong = rawSplitAmongIds
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(id => normalizePayerId(id, mainUserId, settings.members));
      } else if (scope === 'personal') {
        splitAmong = [paidBy];
      } else if (rawSplitAmongNames && rawSplitAmongNames !== 'All Members') {
        splitAmong = rawSplitAmongNames
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(name => normalizePayerId(name, mainUserId, settings.members));
      } else {
        splitAmong = settings.members.map(m => m.id);
      }

      const createdAt = r['Created Date'] ? new Date(r['Created Date']).getTime() : Date.now();

      // Multi-currency attributes
      const rawOrigAmount = r['Original Amount'];
      const originalAmount = rawOrigAmount !== undefined && rawOrigAmount !== null && rawOrigAmount !== ''
        ? Number(rawOrigAmount)
        : undefined;
      const originalCurrency = r['Original Currency'] ? String(r['Original Currency']).trim() : undefined;
      const originalCurrencySymbol = r['Original Symbol'] ? String(r['Original Symbol']).trim() : undefined;
      const rawRate = r['Exchange Rate'];
      const exchangeRate = rawRate !== undefined && rawRate !== null && rawRate !== ''
        ? Number(rawRate)
        : undefined;

      if (amount > 0 || (originalAmount && originalAmount > 0)) {
        expenses.push({
          id,
          title,
          amount,
          date,
          category,
          paidBy,
          splitType,
          expenseScope: scope,
          splitAmong,
          myShare: scope === 'personal' ? (paidBy === mainUserId ? amount : 0) : amount / (splitAmong?.length || 1),
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
  }

  // Parse Settlements
  if (wb.SheetNames.includes('Settlements')) {
    const ws = wb.Sheets['Settlements'];
    const rows = (XLSX.utils.sheet_to_json(ws) as Record<string, any>[]) || [];
    for (const r of rows) {
      const id = String(r['ID'] || `set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      const amount = Number(r['Amount'] || 0);
      const date = String(r['Payment Date'] || r['Date'] || new Date().toISOString().split('T')[0]).trim();

      const rawPaidById = String(r['Paid By ID'] || r['Paid By Code'] || '').trim();
      const rawPaidByName = String(r['Paid By'] || '').trim();
      const paidBy = normalizePayerId(rawPaidById || rawPaidByName, mainUserId, settings.members);

      const rawPaidToId = String(r['Paid To ID'] || '').trim();
      const rawPaidToName = String(r['Paid To'] || '').trim();
      let paidTo = normalizePayerId(rawPaidToId || rawPaidToName, mainUserId, settings.members);
      if (!paidTo || paidTo === paidBy) {
        paidTo = paidBy === mainUserId
          ? (settings.members.find(m => m.id !== mainUserId)?.id || '10002')
          : mainUserId;
      }

      const notes = r['Notes'] ? String(r['Notes']).trim() : undefined;
      const createdAt = r['Created Date'] ? new Date(r['Created Date']).getTime() : Date.now();

      if (amount > 0) {
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
  }

  return { expenses, settlements, settings };
}

