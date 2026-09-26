import { Expense, Settlement, BalanceSummary, MemberBalanceDetail, AppSettings, UserMember } from '../types';

/**
 * Normalizes a paidBy / member identifier to a valid member ID in the members list.
 * Handles legacy IDs (e.g. 'u_huixin' vs 'u_huixin_8729'), direct names ('HuiXin'),
 * and aliases ('me', 'friend').
 */
export function normalizePayerId(
  paidBy: string | undefined | null,
  mainUserId: string,
  members: UserMember[]
): string {
  if (!paidBy) return mainUserId;
  const raw = String(paidBy).trim();
  if (!raw) return mainUserId;
  const lower = raw.toLowerCase();

  if (lower === 'me') return mainUserId;
  if (lower === 'friend') {
    const other = members.find(m => m.id !== mainUserId);
    return other ? other.id : members[0]?.id || '10002';
  }

  // 1. Exact ID match (case-insensitive)
  const byId = members.find(m => m.id.toLowerCase() === lower);
  if (byId) return byId.id;

  // 2. Exact Name match (case-insensitive)
  const byName = members.find(m => m.name.toLowerCase() === lower);
  if (byName) return byName.id;

  // 3. Slug / Prefix / Suffix match
  // e.g. "u_huixin" vs "u_huixin_8729" or "u_ali" vs "u_ali_1" or "huixin" vs "u_huixin_8729"
  const stripped = lower.replace(/^u_/, '').replace(/_\d+$/, '').replace(/[^a-z0-9]/g, '');
  if (stripped) {
    const bySlug = members.find(m => {
      const mStripped = m.id.toLowerCase().replace(/^u_/, '').replace(/_\d+$/, '').replace(/[^a-z0-9]/g, '');
      const mNameClean = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return mStripped === stripped || mNameClean === stripped;
    });
    if (bySlug) return bySlug.id;
  }

  return raw;
}

/**
 * Determines whether a given user is involved in an expense.
 * A user is involved if:
 * 1. They paid for it (payerId === userId), OR
 * 2. It is a shared expense and the user is included in the split participants (splitAmong includes userId).
 * Personal expenses of another user never involve the active user.
 */
export function isUserInvolvedInExpense(
  exp: Expense,
  userId: string,
  members: UserMember[]
): boolean {
  const payerId = normalizePayerId(exp.paidBy, userId, members);
  if (payerId === userId) return true;

  const isPersonal = exp.expenseScope === 'personal' || exp.splitType === 'personal';
  if (isPersonal) {
    return false;
  }

  const allMemberIds = members.map(m => m.id);
  let participants = (exp.splitAmong && exp.splitAmong.length > 0)
    ? exp.splitAmong.map(id => normalizePayerId(id, userId, members))
    : allMemberIds;

  participants = Array.from(new Set(participants.filter(id => members.some(m => m.id === id))));
  if (participants.length === 0) {
    participants = allMemberIds;
  }

  return participants.includes(userId);
}

/**
 * Determines whether a given user is involved in a settlement record.
 * A user is involved if they are the payer OR the recipient.
 */
export function isUserInvolvedInSettlement(
  set: Settlement,
  userId: string,
  members: UserMember[]
): boolean {
  const payerId = normalizePayerId(set.paidBy, userId, members);
  let recipientId = set.paidTo ? normalizePayerId(set.paidTo, userId, members) : '';
  if (!recipientId) {
    recipientId = payerId === userId
      ? (members.find(m => m.id !== userId)?.id || '')
      : userId;
  }
  return payerId === userId || recipientId === userId;
}

/**
 * Calculates complete balances from the perspective of the designated Main User
 */
export interface IndividualMemberFinancials {
  memberId: string;
  memberName: string;
  role: 'main' | 'member';
  expensesCount: number;
  totalPaid: number;
  personalPaid: number;
  sharedPaid: number;
  fairShare: number;
  settlementsPaid: number;
  settlementsReceived: number;
  netBalance: number;
  status: 'owed' | 'owe' | 'settled';
  statusText: string;
  actionText: string;
  pairwiseBreakdown: Array<{
    targetMemberId: string;
    targetMemberName: string;
    theyOweMe: number;
    iOweThem: number;
    net: number; // positive: they owe me, negative: i owe them
  }>;
}

/**
 * Calculates independent financial metrics, spending, and debt breakdowns
 * for EACH member in the group, with optional viewing currency conversion multiplier.
 */
