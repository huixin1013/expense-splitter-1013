import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Expense, Settlement, AppSettings, UserMember } from '../types';
import { buildExcelWorkbook, parseExcelWorkbook } from '../utils/excelWorkbook';
import { getCurrencyMeta } from '../utils/currencyConstants';
import * as xlsxModule from 'xlsx';

const XLSX = (xlsxModule as any).default || xlsxModule;

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore with database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] Successfully connected to Cloud Firestore database');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or initializing.');
    }
    return false;
  }
}
testConnection();

// Collection constants
const EXPENSES_COLLECTION = 'expenses';
const SETTLEMENTS_COLLECTION = 'settlements';
const USERS_COLLECTION = 'users';
const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DOC_ID = 'global_config';

/**
 * Real-time listener for Expenses
 */
export function subscribeExpenses(
  onUpdate: (expenses: Expense[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, EXPENSES_COLLECTION);
  return onSnapshot(
    colRef,
    snapshot => {
      const items: Expense[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          title: data.title || '',
          amount: Number(data.amount) || 0,
          date: data.date || '',
          category: data.category || 'meal',
          paidBy: data.paidBy || '',
          splitType: data.splitType || 'equal',
          expenseScope: data.expenseScope || 'shared',
          splitAmong: data.splitAmong || undefined,
          myShare: data.myShare !== undefined ? Number(data.myShare) : undefined,
          friendShare: data.friendShare !== undefined ? Number(data.friendShare) : undefined,
          notes: data.notes || undefined,
          originalAmount: data.originalAmount !== undefined ? Number(data.originalAmount) : undefined,
          originalCurrency: data.originalCurrency || undefined,
          originalCurrencySymbol: data.originalCurrencySymbol || undefined,
          exchangeRate: data.exchangeRate !== undefined ? Number(data.exchangeRate) : undefined,
          createdAt: Number(data.createdAt) || Date.now(),
        });
      });
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);
      onUpdate(items);
    },
    error => {
      handleFirestoreError(error, OperationType.GET, EXPENSES_COLLECTION);
      onError?.(error);
    }
  );
}

/**
 * Real-time listener for Settlements
 */
export function subscribeSettlements(
  onUpdate: (settlements: Settlement[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, SETTLEMENTS_COLLECTION);
  return onSnapshot(
    colRef,
    snapshot => {
      const items: Settlement[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          amount: Number(data.amount) || 0,
          date: data.date || '',
          paidBy: data.paidBy || '',
          paidTo: data.paidTo || '',
          notes: data.notes || undefined,
          createdAt: Number(data.createdAt) || Date.now(),
        });
      });
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);
      onUpdate(items);
    },
    error => {
      handleFirestoreError(error, OperationType.GET, SETTLEMENTS_COLLECTION);
      onError?.(error);
    }
  );
}

/**
 * Real-time listener for Settings
 */
export function subscribeSettings(
  onUpdate: (settings: AppSettings | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  return onSnapshot(
    docRef,
    docSnap => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as AppSettings);
      } else {
        onUpdate(null);
      }
    },
    error => {
      handleFirestoreError(error, OperationType.GET, `${SETTINGS_COLLECTION}/${SETTINGS_DOC_ID}`);
      onError?.(error);
    }
  );
}

/**
 * Real-time listener for Users
 */
export function subscribeUsers(
  onUpdate: (users: Array<{ id: string; name: string; passcode?: string; currency?: string; role?: string }>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, USERS_COLLECTION);
  return onSnapshot(
    colRef,
    snapshot => {
      const users: Array<{ id: string; name: string; passcode?: string; currency?: string; role?: string }> = [];
      snapshot.forEach(docSnap => {
        users.push(docSnap.data() as any);
      });
      onUpdate(users);
    },
    error => {
      handleFirestoreError(error, OperationType.GET, USERS_COLLECTION);
      onError?.(error);
    }
  );
}

/**
 * Helper to convert Expense object to Firestore-safe document (no undefined fields)
 */
