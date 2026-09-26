import * as xlsxModule from 'xlsx';
import { Expense, Settlement, AppSettings } from '../types';
import { buildExcelWorkbook, parseExcelWorkbook, buildBlankExcelTemplate, generateBlankExcelTemplateBuffer, ExcelDatabasePayload } from './excelWorkbook';
import { verifyUserPasswordInFirestore, saveSingleUserToFirestore } from '../lib/firebase';

const XLSX = (xlsxModule as any).default || xlsxModule;

export interface ExcelSyncState {
  status: 'synced' | 'syncing' | 'offline' | 'error';
  lastSavedAt: Date | null;
  errorMessage?: string;
  isBackendConnected: boolean;
}

/**
 * Load database from backend Excel storage (/api/excel/data) directly,
 * ensuring fresh live data without stale localStorage caching.
 */
export async function loadExcelDatabase(defaultSettings: AppSettings): Promise<{
  payload: ExcelDatabasePayload;
  isBackendConnected: boolean;
}> {
  try {
    const res = await fetch('/api/excel/data', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return {
          payload: json.data,
          isBackendConnected: true,
        };
      }
    }
  } catch (err) {
    console.warn('[ExcelService] Backend fetch failed:', err);
  }

  return {
    payload: {
      expenses: [],
      settlements: [],
      settings: defaultSettings,
    },
    isBackendConnected: false,
  };
}

/**
 * Save data to backend Excel file (/data/expenses.xlsx)
 */
export async function persistToExcel(payload: ExcelDatabasePayload): Promise<{
  success: boolean;
  backendSynced: boolean;
}> {
  // Sync to Express backend Excel file
  try {
    const res = await fetch('/api/excel/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const result = await res.json();
      return { success: true, backendSynced: !!result.success };
    }
  } catch (err) {
    console.warn('[ExcelService] Backend sync error:', err);
  }

  return { success: true, backendSynced: false };
}

/**
 * Direct file download: triggers browser download of the real .xlsx file
 */
export function triggerExcelDownload(payload: ExcelDatabasePayload) {
  try {
    const wb = buildExcelWorkbook(payload);
    const dateStr = new Date().toISOString().split('T')[0];
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Expenses_Database_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Failed to trigger client Excel download, trying server route:', err);
    // Fallback to server download route
    window.location.href = '/api/excel/download';
    return false;
  }
}

/**
 * Downloads a clean blank Excel template with all header columns defined and no expense data.
 */
export async function triggerExcelTemplateDownload(settings: AppSettings): Promise<boolean> {
  try {
    const buffer = await generateBlankExcelTemplateBuffer(settings);
    const blob = new Blob([buffer as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_template.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.warn('ExcelJS template generator notice, trying fallback:', err);
    try {
      const wb = buildBlankExcelTemplate(settings);
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch {
      window.location.href = '/api/excel/template';
      return false;
    }
  }
}

/**
 * Downloads the developer-only users.xlsx spreadsheet (Users, Members, Summary sheets).
 * Validates the HTTP response to ensure we never save an error JSON payload into an Excel file.
 */
export async function triggerUsersExcelDownload(requestingUserId?: string): Promise<boolean> {
  const queryParam = requestingUserId ? `?requestingUserId=${encodeURIComponent(requestingUserId)}` : '';
  const url = `/api/users/excel/download${queryParam}`;

  const res = await fetch(url);
  if (!res.ok) {
    let errorMsg = 'Failed to download users.xlsx file';
    try {
      const errJson = await res.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // response wasn't json
    }
    throw new Error(errorMsg);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'users.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
  return true;
}

/**
 * Read and import an Excel .xlsx file uploaded by user
 */
export async function importExcelFile(file: File, defaultSettings: AppSettings): Promise<ExcelDatabasePayload> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const parsed = parseExcelWorkbook(wb, defaultSettings);

  // Sync back to server
  try {
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    await fetch('/api/excel/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: base64 }),
    });
  } catch (e) {
    console.warn('Backend upload sync warning:', e);
  }

  return parsed;
}

export interface UsersStatusResponse {
  configured: boolean;
  mainUserId: string;
  developerUserId?: string;
  developerName?: string;
  members: Array<{ id: string; name: string; role: 'main' | 'member'; isDeveloper?: boolean }>;
  version?: number;
}

export async function fetchUsersStatus(): Promise<UsersStatusResponse | null> {
  try {
    const res = await fetch('/api/users/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[UsersService] Status check error:', err);
  }
  return null;
}

export async function setupUsersBackend(data: {
  mainUser: { name: string; password?: string };
  members: Array<{ name: string; password?: string }>;
  currencySymbol?: string;
  currencyCode?: string;
}): Promise<{ success: boolean; mainUserId?: string; members?: any[]; error?: string }> {
  try {
    const res = await fetch('/api/users/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function verifyUserPassword(
  userId: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  // 1. First attempt backend verification
  try {
    const res = await fetch('/api/users/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.valid) return data;
    }
  } catch (err) {
    console.warn('[User Verification] Backend verify error, falling back to database:', err);
  }

  // 2. Also check Firestore database directly for cross-device synchronization
  try {
    const fsResult = await verifyUserPasswordInFirestore(userId, password);
    if (fsResult.valid) {
      return { valid: true };
    }
    return fsResult;
  } catch (err: any) {
    return { valid: false, error: err.message || 'Verification failed' };
  }
}

export async function addMemberWithPassword(name: string, password?: string) {
  let memberId = `u_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
  let result: any = { success: false };

  try {
    const res = await fetch('/api/users/add-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    if (res.ok) {
      result = await res.json();
      if (result.member?.id) {
        memberId = result.member.id;
      }
    }
  } catch (err: any) {
    console.warn('[User Service] Backend add member fallback to Firestore:', err);
  }

  // Always sync newly created user to Firestore so all devices see it immediately
  try {
    await saveSingleUserToFirestore({
      id: memberId,
      name,
      passcode: password || '1234',
      role: 'member',
    });
    return {
      success: true,
      member: { id: memberId, name },
    };
  } catch {
    return result.success ? result : { success: true, member: { id: memberId, name } };
  }
}

export async function setActiveUserBackend(userId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/users/set-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSyncVersion(): Promise<{ expensesVersion: number; usersVersion: number } | null> {
  try {
    const res = await fetch('/api/sync/version');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // backend silent
  }
  return null;
}

export interface CurrencyRatesResponse {
  success: boolean;
  base: string;
  rates: Record<string, number>;
  cached?: boolean;
  fallback?: boolean;
  provider?: string;
  lastUpdated: string;
}

export async function fetchExchangeRates(baseCurrency: string = 'MYR'): Promise<CurrencyRatesResponse | null> {
  try {
    const res = await fetch(`/api/currency/rates?base=${encodeURIComponent(baseCurrency)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Currency Service] Rates fetch error:', err);
  }
  return null;
}

export async function convertDatabaseCurrency(params: {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  newSymbol: string;
  newCode: string;
}): Promise<{
  success: boolean;
  convertedCount?: number;
  settlementsCount?: number;
  rate?: number;
  newCurrency?: string;
  newSymbol?: string;
  updatedData?: ExcelDatabasePayload;
  error?: string;
}> {
  try {
    const res = await fetch('/api/currency/convert-database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || 'Currency conversion request failed' };
  }
}