export function calculateAllIndividualMemberFinancials(
  expenses: Expense[],
  settlements: Settlement[],
  settings: AppSettings,
  rateMultiplier: number = 1.0
): IndividualMemberFinancials[] {
  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [{ id: '10001', name: 'HuiXin' }, { id: '10002', name: 'Ali' }];

  const mainUserId = settings.mainUserId || members[0]?.id || '10001';
  const currencySymbol = settings.currencySymbol || 'SGD';

  return members.map((m, index) => {
    // Run balance summary from the perspective of this member
    const summary = calculateBalanceSummary(expenses, settlements, {
      ...settings,
      mainUserId: m.id,
    }, rateMultiplier);

    const isMain = m.id === mainUserId || index === 0;
    const role: 'main' | 'member' = isMain ? 'main' : 'member';

    // Count how many expenses this member paid for
    const expensesCount = expenses.filter(
      e => normalizePayerId(e.paidBy, m.id, members) === m.id
    ).length;

    // Settlements paid and received
    const rawSettlementsPaid = settlements
      .filter(s => normalizePayerId(s.paidBy, m.id, members) === m.id)
      .reduce((sum, s) => sum + s.amount, 0);

    const rawSettlementsReceived = settlements
      .filter(s => normalizePayerId(s.paidTo || mainUserId, m.id, members) === m.id)
      .reduce((sum, s) => sum + s.amount, 0);

    const settlementsPaid = rawSettlementsPaid * rateMultiplier;
    const settlementsReceived = rawSettlementsReceived * rateMultiplier;

    const totalPaid = summary.totalPaidByMain;
    const personalPaid = summary.totalPersonalMain;
    const sharedPaid = Math.max(0, Math.round((totalPaid - personalPaid) * 100) / 100);
    const fairShare = summary.totalMainShare;
    const netBalance = summary.netBalance;

    let statusText = `Settled (${currencySymbol}0.00)`;
    let actionText = 'All settled with group';

    if (netBalance > 0.005) {
      statusText = `Owed ${currencySymbol}${netBalance.toFixed(2)} (To Receive)`;
      actionText = `Receives ${currencySymbol}${netBalance.toFixed(2)} from group`;
    } else if (netBalance < -0.005) {
      statusText = `Owes ${currencySymbol}${Math.abs(netBalance).toFixed(2)} (To Pay)`;
      actionText = `Pays ${currencySymbol}${Math.abs(netBalance).toFixed(2)} to group`;
    }

    const pairwiseBreakdown = summary.memberBalances.map(mb => ({
      targetMemberId: mb.memberId,
      targetMemberName: mb.memberName,
      theyOweMe: mb.theyOweYou,
      iOweThem: mb.youOweThem,
      net: mb.netBalance,
    }));

    return {
      memberId: m.id,
      memberName: m.name,
      role,
      expensesCount,
      totalPaid: Math.round(totalPaid * 100) / 100,
      personalPaid: Math.round(personalPaid * 100) / 100,
      sharedPaid,
      fairShare: Math.round(fairShare * 100) / 100,
      settlementsPaid: Math.round(settlementsPaid * 100) / 100,
      settlementsReceived: Math.round(settlementsReceived * 100) / 100,
      netBalance,
      status: summary.overallStatus,
      statusText,
      actionText,
      pairwiseBreakdown,
    };
  });
}

/**
 * Calculates complete balances from the perspective of the designated Main User,
 * with optional rateMultiplier for viewing conversions.
 */