export function expenseToFirestoreDoc(exp: Expense): Record<string, any> {
  return {
    id: exp.id,
    title: exp.title || '',
    amount: Number(exp.amount) || 0,
    date: exp.date || new Date().toISOString().split('T')[0],
    category: exp.category || 'other',
    paidBy: exp.paidBy || '',
    splitType: exp.splitType || 'equal',
    expenseScope: exp.expenseScope || 'shared',
    splitAmong: exp.splitAmong || null,
    myShare: exp.myShare !== undefined && exp.myShare !== null ? Number(exp.myShare) : null,
    friendShare: exp.friendShare !== undefined && exp.friendShare !== null ? Number(exp.friendShare) : null,
    notes: exp.notes || null,
    originalAmount: exp.originalAmount !== undefined && exp.originalAmount !== null ? Number(exp.originalAmount) : null,
    originalCurrency: exp.originalCurrency || null,
    originalCurrencySymbol: exp.originalCurrencySymbol || null,
    exchangeRate: exp.exchangeRate !== undefined && exp.exchangeRate !== null ? Number(exp.exchangeRate) : null,
    createdAt: exp.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Helper to convert Settlement object to Firestore-safe document (no undefined fields)
 */
export function settlementToFirestoreDoc(set: Settlement): Record<string, any> {
  return {
    id: set.id,
    amount: Number(set.amount) || 0,
    date: set.date || new Date().toISOString().split('T')[0],
    paidBy: set.paidBy || '',
    paidTo: set.paidTo || '',
    notes: set.notes || null,
    createdAt: set.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Recursively remove or replace undefined values to ensure Firestore compliance
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestore(item)) as any;
  }
  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value === undefined) {
        cleaned[key] = null;
      } else if (value !== null && typeof value === 'object') {
        cleaned[key] = cleanForFirestore(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned as T;
  }
  return data;
}

/**
 * Save or update an expense
 */
export async function saveExpenseToFirestore(expense: Expense): Promise<void> {
  const path = `${EXPENSES_COLLECTION}/${expense.id}`;
  try {
    await setDoc(doc(db, EXPENSES_COLLECTION, expense.id), expenseToFirestoreDoc(expense));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete an expense
 */
export async function deleteExpenseFromFirestore(expenseId: string): Promise<void> {
  const path = `${EXPENSES_COLLECTION}/${expenseId}`;
  try {
    await deleteDoc(doc(db, EXPENSES_COLLECTION, expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Save a settlement
 */
export async function saveSettlementToFirestore(settlement: Settlement): Promise<void> {
  const path = `${SETTLEMENTS_COLLECTION}/${settlement.id}`;
  try {
    await setDoc(doc(db, SETTLEMENTS_COLLECTION, settlement.id), settlementToFirestoreDoc(settlement));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete a settlement
 */
export async function deleteSettlementFromFirestore(settlementId: string): Promise<void> {
  const path = `${SETTLEMENTS_COLLECTION}/${settlementId}`;
  try {
    await deleteDoc(doc(db, SETTLEMENTS_COLLECTION, settlementId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Save settings to Firestore
 */
export async function saveSettingsToFirestore(settings: AppSettings): Promise<void> {
  const path = `${SETTINGS_COLLECTION}/${SETTINGS_DOC_ID}`;
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID), {
      ...cleanForFirestore(settings),
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Save users to Firestore
 */
export async function saveUsersToFirestore(
  users: Array<{ id: string; name: string; passcode?: string; currency?: string; role?: string }>
): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const u of users) {
      const docRef = doc(db, USERS_COLLECTION, u.id);
      batch.set(docRef, cleanForFirestore({
        id: u.id,
        name: u.name,
        passcode: u.passcode || '1234',
        currency: u.currency || 'SGD',
        role: u.role || (u.id === users[0]?.id ? 'main' : 'member'),
        createdAt: Date.now(),
      }));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, USERS_COLLECTION);
  }
}

export async function saveSingleUserToFirestore(user: {
  id: string;
  name: string;
  passcode?: string;
  currency?: string;
  role?: string;
}): Promise<void> {
  const path = `${USERS_COLLECTION}/${user.id}`;
  try {
    await setDoc(doc(db, USERS_COLLECTION, user.id), cleanForFirestore({
      id: user.id,
      name: user.name,
      passcode: user.passcode || '1234',
      currency: user.currency || 'SGD',
      role: user.role || 'member',
      updatedAt: Date.now(),
    }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserFromFirestore(userId: string): Promise<void> {
  const path = `${USERS_COLLECTION}/${userId}`;
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function verifyUserPasswordInFirestore(userId: string, password: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const docSnap = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (docSnap.exists()) {
      const data = docSnap.data();
      const storedPasscode = data.passcode !== undefined ? String(data.passcode) : '1234';
      if (storedPasscode === password) {
        return { valid: true };
      }
      return { valid: false, error: 'Incorrect password' };
    }
    // If not found in users collection, default password for members is 1234
    if (password === '1234') {
      return { valid: true };
    }
    return { valid: false, error: 'User not found or incorrect password' };
  } catch {
    return { valid: false, error: 'Authentication check failed' };
  }
}

/**
 * Clear all expenses and settlements from Firestore
 */
export async function clearTransactionsInFirestore(): Promise<void> {
  try {
    // Delete all expenses
    const expSnaps = await getDocs(collection(db, EXPENSES_COLLECTION));
    const batch1 = writeBatch(db);
    expSnaps.forEach(docSnap => {
      batch1.delete(docSnap.ref);
    });
    await batch1.commit();

    // Delete all settlements
    const setSnaps = await getDocs(collection(db, SETTLEMENTS_COLLECTION));
    const batch2 = writeBatch(db);
    setSnaps.forEach(docSnap => {
      batch2.delete(docSnap.ref);
    });
    await batch2.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'clearTransactions');
  }
}

/**
 * Replace entire Firestore database with parsed Excel workbook data.
 * Old expenses and settlements are cleared, and new ones are committed.
 */
export async function replaceFirestoreWithExcelData(
  wb: xlsxModule.WorkBook,
  currentSettings: AppSettings
): Promise<{
  expenses: Expense[];
  settlements: Settlement[];
  settings: AppSettings;
}> {
  const parsed = parseExcelWorkbook(wb, currentSettings);

  try {
    // 1. Clear existing expenses
    const expSnaps = await getDocs(collection(db, EXPENSES_COLLECTION));
    const batchExpDel = writeBatch(db);
    expSnaps.forEach(docSnap => batchExpDel.delete(docSnap.ref));
    await batchExpDel.commit();

    // 2. Clear existing settlements
    const setSnaps = await getDocs(collection(db, SETTLEMENTS_COLLECTION));
    const batchSetDel = writeBatch(db);
    setSnaps.forEach(docSnap => batchSetDel.delete(docSnap.ref));
    await batchSetDel.commit();

    // 3. Write new expenses in batches (max 400 per batch)
    for (let i = 0; i < parsed.expenses.length; i += 400) {
      const chunk = parsed.expenses.slice(i, i + 400);
      const batchExp = writeBatch(db);
      for (const exp of chunk) {
        batchExp.set(doc(db, EXPENSES_COLLECTION, exp.id), expenseToFirestoreDoc(exp));
      }
      await batchExp.commit();
    }

    // 4. Write new settlements in batches
    for (let i = 0; i < parsed.settlements.length; i += 400) {
      const chunk = parsed.settlements.slice(i, i + 400);
      const batchSet = writeBatch(db);
      for (const set of chunk) {
        batchSet.set(doc(db, SETTLEMENTS_COLLECTION, set.id), settlementToFirestoreDoc(set));
      }
      await batchSet.commit();
    }

    // 5. Update settings in Firestore, preserving user's default currency preference from currentSettings
    const activeUserId = currentSettings.mainUserId || parsed.settings.mainUserId;
    const userDefaultCurrency =
      (currentSettings.userCurrencies && currentSettings.userCurrencies[activeUserId]) ||
      currentSettings.currencyCode ||
      'SGD';
    const userDefaultMeta = getCurrencyMeta(userDefaultCurrency);

    const mergedSettings: AppSettings = {
      ...parsed.settings,
      currencyCode: userDefaultCurrency,
      currencySymbol: userDefaultMeta.symbol,
      mainUserId: activeUserId,
      userCurrencies: {
        ...(parsed.settings.userCurrencies || {}),
        ...(currentSettings.userCurrencies || {}),
        [activeUserId]: userDefaultCurrency,
      },
    };

    await setDoc(doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID), {
      ...cleanForFirestore(mergedSettings),
      updatedAt: Date.now(),
    });

    // 6. Update user accounts for any new members in settings
    if (parsed.settings.members && parsed.settings.members.length > 0) {
      const userBatch = writeBatch(db);
      for (const m of parsed.settings.members) {
        userBatch.set(
          doc(db, USERS_COLLECTION, m.id),
          {
            id: m.id,
            name: m.name,
            passcode: '1234',
            currency: userDefaultCurrency,
            role: m.id === activeUserId ? 'main' : 'member',
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
      await userBatch.commit();
    }

    return { ...parsed, settings: mergedSettings };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'replaceFirestoreWithExcelData');
  }
}

/**
 * Export current Firestore database directly to downloadable Excel file
 */
export async function exportFirestoreToExcelFile(currentSettings: AppSettings): Promise<void> {
  try {
    // 1. Fetch current expenses
    const expSnaps = await getDocs(collection(db, EXPENSES_COLLECTION));
    const expenses: Expense[] = [];
    expSnaps.forEach(d => expenses.push(d.data() as Expense));

    // 2. Fetch current settlements
    const setSnaps = await getDocs(collection(db, SETTLEMENTS_COLLECTION));
    const settlements: Settlement[] = [];
    setSnaps.forEach(d => settlements.push(d.data() as Settlement));

    // 3. Fetch current settings doc or use currentSettings
    const settingsDoc = await getDoc(doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID));
    const settings = settingsDoc.exists() ? (settingsDoc.data() as AppSettings) : currentSettings;

    // 4. Build Excel workbook
    const wb = buildExcelWorkbook({
      expenses,
      settlements,
      settings,
    });

    // 5. Trigger download in browser
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Expenses_Database_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'exportFirestoreToExcelFile');
  }
}