export function calculateBalanceSummary(
  expenses: Expense[],
  settlements: Settlement[],
  settings: AppSettings,
  rateMultiplier: number = 1.0
): BalanceSummary {
  const members = settings.members && settings.members.length > 0
    ? settings.members
    : [{ id: '10001', name: 'HuiXin' }, { id: '10002', name: 'Ali' }];

  const mainUserId = settings.mainUserId || members[0]?.id || '10001';
  const mainUser = members.find(m => m.id === mainUserId) || members[0];
  const allMemberIds = members.map(m => m.id);

  let rawTotalSpentAllTime = 0;
  let rawTotalShared = 0;
  let rawTotalPersonalMain = 0;
  let rawTotalPaidByMain = 0;
  let rawTotalMainShare = 0;

  // Pairwise tracking between mainUser and each other member
  // memberId -> { theyOweMain: number, mainOwesThem: number }
  const pairBalances: Record<string, { theyOweMain: number; mainOwesThem: number }> = {};
  for (const m of members) {
    if (m.id !== mainUserId) {
      pairBalances[m.id] = { theyOweMain: 0, mainOwesThem: 0 };
    }
  }

  for (const exp of expenses) {
    rawTotalSpentAllTime += exp.amount;
    const payerId = normalizePayerId(exp.paidBy, mainUserId, members);
    const isPersonal = exp.expenseScope === 'personal' || exp.splitType === 'personal';

    if (isPersonal) {
      if (payerId === mainUserId) {
        rawTotalPersonalMain += exp.amount;
        rawTotalPaidByMain += exp.amount;
      }
      continue;
    }

    // Shared expense
    rawTotalShared += exp.amount;
    if (payerId === mainUserId) {
      rawTotalPaidByMain += exp.amount;
    }

    // Determine participating members
    let participants = (exp.splitAmong && exp.splitAmong.length > 0)
      ? exp.splitAmong.map(id => normalizePayerId(id, mainUserId, members))
      : allMemberIds;

    // Filter to known members and deduplicate
    participants = Array.from(new Set(participants.filter(id => members.some(m => m.id === id))));
    if (participants.length === 0) {
      participants = allMemberIds;
    }

    const sharePerPerson = exp.amount / participants.length;

    if (participants.includes(mainUserId)) {
      rawTotalMainShare += sharePerPerson;
    }

    // Pairwise debts
    if (payerId === mainUserId) {
      // Main user paid -> every other participant owes main user their share
      for (const pId of participants) {
        if (pId !== mainUserId && pairBalances[pId]) {
          pairBalances[pId].theyOweMain += sharePerPerson;
        }
      }
    } else {
      // Someone else paid -> if main user participated, main user owes the payer their share
      if (participants.includes(mainUserId) && pairBalances[payerId]) {
        pairBalances[payerId].mainOwesThem += sharePerPerson;
      }
    }
  }

  // Factor in settlements
  for (const set of settlements) {
    const payerId = normalizePayerId(set.paidBy, mainUserId, members);
    let recipientId = set.paidTo ? normalizePayerId(set.paidTo, mainUserId, members) : '';

    if (!recipientId) {
      // Legacy default: if payer was main, recipient is first friend; if friend, recipient is main
      recipientId = payerId === mainUserId
        ? (members.find(m => m.id !== mainUserId)?.id || '')
        : mainUserId;
    }

    if (payerId === mainUserId && pairBalances[recipientId]) {
      // Main user repaid recipient -> reduces what main user owes recipient
      pairBalances[recipientId].mainOwesThem -= set.amount;
    } else if (recipientId === mainUserId && pairBalances[payerId]) {
      // Member repaid main user -> reduces what member owes main user
      pairBalances[payerId].theyOweMain -= set.amount;
    }
  }

  // Apply rate multiplier to totals
  const totalSpentAllTime = rawTotalSpentAllTime * rateMultiplier;
  const totalShared = rawTotalShared * rateMultiplier;
  const totalPersonalMain = rawTotalPersonalMain * rateMultiplier;
  const totalPaidByMain = rawTotalPaidByMain * rateMultiplier;
  const totalMainShare = rawTotalMainShare * rateMultiplier;

  // Compile member balances with rateMultiplier
  const memberBalances: MemberBalanceDetail[] = [];
  let overallNet = 0;

  for (const m of members) {
    if (m.id === mainUserId) continue;
    const pair = pairBalances[m.id] || { theyOweMain: 0, mainOwesThem: 0 };
    const net = Math.round((pair.theyOweMain - pair.mainOwesThem) * rateMultiplier * 100) / 100;
    overallNet += net;

    memberBalances.push({
      memberId: m.id,
      memberName: m.name,
      netBalance: net,
      theyOweYou: Math.max(0, net),
      youOweThem: Math.max(0, -net),
    });
  }

  overallNet = Math.round(overallNet * 100) / 100;
  let overallStatus: 'owed' | 'owe' | 'settled' = 'settled';
  if (overallNet > 0.005) {
    overallStatus = 'owed';
  } else if (overallNet < -0.005) {
    overallStatus = 'owe';
  }

  const legacyWhoOwesWhom: 'friend_owes_me' | 'me_owes_friend' | 'settled' =
    overallStatus === 'owed' ? 'friend_owes_me' : overallStatus === 'owe' ? 'me_owes_friend' : 'settled';

  return {
    mainUserId,
    mainUserName: mainUser.name,
    totalSpentAllTime: Math.round(totalSpentAllTime * 100) / 100,
    totalShared: Math.round(totalShared * 100) / 100,
    totalPersonalMain: Math.round(totalPersonalMain * 100) / 100,
    totalPaidByMain: Math.round(totalPaidByMain * 100) / 100,
    totalMainShare: Math.round(totalMainShare * 100) / 100,
    netBalance: overallNet,
    overallStatus,
    amountToReturn: Math.abs(overallNet),
    memberBalances,
    // Legacy support
    whoOwesWhom: legacyWhoOwesWhom,
    totalPaidByMe: Math.round(totalPaidByMain * 100) / 100,
    totalPaidByFriend: Math.round((totalSpentAllTime - totalPaidByMain) * 100) / 100,
    totalPersonalMe: Math.round(totalPersonalMain * 100) / 100,
  };
}
